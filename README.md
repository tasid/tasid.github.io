# FIFA World Cup 2026 — Schedule & Standings

A single-page site that shows all 104 fixtures with time-zone conversion, country/date/stage
filters, FIFA rankings, and live group standings. Scores are loaded from `results.json`, which a
scheduled GitHub Action rewrites nightly from a football data API.

## Structure

```
.
├── index.html                      # the page (static schedule; fetches results.json for scores)
├── results.json                    # scores — updated automatically by the Action
├── scripts/
│   └── update-results.mjs          # fetches scores from API-Football, rewrites results.json
└── .github/workflows/
    └── update-scores.yml           # nightly cron job that runs the script and commits
```

## How it works

- `index.html` holds the fixed schedule (teams, kickoff times, venues). On load it `fetch`es
  `results.json` and overlays the scores, then recomputes statuses and standings every minute.
- The Action runs on a cron schedule, calls the API, writes `results.json`, and commits it.
  GitHub Pages redeploys on that commit, so the public page picks up new scores automatically.

## Setup (summary — see chat for full walk-through)

1. Push these files to a GitHub repo.
2. **Settings → Pages** → Source: *Deploy from a branch* → `main` / `root`.
3. Get a free API key at https://www.api-football.com and add it under
   **Settings → Secrets and variables → Actions → New repository secret**
   named `API_FOOTBALL_KEY`.
4. **Actions** tab → enable workflows → open *Update scores* → *Run workflow* to test.

## Run the updater locally

```bash
API_FOOTBALL_KEY=your_key node scripts/update-results.mjs
```

## Notes

- Only group-stage results are auto-mapped (knockout teams aren't known until the bracket
  resolves). Add knockout results/teams to `results.json` manually, or extend `update-results.mjs`.
- If a provider spells a country differently, add it to the `ALIAS` table in the script.
- Swap data providers by editing `fetchFixtures()` only.
