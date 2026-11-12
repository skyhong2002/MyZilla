// On phones the section rows scroll sideways; keep the current item in view.
export function revealCurrent(root: HTMLElement) {
  if (!matchMedia("(max-width: 860px)").matches) return;
  for (const row of root.querySelectorAll<HTMLElement>(
    ".rail-nav, .view-toolbar .page-nav, .insight-jumps, .workspace-tabs",
  )) {
    const current = row.querySelector<HTMLElement>(
      '[aria-current="page"], [aria-pressed="true"]',
    );
    if (!current) continue;
    const left = current.offsetLeft - (row.clientWidth - current.offsetWidth) / 2;
    row.scrollLeft = Math.max(0, left);
  }
}
