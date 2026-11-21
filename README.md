# eDoc

A fast, offline-first PDF reader that turns any folder on your device into a personal library — no uploads, no server, no account. Add a folder and start reading.

_Installable PWA — add to home screen on desktop, iOS, or Android._

## Why eDoc

Most PDF readers either lock your files behind a cloud sync or make you open one document at a time with no memory of what you were reading. eDoc keeps everything local — your files never leave your device — while still feeling like a real library: browse by folder, search across everything, pick up exactly where you left off.

## Features

**Your library, your way**
- Add one or more folders: eDoc copies their PDFs into its own private storage (a one-time snapshot — change the originals, then add the folder again to update it) and remembers them, no re-picking on every visit
- Explorer-style folder tree: rename, move, copy, star and delete files and folders, add single files, and send or receive PDFs between your devices over wifi
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
- Annotations are saved as eDoc's own copy of the file; your original is never modified
- Tools that rewrite a file: rotate pages, flatten annotations and form fields, password-protect — save as a new file or replace the stored copy

**Works anywhere, works offline**
- Installable as a native-feeling app on desktop, iOS, and Android
- Full offline access once your library is loaded, with a one-tap update prompt when a new version ships
- Responsive down to phone width, with touch targets and gestures tuned per platform

## Tech

Built with React 19 + Vite, rendered by [pdf.js](https://github.com/mozilla/pdf.js), stored locally in the browser's private file system (OPFS) and IndexedDB, and shipped as a PWA via `vite-plugin-pwa`.

## Getting started

```bash
npm install
npm run dev
```

## Privacy

Everything stays on your device. eDoc never uploads your files anywhere — there's no backend to send them to.

Wifi transfer is the one thing that talks to the outside, and your files still only go to your other device: the two devices find each other through the free public [PeerJS](https://peerjs.com) pairing server (it sees the 6-character code and your public IP address, never your files), and the PDFs then travel directly between them on your own network. The device showing the code has to tap Allow before anything can be sent. If that public server is down, wifi transfer won't connect; everything else keeps working.
