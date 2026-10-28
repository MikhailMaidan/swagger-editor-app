import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthCallbackDocument, runOAuthCallbackPage } from "./oauth-callback";
import { OAUTH_CHANNEL_PREFIX } from "./oauth-studio";

const channels: FakeChannel[] = [];
class FakeChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
  constructor(name: string) {
    this.name = name;
    channels.push(this);
  }
}
const labels = {
  waiting: "Waiting",
  delivered: "Delivered",
  invalid: "Invalid",
  copied: "Copied",
  failed: "Failed",
  manual: "Manual callback URL",
  channelPrefix: OAUTH_CHANNEL_PREFIX,
};
const state = "a".repeat(43),
  original = window.location.href,
  clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
beforeEach(() => {
  channels.length = 0;
  vi.stubGlobal("BroadcastChannel", FakeChannel);
  vi.spyOn(window, "close").mockImplementation(() => {});
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  document.body.innerHTML =
    '<p id="callback-status"></p><button id="callback-copy"></button>';
  window.history.replaceState(
    null,
    "",
    `/oauth/callback?state=${state}&code=private-code`,
  );
});
afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  window.history.replaceState(null, "", original);
  document.body.innerHTML = "";
  if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("isolated OAuth callback page", () => {
  it("offers selected plain text for manual copying when clipboard access is denied", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
      new Error("Blocked"),
    );
    runOAuthCallbackPage(labels);
    (document.getElementById("callback-copy") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(document.getElementById("callback-manual")).toBeInTheDocument(),
    );
    const manual = document.getElementById(
      "callback-manual",
    ) as HTMLTextAreaElement;
    expect(manual.value).toContain("code=private-code");
    expect(manual.readOnly).toBe(true);
    expect(manual.selectionEnd).toBe(manual.value.length);
  });
  it("scrubs query data, delivers on the exact state-bound channel, and closes after acknowledgment", () => {
    runOAuthCallbackPage(labels);
    expect(window.location.search).toBe("");
    expect(channels[0].name).toBe(OAUTH_CHANNEL_PREFIX + state);
    expect(channels[0].postMessage).toHaveBeenCalledWith({
      kind: "rsswag-oauth-callback",
      url: expect.stringContaining("code=private-code"),
    });
    expect(document.body.textContent).not.toContain("private-code");
    channels[0].onmessage?.({
      data: { kind: "rsswag-oauth-accepted" },
    } as MessageEvent);
    expect(document.getElementById("callback-status")).toHaveTextContent(
      "Delivered",
    );
    expect(window.close).toHaveBeenCalled();
    expect(channels[0].close).toHaveBeenCalled();
  });
  it("supports explicit copying when BroadcastChannel is unavailable", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    runOAuthCallbackPage(labels);
    (document.getElementById("callback-copy") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("code=private-code"),
      ),
    );
    expect(document.getElementById("callback-status")).toHaveTextContent(
      "Copied",
    );
  });
  it.each([
    "?code=private-code",
    "?state=short&code=x",
    `?state=${state}&state=${state}&code=x`,
    `?state=${state}#access_token=secret`,
  ])("rejects invalid callback delivery %s", (query) => {
    window.history.replaceState(null, "", "/oauth/callback" + query);
    runOAuthCallbackPage(labels);
    expect(channels).toHaveLength(0);
    expect(document.getElementById("callback-copy")).toBeDisabled();
    expect(document.getElementById("callback-status")).toHaveTextContent(
      "Invalid",
    );
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });
  it("serializes a self-contained script that executes without module closures", () => {
    const html = oauthCallbackDocument("en", "test-nonce"),
      script = /<script nonce="test-nonce">([\s\S]*?)<\/script>/.exec(html)![1];
    new Function(script)();
    expect(channels[0].name).toBe(OAUTH_CHANNEL_PREFIX + state);
    expect(window.location.search).toBe("");
    expect(html).not.toContain("private-code");
    expect(html).not.toContain("window.opener");
    expect(html).not.toContain("localStorage");
  });
});
