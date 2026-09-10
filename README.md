# GRIMOIRE

An 8-bit medieval keeper of **notes**, a **journal** and a **to-do board**, built as an
installable PWA. Everything lives on your own device — there is no server, no account
and no network call once the page has loaded.

- **Scrolls** — notes, filed in **chambers** (folders) that nest as deep as you like
- **Chronicle** — one journal entry per day, with a mood and a month calendar
- **Rune bar** — headings, bullets, numbered lists, tick boxes, quotes, dividers,
  tables and a date & time stamp, in scrolls and chronicle entries alike. Formatting
  is applied as you write: a bullet looks like a bullet, a table like a table, with
  no markup characters to type and no reading mode to switch to
- **Pictures** — a few reference photos per scroll or entry, shrunk (and optionally
  redrawn in the 8-bit palette) and kept in this device's offline database
- **Quests** — to-dos with difficulty, due dates and sub-steps; finishing them earns XP
- **The Keep** — the dashboard: level, rank, streak, what's due, what you wrote this week
- Six themes, chiptune sound effects, a procedural background music loop, CRT scanlines
- Backup and restore to a single `.json` file
- Your name and portrait are yours to choose

---

## Running it on your iPhone

The app is a folder of plain files. It needs to be served over HTTP, which the included
PowerShell script does — no Node, no Python, no Administrator rights.

### 1. Start the server on this PC

Double-click **`start-server.bat`**, or run:

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```

It prints something like:

```
On this PC       : http://localhost:8080
On your iPhone   : http://192.168.1.42:8080
```

If port 8080 is taken, use another: `-Port 8081`.

### 2. Open it in Safari on the iPhone

Both devices need to be on the **same wi-fi**. Type the `192.168.x.x` address into
**Safari** (Chrome on iOS cannot install web apps).

If it doesn't load, Windows Firewall is probably blocking the port. Allow
`powershell.exe` on private networks when prompted, or add a rule for the port.

### 3. Add it to the Home Screen

Share button → **Add to Home Screen** → **Add**.

It now has its own icon and opens full screen with no browser bars.

---

## Offline: read this bit

There are two levels of "works offline", and which one you get depends on how the files
are served.

| Served from | Add to Home Screen | Works with the PC off |
|---|---|---|
| `http://192.168.x.x:8080` (this script) | yes | **no** |
| any `https://` address | yes | **yes** |

Browsers only allow a *service worker* — the thing that caches an app for genuine
offline use — on `https://` or `localhost`. Over a plain LAN address the app still
installs and works, but it fetches its files from your PC each time it launches, so the
PC has to be on and the server running.

Your **data** is unaffected either way: notes, entries and quests are stored in the
iPhone's own storage, not on the PC.

**To get true offline use**, serve it from anywhere with HTTPS and install from that
address instead. The service worker then registers and the app opens with the network
off entirely — no PC, no wi-fi. Nothing about the app changes; it still talks to no
server. It is just being *delivered* over HTTPS instead of HTTP.

### GitHub Pages (recommended)

The repo is its own host, so there is nothing to build or deploy.

1. Push the repo to GitHub.
2. **Settings → Pages → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Wait a minute, then open `https://<your-user>.github.io/<repo>/` in Safari on the
   iPhone and **Add to Home Screen**.

Everything in the app uses relative paths, so it works correctly from a subfolder URL
like that.

**A private repo works too** — but GitHub Pages on a private repo needs a paid plan. On
the free plan the repo must be public for Pages to serve. That is fine for the app
itself: it contains no data of yours. Your notes, entries and quests live only in your
phone's storage and are never uploaded, so a public repo publishes the *program*, not
your grimoire.

Other drag-and-drop options that need no repo at all: [Netlify
Drop](https://app.netlify.com/drop), Cloudflare Pages, Vercel.

### Updating a hosted copy

Push the change. Installed phones pick it up by themselves — there is nothing to bump
and nothing to reinstall.

The app checks the server each time it opens, whenever you come back to it after ten
minutes away, when the network returns, and every half hour while it is open. It
compares a SHA-256 of every code file with what it has cached, so any edit is noticed
without a version number anywhere.

- found **at launch**: applied there and then, before anything is on screen
- found **while you are writing**: it asks first, and "Later" means next launch

Nothing you have written is touched — a pending save is written to disk before the
reload. **Options → Updates** shows the state, holds a manual check, and can turn the
automatic part off. The build shown in **Options → About** is that fingerprint.

This needs HTTPS (or localhost), like the offline cache — over a plain `http://` LAN
address there is no service worker, so a reload in Safari is the update.

`CACHE` at the top of [`sw.js`](sw.js) only needs bumping when the worker's own caching
rules change, not for ordinary app edits.

---

## Back up your grimoire

iOS can clear a website's storage if the device runs very low on space, and clearing
Safari's website data will certainly do it. So:

**Options → Backup → Save a backup**

On iPhone pick **Share / Save to Files** and drop the `.json` file into iCloud Drive.
If any pictures are attached you are asked whether to include them: they make the file
much larger, but leaving them out means the pictures exist on this device only.
Restoring offers a choice of **merge** (keeps what's on the device, adds what's missing)
or **replace** (exact restore). A safety snapshot is taken automatically before either,
and before the "erase everything" option, and can be rolled back from
**Options → Safety snapshots**.

---

## Files

```
index.html                 app shell
manifest.webmanifest       PWA manifest
sw.js                      service worker (offline cache)
serve.ps1                  the local web server
start-server.bat           double-click launcher for the above
css/style.css              the whole 8-bit look, six themes, all animation
js/
  app.js                   boot, splash, onboarding, router, chrome
  store.js                 data, the folder tree, XP/levels/streaks, backup
  audio.js                 chiptune engine - every sound is synthesised
  sprites.js               pixel art as ASCII maps, rendered to inline SVG
  ui.js                    dialogs, action sheets, toasts, particles
  actions.js               flows shared by views (create, move, menus)
  textkit.js               the rune bar, the table builder and the date stamp
  richtext.js              the editable: markup in, markup out, formatting live
  markup.js                the small plain-text markup everything is stored as
  media.js                 photo shrinking, palette mapping, IndexedDB store
  photos.js                attaching, the thumbnail strip and the viewer
  update.js                the update check, prompt and reload
  views/                   dashboard, scrolls, editor, chronicle, quests,
                           options, search
assets/fonts/              Press Start 2P, Silkscreen, VT323 (bundled)
icons/                     generated app icons
tools/make-icons.ps1       redraws the icons from the same pixel map
```

There is no build step. Edit a file, reload the page.

If you change any app file **and** you are serving over HTTPS with the service worker
active, bump `CACHE` at the top of `sw.js` (`grimoire-v2` → `grimoire-v3`) or the old
cached copy will keep being served.

---

## Notes on the internals

**Nothing is loaded from the internet at runtime.** The fonts are bundled as `.woff2`.
Every icon, portrait and app icon is drawn from a hand-written ASCII pixel map in
`sprites.js` and rendered to inline SVG. Every sound is generated live with WebAudio
oscillators — there are no audio files at all.

**iOS and sound.** Safari keeps audio muted until the user physically taps something,
which is what the *PRESS START* splash is for. If sound ever seems dead, use
**Options → Test sound**.

**Storage.** One `localStorage` key holds a single JSON document. The usual browser
limit is around 5 MB, which is tens of thousands of scrolls. Photos would fill that in
a handful of shots, so they live in a separate IndexedDB store (`grimoire.media`) and
the JSON document keeps only a small record of what is attached to what. A picture with
no scroll or entry pointing at it is deleted automatically. Current usage of both is
shown in **Options → Storage used**.

**Text stays text.** The editors are `contenteditable`, so formatting shows up as you
write, but nothing is stored as HTML. `richtext.js` turns the stored plain text into
the editable view and serialises it straight back on every save (`- `, `1. `,
`- [ ] `, `| a | b |`, `**bold**`). A scroll copied out of the app is still readable
anywhere, search and previews work on the same text, and old backups load unchanged.
The markup is a deliberately small subset; anything it cannot express — a list inside
a quote, say — is written out beside the quote rather than lost.

**The on-screen keyboard.** iOS shrinks the visual viewport but not the layout one,
and the app is a fixed shell, so Safari's own attempt to reveal the caret just shoves
everything upwards and off the screen. `installKeyboardHandling` in `app.js` handles it
instead: the scrolling area and the dialog layer end above the keyboard, any shift
Safari applied is put straight back, the field being typed in is parked below the top
bar with its rune bar still visible, and a tall field is given an exact height for the
room that is left, so it scrolls inside itself and the page never moves.

**Keyboard shortcuts** (useful when testing on a desktop): `1`–`5` switch tabs, `/`
opens search.

---

## Fonts

Bundled under the SIL Open Font License 1.1:

- **Press Start 2P** — CodeMan38
- **Silkscreen** — Jason Kottke
- **VT323** — Peter Hull

See `assets/fonts/OFL.txt`.
