import { z } from "zod";
const time = z
  .number()
  .int()
  .min(-8_640_000_000_000_000)
  .max(8_640_000_000_000_000);
// Native import preserves every source URL, including internal/file/non-HTTP URLs.
const base = { id: z.string().min(1).max(500), url: z.string().max(1_000_000) };
export const sourceSchema = z.object({
  browser: z.string().min(1).max(200),
  profile: z.string().min(1).max(2000),
  device: z.string().min(1).max(500),
  method: z.enum(["native", "extension"]),
});
export const eventSchema = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("visit"),
    title: z.string().max(1_000_000),
    visitedAt: time,
    transition: z.string().max(100),
    sourceVisitId: z.string().max(200).optional(),
  }),
  z
    .object({
      ...base,
      kind: z.literal("attention"),
      startAt: time,
      endAt: time,
    })
    .refine(
      (v) => v.endAt > v.startAt && v.endAt - v.startAt <= 45_000,
      "Invalid attention interval",
    ),
]);
export const batchSchema = z.object({
  deviceId: z.uuid(),
  source: sourceSchema,
  events: z.array(z.unknown()).min(1).max(250),
});
export type BrowserEvent = z.infer<typeof eventSchema>;
export type Source = z.infer<typeof sourceSchema>;
export interface Settings {
  server: string;
  token: string;
  enabled: boolean;
  deviceId: string;
  browser: string;
  profile: string;
  device: string;
}
export interface Capture {
  url: string;
  tabId: number;
  at: number;
}
export function closeInterval(
  previous: Capture | undefined,
  now: number,
  idle = false,
): BrowserEvent | null {
  if (!previous || idle || now <= previous.at || now - previous.at > 45_000)
    return null;
  return {
    kind: "attention",
    id: crypto.randomUUID(),
    url: previous.url,
    startAt: previous.at,
    endAt: now,
  };
}
