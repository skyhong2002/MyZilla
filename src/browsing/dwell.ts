import { webUrl, domain } from "../shared/model";
import type { Row } from "../insights/analyze";
export function estimateDwell(
  rows: Row[],
  from: number,
  to: number,
  threshold: number,
) {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = JSON.stringify([
      r.deviceId,
      r.source.browser,
      r.source.profile,
    ]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const pages = new Map<
    string,
    {
      url: string;
      title: string;
      domain: string;
      milliseconds: number;
      intervals: number;
      last: number;
    }
  >();
  let intervals = 0,
    duplicates = 0,
    ambiguous = 0,
    longGaps = 0,
    lastVisits = 0,
    nonWeb = 0;
  for (const group of groups.values()) {
    group.sort((a, b) => a.visitedAt - b.visitedAt || a.id.localeCompare(b.id));
    const timestamps: { at: number; rows: Row[] }[] = [];
    for (const r of group) {
      let bucket = timestamps.at(-1);
      if (!bucket || bucket.at !== r.visitedAt) {
        bucket = { at: r.visitedAt, rows: [] };
        timestamps.push(bucket);
      }
      if (bucket.rows.some((v) => v.url === r.url)) {
        if (r.visitedAt >= from && r.visitedAt < to) duplicates++;
      } else bucket.rows.push(r);
    }
    for (let i = 0; i < timestamps.length; i++) {
      const current = timestamps[i],
        next = timestamps[i + 1];
      // Keep neighbors outside the requested period, then clip only the accepted interval.
      if (current.at >= to || (next && next.at <= from)) continue;
      const inside = current.at >= from && current.at < to;
      if (!next) {
        if (inside) lastVisits += current.rows.length;
        continue;
      }
      if (current.rows.length !== 1) {
        if (inside) ambiguous += current.rows.length;
        continue;
      }
      const gap = next.at - current.at;
      if (gap <= 0 || gap >= threshold * 1000) {
        if (inside) longGaps++;
        continue;
      }
      const r = current.rows[0],
        url = webUrl(r.url);
      if (!url) {
        if (inside) nonWeb++;
        continue;
      }
      const ms = Math.max(
        0,
        Math.min(to, next.at) - Math.max(from, current.at),
      );
      if (!ms) continue;
      let page = pages.get(url);
      if (!page) {
        page = {
          url,
          title: r.title,
          domain: domain(url),
          milliseconds: 0,
          intervals: 0,
          last: r.visitedAt,
        };
        pages.set(url, page);
      }
      page.milliseconds += ms;
      page.intervals++;
      if (r.visitedAt >= page.last) {
        page.title = r.title;
        page.last = r.visitedAt;
      }
      intervals++;
    }
  }
  const list = [...pages.values()].sort(
    (a, b) => b.milliseconds - a.milliseconds || a.url.localeCompare(b.url),
  );
  return {
    from,
    to,
    threshold,
    totalMilliseconds: list.reduce((n, p) => n + p.milliseconds, 0),
    intervals,
    pages: list,
    excluded: { duplicates, ambiguous, longGaps, lastVisits, nonWeb },
  };
}
