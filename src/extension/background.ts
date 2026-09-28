import browser from "webextension-polyfill";
import {
  closeInterval,
  type Settings,
  type BrowserEvent,
} from "../shared/events";
import { webUrl } from "../shared/model";
import {
  putEvents,
  pending,
  acknowledge,
  getCapture,
  saveCapture,
  counts,
} from "./db";
let work: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = work.then(job);
  work = next.catch((error) => console.error("MyZilla:", error.message));
  return next;
}
async function settings(): Promise<Settings> {
  const { config } = await browser.storage.local.get("config");
  if (config) return config as Settings;
  const value: Settings = {
    server: "https://myzilla.observe.tw",
    token: "",
    enabled: false,
    deviceId: crypto.randomUUID(),
    browser: "Chromium / Firefox",
    profile: "Default",
    device: "My computer",
  };
  await browser.storage.local.set({ config: value });
  return value;
}
async function observe(now: number, idle = false) {
  const config = await settings();
  const previous = await getCapture();
  const state = await browser.idle.queryState(60);
  const interval = config.enabled
    ? closeInterval(previous, now, idle || state !== "active")
    : null;
  let capture;
  if (config.enabled && state === "active") {
    const window = await browser.windows.getLastFocused();
    if (window.focused && window.id !== undefined) {
      const [tab] = await browser.tabs.query({
        active: true,
        windowId: window.id,
      });
      const url = tab?.url && webUrl(tab.url);
      if (url && tab.id !== undefined && !tab.incognito)
        capture = { url, tabId: tab.id, at: now };
    }
  }
  await saveCapture(capture, interval);
}
function scheduleObservation(idle = false) {
  const now = Date.now();
  void serial(() => observe(now, idle));
}
async function recordHistory(
  item: browser.History.HistoryItem,
  from: number,
  to: number,
) {
  const url = item.url;
  if (!url) return 0;
  const visits = await browser.history.getVisits({ url });
  const events: BrowserEvent[] = visits
    .filter(
      (v) =>
        v.visitTime !== undefined && v.visitTime >= from && v.visitTime < to,
    )
    .map((v) => ({
      kind: "visit",
      id: `visit:${v.visitId}`,
      sourceVisitId: String(v.visitId),
      url,
      title: item.title ?? url,
      visitedAt: Math.trunc(v.visitTime!),
      transition: v.transition,
    }));
  await putEvents(events);
  return events.length;
}
interface ImportJob {
  ranges: [number, number][];
  items: browser.History.HistoryItem[];
  index: number;
  processed: number;
  running: boolean;
}
let importing: Promise<void> | undefined;
async function startImport() {
  const existing = (await browser.storage.local.get("importJob")).importJob as
    ImportJob | undefined;
  if (existing?.running) return;
  const job: ImportJob = {
    ranges: [[0, Date.now()]],
    items: [],
    index: 0,
    processed: 0,
    running: true,
  };
  await browser.storage.local.set({
    importJob: job,
    importStatus: "全量匯入已排程，進度會自動保存。",
  });
}
function importStep() {
  return (importing ??= performImportStep().finally(() => {
    importing = undefined;
  }));
}
async function performImportStep() {
  const job = (await browser.storage.local.get("importJob")).importJob as
    ImportJob | undefined;
  if (!job?.running) return;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (job.index < job.items.length) {
      const item = job.items[job.index];
      // All visits for each discovered URL, including non-HTTP history entries.
      if (item.url) {
        const visits = await browser.history.getVisits({ url: item.url });
        await putEvents(
          visits.map((v) => ({
            kind: "visit",
            id: `visit:${v.visitId}`,
            sourceVisitId: String(v.visitId),
            url: item.url!,
            title: item.title ?? "",
            visitedAt: Math.trunc(v.visitTime ?? 0),
            transition: String(v.transition ?? "unknown"),
          })),
        );
        job.processed += visits.length;
      }
      job.index++;
    } else if (job.ranges.length) {
      const [rawStart, end] = job.ranges[job.ranges.length - 1];
      // Firefox history.search only accepts dates at or after the Unix epoch.
      const start = Math.max(0, rawStart);
      let items = await browser.history.search({
        text: "",
        startTime: start,
        endTime: end,
        maxResults: 1000,
      });
      if (items.length >= 1000 && end - start > 1) {
        const middle = Math.floor((start + end) / 2);
        job.ranges.pop();
        job.ranges.push([start, middle], [middle, end]);
      } else {
        // A timestamp tie cannot be split further; request every entry in that bucket.
        if (items.length >= 1000)
          items = await browser.history.search({
            text: "",
            startTime: start,
            endTime: end,
            maxResults: 2147483647,
          });
        job.ranges.pop();
        job.items = items;
        job.index = 0;
      }
    } else {
      job.running = false;
      break;
    }
    await browser.storage.local.set({
      importJob: job,
      importStatus: `${job.running ? "全量匯入中" : "全量匯入完成"} · 已處理 ${job.processed.toLocaleString()} 筆（重複事件自動去重）`,
    });
  }
  await browser.storage.local.set({
    importJob: job,
    importStatus: `${job.running ? "全量匯入中" : "全量匯入完成"} · 已處理 ${job.processed.toLocaleString()} 筆（重複事件自動去重）`,
  });
}

let syncing: Promise<void> | undefined;
function sync() {
  return (syncing ??= performSync().finally(() => {
    syncing = undefined;
  }));
}
async function performSync() {
  const config = await settings();
  if (!config.server || !config.token)
    throw new Error("請先設定伺服器與存取金鑰");
  try {
    for (let batch = 0; batch < 20; batch++) {
      const records = await pending();
      if (!records.length) break;
      const response = await fetch(`${config.server}/api/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceId: config.deviceId,
          source: {
            browser: config.browser,
            profile: config.profile,
            device: config.device,
            method: "extension",
          },
          events: records.map((r) => r.event),
        }),
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
      if (!response.ok) throw new Error(`同步失敗（HTTP ${response.status}）`);
      const payload = await response.json();
      if (payload.accepted !== records.length)
        throw new Error(
          `伺服器拒收 ${payload.rejected ?? "?"} 筆，已保留待同步資料：${payload.rejections?.[0]?.reason ?? "回覆不符合預期"}`,
        );
      await acknowledge(records);
    }
    await browser.storage.local.set({
      syncStatus: { at: Date.now(), error: "" },
    });
  } catch (error) {
    await browser.storage.local.set({
      syncStatus: {
        error: error instanceof Error ? error.message : "無法連線",
      },
    });
    throw error;
  }
}
async function setup() {
  browser.idle.setDetectionInterval(60);
  const storage = browser.storage.local as typeof browser.storage.local & {
    setAccessLevel?: (options: { accessLevel: string }) => Promise<void>;
  };
  if (storage.setAccessLevel)
    await storage.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await browser.alarms.create("observe", { periodInMinutes: 0.5 });
  await browser.alarms.create("sync", { periodInMinutes: 1 });
  await settings();
}
browser.runtime.onInstalled.addListener(() => {
  void serial(setup);
});
browser.runtime.onStartup.addListener(() => {
  void serial(async () => {
    await saveCapture(undefined, null);
    await setup();
    await observe(Date.now());
  });
});
browser.action.onClicked.addListener(() => {
  void browser.tabs.create({ url: browser.runtime.getURL("index.html") });
});
browser.tabs.onActivated.addListener(() => scheduleObservation());
browser.tabs.onUpdated.addListener((_id, change) => {
  if (change.url || change.status === "complete") scheduleObservation();
});
browser.tabs.onRemoved.addListener(() => scheduleObservation());
browser.windows.onFocusChanged.addListener(() => scheduleObservation());
browser.idle.onStateChanged.addListener((state) =>
  scheduleObservation(state !== "active"),
);
browser.history.onVisited.addListener((item) => {
  const now = Date.now();
  void serial(async () => {
    if ((await settings()).enabled)
      await recordHistory(item, now - 60000, now + 1000);
  });
});
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "observe") {
    scheduleObservation();
    void importStep().catch((error) => {
      void browser.storage.local.set({
        importStatus: `匯入暫停重試：${error.message}`,
      });
    });
  }
  if (alarm.name === "sync") void sync().catch(() => {});
});
browser.runtime.onMessage.addListener(
  (input: unknown, sender: browser.Runtime.MessageSender) => {
    const message = input as {
      type: string;
      server: string;
      token: string;
      browser: string;
      profile: string;
      device: string;
    };
    if (
      sender.id !== browser.runtime.id ||
      sender.url?.split(/[?#]/)[0] !== browser.runtime.getURL("index.html")
    )
      return;
    const execute = async () => {
      if (message.type === "collect-tabs") {
        const tabs = await browser.tabs.query({});
        const items = [];
        let excluded = 0;
        for (const tab of tabs) {
          const url = tab.url && webUrl(tab.url);
          if (tab.incognito || !url) {
            excluded++;
            continue;
          }
          let group = "未分組";
          const groupId = (tab as unknown as { groupId?: number }).groupId;
          if (
            typeof groupId === "number" &&
            groupId >= 0 &&
            typeof chrome !== "undefined" &&
            chrome.tabGroups?.get
          ) {
            try {
              const g = await chrome.tabGroups.get(groupId);
              group = `${g.title || "未命名群組"}${g.shared ? "（共享）" : ""} · ${groupId}`;
            } catch {
              group = "分頁群組";
            }
          }
          items.push({ url, title: (tab.title || url).slice(0, 500), group });
        }
        return { items, excluded };
      }
      if (message.type === "status")
        return {
          config: await serial(settings),
          ...(await counts()),
          ...(await browser.storage.local.get(["syncStatus", "importStatus"])),
        };
      if (message.type === "save")
        return serial(async () => {
          const current = await settings();
          const url = new URL(message.server);
          if (
            (url.protocol !== "https:" &&
              !(
                url.protocol === "http:" &&
                ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
              )) ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            url.pathname !== "/"
          )
            throw new Error(
              "請使用 HTTPS 網址，或本機 http://localhost:18140（不含路徑）",
            );
          if (typeof message.token !== "string" || message.token.length < 32)
            throw new Error("存取金鑰至少需 32 個字元");
          const server = url.origin;
          if (
            !(await browser.permissions.contains({
              origins: [`${url.protocol}//${url.hostname}/*`],
            }))
          )
            throw new Error("尚未授權連線至這個伺服器");
          // Keep the outbox's destination stable: do not silently upload old data to another host.
          if (current.token && current.server !== server)
            throw new Error(
              "此版本不支援切換已設定的伺服器；請使用新的瀏覽器設定檔",
            );
          for (const key of ["browser", "profile", "device"] as const)
            if (
              typeof message[key] !== "string" ||
              !message[key].trim() ||
              message[key].length > 200
            )
              throw new Error(
                "請填寫瀏覽器、設定檔與裝置名稱（最多 200 字元）",
              );
          await browser.storage.local.set({
            config: {
              ...current,
              server,
              token: message.token,
              browser: message.browser.trim(),
              profile: message.profile.trim(),
              device: message.device.trim(),
            },
          });
        });
      if (message.type === "toggle")
        return serial(async () => {
          const config = await settings();
          await observe(Date.now());
          await browser.storage.local.set({
            config: { ...config, enabled: !config.enabled },
          });
          await saveCapture(undefined, null);
          await observe(Date.now());
        });
      if (message.type === "import") {
        await startImport();
        void importStep().catch((error) => {
          void browser.storage.local.set({
            importStatus: `匯入暫停重試：${error.message}`,
          });
        });
        return;
      }
      if (message.type === "sync") {
        await sync();
        return;
      }
      throw new Error("Unknown action");
    };
    return execute()
      .then((data) => ({ ok: true, data }))
      .catch((error) => ({ ok: false, error: error.message }));
  },
);
