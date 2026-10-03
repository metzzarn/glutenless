# Glutenless

A mobile app for finding gluten-free and gluten-removed beers on the go. Search a curated beer list by name, voice, or by scanning a can/bottle or menu with your camera, and check gluten status, ppm, and ingredients before you order.

Built with [Expo](https://docs.expo.dev/versions/v57.0.0/) and Expo Router.

| Beer list | Beer details | Favorites |
| --- | --- | --- |
| ![Beer list](screenshots/Beer%20list.png) | ![Beer details](screenshots/Beer%20details.png) | ![Favourite list](screenshots/Favourite%20list.png) |

## Features

- **Search** the beer list by name, brewery, style, country or your own notes, tolerant of typos, with instant filtering by All / Gluten-Free / Gluten-Removed / Favorites and a running count.
- **Voice search** — tap the mic and speak a beer or brewery name.
- **Camera scan** — point the camera at a can/bottle to identify it by its label text, or at a menu to detect every matching beer on it in one shot. A beer that isn't recognised gets a clear warning to assume it contains gluten.
- **Beer details** — ABV, IBU, country, grains/ingredients, gluten status (with ppm and a "confirmed" badge when a human has verified it against a primary source), and a link to the brewery's site.
- **Favorites and notes** — heart a beer from the list or its detail page, and keep your own note on any beer (stored only on the phone).
- **Light and dark mode** — follows the device by default, or pick one from the header.
- **Offline-first data** — the beer list ships bundled with the app in SQLite, then syncs in the background from a hosted `beers.json` when a connection is available and the hosted list is newer. Discontinued beers are listed last.

## Getting started

Install dependencies:

```bash
npm install
```

Run on a platform:

```bash
npm run ios      # iOS simulator
npm run android  # Android emulator/device
```

## Other scripts

```bash
npm test          # run the Jest test suite
npm run typecheck # run TypeScript in --noEmit mode
npm run build:android # prebuild and assemble a release APK (scripts/build-android.sh)
```

## Project structure

```
app/            Screens and routes (Expo Router)
components/     Reusable UI components
lib/            Data layer, matching/OCR logic, sync, theme, speech
data/           Bundled beer dataset (beers.json) and the prompt used to update it
tools/          Standalone HTML tool for confirming/curating beer data (see Data below)
```

## Data

The beer list in `data/beers.json` is bundled into the app and also hosted so installed apps can pick up updates without an app store release. Each beer records whether it's gluten-free or gluten-removed, its ppm reading, ingredients, and which of those fields have been confirmed against a primary source (e.g. the brewery). See `data/update_beers_prompt.md` for how new entries are drafted.

### Data version

`data/beers-version.json` stamps the list with an `updatedAt` time (plus a hash of `beers.json`). The app only downloads the hosted list when its stamp is newer than the data it already has, and only re-seeds from the bundled list when that is newer, so neither can replace newer data with older. That also means unpublished local edits to `beers.json` show up when testing instead of being overwritten by the hosted copy.

After editing `beers.json` by hand or with the Confirmation Desk, re-stamp it (the merge tool does this for you):

```bash
npm run stamp-data
```

A test fails if `beers.json` changes without a new stamp. Push `beers.json` and `beers-version.json` together so installed apps pick up the change.

### Confirm beers tool

![Confirm beers tool](screenshots/Confirm%20beers%20tool.png)

`tools/confirm-beers.html` is a standalone, dependency-free HTML page ("Confirmation Desk") for verifying newly-added or unconfirmed beers against a primary source before they ship in `beers.json`. Open it directly in a browser and:

1. **Load list…** the current `beers.json`.
2. Work through each beer's ticket, checking off gluten-free/gluten-removed, ppm, grains/ingredients, tasting note, and brewery URL as you verify them against the brewery's own site.
3. Filter tickets by All / Unconfirmed / In progress / Fully confirmed, or search by name, brewery, style, or country.
4. Progress autosaves to `localStorage` as you go, so a closed tab can be restored later (or discarded to start over).
5. **Export confirmed list** to download an updated `beers.json` with the newly-confirmed fields recorded, then replace `data/beers.json` with it and run `npm run stamp-data`.

### Merge beers tool

`tools/merge-beers.mjs` adds newly researched beers to `data/beers.json` without touching existing entries:

```bash
node tools/merge-beers.mjs candidates.json --dry-run  # preview
node tools/merge-beers.mjs candidates.json            # append to data/beers.json
```

`candidates.json` is a JSON array of beers in the `beers.json` schema, without `id` or `confirmed`. Candidates are validated, de-duplicated against the list on brewery + name, given new ids continuing from the highest existing one, and appended as unconfirmed so they show up in the Confirmation Desk. The data version is re-stamped automatically.

## Disclaimer

Gluten status is producer-reported. If you have celiac disease, confirm with the brewery before drinking.
