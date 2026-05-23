# Barfly Social Mystery Hub — El Paso Build 005

This build changes the flow so the landing page uses one Barfly Social Mystery brand graphic. Individual mystery title graphics appear only after the player taps RSVP.

## Included
- `public/index.html` — main landing page / RSVP hub
- `public/assets/brand/barfly-social-mystery-hero-9x16.jpg` — main Barfly Social Mystery graphic
- `public/assets/games/` — individual game graphics
- `public/games/` — the 3 El Paso Denham Springs content JSON files
- `public/games-manifest.json` — game list used by the RSVP page
- `server.js` and `package.json` — Render/GitHub friendly static server

## Flow
1. Main page shows Barfly Social Mystery branding only.
2. RSVP opens the event/game selection page.
3. Each game card shows its own title graphic.
4. Selecting a game opens that mystery's reservation detail page.

No `node_modules` folder is included.
