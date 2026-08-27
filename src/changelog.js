// Version scheme: first commit is v1.0. Each subsequent commit is +0.1, up
// to a max of x.10 — the commit after any x.10 rolls to (x+1).0. One entry
// per commit, oldest first below (rendered newest-first in the UI).
export const CHANGELOG = [
  {
    v: 'v1.0', date: 'Jun 2026', title: 'Initial scaffold',
    notes: [
      'NEW: Folder/subfolder PDF scanning via the File System Access API, tree sidebar, single/continuous/two-up viewer, IndexedDB persistence, and a basic PWA shell.',
    ],
  },
  {
    v: 'v1.1', date: 'Jun 2026', title: 'ClaudeBorne brand kit',
    notes: [
      'NEW: brand-kit wired in as a submodule — fonts, icons, manifest, and dark-theme tokens shared with sibling apps, restyled with the shared BrandBanner header.',
    ],
  },
  {
    v: 'v1.2', date: 'Jun 2026', title: 'Explorer tree view & width fix',
    notes: [
      'NEW: Explorer-style tree — folders collapsed by default, with icons and single-line ellipsis-truncated rows.',
      "FIX: Leftover Vite scaffold CSS was capping the whole app's width, leaving dead space beside the PDF viewer.",
    ],
  },
  {
    v: 'v1.3', date: 'Jun 2026', title: 'Fix blank pages from render races',
    notes: [
      "FIX: React StrictMode's double-mount raced two pdf.js render calls on the same canvas; the losing page silently stayed blank. Now tracks and cancels the in-flight render per canvas.",
    ],
  },
  {
    v: 'v1.4', date: 'Jun 2026', title: 'Virtualized scrolling & dev SW fix',
    notes: [
      'IMP: Continuous view virtualized via IntersectionObserver so only pages near the visible area mount, fixing far-off pages sitting blank behind hundreds of queued renders.',
      "FIX: The service worker was serving stale cached JS over Vite's dev server; registration now only runs against a production build.",
    ],
  },
  {
    v: 'v1.5', date: 'Jun 2026', title: 'Fix page 1 clipped in continuous view',
    notes: [
      "FIX: Continuous view's column layout flipped justify-content:center onto the vertical axis, centering the whole page stack and pushing page 1 off-screen on any doc taller than the viewer.",
    ],
  },
  {
    v: 'v1.6', date: 'Jun 2026', title: "Adopt pdf.js's official PDFViewer",
    notes: [
      "IMP: Replaced the hand-written canvas renderer with pdf.js's own PDFViewer/EventBus/PDFLinkService widget — the foundation for the search, zoom-preset, and spread-mode work that follows.",
    ],
  },
  {
    v: 'v1.7', date: 'Jun 2026', title: 'Touch nav, zoom, search, multi-folder',
    notes: [
      'NEW: Tap-to-page, swipe, and pinch-to-zoom touch gestures.',
      "NEW: Fit-width/fit-page zoom presets via pdf.js's own scale API.",
      "NEW: In-document search wired to pdf.js's PDFFindController, separate from the tree's filename filter.",
      'NEW: Multi-folder workspace — folders are additive, each with its own remove/reconnect control.',
    ],
  },
  {
    v: 'v1.8', date: 'Jun 2026', title: 'iOS standalone meta tags',
    notes: [
      'NEW: apple-mobile-web-app-* meta tags for status-bar styling and broader Add-to-Home-Screen compatibility on older iOS.',
    ],
  },
  {
    v: 'v1.9', date: 'Jun 2026', title: 'Rename app display strings',
    notes: [
      'IMP: Updated the tab title and the PWA short/full install names.',
    ],
  },
  {
    v: 'v1.10', date: 'Jun 2026', title: 'Rebrand icon wordmark to StratoNimbus',
    notes: [
      'IMP: PWA icon wordmark switched from the ED/OC placeholder to Strato/Nimbus, with the S and N enlarged in brand mint.',
    ],
  },
  {
    v: 'v2.0', date: 'Jun 2026', title: 'Icon wordmark sizing tweak',
    notes: [
      'IMP: Wordmark font size increased so it fits the double-line icon frame with comfortable margin at every generated size.',
    ],
  },
  {
    v: 'v2.1', date: 'Jun 2026', title: 'Safari/iOS folder picker fallback',
    notes: [
      "NEW: Falls back to <input webkitdirectory> on browsers without showDirectoryPicker (Safari/iPad), rebuilding the same tree shape from a one-time snapshot instead of a live folder handle.",
    ],
  },
  {
    v: 'v2.2', date: 'Jun 2026', title: 'Fit layout to any device viewport',
    notes: [
      'IMP: 100dvh plus safe-area-inset padding so mobile browser chrome and the notch/home-indicator no longer cause overflow or overlap.',
      'NEW: Toolbar wraps on narrow screens; sidebar becomes a slide-in drawer below 720px width.',
    ],
  },
  {
    v: 'v2.3', date: 'Jun 2026', title: 'Update-available prompt',
    notes: [
      "NEW: vite-plugin-pwa replaces the hand-written service worker and shows an UPDATE AVAILABLE modal, matching sibling ClaudeBorne apps.",
      "FIX: pdf.worker.mjs (2.2MB) exceeded the default offline-cache size limit and was silently left out of the precache; limit raised so it's actually cached.",
    ],
  },
  {
    v: 'v2.4', date: 'Jun 2026', title: 'Animated splash screen',
    notes: [
      "NEW: brand-kit's animated SplashScreen wired in on launch, matching sibling apps.",
    ],
  },
  {
    v: 'v2.5', date: 'Jun 2026', title: 'Reconnect-all button',
    notes: [
      'NEW: One "Reconnect all" button re-grants permission for every pending folder instead of one click per folder.',
    ],
  },
  {
    v: 'v2.6', date: 'Jun 2026', title: 'Fix internal PDF link navigation',
    notes: [
      'FIX: PDFLinkService was wired to the viewer but never given the document to resolve destinations against, so internal table-of-contents links silently did nothing.',
    ],
  },
  {
    v: 'v2.7', date: 'Jun 2026', title: 'Simplify reconnect UI to one button',
    notes: [
      'IMP: Always shows a single "Reconnect all" control instead of switching to per-folder buttons once more than one folder is pending.',
    ],
  },
  {
    v: 'v2.8', date: 'Jun 2026', title: 'Fix cramped mobile toolbar spacing',
    notes: [
      'FIX: Page-nav and zoom button groups had no internal gap on mobile, so their buttons sat squeezed flush together.',
    ],
  },
  {
    v: 'v2.9', date: 'Jun 2026', title: 'Dark-theme error banner & a11y fixes',
    notes: [
      'FIX: Error banner used light pink/red colors that clashed with the dark theme; switched to the cb-* tokens.',
      'IMP: Added aria-labels to icon-only buttons and contained viewer overscroll so iOS rubber-banding no longer fights pinch/swipe gestures.',
    ],
  },
  {
    v: 'v2.10', date: 'Jun 2026', title: 'Wider mobile breakpoint for tablets',
    notes: [
      'IMP: Sidebar-drawer breakpoint raised from 720px to 880px so portrait iPads get the mobile drawer instead of a cramped fixed sidebar; touch targets bumped to 44px on touch-primary devices.',
    ],
  },
  {
    v: 'v3.0', date: 'Jun 2026', title: 'Outline panel & search Escape-to-clear',
    notes: [
      "NEW: Folders/Outline sidebar tabs surface a PDF's built-in table of contents, navigable via PDFLinkService.",
      'IMP: Ctrl/Cmd+F focuses the search box, Escape clears and blurs it, and a loading indicator shows while a file opens.',
    ],
  },
  {
    v: 'v3.1', date: 'Jun 2026', title: 'Drag-and-drop open & per-file memory',
    notes: [
      'NEW: Dropping a PDF file opens it directly; dropping a folder adds it to the sidebar (Chromium).',
      "NEW: Each file's last page and zoom level are remembered and restored automatically on reopen.",
    ],
  },
  {
    v: 'v3.2', date: 'Jun 2026', title: 'Settings modal',
    notes: [
      'NEW: Settings modal with theme, default view mode, resume-last-position, and keep-screen-awake options.',
      'FIX: Settings/viewState wrote default values on mount before the async load finished, silently clobbering saved settings on every reload.',
    ],
  },
  {
    v: 'v3.3', date: 'Jun 2026', title: 'Merge concurrent settings & drag-drop work',
    notes: [
      'IMP: Merged the settings-modal branch with the drag-and-drop/per-file-memory branch, resolving conflicts in App.jsx.',
    ],
  },
  {
    v: 'v3.4', date: 'Jun 2026', title: 'Force two-page/fit-page on open',
    notes: [
      'IMP: Every file now opens in two-up/fit-page regardless of any remembered scale; page-position memory still applies. Dropped the now-unused default-view-mode setting.',
    ],
  },
  {
    v: 'v3.5', date: 'Jun 2026', title: 'Default to single-page on narrow screens',
    notes: [
      "NEW: View mode defaults to single-page under the 880px breakpoint and re-asserts live if the breakpoint is crossed while reading (e.g. rotating a phone); manual selection is unaffected.",
    ],
  },
  {
    v: 'v3.6', date: 'Jun 2026', title: 'Fix view mode reset on new document',
    notes: [
      'FIX: pdf.js resets scroll/spread mode on every setDocument call; opening a second file at the same viewMode value left it stuck on continuous instead of the forced single/two-up mode.',
    ],
  },
  {
    v: 'v3.7', date: 'Jun 2026', title: 'Keep tree mounted across tabs',
    notes: [
      "FIX: TreeView was unmounted on switching to the Outline tab, losing each folder's expand state; now hidden instead of unmounted so it stays mounted.",
    ],
  },
  {
    v: 'v3.8', date: 'Jun 2026', title: 'Loading spinner with filename',
    notes: [
      'NEW: A small spinner plus the loading file\'s name replaces the bare "Loading..." text.',
    ],
  },
  {
    v: 'v3.9', date: 'Jun 2026', title: 'Remove blank bottom safe-area padding',
    notes: [
      'FIX: The reserved bottom safe-area inset showed as an empty strip on devices with no home button (e.g. iPad); dropped, top/left/right insets kept.',
    ],
  },
  {
    v: 'v3.10', date: 'Jun 2026', title: 'iOS viewport fix: fixed positioning',
    notes: [
      'FIX: iOS miscalculates 100dvh on first paint in standalone PWA mode, leaving blank space until a scroll forces a recompute; .app pinned with position:fixed/inset:0 to sidestep it.',
    ],
  },
  {
    v: 'v4.0', date: 'Jun 2026', title: 'iOS viewport fix: scroll nudge',
    notes: [
      'FIX: position:fixed removed the scroll escape hatch, making the blank bottom bar permanent instead of dismissible; reverted to 100dvh and forces the same recompute automatically via a no-op scrollTo on mount.',
    ],
  },
  {
    v: 'v4.1', date: 'Jun 2026', title: 'iOS viewport fix: visualViewport',
    notes: [
      "FIX: The scrollTo nudge didn't trigger the real recompute; now drives --app-vh off visualViewport's resize/scroll events once a correct value settles, overriding the miscalculated 100dvh.",
    ],
  },
  {
    v: 'v4.2', date: 'Jun 2026', title: 'Debug overlay for iOS bottom-bar bug',
    notes: [
      'NEW: Temporary on-screen readout of innerHeight/visualViewport/scroll/computed .app height to get real numbers from the affected device instead of guessing.',
    ],
  },
  {
    v: 'v4.3', date: 'Jun 2026', title: 'iOS viewport fix: clientHeight-rooted sizing',
    notes: [
      'FIX: documentElement.clientHeight was correct from the first frame, unlike innerHeight/visualViewport; .app now sized via height:100% rooted in that chain instead of vh/dvh, sidestepping the bug entirely.',
      'DEP: Removes the temporary debug overlay added to diagnose this.',
    ],
  },
  {
    v: 'v4.4', date: 'Jun 2026', title: 'Debug overlay: add DOM chain measurements',
    notes: [
      'NEW: Debug overlay extended with client/offset/computed height readings for html, body, and #root, since height:100% alone did not fix the bug.',
    ],
  },
  {
    v: 'v4.5', date: 'Jun 2026', title: 'Debug overlay: identify bottom-bar element',
    notes: [
      'NEW: Debug overlay samples elementFromPoint along the bottom edge to find the actual DOM element rendered there, since every height measurement already matched.',
    ],
  },
  {
    v: 'v4.6', date: 'Jun 2026', title: 'Fix iOS home-indicator overlay bar',
    notes: [
      'FIX: The remaining bar was an iOS-drawn overlay triggered by viewport-fit=cover\'s edge-to-edge opt-in, not an app element; removing it lets iOS auto-exclude the home-indicator area.',
      'DEP: Removes the temporary debug overlay used to diagnose this.',
    ],
  },
  {
    v: 'v4.7', date: 'Jun 2026', title: 'Defer update prompt past splash',
    notes: [
      'FIX: The update prompt could show during or over the splash animation, confusing what was happening; now gated until the splash finishes naturally or is skipped.',
    ],
  },
  {
    v: 'v4.8', date: 'Jul 2026', title: 'Persist Safari/iOS folder connections',
    notes: [
      "FIX: Folders picked via the webkitdirectory fallback were excluded from persistence because their handles carry unclonable functions, wiping them from the sidebar on every reopen; now serializes the picked Files and rebuilds the handle functions on load.",
    ],
  },
  {
    v: 'v4.9', date: 'Jul 2026', title: 'Harden legacy folder storage',
    notes: [
      'NEW: Requests persistent storage on startup so connected folders survive as evictable "untouched site data"; legacy folder copies moved from IndexedDB blobs into OPFS, with a one-time migration for the old format.',
      "NEW: Warns before connecting a folder would exceed free space; adds a per-folder \"last updated\" chip and a refresh button that writes the new copy before deleting the old one, so a failed refresh can't lose data.",
    ],
  },
  {
    v: 'v4.10', date: 'Jul 2026', title: 'Fix storage lag & refresh layout',
    notes: [
      "FIX: navigator.storage.estimate()'s usage figure lagged behind real writes/deletes on WebKit, showing stale totals; folder byte size is now tracked directly instead.",
      'NEW: Loading spinner on Add folder while the picked folder is scanned/copied.',
      'FIX: Long folder names pushed the refresh/remove buttons out of the visible row.',
    ],
  },
  {
    v: 'v5.0', date: 'Jul 2026', title: 'Copy-progress modal',
    notes: [
      'NEW: A modal lists every file up front and checks each off as it copies into OPFS, with an overall progress bar and a Cancel that aborts mid-copy and cleans up the partial write.',
    ],
  },
  {
    v: 'v5.1', date: 'Jul 2026', title: 'Auto-scroll copy-progress modal',
    notes: [
      'IMP: The currently-copying row stays centered in view as a long file list advances.',
    ],
  },
  {
    v: 'v5.2', date: 'Jul 2026', title: 'Overflow menu for folder actions',
    notes: [
      'IMP: Refresh/Remove moved into a single "more actions" (⋮) menu at a fixed position, fixing icon position shifting based on folder name or "updated" chip length.',
    ],
  },
  {
    v: 'v5.3', date: 'Jul 2026', title: 'Folder row: chip/menu on their own line',
    notes: [
      'IMP: Folder name now gets a dedicated line that never shifts; the "updated" chip and actions menu moved to a second line so nothing moves regardless of text length.',
    ],
  },
  {
    v: 'v5.4', date: 'Jul 2026', title: 'Fix Safari folder-handle detection',
    notes: [
      'FIX: Feature-detecting showDirectoryPicker was not enough — Safari exposes the property with no working implementation, routing folders down a live-handle path that permanently loses permission on every reopen; now explicitly excludes WebKit via navigator.vendor.',
      'NEW: A way to clear a stuck pending folder that could never successfully reconnect.',
    ],
  },
  {
    v: 'v5.5', date: 'Jul 2026', title: 'Exclude Android from live-handle path',
    notes: [
      "FIX: Android shows the same failure mode as Safari — permission doesn't survive an app relaunch — so the live-handle folder path is now only trusted on actual desktop platforms.",
    ],
  },
  {
    v: 'v5.6', date: 'Jul 2026', title: 'Desktop sidebar collapse',
    notes: [
      'NEW: Sidebar collapses to 0 width via the same toggle already used for the mobile drawer, and auto-collapses whenever a file is opened so the viewer gets maximum space.',
    ],
  },
  {
    v: 'v5.7', date: 'Jul 2026', title: 'Move sidebar toggle into toolbar',
    notes: [
      'IMP: Desktop sidebar toggle moved into the toolbar next to the view-mode dropdown, since the topbar has no room for it like mobile does.',
      'FIX: The toolbar was unclickable behind the "Select a PDF to view" placeholder when no document was open.',
    ],
  },
  {
    v: 'v5.8', date: 'Jul 2026', title: 'Spell out folder timestamps',
    notes: [
      'IMP: "3h ago" becomes "updated 3 hours ago", with singular/plural handling and month/year buckets for anything older than a day.',
    ],
  },
  {
    v: 'v5.9', date: 'Jul 2026', title: 'Fix pinch-zoom fighting native zoom',
    notes: [
      "FIX: The custom pinch handler had nothing stopping the browser from also treating the same gesture as a native viewport zoom, producing a glitchy double-zoom; touch-action:manipulation hands pinch/double-tap entirely to the JS handler.",
    ],
  },
  {
    v: 'v5.10', date: 'Jul 2026', title: 'Fix pinch-zoom: correct touch-action value',
    notes: [
      "FIX: manipulation is shorthand that still allows native pinch-zoom; switched to pan-x pan-y (which omits it) and disabled native page scaling via the viewport meta as a fallback for gestures starting outside the PDF area.",
    ],
  },
  {
    v: 'v6.0', date: 'Jul 2026', title: 'Shared update-available modal',
    notes: [
      "NEW: Adopts brand-kit's standard UpdatePrompt/useUpdate with commit-sha build-info plumbing; Settings gains an App Update section and the gear icon shows a persistent dot while an update is pending.",
    ],
  },
  {
    v: 'v6.1', date: 'Jul 2026', title: 'Thumbnails, rotate, recents, full-text search',
    notes: [
      'NEW: Page thumbnails sidebar tab, lazy-rendered via IntersectionObserver.',
      'NEW: Rotate-page toolbar buttons and a password-protected PDF prompt.',
      'NEW: Per-file reading-progress chip, a Recent files tab, night reading mode, tree sort by name/recently-opened, and background-indexed full-text search across the library.',
    ],
  },
  {
    v: 'v6.2', date: 'Jul 2026', title: 'Sidebar rework: mobile detection & auto-hide',
    notes: [
      'IMP: Detects real phones via user agent (iPadOS reports as desktop) so only phones default to a hidden, forced-auto-hide panel; auto-hide is now an optional Settings toggle off-phone.',
      'IMP: Long file/folder names scroll horizontally instead of truncating; night reading moved from Settings into a toolbar toggle.',
    ],
  },
  {
    v: 'v6.3', date: 'Jul 2026', title: 'Night-reading icon & scrollbar fix',
    notes: [
      'IMP: Replaced the emoji night-reading icon with a plain glyph matching the other toolbar icons.',
      "FIX: The tree row list was not bounded to the panel's available height, so its horizontal scrollbar trailed after however many rows were expanded instead of staying fixed at the bottom.",
    ],
  },
  {
    v: 'v6.4', date: 'Jul 2026', title: 'Night-reading toggle style match',
    notes: [
      'IMP: Dropped the boxed icon-btn treatment so the night-reading toggle inherits the same bare button chrome as its toolbar neighbors.',
    ],
  },
  {
    v: 'v6.5', date: 'Jul 2026', title: 'Bookmarks and annotations',
    notes: [
      "NEW: Per-page bookmarks (toolbar star toggle, sidebar tab) and annotation tools (Highlight, Draw, Note) via pdf.js's built-in editor modes.",
      'NEW: Dual save destinations remembered per file — write back to the original file, or an app-managed OPFS "sidecar" copy — with a prompt on first save and a confirm before discarding unsaved edits.',
    ],
  },
  {
    v: 'v6.6', date: 'Jul 2026', title: 'Pause indexing while reading; reopen recovery',
    notes: [
      'FIX: Background full-text indexing ran unpaused while a document was open, stacking memory on a likely trigger for iPadOS killing the installed PWA; indexing now waits until no document is open.',
      'NEW: A one-tap "Reopen" banner recovers the last file when the silent auto-restore fails after the OS drops the File System Access permission grant.',
    ],
  },
  {
    v: 'v6.7', date: 'Jul 2026', title: 'Persist tree state; toolbar regroup',
    notes: [
      'NEW: Folder expand state lifted into a persisted set so expanded folders survive reload instead of resetting.',
      'IMP: Toolbar controls grouped with dividers into Zoom and Annotate dropdowns; settings button moved into the toolbar; the sidebar toggle now also collapses the topbar on desktop.',
    ],
  },
  {
    v: 'v6.8', date: 'Jul 2026', title: 'Re-fit page on viewer resize',
    notes: [
      "FIX: pdf.js only resolves a named scale (e.g. page-fit) on document load, never on container resize; a ResizeObserver now reassigns currentScaleValue to force a recompute when the sidebar/topbar collapses or the window resizes.",
    ],
  },
  {
    v: 'v6.9', date: 'Jul 2026', title: 'Restyle toolbar icons & empty state',
    notes: [
      'IMP: Unicode glyphs replaced with Tabler icons across the toolbar/search bar; bookmark/night-reading/annotate gain a background+border active-state treatment.',
      'IMP: The empty viewer now shows a brand line-art document illustration in a drop-zone; error banner gains a dismiss button.',
    ],
  },
  {
    v: 'v6.10', date: 'Jul 2026', title: 'Update prompt: toast with auto-update',
    notes: [
      "IMP: Adopts brand-kit's redesigned UpdatePrompt — a bottom-right toast with a 15s auto-update countdown, replacing the centered blocking modal.",
    ],
  },
  {
    v: 'v7.0', date: 'Jul 2026', title: 'Realign brand-kit submodule pointer',
    notes: [
      'FIX: The local submodule commit was content-identical but never pushed; repointed to the canonical pushed SHA so a fresh clone can actually fetch it.',
    ],
  },
  {
    v: 'v7.1', date: 'Jul 2026', title: 'Mobile UI polish pass',
    notes: [
      'NEW: Folder-plus icon on the Add folder button; selected tree files get a coral accent bar instead of the same background as hover.',
      'IMP: Settings moved into the mobile top bar; mobile toolbar split into a nav row and a tools row instead of relying on flex-wrap.',
    ],
  },
  {
    v: 'v7.2', date: 'Jul 2026', title: 'Fix mobile buttons showing browser chrome',
    notes: [
      'FIX: Zoom and page-nav buttons had no background/border reset, so the 44px touch-target rule exposed the default grey browser button chrome on mobile.',
    ],
  },
  {
    v: 'v7.3', date: 'Jul 2026', title: 'Collapse view-mode & search on mobile',
    notes: [
      'IMP: View-mode select becomes an icon+chevron and search collapses to an expandable icon on narrow screens, freeing enough width for the nav row to fit one line.',
    ],
  },
  {
    v: 'v7.4', date: 'Jul 2026', title: 'Merge mobile toolbar into one row',
    notes: [
      'IMP: Bookmark/annotate/night-reading/search no longer forced onto a second row now that an icon-only annotate button and collapsible search free enough width.',
      'FIX: .search-wrap had an unconditional flex basis that force-expanded it even while collapsed to a 30px icon, wasting space and causing extra wraps.',
    ],
  },
  {
    v: 'v7.5', date: 'Jul 2026', title: 'Drop zoom % and collapse page count on mobile',
    notes: [
      'IMP: Zoom percent readout removed on mobile; page count becomes a tap-to-expand jump-to-page icon, the same expand-in-place pattern as search — gets the whole toolbar onto one line at typical phone widths.',
    ],
  },
  {
    v: 'v7.6', date: 'Jul 2026', title: 'Fix mobile settings icon edge spacing',
    notes: [
      'FIX: .topbar had no horizontal padding, landing the settings button flush at 0px from the viewport edge; given the same 8px margin the sidebar toggle already has.',
    ],
  },
  {
    v: 'v7.7', date: 'Jul 2026', title: 'Safari button appearance reset',
    notes: [
      'FIX: iOS/iPadOS Safari keeps native button chrome and padding until appearance is explicitly reset, reported as uneven spacing around the bare page-nav chevrons.',
    ],
  },
  {
    v: 'v7.8', date: 'Jul 2026', title: 'Revert Safari button-appearance fix',
    notes: [
      "DEP: Reverted the previous commit's appearance reset.",
    ],
  },
  {
    v: 'v7.9', date: 'Jul 2026', title: 'Bordered box for page-nav chevrons',
    notes: [
      "FIX: The reported spacing issue measured symmetric under every scenario tested and a Safari appearance reset did not fix it either; gives all three page-nav controls identical bordered framing on mobile so nothing can read as asymmetric.",
    ],
  },
  {
    v: 'v7.10', date: 'Jul 2026', title: 'Unify mobile toolbar icon sizes',
    notes: [
      'IMP: Standardized settings/sidebar/bookmark/night-reading/annotate/search/page-jump/chevron icons to 30px on mobile and iPad (previously a 26/30/32px mix); desktop stays 32px.',
    ],
  },
  {
    v: 'v8.0', date: 'Jul 2026', title: 'Revert topbar icons to 32x32',
    notes: [
      'IMP: Sidebar/settings topbar icons reverted to 32px to match each other and desktop\'s .icon-btn size; the rest of the mobile toolbar stays 30px.',
    ],
  },
  {
    v: 'v8.1', date: 'Jul 2026', title: 'Compensate settings icon optical weight',
    notes: [
      "IMP: The gear icon's ink only fills 18x18 of its 24x24 viewBox in thin spiky teeth versus the sidebar icon's denser fill, reading visibly lighter; bumped to 19px so their actual ink footprint reads equally weighted.",
    ],
  },
  {
    v: 'v8.2', date: 'Jul 2026', title: 'Fix icon-btn padding clamp',
    notes: [
      "FIX: .icon-btn never reset the browser's default button padding, so the enlarged settings icon was flex-shrunk into a non-square squeeze that silently undermined the last two size fixes; settings icon dropped back to 18px now that it renders at true size.",
    ],
  },
  {
    v: 'v8.3', date: 'Jul 2026', title: 'Settings icon to 24px',
    notes: [
      'IMP: Mobile settings icon size increased from 18px to 24px after it still read too small.',
    ],
  },
  {
    v: 'v8.4', date: 'Jul 2026', title: 'Settings icon settled at 20px',
    notes: [
      'IMP: Mobile settings icon size adjusted to 20px following live device testing.',
    ],
  },
  {
    v: 'v8.5', date: 'Jul 2026', title: 'Settings icon to 32px for testing',
    notes: [
      'IMP: Mobile settings icon temporarily set to 32px for testing.',
    ],
  },
  {
    v: 'v8.6', date: 'Jul 2026', title: 'Settings button box to 40x40',
    notes: [
      "FIX: .icon-btn's fixed 32x32 box was clamping the gear icon regardless of its size prop; the settings toggle now gets its own larger box so the icon renders at true size, while the sidebar toggle stays at 32px.",
    ],
  },
  {
    v: 'v8.7', date: 'Jul 2026', title: 'Settings button box to 48x48',
    notes: [
      'IMP: Mobile settings button box enlarged from 40x40 to 48x48.',
    ],
  },
  {
    v: 'v8.8', date: 'Jul 2026', title: 'Settings box to 42x42, wider margin',
    notes: [
      'IMP: Mobile settings button box settled at 42x42 with its edge margin doubled to 16px.',
    ],
  },
  {
    v: 'v8.9', date: 'Jul 2026', title: 'Custom dropdown for mobile page-view',
    notes: [
      "IMP: Page-view mode's overlay-hidden native <select> replaced with the same custom dropdown component already used for the zoom and annotate options; desktop keeps the native select.",
    ],
  },
  {
    v: 'v8.10', date: 'Jul 2026', title: 'Fix view-mode dropdown alignment on Safari',
    notes: [
      "FIX: The nested select/dropdown/trigger structure relied on flex defaults that rendered correctly in Chromium but diverged on real Safari; alignment now set explicitly at every nesting level.",
    ],
  },
  {
    v: 'v9.0', date: 'Jul 2026', title: 'Reorder & auto-hide mobile toolbar controls',
    notes: [
      'IMP: Search reordered next to page-nav via flex order (mobile/iPad only); opening search or jump-to-page now hides the other controls via :has() instead of letting them wrap to a second line, keeping the toolbar height constant.',
    ],
  },
  {
    v: 'v9.1', date: 'Aug 2026', title: 'Rename to eDoc',
    notes: [
      'IMP: Shortened "EDOCUMENT READER"/"DOCUMENT VIEWER" to the consistent "eDoc" label used elsewhere for this app.',
    ],
  },
  {
    v: 'v9.2', date: 'Aug 2026', title: 'Collapse search bar on touch devices',
    notes: [
      'FIX: On iPad landscape widths, 44px-floored touch controls plus the full-width search input overflowed the toolbar row, pushing settings onto its own line; search now collapses to the same tap-to-expand icon mobile uses, gated on pointer:coarse.',
    ],
  },
  {
    v: 'v9.3', date: 'Aug 2026', title: 'Compact view-mode select on touch',
    notes: [
      'FIX: The narrowest current iPad (944px landscape) still wrapped the settings icon after the search-bar fix; the view-mode select now swaps to the icon+chevron dropdown on pointer:coarse devices too.',
    ],
  },
  {
    v: 'v9.4', date: 'Aug 2026', title: 'Collapsible outline, per-tab scroll',
    notes: [
      'NEW: Outline nodes with children get a disclosure toggle, start collapsed, and remember expanded/collapsed state per file in IndexedDB.',
      "FIX: The sidebar scrolled as one block, dragging the Folders/Recent/Bookmarks/Outline/Pages tab bar off-screen with long content; each tab's content now scrolls in its own bounded region.",
    ],
  },
  {
    v: 'v9.5', date: 'Aug 2026', title: 'Floating Add-folder button',
    notes: [
      "IMP: The full-width Add-folder button (which pushed the tree down) replaced with a floating FAB anchored to the panel's corner, visible only on the Folders tab.",
    ],
  },
  {
    v: 'v9.6', date: 'Aug 2026', title: 'Fix auto-hide inconsistency across tabs',
    notes: [
      'FIX: Outline/Bookmarks/Pages navigation unconditionally closed the sidebar, while Folders/Recent only did so per the Auto-hide setting; all four now route through the same check.',
    ],
  },
  {
    v: 'v9.7', date: 'Aug 2026', title: 'Global filename + content search',
    notes: [
      "NEW: A persistent, folder-independent search replaces the main pane with grouped snippet results, overlaid on a permanently-mounted PdfViewer instead of unmounting it (which was crashing pdf.js on the next open).",
      'DEP: Dropped the sort dropdown and "recently opened" tree sort.',
    ],
  },
  {
    v: 'v9.8', date: 'Aug 2026', title: 'Simulated progress popup on desktop',
    notes: [
      "IMP: Desktop's near-instant metadata-only folder scan now reuses the copy-progress modal with a simulated, file-count-scaled reveal, for visual consistency with iPad/Android's real per-file copy progress.",
    ],
  },
  {
    v: 'v9.9', date: 'Aug 2026', title: 'Indexing phase in progress popup',
    notes: [
      'NEW: The folder progress popup extended with a follow-on "Indexing for search" phase after Adding/Refreshing, with a "Run in background" option that collapses it to a dismissible pill.',
    ],
  },
  {
    v: 'v9.10', date: 'Aug 2026', title: 'Indexing reliability fixes',
    notes: [
      "FIX: extractText now races a 20s timeout so a hung PDF can't freeze every file behind it in the strictly sequential indexing queue.",
      'FIX: Failed files retry up to 3 times then stop, with a dismissible banner; textIndex now keys by full relative path instead of bare filename, so same-named files in different folders no longer shadow each other.',
    ],
  },
  {
    v: 'v10.0', date: 'Aug 2026', title: 'Fix resume opening orphaned files',
    notes: [
      "FIX: Resume-on-launch reopened the last file based only on permission being granted, with no check against currently connected folders, so a file whose folder was removed kept resurfacing every reload; now checked with isSameEntry against the connected folders.",
    ],
  },
  {
    v: 'v10.1', date: 'Aug 2026', title: 'Remove full-text content search',
    notes: [
      "DEP: Dropped background full-text indexing, textIndex.js, and its IndexedDB persistence, plus the indexing-progress popup/pill and \"couldn't index\" banner — indexing a 10,000+ file library one file at a time proved too slow a trade-off.",
      'IMP: Global search simplified to pure filename matching; "Search in document" (Ctrl+F) and the folder add/refresh progress popup are unaffected.',
    ],
  },
  {
    v: 'v10.2', date: 'Aug 2026', current: true, title: 'Tree remove-from-view & drag-to-rearrange',
    notes: [
      'NEW: A virtual overlay lets individual files and subfolders be hidden from the tree, or dragged to reorder/move between folders, without touching the real filesystem — and it survives Refresh since it is reapplied to every fresh scan.',
    ],
  },
]
