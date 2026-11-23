# MileMarker setup on Vercel

Everything runs from this GitHub repository on Vercel:
- `index.html` — the app
- `api/` — the back end (AI planning, email and Google sign-in, profiles, saved trips, chat history)

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
| `RESEND_API_KEY` | from step 3b — sends confirmation and password-reset codes |
| `MAIL_FROM` | e.g. `MileMarker <hello@yourdomain.com>` (an address on your domain verified in Resend) |

Then **Deployments > ⋯ > Redeploy** so the new settings take effect.

## 3. Google sign-in ("Continue with Google")
1. **console.cloud.google.com** > create a project called `MileMarker`.
2. **APIs & Services > OAuth consent screen**: External, app name `MileMarker`, your support email, your site as the app domain, and a link to your privacy policy.
3. **Credentials > Create credentials > OAuth client ID** > **Web application**. Under **Authorized JavaScript origins** add your Vercel address (e.g. `https://milemarker.vercel.app`) and later your own domain.
4. Copy the Client ID (ends in `.apps.googleusercontent.com`). Add it in Vercel as `GOOGLE_CLIENT_ID`, and paste it into `index.html` at `const GOOGLE_CLIENT_ID=""` (or send it to Claude to do it).

## 3b. Email sign-up (confirmation codes)
People can create an account with email and password. They get a 6-digit code by email to confirm it, and can reset a forgotten password the same way.
1. Sign up free at **resend.com** (3,000 emails a month free).
2. **Domains > Add domain** > enter your domain (e.g. `milemarker.app`) > add the DNS records it shows at your domain registrar > wait until it says **Verified**.
3. **API Keys > Create API key** > copy it. Add it in Vercel as `RESEND_API_KEY`, and add `MAIL_FROM` as `MileMarker <hello@yourdomain.com>`. Redeploy.

Until `RESEND_API_KEY` is set, new email accounts are created right away without a confirmation code, so you can test sign-up now. Before your own domain is verified, Resend's test sender only delivers to your own Resend email address.

## 4. Test
1. Open your Vercel address and plan a trip. Real campground names and two route choices mean the AI is working.
2. Tap **Ask MileMarker** > sign in with Google > the chat opens and greets you.
3. Save a trip, reload: you should see **Welcome back** and **Quick plan**.
4. Tap **Sign in > Create an account**, enter your email and a password, and type the code from the email. Tap your name to fill in your profile (home base, RV, who usually travels).
5. Tap your name > **Delete my account** to confirm deletion works.

## Notes
- The GitHub Pages copy (rijaleeda.github.io/milemarker) runs without the back end: offline planning only. Share the Vercel address.
- Chat limit: 60 messages per person per day (`CHAT_LIMIT_PER_DAY` in `api/ai.js`).
- If a setting is missing, the app keeps working with offline planning and the back end answers `not_configured` / `no_database`.
- You can delete the old Cloudflare Worker once Vercel is working.
