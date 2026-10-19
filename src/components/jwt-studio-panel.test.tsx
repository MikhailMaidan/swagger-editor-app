import { webcrypto } from "node:crypto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { JwtStudioPanel } from "./jwt-studio-panel";
import { setAppLanguage } from "./i18n-provider";
import { downloadTextFile } from "@/lib/schema-download";
import { writeTextToClipboard } from "@/lib/clipboard";
import * as jwt from "@/lib/jwt-studio";

vi.mock("@/lib/schema-download", () => ({ downloadTextFile: vi.fn() }));
vi.mock("@/lib/clipboard", () => ({ writeTextToClipboard: vi.fn() }));

let demo: jwt.JwtProject;
beforeAll(async () => {
  vi.stubGlobal("crypto", webcrypto);
  demo = await jwt.demoJwtProject();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
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
function file(text: string) {
  const f = new File([text], "jwt.json", { type: "application/json" });
  Object.defineProperty(f, "text", { value: async () => text });
  return f;
}
async function restore(project: jwt.JwtProject, includeSigning = true) {
  fireEvent.change(screen.getByLabelText("Restore JWT project (JSON)"), {
    target: { files: [file(jwt.serializeJwtProject(project, includeSigning))] },
  });
  await screen.findByText(/JWT project restored/);
}
async function setup(project?: jwt.JwtProject) {
  const user = userEvent.setup(),
    view = render(<JwtStudioPanel />);
  await user.click(
    screen.getByText("JWT and signing-key studio", { selector: "summary" }),
  );
  if (project) await restore(project);
  return { user, ...view };
}
async function verify(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button("Verify JWT signature and claims"));
  return screen.findByLabelText("JWT verification result");
}
async function runCases(user: ReturnType<typeof userEvent.setup>, count = 5) {
  await user.click(button("Run JWT verification cases"));
  await screen.findByText(
    `Completed ${count}/${count} cases: ${count} passed, 0 failed.`,
  );
}

describe("JwtStudioPanel", () => {
  it("generates the demo, verifies it and runs negative cases without fetching, storing or changing credentials", async () => {
    document.cookie = "auth=existing-login; path=/";
    const cookies = document.cookie,
      fetch = vi.spyOn(globalThis, "fetch"),
      storage = vi.spyOn(Storage.prototype, "setItem");
    const { user } = await setup();
    await user.click(button("Load JWT verification demo"));
    await screen.findByText(/RSA demo loaded/);
    expect(
      screen.queryByLabelText("Selected JWK material"),
    ).not.toBeInTheDocument();
    await user.click(button("Decode JWT without verification"));
    expect(
      screen.getByText(/Decoded content is untrusted/),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("JWT verification result"),
    ).not.toBeInTheDocument();
    expect(await verify(user)).toHaveTextContent(
      "Token accepted by policy; signature valid; claims valid.",
    );
    await user.click(button("Download value-free JWT verification report"));
    expect(JSON.parse(exported())).toMatchObject({
      status: "accepted",
      signature: "valid",
      findings: [],
    });
    const token = (screen.getByLabelText("Compact JWT") as HTMLTextAreaElement)
      .value;
    expect(exported()).not.toContain(token);
    expect(exported()).not.toContain("example-user");
    await runCases(user);
    await user.click(button("Download value-free JWT case report"));
    expect(JSON.parse(exported())).toMatchObject({
      complete: true,
      completed: 5,
      passed: 5,
      failed: 0,
    });
    expect(exported()).not.toContain("https://issuer.example");
    expect(exported()).not.toContain('"n":');
    expect(fetch).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(document.cookie).toBe(cookies);
  });

  it("restores a public-only project, ignores imported results and replays all cases with no signing key", async () => {
    const { user } = await setup(demo);
    await runCases(user);
    await user.click(button("Download JWT verification project"));
    const text = exported(),
      saved = jwt.parseJwtProject(text);
    expect(saved.keys).toHaveLength(1);
    expect(saved.keys.every((k) => jwt.jwtKeyKind(k) === "public")).toBe(true);
    expect(text).not.toContain('"d":');
    expect(text).not.toContain('"results":');
    fireEvent.change(screen.getByLabelText("Restore JWT project (JSON)"), {
      target: {
        files: [
          file(JSON.stringify({ ...saved, results: [{ status: "passed" }] })),
        ],
      },
    });
    await screen.findByText(/JWT project restored/);
    expect(screen.queryByText(/Completed 5\/5/)).not.toBeInTheDocument();
    expect(button("Sign JWT locally")).toBeDisabled();
    expect(button("Download private PEM")).toBeDisabled();
    expect(await verify(user)).toHaveTextContent("Token accepted by policy");
    await runCases(user);
  });

  it("creates an ES256 key pair and test token using a saved policy and verifies the signature", async () => {
    const { user } = await setup();
    change("Generation / JWK fallback algorithm", "ES256");
    change("Key label", "Browser ECDSA");
    await user.click(button("Generate JWT signing keys"));
    await screen.findByText(/Keys validated and added locally/);
    expect(
      within(screen.getByLabelText("Selected JWT key")).getAllByRole("option"),
    ).toHaveLength(3);
    await user.click(screen.getByRole("checkbox", { name: "ES256" }));
    change("Expected issuer (iss)", "https://local.example");
    change("Expected audience (aud)", "orders-api");
    change("Verification time (Unix seconds, blank uses now)", "1000.25");
    expect(button("Sign JWT locally")).toBeDisabled();
    await user.click(button("Save JWT verification policy"));
    await user.click(button("Build header for signing key"));
    await user.click(button("Build one-hour claims from policy"));
    expect(
      JSON.parse(
        (
          screen.getByLabelText(
            "JWT claims JSON to sign",
          ) as HTMLTextAreaElement
        ).value,
      ),
    ).toMatchObject({
      iss: "https://local.example",
      aud: "orders-api",
      iat: 1000,
      exp: 4600,
    });
    await user.click(button("Sign JWT locally"));
    await screen.findByText(/JWT signed locally/);
    const token = (screen.getByLabelText("Compact JWT") as HTMLTextAreaElement)
      .value;
    expect(jwt.inspectJwt(token).signature).toHaveLength(64);
    expect(await verify(user)).toHaveTextContent(
      "Token accepted by policy; signature valid; claims valid.",
    );
    await user.click(button("Calculate public JWK thumbprint"));
    await screen.findByText(/SHA-256 JWK thumbprint: [A-Za-z0-9_-]{43}/);
    await user.click(button("Download public PEM"));
    await waitFor(() =>
      expect(exported()).toContain("-----BEGIN PUBLIC KEY-----"),
    );
    await user.click(button("Download public verification JWKS"));
    expect(JSON.parse(exported()).keys).toHaveLength(1);
    expect(exported()).not.toContain('"d":');
  });

  it("imports a shared secret explicitly, keeps it hidden and excludes it from ordinary exports", async () => {
    const { user } = await setup();
    const secret = "a-test-secret-with-at-least-32-bytes";
    change("Key import format", "utf8");
    change("Key import material", secret);
    expect(button("Download JWT verification project")).toBeDisabled();
    expect(button("New JWT project")).toBeDisabled();
    await user.click(button("Add imported JWT keys"));
    await screen.findByText(/Keys validated and added locally/);
    expect(screen.getByLabelText("Key import material")).toHaveValue("");
    expect(
      screen.queryByLabelText("Selected JWK material"),
    ).not.toBeInTheDocument();
    expect(button("Download selected JWK")).toBeDisabled();
    await user.click(button("Download JWT verification project"));
    expect(jwt.parseJwtProject(exported()).keys).toEqual([]);
    await user.click(screen.getByLabelText("Reveal selected signing material"));
    expect(
      JSON.parse(
        (screen.getByLabelText("Selected JWK material") as HTMLTextAreaElement)
          .value,
      ).k,
    ).toBe(jwt.jwtEncode(new TextEncoder().encode(secret)));
    await user.click(
      screen.getByLabelText(
        "Include private and shared-secret signing keys in exports",
      ),
    );
    await user.click(button("Download selected JWK"));
    expect(JSON.parse(exported()).kty).toBe("oct");
    await user.click(button("Download JWT verification project"));
    expect(jwt.parseJwtProject(exported()).keys).toHaveLength(1);
    await user.click(button("Forget signing keys and import material"));
    expect(button("Sign JWT locally")).toBeDisabled();
    expect(
      screen.getByLabelText(
        "Include private and shared-secret signing keys in exports",
      ),
    ).not.toBeChecked();
    expect(
      screen.queryByLabelText("Selected JWK material"),
    ).not.toBeInTheDocument();
  });

  it("requires an explicit private-key export choice and can forget private keys while retaining verification", async () => {
    const { user } = await setup(demo);
    await user.click(button("Download selected JWK"));
    expect(JSON.parse(exported()).kty).toBe("RSA");
    expect(exported()).not.toContain('"d":');
    expect(button("Download private PEM")).toBeDisabled();
    await user.click(
      screen.getByLabelText(
        "Include private and shared-secret signing keys in exports",
      ),
    );
    await user.click(button("Download private PEM"));
    await waitFor(() =>
      expect(exported()).toContain("-----BEGIN PRIVATE KEY-----"),
    );
    await user.click(button("Download JWT verification project"));
    expect(
      jwt
        .parseJwtProject(exported())
        .keys.some((k) => jwt.jwtKeyKind(k) === "private"),
    ).toBe(true);
    await user.click(button("Forget signing keys and import material"));
    expect(button("Sign JWT locally")).toBeDisabled();
    expect(await verify(user)).toHaveTextContent("Token accepted by policy");
    await runCases(user);
  });

  it("retains invalid numeric policy drafts, prevents stale verification and supports save or discard", async () => {
    const { user } = await setup(demo);
    await verify(user);
    change("Verification time (Unix seconds, blank uses now)", "not-a-clock");
    expect(
      screen.getByLabelText("Verification time (Unix seconds, blank uses now)"),
    ).toHaveValue("not-a-clock");
    expect(
      screen.queryByLabelText("JWT verification result"),
    ).not.toBeInTheDocument();
    expect(button("Verify JWT signature and claims")).toBeDisabled();
    expect(button("Download JWT verification project")).toBeDisabled();
    await user.click(button("Save JWT verification policy"));
    expect(screen.getByRole("alert")).toHaveTextContent(/Use a valid policy/);
    await user.click(button("Discard policy edits"));
    expect(button("Verify JWT signature and claims")).toBeEnabled();
    change("Expected audience (aud)", "different-api");
    await user.click(button("Save JWT verification policy"));
    expect(await verify(user)).toHaveTextContent(
      "Token rejected; signature valid; claims invalid.",
    );
    expect(
      screen.getByText(/Audience does not match policy\./),
    ).toBeInTheDocument();
  });

  it("authors, edits, searches and deletes reusable positive and negative verification cases", async () => {
    const { user } = await setup(demo);
    change("Selected JWT verification case", "");
    change("Verification case name", "Copied valid token");
    await user.click(button("Use current token in case"));
    expect(button("Run JWT verification cases")).toBeDisabled();
    expect(
      screen.getByLabelText("Selected JWT verification case"),
    ).toBeDisabled();
    await user.click(button("Save JWT verification case"));
    change("Selected JWT verification case", "");
    change("Verification case name", "Reject malformed input");
    change("Verification case token", "malformed");
    change("Expected verification outcome", "rejected");
    await user.click(button("Save JWT verification case"));
    await runCases(user, 7);
    change("Search JWT verification cases", "malformed passed");
    expect(
      screen.getByText(/Reject malformed input · rejected · case passed/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /Copied valid token · accepted by policy · case passed/,
      ),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Search JWT verification cases"), {
      key: "Escape",
    });
    expect(
      screen.getByText(/Copied valid token · accepted by policy · case passed/),
    ).toBeInTheDocument();
    await user.click(button("Load case token into inspector"));
    expect(screen.getByLabelText("Compact JWT")).toHaveValue("malformed");
    expect(await verify(user)).toHaveTextContent(
      "Token rejected; signature not checked; claims not checked.",
    );
    await user.click(button("Remove JWT verification case"));
    await user.click(button("Download JWT verification project"));
    expect(jwt.parseJwtProject(exported()).cases).toHaveLength(6);
  });

  it("decodes unsigned tokens without treating their claims as verified", async () => {
    const { user } = await setup();
    const token = `${jwt.jwtEncode(new TextEncoder().encode('{"alg":"none","typ":"JWT"}'))}.${jwt.jwtEncode(new TextEncoder().encode('{"sub":"admin","exp":9999999999}'))}.`;
    change("Compact JWT", token);
    await user.click(button("Decode JWT without verification"));
    expect(
      JSON.parse(
        (screen.getByLabelText("Decoded JWT claims") as HTMLTextAreaElement)
          .value,
      ),
    ).toMatchObject({ sub: "admin" });
    expect(
      screen.queryByLabelText("JWT verification result"),
    ).not.toBeInTheDocument();
    expect(await verify(user)).toHaveTextContent(
      "Token rejected; signature not checked; claims not checked.",
    );
    expect(
      screen.getByText("Algorithm is unsupported or not allowed by policy."),
    ).toBeInTheDocument();
    change("Compact JWT", "bad token");
    await user.click(button("Decode JWT without verification"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /exactly three dot-separated segments/,
    );
    expect(
      screen.queryByLabelText("Decoded JWT claims"),
    ).not.toBeInTheDocument();
  });

  it("copies exact token/header text and reports blocked downloads and clipboard failures", async () => {
    const { user } = await setup(demo);
    await user.click(button("Copy compact JWT"));
    await waitFor(() =>
      expect(writeTextToClipboard).toHaveBeenLastCalledWith(demo.token),
    );
    await user.click(button("Copy Authorization header"));
    await waitFor(() =>
      expect(writeTextToClipboard).toHaveBeenLastCalledWith(
        `Authorization: Bearer ${demo.token}`,
      ),
    );
    vi.mocked(writeTextToClipboard).mockResolvedValueOnce(false);
    await user.click(button("Copy compact JWT"));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not copy to clipboard.",
    );
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    await user.click(button("Download compact JWT"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Download was blocked. Try again.",
    );
  });

  it("loads key files as uncommitted candidates and keeps existing work after malformed project/key imports", async () => {
    const { user } = await setup(demo);
    fireEvent.change(
      screen.getByLabelText("Read key file (JWK/JWKS/PEM/text)"),
      { target: { files: [file('{"kty":"RSA"}')] } },
    );
    await screen.findByText(/Key file loaded into the import form/);
    expect(button("Verify JWT signature and claims")).toBeDisabled();
    await user.click(button("Add imported JWT keys"));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Key import material")).toHaveValue(
      '{"kty":"RSA"}',
    );
    await user.click(button("Discard key import material"));
    fireEvent.change(screen.getByLabelText("Restore JWT project (JSON)"), {
      target: { files: [file('{"kind":"wrong"}')] },
    });
    await screen.findByRole("alert");
    expect(screen.getByLabelText("JWT project name")).toHaveValue(demo.name);
    expect(screen.getByLabelText("Compact JWT")).toHaveValue(demo.token);
    expect(await verify(user)).toHaveTextContent("Token accepted by policy");
  });

  it("discards cancelled key generation and late file reads without overwriting subsequent work", async () => {
    const { user } = await setup();
    let resolve!: (keys: jwt.JwtKey[]) => void;
    vi.spyOn(jwt, "generateJwtKeys").mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await user.click(button("Generate JWT signing keys"));
    expect(button("New JWT project")).toBeDisabled();
    await user.click(button("Cancel JWT work"));
    change("JWT project name", "Keep my new work");
    await act(async () => resolve(demo.keys));
    expect(screen.getByLabelText("JWT project name")).toHaveValue(
      "Keep my new work",
    );
    expect(button("Sign JWT locally")).toBeDisabled();
    let read!: (text: string) => void;
    const delayed = new File([], "late.json");
    Object.defineProperty(delayed, "text", {
      value: () =>
        new Promise((done) => {
          read = done;
        }),
    });
    fireEvent.change(screen.getByLabelText("Restore JWT project (JSON)"), {
      target: { files: [delayed] },
    });
    await user.click(button("Cancel JWT work"));
    await act(async () => read(jwt.serializeJwtProject(demo)));
    expect(screen.getByLabelText("JWT project name")).toHaveValue(
      "Keep my new work",
    );
    expect(screen.getByLabelText("Compact JWT")).toHaveValue("");
  });

  it("retains completed cases when a batch is cancelled during native verification", async () => {
    const { user } = await setup(demo);
    const nativeVerify = webcrypto.subtle.verify.bind(webcrypto.subtle);
    let release!: () => void,
      count = 0;
    const waiting = new Promise<void>((done) => {
      release = done;
    });
    vi.spyOn(webcrypto.subtle, "verify").mockImplementation(async (...args) => {
      if (++count === 2) await waiting;
      return nativeVerify(...args);
    });
    await user.click(button("Run JWT verification cases"));
    await waitFor(() => expect(count).toBe(2));
    await user.click(button("Cancel JWT work"));
    await act(async () => release());
    await screen.findByText("Completed 1/5 cases: 1 passed, 0 failed.");
    await user.click(button("Download value-free JWT case report"));
    expect(JSON.parse(exported())).toMatchObject({
      complete: false,
      completed: 1,
      total: 5,
      passed: 1,
    });
  });

  it("keeps work when collapsed and provides Russian labels and findings", async () => {
    const { user } = await setup(demo);
    await verify(user);
    await user.click(
      screen.getByText("JWT and signing-key studio", { selector: "summary" }),
    );
    expect(screen.queryByLabelText("Compact JWT")).not.toBeInTheDocument();
    await user.click(
      screen.getByText("JWT and signing-key studio", { selector: "summary" }),
    );
    expect(screen.getByLabelText("Compact JWT")).toHaveValue(demo.token);
    expect(screen.getByLabelText("JWT verification result")).toHaveTextContent(
      "Token accepted by policy",
    );
    act(() => setAppLanguage("ru"));
    expect(
      screen.getByText("Студия JWT и ключей подписи", { selector: "summary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Подписать JWT локально" }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("jwtStudio.");
  });
});
