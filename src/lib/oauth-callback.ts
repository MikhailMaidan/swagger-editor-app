import { OAUTH_CHANNEL_PREFIX } from "./oauth-studio";

// This function is serialized into a standalone page. Keep it self-contained:
// no imports, closures, external requests, storage, opener access, or HTML parsing.
export function runOAuthCallbackPage(labels: {
  waiting: string;
  delivered: string;
  invalid: string;
  copied: string;
  failed: string;
  manual: string;
  channelPrefix: string;
}) {
  const original = window.location.href,
    url = new URL(original),
    status = document.getElementById("callback-status"),
    copy = document.getElementById("callback-copy") as HTMLButtonElement | null;
  window.history.replaceState(null, "", url.pathname);
  const state = url.searchParams.get("state"),
    valid =
      !url.hash &&
      url.searchParams.getAll("state").length === 1 &&
      !!state &&
      /^[A-Za-z0-9_-]{32,128}$/.test(state);
  if (status) status.textContent = valid ? labels.waiting : labels.invalid;
  if (copy) {
    copy.disabled = !valid;
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(original);
        if (status) status.textContent = labels.copied;
      } catch {
        if (status) status.textContent = labels.failed;
        let manual = document.getElementById(
          "callback-manual",
        ) as HTMLTextAreaElement | null;
        if (!manual) {
          manual = document.createElement("textarea");
          manual.id = "callback-manual";
          manual.rows = 5;
          manual.readOnly = true;
          manual.autocomplete = "off";
          manual.setAttribute("aria-label", labels.manual);
          copy.after(manual);
        }
        manual.value = original;
        manual.focus();
        manual.select();
      }
    };
  }
  let channel: BroadcastChannel | null = null,
    timer: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => {
    channel?.close();
    clearTimeout(timer);
    window.removeEventListener("pagehide", dispose);
  };
  if (valid && typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(labels.channelPrefix + state);
      channel.onmessage = (event) => {
        if (event.data?.kind === "rsswag-oauth-accepted") {
          if (status) status.textContent = labels.delivered;
          dispose();
          window.close();
        }
      };
      channel.postMessage({ kind: "rsswag-oauth-callback", url: original });
      timer = setTimeout(dispose, 120000);
    } catch {
      channel?.close();
    }
  }
  window.addEventListener("pagehide", dispose, { once: true });
  return dispose;
}
export function oauthCallbackDocument(
  language: "en" | "ru",
  nonce: string,
): string {
  const ru = language === "ru";
  const labels = {
    waiting: ru
      ? "Вернитесь в студию OAuth. Если ответ не доставлен автоматически, скопируйте URL и вставьте его в студию."
      : "Return to the OAuth studio. If delivery is unavailable, copy this callback URL and paste it into the studio.",
    delivered: ru
      ? "Ответ передан студии OAuth. Это окно можно закрыть."
      : "Callback delivered to the OAuth studio. You can close this window.",
    invalid: ru
      ? "Некорректный ответ OAuth. Вернитесь в студию и начните новый запрос авторизации."
      : "Invalid OAuth callback. Return to the studio and start a new authorization request.",
    copied: ru
      ? "URL ответа скопирован. Вставьте его в студию OAuth."
      : "Callback URL copied. Paste it into the OAuth studio.",
    failed: ru
      ? "Не удалось скопировать URL ответа."
      : "Could not copy the callback URL.",
    manual: ru
      ? "URL ответа для ручного копирования"
      : "Callback URL for manual copying",
    channelPrefix: OAUTH_CHANNEL_PREFIX,
  };
  const script = `(${runOAuthCallbackPage.toString()})(${JSON.stringify(labels).replace(/</g, "\\u003c")});`;
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>RSSwag OAuth</title><style nonce="${nonce}">body{margin:0;background:#f8fafc;color:#10253f;font:16px system-ui,sans-serif}main{max-width:36rem;margin:12vh auto;padding:2rem;background:white;border:1px solid #d7deea;border-radius:16px}h1{font-size:1.4rem}p{line-height:1.6}button{padding:.7rem 1rem;border:1px solid #b7a7dd;border-radius:8px;background:#f5f1ff;font:inherit;cursor:pointer}button:disabled{opacity:.5}</style></head><body><main><h1>${ru ? "Ответ авторизации OAuth" : "OAuth authorization callback"}</h1><p id="callback-status" role="status">${ru ? "Обработка ответа…" : "Processing callback…"}</p><button id="callback-copy" type="button">${ru ? "Скопировать URL ответа" : "Copy callback URL"}</button><noscript>${ru ? "Для безопасной передачи ответа включите JavaScript или вставьте URL этой страницы в студию OAuth вручную." : "Enable JavaScript to deliver the callback securely, or paste this page's URL into the OAuth studio manually."}</noscript></main><script nonce="${nonce}">${script}</script></body></html>`;
}
