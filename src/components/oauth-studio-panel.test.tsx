import { webcrypto } from "node:crypto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OAuthStudioPanel } from "./oauth-studio-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { writeTextToClipboard } from "@/lib/clipboard";
import {
  defaultOAuthProfile,
  demoOAuthProject,
  OAUTH_CHANNEL_PREFIX,
} from "@/lib/oauth-studio";
import type { SecuritySchemeSummary } from "@/lib/openapi";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));
const fetcher = vi.fn<typeof fetch>(),
  channels: FakeChannel[] = [];
class FakeChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  close = vi.fn();
  postMessage = vi.fn();
  constructor(name: string) {
    this.name = name;
    channels.push(this);
  }
}
const bearer: SecuritySchemeSummary = {
  name: "API",
  type: "http",
  scheme: "bearer",
  bearerFormat: "",
  description: "",
  parameterName: "",
  location: "",
};
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("BroadcastChannel", FakeChannel);
  fetcher.mockReset().mockRejectedValue(new Error("Unexpected network"));
  channels.length = 0;
  vi.mocked(downloadTextFile).mockReset().mockReturnValue(true);
  vi.mocked(writeTextToClipboard).mockReset().mockResolvedValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const button = (name: string) => screen.getByRole("button", { name });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const exported = () => vi.mocked(downloadTextFile).mock.calls.at(-1)![0];
const response = (access = "live-access", refresh = "live-refresh") =>
  new Response(
    JSON.stringify({
      access_token: access,
      refresh_token: refresh,
      token_type: "Bearer",
      expires_in: 3600,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
async function setup(configure = true) {
  const user = userEvent.setup(),
    onApplyToken = vi.fn().mockReturnValue(true),
    onForgetToken = vi.fn(),
    view = render(
      <OAuthStudioPanel
        schemes={[bearer]}
        onApplyToken={onApplyToken}
        onForgetToken={onForgetToken}
      />,
    );
  await user.click(
    screen.getByText("OAuth authorization studio", { selector: "summary" }),
  );
  if (configure) {
    change("Public client ID", "public-client");
    await user.click(button("Save OAuth profile"));
  }
  return { user, onApplyToken, onForgetToken, ...view };
}
async function prepare(
  user: ReturnType<typeof userEvent.setup>,
  popup = false,
) {
  await user.click(
    button(
      popup ? "Authorize with PKCE popup" : "Prepare PKCE authorization link",
    ),
  );
  const input = await screen.findByLabelText("Session authorization URL"),
    url = new URL((input as HTMLInputElement).value);
  const callback = new URL(
    (
      screen.getByLabelText(
        "Register this exact OAuth redirect URI",
      ) as HTMLInputElement
    ).value,
  );
  callback.searchParams.set("state", url.searchParams.get("state")!);
  callback.searchParams.set("iss", defaultOAuthProfile().issuer);
  callback.searchParams.set("code", "private-code");
  return callback;
}
async function acquire(user: ReturnType<typeof userEvent.setup>) {
  const url = await prepare(user);
  fetcher.mockResolvedValueOnce(response());
  change("Session-only callback URL", url.href);
  await user.click(button("Validate callback and exchange code"));
  await screen.findByText("OAuth state: Access token received");
}
function file(text: string) {
  const f = new File([text], "oauth.json", { type: "application/json" });
  Object.defineProperty(f, "text", { value: async () => text });
  return f;
}
describe("OAuthStudioPanel", () => {
  it("runs a synthetic lifecycle with no traffic or storage and blocks API handoff", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem"),
      { user, onApplyToken } = await setup(false);
    await user.click(button("Run offline OAuth lifecycle demo"));
    await screen.findByText("OAuth state: Access token received");
    expect(
      screen.getByText("Offline synthetic demonstration"),
    ).toBeInTheDocument();
    expect(button("Use live token for selected API scheme")).toBeDisabled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(onApplyToken).not.toHaveBeenCalled();
    await user.click(button("Download credential-free OAuth report"));
    expect(JSON.parse(exported())).toMatchObject({ source: "demo", polls: 3 });
    expect(exported()).not.toContain("offline-refreshed-token");
  });
  it("prepares PKCE without traffic, validates a callback, masks tokens, and hands off only on explicit action", async () => {
    const { user, onApplyToken } = await setup();
    const url = await prepare(user);
    expect(fetcher).not.toHaveBeenCalled();
    expect(channels[0].name).toBe(
      OAUTH_CHANNEL_PREFIX + url.searchParams.get("state"),
    );
    change(
      "Session-only callback URL",
      url.href.replace("state=", "state=wrong"),
    );
    await user.click(button("Validate callback and exchange code"));
    expect(screen.getByRole("alert")).toHaveTextContent("Callback state");
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(response());
    change("Session-only callback URL", url.href);
    await user.click(button("Validate callback and exchange code"));
    await screen.findByText("OAuth state: Access token received");
    expect(screen.getByLabelText("Session access token")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByLabelText("Session access token")).toHaveValue(
      "live-access",
    );
    expect(onApplyToken).not.toHaveBeenCalled();
    expect(
      screen.queryByLabelText("Session-only callback URL"),
    ).not.toBeInTheDocument();
    await user.click(button("Use live token for selected API scheme"));
    expect(onApplyToken).toHaveBeenCalledExactlyOnceWith("API", "live-access");
    await user.click(screen.getByLabelText("Reveal session token values"));
    expect(screen.getByLabelText("Session access token")).toHaveAttribute(
      "type",
      "text",
    );
  });
  it("keeps owned handoffs explicit across refresh and forgets the exact applied value", async () => {
    const { user, onApplyToken, onForgetToken } = await setup();
    await acquire(user);
    await user.click(button("Use live token for selected API scheme"));
    fetcher.mockResolvedValueOnce(
      response("rotated-access", "rotated-refresh"),
    );
    await user.click(button("Refresh OAuth access token"));
    await waitFor(() =>
      expect(screen.getByLabelText("Session access token")).toHaveValue(
        "rotated-access",
      ),
    );
    expect(onApplyToken).toHaveBeenCalledOnce();
    await user.click(button("Use live token for selected API scheme"));
    expect(onApplyToken).toHaveBeenLastCalledWith("API", "rotated-access");
    await user.click(button("Forget OAuth session credentials"));
    expect(onForgetToken).toHaveBeenCalledExactlyOnceWith(
      "API",
      "rotated-access",
    );
    expect(
      screen.queryByLabelText("Session access token"),
    ).not.toBeInTheDocument();
  });
  it("revokes tokens with a form, clears owned API credentials, and never exports active secrets", async () => {
    const { user, onForgetToken } = await setup();
    await acquire(user);
    await user.click(button("Use live token for selected API scheme"));
    await user.click(button("Export public OAuth profiles"));
    expect(exported()).not.toContain("live-access");
    expect(exported()).not.toContain("live-refresh");
    expect(exported()).not.toContain("private-code");
    fetcher.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await user.click(button("Revoke refresh token"));
    await screen.findByText(
      "OAuth state: Revocation accepted; local tokens cleared",
    );
    expect(onForgetToken).toHaveBeenCalledWith("API", "live-access");
    expect(
      new URLSearchParams(String(fetcher.mock.calls.at(-1)![1]?.body)).get(
        "token",
      ),
    ).toBe("live-refresh");
  });
  it("isolates the authorization popup and receives a state-bound callback automatically", async () => {
    const popup = {
      opener: {},
      location: { href: "about:blank" },
      closed: false,
      close: vi.fn(),
    };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const { user } = await setup(),
      url = await prepare(user, true);
    expect(popup.opener).toBeNull();
    expect(popup.location.href).toContain("code_challenge_method=S256");
    fetcher.mockResolvedValueOnce(response());
    await act(async () =>
      channels[0].onmessage?.({
        data: { kind: "rsswag-oauth-callback", url: url.href },
      } as MessageEvent),
    );
    await screen.findByText("OAuth state: Access token received");
    expect(channels[0].postMessage).toHaveBeenCalledWith({
      kind: "rsswag-oauth-accepted",
    });
    expect(popup.close).toHaveBeenCalled();
    expect(channels[0].close).toHaveBeenCalled();
  });
  it("offers a manual authorization link when popup creation is blocked", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const { user } = await setup();
    await prepare(user, true);
    expect(screen.getByRole("alert")).toHaveTextContent("Popup unavailable");
    expect(
      screen.getByRole("link", { name: "Open authorization page" }),
    ).toHaveAttribute("rel", "noopener noreferrer");
    await user.click(button("Copy authorization URL"));
    await screen.findByText("Session value copied.");
    expect(vi.mocked(writeTextToClipboard).mock.calls[0][0]).toContain(
      "code_challenge_method=S256",
    );
  });
  it("cancels when the authorization popup closes and never exchanges a code", async () => {
    const popup = {
      opener: {},
      location: { href: "" },
      closed: false,
      close: vi.fn(),
    };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const { user } = await setup();
    await prepare(user, true);
    popup.closed = true;
    await screen.findByText("OAuth state: Cancelled", {}, { timeout: 2000 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("shows a device user code, waits the required interval, and collects a token", async () => {
    const { user } = await setup();
    fetcher
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            device_code: "hidden-device",
            user_code: "ABCD-EFGH",
            verification_uri: "https://identity.example/verify",
            expires_in: 60,
            interval: 1,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(response());
    await user.click(button("Request device authorization"));
    await screen.findByLabelText("Device user code");
    expect(screen.getByLabelText("Device user code")).toHaveValue("ABCD-EFGH");
    expect(
      screen.getByRole("link", { name: "Open device verification page" }),
    ).toHaveAttribute("href", "https://identity.example/verify");
    await user.click(button("Poll device authorization"));
    await screen.findByText(
      "OAuth state: Access token received",
      {},
      { timeout: 3000 },
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText("Device user code")).not.toBeInTheDocument();
  });
  it("cancels waiting device polling and preserves the grant for manual resumption", async () => {
    const { user } = await setup();
    fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          device_code: "hidden-device",
          user_code: "ABCD",
          verification_uri: "https://identity.example/verify",
          expires_in: 120,
          interval: 60,
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    await user.click(button("Request device authorization"));
    await screen.findByLabelText("Device user code");
    await user.click(button("Poll device authorization"));
    await user.click(button("Cancel OAuth operation"));
    await screen.findByText("OAuth state: Cancelled");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(button("Poll device authorization")).toBeEnabled();
  });
  it("cancels an uncooperative token request on unmount and disposes any late response", async () => {
    const { user, unmount } = await setup(),
      url = await prepare(user),
      cancel = vi.fn();
    let resolve!: (r: Response) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    change("Session-only callback URL", url.href);
    await user.click(button("Validate callback and exchange code"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    const signal = fetcher.mock.calls[0][1]!.signal!;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () =>
      resolve(new Response(new ReadableStream({ cancel }))),
    );
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });
  it("preserves invalid numeric/profile drafts and blocks switching or execution until resolved", async () => {
    const { user } = await setup();
    change("OAuth HTTP timeout, ms (100–30000)", "");
    expect(button("Prepare PKCE authorization link")).toBeDisabled();
    await user.click(button("Save OAuth profile"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Check public-client settings",
    );
    expect(
      screen.getByLabelText("OAuth HTTP timeout, ms (100–30000)"),
    ).toHaveValue("");
    await user.click(button("Discard pending OAuth edits"));
    expect(
      screen.getByLabelText("OAuth HTTP timeout, ms (100–30000)"),
    ).toHaveValue("10000");
  });
  it("imports profiles atomically and manages independent named clients", async () => {
    const { user } = await setup();
    const input = screen.getByLabelText("Import public OAuth profiles");
    fireEvent.change(input, { target: { files: [file("{broken")] } });
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Public client ID")).toHaveValue(
      "public-client",
    );
    const p = demoOAuthProject();
    fireEvent.change(input, {
      target: {
        files: [
          file(
            JSON.stringify({
              ...p,
              tokens: "private",
              profiles: p.profiles.map((p) => ({
                ...p,
                client_secret: "private",
              })),
            }),
          ),
        ],
      },
    });
    await screen.findByText("Public OAuth profiles imported.");
    await user.click(button("Export public OAuth profiles"));
    expect(exported()).not.toContain("private");
    await user.click(button("Add OAuth profile"));
    expect(screen.getByLabelText("OAuth profile name")).toHaveValue(
      "OAuth client 2",
    );
    await user.click(button("Delete OAuth profile"));
    expect(screen.getByLabelText("Public client ID")).toHaveValue(
      "rsswag-demo-client",
    );
  });
  it("validates fetched/pasted metadata and stages endpoints for review before use", async () => {
    const { user } = await setup();
    fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          issuer: defaultOAuthProfile().issuer,
          token_endpoint: "https://identity.example/v2/token",
          authorization_response_iss_parameter_supported: true,
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    await user.click(button("Fetch authorization-server metadata"));
    await screen.findByText(
      "Metadata applied to the draft. Review and save the profile before authorization.",
    );
    expect(screen.getByLabelText("Token endpoint")).toHaveValue(
      "https://identity.example/v2/token",
    );
    expect(button("Prepare PKCE authorization link")).toBeDisabled();
    await user.click(button("Save OAuth profile"));
    expect(
      screen.getByLabelText(
        "Require an exact iss parameter in the authorization callback",
      ),
    ).toBeChecked();
    change(
      "Authorization-server metadata JSON",
      '{"issuer":"https://wrong.example"}',
    );
    await user.click(button("Apply pasted OAuth metadata to draft"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "issuer does not exactly match",
    );
  });
  it("retains work through collapse and reports blocked exports/copies", async () => {
    const { user } = await setup();
    await acquire(user);
    await user.click(
      screen.getByText("OAuth authorization studio", { selector: "summary" }),
    );
    await user.click(
      screen.getByText("OAuth authorization studio", { selector: "summary" }),
    );
    expect(screen.getByLabelText("Session access token")).toHaveValue(
      "live-access",
    );
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    await user.click(button("Download credential-free OAuth report"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not start the OAuth download",
    );
    vi.mocked(writeTextToClipboard).mockResolvedValueOnce(false);
    await user.click(button("Copy live access token"));
    await screen.findByText("Could not copy the session value.");
  });
  it("localizes OAuth controls and synthetic flow status in Russian", async () => {
    const { user } = await setup(false);
    act(() => setAppLanguage("ru"));
    await user.click(button("Запустить локальный пример OAuth"));
    await screen.findByText("Состояние OAuth: Токен доступа получен");
    expect(
      screen.getByText("Студия авторизации OAuth", { selector: "summary" }),
    ).toBeInTheDocument();
  });
});
