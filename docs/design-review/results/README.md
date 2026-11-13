# Redesign review results

Ten blind A/B/C rounds, 2026-11-13. Every round used a new claude-proxy Claude Opus 5.5 session at effort high, the same `brief.md` (SHA-256 `9fe8f7b6…`, unchanged after round 1), the same fixed baseline set (`main` at `5d8ab8c`) and the same reference set (Are.na explore and channel, Raindrop.io home, linkding demo). Only the new set was recaptured each round. All MyZilla screenshots use synthetic data from `tools/seed.mjs`; no real browsing history was read.

The reviewer gives one overall score and 12 category scores. "Mean" is the arithmetic mean of the 12 category scores.

| Round | Baseline | New | Reference | New − baseline | Baseline mean | New mean | Reference mean | New − baseline (mean) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| r1 | 5.5 | 7.5 | 7 | +2 | 5.75 | 7.46 | 7.08 | +1.71 |
| r2 | 5.5 | 8 | 7 | +2.5 | 5.38 | 8.04 | 6.79 | +2.67 |
| r3 | 5 | 7.5 | 7 | +2.5 | 5.25 | 7.46 | 6.88 | +2.21 |
| r4 | 5 | 8 | 7.5 | +3 | 5.21 | 7.83 | 7.17 | +2.62 |
| r5 | 5.5 | 8 | 7 | +2.5 | 5.58 | 7.96 | 6.88 | +2.38 |
| r6 | 5.5 | 7.5 | 6.5 | +2 | 5.75 | 7.50 | 6.46 | +1.75 |
| r7 | 5 | 8 | 7 | +3 | 4.88 | 8.00 | 6.96 | +3.12 |
| r8 | 5.5 | 8 | 6.5 | +2.5 | 5.50 | 8.00 | 6.58 | +2.50 |
| r9 | 5 | 8.5 | 7 | +3.5 | 4.88 | 8.50 | 6.83 | +3.62 |
| r10 | 5.5 | 8.5 | 6.5 | +3 | 5.62 | 8.29 | 6.42 | +2.67 |

The new set never reached 9, so the run stopped after the phase-1 limit of ten rounds and the council phase did not start.

## Inflation and drift

- **The fixed sets moved.** The baseline images were byte-identical in every round, yet the baseline mean ranged from 4.88 to 5.75 (spread 0.87) and the overall from 5 to 5.5. The reference ranged from 6.42 to 7.17. Score changes smaller than about ±0.5 are judge noise, not measured improvement.
- **Part of the widening gap is the baseline sinking.** New − baseline grew from +1.71 (r1) to +2.67–3.62 (r9–r10), but in r7 and r9 the baseline mean also dropped to 4.88, its lowest. Comparing the new set with the reference is steadier: it went from +0.38 (r1) to +1.67–1.87 (r9–r10).
- **The new set's own score was not monotonic.** It fell from 8.04 (r2) to 7.46 (r3) with only improvements in between, and fell again in r6. The r6 drop was real: a round-5 rule overrode the phone help layout and was fixed in round 7.
- **The rounds were blind to labels but not to identity.** From r4 on, reviewers named the baseline by its known defects (for example "the dark screenshots have the same md5 as the light ones"). They knew which set was old even without knowing its label.
- **Repeated asks.** Bookmark density was raised in r2, r4, r6, r7 and r8 and changed each time. History row actions were hidden on hover in r3 and called hard to discover in r7, so they went back to always visible. Fixing one reviewer's complaint sometimes created the next one's.

After r10, three small issues it raised were fixed without another review round: the 今天 range button had picked up the home icon (a regression from round 8), the import confirmation showed "processing" behind it, and desktop icon buttons grew to 40 px.

## Stylesheet consolidation

The hill climb left ten "Round N fixes" blocks at the end of `src/ui/app.css` that overrode earlier rules. After the last round they were folded into their component sections and the overridden rules deleted (3,162 → 2,988 lines; the 11 old stylesheets were 3,271 lines). All 88 states were recaptured and pixel-compared with a capture made just before: 85 are identical, three differ by 13–20 pixels, and `overview-loading` differs only in the phase of its shimmer animation.

## Before and after

The baseline is `main`; the "after" images are the round-10 set. Desktop crops are the top 1000 px at 1440 wide; mobile crops are the top of the 390 px view.

| | Before | After |
|---|---|---|
| Today (desktop) | ![](before-after/home-desktop-before.png) | ![](before-after/home-desktop-after.png) |
| Today, dark (desktop) | ![](before-after/home-dark-desktop-before.png) | ![](before-after/home-dark-desktop-after.png) |
| Signed out (desktop) | ![](before-after/entry-signed-out-desktop-before.png) | ![](before-after/entry-signed-out-desktop-after.png) |
| Bookmarks (desktop) | ![](before-after/bookmarks-desktop-before.png) | ![](before-after/bookmarks-desktop-after.png) |
| Browsing review (desktop) | ![](before-after/overview-desktop-before.png) | ![](before-after/overview-desktop-after.png) |
| Today (mobile) | ![](before-after/home-mobile-before.png) | ![](before-after/home-mobile-after.png) |
| Bookmarks (mobile) | ![](before-after/bookmarks-mobile-before.png) | ![](before-after/bookmarks-mobile-after.png) |

## Raw reviewer output

[r1](r1-opus-5-5.md) · [r2](r2-opus-5-5.md) · [r3](r3-opus-5-5.md) · [r4](r4-opus-5-5.md) · [r5](r5-opus-5-5.md) · [r6](r6-opus-5-5.md) · [r7](r7-opus-5-5.md) · [r8](r8-opus-5-5.md) · [r9](r9-opus-5-5.md) · [r10](r10-opus-5-5.md)

Each file records the date, brief hash, reviewer, the A/B/C mapping revealed after the review and the commit the new set came from.
