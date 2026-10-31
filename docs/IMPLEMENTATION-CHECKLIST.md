# Implementation status

The fantasy finale now uses ESPN team mappings, locally processed seven-team screenshots, explicit review/apply, manual score entry and admin finalization. Direct Sleeper/feed integration and scheduled polling are retired. All screenshots must match all seven configured identities and have unambiguous scores; no partial imports are accepted.

Completed locally: original tournament application; secure registration/admin/private profiles; scoring/bracket/history; practice isolation/backups/recovery; ESPN mapping validation; browser OCR with locally hosted model/worker; server file/matching validation; signed expiring review receipts; stale/cross-environment/tamper/replay protection; seven-score atomic replacement; negative/tied manual entry; audited screenshot updates; provisional standings and admin finalization; updated tests and guides.

Remaining launch tasks: provision Supabase, apply the existing migration, configure the five runtime variables, deploy to Vercel, and verify actual hosted Storage/Realtime/authentication/backups on phones. No extra migration is needed for ESPN mappings. Rehearse with a real ESPN screenshot: fixtures verify the supported seven-row layout but do not guarantee arbitrary ESPN matchup layouts. OCR is a reading aid and Sunday-only eligibility remains the administrator's responsibility.
