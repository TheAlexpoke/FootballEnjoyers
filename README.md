# Football Enjoyers Draft Order Tournament

## Current workflow: local tournament control room

**Local operation is now the default. No administrator password, participant accounts, private links or Supabase setup is required.** Use Node.js 24, run `npm ci`, then `npm run dev`. Open http://127.0.0.1:3000/admin to add competitors and enter scores. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

Tournament data saves on this computer in `data/tournament.sqlite`; photos save in `data/avatars`. Practice and official data stay separate. Keep a separate copy of the entire `data` folder while the server is stopped, and use the Recovery tab for JSON/CSV exports and restore.

GitHub stores the source. **Vercel shares a read-only published snapshot with Standings, Events, and History.** Run `npm run snapshot:prepare` while the local server is running to prepare the official scores, event schedule, progression history and public photo copies for publishing. Push those files to GitHub to update Vercel. Later local changes do not synchronize automatically. No Supabase or password variables are needed. Vercel rejects writes even if `LOCAL_MODE=true` is set. The full local control room and private database stay on this computer, with the local server bound to `127.0.0.1`.

See [the current local operating guide](docs/LOCAL-OPERATION.md) for setup, scoring, backups, publishing and tests. The hosted setup material below describes the retained legacy Supabase backend and is **not required for the current workflow**.

---

## Archived hosted setup and engine reference

A mobile-first Next.js tournament application for Mark, Hong, Li, Arun, Erfan, Dabin and Alex. Public spectators need no account. Physical events use the tournament scoring engine; the fantasy finale now uses **ESPN scores entered manually or read from an administrator-reviewed screenshot**.

No direct ESPN/Sleeper integration, external OCR/AI API key, fantasy scoring provider, or scheduled polling worker is required. Persistent hosting still needs Supabase and Vercel configuration. The application has been tested locally; no real hosted project has been provisioned in this session.

## Local setup

Use Node.js 24 (or a compatible Node.js 22 release) and npm. Run from this application directory:

```sh
npm ci
cp .env.example .env.local
npm run admin:password
# Fill in .env.local using the settings below.
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` and `npm.cmd` if script execution policy blocks `npm.ps1`. The install/dev/build hooks prepare locally hosted OCR assets from locked dependencies; leave install scripts enabled. Without database credentials, the app intentionally shows an unconfigured empty preview and disables registration. No sample scores appear as official data.

## Supabase setup

1. Create a new Supabase project and securely save its database password.
2. Run the entire `supabase/migrations/001_tournament.sql` once in its SQL Editor as postgres, or apply it with the linked Supabase CLI.
3. Confirm application tables, the `avatars` Storage bucket, and the `tournament_pulse` Realtime publication entry exist. All application tables have RLS enabled. Browsers may read only the production revision notification; official data operations use protected server routes.
4. Configure the project URL and API keys below. The current backend expects legacy JWT-based `anon`/`service_role` keys. Do not substitute modern `sb_secret_...` keys without updating server database and Storage authentication headers; see [Supabase key guidance](https://supabase.com/docs/guides/getting-started/api-keys).
5. No seed command is needed. Default events initialize transactionally on the first write. Practice samples are populated explicitly in the admin sandbox.
6. Test real Storage uploads and cross-device Realtime/polling after deployment. Local tests use an actual embedded Postgres engine plus a test-only platform adapter; they do not certify hosted Supabase connectivity.

Production and practice are isolated tournament namespaces with compound keys and separate results/configuration/history/backups. Practice requires an administrator session. For destructive public-registration acceptance tests, use a separate staging project rather than claiming official identities.

## Required environment variables

| Variable | Value | Visibility |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Legacy public anon key | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy privileged service-role JWT | Server only |
| `ADMIN_PASSWORD_HASH` | Output of the password helper | Server only |
| `APP_ORIGIN` | Exact deployment origin, without trailing slash | Server configuration |

In `.env.local`, single-quote the entire password hash because it contains `$` separators. In Vercel's environment-variable UI, paste the raw hash without surrounding quotes. Keep environment files out of Git. Never prefix privileged keys or password hashes with `NEXT_PUBLIC_`.

## Administrator authentication

`npm run admin:password` reads a hidden password of at least 12 characters and prints a randomly salted scrypt hash. There is no default password. Login at `/admin` uses random, hashed server sessions, 12-hour HttpOnly cookies, Secure cookies in production, same-origin mutation checks and distributed rate limiting. Logout revokes the session. Changing the password should also be accompanied by deleting existing `admin_sessions` rows.

Registration/private profile tokens are 256-bit random values stored as hashes. Regeneration revokes old links. Device cookies only personalize rows; they cannot authorize score changes. Private links can remain in browser history/hosting access logs, so share them privately and restrict log access. No third-party analytics or remote fonts are used; the site sends `Referrer-Policy: no-referrer`.

## Deploy to Vercel

1. Put this source directory in a private Git repository and import it into Vercel as Next.js. If keeping the parent workspace, set Root Directory to `outputs/football-enjoyers`.
2. Use Node.js 24, `npm ci` for installation and `npm run build` for building. Commit `package-lock.json`. OCR files are generated at install/build time under `public/ocr/` and must be included in the deployment.
3. Set the five environment variables above. Ensure `APP_ORIGIN` matches the final production origin exactly. Redeploy after changing public build-time values.
4. Check the production URL in an incognito browser. It must allow public spectators without Vercel login while `/admin` remains protected by the app.
5. Run the hosted acceptance checks in `docs/DEPLOYMENT-CHECKLIST.md` before accepting official registrations.

No Supabase/Vercel credentials were supplied, so there is no claimed public deployment URL. Free tiers have quotas and availability limits. This update needs no additional SQL migration: ESPN team mappings live in the existing tournament JSON configuration.

## ESPN fantasy scoring

Read [the screenshot operating guide](docs/SCREENSHOT-SCORING.md).

In Admin → Fantasy, enter the exact ESPN team name associated with each competitor and save all seven mappings. Those names can differ from public website team names. Screenshot reading stays disabled until all seven names are configured uniquely.

Upload an ESPN League table screenshot containing the TEAM and TOTAL PTS headers and all seven teams. The reader selects Total Pts by its column position and ignores Rank, Score, Budget, owner sublines and advertisements. Unknown/missing teams, duplicate matches, ambiguous target cells and low-confidence text reject the entire import. Configure an explicit visible screenshot label for any truncated name; full names are never guessed from a prefix. The app does not fuzzy-match names or repair misread numbers. Arbitrary matchup-card layouts, truncated names, emojis and unusually styled text may need manual entry. Recognition runs locally with self-hosted Tesseract assets; no AI/ESPN credential is required.

The admin sees the original image, all seven matched identities, current values and recognized values before anything changes. Applying requires explicit score review and Sunday-only attestation. The server signs a short-lived review tied to the environment and tournament revision; altered, stale and repeated imports are rejected. It saves all seven values atomically and recomputes provisional standings/history. Manual entry remains available, supports negative/tied scores, and requires a complete seven-score update.

Only eligible Sunday, November 8, 2026 performances count, including Sunday Night Football. **A screenshot cannot prove that an ESPN weekly total excludes Thursday or Monday points.** The administrator must verify lineups/scoring and Sunday-only totals. If the image includes ineligible performances, use corrected manual totals instead. Finalization is explicitly performed by the administrator after every eligible Sunday game ends; reopening is required before correcting finalized results.

Public pages show the last admin update and never claim unattended ESPN live synchronization. The site's normal Realtime/polling distributes each saved update to spectators.

## Existing installations

Stop the old fantasy worker and remove `CRON_SECRET`, `FANTASY_FEED_URL` and `FANTASY_FEED_TOKEN` if they were only used by this app. The old scoring cron is retired and cannot overwrite admin scores. Historical Sleeper fields remain readable in old backups but are no longer registration requirements or scoring controls. New ESPN mappings are included in JSON backup/restore and retained by a results reset.

## Tournament engine and operating guide

1. Use practice to rehearse. Return to **OFFICIAL TOURNAMENT** before collecting real registrations.
2. Share the public URL. Each competitor claims their real name, adds a team/nickname and saves their private management link for photo/profile edits. Registration closes automatically at seven. There is no global Start Tournament button.
3. Start physical events individually. Confirm first-event order from existing league standings. Subsequent orders follow tournament ranks, with explicit ordering of shared ranks. Original orders freeze; audited corrections preserve the original snapshot.
4. Enter results in the displayed units, leave the field to save and wait for completion. Mark absences explicitly. Physical points affect totals only after finalization; corrections then recalculate immediately.
5. For Mario Kart, enter trials or absences, confirm seeds, select Wild Card winners, then semifinal/final/third-place winners, and finalize. Downstream races invalidate after upstream changes. Wild Card losers receive the agreed special scoring.
6. Finish physical events, configure seven ESPN names and use the screenshot/manual flow above. Reviewed provisional fantasy points contribute immediately; replacement updates do not add the totals twice.
7. Finalize fantasy once verified. Shared tournament ranks remain tied after the defined tiebreakers; record only the offline ordering resolution. No draft-slot selection feature exists.
8. Download final JSON/CSV and separately archive avatar objects and original score screenshots.

Scoring is centralized in exact integer base-point ticks and decimal weights. Default base points are 15, 10, 6, 3, 2, 1, 0; fantasy is 3×, total event weight is 12 and the event maximum is 180. The best unweighted average placement earns a moving 10-point Consistency Award (every tied leader gets 10), and the most last-place finishes earns a separate 10-point pool (tied leaders split it). Both use completed events only. The scoring breakdown shows 200 points available; the separate award qualifications mean a perfect sweep earns 190 rather than 200. Ties average occupied places. Legacy absences score zero without occupying a finishing place. Overall tiebreakers use outright wins and subsequent finish counts, with shared ranks when unresolved.

## Backups and recovery

The admin Recovery tab offers JSON/CSV exports, stored recovery points, backed-up results reset and validated transactional restore. Authentication secrets and private management tokens are excluded. Matching identities retain current credentials; restoring to a fresh project requires regenerating private profile links. Audit history is append-only. JSON includes ESPN mappings and score-import evidence metadata; uploaded score screenshots are not retained as image files. Save originals independently if needed.

Results reset preserves profiles and configuration. An identity with tournament history cannot be removed directly: edit its profile or regenerate its link, or first perform an explicitly confirmed backed-up results reset. Download off-site JSON and separately back up avatar Storage objects; same-database recovery points cannot survive deletion of the database.

## Important files

| File | Purpose |
|---|---|
| `src/components/fantasy-admin.tsx` | ESPN names, local OCR, review, manual entry and finalization |
| `src/lib/screenshot.ts` | Strict seven-team matching and score extraction |
| `src/lib/fantasy-entry.ts` | Complete fantasy updates, audit/history and provisional standings |
| `src/app/api/fantasy/screenshot/route.ts` | Admin-only review preparation and atomic confirmation |
| `src/lib/server/screenshot-receipt.ts` | Signed, expiring, revision-bound review receipts |
| `scripts/prepare-ocr.mjs` | Locally hosted worker/WASM/language assets |
| `src/lib/scoring.ts`, `src/lib/kart.ts` | Tournament scoring and bracket logic |
| `src/lib/actions.ts`, `src/lib/validation.ts` | Authorized transitions and backup validation |
| `supabase/migrations/001_tournament.sql` | Schema, RLS, transactions, revision notifications and rate limits |
| `tests/` | Unit, real SQL, responsive browser and actual OCR workflow tests |

## Verification and remaining setup

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:integration
```

See `docs/QA.md` for the responsive suite and measured checks. Browser OCR tests use generated seven-team light/dark scoreboards with actual recognition, not a mocked OCR response. A supplied ESPN League-table image is included in OCR regression checks; OCR still always requires admin review. Remaining launch work is Supabase/Vercel provisioning and hosted multi-device, authorization, upload and recovery verification. A direct sports-data integration is no longer a dependency.

