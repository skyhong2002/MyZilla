import type { Registry } from "../accounts/registry";
export const categories = {
  technology: "科技與開發",
  learning: "知識與學習",
  culture: "文化與創作",
  entertainment: "影音與娛樂",
  living: "生活與旅遊",
  sports: "運動",
  shopping: "購物",
  other: "未分類",
} as const;
export type Category = keyof typeof categories;
const rules: [Category, string[]][] = [
  [
    "technology",
    [
      "github.com",
      "stackoverflow.com",
      "developer.mozilla.org",
      "openai.com",
      "chatgpt.com",
      "huggingface.co",
      "gitlab.com",
    ],
  ],
  [
    "learning",
    [
      "wikipedia.org",
      "arxiv.org",
      "coursera.org",
      "edx.org",
      "khanacademy.org",
    ],
  ],
  [
    "culture",
    ["behance.net", "dribbble.com", "figma.com", "canva.com", "medium.com"],
  ],
  [
    "entertainment",
    [
      "youtube.com",
      "youtu.be",
      "netflix.com",
      "twitch.tv",
      "spotify.com",
      "bilibili.com",
      "steampowered.com",
    ],
  ],
  [
    "living",
    ["booking.com", "airbnb.com", "tripadvisor.com", "allrecipes.com"],
  ],
  ["sports", ["espn.com", "nba.com", "strava.com"]],
  [
    "shopping",
    ["amazon.com", "shopee.tw", "pchome.com.tw", "momoshop.com.tw", "ebay.com"],
  ],
];
export function classify(domain: string): Category {
  return (
    rules.find(([, hosts]) =>
      hosts.some((host) => domain === host || domain.endsWith(`.${host}`)),
    )?.[0] ?? "other"
  );
}
export function analyze(registry: Registry, id: string) {
  const report = registry
    .repository(id)
    .report(-8_640_000_000_000_000, Date.now());
  const overrides = new Map(
    registry.db
      .prepare("SELECT domain,category FROM category_overrides WHERE account=?")
      .all(id)
      .map((row) => [row.domain, row.category as Category]),
  );
  const totals = Object.fromEntries(
    Object.keys(categories).map((key) => [key, 0]),
  ) as Record<Category, number>;
  const sites = report.sites
    .map((row) => {
      const domain = row.domain as string;
      const category = overrides.get(domain) ?? classify(domain);
      const visits = Number(row.visits);
      totals[category] += visits;
      return { domain, category, visits, customized: overrides.has(domain) };
    })
    .sort((a, b) => b.visits - a.visits);
  const total = Number(report.visitCount);
  return {
    total,
    classified: total - totals.other,
    categories: Object.entries(categories).map(([id, label]) => ({
      id: id as Category,
      label,
      visits: totals[id as Category],
      percent: total
        ? Math.round((totals[id as Category] / total) * 1000) / 10
        : 0,
    })),
    sites,
    generatedAt: Date.now(),
  };
}
export function summary(profile: ReturnType<typeof analyze>) {
  return {
    total: profile.total,
    classified: profile.classified,
    categories: profile.categories,
    generatedAt: profile.generatedAt,
  };
}
export function compare(
  a: ReturnType<typeof analyze>,
  b: ReturnType<typeof analyze>,
) {
  const left = a.categories.filter((row) => row.id !== "other");
  const right = b.categories.filter((row) => row.id !== "other");
  const dot = left.reduce(
    (sum, row, i) => sum + row.visits * right[i].visits,
    0,
  );
  const norm = Math.sqrt(
    left.reduce((sum, row) => sum + row.visits ** 2, 0) *
      right.reduce((sum, row) => sum + row.visits ** 2, 0),
  );
  return {
    score: norm ? Math.round((dot / norm) * 100) : null,
    shared: left
      .filter((row, i) => row.visits > 0 && right[i].visits > 0)
      .map((row) => row.label),
    method: "已分類造訪次數的餘弦相似度；排除未分類，不代表關係品質或人格。",
  };
}
