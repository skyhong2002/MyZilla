import "./curation.css";
import {
  escapeText as esc,
  announce,
  errorMessage,
  confirmAction,
  clearDirty,
  discardChanges,
} from "./ux";
export type Api = (
  path: string,
  method?: string,
  body?: unknown,
) => Promise<any>;
export type Pick = { url: string; title: string; note?: string };
export const captureButton = (p: Pick, label = "整理這個連結") =>
  `<button type="button" class="curate-button" data-curate-url="${esc(p.url)}" data-curate-title="${esc(p.title.slice(0, 500))}" data-curate-note="${esc(p.note ?? "")}">${label}</button>`;
export function topicLink(id: string, label: string, range = "") {
  return `<a class="button" href="/?topic=${encodeURIComponent(id)}&topicName=${encodeURIComponent(label)}${range ? "&" + range : ""}#inbox">挑選相關頁面 →</a>`;
}
export function modal(title: string, body: string) {
  const previous = document.getElementById("curation-dialog");
  if (previous) return previous as HTMLDialogElement;
  const dialog = document.createElement("dialog");
  dialog.id = "curation-dialog";
  dialog.className = "curation-dialog";
  dialog.setAttribute("aria-labelledby", "curation-dialog-title");
  dialog.innerHTML = `<div class="heading"><h2 id="curation-dialog-title">${esc(title)}</h2><button type="button" data-dismiss aria-label="關閉對話框">關閉</button></div><p role="alert" class="curation-error"></p>${body}`;
  const opener = document.activeElement as HTMLElement;
  const close = async () => {
    if (dialog.dataset.busy) return;
    if (await discardChanges(dialog)) {
      clearDirty(dialog);
      dialog.close();
    }
  };
  dialog
    .querySelector("[data-dismiss]")!
    .addEventListener("click", () => void close());
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    void close();
  });
  dialog.addEventListener(
    "close",
    () => {
      dialog.remove();
      opener?.isConnected && opener.focus();
    },
    { once: true },
  );
  dialog.addEventListener("input", (e) => {
    const form = (e.target as HTMLElement).closest("form");
    if (form) form.dataset.dirty = "true";
  });
  const beforeUnload = (e: BeforeUnloadEvent) => {
    if (dialog.querySelector("form[data-dirty]")) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", beforeUnload);
  dialog.addEventListener(
    "close",
    () => window.removeEventListener("beforeunload", beforeUnload),
    { once: true },
  );
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
export async function dialogJob(
  dialog: HTMLDialogElement,
  job: () => Promise<void>,
) {
  if (dialog.dataset.busy) return;
  dialog.dataset.busy = "true";
  const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button")];
  const disabled = buttons.map((b) => b.disabled);
  buttons.forEach((b) => (b.disabled = true));
  dialog.querySelector("[role=alert]")!.textContent = "";
  try {
    await job();
  } catch (e) {
    if (dialog.isConnected)
      dialog.querySelector("[role=alert]")!.textContent = errorMessage(e);
    else announce(errorMessage(e), true);
  } finally {
    delete dialog.dataset.busy;
    buttons.forEach((b, i) => (b.disabled = disabled[i]));
  }
}
export async function chooseDestination(
  api: Api,
  picks: Pick[],
  done: () => Promise<void> = async () => {},
  defaultTitle = "",
) {
  if (!picks.length) {
    announce("先勾選想留下的頁面。", true);
    return;
  }
  const dialog = modal(
    `整理 ${picks.length} 個連結`,
    `<p>加入待整理清單，或放進主題選集。只有加入選集的連結與你填寫的推薦理由會隨選集分享。</p><details><summary>查看已選內容</summary><ul>${picks.map((p) => `<li>${esc(p.title)}</li>`).join("")}</ul></details><button type="button" data-inbox class="primary">加入待整理</button><hr><form data-destination-search><label>搜尋選集<input name="q" type="search" maxlength="2000"></label><button>搜尋選集</button></form><div data-destinations>讀取選集…</div><hr><form data-new-collection><h3>建立新的主題選集</h3><label>選集名稱<input name="title" required maxlength="200" value="${esc(defaultTitle)}"></label><button>建立私人選集並加入</button></form>`,
  );
  const finish = async (result: any) => {
    clearDirty(dialog);
    dialog.close();
    announce(
      `已加入 ${result.inserted} 筆，${result.duplicates} 筆已存在${result.rejected ? `，${result.rejected} 筆未接受` : ""}。`,
    );
    await done();
    document.dispatchEvent(new CustomEvent("curation-changed"));
  };
  dialog.querySelector("[data-inbox]")!.addEventListener(
    "click",
    () =>
      void dialogJob(dialog, async () => {
        const result = await api("/api/curation/capture", "POST", {
          items: picks,
        });
        if (result.rejected)
          throw Error(
            `有 ${result.rejected} 筆未接受；已接受 ${result.accepted} 筆。請檢查網址後重試。`,
          );
        await finish(result);
      }),
  );
  let offset = 0,
    q = "";
  const list = async () => {
    const data = await api(
      `/api/curation/collections?audience=editable&offset=${offset}&q=${encodeURIComponent(q)}`,
    );
    const target = dialog.querySelector("[data-destinations]")!;
    target.innerHTML =
      data.items
        .map(
          (v: any) =>
            `<button type="button" data-destination="${v.id}">${esc(v.title)} <small>· ${v.role === "editor" ? "共同編輯" : v.visibility === "friends" ? "朋友可見" : "私人"}</small></button>`,
        )
        .join("") || "<p>沒有符合的選集，可在下方建立。</p>";
    target.innerHTML += `<div class="actions"><button type="button" data-dest-prev ${!offset ? "disabled" : ""}>上一頁</button><span>${data.total} 份選集</span><button type="button" data-dest-next ${offset + 20 >= data.total ? "disabled" : ""}>下一頁</button></div>`;
    target.querySelectorAll<HTMLButtonElement>("[data-destination]").forEach(
      (b) =>
        (b.onclick = () =>
          void dialogJob(dialog, async () => {
            const row = data.items.find(
              (v: any) => v.id === b.dataset.destination,
            );
            if (
              (row.visibility === "friends" || row.role === "editor") &&
              !(await confirmAction(
                "加入共用選集？",
                `所選的 ${picks.length} 個連結與推薦理由將讓這份選集的讀者及共同編輯者看到。`,
                "加入選集",
              ))
            )
              return;
            await finish(
              await api(
                `/api/curation/collections/${b.dataset.destination}/items`,
                "POST",
                { items: picks },
              ),
            );
          })),
    );
    target.querySelector<HTMLButtonElement>("[data-dest-prev]")!.onclick = () =>
      void dialogJob(dialog, async () => {
        offset -= 20;
        await list();
      });
    target.querySelector<HTMLButtonElement>("[data-dest-next]")!.onclick = () =>
      void dialogJob(dialog, async () => {
        offset += 20;
        await list();
      });
  };
  dialog
    .querySelector("[data-destination-search]")!
    .addEventListener("submit", (e) => {
      e.preventDefault();
      q = String(new FormData(e.target as HTMLFormElement).get("q"));
      offset = 0;
      void dialogJob(dialog, list);
    });
  const id = crypto.randomUUID();
  let created = false;
  dialog
    .querySelector("[data-new-collection]")!
    .addEventListener("submit", (e) => {
      e.preventDefault();
      void dialogJob(dialog, async () => {
        const title = String(
          new FormData(e.target as HTMLFormElement).get("title"),
        );
        if (!created) {
          await api(`/api/curation/collections/${id}`, "PUT", { title });
          created = true;
        }
        await finish(
          await api(`/api/curation/collections/${id}/items`, "POST", {
            items: picks,
          }),
        );
      });
    });
  await dialogJob(dialog, list);
}
export function installCapture(
  api: Api,
  done: () => Promise<void> = async () => {},
) {
  document.addEventListener("click", (event) => {
    const b = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-curate-url]",
    );
    if (!b) return;
    event.preventDefault();
    void chooseDestination(
      api,
      [
        {
          url: b.dataset.curateUrl!,
          title: b.dataset.curateTitle!,
          note: b.dataset.curateNote ?? "",
        },
      ],
      done,
    );
  });
}
