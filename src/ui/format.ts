// Timestamps in the interface stop at minutes; seconds are noise for people.
export const minuteFormat: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};
// Show percent-encoded URLs (e.g. Chinese paths) in readable form; links keep the original.
export function displayUrl(url: string) {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}
