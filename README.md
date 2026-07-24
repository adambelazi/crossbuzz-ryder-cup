# Crossbuzz Ryder Cup — Rosapenna

Live scoring app for the trip. USA vs Europe, Day 1 fourball, Day 2 singles.
Everyone opens the same URL on their phone. Spectators see everything read-only;
players unlock scoring with the player PIN; the admin PIN unlocks full control.

Already pre-loaded:
- Both courses (Old Tom Morris white tees, St Patrick's Granite tees) with real
  par / stroke index / yardages
- Full roster with handicaps (Europe: Jeff 0, Keavo 34, Morrissey 18, Belazi 16,
  Finucane 12 — USA: Bermo 13, Staed G 16, Murph 18, Canny 12)

Default PINs (change them in the Admin tab after first login):
- Admin PIN: 2580
- Player PIN: 1234

---

## Deploy — step by step (no coding needed)

### 1. Set up the database (Supabase) — ~5 min
1. Go to supabase.com -> your project.
2. Left sidebar -> **SQL Editor** -> **New query**.
3. Open `supabase-schema.sql` from this folder, copy ALL of it, paste it in, press **Run**.
   You should see "Success. No rows returned."
4. Left sidebar -> **Project Settings** (gear icon) -> **API**. Keep this page open —
   you need two values from it in step 3:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (long string under "Project API keys")

### 2. Put the code on GitHub — ~5 min
1. Go to github.com -> click **+** (top right) -> **New repository**.
2. Name it `crossbuzz-ryder-cup`, leave everything else default, click **Create repository**.
3. On the new repo page, click the **"uploading an existing file"** link.
4. Drag the ENTIRE contents of this folder into the upload box
   (everything: `src` folder, `package.json`, `index.html`, `vite.config.js`, etc.
   You do NOT need `supabase-schema.sql` or `README.md` uploaded, but they're harmless).
5. Click **Commit changes**.

### 3. Deploy on Vercel — ~5 min
1. Go to vercel.com -> **Add New** -> **Project**.
2. Import the `crossbuzz-ryder-cup` repo (you've already connected GitHub, so it'll be listed).
3. Framework should auto-detect as **Vite**. Don't change build settings.
4. Expand **Environment Variables** and add these two (values from step 1.4):
   - Name: `VITE_SUPABASE_URL`      Value: your Project URL
   - Name: `VITE_SUPABASE_ANON_KEY` Value: your anon public key
5. Click **Deploy**. ~1 minute later you get your live URL,
   e.g. `https://crossbuzz-ryder-cup.vercel.app`.

### 4. Test it — ~10 min
1. Open the URL on your phone. You should see the app with the full roster loaded.
2. Tap Unlock -> enter 2580 -> you're admin. Go to Admin tab -> change both PINs.
3. Create a test match, enter a couple of scores, check the leaderboard.
4. Open the same URL on a second phone — scores should appear there within seconds.
5. Admin tab -> **Reset event** to wipe your test scores before the trip.
   (Reset keeps the roster and courses — it only clears matches and the feed.)

### 5. Share it
- Send the URL to the group chat.
- On iPhone: open in Safari -> Share -> **Add to Home Screen** = app icon, full screen.
- Give the lads the player PIN. Spectators need nothing — same link, view-only.

---

## Notes
- **Security, honestly:** the PINs gate the UI, not the database. Anyone with the
  URL could technically write data if they knew what they were doing. Fine for a
  lads trip; not a pattern for anything real.
- **Poor signal on the course:** the app saves your entry immediately and syncs
  when it can. If a save fails it re-pulls the server's version, so worst case
  you re-enter one hole.
- If the app loads but shows "Loading the tournament…" forever, the environment
  variables in Vercel are wrong/missing — re-check step 3.4, then redeploy
  (Deployments tab -> ⋯ on the latest -> Redeploy).

## Local development (optional, not needed to deploy)
```
cp .env.example .env   # fill in your two Supabase values
npm install
npm run dev
```
