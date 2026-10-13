import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  pickFolderLegacy,
  buildTreeFromFileList,
  wrapDroppedFile,
  writeLegacyFiles,
  reviveLegacyManifest,
  reviveLegacyFileHandle,
  treeByteSize,
  flattenTreeFiles,
  flattenTreeFileHandles,
  isMobileDevice,
  extrasKey,
  fileKeyFor,
  newStoredName,
  pickPdfFiles,
  filesInDirectory,
  planAddedFiles,
  insertFilesIntoTree,
  findNodeAt,
  removeNodeFromTree,
} from "./fileSystem.js";
import {
  deleteLegacyFolderFiles,
  deleteLegacyFiles,
  sweepOrphanFolders,
  writeLegacyFile,
  listAnnotatedCopyNames,
  deleteAnnotatedCopy,
} from "./opfs.js";
import { requestPersistentStorage, getStorageEstimate } from "./storage.js";
import { saveAnnotations } from "./annotations.js";
import { usePdfDocument } from "./usePdfDocument.js";
import { useTreeOverlay } from "./useTreeOverlay.js";
import { useWakeLock } from "./useWakeLock.js";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts.js";
import { useTransitionAnim, ANIM_SPEED_MS, animDurationMs } from "./useTransitionAnim.js";
import { usePresence } from "./usePresence.js";
import { makeNodeKey, parseNodeKey } from "./treeOverlay.js";
import { dbGet, dbSet } from "./db.js";
import {
  formatBytes,
  freeSpaceWarning,
  omitKeys,
  folderListRecords,
  nextRecentFiles,
  toggleBookmarkList,
  removeBookmarkFromList,
  toggleOutlinePath,
} from "./appHelpers.js";
import { AnnotationEditorType } from "pdfjs-dist";
import {
  IconX,
  IconFolder,
  IconPlus,
  IconFolderPlus,
  IconFilePlus,
  IconClock,
  IconBookmark,
  IconListTree,
  IconLayoutGrid,
  IconLayoutSidebar,
  IconSettings,
  IconSearch,
  IconArrowLeft,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import TreeView from "./TreeView.jsx";
import SearchResults from "./SearchResults.jsx";
import OutlineView from "./OutlineView.jsx";
import BookmarksView from "./BookmarksView.jsx";
import RecentView from "./RecentView.jsx";
import ThumbnailView from "./ThumbnailView.jsx";
import PdfViewer from "./PdfViewer.jsx";
import Toolbar from "./Toolbar.jsx";
import CopyProgressModal from "./CopyProgressModal.jsx";
import AddFilesModal from "./AddFilesModal.jsx";
import ConfirmRemoveModal from "./ConfirmRemoveModal.jsx";
import PlaceFolderModal from "./PlaceFolderModal.jsx";
import ChoiceModal from "./ChoiceModal.jsx";
import BrandBanner from "@brand/BrandBanner";
import SplashScreen from "@brand/SplashScreen";
import UpdatePrompt from "@brand/UpdatePrompt";
import { useUpdate } from "@brand/useUpdate";
import "./App.css";

// Lazy: pulls in the full changelog (see changelog.js) and its own render
// path, neither needed on first paint — most sessions never open Settings.
const Settings = lazy(() => import("./Settings.jsx"));

const DEFAULT_SETTINGS = {
  theme: "system",
  resumePosition: true,
  keepAwake: false,
  readingTheme: "off",
  readingBrightness: 100,
  readingContrast: 100,
  autoHideSidebar: false,
  animEnabled: true,
  animStyle: "slide", // "slide" | "rise"
  animSpeed: "normal", // "normal" | "slow" | "slower"
};

const SIDEBAR_TAB_ORDER = ["folders", "recent", "bookmarks", "outline", "pages"];

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

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const onSplashFinish = useCallback(() => setShowSplash(false), []);
  const [folders, setFolders] = useState([]); // [{ key, dirHandle, tree, connectedAt, folderId, sizeBytes }] — every folder is a copy in the app's own OPFS storage (see fileSystem.js)
  const foldersRef = useRef([]); // always the latest `folders`, for async code that must not read a stale closure
  foldersRef.current = folders;
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  const [error, setError] = useState(null);
  const [viewerApi, setViewerApi] = useState(null);
  // Phone starts with the drawer closed; iPad and desktop start with the
  // sidebar expanded, regardless of window width.
  const [sidebarOpen, setSidebarOpen] = useState(() => !IS_MOBILE);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);
  const settingsCloseTimer = useRef(null);
  const appRef = useRef(null);
  const update = useUpdate("edoc");
  const [sidebarTab, setSidebarTab] = useState("folders");
  // [{ fileHandle, name, openedAt }], newest first. Handles carry function
  // properties IndexedDB can't clone, so what's saved is each file's OPFS
  // address (see persistRecent); a dropped file has none and isn't saved.
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
  const [storageEstimate, setStorageEstimate] = useState(null); // { quota } in bytes — usage comes from folders' own sizeBytes instead, see refreshStorageEstimate
  const [copyProgress, setCopyProgress] = useState(null); // { title, folderName, files, doneCount } while copying files into OPFS
  const [globalSearch, setGlobalSearch] = useState("");
  const [addFiles, setAddFiles] = useState(null); // { files: File[] } while the Add files dialog is open
  const [removeRequest, setRemoveRequest] = useState(null); // { node, name, kind, isRoot?, folderKey, relPath, count, cleanNames, annotatedCount, otherCount } while the × confirmation is open
  const [removeBusy, setRemoveBusy] = useState(false);
  const [placement, setPlacement] = useState(null); // { folderName, resolve } while the Add folder "where to show it" dialog is open
  const lastPlacementRef = useRef(null); // keeps that dialog's content on screen through its exit animation
  const [choice, setChoice] = useState(null); // { ...ChoiceModal spec, resolve } while a "pick one" question is open
  const lastChoiceRef = useRef(null);
  const lastRemoveRef = useRef(null); // keeps the confirmation's content on screen through its exit animation
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const fabRef = useRef(null);
  const [addFilesBusy, setAddFilesBusy] = useState(false);
  const lastAddFilesRef = useRef(null); // keeps the dialog's content on screen through its exit animation
  const copyControllerRef = useRef(null); // AbortController for the in-progress copy, so the modal's Cancel button can reach it
  // Persist-on-change effects below would otherwise fire once on mount
  // with default state, racing ahead of (and clobbering) the load below.
  const initializedRef = useRef(false);

  const {
    pdf,
    selectedHandle,
    numPages,
    currentPage,
    scale,
    viewMode,
    setViewMode,
    loading,
    outline,
    hasUnsavedAnnotations,
    setHasUnsavedAnnotations,
    selectFile,
    closeDocument,
    clearDocument,
  } = usePdfDocument({ isNarrow, viewerApi, closeSidebarIfAutoHide, addToRecent, setError });

  // Shared between the sidebar tree (renders/edits it) and search (needs the
  // same arranged view so results show where things are drawn) — see
  // useTreeOverlay.js.
  const { displayFolders, allDisplayFolders, placeRoot, releaseNested, dropNode } = useTreeOverlay(
    folders.filter((f) => f.tree)
  );

  // Restore last session. Every folder is a copy in the app's own storage,
  // so there's no permission to re-grant and nothing to reconnect.
  useEffect(() => {
    // StrictMode (dev) mounts this twice and the two async loads overlap.
    // Only the latest may apply its result: a stale one finishing after a
    // removal would put back the folder state it read before that.
    let cancelled = false;
    (async () => {
      // Exempts our storage from Safari's "clear untouched site data"
      // eviction and raises the quota ceiling — silently granted for
      // installed home-screen apps, nothing to react to here.
      requestPersistentStorage();

      const savedSettings = await dbGet("settings");
      const resolvedSettings = { ...DEFAULT_SETTINGS, ...savedSettings };
      setSettings(resolvedSettings);
      initializedRef.current = true;

      // The file copies live in OPFS already, so they're ready to browse
      // immediately.
      const records = (await dbGet("legacyFolders")) || [];
      const loaded = records.map((record) => {
        const tree = reviveLegacyManifest(record.id, record.manifest);
        return {
          key: crypto.randomUUID(),
          dirHandle: tree.handle,
          tree,
          connectedAt: record.connectedAt,
          folderId: record.id,
          sizeBytes: record.sizeBytes ?? 0,
        };
      });

      if (cancelled) return;
      setFolders(loaded);
      refreshStorageEstimate();
      // Free any copy a killed app left half-written (see sweepOrphanFolders).
      sweepOrphanFolders(loaded.map((f) => f.folderId))
        .then((n) => n > 0 && refreshStorageEstimate())
        .catch(() => {});

      // A saved file address points at the tree's own handle for that file;
      // one whose folder or file has since been removed is dead, so it's dropped.
      const fileNodeOf = (folderId, relativePath) => {
        const folder = loaded.find((f) => f.folderId === folderId);
        const node = folder && findNodeAt(folder.tree, relativePath);
        return node?.kind === "file" ? node : null;
      };
      const savedRecent = (await dbGet("recentFiles")) || [];
      const keptRecent = savedRecent.filter((e) => fileNodeOf(e.folderId, e.relativePath));
      if (keptRecent.length !== savedRecent.length) dbSet("recentFiles", keptRecent);
      setRecentFiles(
        keptRecent.map((e) => ({
          name: e.name,
          openedAt: e.openedAt,
          fileHandle: fileNodeOf(e.folderId, e.relativePath).handle,
        }))
      );
      setBookmarks((await dbGet("bookmarks")) || {});
      setOutlineExpanded((await dbGet("outlineExpanded")) || {});

      if (resolvedSettings.resumePosition) {
        // A file is saved as its OPFS address (see usePdfDocument.js) —
        // "still connected" just means its folder hasn't been removed.
        const lastFile = await dbGet("lastFileHandle");
        const node = lastFile && fileNodeOf(lastFile.folderId, lastFile.relativePath);
        if (node) selectFile(node.handle);
      }
    })().catch((err) => {
      console.error(err);
      setError(`Couldn't load your folders: ${err.message}`);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initializedRef.current) return;
    // Debounced: the reading-theme brightness/contrast sliders fire this
    // effect on every drag tick, and each dbSet opens a fresh IndexedDB
    // connection (see db.js) — coalesce to one write per pause in dragging.
    const timer = setTimeout(() => dbSet("settings", settings), 300);
    return () => clearTimeout(timer);
  }, [settings]);

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = (e) => setIsNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (settings.theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  // Sidebar / top bar open and close ("slide a cover"). On desktop the layout
  // changes in ONE step (the PDF area resizes once, so it never re-lays out
  // mid-animation — that was the jitter), and the bars then glide using
  // transform only, which runs on the compositor:
  //  - opening: the real sidebar / top bar slide in from the edge;
  //  - closing: copies of them (the originals are already gone from the
  //    layout) slide out over the content, then are removed.
  // The top bar's height is remembered while it is visible, since it reads 0
  // once collapsed.
  const topbarRef = useRef(null);
  const topbarHeightRef = useRef(0);
  useEffect(() => {
    const el = topbarRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      if (el.offsetHeight > 0) topbarHeightRef.current = el.offsetHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sidebarMountedRef = useRef(false);
  useLayoutEffect(() => {
    if (!sidebarMountedRef.current) {
      sidebarMountedRef.current = true;
      return undefined;
    }
    const app = appRef.current;
    const ms = animDurationMs();
    if (!app || !ms || !window.matchMedia("(min-width: 881px)").matches) return undefined;
    const sidebar = app.querySelector(".sidebar");
    const topbar = app.querySelector(".topbar");
    const row = app.querySelector(".app-row");
    if (!sidebar || !topbar || !row) return undefined;

    const opts = { duration: ms, easing: "cubic-bezier(.4, 0, .2, 1)" };
    const undo = [];
    if (sidebarOpen) {
      const a1 = sidebar.animate([{ transform: "translateX(-100%)" }, { transform: "none" }], opts);
      const a2 = topbar.animate([{ transform: "translateY(-100%)" }, { transform: "none" }], opts);
      undo.push(() => { a1.cancel(); a2.cancel(); });
    } else {
      const h = topbarHeightRef.current;
      // The row now starts where the top bar used to, so the old sidebar sat
      // h below it and the old top bar sat at the row's top.
      const r = row.getBoundingClientRect();
      const sc = sidebar.cloneNode(true);
      sc.classList.add("open", "slide-ghost");
      sc.setAttribute("aria-hidden", "true");
      Object.assign(sc.style, { left: `${r.left}px`, top: `${r.top + h}px`, height: `${r.height - h}px` });
      const tc = topbar.cloneNode(true);
      tc.classList.add("slide-ghost");
      tc.setAttribute("aria-hidden", "true");
      Object.assign(tc.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${h}px` });
      document.body.append(sc, tc);
      const a1 = sc.animate([{ transform: "none" }, { transform: "translateX(-100%)" }], { ...opts, fill: "forwards" });
      const a2 = tc.animate([{ transform: "none" }, { transform: "translateY(-100%)" }], { ...opts, fill: "forwards" });
      a1.onfinish = () => sc.remove();
      a2.onfinish = () => tc.remove();
      undo.push(() => { a1.cancel(); a2.cancel(); sc.remove(); tc.remove(); });
    }
    return () => undo.forEach((f) => f());
  }, [sidebarOpen]);

  // Animation speed for every transition (sidebar tabs, dialogs, sidebar
  // slide). 0ms when animations are off, so everything becomes instant.
  useEffect(() => {
    const ms = settings.animEnabled === false ? 0 : ANIM_SPEED_MS[settings.animSpeed] || ANIM_SPEED_MS.normal;
    document.documentElement.style.setProperty("--ed-dur", `${ms}ms`);
  }, [settings.animEnabled, settings.animSpeed]);

  // While reading, this only kicks in if the user opted into "Keep screen
  // awake" — a comfort preference. While a legacy-folder copy is running
  // (copyProgress), it's unconditional instead: there's no resume
  // checkpoint if the screen locks and iOS later reclaims the tab (see
  // writeLegacyFiles in fileSystem.js), so an interrupted copy costs a
  // full redo of however many files were left, not just an inconvenience.
  useWakeLock(!!copyProgress || (settings.keepAwake && !!pdf));

  function openSettings() {
    clearTimeout(settingsCloseTimer.current);
    setSettingsClosing(false);
    setSettingsOpen(true);
  }

  // Keep Settings mounted for one animation (reverse of its open zoom), then
  // unmount. Skips the wait when animations are off or Reduce Motion is on.
  function closeSettings() {
    if (settingsClosing) return;
    const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ed-dur")) || 0;
    if (!ms || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSettingsOpen(false);
      return;
    }
    setSettingsClosing(true);
    settingsCloseTimer.current = setTimeout(() => {
      setSettingsOpen(false);
      setSettingsClosing(false);
    }, ms);
  }

  function updateSettings(partial) {
    setSettings((prev) => ({ ...prev, ...partial }));
  }

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

  useKeyboardShortcuts(viewerApi);

  // Same dismiss rules as a folder's ⋮ menu: tap outside or press Escape.
  useEffect(() => {
    if (!fabMenuOpen) return undefined;
    function onOutside(e) {
      if (fabRef.current && !fabRef.current.contains(e.target)) setFabMenuOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setFabMenuOpen(false);
    }
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [fabMenuOpen]);

  // Applies a new folder list and waits until it is written to storage. Used
  // before deleting stored files, in that order, so a launch cut short in
  // between can never be left listing files that no longer exist.
  async function commitFolders(next) {
    foldersRef.current = next;
    setFolders(next);
    await dbSet("legacyFolders", folderListRecords(next));
  }

  // Saves the lightweight folder list only — each folder's manifest (its
  // shape), not file bytes. Never call this expecting it to write any file
  // content; that only happens in writeLegacyFiles.
  function saveFolderList(next) {
    dbSet("legacyFolders", folderListRecords(next));
  }

  // De-dupes by filename (same key filePositions uses) and caps at 10, most
  // recent first. Handles can't be cloned into IndexedDB directly, so each
  // file's {folderId, relativePath} OPFS address is saved instead and turned
  // back into a working handle on load (see reviveLegacyFileHandle). A
  // dropped file with no folderId (drag straight from the OS, never added as
  // a folder) has no OPFS copy to look up later, so it's left out.
  function persistRecent(list) {
    dbSet(
      "recentFiles",
      list
        .map((e) => {
          if (!e.fileHandle.folderId) return null;
          return { name: e.name, openedAt: e.openedAt, folderId: e.fileHandle.folderId, relativePath: e.fileHandle.relativePath };
        })
        .filter(Boolean)
    );
  }

  function addToRecent(fileHandle) {
    setRecentFiles((prev) => {
      const next = nextRecentFiles(prev, fileHandle);
      persistRecent(next);
      return next;
    });
  }

  function clearRecent() {
    setRecentFiles([]);
    dbSet("recentFiles", []);
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
    updateBookmarks(extrasKey(selectedHandle), (existing) => toggleBookmarkList(existing, currentPage));
  }

  function removeBookmark(page) {
    if (!selectedHandle) return;
    updateBookmarks(extrasKey(selectedHandle), (existing) => removeBookmarkFromList(existing, page));
  }

  // Same read-modify-write shape as updateBookmarks, one entry per outline
  // node path instead of per page.
  function toggleOutlineNode(path) {
    if (!selectedHandle) return;
    setOutlineExpanded((prev) => {
      const name = extrasKey(selectedHandle);
      const nextPaths = toggleOutlinePath(prev[name] || [], path);
      const next = { ...prev };
      if (nextPaths.length) next[name] = nextPaths;
      else delete next[name];
      dbSet("outlineExpanded", next);
      return next;
    });
  }

  // Bakes current annotation edits into the file's app copy (see
  // annotations.js) and clears the "unsaved" flag.
  async function handleSaveAnnotations() {
    if (!selectedHandle || !pdf) return;
    try {
      await saveAnnotations(selectedHandle, pdf);
      setHasUnsavedAnnotations(false);
    } catch (err) {
      console.error(err);
      setError(`Couldn't save annotations on "${selectedHandle.name}": ${err.message}`);
    }
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
  // The count is pushed to the screen at most ~10 times a second: a state
  // update per file re-renders the whole app per file, which is what made
  // big folders crawl.
  function makeProgressTicker() {
    let done = 0;
    let lastPush = 0;
    return () => {
      done += 1;
      const now = performance.now();
      if (now - lastPush < 100) return;
      lastPush = now;
      const count = done;
      setCopyProgress((p) => (p ? { ...p, doneCount: count } : p));
    };
  }

  async function copyFolderFiles(folderId, tree, title, folderName) {
    const files = flattenTreeFiles(tree);
    const controller = new AbortController();
    copyControllerRef.current = controller;
    setCopyProgress({ title, folderName, files, doneCount: 0 });
    try {
      await writeLegacyFiles(folderId, tree, {
        signal: controller.signal,
        onFileDone: makeProgressTicker(),
      });
    } finally {
      setCopyProgress(null);
      copyControllerRef.current = null;
    }
  }

  // Asks a "pick one" question (see ChoiceModal). Resolves to the chosen
  // action's value, or undefined if cancelled.
  function askChoice(spec) {
    return new Promise((resolve) => setChoice({ ...spec, resolve }));
  }

  // Add folder was given a folder whose name is already in the app: offer to
  // update that one instead of making a second, same-named copy (they'd
  // share arrangement settings). Updating re-copies the whole folder, then
  // deletes the old copy — in that order, so a cancel or a failure leaves
  // the old one untouched. Its placement and order are kept, and anything
  // that had been removed from it comes back.
  async function updateExistingFolder(existing, tree, folderId) {
    const name = tree.name;
    const oldCount = flattenTreeFiles(existing.tree).length;
    const newFiles = flattenTreeFiles(tree);
    const go = await askChoice({
      title: "UPDATE FOLDER",
      subtitle: name,
      body: `"${name}" is already in the app. Update it with the folder you picked? Its ${oldCount} file${oldCount === 1 ? "" : "s"} are replaced by these ${newFiles.length}, and anything you removed from it comes back. If this is a different folder that just has the same name, cancel and rename it first.`,
      actions: [{ label: "Update", value: "update", primary: true }],
    });
    if (go !== "update") return;

    // A saved annotated copy is opened instead of the file with the same
    // name, so it would keep hiding the new version — ask what to do.
    const annotated = new Set(await listAnnotatedCopyNames());
    const affectedFiles = newFiles.filter((f) => annotated.has(fileKeyFor(name, f.relativePath)));
    const affected = affectedFiles.map((f) => f.relativePath);
    let discard = false;
    if (affected.length > 0) {
      const c = await askChoice({
        title: "SAVED ANNOTATIONS",
        subtitle: name,
        body: `${affected.length} file${affected.length === 1 ? " has" : "s have"} your saved annotations. The annotated version keeps opening instead of the updated file unless you discard it.`,
        items: affected.length > 8 ? [...affected.slice(0, 8), `…and ${affected.length - 8} more`] : affected,
        actions: [
          { label: "Discard annotations", value: "discard", primary: true },
          { label: "Keep annotations", value: "keep" },
        ],
      });
      if (c === undefined) return;
      discard = c === "discard";
    }

    const sizeBytes = treeByteSize(tree);
    const estimate = await getStorageEstimate();
    const spaceNote = freeSpaceWarning(`"${name}"`, sizeBytes, estimate ? estimate.quota - foldersBytesUsed : null);
    if (spaceNote) setError(spaceNote);
    try {
      await copyFolderFiles(folderId, tree, "Updating folder", name);
    } catch (err) {
      await deleteLegacyFolderFiles(folderId);
      if (err.name !== "AbortError") setError(`Couldn't update "${name}": ${err.message}`);
      return;
    }

    const oldFolderId = existing.folderId;
    const oldHandles = flattenTreeFileHandles(existing.tree).map((l) => l.handle);
    await commitFolders(
      foldersRef.current.map((f) =>
        f.key === existing.key
          ? { ...f, dirHandle: tree.handle, tree, connectedAt: Date.now(), folderId, sizeBytes }
          : f
      )
    );
    await deleteLegacyFolderFiles(oldFolderId);
    if (discard) for (const f of affectedFiles) await deleteAnnotatedCopy(fileKeyFor(name, f.relativePath));
    // The open document and Recent entries pointed at the old copy.
    handleFilesRemovedFromView(oldHandles);
    setRecentFiles((prev) => {
      const next = prev.filter((e) => e.fileHandle.folderId !== oldFolderId);
      persistRecent(next);
      return next;
    });
    refreshStorageEstimate();
  }

  // Resolves to a node key (show the new folder inside that one), null
  // (top level), or undefined (cancelled). Doesn't ask at all when there's
  // nothing yet to put it inside.
  function askPlacement(folderName) {
    if (displayFolders.length === 0) return Promise.resolve(null);
    return new Promise((resolve) => setPlacement({ folderName, resolve }));
  }

  async function handleAddFolder() {
    let fileList;
    try {
      fileList = await pickFolderLegacy();
    } catch {
      return; // cancelled
    }
    const folderId = crypto.randomUUID();
    const tree = buildTreeFromFileList(fileList, folderId);
    if (!tree) {
      setError("No PDF files found in that folder.");
      return;
    }
    const alreadyThere = folders.find((f) => f.tree?.name === tree.name);
    if (alreadyThere) {
      await updateExistingFolder(alreadyThere, tree, folderId);
      return;
    }
    const dirHandle = tree.handle;
    const parentKey = await askPlacement(dirHandle.name);
    if (parentKey === undefined) return;
    const sizeBytes = treeByteSize(tree);

    const estimate = await getStorageEstimate();
    const spaceNote = freeSpaceWarning(
      `"${dirHandle.name}"`,
      sizeBytes,
      estimate ? estimate.quota - foldersBytesUsed : null
    );
    if (spaceNote) setError(spaceNote);
    try {
      await copyFolderFiles(folderId, tree, "Adding folder", dirHandle.name);
    } catch (err) {
      await deleteLegacyFolderFiles(folderId);
      if (err.name !== "AbortError") setError(`Couldn't save "${dirHandle.name}": ${err.message}`);
      return;
    }
    const connectedAt = Date.now();
    const key = crypto.randomUUID();
    // Also clears any stale placement left by an earlier, same-named folder.
    placeRoot(makeNodeKey(dirHandle.name, ""), parentKey);
    setFolders((prev) => {
      const next = [...prev, { key, dirHandle, tree, connectedAt, folderId, sizeBytes }];
      saveFolderList(next);
      return next;
    });
    refreshStorageEstimate();
  }

  // "Add files" (floating + menu): the native file picker has to open straight
  // from the click, so it comes first; the dialog then asks which folder and
  // subfolder to put the files in and what to do about name clashes (see
  // AddFilesModal).
  async function handleAddFiles() {
    let picked;
    try {
      picked = await pickPdfFiles();
    } catch {
      return; // cancelled
    }
    const files = picked.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (files.length === 0) {
      setError("No PDF files were selected.");
      return;
    }
    setAddFiles({ files });
  }

  // Each picked file is written into the folder's own OPFS copy. Only the
  // picked files are touched — the folder's other files are never re-read or
  // re-copied — and the tree is patched in memory.
  async function handleAddFilesConfirm(folderKey, destPath, choices) {
    const target = folders.find((f) => f.key === folderKey);
    if (!target?.tree) {
      setAddFiles(null);
      return;
    }
    setAddFilesBusy(true);
    try {
      const existing = filesInDirectory(target.tree, destPath);
      const plan = planAddedFiles(addFiles.files, existing.map((f) => f.name), choices);

      // A saved annotated copy is opened instead of the file with the same
      // name, so replacing a file that has one would keep showing the old
      // version — ask what to do with it first (the dialog stays open if
      // this is cancelled).
      const annotated = new Set(await listAnnotatedCopyNames());
      const pathOf = (name) => (destPath ? `${destPath}/${name}` : name);
      const affected = [
        ...new Set(
          plan
            .filter((p) => p.replaces && annotated.has(fileKeyFor(target.tree.name, pathOf(p.name))))
            .map((p) => pathOf(p.name))
        ),
      ];
      let discardNames = [];
      if (affected.length > 0) {
        const c = await askChoice({
          title: "SAVED ANNOTATIONS",
          subtitle: target.tree.name,
          body: `${affected.length} file${affected.length === 1 ? " you're replacing has" : "s you're replacing have"} your saved annotations. The annotated version keeps opening instead of the new file unless you discard it.`,
          items: affected.length > 8 ? [...affected.slice(0, 8), `…and ${affected.length - 8} more`] : affected,
          actions: [
            { label: "Discard annotations", value: "discard", primary: true },
            { label: "Keep annotations", value: "keep" },
          ],
        });
        if (c === undefined) return;
        if (c === "discard") discardNames = affected;
      }
      const added = [];
      const replacedHandles = [];
      let bytesDelta = 0;

      // Same progress list as adding a folder (CopyProgressModal), one row
      // per file. The row id is index-prefixed so two picked files that end
      // up with the same name still get separate rows.
      const progressFiles = plan.map((p, i) => ({ name: p.name, relativePath: `${i}/${p.name}` }));
      const controller = new AbortController();
      copyControllerRef.current = controller;
      setAddFiles(null);
      setCopyProgress({ title: "Adding files", folderName: target.tree.name, files: progressFiles, doneCount: 0 });
      const tick = makeProgressTicker();
      try {
        const startedAt = Date.now();
        for (const { file, name, replaces } of plan) {
          if (controller.signal.aborted) break; // Cancel: keep what's already copied
          try {
            const relativePath = destPath ? `${destPath}/${name}` : name;
            const old = replaces ? existing.find((f) => f.name === name) : null;
            const oldSize = old ? ((await old.handle.getFile().catch(() => null))?.size ?? 0) : 0;

            const storedAs = old?.storedAs ?? newStoredName();
            await writeLegacyFile(target.folderId, storedAs, file);
            added.push({
              name,
              kind: "file",
              relativePath,
              storedAs,
              handle: reviveLegacyFileHandle(target.folderId, name, relativePath, target.tree.name, storedAs),
            });
            bytesDelta += file.size - oldSize;
            if (old) replacedHandles.push(old.handle);
            tick();
          } catch (err) {
            setError(`Couldn't add "${name}": ${err.message}`);
            break;
          }
        }
        setCopyProgress((p) => (p ? { ...p, doneCount: added.length } : p));
        // A one-or-two-file add can finish faster than the list is legible;
        // hold it just long enough to see the checkmarks land (skipped when
        // animations are off).
        const hold = animDurationMs() ? 500 - (Date.now() - startedAt) : 0;
        if (hold > 0 && !controller.signal.aborted) await new Promise((r) => setTimeout(r, hold));
      } finally {
        setCopyProgress(null);
        copyControllerRef.current = null;
      }

      for (const path of discardNames) {
        if (added.some((n) => n.relativePath === path)) {
          await deleteAnnotatedCopy(fileKeyFor(target.tree.name, path));
        }
      }
      if (added.length > 0) {
        setFolders((prev) => {
          const next = prev.map((f) =>
            f.key === target.key
              ? {
                  ...f,
                  tree: insertFilesIntoTree(f.tree, destPath, added),
                  sizeBytes: (f.sizeBytes || 0) + bytesDelta,
                }
              : f
          );
          saveFolderList(next);
          return next;
        });
        refreshStorageEstimate();
        // A replaced file that's open now shows stale bytes — close it, same
        // as when its folder is removed.
        handleFilesRemovedFromView(replacedHandles);
      }
    } finally {
      setAddFilesBusy(false);
    }
  }

  // Closes the open document if it (or a subfolder containing it) belongs
  // to the folder being removed — otherwise it'd stay open, orphaned, with
  // no folder backing it. Looked up from the pre-removal `folders` closure
  // since the file has to still be in the tree being removed to match.
  async function handleRemoveFolder(key) {
    const removedFolder = foldersRef.current.find((f) => f.key === key);
    if (removedFolder) {
      const name = removedFolder.tree?.name ?? removedFolder.dirHandle.name;
      placeRoot(makeNodeKey(name, ""), null);
      releaseNested(name);
    }
    await commitFolders(foldersRef.current.filter((f) => f.key !== key));
    if (removedFolder?.folderId) await deleteLegacyFolderFiles(removedFolder.folderId);
    refreshStorageEstimate();
    if (
      removedFolder?.tree &&
      selectedHandle &&
      flattenTreeFileHandles(removedFolder.tree).some((f) => f.handle === selectedHandle)
    ) {
      clearDocument();
    }
  }

  // Mirrors handleRemoveFolder's close-if-open check above, for the
  // individual-file/folder "remove from view" action instead of removing an
  // entire connected folder.
  function handleFilesRemovedFromView(handles) {
    if (selectedHandle && handles.includes(selectedHandle)) {
      clearDocument();
    }
  }

  // Removing a file also drops what the app keeps for it: bookmarks, saved
  // page, outline state and its annotated app copy. They're filed per file
  // (folder + path), so they belong to nothing else.
  async function forgetFileExtras(keys) {
    if (keys.length === 0) return;
    for (const k of keys) await deleteAnnotatedCopy(k);
    setBookmarks((prev) => {
      const next = omitKeys(prev, keys);
      dbSet("bookmarks", next);
      return next;
    });
    setOutlineExpanded((prev) => {
      const next = omitKeys(prev, keys);
      dbSet("outlineExpanded", next);
      return next;
    });
    const positions = (await dbGet("filePositions")) || {};
    await dbSet("filePositions", omitKeys(positions, keys));
  }

  // TreeView's × on a subfolder, file or whole folder: ask first. A node's
  // key always points back at the folder it physically lives in (see
  // parseNodeKey), so this finds the right connected folder and path even if
  // the overlay has moved the node somewhere else in the displayed tree.
  function requestRemoveNode(node) {
    buildRemoveRequest(node).catch((err) => setError(`Couldn't prepare the removal: ${err.message}`));
  }

  async function buildRemoveRequest(node) {
    const roots = folders.filter((f) => f.tree);
    let folder;
    let relPath = "";
    let isRoot = false;
    // A connected folder's own root (top level or placed inside another)
    // removes the whole folder.
    if (node.folderRef) {
      folder = roots.find((f) => f.key === node.folderRef.key);
      isRoot = true;
    } else {
      const parsed = parseNodeKey(node.key, roots.map((f) => f.tree.name));
      folder = parsed && roots.find((f) => f.tree.name === parsed.rootName);
      relPath = parsed?.relPath ?? "";
    }
    if (!folder) return;
    const rawNode = findNodeAt(folder.tree, relPath);
    if (!rawNode) return;

    const files = rawNode.kind === "file" ? [rawNode] : flattenTreeFiles(rawNode);
    const cleanNames = files.map((f) => fileKeyFor(folder.tree.name, f.relativePath));
    const annotated = new Set(await listAnnotatedCopyNames());
    const positions = (await dbGet("filePositions")) || {};
    const annotatedCount = cleanNames.filter((n) => annotated.has(n)).length;
    const otherCount = cleanNames.filter(
      (n) => !annotated.has(n) && (bookmarks[n] || positions[n] || outlineExpanded[n])
    ).length;
    setRemoveRequest({
      node,
      name: node.name,
      kind: isRoot ? "directory" : node.kind,
      isRoot,
      folderKey: folder.key,
      relPath,
      count: files.length,
      cleanNames,
      annotatedCount,
      otherCount,
    });
  }

  // Takes the given paths (files or whole subfolders) out of one connected
  // folder for good: deletes the app's stored copies and frees the space.
  // The user's original files outside the app are never involved. Shared by
  // the tree's × and the one-time clean-up of the old hidden list.
  async function removePathsFromFolder(target, relPaths) {
    const nodes = relPaths.map((p) => findNodeAt(target.tree, p)).filter(Boolean);
    const leaves = nodes.flatMap((n) => flattenTreeFileHandles(n));
    const removedFiles = nodes.flatMap((n) => flattenTreeFiles(n));
    const paths = removedFiles.map((f) => f.relativePath);
    let freedBytes = 0;
    for (const leaf of leaves) freedBytes += (await leaf.handle.getFile().catch(() => null))?.size ?? 0;
    await commitFolders(
      foldersRef.current.map((f) =>
        f.key === target.key
          ? {
              ...f,
              tree: relPaths.reduce((tree, p) => removeNodeFromTree(tree, p), f.tree),
              sizeBytes: Math.max(0, (f.sizeBytes || 0) - freedBytes),
            }
          : f
      )
    );
    await deleteLegacyFiles(
      target.folderId,
      removedFiles.map((f) => f.storedAs)
    );
    refreshStorageEstimate();

    // The open document, and Recent entries, may point at what was just
    // removed — drop both rather than leave dead handles.
    handleFilesRemovedFromView(leaves.map((l) => l.handle));
    const gone = new Set(paths);
    setRecentFiles((prev) => {
      const next = prev.filter(
        (e) => !(e.fileHandle.folderId === target.folderId && gone.has(e.fileHandle.relativePath))
      );
      persistRecent(next);
      return next;
    });
  }

  async function confirmRemoveNode() {
    const req = removeRequest;
    if (!req) return;
    setRemoveBusy(true);
    try {
      if (req.isRoot) {
        await handleRemoveFolder(req.folderKey);
      } else {
        const target = folders.find((f) => f.key === req.folderKey);
        if (target?.tree) await removePathsFromFolder(target, [req.relPath]);
      }
      await forgetFileExtras(req.cleanNames ?? []);
      setRemoveRequest(null);
    } catch (err) {
      setError(`Couldn't remove "${req.name}": ${err.message}`);
      setRemoveRequest(null);
    } finally {
      setRemoveBusy(false);
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

  // Drag-and-drop: a dropped PDF opens for reading. A dropped folder can't
  // be added this way — folders are copied in through + → Add folder — so
  // say so instead of silently ignoring it.
  function handleDrop(e) {
    e.preventDefault();
    let sawFolder = false;
    for (const item of [...e.dataTransfer.items].filter((i) => i.kind === "file")) {
      if (item.webkitGetAsEntry?.()?.isDirectory) {
        sawFolder = true;
        continue;
      }
      const file = item.getAsFile();
      if (file?.name.toLowerCase().endsWith(".pdf")) selectFile(wrapDroppedFile(file));
    }
    if (sawFolder) setError("To add a folder, use + → Add folder.");
  }

  // Any edit to the global search field, while a document is open, closes
  // it — clearing the field this way lands on the blank state rather than
  // restoring whatever was open before search started, matching the rest
  // of the main pane always reflecting the field's current value.
  function handleGlobalSearchChange(value) {
    if (pdf && !closeDocument()) return;
    setGlobalSearch(value);
  }

  // "Back to results" button, shown while viewing a doc opened from a
  // search hit — closes the doc without touching the query, so the results
  // list (recomputed from the still-populated field) reappears.
  function backToResults() {
    closeDocument();
  }

  const currentBookmarks = selectedHandle ? bookmarks[extrasKey(selectedHandle)] || [] : [];
  const isBookmarked = currentBookmarks.some((b) => b.page === currentPage);
  const currentOutlineExpanded = new Set(selectedHandle ? outlineExpanded[extrasKey(selectedHandle)] || [] : []);
  const tabAvailable = {
    folders: true,
    recent: recentFiles.length > 0,
    bookmarks: currentBookmarks.length > 0,
    outline: !!outline,
    pages: !!pdf && numPages > 0,
  };
  const showTabs = tabAvailable.recent || tabAvailable.bookmarks || tabAvailable.outline || tabAvailable.pages;
  const activeTab = showTabs && tabAvailable[sidebarTab] ? sidebarTab : "folders";
  const sidebarAnim = useTransitionAnim(activeTab, SIDEBAR_TAB_ORDER, settings.animStyle);
  if (addFiles) lastAddFilesRef.current = addFiles;
  const addFilesPresence = usePresence(!!addFiles);
  const addFilesShown = addFiles ?? lastAddFilesRef.current;
  // tree is the displayed (move/reorder-applied) one the picker draws;
  // rawTree is the folder's own shape, which is where files actually land.
  const addFilesTargets = allDisplayFolders.map((f) => ({
    key: f.key,
    name: f.tree.name,
    tree: f.tree,
    nested: f.nested,
    rawTree: folders.find((r) => r.key === f.key).tree,
  }));
  const fabMenu = usePresence(fabMenuOpen);
  if (removeRequest) lastRemoveRef.current = removeRequest;
  const removePresence = usePresence(!!removeRequest);
  if (placement) lastPlacementRef.current = placement;
  const placementPresence = usePresence(!!placement);
  const placementShown = placement ?? lastPlacementRef.current;
  const removeShown = removeRequest ?? lastRemoveRef.current;
  if (choice) lastChoiceRef.current = choice;
  const choicePresence = usePresence(!!choice);
  const choiceShown = choice ?? lastChoiceRef.current;
  const foldersBytesUsed = folders.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);

  return (
    <div ref={appRef} className={`app${IS_MOBILE ? " is-phone" : ""}`} onDragOver={handleDragOver} onDrop={handleDrop}>
      {showSplash && <SplashScreen onFinish={onSplashFinish} />}
      <UpdatePrompt ready={!showSplash} update={update} />
      {settingsOpen && (
        <Suspense fallback={null}>
          <Settings
            settings={settings}
            onChange={updateSettings}
            onClose={closeSettings}
            closing={settingsClosing}
            update={update}
            isMobile={IS_MOBILE}
          />
        </Suspense>
      )}
      {copyProgress && (
        <CopyProgressModal
          title={copyProgress.title}
          folderName={copyProgress.folderName}
          files={copyProgress.files}
          doneCount={copyProgress.doneCount}
          onCancel={() => copyControllerRef.current?.abort()}
        />
      )}
      {addFilesPresence.present && addFilesShown && addFilesTargets.length > 0 && (
        <AddFilesModal
          closing={addFilesPresence.closing}
          folders={addFilesTargets}
          files={addFilesShown.files}
          busy={addFilesBusy}
          freeBytes={storageEstimate ? storageEstimate.quota - foldersBytesUsed : null}
          onConfirm={(...args) =>
            handleAddFilesConfirm(...args).catch((err) => setError(`Couldn't add the files: ${err.message}`))
          }
          onClose={() => setAddFiles(null)}
        />
      )}
      {placementPresence.present && placementShown && (
        <PlaceFolderModal
          closing={placementPresence.closing}
          folderName={placementShown.folderName}
          folders={displayFolders}
          onConfirm={(parentKey) => {
            placement?.resolve(parentKey);
            setPlacement(null);
          }}
          onClose={() => {
            placement?.resolve(undefined);
            setPlacement(null);
          }}
        />
      )}
      {choicePresence.present && choiceShown && (
        <ChoiceModal
          closing={choicePresence.closing}
          spec={choiceShown}
          onChoose={(value) => {
            choice?.resolve(value);
            setChoice(null);
          }}
          onClose={() => {
            choice?.resolve(undefined);
            setChoice(null);
          }}
        />
      )}
      {removePresence.present && removeShown && (
        <ConfirmRemoveModal
          closing={removePresence.closing}
          request={removeShown}
          busy={removeBusy}
          onConfirm={confirmRemoveNode}
          onClose={() => setRemoveRequest(null)}
        />
      )}
      <div className={`topbar-wrap${sidebarOpen ? "" : " collapsed"}`}>
      <div ref={topbarRef} className="topbar">
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
          onClick={openSettings}
          aria-label={update.needRefresh ? "Settings · update available" : "Settings"}
        >
          {/* Gear's teeth-and-ring shape is optically lighter than the
              sidebar icon's solid rectangle at the same nominal size. */}
          <IconSettings size={32} />
          {update.needRefresh && <span className="update-dot" />}
        </button>
      </div>
      </div>
      <div className="app-row">
        <div className={`sidebar-backdrop${sidebarOpen ? " open" : ""}`} onClick={() => setSidebarOpen(false)} />
        <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
          {folders.length > 0 && (
            <div className="global-search">
              <IconSearch size={14} className="global-search-icon" />
              <input
                type="text"
                className="global-search-input"
                placeholder="Search filenames…"
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
            <div className={`sidebar-tab-panel ${sidebarAnim.className}`} style={sidebarAnim.style}>
              <RecentView
                recentFiles={recentFiles}
                onSelectFile={selectFile}
                selectedHandle={selectedHandle}
                onClearAll={clearRecent}
              />
            </div>
          )}
          {activeTab === "bookmarks" && (
            <div className={`sidebar-tab-panel ${sidebarAnim.className}`} style={sidebarAnim.style}>
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
            <div className={`sidebar-tab-panel ${sidebarAnim.className}`} style={sidebarAnim.style}>
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
            <div className={`sidebar-tab-panel ${sidebarAnim.className}`} style={sidebarAnim.style}>
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
          <div className={`folders-panel ${sidebarAnim.className}`} style={sidebarAnim.style} hidden={activeTab !== "folders"}>
            {folders.length === 0 && <p className="folders-empty-hint">No folders yet — tap + to add one.</p>}
            {storageEstimate && (
              <div className="storage-usage">
                {formatBytes(foldersBytesUsed)} used of {formatBytes(storageEstimate.quota)}
              </div>
            )}
            <TreeView
              displayFolders={displayFolders}
              onSelectFile={selectFile}
              selectedHandle={selectedHandle}
              onRemoveNode={requestRemoveNode}
              onDropNode={dropNode}
            />
            {/* Anchored to .folders-panel, not .tree-rows — stays put in the
                corner as the tree scrolls underneath it. */}
            <div className="add-fab" ref={fabRef}>
              {fabMenu.present && (
                <div className={`add-fab-menu${fabMenu.closing ? " is-closing" : ""}`}>
                  <button
                    className="tree-kebab-item"
                    style={{ "--i": 0 }}
                    onClick={() => {
                      setFabMenuOpen(false);
                      handleAddFolder().catch((err) => setError(`Couldn't add the folder: ${err.message}`));
                    }}
                  >
                    <IconFolderPlus size={16} /> Add folder
                  </button>
                  <button
                    className="tree-kebab-item"
                    style={{ "--i": 1 }}
                    disabled={addFilesTargets.length === 0}
                    title={addFilesTargets.length === 0 ? "Add a folder first" : undefined}
                    onClick={() => {
                      setFabMenuOpen(false);
                      handleAddFiles().catch((err) => setError(`Couldn't add the files: ${err.message}`));
                    }}
                  >
                    <IconFilePlus size={16} /> Add files
                  </button>
                </div>
              )}
              <button
                className="add-folder-fab"
                onClick={() => setFabMenuOpen((v) => !v)}
                aria-label="Add folder or files"
                aria-haspopup="menu"
                aria-expanded={fabMenuOpen}
                title="Add folder or files"
              >
                <IconPlus size={20} />
              </button>
            </div>
          </div>
        </aside>
        <main className="main">
          <Toolbar
            viewMode={viewMode}
            setViewMode={setViewMode}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            scale={scale}
            numPages={numPages}
            pdfViewer={viewerApi?.pdfViewer}
            eventBus={viewerApi?.eventBus}
            readingTheme={settings.readingTheme}
            onChangeReadingTheme={(readingTheme) => updateSettings({ readingTheme })}
            readingBrightness={settings.readingBrightness}
            onChangeReadingBrightness={(readingBrightness) => updateSettings({ readingBrightness })}
            readingContrast={settings.readingContrast}
            onChangeReadingContrast={(readingContrast) => updateSettings({ readingContrast })}
            isBookmarked={isBookmarked}
            onToggleBookmark={toggleBookmark}
            annotationTool={annotationTool}
            onSetAnnotationTool={setAnnotationTool}
            hasUnsavedAnnotations={hasUnsavedAnnotations}
            onSaveAnnotations={handleSaveAnnotations}
            onOpenSettings={openSettings}
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
          <PdfViewer
            viewMode={viewMode}
            onReady={setViewerApi}
            readingTheme={settings.readingTheme}
            readingBrightness={settings.readingBrightness}
            readingContrast={settings.readingContrast}
            annotationTool={annotationTool}
          />
          {loading ? (
            <div className="viewer-empty">
              <span className="viewer-loading">
                <span className="spinner" />
                Loading {selectedHandle?.name}…
              </span>
            </div>
          ) : globalSearch.trim() && !pdf ? (
            <SearchResults query={globalSearch} folders={displayFolders} onOpenResult={selectFile} />
          ) : !pdf ? (
            <div className="viewer-empty">
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
            </div>
          ) : null}
          {pdf && !loading && (
            <div className="page-pill">
              <button
                aria-label="Previous page"
                disabled={currentPage <= 1}
                onClick={() => viewerApi?.pdfViewer?.previousPage()}
              >
                <IconChevronLeft size={16} />
              </button>
              <span className="page-pill-count">
                <input
                  type="number"
                  min={1}
                  max={numPages}
                  value={currentPage}
                  aria-label="Current page"
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (viewerApi?.pdfViewer && n >= 1 && n <= numPages) {
                      viewerApi.pdfViewer.currentPageNumber = n;
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") e.target.blur();
                  }}
                />
                <span className="page-pill-total">/ {numPages || "-"}</span>
              </span>
              <button
                aria-label="Next page"
                disabled={!numPages || currentPage >= numPages}
                onClick={() => viewerApi?.pdfViewer?.nextPage()}
              >
                <IconChevronRight size={16} />
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
