# Detective Mode Mystery App

A mobile-friendly live hosted bar mystery game shell.

## What this build includes

- Detective Mode only
- No character roles
- No role claiming
- No split clue lanes
- Every player gets the same unified evidence feed
- Mobile player app with lobby, dashboard apps, timed clues, host messages, help requests, and final accusation
- Host dashboard with table sessions, session codes, connected players, start/reveal/reset controls, host-to-team messages, help requests, and submissions
- Node/Express backend
- WebSocket live updates
- Polling fallback
- Static frontend files
- Render-ready package.json
- Case 001 truth pack: Pelican to Murder
- Demo truth pack retained for testing

## Local setup

```bash
npm install
npm start
```

Then open:

- Host: `http://localhost:3000/host/`
- Player: `http://localhost:3000/player/?code=SESSIONCODE`

The server creates one default Pelican to Murder session automatically when it starts. The host screen can create more sessions.

## Render deployment

1. Push this folder to GitHub.
2. Create a new Render Web Service.
3. Set build command:

```bash
npm install
```

4. Set start command:

```bash
npm start
```

5. After deploy, use:

- Host: `https://YOUR-RENDER-URL/host/`
- Player: `https://YOUR-RENDER-URL/player/?code=SESSIONCODE`

## Truth pack format

Truth packs live in `/truth-packs` as JSON files. Each pack can use unified Detective Mode app buckets directly:

```json
{
  "id": "case001",
  "title": "Case Title",
  "venue": "Venue Name",
  "answerKey": {
    "culprit": "Name",
    "weapon": "Method",
    "motive": "Motive",
    "explanation": "Full reveal explanation"
  },
  "publicClues": [
    { "id": "pub1", "unlockSec": 0, "title": "Case Opened", "text": "Third-person detective clue." }
  ],
  "apps": {
    "phone": [
      { "id": "phone1", "unlockSec": 120, "title": "Call Log", "text": "Third-person detective clue." }
    ],
    "messages": [],
    "maps": [],
    "bank": [],
    "photos": [],
    "social": [],
    "contacts": [],
    "notes": [],
    "files": [],
    "browser": []
  }
}
```

Supported app buckets:

- phone
- messages
- maps
- bank
- photos
- social
- contacts
- notes
- files
- browser

The app also supports older role-based content under a `roles` object. The backend flattens those role clues into the same unified evidence feed for every player.

## Included first case

Default case: **Case 001: Pelican to Murder** at **Pelican to Mars, Baton Rouge**.

Answer key is hidden from players until the host presses Reveal.

## Future game update prompt

Use this prompt when you want to create or replace a truth pack:

```text
Create a new Detective Mode truth pack JSON for this mystery app.

Rules:
- Detective Mode only.
- No character roles.
- No role claiming.
- No split clue lanes.
- Every player receives the same unified investigation feed.
- All clue text must be written in third person from a detective/investigation perspective.
- Clues must unlock over a 45-minute game.
- Accusation phase opens around 38:00 and locks around 43:00.
- Use app buckets only: phone, messages, maps, bank, photos, social, contacts, notes, files, browser.
- Include publicClues for major case updates.
- Include answerKey with culprit, weapon/method, motive, and explanation.
- Make the clues logically point to one culprit, one method, and one motive.
- Do not reveal the final answer until answerKey.

Mystery details:
Title:
Venue:
Victim:
Suspects:
Setting:
Tone:
Correct culprit:
Correct method/weapon:
Correct motive:
Important evidence I want included:
Red herrings:

Return only valid JSON matching this structure:
{
  "id": "case-id",
  "title": "Case Title",
  "venue": "Venue",
  "description": "Short description",
  "answerKey": {
    "culprit": "",
    "weapon": "",
    "motive": "",
    "explanation": ""
  },
  "publicClues": [],
  "apps": {
    "phone": [],
    "messages": [],
    "maps": [],
    "bank": [],
    "photos": [],
    "social": [],
    "contacts": [],
    "notes": [],
    "files": [],
    "browser": []
  }
}
```
