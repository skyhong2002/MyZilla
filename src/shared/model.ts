export interface Visit {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
  transition: string;
}

export interface AttentionInterval {
  id: string;
  url: string;
  startAt: number;
  endAt: number;
}

export interface InboxItem {
  url: string;
  title: string;
  addedAt: number;
}

// Preserve query strings and fragments: both can identify distinct resources.
export function webUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function domain(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

export interface SiteSummary {
  domain: string;
  visits: number;
  milliseconds: number;
}

export function summarize(
  visits: Visit[],
  intervals: AttentionInterval[],
  from: number,
  to: number,
): SiteSummary[] {
  const sites = new Map<string, SiteSummary>();
  const site = (url: string) => {
    const name = domain(url);
    if (!sites.has(name))
      sites.set(name, { domain: name, visits: 0, milliseconds: 0 });
    return sites.get(name)!;
  };
  for (const visit of visits) {
    if (visit.visitedAt >= from && visit.visitedAt < to)
      site(visit.url).visits++;
  }
  for (const interval of intervals) {
    const duration = Math.max(
      0,
      Math.min(interval.endAt, to) - Math.max(interval.startAt, from),
    );
    if (duration > 0) site(interval.url).milliseconds += duration;
  }
  return [...sites.values()].sort(
    (a, b) => b.milliseconds - a.milliseconds || b.visits - a.visits,
  );
}
