import { useCallback, useEffect, useRef, useState } from "react";
import {
  pickFolder,
  scanDirectory,
  supportsDirectoryPicker,
  pickFolderLegacy,
  buildTreeFromFileList,
  wrapDroppedFile,
  writeLegacyFiles,
  buildLegacyManifest,
  reviveLegacyManifest,
  reviveInlineLegacyFolder,
  treeByteSize,
  flattenTreeFiles,
  flattenTreeFilesWithPath,
  flattenTreeFileHandles,
  isMobileDevice,
} from "./fileSystem.js";
import { deleteLegacyFolderFiles } from "./opfs.js";
import { requestPersistentStorage, getStorageEstimate } from "./storage.js";
import { loadDocument } from "./edoc.js";
import { getAnnotationMode, loadAnnotatedCopy, saveAnnotations } from "./annotations.js";
import { dbGet, dbSet, dbDelete } from "./db.js";
import { AnnotationEditorType } from "pdfjs-dist";
import {
  IconX,
  IconFolder,
  IconPlus,
  IconClock,
  IconBookmark,
  IconListTree,
  IconLayoutGrid,
  IconLayoutSidebar,
  IconSettings,
  IconSearch,
  IconArrowLeft,
} from "@tabler/icons-react";
import TreeView from "./TreeView.jsx";
import SearchResults from "./SearchResults.jsx";
import OutlineView from "./OutlineView.jsx";
import BookmarksView from "./BookmarksView.jsx";
import RecentView from "./RecentView.jsx";
import ThumbnailView from "./ThumbnailView.jsx";
import PdfViewer, { SCROLL_MODE_BY_VIEW, SPREAD_MODE_BY_VIEW } from "./PdfViewer.jsx";
import Toolbar from "./Toolbar.jsx";
import Settings from "./Settings.jsx";
import CopyProgressModal from "./CopyProgressModal.jsx";
import AnnotationModePicker from "./AnnotationModePicker.jsx";
import BrandBanner from "@brand/BrandBanner";
import SplashScreen from "@brand/SplashScreen";
import UpdatePrompt from "@brand/UpdatePrompt";
import { useUpdate } from "@brand/useUpdate";
import "./App.css";

const DEFAULT_SETTINGS = {
  theme: "system",
  resumePosition: true,
  keepAwake: false,
  nightReading: false,
  autoHideSidebar: false,
};

// Keep in sync with the mobile-layout breakpoint in App.css. Drives the
// drawer-vs-collapse CSS treatment and the single/two-page default — purely
// width-based, unlike IS_MOBILE below (see fileSystem.js) which drives the
// sidebar's default open/closed state and isn't affected by window width.
const NARROW_QUERY = "(max-width: 880px)";
const IS_MOBILE = isMobileDevice();

const ANNOTATION_EDITOR_MODE_BY_TOOL = {
  highlight: AnnotationEditorType.HIGHLIGHT,
  ink: AnnotationEditorType.INK,
  freetext: AnnotationEditorType.FREETEXT,
};

function formatBytes(bytes) {
  if (bytes == null) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const onSplashFinish = useCallback(() => setShowSplash(false), []);
  const [folders, setFolders] = useState([]); // [{ key, dirHandle, tree, connectedAt, folderId }] — tree is null while pending permission; folderId only exists for legacy (OPFS-backed) folders
  const [selectedHandle, setSelectedHandle] = useState(null);
  const [pdf, setPdf] = useState(null);
  // Two-page (or single-page on narrow screens) + fit-page is forced on
  // every file open (see selectFile/onPagesInit below) — this initial
  // value only matters before any file has been opened yet.
  const [viewMode, setViewMode] = useState("two-up");
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  const [scale, setScale] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  // Set when restoring the last-open file on launch finds the handle but
  // the read permission grant didn't survive (e.g. the OS killed and
  // reloaded the page in the background) — surfaces a one-tap "Reopen"
  // banner instead of silently landing on the empty file browser.
  const [pendingReopen, setPendingReopen] = useState(null);
  const [viewerApi, setViewerApi] = useState(null);
  // Phone starts with the drawer closed; iPad and desktop start with the
  // sidebar expanded, regardless of window width.
  const [sidebarOpen, setSidebarOpen] = useState(() => !IS_MOBILE);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const update = useUpdate("edoc");
  const [outline, setOutline] = useState(null);
  const [sidebarTab, setSidebarTab] = useState("folders");
  // [{ fileHandle, name, openedAt }], newest first — legacy (OPFS) handles
  // carry function properties IndexedDB can't clone, so only real handles
  // persist across reload (same restriction lastFileHandle already has);
  // legacy opens still show up in the list for the current session.
  const [recentFiles, setRecentFiles] = useState([]);
  // { [fileName]: [{ page, createdAt }] }, page-ascending — user-created
  // marks, distinct from the PDF's own outline.
  const [bookmarks, setBookmarks] = useState({});
  // { [fileName]: [path, ...] } — which outline nodes are expanded, keyed by
  // a stable "0-2-1" index path rather than title (titles repeat; paths are
  // stable across reopens since getOutline() returns the same structure
  // every time). Nodes default to collapsed, so only expanded paths are
  // ever stored.
  const [outlineExpanded, setOutlineExpanded] = useState({});
  // null | "highlight" | "ink" | "freetext" — mirrored onto
  // pdfViewer.annotationEditorMode by the effect below.
  const [annotationTool, setAnnotationTool] = useState(null);
  const [hasUnsavedAnnotations, setHasUnsavedAnnotations] = useState(false);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [storageEstimate, setStorageEstimate] = useState(null); // { quota } in bytes — usage comes from folders' own sizeBytes instead, see refreshStorageEstimate
  const [refreshingKeys, setRefreshingKeys] = useState(() => new Set());
  const [addingFolder, setAddingFolder] = useState(false); // live-handle (desktop) scan only — legacy copies use copyProgress instead
  const [copyProgress, setCopyProgress] = useState(null); // { title, folderName, files, doneSet } while copying a legacy folder's files into OPFS
  const pendingRestoreRef = useRef(null);
  const restoringRef = useRef(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const copyControllerRef = useRef(null); // AbortController for the in-progress copy, so the modal's Cancel button can reach it
  // Persist-on-change effects below would otherwise fire once on mount
  // with default state, racing ahead of (and clobbering) the load below.
  const initializedRef = useRef(false);

  // Restore last session: directory handles need a user gesture to
  // re-request permission in most browsers, so folders without it show
  // a per-folder "Reconnect" button instead of silently failing.
  useEffect(() => {
    (async () => {
      // Exempts our storage from Safari's "clear untouched site data"
      // eviction and raises the quota ceiling — silently granted for
      // installed home-screen apps, nothing to react to here.
      requestPersistentStorage();

      const savedSettings = await dbGet("settings");
      const resolvedSettings = { ...DEFAULT_SETTINGS, ...savedSettings };
      setSettings(resolvedSettings);
      initializedRef.current = true;

      const loaded = [];

      const rootRecords = (await dbGet("rootDirHandles")) || [];
      for (const record of rootRecords) {
        // Backward-compat: the pre-timestamp format stored a bare array
        // of handles instead of { dirHandle, connectedAt } records.
        const dirHandle = record?.dirHandle ?? record;
        const connectedAt = record?.dirHandle ? record.connectedAt : null;
        const granted = (await dirHandle.queryPermission({ mode: "read" })) === "granted";
        loaded.push({
          key: crypto.randomUUID(),
          dirHandle,
          connectedAt,
          tree: granted ? await scanDirectory(dirHandle) : null,
        });
      }

      // Legacy (Safari/iOS, no File System Access API) folders have no
      // permission to re-check — the file copies live in OPFS already,
      // so they're ready to browse immediately, no reconnect needed.
      const legacyRecords = (await dbGet("legacyFolders")) || [];
      let legacyNeedsResave = false;
      for (const record of legacyRecords) {
        if (record.manifest) {
          const tree = reviveLegacyManifest(record.id, record.manifest);
          loaded.push({
            key: crypto.randomUUID(),
            dirHandle: tree.handle,
            tree,
            connectedAt: record.connectedAt,
            folderId: record.id,
            sizeBytes: record.sizeBytes ?? 0,
          });
        } else {
          // Backward-compat: the very first version of this feature stored
          // file bytes inline in IndexedDB instead of in OPFS. Migrate it:
          // revive the old shape, write the bytes into OPFS under a fresh
          // folderId, then let the resave below drop the old inline copy.
          const tree = reviveInlineLegacyFolder(record);
          const folderId = crypto.randomUUID();
          await writeLegacyFiles(folderId, tree);
          loaded.push({
            key: crypto.randomUUID(),
            dirHandle: tree.handle,
            tree,
            connectedAt: null,
            folderId,
            sizeBytes: treeByteSize(tree),
          });
          legacyNeedsResave = true;
        }
      }

      setFolders(loaded);
      if (legacyNeedsResave) saveFolderList(loaded);
      refreshStorageEstimate();

      setRecentFiles((await dbGet("recentFiles")) || []);
      setBookmarks((await dbGet("bookmarks")) || {});
      setOutlineExpanded((await dbGet("outlineExpanded")) || {});
      // One-time cleanup: content search (and the indexed text it stored
      // under these keys) has been removed — reclaim whatever was already
      // saved instead of leaving it orphaned in IndexedDB forever.
      dbDelete("textIndex");
      dbDelete("indexFailCounts");

      if (resolvedSettings.resumePosition) {
        const lastFileHandle = await dbGet("lastFileHandle");
        if (lastFileHandle) {
          // A handle round-tripped through IndexedDB is never === to a
          // fresh scan's handle for the same file — isSameEntry is the
          // only reliable identity check — so this confirms the file still
          // belongs to a folder that's actually connected right now.
          // Without it, a file whose folder was removed in a past session
          // would keep resurfacing here forever: the same orphaned-document
          // problem handleRemoveFolder already guards against live, just
          // hit from the resume-on-launch path instead. Legacy (iPad/
          // Android) folders are skipped — their handles aren't real
          // FileSystemHandles and lastFileHandle is never one of theirs
          // (legacy opens are never saved as lastFileHandle to begin with).
          let stillConnected = false;
          for (const f of loaded) {
            if (!f.tree || f.dirHandle?.__legacy) continue;
            for (const x of flattenTreeFileHandles(f.tree)) {
              if (await x.handle.isSameEntry(lastFileHandle)) {
                stillConnected = true;
                break;
              }
            }
            if (stillConnected) break;
          }
          if (stillConnected) {
            if ((await lastFileHandle.queryPermission({ mode: "read" })) === "granted") {
              selectFile(lastFileHandle);
            } else {
              // Permission grant didn't survive (most often: the OS killed
              // and reloaded the page in the background) — re-requesting it
              // needs a user gesture, so offer a one-tap reopen instead of
              // silently landing on the empty file browser.
              setPendingReopen({ fileHandle: lastFileHandle, name: lastFileHandle.name });
            }
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initializedRef.current) return;
    dbSet("settings", settings);
  }, [settings]);

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = (e) => setIsNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Crossing the narrow breakpoint (e.g. rotating a phone) re-asserts the
  // width-based default live, the same way opening a file does.
  useEffect(() => {
    if (!pdf) return;
    setViewMode(isNarrow ? "single" : "two-up");
  }, [isNarrow, pdf]);

  useEffect(() => {
    if (settings.theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  // Wake Lock only holds while the tab is visible — the browser releases
  // it automatically on hide, so re-acquire on visibilitychange instead
  // of trying to fight that.
  useEffect(() => {
    if (!settings.keepAwake || !pdf) return;
    let lock = null;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock?.request("screen");
      } catch {
        // ignore — e.g. permission denied or unsupported
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      lock?.release();
    };
  }, [settings.keepAwake, pdf]);

  function updateSettings(partial) {
    setSettings((prev) => ({ ...prev, ...partial }));
  }

  // Per-file page/zoom memory, keyed by filename. restoringRef guards the
  // window between picking a new file and pdfjs firing pagesinit for it —
  // without it, this effect would fire with the previous file's still-current
  // page/scale and clobber the new file's saved position before restore runs.
  useEffect(() => {
    if (!selectedHandle || restoringRef.current) return;
    (async () => {
      const all = (await dbGet("filePositions")) || {};
      all[selectedHandle.name] = { page: currentPage, scale, numPages };
      await dbSet("filePositions", all);
    })();
  }, [selectedHandle, currentPage, scale, numPages]);

  // Drive the pdf.js viewer from React state/events instead of rendering
  // pages ourselves — see PdfViewer.jsx.
  useEffect(() => {
    if (!viewerApi) return;
    const { eventBus } = viewerApi;
    const onPageChanging = (e) => setCurrentPage(e.pageNumber);
    const onScaleChanging = (e) => setScale(e.scale);
    const onPagesInit = () => {
      // pdf.js resets scrollMode/spreadMode to its own defaults (continuous,
      // no spread) on every setDocument call, regardless of what they were
      // set to before — reassert ours here so a same-viewMode reopen (e.g.
      // two files on the same wide/narrow screen) doesn't silently fall back
      // to continuous. The effect below only catches *changes* to viewMode.
      viewerApi.pdfViewer.scrollMode = SCROLL_MODE_BY_VIEW[viewMode];
      viewerApi.pdfViewer.spreadMode = SPREAD_MODE_BY_VIEW[viewMode];
      // Fit-page always wins on open — per-file zoom memory below still
      // gets written, but isn't read back here. Page position is.
      viewerApi.pdfViewer.currentScaleValue = "page-fit";
      const pending = pendingRestoreRef.current;
      if (pending?.page) viewerApi.pdfViewer.currentPageNumber = pending.page;
      pendingRestoreRef.current = null;
      restoringRef.current = false;
    };
    eventBus.on("pagechanging", onPageChanging);
    eventBus.on("scalechanging", onScaleChanging);
    eventBus.on("pagesinit", onPagesInit);
    return () => {
      eventBus.off("pagechanging", onPageChanging);
      eventBus.off("scalechanging", onScaleChanging);
      eventBus.off("pagesinit", onPagesInit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerApi, viewMode]);

  useEffect(() => {
    if (!viewerApi) return;
    if (!pdf) {
      setOutline(null);
      // Closing a doc (search typing, back-to-results, a failed open) has
      // to clear this the same way opening one does below — otherwise it's
      // stuck at whatever it was, and the next selectFile call's own
      // unsaved-annotations guard blocks silently on a stale true.
      setHasUnsavedAnnotations(false);
      setNumPages(0);
      return;
    }
    viewerApi.pdfViewer.setDocument(pdf);
    viewerApi.linkService.setDocument(pdf);
    setNumPages(pdf.numPages);
    pdf.getOutline().then((items) => setOutline(items?.length ? items : null));
    // Tracks whether there are annotation edits not yet baked into a save
    // (write-back or sidecar, see annotations.js) — drives the toolbar
    // Save button's enabled state.
    setHasUnsavedAnnotations(false);
    pdf.annotationStorage.onSetModified = () => setHasUnsavedAnnotations(true);
    pdf.annotationStorage.onResetModified = () => setHasUnsavedAnnotations(false);
  }, [viewerApi, pdf]);

  useEffect(() => {
    // The editor UI manager (and so the annotationEditorMode setter) isn't
    // created until partway through pdf.js's own async setDocument work —
    // it dispatches "annotationeditoruimanager" the moment it's ready.
    // Applying immediately handles a tool change on an already-settled
    // document; the listener catches the race right after a fresh load.
    if (!viewerApi || !pdf) return;
    const mode = ANNOTATION_EDITOR_MODE_BY_TOOL[annotationTool] ?? AnnotationEditorType.NONE;
    function applyMode() {
      try {
        viewerApi.pdfViewer.annotationEditorMode = { mode };
      } catch {
        // Not ready yet — the event listener below re-applies once it is.
      }
    }
    applyMode();
    viewerApi.eventBus.on("annotationeditoruimanager", applyMode);
    return () => viewerApi.eventBus.off("annotationeditoruimanager", applyMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerApi, pdf, annotationTool]);

  // Keyboard shortcuts: arrows/PageUp/PageDown for paging, +/- for zoom,
  // Ctrl/Cmd+F to focus search. Skipped while typing in a field (except
  // Ctrl/Cmd+F, which has no risk of colliding with normal typing).
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        document.getElementById("doc-search-input")?.focus();
        return;
      }
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!viewerApi) return;
      const { pdfViewer } = viewerApi;
      if (e.key === "ArrowLeft" || e.key === "PageUp") pdfViewer.previousPage();
      else if (e.key === "ArrowRight" || e.key === "PageDown") pdfViewer.nextPage();
      else if (e.key === "+" || e.key === "=") pdfViewer.increaseScale();
      else if (e.key === "-" || e.key === "_") pdfViewer.decreaseScale();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerApi]);

  useEffect(() => {
    if (!viewerApi) return;
    viewerApi.pdfViewer.scrollMode = SCROLL_MODE_BY_VIEW[viewMode];
    viewerApi.pdfViewer.spreadMode = SPREAD_MODE_BY_VIEW[viewMode];
  }, [viewerApi, viewMode]);

  // Saves the lightweight folder list only — real handles (Chromium)
  // structured-clone as-is, and legacy folders save their (already OPFS-
  // backed) manifest, not file bytes. Never call this expecting it to
  // write any file content; that only happens in writeLegacyFiles.
  function saveFolderList(next) {
    const real = next.filter((f) => !f.dirHandle.__legacy);
    dbSet("rootDirHandles", real.map((f) => ({ dirHandle: f.dirHandle, connectedAt: f.connectedAt })));

    const legacy = next.filter((f) => f.dirHandle.__legacy);
    dbSet(
      "legacyFolders",
      legacy.map((f) => ({
        id: f.folderId,
        connectedAt: f.connectedAt,
        manifest: buildLegacyManifest(f.tree),
        sizeBytes: f.sizeBytes,
      }))
    );
  }

  // De-dupes by filename (same key filePositions uses) and caps at 10, most
  // recent first. Only real (non-legacy) handles get persisted — see the
  // recentFiles state comment above for why.
  function addToRecent(fileHandle) {
    setRecentFiles((prev) => {
      const next = [
        { fileHandle, name: fileHandle.name, openedAt: Date.now() },
        ...prev.filter((e) => e.name !== fileHandle.name),
      ].slice(0, 10);
      dbSet(
        "recentFiles",
        next.filter((e) => !e.fileHandle.__legacy)
      );
      return next;
    });
  }

  // Shared read-modify-write for one file's bookmark list — updater gets the
  // existing list (or []) and returns the new one; an empty result drops the
  // file's key entirely rather than persisting a stale empty array.
  function updateBookmarks(name, updater) {
    setBookmarks((prev) => {
      const nextList = updater(prev[name] || []);
      const next = { ...prev };
      if (nextList.length) next[name] = nextList;
      else delete next[name];
      dbSet("bookmarks", next);
      return next;
    });
  }

  function toggleBookmark() {
    if (!selectedHandle) return;
    updateBookmarks(selectedHandle.name, (existing) =>
      existing.some((b) => b.page === currentPage)
        ? existing.filter((b) => b.page !== currentPage)
        : [...existing, { page: currentPage, createdAt: Date.now() }].sort((a, b) => a.page - b.page)
    );
  }

  function removeBookmark(page) {
    if (!selectedHandle) return;
    updateBookmarks(selectedHandle.name, (existing) => existing.filter((b) => b.page !== page));
  }

  // Same read-modify-write shape as updateBookmarks, one entry per outline
  // node path instead of per page.
  function toggleOutlineNode(path) {
    if (!selectedHandle) return;
    setOutlineExpanded((prev) => {
      const name = selectedHandle.name;
      const existing = prev[name] || [];
      const nextPaths = existing.includes(path) ? existing.filter((p) => p !== path) : [...existing, path];
      const next = { ...prev };
      if (nextPaths.length) next[name] = nextPaths;
      else delete next[name];
      dbSet("outlineExpanded", next);
      return next;
    });
  }

  // Bakes current annotation edits into the chosen destination (see
  // annotations.js) and clears the "unsaved" flag. Also the path "change
  // save mode" takes — re-saving to the newly chosen destination keeps it
  // current even if nothing changed since the last save.
  async function performAnnotationSave(mode) {
    if (!selectedHandle || !pdf) return;
    await saveAnnotations(selectedHandle, pdf, mode);
    setHasUnsavedAnnotations(false);
  }

  // Legacy (Safari/OPFS) files have no real filesystem handle to write
  // back to — they're already an app-managed copy, so "sidecar" is the
  // only meaningful destination and there's nothing to ask about.
  async function handleSaveAnnotations() {
    if (!selectedHandle) return;
    if (selectedHandle.__legacy) {
      await performAnnotationSave("sidecar");
      return;
    }
    const mode = await getAnnotationMode(selectedHandle.name);
    if (mode) await performAnnotationSave(mode);
    else setModePickerOpen(true);
  }

  function handleChangeAnnotationMode() {
    if (!selectedHandle || selectedHandle.__legacy) return;
    setModePickerOpen(true);
  }

  function handleAnnotationModeChosen(mode) {
    setModePickerOpen(false);
    performAnnotationSave(mode);
  }

  // Only fetches the device's overall quota — "used" is tracked ourselves
  // from folders' own sizeBytes (see foldersBytesUsed below), since
  // navigator.storage.estimate()'s usage figure lags behind real writes/
  // deletes by as much as an app relaunch, which made the storage line
  // show stale (e.g. doubled, or not-yet-zeroed) numbers right after a
  // refresh or removal.
  async function refreshStorageEstimate() {
    setStorageEstimate(await getStorageEstimate());
  }

  // Drives the CopyProgressModal for a legacy tree's OPFS write: shows the
  // full file list immediately, checks each one off as writeLegacyFiles
  // reports it done, and wires the modal's Cancel button to an
  // AbortController so a cancel mid-copy stops promptly instead of
  // finishing regardless. Always clears copyProgress when done, whether
  // that's success, a real failure, or a cancel (an AbortError, which
  // callers below catch and handle by cleaning up the partial OPFS copy).
  async function copyFolderFiles(folderId, tree, title, folderName) {
    const files = flattenTreeFiles(tree);
    const controller = new AbortController();
    copyControllerRef.current = controller;
    setCopyProgress({ title, folderName, files, doneSet: new Set() });
    try {
      await writeLegacyFiles(folderId, tree, {
        signal: controller.signal,
        onFileDone: (relativePath) =>
          setCopyProgress((p) => (p ? { ...p, doneSet: new Set(p.doneSet).add(relativePath) } : p)),
      });
    } finally {
      setCopyProgress(null);
      copyControllerRef.current = null;
    }
  }

  // Desktop's directory scan (scanDirectory) is metadata-only and finishes
  // near-instantly — there's no real per-file work to show progress on.
  // This paces a reveal of the same CopyProgressModal iPad/Android's real
  // per-file copy uses, purely so desktop gets the same visual experience
  // for Add/Refresh folder. Each tick holds for TICK_MS before advancing —
  // long enough for the checkmark and CopyProgressModal's smooth-scroll to
  // actually be visible; an earlier version paced by a ~4s total duration
  // instead, which for a folder in the thousands of files meant updates
  // faster than the eye (or the scroll animation) could register, reading
  // as frozen rather than ticking. Tick count scales with sqrt(file count),
  // capped so a huge folder still wraps up in a few seconds rather than
  // genuinely one-by-one. Throws an AbortError (matching copyFolderFiles'
  // real-cancel shape) on Cancel, so callers can share the same catch-and-
  // bail handling.
  async function simulateScanProgress(tree, title, folderName) {
    const files = flattenTreeFilesWithPath(tree);
    const total = files.length;
    if (total === 0) return;
    const controller = new AbortController();
    copyControllerRef.current = controller;
    setCopyProgress({ title, folderName, files, doneSet: new Set(), actionLabel: "scanned" });
    try {
      const TICK_MS = 140;
      const ticks = Math.min(total, Math.min(50, Math.max(4, Math.round(6 * Math.sqrt(total)))));
      for (let t = 1; t <= ticks; t++) {
        await new Promise((resolve, reject) => {
          const id = setTimeout(resolve, TICK_MS);
          controller.signal.addEventListener("abort", () => {
            clearTimeout(id);
            reject(new DOMException("Aborted", "AbortError"));
          }, { once: true });
        });
        const doneCount = Math.round((t / ticks) * total);
        setCopyProgress((p) =>
          p ? { ...p, doneSet: new Set(files.slice(0, doneCount).map((f) => f.relativePath)) } : p
        );
      }
    } finally {
      setCopyProgress(null);
      copyControllerRef.current = null;
    }
  }

  async function handleAddFolder() {
    let dirHandle, tree, folderId, sizeBytes;
    if (supportsDirectoryPicker()) {
      dirHandle = await pickFolder();
      setAddingFolder(true);
      try {
        tree = await scanDirectory(dirHandle);
      } finally {
        setAddingFolder(false);
      }
      try {
        await simulateScanProgress(tree, "Adding folder", dirHandle.name);
      } catch (err) {
        if (err.name !== "AbortError") setError(`Couldn't add "${dirHandle.name}": ${err.message}`);
        return;
      }
    } else {
      const fileList = await pickFolderLegacy();
      tree = buildTreeFromFileList(fileList);
      if (!tree) {
        setError("No PDF files found in that folder.");
        return;
      }
      dirHandle = tree.handle;
      folderId = crypto.randomUUID();
      sizeBytes = treeByteSize(tree);

      const estimate = await getStorageEstimate();
      if (estimate && sizeBytes > estimate.quota - foldersBytesUsed) {
        setError(
          `"${dirHandle.name}" (${formatBytes(sizeBytes)}) is bigger than the space free on this device ` +
            `(${formatBytes(estimate.quota - foldersBytesUsed)}). It may not fully save.`
        );
      }
      try {
        await copyFolderFiles(folderId, tree, "Adding folder", dirHandle.name);
      } catch (err) {
        await deleteLegacyFolderFiles(folderId);
        if (err.name !== "AbortError") setError(`Couldn't save "${dirHandle.name}": ${err.message}`);
        return;
      }
    }
    const connectedAt = Date.now();
    const key = crypto.randomUUID();
    setFolders((prev) => {
      const next = [...prev, { key, dirHandle, tree, connectedAt, folderId, sizeBytes }];
      saveFolderList(next);
      return next;
    });
    refreshStorageEstimate();
  }

  async function handleReconnect(dirHandle) {
    const granted = (await dirHandle.requestPermission({ mode: "read" })) === "granted";
    if (!granted) return;
    const tree = await scanDirectory(dirHandle);
    const connectedAt = Date.now();
    setFolders((prev) => {
      const next = prev.map((f) => (f.dirHandle === dirHandle ? { ...f, tree, connectedAt } : f));
      saveFolderList(next);
      return next;
    });
  }

  async function handleReconnectAll(dirHandles) {
    for (const dirHandle of dirHandles) await handleReconnect(dirHandle);
  }

  // Folders never get a silent background refresh (no permission/handle
  // persists for the legacy path — see fileSystem.js), so this always
  // re-opens the native picker. Once the user re-picks the same folder:
  // the fresh copy is written under a *new* OPFS folderId first, and only
  // once that fully succeeds is the old folderId's copy deleted — so a
  // failed refresh (cancelled picker, ran out of storage) leaves the
  // previous working copy untouched instead of losing it.
  async function handleRefreshFolder(key) {
    const target = folders.find((f) => f.key === key);
    if (!target) return;
    setRefreshingKeys((prev) => new Set(prev).add(key));
    try {
      if (target.dirHandle.__legacy) {
        let fileList;
        try {
          fileList = await pickFolderLegacy();
        } catch {
          return; // cancelled — leave the existing copy as-is
        }
        const tree = buildTreeFromFileList(fileList);
        if (!tree) {
          setError("No PDF files found in that folder.");
          return;
        }
        const newFolderId = crypto.randomUUID();
        const sizeBytes = treeByteSize(tree);
        try {
          await copyFolderFiles(newFolderId, tree, "Refreshing folder", target.dirHandle.name);
        } catch (err) {
          await deleteLegacyFolderFiles(newFolderId);
          if (err.name !== "AbortError") {
            setError(`Couldn't refresh "${target.dirHandle.name}": ${err.message}`);
          }
          return;
        }
        await deleteLegacyFolderFiles(target.folderId);
        const connectedAt = Date.now();
        setFolders((prev) => {
          const next = prev.map((f) =>
            f.key === key
              ? { ...f, dirHandle: tree.handle, tree, connectedAt, folderId: newFolderId, sizeBytes }
              : f
          );
          saveFolderList(next);
          return next;
        });
      } else {
        const granted = (await target.dirHandle.requestPermission({ mode: "read" })) === "granted";
        if (!granted) return;
        const tree = await scanDirectory(target.dirHandle);
        try {
          await simulateScanProgress(tree, "Refreshing folder", target.dirHandle.name);
        } catch (err) {
          if (err.name !== "AbortError") {
            setError(`Couldn't refresh "${target.dirHandle.name}": ${err.message}`);
          }
          return;
        }
        const connectedAt = Date.now();
        setFolders((prev) => {
          const next = prev.map((f) => (f.key === key ? { ...f, tree, connectedAt } : f));
          saveFolderList(next);
          return next;
        });
      }
      refreshStorageEstimate();
    } catch (err) {
      setError(`Couldn't refresh folder: ${err.message}`);
    } finally {
      setRefreshingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  // Closes the open document if it (or a subfolder containing it) belongs
  // to the folder being removed — otherwise it'd stay open, orphaned, with
  // no folder backing it. Looked up from the pre-removal `folders` closure
  // since the file has to still be in the tree being removed to match.
  function handleRemoveFolder(key) {
    const removedFolder = folders.find((f) => f.key === key);
    setFolders((prev) => {
      const target = prev.find((f) => f.key === key);
      if (target?.folderId) deleteLegacyFolderFiles(target.folderId);
      const next = prev.filter((f) => f.key !== key);
      saveFolderList(next);
      return next;
    });
    refreshStorageEstimate();
    if (
      removedFolder?.tree &&
      selectedHandle &&
      flattenTreeFileHandles(removedFolder.tree).some((f) => f.handle === selectedHandle)
    ) {
      setPdf(null);
      setSelectedHandle(null);
      setError(null);
      setPendingReopen(null);
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  // Shared with selectFile below — same rule for every "jump to a spot in
  // the document" action (opening a file, or navigating from Outline/
  // Bookmarks/Pages): forced on phone, opt-in elsewhere via Settings >
  // Auto-hide panel.
  function closeSidebarIfAutoHide() {
    if (IS_MOBILE || settings.autoHideSidebar) setSidebarOpen(false);
  }

  // Drag-and-drop: folders only work via getAsFileSystemHandle (Chromium);
  // other browsers can still drop individual PDF files, which is the more
  // common case anyway.
  async function handleDrop(e) {
    e.preventDefault();
    const items = [...e.dataTransfer.items].filter((i) => i.kind === "file");
    for (const item of items) {
      if (item.getAsFileSystemHandle) {
        const handle = await item.getAsFileSystemHandle();
        if (handle.kind === "directory") {
          const tree = await scanDirectory(handle);
          setFolders((prev) => {
            const next = [...prev, { key: crypto.randomUUID(), dirHandle: handle, tree, connectedAt: Date.now() }];
            saveFolderList(next);
            return next;
          });
          refreshStorageEstimate();
        } else if (handle.name.toLowerCase().endsWith(".pdf")) {
          selectFile(handle);
        }
      } else {
        const file = item.getAsFile();
        if (file?.name.toLowerCase().endsWith(".pdf")) {
          selectFile(wrapDroppedFile(file));
        }
      }
    }
  }

  async function selectFile(fileHandle) {
    // Switching files abandons whatever's in the current document's
    // annotationStorage — confirm rather than silently losing drawn/typed
    // edits the user hasn't saved yet.
    if (hasUnsavedAnnotations) {
      const proceed = window.confirm(
        `You have unsaved annotations on "${selectedHandle?.name}". Switch files and discard them?`
      );
      if (!proceed) return;
    }
    setSelectedHandle(fileHandle);
    setError(null);
    setPendingReopen(null);
    closeSidebarIfAutoHide();
    setLoading(true);
    // Two-page (or single-page on narrow screens) + fit-page is the
    // default on every open; manually switching view mode only sticks
    // for the file currently open.
    setViewMode(isNarrow ? "single" : "two-up");
    restoringRef.current = true;
    try {
      // A sidecar copy (see annotations.js) holds this file's saved
      // annotations when its mode is "sidecar" — load that instead of the
      // original so they carry across sessions; the original is only ever
      // touched in "writeback" mode.
      const file = (await loadAnnotatedCopy(fileHandle.name)) || (await fileHandle.getFile());
      let timeoutId;
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Timed out loading PDF")), 15000);
      });
      // A password prompt blocks the JS thread for as long as the user takes
      // to answer it — cancel the load timeout the instant one appears, or
      // it'd fire the moment the thread frees up regardless of how long ago
      // the 15s actually elapsed.
      const doc = await Promise.race([
        loadDocument(file, { onPasswordPrompt: () => clearTimeout(timeoutId) }),
        timeout,
      ]);
      const positions = (await dbGet("filePositions")) || {};
      pendingRestoreRef.current = positions[fileHandle.name] || null;
      setPdf(doc);
      if (!fileHandle.__legacy) await dbSet("lastFileHandle", fileHandle);
      addToRecent(fileHandle);
    } catch (err) {
      console.error(err);
      setError(`Couldn't open "${fileHandle.name}": ${err.message}`);
      setPdf(null);
      restoringRef.current = false;
    } finally {
      setLoading(false);
    }
  }

  // Any edit to the global search field, while a document is open, closes
  // it — clearing the field this way lands on the blank state rather than
  // restoring whatever was open before search started, matching the rest
  // of the main pane always reflecting the field's current value.
  function handleGlobalSearchChange(value) {
    if (pdf) {
      if (
        hasUnsavedAnnotations &&
        !window.confirm(`You have unsaved annotations on "${selectedHandle?.name}". Discard them?`)
      ) {
        return;
      }
      setPdf(null);
      setSelectedHandle(null);
      setError(null);
      setPendingReopen(null);
    }
    setGlobalSearch(value);
  }

  // "Back to results" button, shown while viewing a doc opened from a
  // search hit — closes the doc without touching the query, so the results
  // list (recomputed from the still-populated field) reappears.
  function backToResults() {
    if (
      hasUnsavedAnnotations &&
      !window.confirm(`You have unsaved annotations on "${selectedHandle?.name}". Discard them?`)
    ) {
      return;
    }
    setPdf(null);
    setSelectedHandle(null);
    setError(null);
    setPendingReopen(null);
  }

  // Button-click handler for the "Reopen [name]" banner — the click itself
  // is the user gesture requestPermission needs, unlike the silent
  // queryPermission check on launch.
  async function reopenLastFile() {
    const { fileHandle } = pendingReopen;
    if ((await fileHandle.requestPermission({ mode: "read" })) === "granted") {
      selectFile(fileHandle);
    } else {
      setPendingReopen(null);
    }
  }

  const pendingFolders = folders.filter((f) => !f.tree);
  const currentBookmarks = selectedHandle ? bookmarks[selectedHandle.name] || [] : [];
  const isBookmarked = currentBookmarks.some((b) => b.page === currentPage);
  const currentOutlineExpanded = new Set(selectedHandle ? outlineExpanded[selectedHandle.name] || [] : []);
  const tabAvailable = {
    folders: true,
    recent: recentFiles.length > 0,
    bookmarks: currentBookmarks.length > 0,
    outline: !!outline,
    pages: !!pdf && numPages > 0,
  };
  const showTabs = tabAvailable.recent || tabAvailable.bookmarks || tabAvailable.outline || tabAvailable.pages;
  const activeTab = showTabs && tabAvailable[sidebarTab] ? sidebarTab : "folders";
  const foldersBytesUsed = folders.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);

  return (
    <div className="app" onDragOver={handleDragOver} onDrop={handleDrop}>
      {showSplash && <SplashScreen onFinish={onSplashFinish} />}
      <UpdatePrompt ready={!showSplash} update={update} />
      {settingsOpen && (
        <Settings
          settings={settings}
          onChange={updateSettings}
          onClose={() => setSettingsOpen(false)}
          update={update}
          isMobile={IS_MOBILE}
        />
      )}
      {copyProgress && (
        <CopyProgressModal
          title={copyProgress.title}
          folderName={copyProgress.folderName}
          files={copyProgress.files}
          doneSet={copyProgress.doneSet}
          onCancel={() => copyControllerRef.current?.abort()}
        />
      )}
      {modePickerOpen && selectedHandle && (
        <AnnotationModePicker
          fileName={selectedHandle.name}
          onChoose={handleAnnotationModeChosen}
          onClose={() => setModePickerOpen(false)}
        />
      )}
      <div className={`topbar${sidebarOpen ? "" : " collapsed"}`}>
        <button
          className="icon-btn sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          aria-pressed={sidebarOpen}
        >
          <IconLayoutSidebar size={16} />
        </button>
        <BrandBanner subtitle="eDoc" />
        <button
          className="icon-btn settings-toggle"
          style={{ marginLeft: "auto" }}
          onClick={() => setSettingsOpen(true)}
          aria-label={update.needRefresh ? "Settings · update available" : "Settings"}
        >
          {/* Gear's teeth-and-ring shape is optically lighter than the
              sidebar icon's solid rectangle at the same nominal size. */}
          <IconSettings size={32} />
          {update.needRefresh && <span className="update-dot" />}
        </button>
      </div>
      <div className="app-row">
        {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
        <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
          {folders.length > 0 && (
            <div className="global-search">
              <IconSearch size={14} className="global-search-icon" />
              <input
                type="text"
                className="global-search-input"
                placeholder="Search files and content…"
                value={globalSearch}
                onChange={(e) => handleGlobalSearchChange(e.target.value)}
              />
              {globalSearch && (
                <button
                  className="icon-btn global-search-clear"
                  aria-label="Clear search"
                  onClick={() => handleGlobalSearchChange("")}
                >
                  <IconX size={14} />
                </button>
              )}
            </div>
          )}
          {showTabs && (
            <div className="sidebar-tabs">
              <button
                className={`sidebar-tab${activeTab === "folders" ? " active" : ""}`}
                onClick={() => setSidebarTab("folders")}
              >
                <IconFolder size={14} />
                Folders
              </button>
              {tabAvailable.recent && (
                <button
                  className={`sidebar-tab${activeTab === "recent" ? " active" : ""}`}
                  onClick={() => setSidebarTab("recent")}
                >
                  <IconClock size={14} />
                  Recent
                </button>
              )}
              {tabAvailable.bookmarks && (
                <button
                  className={`sidebar-tab${activeTab === "bookmarks" ? " active" : ""}`}
                  onClick={() => setSidebarTab("bookmarks")}
                >
                  <IconBookmark size={14} />
                  Bookmarks
                </button>
              )}
              {tabAvailable.outline && (
                <button
                  className={`sidebar-tab${activeTab === "outline" ? " active" : ""}`}
                  onClick={() => setSidebarTab("outline")}
                >
                  <IconListTree size={14} />
                  Outline
                </button>
              )}
              {tabAvailable.pages && (
                <button
                  className={`sidebar-tab${activeTab === "pages" ? " active" : ""}`}
                  onClick={() => setSidebarTab("pages")}
                >
                  <IconLayoutGrid size={14} />
                  Pages
                </button>
              )}
            </div>
          )}
          {activeTab === "recent" && (
            <div className="sidebar-tab-panel">
              <RecentView recentFiles={recentFiles} onSelectFile={selectFile} selectedHandle={selectedHandle} />
            </div>
          )}
          {activeTab === "bookmarks" && (
            <div className="sidebar-tab-panel">
              <BookmarksView
                bookmarks={currentBookmarks}
                currentPage={currentPage}
                onNavigate={(n) => {
                  if (viewerApi) viewerApi.pdfViewer.currentPageNumber = n;
                  closeSidebarIfAutoHide();
                }}
                onRemove={removeBookmark}
              />
            </div>
          )}
          {activeTab === "outline" && (
            <div className="sidebar-tab-panel">
              <OutlineView
                items={outline}
                linkService={viewerApi?.linkService}
                onNavigate={closeSidebarIfAutoHide}
                expandedKeys={currentOutlineExpanded}
                onToggle={toggleOutlineNode}
              />
            </div>
          )}
          {activeTab === "pages" && (
            <div className="sidebar-tab-panel">
              <ThumbnailView
                pdf={pdf}
                numPages={numPages}
                currentPage={currentPage}
                onSelect={(n) => {
                  if (viewerApi) viewerApi.pdfViewer.currentPageNumber = n;
                  closeSidebarIfAutoHide();
                }}
              />
            </div>
          )}
          {/* Kept mounted (just hidden) instead of unmounted on tab switch —
              TreeView's expanded-folder state is local to each Node, and
              unmounting it collapses the whole tree back to the root. */}
          <div className="folders-panel" hidden={activeTab !== "folders"}>
            {folders.length === 0 && <p className="folders-empty-hint">No folders yet — tap + to add one.</p>}
            {pendingFolders.length > 0 && (
              <div className="pending-folders">
                <button
                  className="cb-btn"
                  onClick={() => handleReconnectAll(pendingFolders.map((f) => f.dirHandle))}
                >
                  Reconnect all
                </button>
                {pendingFolders.map((f) => (
                  <div key={f.key} className="pending-folder-row">
                    <span className="pending-folder-name">{f.dirHandle.name}</span>
                    <button
                      className="tree-icon-btn"
                      title={`Reconnect "${f.dirHandle.name}"`}
                      aria-label={`Reconnect "${f.dirHandle.name}"`}
                      onClick={() => handleReconnect(f.dirHandle)}
                    >
                      ↻
                    </button>
                    <button
                      className="tree-icon-btn"
                      title={`Remove "${f.dirHandle.name}"`}
                      aria-label={`Remove "${f.dirHandle.name}"`}
                      onClick={() => handleRemoveFolder(f.key)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {storageEstimate && (
              <div className="storage-usage">
                {formatBytes(foldersBytesUsed)} used of {formatBytes(storageEstimate.quota)}
              </div>
            )}
            <TreeView
              folders={folders.filter((f) => f.tree)}
              onSelectFile={selectFile}
              selectedHandle={selectedHandle}
              onRemoveFolder={handleRemoveFolder}
              onRefreshFolder={handleRefreshFolder}
              refreshingKeys={refreshingKeys}
            />
            {/* Anchored to .folders-panel, not .tree-rows — stays put in the
                corner as the tree scrolls underneath it. */}
            <button
              className="add-folder-fab"
              onClick={handleAddFolder}
              disabled={addingFolder}
              aria-label="Add folder"
              title="Add folder"
            >
              {addingFolder ? <span className="spinner" /> : <IconPlus size={20} />}
            </button>
          </div>
        </aside>
        <main className="main">
          <Toolbar
            viewMode={viewMode}
            setViewMode={setViewMode}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            scale={scale}
            currentPage={currentPage}
            numPages={numPages}
            pdfViewer={viewerApi?.pdfViewer}
            eventBus={viewerApi?.eventBus}
            nightReading={settings.nightReading}
            onToggleNightReading={() => updateSettings({ nightReading: !settings.nightReading })}
            isBookmarked={isBookmarked}
            onToggleBookmark={toggleBookmark}
            annotationTool={annotationTool}
            onSetAnnotationTool={setAnnotationTool}
            hasUnsavedAnnotations={hasUnsavedAnnotations}
            onSaveAnnotations={handleSaveAnnotations}
            onChangeAnnotationMode={handleChangeAnnotationMode}
            onOpenSettings={() => setSettingsOpen(true)}
            settingsUpdateAvailable={update.needRefresh}
          />
          {error && (
            <div className="error-banner">
              <span>{error}</span>
              <button aria-label="Dismiss" onClick={() => setError(null)}>
                <IconX size={16} />
              </button>
            </div>
          )}
          {globalSearch.trim() && pdf && (
            <div className="back-to-results-banner">
              <button className="cb-btn" onClick={backToResults}>
                <IconArrowLeft size={14} />
                Back to results
              </button>
            </div>
          )}
          {/* PdfViewer stays mounted for the app's whole lifetime — it builds
              its own pdf.js viewer/eventBus once on mount (see PdfViewer.jsx)
              and swaps documents via the pdf prop, so it must never be
              conditionally unmounted (e.g. while search results are showing)
              or that internal viewer is torn down and pdf.js breaks on the
              next open. Loading/search-results/empty states are layered on
              top of it instead, same trick .viewer-empty already used. */}
          <PdfViewer pdf={pdf} viewMode={viewMode} onReady={setViewerApi} nightReading={settings.nightReading} />
          {loading ? (
            <div className="viewer-empty">
              <span className="viewer-loading">
                <span className="spinner" />
                Loading {selectedHandle?.name}…
              </span>
            </div>
          ) : globalSearch.trim() && !pdf ? (
            <SearchResults query={globalSearch} folders={folders} onOpenResult={selectFile} />
          ) : !pdf ? (
            <div className="viewer-empty">
              {pendingReopen ? (
                <span className="reopen-banner">
                  Lost your place — reopen "{pendingReopen.name}"?
                  <button className="cb-btn cb-btn--primary" onClick={reopenLastFile}>
                    REOPEN
                  </button>
                  <button className="cb-btn" onClick={() => setPendingReopen(null)}>
                    DISMISS
                  </button>
                </span>
              ) : (
                <div className="empty-illustration">
                  <svg className="empty-illustration-icon" width="150" height="150" viewBox="0 0 150 150" aria-hidden="true">
                    <defs>
                      <linearGradient id="empty-doc-grad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="var(--cb-mint)" />
                        <stop offset="55%" stopColor="var(--cb-blue)" />
                        <stop offset="100%" stopColor="var(--cb-violet)" />
                      </linearGradient>
                    </defs>
                    <rect
                      x="4"
                      y="4"
                      width="142"
                      height="142"
                      rx="8"
                      fill="none"
                      stroke="url(#empty-doc-grad)"
                      strokeWidth="1.5"
                      strokeDasharray="6 6"
                      opacity="0.45"
                    />
                    <polyline
                      points="52,38 52,112 98,112 98,58 78,38 52,38"
                      fill="none"
                      stroke="url(#empty-doc-grad)"
                      strokeWidth="3"
                      strokeLinejoin="miter"
                    />
                    <polyline
                      points="78,38 78,58 98,58"
                      fill="none"
                      stroke="url(#empty-doc-grad)"
                      strokeWidth="3"
                      strokeLinejoin="miter"
                    />
                    <line x1="60" y1="76" x2="90" y2="76" stroke="url(#empty-doc-grad)" strokeWidth="2" />
                    <line x1="60" y1="88" x2="90" y2="88" stroke="url(#empty-doc-grad)" strokeWidth="2" />
                    <line x1="60" y1="100" x2="80" y2="100" stroke="url(#empty-doc-grad)" strokeWidth="2" />
                    <polyline
                      points="112,86 124,98 112,110"
                      fill="none"
                      stroke="url(#empty-doc-grad)"
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    <line x1="112" y1="98" x2="123" y2="98" stroke="url(#empty-doc-grad)" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  <div className="empty-illustration-text">
                    <div className="empty-illustration-headline">Wow, such empty</div>
                    <div className="empty-illustration-subtext">Drag a PDF here, or pick one from the sidebar</div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export default App;
