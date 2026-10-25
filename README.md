# Survival Arena — 5 Player Battle

A small real-time browser game built with Node.js, Express and Socket.IO.

## Run locally
1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Run `npm install`
4. Run `npm start`
5. Open http://localhost:3000 in a browser.

To test multiplayer locally, open the site in multiple browser tabs. A room needs five players to start; every player must press Ready.

## Publish a public link
This app needs a host that runs a persistent Node.js process and supports WebSockets (Socket.IO). One simple path:
1. Create a GitHub repository and upload these files.
2. Create a new Node.js web service on a hosting provider that supports WebSockets.
3. Set build command to `npm install` and start command to `npm start`.
4. Open the provider's generated HTTPS URL and share it with friends.

The public URL is not created by this source package itself; deployment requires your hosting account. Free-host sleep limits and provider policies can affect availability.

## Game rules
- Rooms support up to five players; all five must join and press Ready.
- Move with WASD / arrow keys or the on-screen directional pad.
- Collect supplies: health (+35), blaster (longer range), sword (short range, stronger hit), or speed boost.
- Press ATTACK to target the nearest living opponent in range.
- The safe zone shrinks over time. Players outside it lose health.
- The last living player wins.

## Important prototype notes
This is a playable prototype, not a hardened competitive game. It uses server-authoritative health, attacks, pickups and zone damage, but movement is client-requested and should be rate-limited/validated further before public competitive use. Room state is in memory and resets when the server restarts. There is no account system or persistent leaderboard.
