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

1. Open Control room → Players. Add each of the seven names and a team name. Edit their profiles and upload their photos here. Nobody needs to sign up or save a private link. Score-entry forms have no absent checkboxes.
2. For a rehearsal, choose Open practice sandbox and Populate seven sample competitors. Return to OFFICIAL TOURNAMENT for real scores. Practice and official records remain separate.
3. Start each physical event individually, confirm competitor order, enter results and finalize it. The existing scoring, multipliers, ties, Mario Kart brackets and ranking history remain in use. There is no global tournament-start button.
4. Name the ESPN teams Mark, Hong, Li, Arun, Erfan, Dabin, and Alex. In Fantasy, enter all seven scores manually or upload an ESPN League screenshot showing TEAM, TOTAL PTS and all seven matching names. No name-mapping setup is needed. Review before applying. See [the screenshot guide](SCREENSHOT-SCORING.md).
5. Only Sunday, November 8, 2026 performances count in the fantasy finale. Verify eligible Sunday-only totals yourself; ESPN weekly totals may include Thursday or Monday points. Finalize after every eligible game has ended.

## History progression

The History page shows all competitors automatically, including when data loads after the page opens, without a separate player key. Bold rank badges highlight first in gold, second in silver and third in bronze; ranks 4–7 use matching slate badges. Event labels are larger and bolder. Both Rank and Points views use profile photos as markers; initials appear until a photo is added. Tied or crowded markers are separated with leader lines to their exact chart positions, preserving the recorded standings. The chart scrolls horizontally on smaller screens. Add each photo in Control room → Players to use it throughout the site and in history.

## Storage and recovery

`data/tournament.sqlite` contains scores, profiles, configuration, history, audit records, recovery points and a generated key for validating screenshot reviews. `data/avatars` contains photos. Data survives server restarts. The database uses atomic revision checks so overlapping saves do not silently overwrite one another.

Assigned portraits in `data/avatars/portraits/Mark.png`, `Hong.png`, `Li.png`, `Arun.png`, `Erfan.png`, `Dabin.png`, and `Alex.png` are used automatically for both practice and official competitors. They appear as circular photos in standings, profiles, and history. A later profile-photo upload overrides that competitor's assigned portrait. Originals stay local and are excluded from GitHub and Vercel; include the portraits folder when backing up or moving your data.

Use Control room → Recovery to export JSON/CSV, create recovery points or restore a JSON backup. JSON does not include photo files. To move the whole installation, stop the server and copy the entire `data` folder into the new project folder before starting it. Keep an independent backup of this folder.

The `data` directory, environment files, generated OCR assets, dependencies and build output are excluded from GitHub. Keep custom `LOCAL_DATA_DIR` locations outside source control too. Existing Supabase data is not deleted or automatically imported. Existing compatible JSON backups can be restored from the local Recovery tab; photos must be copied separately.

## GitHub and Vercel

### Current public sharing mode

The shared Vercel site contains only Standings and Events, including read-only event detail pages. Admin, History, Players, registration, private management pages, practice access, and all editing APIs are unavailable there. The full local control room remains unchanged.

With the local server running, `npm run snapshot:prepare` prepares a public copy of the current **official** standings, roster, event schedule, rules, and profile photos. It does not change the local tournament. This creates `src/data/shared-tournament.json` and copies the displayed photos into `public/images/players/` with versioned filenames. These files are intentionally public when pushed to GitHub and deployed to Vercel. Private database files, audit records, backups, credentials and practice results are excluded.

Push the updated source, snapshot and public photo copies to the connected GitHub repository to update Vercel. The public view is a published snapshot: later local score edits do not appear until a new snapshot is prepared and published. Originals and the main tournament database stay in `data` on this computer. No shared database or paid API is required.

### Earlier preview behavior (superseded by public sharing mode)

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
