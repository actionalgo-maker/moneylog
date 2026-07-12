# MoneyLog

A multi-user income & expense tracker that installs on your phone like an app. Each person picks their name, logs their own income/expense entries, and only sees their own data. One account is the **main/admin account** — it can view every user's entries, filter by user, and see an all-user breakdown.

Deep navy theme with violet/gold accents, an emoji category picker, and a bottom Home / Reports / Add / Budgets navigation — styled to match the reference expense-tracker app, with income tracking, multi-user accounts, and per-user budgets layered on top.

All data is stored as a JSON file in a GitHub repo (free, versioned, survives app updates). There is no server — the app talks to GitHub directly from your phone's browser.

**Security note:** login is username-only, no password (as requested) — anyone who opens the app can tap any name and see that account's dashboard on that device. This is fine for personal/family use where you trust everyone with phone access, but it is not real security. The GitHub token that syncs the data is also shared by every user of the app, so anyone with the token could technically read/write all data directly via GitHub, bypassing the app's UI. Don't use this for anything where you need guaranteed privacy between users.

## Already have the repo set up? Just updating files

If you've already created the repo, enabled Pages, and generated a token, skip straight to this: upload the new `index.html`, `manifest.json`, `service-worker.js`, the three icon PNGs, and this `README.md` to the repo root (**Add file → Upload files**, commit to `main`). Your data file (`data/moneylog.json`) is separate and untouched.

**Important:** `service-worker.js` controls caching — if you update `index.html` but skip re-uploading `service-worker.js`, the browser won't notice anything changed and will keep serving the old cached version indefinitely. Always upload it alongside `index.html`. After committing, fully close and reopen the tab/app on your phone (not just a normal refresh) so the new service worker takes over.

## 1. One-time GitHub setup

### Create the repo
1. Go to [github.com/new](https://github.com/new).
2. Name it something like `moneylog`.
3. Set it to **Public** (GitHub Pages hosting is free only on public repos, unless you have GitHub Enterprise Cloud). Your data is still gated by the access token, not repo visibility.
4. Click **Create repository**.

### Upload the app files
1. On the repo's page, click **Add file → Upload files**.
2. Upload all 6 files together: `index.html`, `manifest.json`, `service-worker.js`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, plus this `README.md`.
3. Commit directly to the `main` branch.
   - If you already have these files in the repo from an earlier version, just upload the new ones again — GitHub will ask to replace them. Your data file (`data/moneylog.json`) is untouched either way.

### Enable GitHub Pages
1. In the repo, go to **Settings → Pages**.
2. Under "Build and deployment", set **Source** to "Deploy from a branch".
3. Set **Branch** to `main`, folder `/ (root)`, then **Save**.
4. Wait ~1 minute, then your app is live at `https://<your-github-username>.github.io/moneylog/`.

### Create a Personal Access Token (so the app can read/write your data file)
1. Go to `github.com/settings/personal-access-tokens/new` (this is under your **account** Settings, not the repo's Settings tab).
2. **Resource owner**: you.
3. **Repository access**: "Only select repositories" → choose `moneylog`.
4. **Permissions → Repository permissions → Contents**: set to **Read and write**. (Metadata gets added automatically as read-only — leave it.)
5. Generate the token and copy it (starts with `github_pat_...`). You won't be able to see it again — if you lose it, just generate a new one.

## 2. Set up the app on your phone

1. Open `https://<your-github-username>.github.io/moneylog/` in **Safari** (iPhone) or **Chrome** (Android) — not an in-app browser like Instagram/Twitter, which usually can't install PWAs.
2. Pick your name on the login screen.
3. Tap the ⚙️ icon (top right) and fill in:
   - GitHub username / org: your GitHub username
   - Repository name: `moneylog`
   - Branch: `main`
   - Data file path: `data/moneylog.json` (default is fine — the app creates this file on first save)
   - Personal Access Token: paste the token from above
4. Tap **Save & Connect**. The status dot next to "Not connected" turns green when it works.
5. Install to your home screen:
   - **Android Chrome**: tap the **⋮** menu → "Install app" (or "Add to Home screen").
   - **iOS Safari**: tap the **Share** icon → "Add to Home Screen".
6. Repeat steps 1–5 on each person's phone, using the **same token and repo settings** but picking their own name on login.

## 3. Using it

The bottom bar has four screens:

- **🏠 Home**: a big "Net" hero card for whichever period you pick from the dropdown (Today / This Week / This Month / This Year / All Time — defaults to Today), plus an all-time net reference line and your recent activity grouped by day underneath.
- **📊 Reports**: three sub-tabs.
  - **Monthly**: browse month by month with ◀ / ▶ arrows (capped so you can't go past the current month). Shows Income / Expense / Net stat cards, an expense-by-category breakdown (sorted bars, not a pie chart — easier to compare at a glance), and a compact 6-month trend chart for context.
  - **Fin. Year**: same idea, one financial year at a time (April–March).
  - **Categories**: your all-time expense and income totals by category.
  - **Export CSV** button at the bottom exports your full entry history (or, for the admin account, whichever user is selected in "Viewing" — all of that user's history, not just the month/year you're currently browsing). The admin account also sees an all-user breakdown on the Monthly tab when "Viewing: All users" is selected.
- **➕ Add**: toggle Expense or Income at the top, punch in the amount, tap a category (emoji grid, defaults to the first category — Food or Salary — changes depending on Expense vs Income), optionally add a note, set the date and payment method, then Save. The floating ➕ button on Home/Reports/Budgets jumps here too.
- **🎯 Budgets**: set a monthly spending limit per expense category; a progress bar shows this month's spend against it and turns amber near the limit, red once you're over. Each account manages only its own budgets.

You can only edit/delete your own entries (the admin account can edit anyone's). Tap 🔁 to switch accounts, ⚙️ for GitHub sync settings.

## 4. Adding, renaming, or removing users later

Users are defined near the top of `index.html`'s `<script>` section:

```js
const USERS = [
  { username: "yonko", label: "Yonko", role: "user" },
  { username: "admin", label: "Admin", role: "admin" }
];
```

To add someone, add another object to this array (`role` is `"user"` or `"admin"`). To rename someone, change `label` (keep `username` fixed once they have entries, since entries are tagged by `username`, not `label`). Edit the file, re-upload it to the repo (just this one file — the data file is separate and untouched), and everyone's app picks up the change on next load.

Categories are defined right below `USERS` in the same `CATEGORIES` object, each with a `name`, `emoji`, and `color` (used for chips, budget bars, and the Reports category breakdown) — edit that list the same way to add/rename/remove categories. The first category in each list (Food / Salary) is the one pre-selected when you open the Add screen.

## 5. Two gotchas to know about

- **In-app browsers** (Instagram/Twitter/Threads webviews) often hide "Add to Home Screen" — open the link in the real Safari/Chrome app instead.
- **Cached old version**: `service-worker.js` controls what's cached. If you update `index.html` without re-uploading `service-worker.js`, the browser won't detect anything changed and will keep serving the old version indefinitely — always upload both together. Even with both updated, an already-installed phone may show the old version once more before the background-fetched update takes effect on the next open; closing and reopening the app fully (not just refreshing) speeds this up.
