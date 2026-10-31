# Launch checklist

## Current local workflow

- [ ] Install Node.js 24 and dependencies with lifecycle scripts enabled.
- [ ] Open `/admin` locally without a password and add competitors in Players.
- [ ] Rehearse scoring and backups in practice; return to official mode for real results.
- [ ] Keep a separate backup of `data/tournament.sqlite` and `data/avatars` while the server is stopped.
- [ ] Verify the Vercel preview rejects edits and does not include local data files.
- [ ] Follow [LOCAL-OPERATION.md](LOCAL-OPERATION.md). No Supabase or password configuration is required.

## Archived legacy hosted-backend checklist

These checks apply only to the older Supabase setup, not the current local workflow.

- [ ] Install dependencies with lifecycle scripts enabled; OCR worker, core WASM and English model are generated under public/ocr.
- [ ] Lint, typecheck, unit/SQL tests, responsive checks, actual screenshot workflow and production build pass.
- [ ] Apply the existing migration once. Check RLS, service grants, avatars bucket and production-only Realtime revision notifications.
- [ ] Configure only the five required variables in README; never expose privileged credentials in public environment variables.
- [ ] Deploy HTTPS with exact APP_ORIGIN; spectators can view the production URL without login.
- [ ] Verify hosted admin sessions, logout, private profile links, avatar uploads, registration uniqueness/capacity and device highlighting.
- [ ] Check practice isolation and cross-device score updates; test polling fallback and reconnects.
- [ ] Save seven unique full ESPN team names in Admin → Fantasy, and an explicit visible screenshot label wherever ESPN truncates a name.
- [ ] With an ESPN League screenshot, verify TEAM and TOTAL PTS headers, all seven names and Total Pts cells are recognized. Verify Rank, Score, Budget and owner sublines are ignored. Reject missing, duplicate, low-confidence or ambiguous target data without partial writes.
- [ ] Confirm a review changes nothing until applied; changed mappings/results invalidate it. Check signed-review tampering, environment isolation and repeated-import rejection.
- [ ] Confirm seven manual scores, including ties and negative values, save correctly and replace prior totals.
- [ ] Independently verify Sunday-only eligibility: ESPN weekly totals can include Thursday/Monday. Use corrected manual totals when necessary.
- [ ] Finish all physical events before entering official fantasy scores; verify provisional points count once, finalization counts once and reopening permits audited corrections.
- [ ] Stop old fantasy workers and remove obsolete feed/cron variables. No ESPN, AI or scoring-feed API credential is needed.
- [ ] Test practice JSON/CSV export, backed-up reset and restore. Confirm ESPN mappings and audit metadata survive.
- [ ] Keep off-site JSON, avatar files and original score screenshots. Check hosted availability/quotas before tournament day.

