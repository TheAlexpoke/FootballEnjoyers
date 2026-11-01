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

The History page shows all competitors automatically, without a separate player key. Profile photos appear only on the latest completed event; earlier points use dots. Tied photos have leader lines to their exact positions. Event names follow completion order, and the graph compresses to fit the screen without horizontal scrolling. Standings and individual event finishes use numbered gold, silver and bronze trophies for the top three places.

“View exact standings by event” shows one comparison table per checkpoint, with seven player columns and rows for rank, cumulative event points, current bonus points and total. Bonus details distinguish Consistency from Most Last Places; earlier moving bonuses are not added again. Player profiles use the same table style to compare all competitors' event places, raw results (in the event's unit) and event points. The profile player's full column is highlighted, and a separate summary retains cumulative event, bonus and total points. Unplayed events display dashes.

History defaults to Event Finishes: every completed event displays all selected competitors' photos in finishing order, without connecting lines. Shared finishes use adjacent photo slots with shared-place labels. Its exact tables sort by event finish, show event-only scores and current bonuses, and never use bonuses to sort. Standings Progression retains cumulative rank lines and shows each checkpoint's rank change in its exact table. Points Progression retains cumulative point lines and parenthetical regular-point gains such as `18.0 (+3.0)`, excluding bonus movements. Both progression modes park the latest completed-event photos in staggered columns beyond the plotted lines, with curved connectors behind the photos. Profiles retain their chart but omit its duplicate exact-standings section; their bonus summary names the award and explains any split.

The main standings table adds deterministic commentary from recorded results: largest latest rank gains, consecutive official placement streaks, wins, podium counts and light comeback banter. Hover descriptions explain the underlying stats. Comments remain empty before an event is completed and do not alter scoring or call any AI service.

Both Standings Progression and Points Progression exact tables show rank movement and regular-point gains together. A positive rank change means moving up; a negative value means moving down. The first rank checkpoint has no previous placement and displays a dash. Bonuses remain separate from the regular-point delta.

## Moving Consistency Award

The best unweighted average placement across finalized, non-deleted events earns **10 extra points**, already included in standings totals. Every player tied for the best average receives the full 10 points. Before the first completed event, nobody receives a bonus. The award moves as events finish; it is not added cumulatively. Provisional fantasy results contribute regular fantasy points but do not affect the award until finalized.

Official shared places are used for event ties, including Mario Kart's shared 5th. Legacy absent or missing results count as 7th for the average. Corrections, reopened events, deleted events and resets recalculate the award and history automatically. The standings badge identifies recipients and shows their average; player profiles show their current award status.

## Most Last Places Award and scoring breakdown

The most last-place finishes across completed events earns a **10-point pool**. Tied leaders split the pool equally, using exact scoring internally and one-decimal display. Every competitor tied for last in an event receives one last-place count, including Mario Kart's three wild-card losers. Absences and incomplete legacy results do not earn last-place counts. Provisional fantasy is excluded until finalized. This award also moves automatically and is not cumulative; recipients and their shares are marked in standings and profiles.

Fantasy is **3×** in both official and practice tournaments. The current nine-event breakdown is **215 points available: 195 event maximum + 10 consistency + 10 most last places**. These award qualifications differ, so 215 is not an attainable individual maximum: a perfect sweep earns 205 and does not qualify for most last places. Tied consistency leaders each receive 10, so total bonus points across the field can exceed 20. The last-place pool itself always totals 10 when awarded.

## Storage and recovery

`data/tournament.sqlite` contains scores, profiles, configuration, history, audit records, recovery points and a generated key for validating screenshot reviews. `data/avatars` contains photos. Data survives server restarts. The database uses atomic revision checks so overlapping saves do not silently overwrite one another.

Assigned portraits in `data/avatars/portraits/Mark.png`, `Hong.png`, `Li.png`, `Arun.png`, `Erfan.png`, `Dabin.png`, and `Alex.png` are used automatically for both practice and official competitors. They appear as circular photos in standings, profiles, and history. A later profile-photo upload overrides that competitor's assigned portrait. Originals stay local and are excluded from GitHub and Vercel; include the portraits folder when backing up or moving your data.

Use Control room → Recovery to export JSON/CSV, create recovery points or restore a JSON backup. JSON does not include photo files. To move the whole installation, stop the server and copy the entire `data` folder into the new project folder before starting it. Keep an independent backup of this folder.

The `data` directory, environment files, generated OCR assets, dependencies and build output are excluded from GitHub. Keep custom `LOCAL_DATA_DIR` locations outside source control too. Existing Supabase data is not deleted or automatically imported. Existing compatible JSON backups can be restored from the local Recovery tab; photos must be copied separately.

## GitHub and Vercel

### Current public sharing mode

The shared Vercel site contains Standings, Events, and History, including read-only event detail and individual player profile pages. Player photos link to their profiles throughout the site, including chart markers, event sticky notes and comparison tables. Local sandbox photo links retain `?env=practice`. Hosted profiles are limited to published participants. Admin, the Players management tab, registration, private management pages, practice access, and all editing APIs are unavailable there. The full local control room remains unchanged.

With the local server running, `npm run snapshot:prepare` prepares a public copy of the current **official** standings, roster, event schedule, rules, progression history, and profile photos. It does not change the local tournament. This creates `src/data/shared-tournament.json` and copies the displayed photos into `public/images/players/` with versioned filenames. These files are intentionally public when pushed to GitHub and deployed to Vercel. Private database files, audit records, backups, credentials and practice results are excluded.

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

## Choose Your Character

The configured official and practice schedules include this 1× CPU-only seven-character free-for-all after Higher or Lower and before Mario Kart. Each competitor chooses a character to fight for them; there are no human controls. Enter the full finishing order as places 1–7 (last standing is 1st; first eliminated is 7th). Normal shared-placement scoring applies to ties. Event cards use a three-column desktop grid and two columns on smaller screens. This custom event is stored in the local tournament data and included in the published snapshot; include it when backing up or restoring your tournament.
