# MileMarker setup: accounts, personalized plans and chat history

You need about 30 minutes. Everything below is free.

## 1. Database (Cloudflare D1)
1. Cloudflare dashboard > **Storage & Databases > D1 > Create database**. Name it `milemarker`.
2. Open the database > **Console**. Paste everything from `schema.sql` and click **Execute**.

## 2. Update your Worker
1. Open your Worker (`cold-unit-215a`) > **Edit code**. Replace everything with the new `worker.js` and click **Deploy**.
2. **Settings > Bindings > Add > D1 database**. Variable name: `DB`. Database: `milemarker`.
3. **Settings > Variables and Secrets**, add:
   - `SESSION_SECRET` (Secret): any long random text, 40+ characters. Example: mash the keyboard, or use a password generator.
   - `GOOGLE_CLIENT_ID` (Text): from step 3 below.
   - Keep `ANTHROPIC_API_KEY` and `ALLOWED_ORIGIN` as they are.

## 3. Google sign-in ("Continue with Google")
1. Go to **console.cloud.google.com** and create a project called `MileMarker`.
2. **APIs & Services > OAuth consent screen**: choose **External**. App name `MileMarker`, your support email, your website as the app domain, and a link to your privacy policy page.
3. **APIs & Services > Credentials > Create credentials > OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**: your site address, `https://rijaleeda.github.io` (add `https://milemarkerrv.com` too once you have it)
4. Copy the **Client ID** (ends in `.apps.googleusercontent.com`). Put it in the Worker as `GOOGLE_CLIENT_ID` **and** send it to Claude to place in `index.html` (or paste it yourself into `const GOOGLE_CLIENT_ID=""` near the top).

## 4. The app is hosted on GitHub Pages
The site is published from this repository at https://rijaleeda.github.io/milemarker/ . Any change to `index.html` pushed to `main` goes live in a minute or two.

- In the Worker, set `ALLOWED_ORIGIN` to every address your site runs on, separated by commas, with no path and no trailing slash. Example: `https://rijaleeda.github.io, https://milemarker.vercel.app`
- In Google Cloud, add each of those addresses under **Authorized JavaScript origins**.

The site is also deployed by Vercel from this repository; every push to `main` updates both.

## 5. Test
1. Open your site, tap **Ask MileMarker**. You should be asked to sign in.
2. Continue with Google. The chat opens and greets you by name.
3. Plan a trip and save it. Reload the page: you should see **Welcome back** and **Quick plan**.
4. Tap your name (top right) > **Delete my data** to confirm deletion works.

## Limits built in
- Chat: 60 messages per person per day (change `CHAT_LIMIT_PER_DAY` in worker.js).
- Up to 100 saved trips and the last 200 chat messages per person.
- Plans (without chat) still work for visitors who aren't signed in.
