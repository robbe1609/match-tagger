# Match Tagger · website with online storage

Your videos and tags live in your own online storage at Cloudflare. Upload a video once, then watch, tag and cut clips from any computer and any browser. No OneDrive app needed.

The folder setup (a Match Tagger folder in OneDrive) still works too. You choose when you open the site.

## What's in this zip

| Folder | What it is | Where it goes |
|---|---|---|
| `match-tagger-site` | The website | Cloudflare Pages (published from GitHub) |
| `storage-service/worker.js` | The small storage service that guards your videos | Cloudflare (copy and paste) |

## What it costs

- **Cloudflare Workers** (the storage service): free plan.
- **Cloudflare R2** (the storage itself): the first 10 GB are free, then about $0.015 per GB per month. Watching and downloading your own videos costs nothing extra. A season of full matches (around 100 GB) comes to roughly $1.50 a month.
- Cloudflare asks for a payment method before you can turn on R2, even if you stay within the free 10 GB.

---

## Setup · part 1 · Cloudflare (about 15 minutes)

### 1 · Create an account

1. Go to **dash.cloudflare.com/sign-up**, sign up with your email and confirm the email.
2. You do not need to add a website or domain. Skip that if Cloudflare asks.

### 2 · Turn on R2 and create the storage bucket

1. In the left menu, open **R2 Object Storage** (it may sit under **Storage & Databases**).
2. Click **Purchase R2 Plan** / **Get started** and add a payment method. You stay on the free tier until you go past 10 GB.
3. Click **Create bucket**.
4. **Bucket name:** `match-tagger`
5. **Location:** leave it on **Automatic**, or pick **Western Europe** as a location hint.
6. Click **Create bucket**. Leave it **private**: do not turn on public access.

### 3 · Create the storage service (a "Worker")

1. In the left menu, open **Workers & Pages** (under **Compute**).
2. Click **Create** → **Create Worker** / **Start with Hello World!**.
3. **Name:** `match-tagger-storage` → click **Deploy**.
   - If Cloudflare asks you to pick a **workers.dev subdomain**, choose something short, for example your name.
4. Click **Edit code**.
5. Delete all the example code in the editor.
6. Open `storage-service/worker.js` from this zip in Notepad (Windows) or TextEdit (Mac), select everything, copy it, and paste it into the editor.
7. Click **Deploy** (top right).

### 4 · Connect the bucket to the Worker

1. Go back to your Worker `match-tagger-storage` (click its name at the top, or via **Workers & Pages**).
2. Open **Bindings** (or **Settings** → **Bindings**) → **Add binding** → **R2 bucket**.
3. **Variable name:** `BUCKET` (capitals, exactly like that).
4. **R2 bucket:** `match-tagger`.
5. Click **Add binding** / **Deploy**.

### 5 · Set your password

1. In your Worker, go to **Settings** → **Variables and Secrets** → **Add**.
2. **Type:** **Secret**.
3. **Variable name:** `ADMIN_PASSWORD` (capitals, exactly like that).
4. **Value:** the password you want to log in with. Make it long, for example four random words. Anyone with this password can see and delete your videos.
5. Click **Deploy**.

### 6 · Check it

1. On your Worker's page, find its address. It looks like `match-tagger-storage.yourname.workers.dev`.
2. Open that address in your browser. You should see:
   **"Match Tagger storage is ready."**
3. If it says something is missing, redo step 4 or 5. The names `BUCKET` and `ADMIN_PASSWORD` must match exactly.

Write down the address. You need it to log in.

---

## Setup · part 2 · the website

1. The website is published by **Cloudflare Pages** straight from the GitHub repository `match-tagger`. Every change pushed to `main` is online about a minute later, free (up to 500 updates a month).
2. Pages settings, in case you ever set it up again (**Workers & Pages** → **Create application** → **Pages** → **Connect to Git**): production branch `main`, framework preset **None**, build command empty, build output directory `match-tagger-site`.
3. The old Netlify site is no longer used (Netlify charges credits for every update).
4. Open your site.
   - **First time on this computer:** choose **Use online storage**.
   - **Already using a folder:** click the status at the top right → **Switch to online storage**.
5. Fill in your storage address (`match-tagger-storage.yourname.workers.dev`) and your password → **Log in**.

At the top right you now see **Saved online**.

### Bring your work over

- **Matches and tags:** if you used this browser before (with the folder or without), all matches in it are uploaded automatically when you log in. On another computer, log in there once as well and its matches are added too.
- **Matches from the Claude version:** **Analyses → Open backup** and choose a backup file you saved there.
- **Videos:** click **Saved online** (top right) → **Upload videos** and select your match videos. You can select many at once. Matches that were tagged on a video with the same file name are linked automatically.

---

## Calendar, week planner and match pages

The site opens on the **Calendar**. From there you plan everything:

- **Month calendar:** every training, day without training and match. Click a day to set training times and location, or to mark it "No training" with a reason. **Standard week** fills a whole month in one go.
- **Export the month:** **Export** gives a PDF or PowerPoint slide (dark, or light for printing) and a calendar file (.ics) for Google, Outlook or Apple Calendar.
- **Week planner:** click a week number (or **Week** at the top). Plan staff, gym, warm-up and kern forms per day, add coaching notes, and download the week as PDF or PowerPoint, with a detail slide per training. Times and locations come from the month calendar and changes go both ways.
- **Matches:** **+ Match** (or click a day) adds a match. Each match has its own page:
  - **Squad:** pick up to 20 players from your squad. The selection becomes the lineup in the tagger, where you choose the starting XI.
  - **Selection slides:** download the selection .pptx in the original YLA template, with times worked out from the kick-off and an optional opponent logo.
  - **Video:** link a video from your storage or upload one, then **Open in tagger** (or **Tag live** during the match).

### Training attendance

Click a training day in the calendar → **Take attendance** (or **Today's attendance** at the top of the calendar, or **Take attendance** on a day in the week planner). Tap a letter per player: **P**resent, **L**ate, **E**xcused, **A**bsent, **I**njured. **Mark the rest present** fills everyone you have not marked. Each player page shows her attendance for the season, the Players table has a **Train %** column, and **Export → Attendance (.csv)** gives a sheet per month or season.

Players from another group: on an attendance page click **Other team players…** and then **Other team** next to their name, or use **Mark as other team** on the player's page. They leave the attendance list, counts and exports for that whole season (their matches and stats stay). **Back to my team** undoes it.

### Bringing over the old Week Planner and Wedstrijdplanner

Your old planners' data comes as a file, `planner-import.json`. On the Calendar page, scroll down and click **Import planner data**, then choose that file. It adds your month calendar, your saved week plans and all fixtures with their squads. Matches that are already in the app (same date and opponent) are updated instead of duplicated, and players are matched to your squad by name.

## Player photos

- **One player:** open her page and click the number box (**+ Photo**) at the top left, or drop a photo on it. Click the photo later to change it. **Edit player** → **Remove photo** removes it.
- **Many at once:** on **Players**, click **Add photos** and select all the files. Name each file after the shirt number (`49.jpg`) or the player (`Debaermaeker Emma.jpg`). Files that don't match are listed so you can add them on the player's page.
- Photos are cropped to a portrait (the top of the picture is kept) and shrunk to a small JPG, then saved in your storage (`Data/photos`) so they show on every computer. Each browser also keeps a copy, so they load instantly and work offline.
- Use JPG or PNG. iPhone photos in HEIC format may not open in Chrome: share them as JPG first.

## Matches without video (entered by hand)

For a match you didn't film and didn't tag live, type in what happened.

- **Start:** on the match page click **Enter result by hand** (or, under Video, **No video: enter the result by hand**). For a match that isn't in the calendar yet: **New match** → **Create and enter by hand**.
- **Line-up:** for each player choose **Start**, **Bench** or **–** (not in the squad). Players picked for the matchday squad are already on the bench.
- **Match length:** half length, plus added time if you know it.
- **What happened:** add **Goal** (scorer, assist or own goal by the opponent), **Goal against**, **Substitution** (off and on), **Yellow card** and **Red card**, each with its minute: `23`, `45+2`, or `HT` for a change at half-time. In a 40-minute half the second half starts at minute 41. Rows sort themselves by minute.
- The page checks as you type (a substitute who was already on, a scorer who wasn't on the pitch) and shows each player's minutes straight away.
- The match then counts everywhere: score, report, minutes, goals and assists, the players chart and the 50% line. **Edit match data** on the report or match page opens it again.
- A match that was tagged on video keeps its data from the tagger and can't be entered by hand.

## Match types

Every match is a **Competition**, **Cup** or **Friendly** match. Pick it in the **Match type** dropdown when you add a match (calendar **+ Match** or **New match**), on the match page (**Edit match**) or in the tagger under **Setup**. Existing matches count as Competition.

- **Colours:** competition yellow, cup purple, friendly teal, in the calendar, its PDF/PowerPoint export, and as a small label in the match lists.
- **Filter:** next to **Season** you find **Matches: All / Competition / Cup / Friendly**. It applies to Analyses, Players (cards, table and chart, including the 50% line and the PDF), each player's page and Team. The choice is remembered in this browser. The Overview always shows all matches.

## Players chart

On **Players**, click **Chart** (next to Cards and Table).

- **Show:** minutes played, appearances, starts, training attendance, or any stat you tag (goals, assists, shots, recoveries…).
- **Total / Per match / Per 90 min:** per match divides by appearances; per 90 uses the minutes each player actually played.
- **The dotted line** is the average of the players on the chart, so it moves when you hide or show players.
- **The orange dashed line** (minutes only) is 50% of the available minutes: half of all minutes the team played in the matches of that season (with **Per match**, half a match). Players below it show their minutes in orange, and the header counts them.
- **The % in each bar** (minutes only) is the share of all available minutes that player played (with **Per match**, the share of a full match).
- **Export PDF** saves the chart as an A4 page with both lines and the legend. Long squads continue on a second page.
- **Players · x of y:** pick who is on the chart. **All**, **None**, **Only players with minutes** and **Hide other team** are quick filters; click a name to add or remove her. Your choice is remembered in this browser.
- The season picker at the top applies to the chart too.

## Tactics board

Open **Tactics** in the top menu. Every board is saved automatically to your folder or online storage, so it is on every computer you log in from.

- **Add your players:** click a name in **My players** to place her on the pitch, or drag the name onto the spot you want. Each player is a circle with her shirt number and name. A tick shows who is already on the board. Clicking her again selects her on the pitch.
- **Add other things:** under **Add**, click or drag a numbered player, an opponent, a ball, a cone or a mini goal.
- **Shapes:** pick a formation and click **Our team 1–11** or **Opponents 1–11**. Use **Line-up from** to place the starting XI of a tagged match. A shape replaces the players of that team; **Undo** brings them back.
- **Draw:** choose **Pass**, **Run** (dashed), **Dribble** (wavy), **Line**, **Draw** (freehand), **Area** or **Text** and drag on the pitch. Select an arrow and drag its white dot to curve it.
- **Edit:** click anything to select it. Change the number, name, team or colour in the bar above the pitch, drag to move, press Delete to remove. Ctrl+Z / Ctrl+Y undo and redo. Double-click a player or a text to edit it.
- **Pitch:** full pitch, full pitch upright, half pitch or no lines; grass or white (best for printing); small, medium or large players; short, full or no names.
- **Boards:** **New board**, **Duplicate** (handy for step 1, step 2…), **Rename** and **Delete** at the top.
- **Export:** **Export PDF** makes an A4 page with the board and your notes. **All boards PDF** puts every board in one file. **PNG** gives an image for WhatsApp or a slide.

## Lock screen

With online storage, the site locks itself after **1 hour without activity** (no mouse, keyboard, touch or scrolling, and no video playing). It also locks when you open it again after more than an hour away. Unlock it with your storage password (`ADMIN_PASSWORD`).

- **Lock now:** click **Saved online** at the top right → **Lock now**. All open tabs lock together and unlock together.
- **No internet** (for example at an away ground): the right password still unlocks. The site keeps a scrambled check of your password in the browser for this.
- **Changed the password in Cloudflare?** The new one works the next time you unlock with internet.
- The lock covers the screen; it is not a replacement for logging out on a shared computer (**Saved online** → **Log out**).



- **New match:** create it, then pick the video from your online storage, or click **Upload from this computer**. The video plays right away and uploads in the background, so you can start tagging immediately.
- **Keep the tab open while uploading.** The status at the top right shows the progress. If an upload stops (internet drop, closed tab), choose the same file again and it continues where it stopped.
- **Live tagging:** works as before. After the match, click **Add video & sync** and upload or pick the video.
- **Another computer:** open the site, choose **Use online storage** and log in. Everything is there. You stay logged in for 30 days per browser.
- **Exports:** clips and presentations download to your computer. Click **Also save online** to keep a copy in your storage (folder **Exports**).
- **Space used / download / delete videos:** click **Saved online** at the top right. You see every video, its size and which match uses it, with **Download** and **Delete** buttons. In a match you also find **Download video** under **Setup**.
- **Log out:** **Saved online** → **Log out**.
- **Change your password:** change the `ADMIN_PASSWORD` secret in Cloudflare (step 5). Every browser then has to log in again.

## How long uploads take

A full match of 3 GB takes about 20 minutes at an upload speed of 20 Mbps, and about 7 minutes at 60 Mbps. Check your upload speed at **fast.com** (click *Show more info*).

## Updating the storage service

When a new version of `storage-service/worker.js` comes with an update (for example version 2, which adds downloads):

1. **Workers & Pages** → **match-tagger-storage** → **Edit code**.
2. Select all the code in the editor, delete it, and paste the new `worker.js`.
3. Click **Deploy**. Your bucket, password and videos stay exactly as they are.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Cannot reach …" when logging in | Check the address. Open it in a browser: it must say "Match Tagger storage is ready". |
| "The storage is not finished" | The `BUCKET` binding or the `ADMIN_PASSWORD` secret is missing or misspelled (setup steps 4 and 5). |
| "Wrong password" | Use exactly the value of `ADMIN_PASSWORD`. Changed it? Log in with the new one. |
| A video does not play | Use .mp4 (H.264). Most cameras and Veo export this. Other formats can be stored, but your browser may not play them. |
| Download opens the video in a tab instead of saving it | Your storage service is still version 1. Update it (see *Updating the storage service*). |
| Upload stopped | Click **Try again** in the upload list, or choose the same file again. |
| "Not logged in" at the top right | Your 30 days are over or the password changed. Click it and log in again. Your work in this browser is kept and saved online after you log in. |
