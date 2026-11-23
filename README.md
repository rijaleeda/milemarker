# MileMarker RV — trip planner

MileMarker builds an RV trip around the traveler. Answer a few quick questions — where you're going, how far you like to drive, how often you need breaks, and who's coming along — and get a day-by-day plan with route choices, timed breaks and places to stay. Sign in to chat with the planner, save trips, and get plans personalized to your history.

**Live site:** deployed on Vercel from this repository (GitHub Pages copy: https://rijaleeda.github.io/milemarker/ — offline planning only).

## Files
| File | What it is |
|---|---|
| `index.html` | The whole app (one file, no build step). |
| `api/` | Vercel functions: AI planning (`ai.js`), Google sign-in (`auth.js`), account (`me.js`, `prefs.js`, `account.js`), saved trips (`trips.js`), chat history (`messages.js`). |
| `package.json` | The one dependency: Neon's Postgres driver. |
| `SETUP.md` | Step-by-step setup for the database, settings and Google sign-in. |

## Settings in `index.html`
- `AI_ENDPOINT` — `/api` on Vercel (set automatically; empty on GitHub Pages).
- `GOOGLE_CLIENT_ID` — your Google sign-in client ID (leave empty until set up).

Secrets (the Anthropic API key and session secret) live only in Vercel's environment variables, never in this repository.

Plans are estimates. Phone maps don't know an RV's height — check clearances with an RV route planner and confirm campgrounds by phone.
