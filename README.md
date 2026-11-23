# MileMarker RV — trip planner

MileMarker builds an RV trip around the traveler. Answer a few quick questions — where you're going, how far you like to drive, how often you need breaks, and who's coming along — and get a day-by-day plan with route choices, timed breaks and places to stay. Sign in to chat with the planner, save trips, and get plans personalized to your history.

**Live site:** https://rijaleeda.github.io/milemarker/

## Files
| File | What it is |
|---|---|
| `index.html` | The whole app (one file, no build step). Hosted by GitHub Pages. |
| `worker.js` | Cloudflare Worker: AI planning, Google sign-in, saved trips and chat history. |
| `schema.sql` | Database tables for the Worker (Cloudflare D1). |
| `SETUP.md` | Step-by-step setup for the Worker, database and Google sign-in. |

## Settings in `index.html`
- `AI_ENDPOINT` — your Cloudflare Worker address.
- `GOOGLE_CLIENT_ID` — your Google sign-in client ID (leave empty until set up).

Secrets (the Anthropic API key and session secret) live only in Cloudflare, never in this repository.

Plans are estimates. Phone maps don't know an RV's height — check clearances with an RV route planner and confirm campgrounds by phone.
