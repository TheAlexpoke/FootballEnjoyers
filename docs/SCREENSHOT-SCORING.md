# ESPN screenshot and manual fantasy scoring

The final event now uses administrator updates from ESPN. There is no direct ESPN/Sleeper connection, fantasy provider, AI API key or scheduled scoring worker. Supabase and Vercel are still required for persistent, shared hosted standings.

## Setup and operating steps

1. Register all seven competitors. Open Admin → Fantasy.
2. Expand **Match ESPN team names to competitors**. Enter the exact ESPN team name for each real-world competitor and save all seven. These mappings are independent of public website team names and can only be changed by an administrator. Duplicate names, after normalizing case/spacing, are rejected. If ESPN truncates a name, also enter its exact visible screenshot label, including the ellipsis. These labels must be unique and are only accepted when explicitly configured.
3. Complete and finalize all physical events before saving fantasy scores. Practice allows rehearsal before tournament day; official fantasy scores open November 8, 2026.
4. Obtain an ESPN League table screenshot showing **all seven teams** and the **TEAM** and **TOTAL PTS** headers. Keep those headers visible. Rank, Score and Budget may remain visible: the reader explicitly selects only the Total Pts column. Owner-name sublines and advertisements are ignored. Arbitrary matchup-card layouts are not guessed.
5. Choose a PNG, JPG or WebP image under 3 MB, at least 200 × 200 pixels, and under 18 megapixels. Press **Read ESPN screenshot**. The OCR worker and English model load from this website and run on your device; the first read may take longer.
6. If any configured team is missing, a match is duplicated, a visible label is ambiguous, or the Total Pts heading/cell is unclear, **the entire screenshot is rejected**. No partial scores are saved. Case, ordinary extra spaces and typographic apostrophes are normalized; OCR spelling/number mistakes are never automatically repaired.
7. Review all seven proposed scores beside the original image and current saved values. Scores have not changed yet. Confirm every value and the Sunday-only attestation, then press **Apply seven scores to provisional standings**.
8. Scores are saved atomically; fantasy placements, weighted points, overall standings, movement and history recalculate. A later screenshot replaces the seven raw fantasy totals rather than adding them. Exact ties use the existing tie formula.
9. Alternatively, type all seven raw ESPN fantasy totals into **Enter scores manually**, confirm Sunday-only eligibility, and save. Negative and tied values are supported. Unknown scores are never silently filled with zero.
10. After all eligible Sunday games have ended and the totals are verified, use **Finalize Sunday scores**. Reopen before correcting finalized scores. Finalizing does not count the fantasy points a second time.

## ESPN and Sunday-only eligibility

The screenshot is an input aid, not proof of eligibility or authenticity. It cannot establish whether an ESPN weekly total includes Thursday/Monday performances, whether starters were eligible, or whether late corrections are complete. The administrator must verify the actual ESPN lineup/scoring rules and supply Sunday-only totals, including Sunday Night Football. If the screenshot includes ineligible games, do not import it: calculate the correct Sunday-only totals and use manual entry.

The labeled Total Pts cells may contain integer or decimal values, including `0.0`. A dash or unreadable cell is never treated as zero. Emoji, unusual fonts, truncated names, compressed images, projections and multi-column matchup layouts may be rejected. Adjust the screenshot or use manual entry. Successful OCR still requires human review; confidence is not an accuracy guarantee. A real user-provided ESPN League screenshot has been used for OCR regression checks, including truncated names, seven zero totals, Budget and Score columns, owner text and an advertisement. Generated light/dark scoreboards provide additional coverage.

## Security, history and recovery

Only authenticated administrators may prepare or apply screenshot reviews. The server validates seven-team mappings, file format/dimensions, recognized text geometry and score ambiguity. It returns a signed, ten-minute review bound to the tournament environment and revision. Editing a review, changing mappings/results before applying it, or replaying a previously applied image is rejected. The OCR itself runs in the administrator's browser; an administrator already has authority to enter manual scores.

For server validation the selected image is uploaded to the site's backend. The image is not retained in Storage or sent to a third-party OCR/AI service. The audit log retains its SHA-256 hash, filename, matched teams, confidence, old values and accepted scores. Keep your original screenshots if you need full visual evidence later. Mappings and score/audit history are included in JSON backups. Restoring an older backup without mappings requires entering the seven ESPN names again.

Public pages show **admin updated** and the last saved timestamp. They do not claim automatic live ESPN synchronization. New scores appear after an administrator saves an update; spectators receive the application's normal realtime notification/polling updates.

## Upgrade and deployment

Existing database migrations do not need to change: the new configuration uses the existing tournament JSON fields. Reinstall dependencies and redeploy the updated source. `npm ci` and the dev/build hooks prepare locally hosted OCR assets in `public/ocr/`; do not disable install scripts. These generated files are excluded from the source archive and regenerated from locked dependencies.

Stop any old fantasy worker and remove `CRON_SECRET`, `FANTASY_FEED_URL` and `FANTASY_FEED_TOKEN` if they were configured solely for this tournament. The old cron route no longer updates scores. Historical Sleeper fields remain compatible with older backups, but are no longer part of registration or the admin scoring workflow.

