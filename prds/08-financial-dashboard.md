# 08 — Financial Dashboard & Trust Insights

**Phase**: 3 · **Depends on**: 07 (security model decided), real scoping conversation with Dan's dad
**Status**: 🔴 blocked. Two upstream gates: security decision + scoping conversation. Don't start build until both have happened.

## Onboarding (read first if you're picking this up cold)

1. **Read** [CLAUDE.md](../CLAUDE.md), [prds/00-master-plan.md](00-master-plan.md), then this file.
2. **Verify the gates are clear**:
   - Trust-doc security decisions (see [07-trust-doc-rag.md](07-trust-doc-rag.md) pre-flight) have actually been made
   - Dan has had a real conversation with his dad about: what data exists today, where it lives (spreadsheets? Addepar? Bill.com? Excel?), and what subset would be most valuable to surface in-app
3. **You will reuse**:
   - Auth + RLS patterns from the first slice
   - `recordRevision()` for any editable financial-entry history
   - shadcn/ui Card + Tabs (might need to install Tabs)
   - **A new dependency**: Recharts (or shadcn's chart components) for visualizations

## Goal

A transparent view of trust performance and distributions for family members who are beneficiaries. Bar is *useful summaries*, not full portfolio software — we are explicitly not building Addepar or Bloomberg.

## User stories (initial — scope TBD after dad conversation)

- As a beneficiary, I see my current trust value, recent distributions, and a high-level performance trend.
- As any member, I see family-wide aggregate metrics (no individual-level disclosure unless I'm the beneficiary).
- As an admin / trustee, I upload a quarterly statement and the dashboard reflects the new numbers.

## Pre-flight decisions (MUST happen before code)

| Decision | Recommendation | Why |
|---|---|---|
| **Data source** | Manual entry by trustee for v1 | Brokerage / family-office API integrations are huge. Validate the surface first. |
| **Ingestion path** | File ingest from quarterly PDFs (parse with the RAG pipeline from 07) | Reuses infrastructure. Manual entry by trustee as fallback. |
| **Per-beneficiary visibility** | Beneficiaries see their own; admins see aggregates and per-beneficiary breakdowns | Don't expose other beneficiaries' individual balances. |
| **Disclaimers / legal** | Family lawyer signs off on the exact wording before any dollar figure appears | Same rigor as 07. |
| **Aggregate visibility** | All members see anonymized aggregates ("the trusts paid out $X this year") | Builds trust + transparency without breaking individual privacy. |
| **Refresh cadence** | Update on every new quarterly statement upload | No live feeds; trustee-controlled cadence. |
| **What to ship first** | Pick 2-3 cuts from the In-scope list — don't try to ship them all | Validate the format before scaling. |

The scoping conversation should produce concrete answers to: "When dad logs in, what's the *one* thing he wants to see? When a Gen 2 beneficiary logs in, what's the *one* thing they want to see?" Design around those, not around the full Addepar feature set.

## In scope (candidates — pick 2-3 for v1)

- Per-beneficiary view: balance, YTD performance, distribution history
- Aggregate family view (anonymized): total AUM, distributions paid out by year
- Document hooks: link each metric back to its source statement (handoff to [07-trust-doc-rag.md](07-trust-doc-rag.md))
- "Ask the AI" entry point — questions about the numbers route to 07
- Manual entry UI for trustees (forms over Postgres, not spreadsheet import)
- Time-series chart of family AUM over time

## Out of scope

- Live brokerage / market-data feeds
- Tax-optimization recommendations (AI-generated)
- Real-time portfolio rebalancing
- External advisor portal (CRM-style)
- Risk modeling
- Any speculative / projection numbers

## Likely file layout

```
supabase/migrations/
  YYYYMMDD_finances.sql            # statements, beneficiary_balances, distributions
src/lib/db/schema.ts               # mirror

src/app/(app)/finances/
  page.tsx                         # entry: routes to /my or /aggregate based on user
  my/page.tsx                      # per-beneficiary view
  aggregate/page.tsx               # family-wide anonymized
  admin/page.tsx                   # trustee entry forms (admin-gated)
  actions.ts                       # createStatement, recordDistribution
  charts/balance-over-time.tsx     # Recharts wrapper
```

## Verification recipe

1. Sign in as admin / trustee. Upload a quarterly statement PDF + record the per-beneficiary balances. → records persist.
2. Sign in as a beneficiary. Open `/finances`. → see your own balance, recent distributions, trend chart.
3. Sign in as a non-beneficiary family member. → see aggregate-only view; no individual balances visible.
4. Click a metric on your view. → either opens the source PDF (via 07) or shows the underlying record.
5. Try poking at the API as a member — can you see another beneficiary's balance? → RLS should say no. Verify with a direct query.
6. Disclaimers visible on every page; family lawyer has approved the wording.

## References / reuse

- Same auth + RLS model — extend with beneficiary-scoped policies (use a `beneficiary_relationships` lookup if needed)
- Recharts or shadcn charts for visualizations (shadcn charts are styled to match the rest of the app)
- For PDF statement parsing: same pipeline as 07

## Implementation

_To be filled in by the contributor who ships this — only after both gates are clear and the dad conversation has produced concrete scope._

- **Status**: blocked on security decision + scoping conversation
- **Key files**: (list once shipped)
- **Decisions made**: (concrete answers from the dad conversation)
- **Open follow-ups**: (what's deferred)
