import { installIcons } from "./icons";
import "./ux.css";
export const escapeText = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function errorMessage(error: unknown) {
  if (
    error instanceof DOMException &&
    ["AbortError", "TimeoutError"].includes(error.name)
  )
    return "連線等候太久，請檢查網路後重試。尚未送出的內容仍保留在畫面上。";
  if (error instanceof SyntaxError)
    return "資料格式無法讀取，請確認檔案是 MyZilla 匯出的 JSON，或稍後重新載入。";
  const value = error instanceof Error ? error.message : String(error);
  if (/fetch|network|load failed|Failed to fetch/i.test(value))
    return "目前無法連線到 MyZilla。請檢查網路後重試，避免重複送出。";
  if (/HTTP 5\d\d|讀取失敗（HTTP 5/.test(value))
    return "伺服器暫時無法處理，請稍後重試。";
  if (/HTTP 429/.test(value)) return "操作太頻繁，請稍候一分鐘再試。";
  return value || "操作未完成。請確認輸入後重試。";
}
export function announce(
  message: string,
  error = false,
  action?: { label: string; run: () => Promise<void> },
) {
  document.getElementById("ux-toast")?.remove();
  const box = document.createElement("div");
  box.id = "ux-toast";
  box.className = error ? "ux-toast ux-error" : "ux-toast";
  box.setAttribute("role", error ? "alert" : "status");
  const text = document.createElement("span");
  text.textContent = message;
  box.append(text);
  if (action) {
    box.dataset.undo = "true";
    const b = document.createElement("button");
    b.textContent = action.label;
    b.onclick = async () => {
      b.disabled = true;
      try {
        await action.run();
        box.remove();
        announce("已復原");
      } catch (e) {
        b.disabled = false;
        text.textContent = errorMessage(e);
      }
    };
    box.append(b);
  }
  const close = document.createElement("button");
  close.textContent = "關閉";
  close.setAttribute("aria-label", "關閉通知");
  close.onclick = () => box.remove();
  box.append(close);
  document.body.append(box);
  if (!action && !error) setTimeout(() => box.remove(), 6500);
}
export function confirmAction(
  title: string,
  description: string,
  verb = "確認",
): Promise<boolean> {
  const opener = document.activeElement as HTMLElement;
  const dialog = document.createElement("dialog");
  dialog.className = "ux-confirm";
  dialog.setAttribute("aria-labelledby", "ux-confirm-title");
  dialog.setAttribute("aria-describedby", "ux-confirm-description");
  dialog.innerHTML = `<h2 id="ux-confirm-title">${escapeText(title)}</h2><p id="ux-confirm-description">${escapeText(description)}</p><div class="actions"><button data-cancel autofocus>取消</button><button data-confirm class="primary">${escapeText(verb)}</button></div>`;
  const stopIcons = installIcons(dialog);
  dialog.addEventListener("close", stopIcons, { once: true });
  document.body.append(dialog);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      dialog.close();
      dialog.remove();
      if (opener?.isConnected) opener.focus();
      resolve(v);
    };
    dialog
      .querySelector("[data-cancel]")!
      .addEventListener("click", () => finish(false));
    dialog
      .querySelector("[data-confirm]")!
      .addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      finish(false);
    });
    dialog.showModal();
  });
}
export function pendingUI(root: HTMLElement, blocking = true) {
  if (!blocking) return () => {};
  const focused = document.activeElement as HTMLElement;
  const hadFocus = root.contains(focused);
  const disabled = new Map<
    | HTMLInputElement
    | HTMLButtonElement
    | HTMLSelectElement
    | HTMLTextAreaElement,
    boolean
  >();
  root
    .querySelectorAll<
      | HTMLInputElement
      | HTMLButtonElement
      | HTMLSelectElement
      | HTMLTextAreaElement
    >("button,input,select,textarea")
    .forEach((b) => {
      if (b.dataset.cancelImport !== undefined) return;
      disabled.set(b, b.disabled);
      b.disabled = true;
    });
  root.setAttribute("aria-busy", "true");
  const dialog = root.matches("dialog")
    ? root
    : (root.querySelector("dialog[open]") ??
      (root.contains(focused) ? focused.closest("form") : null));
  const inline = document.createElement("p");
  inline.setAttribute("role", "status");
  inline.className = "ux-inline-status";
  if (dialog) dialog.append(inline);
  const timer = setTimeout(() => {
    inline.textContent = "正在處理，請稍候…";
  }, 500);
  return () => {
    clearTimeout(timer);
    inline.remove();
    root.removeAttribute("aria-busy");
    for (const [b, old] of disabled) if (b.isConnected) b.disabled = old;
    if (hadFocus && document.activeElement === document.body) {
      if (focused.isConnected && !(focused as HTMLButtonElement).disabled)
        focused.focus({ preventScroll: true });
      else if (root.isConnected) focusHeading(root);
    }
    const toast = document.getElementById("ux-toast");
    if (toast?.textContent?.startsWith("正在處理")) toast.remove();
  };
}
export async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    announce("已複製");
  } catch {
    const d = document.createElement("dialog");
    d.className = "ux-confirm";
    d.innerHTML =
      '<h2>請手動複製</h2><p>瀏覽器未允許自動複製，請選取下方內容。</p><textarea readonly aria-label="複製內容"></textarea><button>關閉</button>';
    d.querySelector("textarea")!.value = value;
    d.querySelector("button")!.onclick = () => {
      d.close();
      d.remove();
    };
    d.addEventListener("cancel", () => d.remove());
    document.body.append(d);
    d.showModal();
    d.querySelector("textarea")!.select();
  }
}
export function copyControl(message: string) {
  const line = message.match(/(?:連結.*?：|邀請碼.*?：|同步金鑰.*?：)(\S+)$/);
  return line
    ? `<button type="button" data-copy="${escapeText(line[1])}">複製</button>`
    : "";
}
export function clearDirty(root: ParentNode) {
  root
    .querySelectorAll("[data-dirty]")
    .forEach((f) => f.removeAttribute("data-dirty"));
}
export function isDirty(root: ParentNode) {
  return !!root.querySelector("form[data-dirty]");
}
export async function discardChanges(root: ParentNode) {
  return (
    !isDirty(root) ||
    (await confirmAction(
      "放棄尚未儲存的變更？",
      "離開後，本次輸入不會儲存。你也可以取消，繼續編輯。",
      "放棄變更",
    ))
  );
}
export function installUX(root: HTMLElement) {
  installIcons(root);
  root.addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    const form = input.closest("form");
    if (
      form &&
      (form.dataset.form === "save" ||
        form.dataset.form === "profile" ||
        form.dataset.form === "claim" ||
        form.dataset.form === "register" ||
        form.dataset.form === "password" ||
        form.dataset.topic ||
        form.id === "connect-form")
    )
      form.dataset.dirty = "true";
  });
  addEventListener("beforeunload", (e) => {
    if (isDirty(root)) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  const approved = new WeakSet<HTMLAnchorElement>();
  root.addEventListener(
    "click",
    (e) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a");
      if (
        a &&
        root.getAttribute("aria-busy") === "true" &&
        a.getAttribute("href")?.startsWith("#")
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (
        !a ||
        a.target === "_blank" ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        !isDirty(root) ||
        approved.has(a)
      ) {
        if (a) approved.delete(a);
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      void discardChanges(root).then((ok) => {
        if (ok) {
          clearDirty(root);
          approved.add(a);
          a.click();
        }
      });
    },
    true,
  );
  root.addEventListener("click", (e) => {
    const button = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-copy]",
    );
    if (button) void copyText(button.dataset.copy!);
  });
  document.addEventListener("keydown", (e) => {
    if (
      e.key !== "/" ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      (e.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable]",
      ) ||
      document.querySelector("dialog[open]")
    )
      return;
    const search = [
      ...root.querySelectorAll<HTMLInputElement>(
        "input[type=search],#search,#find-query",
      ),
    ].find((el) => el.checkVisibility());
    if (search) {
      e.preventDefault();
      search.focus();
    }
  });
  const top = document.createElement("button");
  top.className = "ux-top";
  top.textContent = "回到頂部 ↑";
  top.hidden = true;
  top.onclick = () => {
    scrollTo({
      top: 0,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    focusHeading(root);
  };
  document.body.append(top);
  addEventListener("scroll", () => (top.hidden = scrollY < 800), {
    passive: true,
  });
}
export function focusHeading(root: ParentNode) {
  const heading = root.querySelector<HTMLElement>("h1,h2");
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

// Reauthenticate in-place: never send a preserved draft into a different account.
let authentication: Promise<boolean> | undefined;
export function reauthenticate(account: string): Promise<boolean> {
  if (authentication) return authentication;
  authentication = new Promise<boolean>((resolve) => {
    const opener = document.activeElement as HTMLElement;
    const dialog = document.createElement("dialog");
    dialog.className = "ux-confirm";
    dialog.setAttribute("aria-labelledby", "reauth-title");
    dialog.innerHTML = `<h2 id="reauth-title">登入已過期</h2><p>輸入仍保留。請登入原帳號，再重新送出剛才的操作。</p><form data-reauth="password"><label>帳號<input name="handle" required autocomplete="username"></label><label>密碼<input name="password" type="password" required autocomplete="current-password"></label><button>重新登入</button></form><details><summary>使用原始存取金鑰</summary><form data-reauth="key"><label>存取金鑰<input name="token" type="password" required minlength="32" autocomplete="off"></label><button>驗證金鑰</button></form></details><p role="alert"></p><button data-cancel>取消，保留輸入</button>`;
    const finish = (ok: boolean) => {
      dialog.close();
      dialog.remove();
      if (opener?.isConnected) opener.focus();
      resolve(ok);
    };
    dialog
      .querySelector("[data-cancel]")!
      .addEventListener("click", () => finish(false));
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      if (!pending) finish(false);
    });
    let pending = false;
    dialog.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (pending) return;
      pending = true;
      const form = e.target as HTMLFormElement;
      const input = Object.fromEntries(new FormData(form));
      const stop = pendingUI(dialog);
      try {
        let candidate = String(input.token ?? "").trim();
        if (form.dataset.reauth === "password") {
          const r = await fetch("/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
            signal: AbortSignal.timeout(20000),
          });
          const result = await r.json();
          if (!r.ok) throw Error(result.error ?? `HTTP ${r.status}`);
          candidate = result.token;
        }
        const r = await fetch("/api/community/me", {
          headers: { Authorization: `Bearer ${candidate}` },
          signal: AbortSignal.timeout(20000),
        });
        if (!r.ok) throw Error("登入資訊不正確，請重新輸入。");
        const me = await r.json();
        if (me.id !== account)
          throw Error("這不是原本的帳號。為保護尚未儲存的內容，請登入原帳號。");
        sessionStorage.setItem("myzilla-token", candidate);
        finish(true);
      } catch (e) {
        dialog.querySelector("[role=alert]")!.textContent = errorMessage(e);
      } finally {
        pending = false;
        stop();
      }
    });
    const stopIcons = installIcons(dialog);
    dialog.addEventListener("close", stopIcons, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  }).finally(() => {
    authentication = undefined;
  });
  return authentication;
}
