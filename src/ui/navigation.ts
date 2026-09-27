export const viewLabels = {
  overview: "總覽",
  insights: "洞察",
  history: "歷史",
  recap: "回顧",
  settings: "匯入與設定",
} as const;
export type View = keyof typeof viewLabels;
export interface NavigationState {
  view: View;
  days: number;
  metric: "visits" | "milliseconds";
  query: string;
  offset: number;
}
export function readNavigation(url: URL, extension = false): NavigationState {
  const view = url.hash.slice(1);
  const days = Number(url.searchParams.get("range") ?? 0);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  return {
    view: Object.hasOwn(viewLabels, view)
      ? (view as View)
      : extension
        ? "settings"
        : "overview",
    days: [0, 1, 7, 30].includes(days) ? days : 0,
    metric:
      url.searchParams.get("metric") === "milliseconds"
        ? "milliseconds"
        : "visits",
    query: (url.searchParams.get("q") ?? "").slice(0, 2000),
    offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
  };
}
export function navigationUrl(current: URL, state: NavigationState) {
  const url = new URL(current);
  // Only view state belongs in links; credentials remain in the existing session store.
  url.search = "";
  if (state.days) url.searchParams.set("range", String(state.days));
  if (state.metric !== "visits") url.searchParams.set("metric", state.metric);
  if (state.query) url.searchParams.set("q", state.query);
  if (state.offset) url.searchParams.set("offset", String(state.offset));
  url.hash = state.view;
  return url.pathname + url.search + url.hash;
}
