import test from "node:test";
import assert from "node:assert/strict";
import { pageLabel, recentPages } from "../src/shared/page-label";

test("generic Facebook titles show only URL-supported types and identifiers", () => {
  for (const [url, kind] of [
    ["https://www.facebook.com/", "動態消息"],
    ["https://www.facebook.com/photo.php?fbid=123&access_token=SECRET", "相片"],
    ["https://www.facebook.com/reel/456", "短片（Reel）"],
    ["https://www.facebook.com/author/posts/789", "貼文"],
    ["https://www.facebook.com/groups/abc/posts/789", "貼文"],
    ["https://www.facebook.com/groups/abc", "社團頁面"],
    ["https://www.facebook.com/profile.php?id=42", "個人／專頁"],
    ["https://www.facebook.com/watch/?v=42", "影片"],
    ["https://www.facebook.com/friends", "頁面"],
  ]) {
    const result = pageLabel({ url, title: "(12) Facebook" });
    assert.equal(result.title, `Facebook · ${kind}`);
    assert.equal(result.specific, false);
    assert.match(result.detail, /未提供內容標題/);
    assert.ok(!result.detail.includes("SECRET"));
  }
  assert.match(
    pageLabel({
      url: "https://facebook.com/photo/?fbid=123",
      title: "Facebook",
    }).detail,
    /fbid=123/,
  );
});
test("descriptive titles are preserved; unsafe URLs and lookalike domains are not misclassified", () => {
  assert.equal(
    pageLabel({
      url: "https://facebook.com/a/posts/1",
      title: "海邊散步的一天 | Facebook",
    }).title,
    "海邊散步的一天 | Facebook",
  );
  assert.equal(
    pageLabel({ url: "https://notfacebook.com/a", title: "notfacebook.com" })
      .site,
    "notfacebook.com",
  );
  assert.equal(
    pageLabel({ url: "javascript:alert(1)", title: "Facebook" }).specific,
    false,
  );
  assert.equal(
    pageLabel({ url: "https://linkedin.com/", title: "LinkedIn" }).specific,
    false,
  );
  assert.equal(
    pageLabel({ url: "https://facebook.com/", title: "Alice messaged Bob" })
      .specific,
    false,
  );
});
test("recent cards prioritize identifiable content and group all unresolved visits without editing sources", () => {
  const visits = [
    {
      url: "https://facebook.com/photo/?fbid=1",
      title: "Facebook",
      visitedAt: 5,
    },
    {
      url: "https://facebook.com/photo/?fbid=1",
      title: "Facebook",
      visitedAt: 4,
    },
    { url: "https://facebook.com/reel/2", title: "Facebook", visitedAt: 3 },
    { url: "https://example.org/article", title: "值得讀的文章", visitedAt: 2 },
    { url: "https://example.org/article", title: "值得讀的文章", visitedAt: 1 },
  ];
  const snapshot = JSON.stringify(visits),
    result = recentPages(visits);
  assert.equal(result.pages.length, 1);
  assert.equal(result.groups[0].count, 3);
  assert.equal(result.groups[0].items.length, 2);
  assert.equal(result.groups[0].items[0].count, 2);
  assert.equal(result.groups[0].items[0].visitedAt, 5);
  assert.equal(JSON.stringify(visits), snapshot);
  const allGeneric = recentPages(visits.slice(0, 3));
  assert.equal(allGeneric.pages.length, 0);
  assert.equal(allGeneric.groups[0].count, 3);
});
