# Match Tagger · website with your OneDrive folder

Match Tagger as a website that works with a folder on your computer. Put that folder in OneDrive and the OneDrive app keeps your analyses and videos in sync with the cloud and your other computers. No Microsoft sign-in, no Azure, no registration.

Works in **Google Chrome** or **Microsoft Edge** on a computer (Windows or Mac).

## What's in this folder

| File | What it is |
|---|---|
| `index.html` | The app |
| `folder.js` | Reads and saves files in your Match Tagger folder |
| `vendor/pptxgen.bundle.js` | Library for the PowerPoint exports |

## Your Match Tagger folder

```
OneDrive
└── Match Tagger
    ├── Videos      ← put your match videos here (subfolders per season are fine)
    ├── Data        ← created by the app: one file per match + settings.json (squad, tags, team)
    ├── Exports     ← clips and presentations you save from the app
    └── Backups     ← backup files you save from the app (optional)
```

---

## Setup (once)

### 1 · Put the new version online

If your site is already on Netlify:

1. Unzip **match-tagger.zip**.
2. Log in at **app.netlify.com** and open your project (for example *yla-match-tagger*).
3. Go to **Deploys**. At the bottom of the page is a box "Need to update your project? Drag and drop your project output folder here".
4. Drag the folder **match-tagger-site** (the folder itself) onto that box. After a few seconds the new version is live on the same address.

New on Netlify? Go to **app.netlify.com/drop** and drag the folder there.

### 2 · Make sure OneDrive is on your computer

- **Windows:** OneDrive is built in. Open File Explorer: you see **OneDrive** in the left column. If not, start the OneDrive app from the Start menu and sign in.
- **Mac:** install **OneDrive** from the App Store, sign in, and it appears under **Locations** in Finder.

In that OneDrive folder, create a folder **Match Tagger**, with a folder **Videos** inside it. Put your match videos (.mp4 or .mov) in **Videos**.

**Recommended:** right-click the folder **Match Tagger** and choose **Always keep on this device**. Otherwise OneDrive downloads each video only when you open it.

### 3 · Connect the folder in the site

1. Open your site in Chrome or Edge.
2. Click **Choose folder**.
3. Go to **OneDrive › Match Tagger** and click **Select folder** (Mac: **Select**).
   Selecting **OneDrive** itself also works; the app then creates *Match Tagger* inside it.
4. Chrome asks if the site may view and edit the files in this folder. Choose **Edit files** (or **Allow**).

At the top right you now see **Saved to your folder**.

### 4 · Bring your matches over from the Claude version

1. In the **Claude version** of Match Tagger: **Analyses → Back up all matches** (bottom of the page). A .json file downloads.
2. In the site: **Analyses → Open backup**, choose that file, check the list and click **Restore**.

Your saved tagging boards, custom tags and panel layout are not in that file. Set your board up once in the site, then use **Edit layout → Save board** there.

Your matches, squad, tags and team name are now in **Match Tagger › Data**. Videos with the same file name as before are linked to their matches automatically.

---

## Daily use

- **Opening the site:** Chrome asks once per visit whether the site may open your folder again. Choose **Allow on every visit** and this question disappears.
- **Status at the top right:** "Saved to your folder" means everything is saved. Click it to check for new videos, choose another folder, or disconnect.
- **New video:** put it in **Match Tagger › Videos**, open the match in the tagger, and pick it from the list. The app suggests the video whose name contains the opponent or the date. After that it opens automatically.
- **Exports:** clips and presentations download to your computer. Click **Also save to folder** in the message that appears to keep a copy in **Match Tagger › Exports**. OneDrive puts it in the cloud, so you can share it from there.
- **Another computer:** install OneDrive there too, open the site, and choose the same Match Tagger folder. Your matches and videos are there.
- **Two computers at the same time:** the last save wins per match. Do not tag the same match on two computers at once.

## Live tagging (no video yet)

1. **New match** → fill in the opponent and lineup → **Create and tag live**. Or, in a match without video: **Tag live without video**.
2. The tagging board fills the page. Click **Start 1st half** at kick-off, then **End 1st half**, **Start 2nd half** and **End match**. The clock and score run by themselves.
3. Tag by clicking a player and a tag, or with the keyboard shortcuts.
4. After the match, put the video in **Match Tagger › Videos**, click **Add video & sync**, pick the video, scrub to the kick-off and click **It happens now**. If the recording was paused at half-time, also mark the 2nd-half kick-off.
5. Sync off? **Setup → Sync live tags again**.

## Backups

Everything is already saved in your folder automatically. A backup file is an extra safety copy.

- **Save backup** (top right in the tagger, also in the live bar, or **Ctrl+S**) downloads a file with all tags of that match. Click **Also save to folder** to keep it in **Match Tagger › Backups**.
- An orange dot on **Save backup** means you changed tags since the last backup.
- **Analyses → Back up all matches** saves every match in one file.
- **Open backup** (Home, Analyses or the Setup tab) restores from a file. You see per match whether the backup is newer or older than what is in the app and choose **Replace** or **Skip**.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Open in Chrome or Edge" | The site needs Chrome or Edge on a computer. Safari, Firefox and phones are not supported. |
| Chrome says it cannot open this folder because it contains system files | Pick the Match Tagger folder inside OneDrive, not your user folder, Desktop or Documents itself. |
| A video takes long to start | OneDrive is still downloading it. Set the Match Tagger folder to **Always keep on this device**. |
| A video plays but clips cannot be cut | Only .mp4 and .mov can be cut in original quality. Convert other formats to .mp4. |
| Matches from my other computer do not show up | Check that OneDrive has finished syncing (OneDrive icon in the taskbar or menu bar), then reload the site. |
