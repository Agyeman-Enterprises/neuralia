# PLAN.md

## APP:
Neuralia

## TASK:
Wire Stratova + ContentForge discovery integration at triage time; add auto-approve/publish for leads scoring ≥ 8 on products with prior approved campaigns.

## IN SCOPE:
- src/lib/stratova.ts (NEW — Stratova push client)
- src/lib/cf-discovery.ts (NEW — CF rss_items opportunity push)
- src/app/api/triage/route.ts (add Stratova + CF push; fix console.error)
- src/app/api/generate/route.ts (add auto-approve logic for score ≥ 8 + prior approvals)
- .env.local (add STRATOVA_SUPABASE_URL + STRATOVA_SUPABASE_SERVICE_ROLE_KEY)
- .env.example (document same)
- GATE7.txt (add Section M — Integration gates)

## OUT OF SCOPE:
- Do NOT touch approve/route.ts, reject/route.ts, or publisher.ts
- Do NOT modify Stratova or ContentForge codebases
- Do NOT add new organism_* DB tables or columns
- Do NOT change the dashboard UI
- Do NOT change the review page

## MUST DELIVER:
- [ ] When a lead qualifies (score ≥ 6), a crm_contacts row appears in Stratova Supabase for the matched product entity
- [ ] When a lead qualifies (score ≥ 6) and the product has a CF tenant, a cf_rss_items row appears with signal_type='opportunity'
- [ ] When score ≥ 8 AND matched product has ≥ 1 prior approved/posted campaign, generate auto-approves and publishes without human review
- [ ] npx tsc --noEmit exits 0
- [ ] npx playwright test still 7/10 pass (3 data-skips unchanged)

## DATABASE CHANGES:
NONE — writes to existing Stratova and CF Supabase projects, no new organism_* tables

## NEW DEPENDENCIES:
NONE — @supabase/supabase-js already installed

## WHAT I WILL NOT DO:
- I will not modify Stratova or ContentForge application code
- I will not create new organism_* tables (all writes go to existing tables in external projects)
- I will not mark gates N/A to hide missing features

## RISK ASSESSMENT:
- Stratova entity lookup by name may miss products whose names don't exactly match — mitigated by ilike search + graceful null return (push silently skips if no match)
- CF tenant lookup by medium_pub slug may miss products — same mitigation
- Auto-approve fires publishToAll inline in generate route — if publishing fails, generate still returns ok with campaign_id; failure logged to organism_posts_log

---
## OO APPROVAL STATUS: APPROVED — user authorized "get keys, build it" 2026-05-03
