# eDoc

A fast, offline-first PDF reader that turns any folder on your device into a personal library — no uploads, no server, no account. Point it at your files and start reading.

_Installable PWA — add to home screen on desktop, iOS, or Android._

## Why eDoc

Most PDF readers either lock your files behind a cloud sync or make you open one document at a time with no memory of what you were reading. eDoc keeps everything local — your files never leave your device — while still feeling like a real library: browse by folder, search across everything, pick up exactly where you left off.

## Features

**Your library, your way**
- Point eDoc at one or more folders — it scans and remembers them, no re-picking on every visit
- Explorer-style folder tree with drag-to-rearrange and hide-without-deleting
- Recent files, per-file reading progress, and instant resume (last page + zoom)
- Fast filename search across your entire library

**Built for actually reading**
- Single-page, two-page, and continuous scroll modes, auto-tuned to your screen
- Pinch-to-zoom, swipe navigation, and fit-width/fit-page presets
- In-document search, clickable table of contents, and page thumbnails
- Night reading mode for low-light sessions
- Rotate pages, jump to any page, and remember your spot per file

**Mark it up**
- Bookmarks and highlight/draw/note annotations, powered by pdf.js's own editor
- Save changes back to the original file — or keep a separate copy, your choice

**Works anywhere, works offline**
- Installable as a native-feeling app on desktop, iOS, and Android
- Full offline access once your library is loaded, with a one-tap update prompt when a new version ships
- Responsive down to phone width, with touch targets and gestures tuned per platform

## Tech

Built with React 19 + Vite, rendered by [pdf.js](https://github.com/mozilla/pdf.js), stored locally via the File System Access API / OPFS / IndexedDB, and shipped as a PWA via `vite-plugin-pwa`.

## Getting started

```bash
npm install
npm run dev
```

## Privacy

Everything stays on your device. eDoc never uploads your files anywhere — there's no backend to send them to.
