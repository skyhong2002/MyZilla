import test from "node:test";
import assert from "node:assert/strict";
import { summarize, webUrl } from "../src/shared/model.ts";

test("preserves meaningful URL parameters and rejects unsafe links", () => {
  assert.equal(
    webUrl("https://example.org/?page=2#section"),
    "https://example.org/?page=2#section",
  );
  assert.equal(webUrl("javascript:alert(1)"), null);
  assert.equal(webUrl("https://user:secret@example.org"), null);
  assert.equal(webUrl("chrome://settings"), null);
});

test("clips intervals to the requested period and never invents time for historical visits", () => {
  const result = summarize(
    [
      {
        id: "1",
        url: "https://history.org",
        title: "",
        visitedAt: 150,
        transition: "link",
      },
      {
        id: "2",
        url: "https://outside.org",
        title: "",
        visitedAt: 200,
        transition: "link",
      },
    ],
    [
      { id: "a", url: "https://example.org/a", startAt: 50, endAt: 150 },
      { id: "b", url: "https://example.org/b", startAt: 180, endAt: 250 },
    ],
    100,
    200,
  );
  assert.deepEqual(result, [
    { domain: "example.org", visits: 0, milliseconds: 70 },
    { domain: "history.org", visits: 1, milliseconds: 0 },
  ]);
});
