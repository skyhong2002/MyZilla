import {
  captureButton,
  chooseDestination,
  dialogJob,
  modal,
  topicLink,
  type Api,
} from "./curation";
import {
  escapeText as esc,
  announce,
  errorMessage,
  confirmAction,
  clearDirty,
} from "./ux";
const prefix = "/api/curation/collections/";
const date = (n: number) => new Date(n).toLocaleDateString("zh-TW");
const end = () => Math.ceil(Date.now() / 86400000) * 86400000;
const href = (kind: string, values: Record<string, string> = {}) =>
  `/?${new URLSearchParams(values)}#${kind}`;
const action = (name: string, label: string, id = "", extra = "") =>
  `<button type="button" data-ws="${name}" data-id="${esc(id)}" ${extra}>${label}</button>`;
const pager = (
  offset: number,
  total: number,
  kind: string,
  p: URLSearchParams,
) =>
  `<div class="pagination">${offset ? `<a class="button" href="${esc(href(kind, { ...Object.fromEntries(p), offset: String(Math.max(0, offset - 20)) }))}">上一頁</a>` : ""}<span>${total ? offset + 1 : 0}–${Math.min(offset + 20, total)} / ${total}</span>${offset + 20 < total ? `<a class="button" href="${esc(href(kind, { ...Object.fromEntries(p), offset: String(offset + 20) }))}">下一頁</a>` : ""}</div>`;
const card = (v: any) =>
  v.archived
    ? `<article class="collection-card"><h3>${esc(v.title)}</h3><p>${v.count} 個連結 · 已封存</p>${action("restore-collection", "復原為私人選集", v.id)}</article>`
    : `<a class="collection-card" href="${href("collections", { collection: v.id })}"><small>${v.role === "editor" ? "共同編輯" : v.role === "reader" ? esc(v.owner) + " 分享" : v.visibility === "friends" ? "朋友可見" : "私人選集"}</small><h3>${esc(v.title)}</h3><p>${esc(v.description || "把值得留下的連結放在一起。")}</p><span>${v.count} 個連結 · ${date(v.updated)}</span><p>${v.tags.map((t: string) => `<span class="tag">${esc(t)}</span>`).join("")}</p></a>`;
export async function hydrateHome(api: Api, valid: () => boolean) {
  const target = document.querySelector<HTMLElement>("[data-home-insights]");
  if (!target) return;
  try {
    const data = await api(`/api/insights?from=0&to=${end()}&limit=3`);
    if (!valid() || !target.isConnected) return;
    target.innerHTML = `<div class="workspace-grid">${
      data.topics
        ?.filter((t: any) => t.mode !== "work")
        .map(
          (t: any) =>
            `<article class="topic-preview"><small>${t.days} 個活躍日 · ${t.months} 個月</small><h3>${esc(t.label)}</h3><p>${t.pages} 個不同頁面，來自 ${t.sites} 個網站。</p>${topicLink(t.id, t.label)}</article>`,
        )
        .join("") ||
      '<p class="empty">更多不同日期的內容累積後，這裡會出現主題。<a href="/dashboard.html#history">先從歷史挑選 →</a></p>'
    }</div>`;
  } catch (e) {
    if (valid() && target.isConnected)
      target.innerHTML = `<p role="alert">${esc(errorMessage(e))} ${action("retry", "重試")}</p>`;
  }
}
export async function loadWorkspace(kind: string, api: Api) {
  const p = new URL(location.href).searchParams,
    offset = Number(p.get("offset")) || 0,
    q = p.get("q") ?? "";
  if (kind === "home") {
    const results = await Promise.allSettled([
      api("/api/curation/inbox"),
      api("/api/curation/collections"),
      api("/api/curation/collections?audience=friends"),
    ]);
    const [inbox, collections, friends] = results.map((r) =>
      r.status === "fulfilled" ? r.value : null,
    );
    return {
      inbox,
      collections,
      friends,
      failed: results.some((r) => r.status === "rejected"),
    };
  }
  if (kind === "inbox") {
    if (p.has("topic"))
      return {
        evidence: true,
        ...(await api(
          `/api/insights/evidence?from=${encodeURIComponent(p.get("from") ?? "0")}&to=${encodeURIComponent(p.get("to") ?? String(end()))}&topic=${encodeURIComponent(p.get("topic")!)}&zone=${encodeURIComponent(p.get("zone") ?? "Asia/Taipei")}&offset=${offset}`,
        )),
      };
    return api(
      `/api/curation/inbox?status=${encodeURIComponent(p.get("status") ?? "pending")}&offset=${offset}&q=${encodeURIComponent(q)}`,
    );
  }
  if (p.has("collection")) {
    const detail = await api(prefix + encodeURIComponent(p.get("collection")!));
    return {
      detail,
      friends:
        detail.role === "owner"
          ? (await api("/api/community/friends")).friends.filter(
              (f: any) => f.status === "accepted",
            )
          : [],
    };
  }
  return api(
    `/api/curation/collections?audience=${["friends", "archived"].includes(p.get("audience") ?? "") ? p.get("audience") : "mine"}&offset=${offset}&q=${encodeURIComponent(q)}${p.has("owner") ? "&owner=" + encodeURIComponent(p.get("owner")!) : ""}`,
  );
}
export function workspace(kind: string, data: any) {
  const p = new URL(location.href).searchParams;
  const search = (placeholder: string) =>
    `<form data-workspace-form="search" class="workspace-search"><label>搜尋<input name="q" type="search" maxlength="2000" value="${esc(p.get("q") ?? "")}" placeholder="${placeholder}"></label><button>搜尋</button></form>`;
  if (kind === "home")
    return `<div data-workspace><div class="workspace-intro"><span class="eyebrow">我的入口</span><h1>從看過的，找到值得留下的。</h1><p>接著探索你的關注，或把幾個連結整理成自己的選集。</p><div class="actions"><a class="button primary" href="/#inbox">待整理 ${data.inbox?.total ?? ""}</a>${action("paste", "加入連結")}<a href="/dashboard.html#history">找回看過的頁面 →</a></div></div>${data.failed ? `<p role="alert">部分內容尚未讀取。${action("retry", "重試")}</p>` : ""}<section class="workspace-section"><div class="heading"><h2>持續關注的線索</h2><a href="/dashboard.html#insights">全部洞察 →</a></div><div data-home-insights aria-label="關注線索"><p class="note">關注線索整理中；你可以先繼續整理選集。</p></div></section><section class="workspace-section"><div class="heading"><h2>繼續整理</h2><a href="/#collections">所有選集 →</a></div><div class="workspace-grid">${data.collections?.items.slice(0, 3).map(card).join("") || `<p>先挑幾個頁面，為它們取個名字。${action("create", "建立主題選集")}</p>`}</div></section><section class="workspace-section"><div class="heading"><h2>待整理</h2><a href="/#inbox">全部 ${data.inbox?.total ?? 0} 筆 →</a></div>${
      data.inbox?.items
        .slice(0, 3)
        .map(
          (v: any) =>
            `<div class="workspace-row"><strong>${esc(v.title)}</strong>${captureButton(v, "放進選集")}</div>`,
        )
        .join("") ||
      "<p>在瀏覽歷史、洞察依據或我的網址中按「整理這個連結」，就能先留下來。</p>"
    }</section><section class="workspace-section"><div class="heading"><h2>朋友正在分享</h2><a href="/?audience=friends#collections">探索朋友選集 →</a></div><div class="workspace-grid">${data.friends?.items.slice(0, 3).map(card).join("") || '<p>朋友主動分享的選集會出現在這裡。<a href="/community.html#friends">找朋友一起整理 →</a></p>'}</div></section></div>`;
  if (kind === "inbox")
    return `<div data-workspace><div class="heading"><h1>${data.evidence ? esc(p.get("topicName") || "主題") + "：挑選頁面" : "待整理"}</h1>${action("paste", "加入連結")}</div><p>${data.evidence ? "依據你的瀏覽紀錄整理。勾選值得留下的頁面，再加入待整理或選集。" : "先留下，再決定如何整理。略過與保留都不會刪除原始瀏覽紀錄。"}</p>${
      !data.evidence
        ? `<nav class="workspace-tabs" aria-label="整理狀態">${[
            ["pending", "待整理"],
            ["kept", "已保留"],
            ["dismissed", "已略過"],
          ]
            .map(
              ([status, label]) =>
                `<a href="${href("inbox", { status })}" ${status === (p.get("status") ?? "pending") ? 'aria-current="page"' : ""}>${label}</a>`,
            )
            .join("")}</nav>${search("標題、網址或筆記")}`
        : `<a href="/dashboard.html#insights">回到洞察 →</a>`
    }<div class="selection-bar"><label class="check"><input type="checkbox" data-select-all>本頁全選</label>${action("collect-selected", "整理已選頁面")}<span data-selection-count>尚未選取</span></div>${data.items.map((v: any, i: number) => `<article class="workspace-item"><label class="check"><input type="checkbox" data-pick="${i}"><span class="sr-only">選取 ${esc(v.title)}</span></label><div><h2><a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">${esc(v.title || v.url)}</a></h2><p class="item-url">${esc(v.url)}</p>${v.note ? `<p>${esc(v.note)}</p>` : ""}<small>${data.evidence ? `${v.days ?? 1} 個日期 · 最近 ${date(v.last ?? v.at ?? Date.now())}` : date(v.created)}</small><div class="actions">${captureButton(v, "放進選集")}${!data.evidence ? (v.status === "pending" ? action("keep", "先保留", v.id) + action("dismiss", "略過", v.id) : action("restore", "回到待整理", v.id)) : ""}</div></div></article>`).join("") || '<p class="empty">這裡還沒有內容。<a href="/dashboard.html#history">從瀏覽歷史挑選</a>，或直接加入連結。</p>'}${pager(data.offset, data.total, kind, p)}</div>`;
  if (data.detail) {
    const d = data.detail,
      editable = d.role !== "reader",
      owner = d.role === "owner";
    return `<div data-workspace><a href="/#collections">← 所有選集</a><div class="workspace-intro"><small>${owner ? "我的選集" : esc(d.owner) + " 的選集"} · ${d.visibility === "friends" ? "朋友可見" : "私人／指定共同編輯者可見"}</small><h1>${esc(d.title)}</h1><p class="notes">${esc(d.description)}</p><p>${d.tags.map((t: string) => `<span class="tag">${esc(t)}</span>`).join("")}</p><div class="actions">${editable ? action("paste", "加入連結") + `<a href="/#inbox">從待整理挑選 →</a>` : ""}${owner ? action("settings", "編輯介紹與權限") + action("share", "預覽與分享") + action("archive", "封存選集") : d.role === "editor" ? action("leave", "退出共同編輯") : ""}</div></div><p>${d.items.length} 個連結${editable ? " · 用上移／下移安排閱讀順序" : ""}</p>${d.items.map((v: any, i: number) => `<article class="workspace-item"><span class="item-number">${i + 1}</span><div><h2><a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">${esc(v.title)}</a></h2><p class="item-url">${esc(v.url)}</p><p class="notes">${esc(v.note || "尚未寫下推薦理由。")}</p><div class="actions">${editable ? action("edit-item", "寫推薦理由", v.id) + action("up", "上移", v.id, i === 0 ? "disabled" : "") + action("down", "下移", v.id, i === d.items.length - 1 ? "disabled" : "") + action("remove-item", "移出選集", v.id) : captureButton(v, "留到我的整理")}</div></div></article>`).join("") || '<p class="empty">從歷史、洞察或待整理挑選頁面，放進這份選集。</p>'}${
      owner
        ? `<section class="workspace-section"><h2>一起整理</h2><p>指定朋友能查看、加入、編排連結及修改推薦理由；只有你能發布分享快照。</p>${d.members.map((m: any) => `<div class="workspace-row"><span>${esc(m.name)} · @${esc(m.handle)}</span>${action("remove-member", "取消共同編輯", m.id)}</div>`).join("")}<form data-workspace-form="member"><label>邀請朋友<select name="account" required><option value="">選擇已接受的朋友</option>${data.friends
            .filter((f: any) => !d.members.some((m: any) => m.id === f.id))
            .map((f: any) => `<option value="${f.id}">${esc(f.name)}</option>`)
            .join(
              "",
            )}</select></label><button>允許共同編輯</button></form><a href="/community.html#friends">管理朋友 →</a></section><section class="workspace-section"><h2>已發布的分享</h2><p>每個連結保留發布當下的內容。修改選集或改回私人不會更新舊快照，可在此撤銷。</p>${d.shares.map((s: any) => `<div class="workspace-row"><span>${date(s.created)} 發布 · ${date(s.expires)} 到期</span>${action("revoke", "撤銷連結", s.id)}</div>`).join("") || "<p>尚未建立分享連結。</p>"}</section>`
        : ""
    }</div>`;
  }
  return `<div data-workspace><div class="heading"><h1>主題選集</h1>${action("create", "建立主題選集")}</div><p>把連結串成一份有脈絡的閱讀清單。</p><nav class="workspace-tabs" aria-label="選集來源"><a href="/#collections" ${!["friends", "archived"].includes(p.get("audience") ?? "") ? 'aria-current="page"' : ""}>我的與共同編輯</a><a href="/?audience=friends#collections" ${p.get("audience") === "friends" ? 'aria-current="page"' : ""}>朋友分享</a><a href="/?audience=archived#collections" ${p.get("audience") === "archived" ? 'aria-current="page"' : ""}>已封存</a></nav>${search("主題、介紹或標籤")}<div class="workspace-grid">${data.items.map(card).join("") || '<p class="empty">還沒有符合的選集。先從你關心的主題挑幾個連結。</p>'}</div>${pager(data.offset, data.total, kind, p)}</div>`;
}
export function installWorkspace(
  root: HTMLElement,
  api: Api,
  reload: () => Promise<void>,
  current: () => any,
) {
  const refresh = async () => {
    await reload();
  };
  const run = async (job: () => Promise<void>) => {
    try {
      await job();
    } catch (e) {
      announce(errorMessage(e), true);
    }
  };
  function collectionEditor(d?: any) {
    const id = d?.id ?? crypto.randomUUID();
    const dialog = modal(
      d ? "編輯選集" : "建立主題選集",
      `<form><label>選集名稱<input name="title" required maxlength="200" value="${esc(d?.title)}"></label><label>介紹<textarea name="description" maxlength="10000">${esc(d?.description)}</textarea></label><label>標籤（以逗號分隔）<input name="tags" value="${esc(d?.tags.join(", ") ?? "")}"></label><label>誰可以看<select name="visibility"><option value="private">自己與指定共同編輯者</option><option value="friends" ${d?.visibility === "friends" ? "selected" : ""}>所有已接受的朋友</option></select></label><p>朋友可見時，會分享選集的標題、介紹、標籤、連結及推薦理由。</p><button class="primary">儲存選集</button></form>`,
    );
    dialog.querySelector("form")!.onsubmit = (e) => {
      e.preventDefault();
      void dialogJob(dialog, async () => {
        const f = Object.fromEntries(new FormData(e.target as HTMLFormElement));
        await api(prefix + id, "PUT", {
          ...f,
          tags: String(f.tags)
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean),
          revision: d?.revision,
        });
        clearDirty(dialog);
        dialog.close();
        location.href = href("collections", { collection: id });
      });
    };
  }
  root.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    if (target.matches("[data-select-all]"))
      root
        .querySelectorAll<HTMLInputElement>("[data-pick]")
        .forEach((el) => (el.checked = target.checked));
    const count = root.querySelector("[data-selection-count]");
    if (count)
      count.textContent = `已選 ${root.querySelectorAll("[data-pick]:checked").length} 筆`;
  });
  root.addEventListener("submit", (e) => {
    const form = e.target as HTMLFormElement;
    if (!form.dataset.workspaceForm) return;
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(form)),
      data = current(),
      d = data.detail;
    void run(async () => {
      if (form.dataset.workspaceForm === "search") {
        const u = new URL(location.href);
        u.searchParams.set("q", String(fields.q));
        u.searchParams.delete("offset");
        location.href = u.href;
      }
      if (form.dataset.workspaceForm === "member") {
        await api(prefix + d.id + "/members/" + fields.account, "PUT");
        clearDirty(form);
        await refresh();
        announce("已允許這位朋友共同編輯。");
      }
    });
  });
  root.addEventListener("click", (event) => {
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-ws]",
    );
    if (!b) return;
    const name = b.dataset.ws,
      id = b.dataset.id,
      data = current(),
      d = data.detail;
    void run(async () => {
      if (name === "retry") {
        await refresh();
        return;
      }
      if (name === "create" || name === "settings") {
        collectionEditor(name === "settings" ? d : undefined);
        return;
      }
      if (name === "collect-selected") {
        const picks = [
          ...root.querySelectorAll<HTMLInputElement>("[data-pick]:checked"),
        ].map((el) => {
          const v = data.items[Number(el.dataset.pick)];
          return {
            url: v.url,
            title: (v.title || v.url).slice(0, 500),
            note: v.note ?? "",
          };
        });
        await chooseDestination(
          api,
          picks,
          refresh,
          new URL(location.href).searchParams.get("topicName") ?? "",
        );
        return;
      }
      if (name === "paste") {
        const dialog = modal(
          "加入連結",
          `<form><label>網址<input name="url" type="url" required maxlength="8000"></label><label>標題<input name="title" required maxlength="500"></label><label>推薦理由（選填）<textarea name="note" maxlength="10000"></textarea></label><p>${d ? `加入「${esc(d.title)}」，可見範圍與這份選集相同。` : "先加入自己的待整理清單。"}</p><button class="primary">加入</button></form>`,
        );
        dialog.querySelector("form")!.onsubmit = (e) => {
          e.preventDefault();
          void dialogJob(dialog, async () => {
            const item = Object.fromEntries(
              new FormData(e.target as HTMLFormElement),
            );
            const result = await api(
              d ? prefix + d.id + "/items" : "/api/curation/capture",
              "POST",
              { items: [item] },
            );
            if (result.rejected) throw Error(result.rejections[0].reason);
            clearDirty(dialog);
            dialog.close();
            await refresh();
            announce(
              result.inserted
                ? "連結已加入。"
                : "這個連結已存在，沒有重複加入。",
            );
          });
        };
        return;
      }
      if (["keep", "dismiss", "restore"].includes(name!)) {
        const item = data.items.find((v: any) => v.id === id),
          before = item.status;
        await api("/api/curation/inbox/" + id, "PATCH", {
          status:
            name === "keep"
              ? "kept"
              : name === "dismiss"
                ? "dismissed"
                : "pending",
        });
        await refresh();
        announce(name === "dismiss" ? "已略過。" : "整理狀態已更新。", false, {
          label: "復原",
          run: async () => {
            await api("/api/curation/inbox/" + id, "PATCH", { status: before });
            await refresh();
          },
        });
        return;
      }
      if (name === "edit-item") {
        const item = d.items.find((v: any) => v.id === id);
        const dialog = modal(
          "寫下推薦理由",
          `<form><label>標題<input name="title" maxlength="500" required value="${esc(item.title)}"></label><label>為什麼值得看<textarea name="note" maxlength="10000">${esc(item.note)}</textarea></label><button>儲存推薦理由</button></form>`,
        );
        dialog.querySelector("form")!.onsubmit = (e) => {
          e.preventDefault();
          void dialogJob(dialog, async () => {
            await api(prefix + d.id + "/items/" + id, "PATCH", {
              ...Object.fromEntries(new FormData(e.target as HTMLFormElement)),
              revision: d.revision,
            });
            clearDirty(dialog);
            dialog.close();
            await refresh();
          });
        };
        return;
      }
      if (name === "up" || name === "down") {
        const ids = d.items.map((v: any) => v.id),
          index = ids.indexOf(id),
          next = index + (name === "up" ? -1 : 1);
        [ids[index], ids[next]] = [ids[next], ids[index]];
        await api(prefix + d.id + "/order", "POST", {
          ids,
          revision: d.revision,
        });
        await refresh();
        return;
      }
      if (name === "remove-item") {
        if (
          !(await confirmAction(
            "移出選集？",
            "原始瀏覽紀錄與待整理清單仍保留。已發布的快照也不會改變。",
            "移出",
          ))
        )
          return;
        await api(
          prefix + d.id + "/items/" + id + "?revision=" + d.revision,
          "DELETE",
        );
        await refresh();
        return;
      }
      if (name === "remove-member" || name === "leave") {
        if (
          !(await confirmAction(
            name === "leave" ? "退出共同編輯？" : "取消共同編輯？",
            "已加入的內容仍會留在選集裡。朋友可見的選集仍能被朋友閱讀。",
            "確認",
          ))
        )
          return;
        const account =
          name === "leave" ? (await api("/api/community/me")).id : id;
        await api(prefix + d.id + "/members/" + account, "DELETE");
        if (name === "leave") location.href = "/#collections";
        else await refresh();
        return;
      }
      if (name === "archive") {
        if (
          !(await confirmAction(
            "封存這份選集？",
            "分享連結與共同編輯權限會撤銷，內容仍保留。可從「已封存」復原為私人選集。",
            "封存選集",
          ))
        )
          return;
        await api(prefix + d.id + "?revision=" + d.revision, "DELETE");
        location.href = href("collections");
        return;
      }
      if (name === "restore-collection") {
        await api(prefix + id + "/restore", "POST");
        await refresh();
        announce("已復原為私人選集。");
        return;
      }
      if (name === "revoke") {
        if (
          !(await confirmAction(
            "撤銷這份分享？",
            "舊連結會立即失效；選集本身仍保留。",
            "撤銷連結",
          ))
        )
          return;
        await api(prefix + d.id + "/shares/" + id, "DELETE");
        await refresh();
        return;
      }
      if (name === "share") {
        const dialog = modal(
          "預覽與分享",
          `<p>持有連結的人能看到下列內容。這份快照不會隨之後的編輯更新；可隨時撤銷。</p><section class="share-preview"><h3>${esc(d.title)}</h3><p>${esc(d.description)}</p><p>${d.tags.map(esc).join(" · ")}</p><ol>${d.items.map((v: any) => `<li><strong>${esc(v.title)}</strong><p class="item-url">${esc(v.url)}</p><p>${esc(v.note)}</p></li>`).join("")}</ol></section><form><label>連結有效期<select name="days"><option value="1">1 天</option><option value="7" selected>7 天</option><option value="30">30 天</option></select></label><button ${!d.items.length ? "disabled" : ""}>建立分享連結</button></form>`,
        );
        dialog.querySelector("form")!.onsubmit = (e) => {
          e.preventDefault();
          void dialogJob(dialog, async () => {
            const result = await api(prefix + d.id + "/share", "POST", {
              days: Number(
                new FormData(e.target as HTMLFormElement).get("days"),
              ),
              revision: d.revision,
            });
            clearDirty(dialog);
            const f = dialog.querySelector("form")!;
            f.innerHTML = `<label>分享連結<input readonly value="${esc(location.origin + result.path)}"></label><button type="button" data-copy>複製連結</button><a href="${esc(result.path)}" target="_blank" rel="noopener noreferrer">開啟分享頁 ↗</a><p>請保存此連結，關閉後不再顯示完整網址。</p>`;
            f.querySelector<HTMLButtonElement>("[data-copy]")!.onclick = () =>
              void dialogJob(dialog, async () => {
                await navigator.clipboard.writeText(
                  location.origin + result.path,
                );
                announce("已複製連結。");
              });
            await refresh();
          });
        };
        return;
      }
    });
  });
}
