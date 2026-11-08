// Version scheme: first entry is v1.0, each subsequent entry is +0.1, up to a max of x.10 —
// the entry after any x.10 rolls to (x+1).0. One entry per release round (not per commit).
// Oldest first below (rendered newest-first in the UI).
export const CHANGELOG = [
  {
    v: 'v1.0', date: 'Jun 2026', title: 'Folder scanning, PDF viewer & brand kit',
    notes: [
      'NEW: Scan folders of PDFs, with a tree sidebar, single/continuous/two-up viewer, saved library and a basic PWA shell.',
      'NEW: Shared ClaudeBorne brand kit: fonts, icons, dark theme and the BrandBanner header.',
    ],
  },
  {
    v: 'v1.1', date: 'Jun 2026', title: 'Explorer-style folder tree',
    notes: [
      'NEW: Explorer-style folder tree, collapsed by default, with icons and one-line rows.',
      'FIX: Some pages stayed blank because two renders raced on the same canvas; the old render is now cancelled.',
      'IMP: Continuous view only loads pages near the screen, so far-off pages no longer stay blank.',
      'FIX: Page 1 was pushed off-screen in continuous view on documents taller than the viewer.',
    ],
  },
  {
    v: 'v1.2', date: 'Jun 2026', title: 'Touch nav, zoom, search, multi-folder',
    notes: [
      'NEW: Touch gestures: tap to turn page, swipe and pinch to zoom.',
      'NEW: Fit-width and fit-page zoom presets.',
      "NEW: Search inside a document, separate from the tree's filename filter.",
      'NEW: Multiple folders at once, each with its own remove/reconnect control.',
    ],
  },
  {
    v: 'v1.3', date: 'Jun 2026', title: 'Rebrand icon wordmark to StratoNimbus',
    notes: [
      'IMP: App icon wordmark changed to Strato/Nimbus, with the S and N enlarged in brand mint.',
    ],
  },
  {
    v: 'v1.4', date: 'Jun 2026', title: 'Safari/iOS folder picker fallback',
    notes: [
      'NEW: Safari and iPad can now add folders through a fallback picker, using a one-time snapshot of the folder.',
    ],
  },
  {
    v: 'v1.5', date: 'Jun 2026', title: 'Fit layout to any device viewport',
    notes: [
      'IMP: Layout now fits the screen height and respects the notch and home indicator; sidebar becomes a slide-in drawer below 720px.',
      'NEW: Home Screen app tags for status-bar styling and better Add-to-Home-Screen support on older iOS.',
    ],
  },
  {
    v: 'v1.6', date: 'Jun 2026', title: 'Update prompt & splash screen',
    notes: [
      'NEW: "Update available" prompt, matching the other ClaudeBorne apps.',
      "FIX: The 2.2MB PDF engine file was missing from the offline cache; it's now cached.",
      'NEW: Animated splash screen on launch, matching the other apps.',
    ],
  },
  {
    v: 'v1.7', date: 'Jun 2026', title: 'Reconnect-all & PDF link fix',
    notes: [
      'NEW: One "Reconnect all" button re-grants access to every pending folder at once.',
      'FIX: Links inside a PDF (e.g. table of contents) did nothing; they now jump to the right page.',
    ],
  },
  {
    v: 'v1.8', date: 'Jun 2026', title: 'Wider mobile breakpoint for tablets',
    notes: [
      'IMP: Portrait iPads now get the mobile drawer (breakpoint 880px), and touch targets grow to 44px.',
    ],
  },
  {
    v: 'v1.9', date: 'Jun 2026', title: 'Outline panel, drag-and-drop & settings',
    notes: [
      "NEW: Outline tab shows a PDF's table of contents and jumps to the chapter.",
      'NEW: Drop a PDF to open it, or a folder to add it (Chromium).',
      "NEW: Each file's last page and zoom are remembered and restored.",
      'NEW: Settings with theme, resume-last-position and keep-screen-awake.',
      'FIX: Saved settings were overwritten by defaults on every reload.',
    ],
  },
  {
    v: 'v1.10', date: 'Jun 2026', title: 'Single-page view on narrow screens',
    notes: [
      'NEW: Narrow screens default to single-page view and switch back live when you rotate; manual choice is kept.',
      'FIX: Folders collapsed when you switched to the Outline tab; the tree now keeps its expanded state.',
    ],
  },
  {
    v: 'v2.0', date: 'Jun 2026', title: 'Fix blank bar on installed iOS app',
    notes: [
      'FIX: An empty bar at the bottom of the installed iOS/iPad app is gone; it was drawn by iOS because of the edge-to-edge setting.',
    ],
  },
  {
    v: 'v2.1', date: 'Jul 2026', title: 'Folder storage hardening & Safari/Android access',
    notes: [
      "FIX: Folders added on Safari/iOS vanished from the sidebar on every reopen; they're now saved.",
      'FIX: Safari and Android folders lost access on every reopen; live folder links are now desktop-only.',
      'NEW: A way to clear a stuck pending folder that can never reconnect.',
      'NEW: Asks the browser for persistent storage, and moves old folder copies to app storage with a one-time migration.',
      'NEW: Warns before a folder exceeds free space; per-folder "last updated" chip and a safe refresh button.',
      'NEW: Progress window lists each file as it copies, with an overall bar and a Cancel that cleans up.',
    ],
  },
  {
    v: 'v2.2', date: 'Jul 2026', title: 'Sidebar collapse & pinch-zoom fix',
    notes: [
      'NEW: Sidebar collapses on desktop, and auto-collapses when a file opens for more reading space.',
      "FIX: Pinch triggered both the app's zoom and the browser's zoom, causing glitches; the app now handles it alone.",
    ],
  },
  {
    v: 'v2.3', date: 'Jul 2026', title: 'Thumbnails, rotate, recents, full-text search',
    notes: [
      'NEW: Shared update prompt with build info; Settings gets an App Update section and the gear shows a dot when an update is waiting.',
      'NEW: Page thumbnails tab, rotate-page buttons and a password prompt for protected PDFs.',
      'NEW: Reading-progress chip, Recent tab, night reading mode and full-text search across your library.',
    ],
  },
  {
    v: 'v2.4', date: 'Jul 2026', title: 'Sidebar rework: mobile detection & auto-hide',
    notes: [
      'IMP: Phones start with a hidden, auto-hiding sidebar; elsewhere auto-hide is an optional setting. Night reading is now a toolbar toggle.',
    ],
  },
  {
    v: 'v2.5', date: 'Jul 2026', title: 'Bookmarks and annotations',
    notes: [
      'NEW: Per-page bookmarks, and Highlight, Draw and Note annotation tools.',
      'NEW: Save annotations back to the original file or to an app copy, asking first time and before discarding edits.',
      'FIX: Background indexing ran while reading and could get the app closed by iPadOS; it now waits until no file is open.',
      'NEW: A one-tap "Reopen" banner recovers the last file when auto-restore fails.',
    ],
  },
  {
    v: 'v2.6', date: 'Jul 2026', title: 'Persisted tree state, toolbar regroup & re-fit',
    notes: [
      'NEW: Expanded folders are remembered across reloads.',
      'IMP: Toolbar grouped into Zoom and Annotate menus; Settings moved into it.',
      "FIX: Fit-page/fit-width didn't re-fit when the sidebar collapsed or the window resized; it does now.",
    ],
  },
  {
    v: 'v2.7', date: 'Jul 2026', title: 'Restyled icons & update toast',
    notes: [
      'IMP: New icons across the toolbar and search, clearer active states, and a line-art drop-zone illustration when no file is open.',
      'IMP: Update prompt is now a bottom-right toast with a 15s auto-update countdown.',
    ],
  },
  {
    v: 'v2.8', date: 'Jul 2026', title: 'Mobile toolbar rework',
    notes: [
      'IMP: Mobile toolbar split into a nav row and a tools row, then condensed to one line: view mode and search collapse to icons, page count becomes tap-to-jump.',
      'NEW: Folder-plus icon on Add folder; selected files get a coral accent bar.',
    ],
  },
  {
    v: 'v2.9', date: 'Aug 2026', title: 'eDoc rename & iPad landscape toolbar fix',
    notes: [
      'IMP: App name shortened to the consistent "eDoc".',
      'FIX: On iPad landscape the search bar and view-mode select pushed Settings onto its own line; touch devices now use compact versions.',
    ],
  },
  {
    v: 'v2.10', date: 'Aug 2026', title: 'Collapsible outline & floating Add folder',
    notes: [
      'NEW: Outline items with children can be collapsed, start collapsed and are remembered per file.',
      'FIX: Sidebar tab bar scrolled out of view with long content; each tab now scrolls on its own.',
      'IMP: The full-width Add folder button is now a floating button on the Folders tab.',
    ],
  },
  {
    v: 'v3.0', date: 'Aug 2026', title: 'Global filename + content search',
    notes: [
      'NEW: Library-wide search with grouped snippet results shown over the viewer.',
    ],
  },
  {
    v: 'v3.1', date: 'Aug 2026', title: 'Remove full-text content search',
    notes: [
      "FIX: Reopening on launch could bring back a file whose folder was removed; it's now checked first.",
      'DEP: Removed full-text indexing and its progress UI; indexing 10,000+ files was too slow.',
      'IMP: Global search now matches filenames only; in-document search is unaffected.',
    ],
  },
  {
    v: 'v3.2', date: 'Aug 2026', title: 'Tree remove-from-view & drag-to-rearrange',
    notes: [
      'NEW: Hide files/folders from the tree or drag them to reorder and move, without touching your real files; survives Refresh.',
    ],
  },
  {
    v: 'v3.3', date: 'Sep 2026', title: 'Floating page pill & mobile toolbar fixes',
    notes: [
      'FIX: The annotate menu spilled off the right edge on mobile; it now anchors to its right edge.',
      'IMP: Prev/next and the page counter moved into a floating pill at the bottom of the viewer.',
      'IMP: Zoom buttons and percentage share one pill; type a number and press Enter to jump to that zoom (also on mobile).',
      'FIX: Folder rows needed two clicks to expand or collapse; one click now works.',
    ],
  },
  {
    v: 'v3.4', date: 'Sep 2026', title: 'PDF link tap & hit-box fixes',
    notes: [
      'FIX: Tapping a link inside a PDF on touch devices turned the page instead of following the link.',
      'FIX: Table-of-contents links went to the chapter above at low zoom because link areas drifted from the page; they now line up.',
    ],
  },
  {
    v: 'v3.5', date: 'Sep 2026', title: 'Memory leak & save-failure fixes',
    notes: [
      "FIX: Switching or closing a PDF never freed its memory; it's now released right away.",
      'FIX: A failed annotation save failed silently; it now shows an error banner.',
      'FIX: Dragging a row to reorder it also selected the file (and could trigger a discard prompt); dragging now uses a grip handle.',
      'IMP: Doc search jumps to the next match on Enter (Shift+Enter for previous); global search results work with the keyboard.',
    ],
  },
  {
    v: 'v3.6', date: 'Sep 2026', title: 'Persist folder expand-state and legacy Recent/resume files',
    notes: [
      'FIX: The tree was fully collapsed after every restart; expanded folders are now remembered by folder name.',
      "FIX: iPad/Android files were missing from Recent and last-opened resume; they're now saved and restored.",
    ],
  },
  {
    v: 'v3.7', date: 'Sep 2026', title: 'Clear all button for Recent tab',
    notes: [
      'NEW: "Clear all" button in the Recent tab empties the list immediately.',
    ],
  },
  {
    v: 'v3.8', date: 'Sep 2026', title: 'Tree persistence & link security fixes',
    notes: [
      "FIX: Hidden, moved or reordered tree items reset on every reload; they're now remembered by folder name.",
      'FIX: Search showed files hidden from the tree; search and tree now share the same view.',
      "FIX: A PDF's table of contents could run a javascript: link; outline links are now limited to http/https/mailto.",
      "FIX: The Pages panel could show another document's thumbnails after switching files.",
      'FIX: Drawing near page edges with an annotation tool flipped the page; it no longer does.',
      "IMP: Search results show each file's folder path.",
      'IMP: Settings and this changelog now load on demand, making the first load lighter.',
    ],
  },
  {
    v: 'v3.9', date: 'Oct 2026', title: 'Add files & app-managed storage',
    notes: [
      'NEW: The floating + button opens Add folder or Add files; Add files lets you pick PDFs, choose where they go, and Replace or Keep both on name clashes.',
      'NEW: Add folder asks where to show the new folder: top level or inside any folder, with its own copy and its own ×.',
      "IMP: Removed the folder ⋮ menu and age chip; folders, subfolders and files all have × with a confirmation that deletes the app's copy, plus its bookmarks, saved page and annotations.",
      'NEW: Adding a folder that already exists offers to update it, keeping its place and asking whether to keep saved annotations.',
      "FIX: Same-named files in different folders shared bookmarks and annotations; they're now kept per folder and path.",
      'FIX: Adding or updating a big folder no longer slows down as it grows; the progress window draws fewer rows.',
      'IMP: Same behaviour on every device: folders are always copied into app storage, with no Reconnect or permission prompts, and annotations always save as an app copy.',
      'NEW: Settings → App Update has a "Disable auto-update" switch; "Check for updates" still works manually.',
      'NEW: Transition animations for tabs, dialogs, menus, search bar and panels; Settings → Animation sets on/off, style and speed, and respects Reduce Motion.',
      'FIX: iPadOS 27 drew a blur over the top of the installed app; the status bar now blends into the top bar. Re-add the Home Screen icon once to apply.',
    ],
  },
  {
    v: 'v3.10', date: 'Oct 2026', title: 'Two-page continuous view',
    notes: [
      'NEW: Two-page continuous view: pages sit side by side like an open book; pick it from the page view menu.',
      'FIX: On phones, the Reading theme and Annotate menus could open off the left edge; they now open inside the screen.',
      'IMP: On phones the top bar shows only the title; sidebar and Settings buttons moved into the toolbar.',
      'IMP: Settings and all dialogs share one look: a double-line border with cut corners that follows the theme.',
    ],
  },
  {
    v: 'v4.0', date: 'Oct 2026', title: 'Tabs & split view',
    notes: [
      'NEW: Tabs: open files in tabs above the page; × or middle-click closes one, and only the visible tab is loaded.',
      'NEW: Reading → Resume last position reopens all your tabs, with the same one in front.',
      'NEW: Split view: show two documents side by side, each with its own page counter and colour-coded pane. Presentation mode shows the active pane only.',
      'NEW: Settings → Reading → Split view on/off (off by default on touch devices) and Colour-code panes; it closes itself on narrow windows.',
      'NEW: Switching or closing a tab with unsaved annotations asks Save / Discard / Cancel.',
      "NEW: Document properties from the tab's ⋯: title, author, page count, size, dates and more.",
      'NEW: Fullscreen (not iPhone) and Presentation mode: one page at a time on black, with keys, clicks or taps to move; Esc ends it.',
      'FIX: Tapping a form field near the page edge turned the page instead; taps on fields now stay with the field.',
      'FIX: Opening a file while another was on a later page left the page counter stuck on the old number.',
    ],
  },
  {
    v: 'v4.1', date: 'Nov 2026', current: true, title: 'Wifi transfer & Manage tools',
    notes: [
      'NEW: + → Send / receive via wifi: pair two devices with a 6-character code or QR and send PDFs or whole folders straight across wifi, never through a server.',
      'NEW: A NEW chip marks added, replaced or received files and folders until you open them or refresh.',
      'FIX: Big folders over wifi now transfer reliably: files are saved as they arrive, the file list is sent in small pieces, and a dropped pairing connection no longer ends a live link. Update both devices first.',
      'NEW: Manage button above the tree: tick files or folders, then Select all, Rename or Delete (also removes bookmarks and annotations). Replaces the old × and drag handle, on every device.',
      'NEW: Move and Copy (Manage bar): pick a destination folder level by level; name clashes let you keep, replace or keep both.',
      'NEW: Rotate (File tools): turn all or chosen pages, then save as "name (rotated).pdf" or replace the original.',
      'NEW: Flatten (File tools): bake annotations and filled-in form fields into the pages; save as "name (flattened).pdf" or replace.',
      'NEW: Star (File tools): colour-star files (red, green, purple, orange, blue); the Recent tab becomes Recent/Favs with a Starred section.',
      "NEW: Protect (File tools): lock a PDF with a password (AES-256); save as \"name (protected).pdf\" or replace. A forgotten password can't be recovered; protected files open in the app's own password dialog.",
      'NEW: Sort menu: Name, Date added or Size, ascending or descending; folders stay on top and your choice is remembered.',
      'IMP: Rotate suits big files: nothing starts selected, type pages like 5, 12-20 to pick them (the grid jumps to the first), and it opens on the page you are reading. Only nearby pages are drawn, so 1000+ page files stay smooth.',
      'IMP: Move, Copy and Rotate now open in the same double-line chamfered window as every other popup (full-screen on phones), and opening a folder in the picker slides the list.',
    ],
  },
]
