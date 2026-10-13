# Workout

A buildless, mobile-first Monday / Wednesday / Friday strength tracker for a 20 lb kettlebell, pull-up bar, and yoga mat.

Open https://fritzonfoot.github.io/workout-tracker/ in Safari, then choose **Share → Add to Home Screen**. Load it online once before using it offline. GitHub Pages publishes from **main**, **/(root)**.

## The program

Start with a 2-minute warm-up. Each day has two supersets, each performed for two rounds, and one required finisher. Do A1 → A2 → rest → repeat, then B1 → B2 → rest → repeat, then the finisher. Rest about 60–90 seconds between rounds, or longer as needed. Leave 1–2 good reps in reserve on strength sets and prioritize technique.

| Day | Superset A (2 rounds) | Superset B (2 rounds) | Required finisher |
| --- | --- | --- | --- |
| Monday · The hard day (20–25 min) | Bulgarian split squats 8–12/leg; pull-ups 4–6 | Single-leg KB Romanian deadlifts 8–12/leg; single-arm KB overhead press 8–12/arm | Forearm plank, one hold up to 60 seconds, stopping at form limit |
| Wednesday · The balanced day (~20 min) | Push-ups 10–18; KB goblet squats 12–20 | Single-arm KB rows 10–15/arm; KB overhead triceps extensions 10–15, both hands | Dead hang, one hold to grip limit or loss of comfortable shoulder position; seconds |
| Friday · The fun day (~20 min) | Chin-ups 4–6; KB reverse lunges 8–10/leg | Pike push-ups 6–12; strict KB biceps curls 6–12/arm | Standard push-ups, one set to technical failure; reps |

## Logging and progression

Adjust reps or seconds and check off each completed set. Left and right reps are separate. Working sets are labeled R1 and R2 for the two rounds. Finish Workout unlocks after the scheduled finisher is checked. Partially completed strength sets can still be recorded with confirmation.

Each new session starts with last session’s completed reps. A progress arrow compares matching complete set counts. When both working sets reach the top of the rep range (both sides for unilateral exercises), a note suggests more range of motion, a harder variation, or additional resistance **if form was good**. Technique is not inferred from rep counts. Changing the exercise name starts a fresh comparison.

Finisher bests use saved, checked efforts for the same day, exercise name, ID and unit. Timed holds use seconds; Friday’s finisher uses reps.

An optional notes box above Finish Workout saves as you type. Notes are attached to that session, shown in History, and included in JSON backups. The note and date from the last saved session for that same day appear read-only above the new notes box; the section is hidden when that session has no note. Previous notes are never copied into the new entry. Older sessions remain valid without notes.

## Your data and customizer

The update replaces the prior program once per device. Completed history is preserved exactly as logged, including the old day titles. Earlier unfinished sessions move to a separate section of History and remain in backups. They are not counted as completed workouts. Later changes made in the customizer survive reloads and app updates.

Settings retains name, set, target, unit and side controls, plus a Superset A / Superset B / required finisher selector. A routine must retain a finisher. Restoring a routine uses this new M/W/F program.

Data is stored locally on your device, not sent to GitHub, and does not sync across devices. Export backups in Settings periodically. Restore replaces local data after confirmation; old-format backups are migrated while keeping their history and unfinished records. Safari and Home Screen installations may have separate storage: use the installed app consistently, and export/restore if transferring history.

## Development

No build step or dependencies. Run `npm test` for the data, migration, app event-handler and offline-asset checks. Serve the directory over HTTP locally or HTTPS in production. All asset paths are relative for GitHub Pages project subpaths.

Increment the cache version in `sw.js` and the version query on HTML, JS imports and cached asset URLs when shell assets change. Offline installation uses `Request` with `cache: reload` to bypass stale browser HTTP-cache entries. Navigation uses `cache: no-store`, and the worker reads only its own version’s cache. Settings includes Check for updates; foreground and reconnect also request service worker updates. The updated HTML reloads once when an existing service worker switches to a fully cached new shell. Browser storage is retained.

The public repository contains only application code and default routines. Never commit personal workout backups.
