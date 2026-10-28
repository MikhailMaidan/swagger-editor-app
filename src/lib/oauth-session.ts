import {
  MAX_OAUTH_BYTES,
  OAuthError,
  applyOAuthMetadata,
  createOAuthAuthorization,
  normalizeOAuthProfile,
  oauthError,
  oauthForm,
  oauthRemoteError,
  oauthUrl,
  parseOAuthCallback,
  parseOAuthDevice,
  parseOAuthJson,
  parseOAuthToken,
  type OAuthAuthorization,
  type OAuthDevice,
  type OAuthIssue,
  type OAuthProfile,
  type OAuthRemoteError,
  type OAuthToken,
} from "./oauth-studio";

export type OAuthPhase =
  | "idle"
  | "preparing"
  | "awaiting-authorization"
  | "exchanging"
  | "device-starting"
  | "device-awaiting"
  | "polling"
  | "ready"
  | "refreshing"
  | "revoking"
  | "revoked"
  | "cancelled"
  | "expired"
  | "error";
export type OAuthSnapshot = {
  phase: OAuthPhase;
  busy: boolean;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  tokenType: string;
  scope: string;
  expiresAt: number | null;
  polls: number;
  nextPollAt: number | null;
  deviceExpiresAt: number | null;
  source: "live" | "demo";
  issue?: OAuthIssue;
  remote?: OAuthRemoteError;
};
export type OAuthJournalEntry = {
  sequence: number;
  phase: OAuthPhase;
  atMs: number;
  status?: number;
  issue?: OAuthIssue;
  remote?: OAuthRemoteError;
};
export type OAuthRuntime = {
  fetcher?: typeof fetch;
  now?: () => number;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  source?: "live" | "demo";
};
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort),
      abort = () => {
        cleanup();
        reject(new OAuthError("cancelled"));
      };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (v) => {
        cleanup();
        resolve(v);
      },
      (e) => {
        cleanup();
        reject(e);
      },
    );
    if (signal.aborted) abort();
  });
}
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
      },
      abort = () => {
        cleanup();
        reject(new OAuthError("cancelled"));
      };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
const cancelBody = (body: ReadableStream<Uint8Array> | null) => {
  try {
    void body?.cancel().catch(() => {});
  } catch {}
};
export async function oauthHttp(
  url: string,
  options: {
    method?: "GET" | "POST";
    form?: URLSearchParams;
    timeoutMs: number;
    signal?: AbortSignal;
    fetcher?: typeof fetch;
    empty?: boolean;
  },
): Promise<{ value: Record<string, unknown>; status: number }> {
  const endpoint = oauthUrl(url),
    controller = new AbortController(),
    signal = controller.signal,
    start = performance.now();
  if (
    !Number.isFinite(options.timeoutMs) ||
    options.timeoutMs < 1 ||
    options.timeoutMs > 30000 ||
    (options.form &&
      new TextEncoder().encode(options.form.toString()).byteLength >
        MAX_OAUTH_BYTES)
  )
    throw new OAuthError("limit");
  let timeout = false,
    response: Response | undefined,
    reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
    complete = false;
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = setTimeout(() => {
    timeout = true;
    controller.abort();
  }, options.timeoutMs);
  try {
    if (signal.aborted) throw new OAuthError("cancelled");
    response = await abortable<Response>(
      Promise.resolve().then(async () => {
        if (signal.aborted) throw new OAuthError("cancelled");
        const fetched = await (options.fetcher ?? fetch)(endpoint, {
          method: options.method ?? "GET",
          headers: {
            Accept: "application/json",
            ...(options.form
              ? { "Content-Type": "application/x-www-form-urlencoded" }
              : {}),
          },
          body: options.form?.toString(),
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          mode: "cors",
          signal,
        });
        if (signal.aborted) {
          cancelBody(fetched.body);
          throw new OAuthError("cancelled");
        }
        return fetched;
      }),
      signal,
    );
    if (response.redirected || response.type === "opaqueredirect")
      throw new OAuthError("network");
    if (options.empty && response.ok) {
      complete = true;
      cancelBody(response.body);
      return { value: {}, status: response.status };
    }
    const mime = (response.headers.get("Content-Type") ?? "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (
      mime !== "application/json" &&
      !/^application\/[\w.+-]+\+json$/.test(mime)
    )
      throw new OAuthError(
        response.ok ? "json" : "http",
        undefined,
        response.status,
      );
    if (!response.body) throw new OAuthError("json");
    reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true }),
      parts: string[] = [];
    let bytes = 0;
    while (true) {
      const { value, done } = await abortable(reader.read(), signal);
      if (signal.aborted) throw new OAuthError("cancelled");
      if (performance.now() - start >= options.timeoutMs)
        throw new OAuthError("timeout");
      if (done) break;
      if (
        !ArrayBuffer.isView(value) ||
        Object.prototype.toString.call(value) !== "[object Uint8Array]"
      )
        throw new OAuthError("network");
      bytes += value.byteLength;
      if (bytes > MAX_OAUTH_BYTES) throw new OAuthError("limit");
      try {
        parts.push(decoder.decode(value, { stream: true }));
      } catch {
        throw new OAuthError("json");
      }
    }
    try {
      parts.push(decoder.decode());
    } catch {
      throw new OAuthError("json");
    }
    const value = parseOAuthJson(parts.join(""));
    complete = true;
    if (!response.ok)
      throw new OAuthError(
        typeof value.error === "string" ? "oauth-error" : "http",
        oauthRemoteError(value.error),
        response.status,
      );
    if (value.error !== undefined) throw new OAuthError("token");
    return { value, status: response.status };
  } catch (e) {
    if (timeout) throw new OAuthError("timeout");
    if (options.signal?.aborted) throw new OAuthError("cancelled");
    throw oauthError(e);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    if (!complete) {
      if (reader) {
        try {
          void reader.cancel().catch(() => {});
        } catch {}
      } else if (response) cancelBody(response.body);
    }
    try {
      reader?.releaseLock();
    } catch {}
  }
}
export async function discoverOAuthProfile(
  profile: OAuthProfile,
  signal?: AbortSignal,
  fetcher?: typeof fetch,
): Promise<OAuthProfile> {
  const { oauthMetadataUrl } = await import("./oauth-studio");
  const response = await oauthHttp(oauthMetadataUrl(profile), {
    timeoutMs: profile.timeoutMs,
    signal,
    fetcher,
  });
  return applyOAuthMetadata(profile, response.value);
}
export class OAuthSession {
  readonly profile: OAuthProfile;
  private token: OAuthToken | null = null;
  private device: OAuthDevice | null = null;
  private authorization: OAuthAuthorization | null = null;
  private phase: OAuthPhase = "idle";
  private controller: AbortController | null = null;
  private issue?: OAuthIssue;
  private remote?: OAuthRemoteError;
  private polls = 0;
  private disposed = false;
  private started: number;
  private sequence = 0;
  private entries: OAuthJournalEntry[] = [];
  private now: () => number;
  constructor(
    profile: OAuthProfile,
    private observe: (state: OAuthSnapshot) => void = () => {},
    private runtime: OAuthRuntime = {},
  ) {
    this.profile = Object.freeze(normalizeOAuthProfile(profile));
    this.now = runtime.now ?? Date.now;
    this.started = this.now();
  }
  snapshot(): OAuthSnapshot {
    const expired =
      !!this.token &&
      this.token.expiresAt !== null &&
      this.now() >= this.token.expiresAt;
    return {
      phase:
        !this.controller && this.phase === "ready" && expired
          ? "expired"
          : !this.controller &&
              this.authorization &&
              this.now() >= this.authorization.expiresAt
            ? "expired"
            : this.phase,
      busy: !!this.controller,
      hasAccessToken: !!this.token && !expired,
      hasRefreshToken: !!this.token?.refreshToken,
      tokenType: this.token?.tokenType ?? "",
      scope: this.token?.scope ?? "",
      expiresAt: this.token?.expiresAt ?? null,
      polls: this.polls,
      nextPollAt: this.device?.nextPollAt ?? null,
      deviceExpiresAt: this.device?.expiresAt ?? null,
      source: this.runtime.source ?? "live",
      ...(this.issue ? { issue: this.issue } : {}),
      ...(this.remote ? { remote: this.remote } : {}),
    };
  }
  private update(phase: OAuthPhase, extra: Partial<OAuthJournalEntry> = {}) {
    this.phase = phase;
    this.entries.push({
      sequence: ++this.sequence,
      phase,
      atMs: Math.max(0, this.now() - this.started),
      ...extra,
    });
    if (this.entries.length > 200) this.entries.shift();
    if (!this.disposed) this.observe(this.snapshot());
  }
  private ensure(signal: AbortSignal) {
    if (signal.aborted || this.disposed) throw new OAuthError("cancelled");
  }
  private async task<T>(
    phase: OAuthPhase,
    work: (signal: AbortSignal) => Promise<T>,
    final: OAuthPhase,
  ): Promise<T> {
    if (this.disposed) throw new OAuthError("cancelled");
    if (this.controller) throw new OAuthError("busy");
    const controller = new AbortController();
    this.controller = controller;
    this.issue = undefined;
    this.remote = undefined;
    this.update(phase);
    try {
      const result = await work(controller.signal);
      this.ensure(controller.signal);
      this.controller = null;
      this.update(final);
      return result;
    } catch (e) {
      const issue = oauthError(e);
      this.controller = null;
      this.issue = issue.code;
      this.remote = issue.remote;
      this.update(
        issue.code === "cancelled"
          ? "cancelled"
          : issue.code === "expired"
            ? "expired"
            : "error",
        {
          issue: issue.code,
          ...(issue.remote ? { remote: issue.remote } : {}),
          ...(issue.status ? { status: issue.status } : {}),
        },
      );
      throw issue;
    }
  }
  private async post(
    endpoint: string,
    form: URLSearchParams,
    signal: AbortSignal,
    empty = false,
    timeoutMs = this.profile.timeoutMs,
  ) {
    const response = await oauthHttp(endpoint, {
      method: "POST",
      form,
      timeoutMs,
      signal,
      fetcher: this.runtime.fetcher,
      empty,
    });
    this.ensure(signal);
    return response;
  }
  private commit(value: unknown, signal: AbortSignal, previousRefresh = "") {
    this.ensure(signal);
    this.token = parseOAuthToken(
      value,
      this.token?.scope ?? this.profile.scope,
      this.runtime.source ?? "live",
      this.now(),
      previousRefresh,
    );
    this.device = null;
  }
  async prepare(redirectUri: string): Promise<{ url: string; state: string }> {
    return this.task(
      "preparing",
      async (signal) => {
        const pending = await createOAuthAuthorization(
          this.profile,
          redirectUri,
          this.now(),
        );
        this.ensure(signal);
        this.token = null;
        this.device = null;
        this.authorization = pending;
        return { url: pending.url, state: pending.state };
      },
      "awaiting-authorization",
    );
  }
  async acceptCallback(source: string) {
    if (!this.authorization) throw new OAuthError("state");
    const pending = this.authorization;
    let callback: { code: string };
    try {
      callback = parseOAuthCallback(source, pending, this.profile, this.now());
    } catch (e) {
      const error = oauthError(e);
      if (error.code === "oauth-error" || error.code === "expired") {
        this.authorization = null;
        this.issue = error.code;
        this.remote = error.remote;
        this.update(error.code === "expired" ? "expired" : "error", {
          issue: error.code,
          ...(error.remote ? { remote: error.remote } : {}),
        });
      }
      throw error;
    }
    return this.task(
      "exchanging",
      async (signal) => {
        this.authorization = null;
        const response = await this.post(
          this.profile.tokenEndpoint,
          oauthForm(this.profile, {
            grant_type: "authorization_code",
            code: callback.code,
            redirect_uri: pending.redirectUri,
            code_verifier: pending.verifier,
          }),
          signal,
        );
        this.commit(response.value, signal);
      },
      "ready",
    );
  }
  async startDevice() {
    if (
      !this.profile.clientId.trim() ||
      !this.profile.deviceEndpoint ||
      !this.profile.tokenEndpoint
    )
      throw new OAuthError("profile");
    return this.task(
      "device-starting",
      async (signal) => {
        const response = await this.post(
          this.profile.deviceEndpoint,
          oauthForm(this.profile, {}, true),
          signal,
        );
        const device = parseOAuthDevice(response.value, this.now());
        this.ensure(signal);
        this.device = device;
        this.authorization = null;
        this.token = null;
        this.polls = 0;
      },
      "device-awaiting",
    );
  }
  async pollDevice() {
    if (!this.device) throw new OAuthError("device");
    const device = this.device,
      deadline = Math.min(device.expiresAt, this.now() + 300000);
    return this.task(
      "polling",
      async (signal) => {
        while (true) {
          this.ensure(signal);
          if (this.now() >= device.expiresAt) throw new OAuthError("expired");
          if (this.now() >= deadline) throw new OAuthError("timeout");
          const remaining = Math.max(0, device.nextPollAt - this.now());
          await abortable(
            (this.runtime.wait ?? wait)(
              Math.min(remaining, Math.max(0, deadline - this.now())),
              signal,
            ),
            signal,
          );
          this.ensure(signal);
          if (this.now() >= device.expiresAt) throw new OAuthError("expired");
          if (this.now() >= deadline) throw new OAuthError("timeout");
          this.polls++;
          // Reserve the next slot before sending, including cancelled in-flight polls.
          device.nextPollAt = this.now() + device.intervalMs;
          this.update("polling");
          try {
            const response = await this.post(
              this.profile.tokenEndpoint,
              oauthForm(this.profile, {
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                device_code: device.deviceCode,
              }),
              signal,
              false,
              Math.min(
                this.profile.timeoutMs,
                Math.max(1, deadline - this.now()),
              ),
            );
            if (this.now() >= device.expiresAt) throw new OAuthError("expired");
            if (this.now() >= deadline) throw new OAuthError("timeout");
            this.commit(response.value, signal);
            return;
          } catch (e) {
            const error = oauthError(e);
            if (
              error.remote === "authorization_pending" ||
              error.remote === "slow_down"
            ) {
              if (error.remote === "slow_down")
                device.intervalMs = Math.min(300000, device.intervalMs + 5000);
              device.nextPollAt = this.now() + device.intervalMs;
              this.update("polling", { remote: error.remote });
            } else {
              if (error.code === "timeout" || error.code === "network") {
                device.intervalMs = Math.min(300000, device.intervalMs * 2);
                device.nextPollAt = this.now() + device.intervalMs;
              }
              if (error.remote === "expired_token")
                throw new OAuthError("expired", "expired_token");
              throw error;
            }
          }
        }
      },
      "ready",
    );
  }
  async refresh() {
    const token = this.token;
    if (!token?.refreshToken) throw new OAuthError("unavailable");
    return this.task(
      "refreshing",
      async (signal) => {
        const response = await this.post(
          this.profile.tokenEndpoint,
          oauthForm(this.profile, {
            grant_type: "refresh_token",
            refresh_token: token.refreshToken,
          }),
          signal,
        );
        this.commit(response.value, signal, token.refreshToken);
      },
      "ready",
    );
  }
  async revoke(which: "access" | "refresh") {
    const token =
      which === "access" ? this.token?.accessToken : this.token?.refreshToken;
    if (!token || !this.profile.revocationEndpoint)
      throw new OAuthError("unavailable");
    return this.task(
      "revoking",
      async (signal) => {
        await this.post(
          this.profile.revocationEndpoint,
          new URLSearchParams({
            client_id: this.profile.clientId,
            token,
            token_type_hint:
              which === "access" ? "access_token" : "refresh_token",
          }),
          signal,
          true,
        );
        this.ensure(signal);
        this.token = null;
        this.authorization = null;
        this.device = null;
      },
      "revoked",
    );
  }
  tokenValues(): { accessToken: string; refreshToken: string } | null {
    return this.token
      ? {
          accessToken: this.token.accessToken,
          refreshToken: this.token.refreshToken,
        }
      : null;
  }
  deviceView() {
    return this.device
      ? {
          userCode: this.device.userCode,
          verificationUri: this.device.verificationUri,
          expiresAt: this.device.expiresAt,
        }
      : null;
  }
  accessToken(): string {
    if (
      !this.token ||
      this.token.source !== "live" ||
      (this.token.expiresAt !== null && this.now() >= this.token.expiresAt)
    )
      throw new OAuthError("unavailable");
    return this.token.accessToken;
  }
  cancel() {
    this.controller?.abort();
    if (!this.controller) {
      this.authorization = null;
      this.update("cancelled");
    }
  }
  clear() {
    this.controller?.abort();
    this.token = null;
    this.device = null;
    this.authorization = null;
    this.issue = undefined;
    this.remote = undefined;
    if (!this.controller) this.update("idle");
  }
  dispose() {
    this.disposed = true;
    this.controller?.abort();
    this.token = null;
    this.device = null;
    this.authorization = null;
  }
  report() {
    const state = this.snapshot();
    return {
      kind: "rsswag-oauth-session-report",
      version: 1,
      profileId: this.profile.id,
      profileName: this.profile.name,
      phase: state.phase,
      source: state.source,
      hasAccessToken: state.hasAccessToken,
      hasRefreshToken: state.hasRefreshToken,
      tokenType: state.tokenType,
      expiresAt: state.expiresAt,
      polls: state.polls,
      entries: this.entries.map((e) => ({ ...e })),
    };
  }
}
export async function runOAuthOfflineDemo(
  observe: (state: OAuthSnapshot) => void = () => {},
): Promise<OAuthSession> {
  const { demoOAuthProject } = await import("./oauth-studio");
  let now = Date.now(),
    polled = 0;
  const fetcher: typeof fetch = async (url, init) => {
    const form = new URLSearchParams(String(init?.body ?? ""));
    if (String(url).endsWith("/device"))
      return Response.json({
        device_code: "offline-device",
        user_code: "DEMO-ONLY",
        verification_uri: "https://identity.example/verify",
        expires_in: 120,
        interval: 1,
      });
    if (String(url).endsWith("/revoke"))
      return new Response(null, { status: 200 });
    if (form.get("grant_type") === "refresh_token")
      return Response.json({
        access_token: "offline-refreshed-token",
        token_type: "Bearer",
        refresh_token: "offline-rotated-refresh",
        expires_in: 3600,
      });
    if (++polled === 1)
      return Response.json({ error: "authorization_pending" }, { status: 400 });
    if (polled === 2)
      return Response.json({ error: "slow_down" }, { status: 400 });
    return Response.json({
      access_token: "offline-access-token",
      token_type: "Bearer",
      refresh_token: "offline-refresh-token",
      expires_in: 3600,
    });
  };
  const session = new OAuthSession(demoOAuthProject().profiles[0], observe, {
    source: "demo",
    fetcher,
    now: () => now,
    wait: async (ms) => {
      now += ms;
    },
  });
  await session.startDevice();
  await session.pollDevice();
  await session.refresh();
  return session;
}
