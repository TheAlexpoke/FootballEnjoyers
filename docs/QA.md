# Local verification — October 30, 2026

| Check | Result |
|---|---|
| ESLint | Passed, zero errors/warnings |
| TypeScript | Passed |
| Unit and embedded Postgres tests | **52 passed** across four suites |
| Responsive browser suite | **15 passed** across 375px, 390px and 1440px viewports |
| Full HTTP/SQL/admin and OCR workflows | **3 passed** |
| Next.js production build | Passed |
| Visual review | Desktop and phone practice screenshots inspected |

The browser workflow tests route navigation, seven-row layout, personal highlighting, device-persisted layout selection, closed registration, disabled unconfigured registration, and unauthorized API/cron/practice access. Layout fixture scores are test data, never a live data fallback. The screenshots in the parent outputs directory are visibly labeled **practice sandbox**.

The full integration workflow exercises simultaneous registration through the actual HTTP API and Postgres migration, token-based self editing, rejection of other-player edits, actual Sharp image decoding/resizing/WebP conversion, rejection of another player's image upload, admin password/session cookies, phone score-entry UI, finalization, provisional physical-point exclusion, export secret filtering, backed-up reset, transactional restore, admin-only practice isolation, profile-link revocation and audit history.

The embedded Postgres engine runs the real migration. Supabase roles/storage bootstrap are stubbed and the platform-specific Realtime publication statement is omitted. The full HTTP suite uses an in-memory Storage/PostgREST test adapter. These verify application behavior; **actual hosted Supabase Realtime, Storage and Vercel deployment have not been tested**.

## Reproduce

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
```

For the responsive suite, run `npm run dev` with no Supabase environment configured in one terminal, then `npm run test:e2e` in another. The configuration can also start the dev server, but manually starting it avoids Windows child-process teardown issues. Tests intentionally include an unconfigured-preview check. Stop the dev server when done.

For the full workflow, stop existing Next.js dev servers in this source directory and run:

```sh
npm run test:integration
```

This starts an isolated in-memory SQL/Storage adapter on 54325, runs Next.js on 3001 with **test-only** credentials, executes the workflow, and stops both. It never uses the real service role or production database. Ports must be available. Test credentials are deliberately fixed fixtures, not production defaults. Production authentication reads only the administrator-supplied password hash.

If browser binaries are stored outside Playwright's default cache, export `PLAYWRIGHT_BROWSERS_PATH` to that directory before running the browser suites. The delivered source does not include browser binaries or `node_modules`; install them with the commands above.

## Limits still requiring launch verification

Hosted RLS/service-key grants, real Realtime reconnects across two physical devices, actual public spectator routing, deployed HTTPS cookies, image bucket permissions, administrator verification of Sunday-only ESPN totals, quota behavior, and off-site restore of both JSON and image objects must be checked using the real account configuration.

## ESPN Total Pts screenshot update

Three end-to-end workflows passed, including actual browser OCR of the supplied ESPN League-table JPEG and generated light/dark scoreboards. The supplied image matched all seven configured teams and read all seven Total Pts cells as zero while ignoring Rank, Score, Budget, owner sublines and an advertisement. Mark's truncated team name required an explicitly configured visible screenshot label. Two-times image scaling improves small heading recognition without repairing names or score values.

Additional checks cover disabled upload before seven mappings, partial-image rejection without writes, score review before apply, modified signatures and cross-environment tokens, atomic seven-score updates, negative manual corrections, audit records and finalization without double counting. The private original JPEG is not bundled in the source archive; its extracted OCR table is retained as a regression fixture. To repeat the supplied-image browser check, set ESPN_EXAMPLE_IMAGE to its local path before running npm run test:integration. Without that variable, the two general workflows run and the private-image check is skipped.

