# Napkin

A minimalist computational notepad PWA. Write naturally and Napkin calculates as you type.

## MVP Features

- Reactive multiline notepad
- Variables and live recalculation
- Natural percentage semantics
- Unit, currency, and date conversions
- Multiple local notes with autosave, note switching, deletion, and text export
- Offline service worker and installable PWA manifest
- No backend or account required

## Storage

Napkin is local-first. Notes are stored in the browser under `localStorage["napkin:notes"]`, and the active note is tracked with `localStorage["napkin:currentNoteId"]`. The previous single-note key, `napkin:text`, is migrated automatically the first time the updated app opens.

## Local Preview

```sh
node scripts/build.mjs
python3 -m http.server 4173 -d dist
```

Then open `http://127.0.0.1:4173`.

## Vercel

The project is configured as a static app:

- Build command: `node scripts/build.mjs`
- Output directory: `dist`
- Install command: `echo "No install needed"`
