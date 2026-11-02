# Same-Wi-Fi phone Control room

The computer hosts the tournament and stores the SQLite scores/photos. The phone is a browser-based controller; it does not need Node.js or an installation. Keep the computer awake and both devices on the same Wi-Fi.

1. Start the regular local site on the computer with `npm start` (after building) or `npm run dev`. Keep it bound to `127.0.0.1:3000`.
2. In another terminal in this project, run `npm run phone`.
3. Open the displayed **Phone Control room** URL in Safari or Chrome on the phone. Enter the private phone sign-in code printed in the terminal. For rehearsals, use the displayed Practice Control room URL.
4. Use Events to start a game, enter scores and finalize it. Use Fantasy for all seven provisional Sunday-only scores and its separate final confirmation. The existing units, multipliers, bonus rules and date checks still apply.
5. Edits save to the host computer immediately. The public Vercel copy remains read-only and is still a published snapshot. Ask the assistant in chat to publish phone-entered results; phone edits do not trigger GitHub/Vercel deployments by themselves.

The code stays in `data/phone-access.json`, excluded from source control and public deployment. Sessions expire after twelve hours. `npm run phone -- --rotate` changes the code and invalidates previous phone sessions. Restart this command when the computer's Wi-Fi address changes. Stop the phone gateway to disable LAN access. If Windows asks, allow Node.js on the private/home network. If the phone cannot connect, check the private-network firewall setting and whether the router isolates wireless clients (guest Wi-Fi often does).

## Access boundaries

The main app continues listening only on loopback. The phone gateway listens on the computer's selected private IPv4 address at port 3001 and forwards to the loopback app. It rejects unexpected Host values and cross-origin writes, overwrites forwarding headers, and never forwards caller-controlled loopback Host values. Phone editing requires a signed, HttpOnly, SameSite cookie after sign-in. localhost editing remains password-free. Vercel always disables local and phone editing.

Use `npm run phone -- --host=192.168.1.10` to select a different detected private interface, or `--port=3005` if needed. The gateway and core site must both remain running. There is no router port forwarding or Internet-facing admin endpoint.
