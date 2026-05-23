# BARFLY MYSTERY ENGINE TEMPLATE

Reusable live murder-mystery web app template for Barfly Social-style venue games.

This template is designed to be cloned into a new restaurant/venue mystery without rebuilding the core engine from scratch.

## Core engine features included

- Host dashboard
- RSVP, My RSVP, and Play Now flow
- First name + 10-digit phone RSVP lookup
- Free event / paid event support
- Paid event ticket price display
- Paid event host activation before code release
- 5-digit numeric check-in codes for normal games
- Free-text demo code support
- Waiting room/lobby with server-time countdown
- Tutorial inside waiting room
- Server-time scheduled auto-start with manual backup
- Latest Case Updates panel
- Crime Scene search workflow
- Interrogation workflow for suspects and witnesses
- Forensics workflow with processing countdowns
- Timeline that fills in as evidence is discovered
- Detective Decisions after rounds
- Final Accusation
- Merged Case Closed screen
- Badge/score/share flow
- Tip button placeholder
- Automated sponsor popup manager

## Recommended new mystery structure

Use episodes for story progression and difficulty for challenge.

Example:

- Episode 1 — [Episode Title]
  - Easy
  - Medium
  - Hard
- Episode 2 — [Episode Title]
  - Easy
  - Medium
  - Hard

Each episode/difficulty should have its own truth pack and its own 9:16 title graphic.

## Main files to update for a new game

- `truth-packs/*.json` — case content, suspects, evidence, forensics, timeline, decisions, final answers
- `public/assets/barfly-social-mystery-fullscreen-bg.png` — shared 9:16 Barfly Social title graphic
- `public/player/index.html` — public metadata and static fallback text
- `public/player/player.js` — return URL, tip URL, share filenames, fallback labels
- `public/host/index.html` — host title/fallback copy
- `render.yaml` — Render service name
- `package.json` — project name and description

## Development commands

```bash
npm install
npm start
```

Render start command:

```bash
npm start
```

No `node_modules` folder should be included in production zip packages.

## Game package rule

Keep the engine. Replace the story.

Do not delete core flows unless the new venue specifically needs a different experience.


## RSVP title graphic booking cards

The template now supports a title graphic and short marketing excerpt on each public RSVP booking card. Add these fields to each truth pack:

```json
{
  "titleGraphic": "/assets/barfly-social-mystery-fullscreen-bg.png",
  "rsvpExcerpt": "A short spoiler-free hook that makes players want to reserve a spot."
}
```

On the RSVP page, the 9:16 graphic appears on the booking card. Players can tap/click it to open a full-screen preview with the game title, venue, difficulty, date/time, price/free event status, excerpt, and a Reserve Spot button.

Recommended excerpt length: 2-4 cinematic sentences with no spoilers.
