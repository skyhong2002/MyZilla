import { escapeText as esc, announce, errorMessage } from "./ux";
import type { Api } from "./curation";
export function installTabCollector(
  command: (type: string) => Promise<any>,
  api: Api,
  server: () => string,
) {
  const target = document.createElement("section");
  target.className = "panel";
  target.innerHTML = `<h2>把開啟的分頁留下來</h2><p>挑選分頁或群組中的連結，送進自己的待整理清單，再到網站整理與分享。</p><button type="button" data-read-tabs>挑選開啟的分頁</button><p role="status" data-tabs-status></p><div data-tabs-list></div>`;
  document.getElementById("settings")!.append(target);
  let tabs: any[] = [],
    busy = false;
  const status = target.querySelector<HTMLElement>("[data-tabs-status]")!;
  const run = async (job: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    try {
      await job();
    } catch (e) {
      status.textContent = errorMessage(e);
    } finally {
      busy = false;
    }
  };
  target.querySelector("[data-read-tabs]")!.addEventListener(
    "click",
    () =>
      void run(async () => {
        const data = await command("collect-tabs");
        tabs = data.items;
        status.textContent = `找到 ${tabs.length} 個網頁分頁；${data.excluded} 個非網頁或私人分頁未列入。尚未傳送任何連結。`;
        const groups = new Map<string, any[]>();
        tabs.forEach((t, i) => {
          const key = t.group ?? "未分組";
          groups.set(key, [...(groups.get(key) ?? []), { ...t, index: i }]);
        });
        target.querySelector("[data-tabs-list]")!.innerHTML =
          [...groups]
            .map(
              ([group, items], n) =>
                `<fieldset><legend><label><input type="checkbox" data-tab-group="${n}"> ${esc(group)}</label></legend>${items.map((t) => `<label class="check"><input type="checkbox" data-tab-pick="${t.index}" data-group-index="${n}"><span>${esc(t.title)}<small style="display:block;overflow-wrap:anywhere">${esc(t.url)}</small></span></label>`).join("")}</fieldset>`,
            )
            .join("") +
          `<button type="button" data-send-tabs>將已選分頁加入待整理</button><a href="${esc(server())}/#inbox" target="_blank" rel="noopener noreferrer">到網站整理 →</a>`;
      }),
  );
  target.addEventListener("change", (e) => {
    const b = e.target as HTMLInputElement;
    if (b.dataset.tabGroup !== undefined)
      target
        .querySelectorAll<HTMLInputElement>(
          `[data-group-index="${b.dataset.tabGroup}"]`,
        )
        .forEach((c) => (c.checked = b.checked));
  });
  target.addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest("[data-send-tabs]")) return;
    void run(async () => {
      const selected = [
        ...target.querySelectorAll<HTMLInputElement>("[data-tab-pick]:checked"),
      ].map((b) => tabs[Number(b.dataset.tabPick)]);
      if (!selected.length) {
        status.textContent = "先勾選想留下的分頁。";
        return;
      }
      let accepted = 0,
        inserted = 0,
        duplicates = 0,
        rejected = 0;
      for (let i = 0; i < selected.length; i += 200) {
        const r = await api("/api/curation/capture", "POST", {
          items: selected
            .slice(i, i + 200)
            .map((t) => ({ url: t.url, title: t.title })),
        });
        accepted += r.accepted;
        inserted += r.inserted;
        duplicates += r.duplicates;
        rejected += r.rejected;
        status.textContent = `已處理 ${Math.min(i + 200, selected.length)}/${selected.length} 筆：接受 ${accepted}，新增 ${inserted}，重複 ${duplicates}，拒收 ${rejected}。`;
      }
      announce("已送入自己的待整理清單，可到網站繼續整理。");
    });
  });
}
