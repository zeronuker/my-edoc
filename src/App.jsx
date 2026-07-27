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
  flattenTreeFileHandles,
  isMobileDevice,
} from "./fileSystem.js";
import { deleteLegacyFolderFiles } from "./opfs.js";
import { requestPersistentStorage, getStorageEstimate } from "./storage.js";
import { loadDocument } from "./edoc.js";
import { extractText } from "./textIndex.js";
import { getAnnotationMode, loadAnnotatedCopy, saveAnnotations } from "./annotations.js";
import { dbGet, dbSet } from "./db.js";
import { AnnotationEditorType } from "pdfjs-dist";
import {
  IconX,
  IconFolder,
  IconClock,
  IconBookmark,
  IconListTree,
  IconLayoutGrid,
  IconLayoutSidebar,
} from "@tabler/icons-react";
import TreeView from "./TreeView.jsx";
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
  // { [fileName]: extractedLowercaseText } — built lazily in the background
  // (see the indexing effect below), persisted whole under one IndexedDB
  // key like filePositions/recentFiles above.
  // ponytail: no size cap, no indexing progress UI — bounded to run only
  // while no document is open (see pdfOpenRef) so it doesn't pile onto an
  // active reading session's memory footprint.
  const [textIndex, setTextIndex] = useState({});
  const indexingRef = useRef(false);
  // Mirrors `pdf` for the indexing loop below, which can't put `pdf`
  // itself in its effect deps without restarting the whole walk every
  // time a file is opened/closed.
  const pdfOpenRef = useRef(false);
  useEffect(() => {
    pdfOpenRef.current = !!pdf;
  }, [pdf]);
  // { [fileName]: [{ page, createdAt }] }, page-ascending — user-created
  // marks, distinct from the PDF's own outline.
  const [bookmarks, setBookmarks] = useState({});
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
      setTextIndex((await dbGet("textIndex")) || {});
      setBookmarks((await dbGet("bookmarks")) || {});

      if (resolvedSettings.resumePosition) {
        const lastFileHandle = await dbGet("lastFileHandle");
        if (lastFileHandle) {
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

  // Background text indexing for full-text search: walks every connected
  // folder, extracts+caches text for any file not already indexed, one at a
  // time. Runs whenever the folder list changes (new folder, refresh);
  // already-indexed files (checked against the textIndex snapshot from when
  // this run started) are skipped, so this is a no-op on a re-render that
  // doesn't add new files.
  //
  // Paused for as long as a document is open (pdfOpenRef): decoding PDFs
  // in the background on top of an already-open, already-rendered document
  // stacks memory fast, especially on iPad, where it's a good way to get
  // the whole tab killed and reloaded by the OS. Indexing picks back up
  // the moment the open document is closed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (indexingRef.current) return;
      indexingRef.current = true;
      try {
        const files = folders.filter((f) => f.tree).flatMap((f) => flattenTreeFileHandles(f.tree));
        for (const { name, handle } of files) {
          if (cancelled) return;
          if (textIndex[name]) continue;
          while (pdfOpenRef.current && !cancelled) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          if (cancelled) return;
          try {
            const file = await handle.getFile();
            const text = await extractText(file);
            if (cancelled) return;
            setTextIndex((prev) => {
              const next = { ...prev, [name]: text };
              dbSet("textIndex", next);
              return next;
            });
          } catch {
            // Unreadable, corrupt, or password-protected (skipPassword) —
            // leave unindexed; filename search still works for it.
          }
        }
      } finally {
        indexingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders]);

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
    setFolders((prev) => {
      const next = [...prev, { key: crypto.randomUUID(), dirHandle, tree, connectedAt, folderId, sizeBytes }];
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

  function handleRemoveFolder(key) {
    setFolders((prev) => {
      const target = prev.find((f) => f.key === key);
      if (target?.folderId) deleteLegacyFolderFiles(target.folderId);
      const next = prev.filter((f) => f.key !== key);
      saveFolderList(next);
      return next;
    });
    refreshStorageEstimate();
  }

  function handleDragOver(e) {
    e.preventDefault();
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
    // Forced on phone; opt-in elsewhere via Settings > Auto-hide panel.
    if (IS_MOBILE || settings.autoHideSidebar) setSidebarOpen(false);
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
      <UpdatePrompt ready={!showSplash} update={update} appLabel="CLAUDEBORNE EDOCUMENT READER" />
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
        <BrandBanner subtitle="DOCUMENT VIEWER" />
      </div>
      <div className="app-row">
        {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
        <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
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
            <RecentView recentFiles={recentFiles} onSelectFile={selectFile} selectedHandle={selectedHandle} />
          )}
          {activeTab === "bookmarks" && (
            <BookmarksView
              bookmarks={currentBookmarks}
              currentPage={currentPage}
              onNavigate={(n) => {
                if (viewerApi) viewerApi.pdfViewer.currentPageNumber = n;
                setSidebarOpen(false);
              }}
              onRemove={removeBookmark}
            />
          )}
          {activeTab === "outline" && (
            <OutlineView
              items={outline}
              linkService={viewerApi?.linkService}
              onNavigate={() => setSidebarOpen(false)}
            />
          )}
          {activeTab === "pages" && (
            <ThumbnailView
              pdf={pdf}
              numPages={numPages}
              currentPage={currentPage}
              onSelect={(n) => {
                if (viewerApi) viewerApi.pdfViewer.currentPageNumber = n;
                setSidebarOpen(false);
              }}
            />
          )}
          {/* Kept mounted (just hidden) instead of unmounted on tab switch —
              TreeView's expanded-folder state is local to each Node, and
              unmounting it collapses the whole tree back to the root. */}
          <div className="folders-panel" hidden={activeTab !== "folders"}>
            <button className="cb-btn cb-btn--accent" onClick={handleAddFolder} disabled={addingFolder}>
              {addingFolder ? (
                <span className="viewer-loading">
                  <span className="spinner" />
                  Adding…
                </span>
              ) : (
                "Add folder"
              )}
            </button>
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
              recentFiles={recentFiles}
              textIndex={textIndex}
            />
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
          <PdfViewer pdf={pdf} viewMode={viewMode} onReady={setViewerApi} nightReading={settings.nightReading} />
          {(loading || !pdf) && (
            <div className="viewer-empty">
              {loading ? (
                <span className="viewer-loading">
                  <span className="spinner" />
                  Loading {selectedHandle?.name}…
                </span>
              ) : pendingReopen ? (
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
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
