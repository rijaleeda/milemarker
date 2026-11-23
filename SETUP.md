# MileMarker setup on Vercel

Everything runs from this GitHub repository on Vercel:
- `index.html` — the app
- `api/` — the back end (AI planning, Google sign-in, saved trips, chat history)

Every push to `main` redeploys automatically. About 20 minutes, all on free plans.

## 1. Add the database (Neon Postgres)
1. Vercel dashboard > your **milemarker** project > **Storage** > **Create Database** > choose **Neon (Postgres)** > follow the prompts (free plan).
2. Connect it to the **milemarker** project for all environments. Vercel adds `DATABASE_URL` automatically.
3. Nothing to run — the app creates its tables the first time someone signs in.

## 2. Add your settings
Vercel > project > **Settings > Environment Variables**, add for **Production** (and Preview if you use it):

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key from console.anthropic.com |
| `SESSION_SECRET` | any long random text, 40+ characters (a password generator works) |
| `GOOGLE_CLIENT_ID` | from step 3 (add it when you have it) |

Then **Deployments > ⋯ > Redeploy** so the new settings take effect.

## 3. Google sign-in ("Continue with Google")
1. **console.cloud.google.com** > create a project called `MileMarker`.
2. **APIs & Services > OAuth consent screen**: External, app name `MileMarker`, your support email, your site as the app domain, and a link to your privacy policy.
3. **Credentials > Create credentials > OAuth client ID** > **Web application**. Under **Authorized JavaScript origins** add your Vercel address (e.g. `https://milemarker.vercel.app`) and later your own domain.
4. Copy the Client ID (ends in `.apps.googleusercontent.com`). Add it in Vercel as `GOOGLE_CLIENT_ID`, and paste it into `index.html` at `const GOOGLE_CLIENT_ID=""` (or send it to Claude to do it).

## 4. Test
1. Open your Vercel address and plan a trip. Real campground names and two route choices mean the AI is working.
2. Tap **Ask MileMarker** > sign in with Google > the chat opens and greets you.
3. Save a trip, reload: you should see **Welcome back** and **Quick plan**.
4. Tap your name > **Delete my data** to confirm deletion works.

## Notes
- The GitHub Pages copy (rijaleeda.github.io/milemarker) runs without the back end: offline planning only. Share the Vercel address.
- Chat limit: 60 messages per person per day (`CHAT_LIMIT_PER_DAY` in `api/ai.js`).
- If a setting is missing, the app keeps working with offline planning and the back end answers `not_configured` / `no_database`.
- You can delete the old Cloudflare Worker once Vercel is working.
