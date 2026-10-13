# Workout

A buildless, mobile-first Push / Pull / Legs tracker for a 20 lb kettlebell, pull-up bar, and yoga mat.

## Use

Open https://fritzonfoot.github.io/workout-tracker/ in Safari, then choose **Share → Add to Home Screen**. Load it online once before using it offline. GitHub Pages should publish from the **main** branch, **/(root)** folder.

- Pick Push (Monday), Pull (Wednesday), or Legs (Friday).
- Adjust the suggested reps and tap the checkmark after each completed set. For unilateral exercises, enter left and right reps separately.
- Finish the workout to add it to history. A partially completed workout can be saved, with unchecked sets recorded as skipped.
- The next session starts with the last logged reps for each set. A small up arrow appears when all sets have been completed and their total exceeds the previous session with the same exercise name, unit, sides, and number of sets. Changing variations starts a new comparison.
- Optional third sets can be skipped. Y–T–W entries represent the number of reps **per letter** in a round.
- Settings lets you edit routines and export or restore a JSON backup. Restore replaces existing data, after confirmation. Export first to retain a copy.

Data is kept in browser local storage on the device where you log it. It is not sent to GitHub and does not sync across devices. Browser storage may be cleared, so keep backups. Safari and a Home Screen installation may have separate storage: use the installed app consistently, and export/restore to transfer existing history if necessary.

## Development

No build step or dependencies. Serve this directory over HTTP locally or HTTPS in production. Run `npm test` for data and offline-asset checks. Increment the cache version in `sw.js` whenever shell assets change so installed clients receive the matching complete shell.

Files: `index.html`, `styles.css`, `app.js`, `model.js`, `sw.js`, `manifest.webmanifest`, and `icons/`. All asset paths are relative so GitHub Pages project subpaths work.

The public repository contains only the app code and default routines; workout backups should never be committed.
