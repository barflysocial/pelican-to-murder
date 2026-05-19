# Pelican to Murder

Mobile-friendly live hosted detective mystery game for venues.

## Run locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000/host/
http://localhost:3000/player/
```

## Database

- If `DATABASE_URL` exists, the app uses PostgreSQL.
- If `DATABASE_URL` does not exist, the app uses `./data/sessions.json`.

## Render settings

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
NODE_VERSION: 20.18.1
```

See `DATABASE_SETUP.md`.

## Continuing Story Level Structure

This build changes the five difficulty levels into chapters of one larger Pelican to Murder story arc, also referred to as **The Pelican Files**. Each level remains a complete playable mystery with its own culprit, method, motive, five checkpoint questions, and final accusation. The difference is that every chapter now leaves or resolves a continuing story thread that makes the next level feel like a deeper layer of the same larger case.

Chapter flow:

1. **Chapter 1 — Training Level 1: The First Lie**
2. **Chapter 2 — Rookie Detective: The Sponsor Gap**
3. **Chapter 3 — Junior Detective: The Charity Mirror**
4. **Chapter 4 — Detective: The Sound Booth Sale**
5. **Chapter 5 — Senior Detective: The Black Pelican**

Checkpoint questions still only cover the evidence revealed in that round. Final accusation questions can use the whole chapter and may point to the larger continuing story.
