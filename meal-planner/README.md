# Pantry — Nick & Pascale

Meal planning, pantry tracking, and budget management for two.

## Deploy in ~15 minutes

### 1. GitHub
- Create a new repo at github.com (name it anything, e.g. `pantry-app`)
- Upload all these files maintaining the folder structure
- Or use GitHub Desktop / `git push`

### 2. Supabase (for shared pantry between you and Pascale)
1. Go to supabase.com → New project
2. Name it `pantry`, pick any region
3. Once created, go to **SQL Editor** → paste contents of `supabase-schema.sql` → Run
4. Go to **Settings → API**
5. Copy: **Project URL** and **anon/public key**

### 3. Vercel
1. Go to vercel.com → Add New Project
2. Import your GitHub repo
3. Framework preset: **Other** (it's a static site)
4. Deploy — done. You'll get a URL like `pantry-abc123.vercel.app`

### 4. Configure the app
1. Open your Vercel URL
2. Tap the ⚙ settings icon
3. Paste in your Supabase URL and anon key
4. Save

Now both you and Pascale open the same URL and data syncs between you.

### 5. Add to home screen (iPhone)
- Open in Safari → Share → "Add to Home Screen"
- Works on Android too via Chrome → "Add to Home Screen"

## Features
- **Budget tracker**: groceries vs dining out, $250 hard cap
- **Pantry**: pre-loaded with your staples (garlic, olive oil, soy sauce, etc.)
- **Meal plan**: generate via Claude prompt → paste back
- **Shopping list**: auto-populated from meal plan, grouped by store
- **Receipt scanning**: upload to Claude → paste JSON back → pantry auto-updates
- **Spending log**: track who paid, where, with weekly rollup

## Using the AI features
Since the app doesn't have a built-in API key, the smart features work via copy-paste with Claude:

**Generate a meal plan:**
1. Tap "generate ↗" on the Plan tab
2. Copy the prompt
3. Paste into claude.ai
4. Copy Claude's JSON response
5. Paste back into the app → imported

**Scan a receipt:**
1. Tap "scan ↗" on the Shop tab
2. Open Claude in another tab, upload your receipt photo
3. Use the prompt shown in the app
4. Copy Claude's JSON response
5. Paste back → pantry and spending auto-update

## Weekly reset
Settings → "reset week" clears the current week's spending logs (pantry and meal plan stay).
