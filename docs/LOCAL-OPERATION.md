# Local tournament operation

The organizer manages every competitor and result on one computer. No administrator password, participant account, shareable private link, Supabase project or paid API is needed.

## Start the site

Install Node.js 24. From the project folder:

```sh
npm ci
npm run dev
```

On Windows use `npm.cmd` if PowerShell blocks `npm.ps1`. Open http://127.0.0.1:3000/ for standings and http://127.0.0.1:3000/admin for the control room. Keep the terminal running while using the site. For an optimized local build, run `npm run build`, then `npm start`.

Local mode is the default. Copying `.env.example` is optional. `LOCAL_DATA_DIR` can select an absolute storage directory. Node's built-in SQLite support may emit an experimental warning; no additional database package is needed. Install/build hooks prepare self-hosted OCR assets from locked dependencies; leave lifecycle scripts enabled.

## Competitors and events

1. Open Control room → Players. Add each of the seven names, a team name and optional nickname. Edit their profiles and upload their photos here. Nobody needs to sign up or save a private link.
2. For a rehearsal, choose Open practice sandbox and Populate seven sample competitors. Return to OFFICIAL TOURNAMENT for real scores. Practice and official records remain separate.
3. Start each physical event individually, confirm competitor order, enter results and finalize it. The existing scoring, multipliers, ties, Mario Kart brackets and ranking history remain in use. There is no global tournament-start button.
4. In Fantasy, save all seven exact ESPN names. Enter all seven scores manually or upload an ESPN League screenshot showing TEAM, TOTAL PTS and all seven matching teams. Review before applying. See [the screenshot guide](SCREENSHOT-SCORING.md).
5. Only Sunday, November 8, 2026 performances count in the fantasy finale. Verify eligible Sunday-only totals yourself; ESPN weekly totals may include Thursday or Monday points. Finalize after every eligible game has ended.

## Storage and recovery

`data/tournament.sqlite` contains scores, profiles, configuration, history, audit records, recovery points and a generated key for validating screenshot reviews. `data/avatars` contains photos. Data survives server restarts. The database uses atomic revision checks so overlapping saves do not silently overwrite one another.

Use Control room → Recovery to export JSON/CSV, create recovery points or restore a JSON backup. JSON does not include photo files. To move the whole installation, stop the server and copy the entire `data` folder into the new project folder before starting it. Keep an independent backup of this folder.

The `data` directory, environment files, generated OCR assets, dependencies and build output are excluded from GitHub. Keep custom `LOCAL_DATA_DIR` locations outside source control too. Existing Supabase data is not deleted or automatically imported. Existing compatible JSON backups can be restored from the local Recovery tab; photos must be copied separately.

## GitHub and Vercel

GitHub stores the application source. Vercel serves a read-only public preview: no administrator login, participant registration or editable tournament controls. Backend writes are disabled whenever `VERCEL` is set, regardless of `LOCAL_MODE`.

Local scores and photos are not uploaded or synchronized to Vercel. Push source changes to GitHub to update the connected preview. Use Node.js 24, `npm ci` and `npm run build` in Vercel. No Supabase or password variables are needed for this mode; remove unused credentials from Vercel project settings. Hosting plans still have their normal limits.

The retained Supabase migration, password helper and legacy backend are for older installations. They are not required for this workflow. No external OCR, image-generation, AI or ESPN integration API is called.

## Validation

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Browser tests require installed Playwright Chromium and a production build. Isolated temporary test servers verify local scoring, photos, backup restore and hosted read-only behavior without adding test records to the organizer's database. The retained legacy integration suite explicitly disables local mode and uses its test-only platform adapter.
