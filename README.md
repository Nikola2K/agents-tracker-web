# Agents Development Tracker (web)

A gamified development tracker. Every agent has a character with skills, passions, traits,
pursued paths and a list of development actions. Agents log in to look at their own progress
and everyone else's; admins maintain the data.

- The website is plain HTML, CSS and JavaScript. There is nothing to build or install.
- Logins and data live in a free [Supabase](https://supabase.com) project.
- The site itself is hosted for free on GitHub Pages.

## Who can do what

| | Agent | Admin |
|---|---|---|
| See every agent's character | yes | yes |
| Change own display name and password | yes | yes |
| Change own body, shirt and hat (unlocked ones only) | yes | yes, for anyone |
| Set own skill passions | yes | yes, for anyone |
| Add / edit / remove own traits (grey) | yes | yes, for anyone |
| Change traits added by an admin (yellow) | no | yes |
| Skill levels, pursued paths, development actions, titles | no | yes |
| Unlock or lock items for an agent | no | yes |
| Read feedback on development actions | own only | everyone's |
| Create agents, reset passwords, delete agents | no | yes |
| Edit the skill template and the item catalogue | no | yes |

These rules are enforced by the database (`supabase/schema.sql`), not only by hiding buttons.
Usernames are only used to log in. They are never stored in the tables agents can read, so
agents cannot see each other's usernames. Admins see them under **Manage agents**.

## Try it first (no setup)

While `js/config.js` has no Supabase address, the site runs in **demo mode** with made-up data
that is not saved. To look at it on your own PC, open a terminal in this folder and run:

```
python -m http.server 8765
```

Then open <http://localhost:8765>. Use the links in the yellow bar to switch between the admin
and the agent view. (Opening `index.html` by double-clicking does not work; browsers block
scripts loaded that way.)

---

## Setup (about 20 minutes, all free)

### 1. Create the Supabase project

1. Go to <https://supabase.com>, sign up (free) and click **New project**.
2. Pick any name, choose a region close to your team, and let it generate a database password.
   Save that password somewhere; you will not need it for this site.
3. Wait a minute or two until the project is ready.

### 2. Create the tables and security rules

1. In the project, open **SQL Editor** (left sidebar).
2. Open `supabase/schema.sql` from this folder, copy **everything**, paste it into the editor
   and press **Run**.
3. It should finish with "Success. No rows returned". Run it only once.

### 3. Turn off public sign-ups

Only admins should be able to create logins.

1. Open **Authentication > Sign In / Providers**.
2. Turn **off** "Allow new users to sign up" and save.

Do not skip this. With sign-ups on, anyone who finds the site's address could create a login
for themselves and read everything.

### 4. Create your own admin login

1. Open **Authentication > Users > Add user > Create new user**.
2. Email: your chosen username followed by `@agents.internal`, for example
   `nikola@agents.internal`. Use lowercase letters, numbers, dot, dash or underscore.
3. Enter a password, tick **Auto Confirm User**, and create the user.
4. Back in **SQL Editor**, run this (with your own address):

   ```sql
   update public.profiles
   set role = 'admin', title = 'Admin'
   where id = (select id from auth.users where email = 'nikola@agents.internal');
   ```

   It should say "Success" and the **Table Editor > profiles** table should now show your row
   with role `admin`.

On the website you log in with just `nikola`; the site adds `@agents.internal` by itself. No
e-mail is ever sent to these addresses.

> If Supabase refuses the `@agents.internal` address when adding the user, pick another ending
> (for example a domain you own), use it here, and set the same ending as `LOGIN_DOMAIN` in
> `js/config.js`. Choose it once, before creating other logins.

### 5. Add the admin function

The website cannot create logins on its own, because that needs the project's secret key, which
must never be in a browser. A small server function does it instead.

1. Open **Edge Functions > Deploy a new function > Via Editor**.
2. Name the function exactly `admin-users`.
3. Delete the example code, paste the whole content of
   `supabase/functions/admin-users/index.ts`, and press **Deploy function**.

No secrets or settings need to be added. Leave the function's JWT verification at its default.

### 6. Connect the website to the project

1. Open **Settings > API Keys** (or press **Connect** at the top of the dashboard).
2. Copy the **Project URL** and the **Publishable key** (`sb_publishable_...`).
3. Open `js/config.js` in this folder and paste them between the quotes:

   ```js
   export const SUPABASE_URL = "https://abcdefghijklmnop.supabase.co";
   export const SUPABASE_KEY = "sb_publishable_...";
   ```

Both values are meant to be public. **Never** paste a secret key (`sb_secret_...`) or the
`service_role` key into any file of this site.

### 7. Publish the site with GitHub Pages

1. In **GitHub Desktop**, with this repository selected: write a summary such as "First
   version", press **Commit to main**, then **Push origin** (or **Publish branch**).
2. On <https://github.com/Nikola2K/agents-tracker-web> open **Settings > Pages**.
3. Under "Build and deployment" choose **Deploy from a branch**, branch **main**, folder
   **/ (root)**, and press **Save**.
4. After a minute or two the site is live at
   **<https://nikola2k.github.io/agents-tracker-web/>**. That is the link to give your agents.

GitHub Pages is free for **public** repositories. This is fine here: the repository contains no
passwords and no agent data (those live in Supabase). If you want the code private, use
[Cloudflare Pages](https://pages.cloudflare.com) instead: it is also free, works with private
repositories, and needs no build command (output folder `/`).

### 8. Log in and add your agents

1. Open the site and log in with your admin username and password.
2. Press **Manage agents**, fill in a username, password, display name and title, and press
   **Create agent**. Tell the agent their username and password.
3. Agents change their password and display name under **My account**.

---

## Day-to-day use (admin)

- **Open an agent** by clicking their tile at the top. Your own character is always top-left.
- **Agent box > Edit**: display name, title, role (agent / admin).
- **Skills > Edit**: levels (0-20) and passions. Clicking a flame also cycles the passion.
- **Traits > Edit**: traits you add are yellow and locked for the agent.
- **Pursued Paths > Edit**: job titles. Their experience is the sum of "experience towards
  path" from the agent's development actions.
- **Development > + Add action**: title, brief, stars, skill, type, date, experience,
  difficulty, path, description and feedback.
- **Wardrobe**: press **Unlock** on a locked item once the agent has earned it. **Lock** undoes it.
- **Skill template**: the skills every agent has. Adding one gives it to everyone at level 0;
  removing one removes it from everyone.
- **Manage agents**: create logins, reset a forgotten password, delete an agent.

## Adding new shirts, hats and bodies (PNG)

No code changes and no upload to GitHub are needed; it is done on the website.

1. Draw the picture as a **square PNG with a transparent background**. Make every sprite the
   same size (for example 256 x 256). All layers are stretched over the same square and stacked
   in this order: **body, shirt, head, hat**. So paint each part where it ends up on the agent:
   a hat PNG is mostly empty, with the hat near the top. Maximum 2 MB per file.
2. Log in as an admin and press **Items > + Add item**.
3. Choose the kind (Shirt, Hat or Body), give it a name, and choose the PNG under **Picture**.
4. Either tick **Unlocked for everyone from the start**, or leave it unticked and write what
   unlocks it. That text is shown on the locked item in every agent's wardrobe.
5. Press **Save**. The item appears in everyone's wardrobe immediately.

To replace the placeholder shapes of the existing items (the head, the four bodies, Basic Shirt,
Basic Hat), press **Edit** next to the item and choose a PNG. An item without a picture keeps
being drawn as a coloured placeholder, so you can add art one piece at a time.

## Good to know

- **Free Supabase projects pause after about a week without any activity.** Nothing is lost:
  log in to the Supabase dashboard and press the button to restore the project. If the site is
  used at least weekly this does not happen.
- The free plan allows roughly 500 MB of database and 1 GB of pictures, far more than this
  tracker needs. Check <https://supabase.com/pricing> for the current limits.
- **Feedback** on an action is only readable by the agent it is about and by admins. To let
  every agent read all feedback, see the comment above `feedback_read` in `supabase/schema.sql`.
- Passwords need at least 6 characters (Supabase's default).
- After changing files, commit and push with GitHub Desktop; the live site updates within a
  couple of minutes. Agents may need to reload the page.

## Troubleshooting

| Problem | Likely cause |
|---|---|
| The site shows the demo bar | `js/config.js` is still empty, or the change was not pushed yet. |
| "Wrong username or password" for a login that should work | The user was created with a different ending than `LOGIN_DOMAIN` in `js/config.js`. |
| "Your login has no agent profile" | The login was created before step 2 was run. Delete the user in the dashboard and add it again. |
| Creating an agent fails with a "Failed to send a request" style error | The function from step 5 is missing or not named exactly `admin-users`. |
| Creating an agent says "Admins only" | Your profile's role is not `admin`; repeat the SQL in step 4. |
| A page of errors about "permission denied for table" | Step 2 did not run completely; check the SQL Editor output. |

## Files

```
index.html                 the page
css/style.css              the look
js/config.js               your Supabase address and key (the only file to edit)
js/app.js                  main screen
js/dialogs.js              pop-up windows (wardrobe, editors, admin tools)
js/avatar.js               draws the agent and the flames
js/ui.js                   small helpers
js/api.js                  everything that talks to Supabase
js/api-demo.js             made-up data for demo mode
supabase/schema.sql        tables + security rules (run once in the SQL Editor)
supabase/functions/admin-users/index.ts   server function for creating logins
```
