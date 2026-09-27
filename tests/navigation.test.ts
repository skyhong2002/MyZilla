import test from "node:test";
import assert from "node:assert/strict";
import { readNavigation, navigationUrl } from "../src/ui/navigation.ts";

test("dashboard links retain view, period, metric, query and page, excluding secrets", () => {
  const url = new URL(
    "https://example.org/?token=secret&range=30&metric=milliseconds&q=歷史+內容&offset=200#history",
  );
  const state = readNavigation(url);
  assert.deepEqual(state, {
    view: "history",
    days: 30,
    metric: "milliseconds",
    query: "歷史 內容",
    offset: 200,
  });
  const link = navigationUrl(url, { ...state, view: "insights" });
  assert.ok(!link.includes("secret"));
  assert.ok(!link.includes("token"));
  assert.deepEqual(readNavigation(new URL(link, url)), {
    ...state,
    view: "insights",
  });
});
test("malformed navigation falls back safely, with extension setup as its initial view", () => {
  assert.deepEqual(
    readNavigation(
      new URL(
        "https://example.org/?range=-1&offset=NaN&metric=invalid#constructor",
      ),
    ),
    { view: "overview", days: 0, metric: "visits", query: "", offset: 0 },
  );
  assert.equal(
    readNavigation(new URL("chrome-extension://fixture/index.html"), true).view,
    "settings",
  );
});
