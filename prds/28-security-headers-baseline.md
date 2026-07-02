# 28 — Security Headers & CSP Baseline

**Phase**: 6 (security hardening / financial-readiness foundation) · **Depends on**: nothing
**Status**: 🟢 ready — **SECURITY, MEDIUM** (foundation for the 07/08 financial bar). Its own session/branch.
**Parallel-safe with**: everything (touches only `next.config.ts` + possibly a headers config). No shared app files.

---

## Why this exists

`next.config.ts` is empty — no `headers()`, no CSP. Today the app ships **no** Content-Security-Policy, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy. For a private photo-and-notes site that's a low-ish risk; for a site that will hold **trust and financial documents** (PRDs 07/08, currently blocked on exactly this security bar) it's table stakes. Adding a strict baseline now is cheap and de-risks the blocked work.

There is also **no rate limiting / abuse control** anywhere (login `sendMagicLink`, invite creation, feedback submit, the token ICS endpoint) and **no WAF config**. Headers are the quick win; rate limiting is noted as a follow-up here so it's tracked, not forgotten.

## Goal

Every response carries a sensible security header set, including a CSP that's as strict as the app allows without breaking Supabase/Resend/Google OAuth/next-themes. Clickjacking, MIME-sniffing, and referrer leakage are closed. Groundwork for the financial-data bar is in place.

## Pre-flight decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Config location** | `headers()` in `next.config.ts` (or a Vercel config). Start in **Report-Only** for CSP, watch for violations against the live app, then enforce. | CSP breaks silently if too strict; report-first avoids shipping a broken app to non-technical family. |
| **CSP connect-src** | Allow `self`, the Supabase project URL (`*.supabase.co` + realtime `wss:`), Resend is server-side (no browser origin needed), Google OAuth/identity origins for the Google sign-in + Photos Picker. Enumerate from the actual network calls. | The app talks to Supabase (REST + storage + auth), Google (OAuth + Picker). Inline styles/scripts: Next needs `'unsafe-inline'` for styles today; script should use nonces/hashes where possible. |
| **img-src** | `self data: blob:` + the Supabase storage host (signed URLs) + Google user-content hosts (Photos Picker imports) + gravatar/google avatar hosts (`resolveAvatarUrls` handles http avatars). | Photos are signed Supabase URLs + Google imports + external avatar URLs. |
| **frame-ancestors** | `'none'` (nobody embeds this). Plus `X-Frame-Options: DENY`. | No embedding use case. |
| **HSTS** | `max-age=63072000; includeSubDomains; preload` (prod only; Vercel already serves HTTPS). | Standard. |
| **Rate limiting** | Out of scope for this PRD; capture as an explicit follow-up (Vercel WAF / Upstash ratelimit on `sendMagicLink`, `createInvitation`, feedback insert, `/api/ics`). | Needs infra choice; don't block the headers win on it. |

## In scope
- `next.config.ts` `headers()` with: CSP (report-only → enforce), HSTS, X-Frame-Options, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy (disable camera/mic/geo except where the app needs camera for photo capture — scope to `self`).
- A short note in the PRD Implementation recording the exact allowlist origins so future integrations know what to extend.

## Out of scope
- Rate limiting / WAF (tracked as follow-up).
- MFA, session-lifetime policy (future / PRD 26 covers session revocation).
- Field-level encryption (PRD 07/08 scope).

## Verification recipe
1. **App still works** — full click-through logged in: photos load (signed + Google), Google sign-in works, theme toggle works, calendar/ICS unaffected. Watch the console for CSP violations (report-only).
2. **Headers present** — `curl -I https://mathiesonfamily.app` shows the full set; CSP header present.
3. **Clickjacking** — attempt to iframe the site → blocked.
4. **Tighten** — after a clean report-only window, flip CSP to enforce; re-run 1.
5. Ship to prod; re-verify 1–3 live.

## Likely file layout
```
next.config.ts    # headers() with CSP (report-only first) + HSTS + frame/nosniff/referrer/permissions
```

## Reviewer sign-off (I check these)
- [ ] CSP shipped **report-only first**, then enforced only after a clean window (no "broke the site for Grandma" risk).
- [ ] Google OAuth + Google Photos Picker + Supabase storage/auth/realtime all still function (these are the origins most likely to be blocked).
- [ ] Camera still works for mobile photo capture (Permissions-Policy not over-restrictive).
- [ ] No `'unsafe-eval'`; `'unsafe-inline'` limited to styles, documented if unavoidable.
- [ ] Rate-limiting follow-up recorded in the master plan so it isn't lost.
