# BARFLY SOCIAL MYSTERY ENGINE

Reusable live murder-mystery web app for Barfly Social-style venue games.

This app is designed to be cloned into a new restaurant/venue mystery without rebuilding the core engine from scratch.

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
- Forensics-first evidence workflow
- Interrogation workflow for suspects and witnesses
- Forensics automatically returns processed recovered-evidence reports
- Timeline that fills in from Forensics and Interrogation
- Deduction questions after rounds
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

- `truth-packs/*.json` — case content, suspects, Forensics, Interrogation, Timeline, Deduction, final answers
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

The template now supports a venue logo/card and short marketing excerpt on each public RSVP booking card. Add these fields to each truth pack:

```json
{
  "titleGraphic": "/assets/barfly-social-mystery-fullscreen-bg.png",
  "rsvpExcerpt": "A short spoiler-free hook that makes players want to reserve a spot."
}
```

On the RSVP page, each booking card shows the mystery title, difficulty, excerpt, venue/session details, and a Reserve Spot button.

Recommended excerpt length: 2-4 cinematic sentences with no spoilers.
- Forensics is filtered to scene/evidence items only; interrogation, witness, alibi, and contact-style items stay out of Forensics.


## Button cleanup build
- Player navigation is streamlined: Home, Back where needed, Find a New Game, Forensics, Interrogation, Timeline, and Deduction.
- Forensics displays recovered evidence results automatically; no separate evidence search or manual lab-send step remains.
- Recaps, host-message controls on the player screen, notes, dashboard Accuse, Play Again, and Return to App are absent from the player flow.



## Build Note — Forensics / Interrogation / Timeline / Deduction Dashboard

The player dashboard has four main buttons: Forensics, Interrogation, Timeline, and Deduction. Recovered phones, records, documents, browser history, photos, security footage, and physical evidence appear automatically as Forensics results as the investigation progresses.

## Truth Pack Structure Update

The included mysteries have been remade for the cleaned player dashboard:

- **Forensics**: recovered phones, message extractions, financial records, documents, browser history, photos/video, physical evidence, and security footage results.
- **Interrogation**: suspect and witness statements only.
- **Timeline**: built from forensic results and interrogation claims.
- **Deduction**: round deduction questions and the final accusation.

There is no separate Crime Scene button or manual Send to Forensics flow. The crime scene is treated as already processed; Forensics returns the results as the investigation progresses.

