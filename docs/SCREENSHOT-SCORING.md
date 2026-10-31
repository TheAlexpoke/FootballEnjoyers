# ESPN screenshot and manual fantasy scoring

The final event uses organizer updates from ESPN on the local site. No password, Supabase project, ESPN integration, AI API key or scheduled scoring worker is required. Vercel is a read-only preview; local scores do not synchronize there.

## Setup and operating steps

1. Add all seven competitors in Control room → Players. Open Fantasy.
2. Name each ESPN team exactly **Mark, Hong, Li, Arun, Erfan, Dabin, Alex**. Names match competitors automatically, independently of website team names. No mapping form or saved configuration is needed. Old custom mappings and shortened labels are ignored by the current importer. Keep all seven complete names visible.
3. Complete and finalize all physical events before saving fantasy scores. Practice allows rehearsal before tournament day; official fantasy scores open November 8, 2026.
4. Obtain an ESPN League table screenshot showing **all seven teams** and the **TEAM** and **TOTAL PTS** headers. Keep those headers visible. Rank, Score and Budget may remain visible: the reader explicitly selects only the Total Pts column. Owner-name sublines and advertisements are ignored. Arbitrary matchup-card layouts are not guessed.
5. Choose a PNG, JPG or WebP image under 3 MB, at least 200 × 200 pixels, and under 18 megapixels. Press **Read ESPN screenshot**. The OCR worker and English model load from this website and run on your device; the first read may take longer.
6. If any of the seven names is missing, a match is duplicated, a name contains extra text, or the Total Pts heading/cell is unclear, **the entire screenshot is rejected**. No partial scores are saved. Case and ordinary extra spaces are normalized; OCR spelling/number mistakes are never automatically repaired.
7. Review all seven proposed scores beside the original image and current saved values. Scores have not changed yet. Confirm every value and the Sunday-only attestation, then press **Apply seven scores to provisional standings**.
8. Scores are saved atomically; fantasy placements, weighted points, overall standings, movement and history recalculate. A later screenshot replaces the seven raw fantasy totals rather than adding them. Exact ties use the existing tie formula.
9. Alternatively, type all seven raw ESPN fantasy totals into **Enter scores manually**, confirm Sunday-only eligibility, and save. Negative and tied values are supported. Unknown scores are never silently filled with zero.
10. After all eligible Sunday games have ended and the totals are verified, use **Finalize Sunday scores**. Reopen before correcting finalized scores. Finalizing does not count the fantasy points a second time.

## ESPN and Sunday-only eligibility

The screenshot is an input aid, not proof of eligibility or authenticity. It cannot establish whether an ESPN weekly total includes Thursday/Monday performances, whether starters were eligible, or whether late corrections are complete. The administrator must verify the actual ESPN lineup/scoring rules and supply Sunday-only totals, including Sunday Night Football. If the screenshot includes ineligible games, do not import it: calculate the correct Sunday-only totals and use manual entry.

The labeled Total Pts cells may contain integer or decimal values, including `0.0`. A dash or unreadable cell is never treated as zero. Emoji, unusual fonts, truncated names, compressed images, projections and multi-column matchup layouts may be rejected. Adjust the screenshot or use manual entry. Successful OCR still requires human review; confidence is not an accuracy guarantee. A real user-provided ESPN League screenshot has been used for OCR regression checks, including truncated names, seven zero totals, Budget and Score columns, owner text and an advertisement. Generated light/dark scoreboards provide additional coverage.

## Security, history and recovery

The local control room can prepare and apply reviews without a password; hosted Vercel previews reject these writes. The server validates all seven fixed names, file format/dimensions, recognized text geometry and score ambiguity. It returns a signed, ten-minute review bound to the tournament environment and revision. Editing a review, changing tournament data before applying it, or replaying a previously applied image is rejected. OCR runs in the organizer's browser. The signing key is generated locally and persists with the SQLite database.

For server validation the selected image is sent to the local backend. It is not retained as an image or sent to a third-party OCR/AI service. The audit log retains its SHA-256 hash, filename, matched names, confidence, old values and accepted scores. Keep original screenshots if you need full visual evidence later. Score/audit history is included in JSON backups. Names match automatically after restoring a backup with all seven competitors; historical custom name mappings are not used by the current importer.

Public pages show **admin updated** and the last saved timestamp. They do not claim automatic live ESPN synchronization. New scores appear after an administrator saves an update; spectators receive the application's normal realtime notification/polling updates.

## Upgrade and deployment

Existing database migrations do not need to change: the new configuration uses the existing tournament JSON fields. Reinstall dependencies and redeploy the updated source. `npm ci` and the dev/build hooks prepare locally hosted OCR assets in `public/ocr/`; do not disable install scripts. These generated files are excluded from the source archive and regenerated from locked dependencies.

Stop any old fantasy worker and remove `CRON_SECRET`, `FANTASY_FEED_URL` and `FANTASY_FEED_TOKEN` if they were configured solely for this tournament. The old cron route no longer updates scores. Historical Sleeper fields remain compatible with older backups, but are no longer part of registration or the admin scoring workflow.

