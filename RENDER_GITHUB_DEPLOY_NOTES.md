# Render / GitHub Deploy Notes

This zip is structured for Render and GitHub.

When you open the GitHub repo root, you should see these files directly on the first page:

- package.json
- server.js
- render.yaml
- database.js
- public/
- truth-packs/
- data/

Do not upload the outer zip folder as a nested folder. Upload the CONTENTS of this package to the root of the GitHub repository.

Render settings:

- Root Directory: leave blank
- Build Command: npm install
- Start Command: npm start

The included render.yaml also uses:

- Build Command: npm cache clean --force && npm install --no-audit --no-fund
- Start Command: npm start
