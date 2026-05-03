# PLAN.md
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- AGYEMAN ENTERPRISES — MANDATORY PRE-WORK PLAN                         -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

## APP:
Neuralia

## TASK:
Fix all silent catch blocks and console.error calls flagged by OO gate review; correct GATE7.txt product count to match live DB.

## IN SCOPE:
- src/lib/triage.ts
- src/lib/scraper.ts
- src/lib/notifier.ts
- src/app/api/learn/route.ts
- src/app/api/scrape/route.ts
- src/app/api/generate/route.ts
- GATE7.txt

## OUT OF SCOPE:
- Do NOT touch any other API routes
- Do NOT add new database tables or columns
- Do NOT change the authentication flow
- Do NOT refactor generator.ts, publisher.ts, or any other lib files
- Do NOT change Playwright tests or e2e specs
- Do NOT change tsconfig.json, next.config.ts, or package.json

## MUST DELIVER:
- [ ] Every bare `catch { }` in the 6 src files replaced with observable error handling (DB log write or typed result propagation)
- [ ] Every `console.error` call removed from production code paths
- [ ] GATE7.txt §A6 updated to reflect actual product count with evidence
- [ ] `npx tsc --noEmit` exits 0 after changes
- [ ] `npx playwright test` still passes 7/10 (3 skips are data-conditional, not failures)

## DATABASE CHANGES:
NONE — only uses existing organism_scrape_log.error, organism_posts_log columns already in schema

## NEW DEPENDENCIES:
NONE

## WHAT I WILL NOT DO:
- I will not merge, rename, or restructure any service not in this plan
- I will not remove UI components or pages
- I will not mark gates N/A to hide missing features
- I will not declare done without OO_COMPLETE.json
- I will not approve this plan myself — OO approves it

## RISK ASSESSMENT:
- scraper.ts return type change (RawLead[] → { leads, errors }) requires updating scrape/route.ts import side — must update both atomically or TypeScript will catch the mismatch
- notifier.ts writes to organism_posts_log on failure — if that table insert fails, error propagates to caller; caller (generate/route.ts) handles it in outer try-catch

---
## OO APPROVAL STATUS: APPROVED — user authorized "fix this stuff" 2026-05-03
