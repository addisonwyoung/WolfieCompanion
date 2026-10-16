# Teammate setup for Wolfie Companion

Follow these steps to run the same account-enabled app locally from `codex/supabase-accounts-and-enrollments`. Use the team's existing Supabase project for Google sign-in, saved profiles, pictures, and classes. Everyone gets the same interface, but each Google account has its own private profile and course list; new accounts start empty.

## 1. Get the branch

Addison must push the branch before teammates can fetch it:

```sh
git push -u origin codex/supabase-accounts-and-enrollments
```

If you already have the repository, open a terminal in its root folder:

```sh
git fetch origin
git switch --track origin/codex/supabase-accounts-and-enrollments
```

If that local branch already exists, use:

```sh
git switch codex/supabase-accounts-and-enrollments
git pull --ff-only origin codex/supabase-accounts-and-enrollments
```

If Git reports local changes would be overwritten, save or commit your work before switching; do not discard it.

If you do not have the repository yet:

```sh
git clone --branch codex/supabase-accounts-and-enrollments https://github.com/addisonwyoung/WolfieCompanion.git
cd WolfieCompanion
```

You need access to the GitHub repository. All commands below start from the repository root, the folder containing `client`, `server`, and `docs`.

## 2. Install dependencies

Use Node.js 22.13 or newer in the 22.x line, or Node.js 24+. The app was checked locally with Node.js 22.14.0. Confirm Node and npm are available:

```sh
node --version
npm --version
npm --prefix client ci
npm --prefix server ci
```

Install both folders. There is no root package.json, so running `npm install` in the repository root will fail.

## 3. Add the shared Supabase configuration

Ask Addison for the team's **Supabase Project URL** and **publishable key** (`sb_publishable_...`), or copy them from the shared project's Connect dialog if you have dashboard access. Use the same project as Addison. You do not need the database password, connection string, service-role key, or Google client secret.

Create `client/.env.local` and paste the following, replacing both placeholders with the full values:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Create `server/.env.local` with the same two values and these variable names:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Quotes are not required. Do not put spaces around `=`. These local files are ignored by Git and do not arrive when you pull the branch. The checked-in `.env.example` files are templates. Existing local env files should be edited rather than overwritten. Restart the processes below after changing configuration.

The SQL migration only needs to be applied once to the shared Supabase project. If Addison already applied it there, teammates should not create another project or run setup SQL again.

## 4. Confirm shared Google access

Addison or whoever manages the Google Cloud project should confirm Google is enabled in the shared Supabase project and the Web OAuth client's credentials are saved there. Those credentials stay in Supabase; teammates do not create separate OAuth clients.

If Google requires test-user access for the project's current audience/testing configuration, add each teammate's **Stony Brook Google email** under Google Auth Platform → Audience → Test users.

The shared Supabase project's Authentication → URL Configuration must contain:

- Site URL: `http://localhost:5173`
- Redirect URL: `http://localhost:5173/auth/callback`

Use `localhost:5173` for the frontend on every teammate's machine. Do not change the shared Site URL to another person's LAN IP. Google's authorized redirect URI remains the shared Supabase callback, `https://YOUR_PROJECT.supabase.co/auth/v1/callback`; it is different from the frontend callback above. For provider setup details, see [Supabase account setup](supabase-accounts.md).

## 5. Start the app in two terminals

In terminal 1, from the repository root:

```sh
cd server
node --env-file=.env.local --import tsx src/index.ts
```

Wait for `Wolfie API ready`. Leave this terminal running. This command loads the server's env file; plain `npm run dev` does not explicitly load that file.

In terminal 2, from the repository root:

```sh
cd client
npm run dev -- --host localhost --port 5173 --strictPort
```

Leave this terminal running too. Open **http://localhost:5173** in your browser, then click **Continue with Google** and choose your **@stonybrook.edu** account.

The frontend forwards `/api` requests to the local API on port 3000. `--strictPort` prevents Vite silently moving to a different port that is missing from the Google/Supabase redirect setup. If either port is occupied, stop your own older development server using Ctrl+C in its terminal before restarting; do not stop an unrelated process.

## 6. Check the experience

1. Sign in. A new account should show your profile and an empty course list, rather than Addison's private data.
2. Select Edit profile. Change your name, major, year, interests, or commuter/dormer status, then Save. Optional fields can stay empty.
3. Refresh. Confirm the saved details remain.
4. Use Enter classes manually. Enter `CSE 310` and section `01`, then Save classes. Refresh and confirm the class and section return.
5. Optionally edit your profile to upload a PNG/JPEG picture up to 5 MiB. Save and refresh to check it. Picture upload requires terminal 1 to stay running.
6. Sign out and back in. Your saved profile and classes should return automatically.

Classmates are labeled fictional demo profiles. Real classmates' private data is not exposed. Course evaluations remain a sample feature. Study-space reports are stored in each local API's `server/data/crowd-reports.json`, so teammates running separate APIs will not share those reports. Account profiles/classes/pictures do share the Supabase project, while access remains private to the signed-in owner.

## 7. Optional screenshot extraction

Google sign-in and manual class entry work without Google Vision. Screenshot extraction needs separate Google Vision credentials and a development opt-in on each machine; the Google sign-in Client ID/secret does not configure Vision.

For OCR, follow [the server's cloud setup](../server/README.md#schedule-ocr-experiment-cloud-setup) using your own authorized Google account. The project owner must grant the needed project access and ensure Vision and billing are enabled. Set up Application Default Credentials as documented there.

Then stop terminal 1 and add these lines to `server/.env.local`:

```env
ENABLE_SCHEDULE_PREVIEW=1
SCHEDULE_PREVIEW_ORIGIN=http://localhost:5173
```

Restart terminal 1 using the same `node --env-file=.env.local --import tsx src/index.ts` command. Keep `NODE_ENV` unset or development for this local flow; the OCR endpoint is disabled in production.

In the app, choose Import schedule, select a PNG/JPEG up to 10 MiB, select the layout, and press Extract classes. Review/correct the course codes and sections, then explicitly click Add to Your courses to save. Extraction sends the image to Google and uses the team's Google Vision quota/billing. Selection or draft edits alone do not save classes; screenshots and raw OCR text are not saved by the app.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| Account setup needed | Create `client/.env.local`, use the exact `VITE_` variable names, and restart Vite. |
| Google `redirect_uri_mismatch` | The Google OAuth client must allow the shared **Supabase** callback URL, copied from Supabase's Google provider settings. |
| Google access blocked or test-user message | Ask the Google project owner to check audience/test-user access. School account administrator restrictions can also require approval. |
| Sign-in returns to the wrong address | Check Supabase's Site URL and exact frontend Redirect URL; open the app using `http://localhost:5173`. |
| Use a verified Stony Brook account | Select your verified `@stonybrook.edu` Google account; personal Gmail accounts are intentionally ineligible. |
| Unable to load profile/classes | Check the project URL/key match the shared project, the migration was applied there, and try Retry loading account. |
| Picture storage unavailable | Keep the API running with `--env-file=.env.local`; check its Supabase variables match the frontend project. |
| Schedule preview disabled | Complete the optional OCR setup, set `ENABLE_SCHEDULE_PREVIEW=1`, and restart the API. Manual class entry still works. |
| `EADDRINUSE` or port already in use | Stop your older app process in its terminal, then restart on the documented ports. |
| Different content from Addison | Compare branch/commit with `git branch --show-current` and `git log -1 --oneline`; each real account's personal data will differ. |

For future updates, stop the two app terminals, pull with `git pull --ff-only`, rerun `npm --prefix client ci` and `npm --prefix server ci`, and start both terminals again. Keep your `.env.local` files. If an update adds a database migration, coordinate its application once to the shared project with the team.
