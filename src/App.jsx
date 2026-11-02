import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  pickFolderLegacy,
  buildTreeFromFileList,
  wrapDroppedFile,
  writeLegacyFiles,
  reviveLegacyManifest,
  fillMissingSizes,
  uniqueFileName,
  planCopy,
  planCopyRoot,
  planBytes,
  planFiles,
  writePlan,
  finishPlan,
  reviveLegacyFileHandle,
  treeByteSize,
  flattenTreeFiles,
  flattenTreeFileHandles,
  flattenTreeFileHandlesWithPath,
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
  readLegacyFile,
  listAnnotatedCopyNames,
  deleteAnnotatedCopy,
  readAnnotatedCopy,
  writeAnnotatedCopy,
} from "./opfs.js";
import { requestPersistentStorage, getStorageEstimate } from "./storage.js";
import { saveAnnotations } from "./annotations.js";
import { usePdfDocument } from "./usePdfDocument.js";
import { useTreeOverlay } from "./useTreeOverlay.js";
import { useWakeLock } from "./useWakeLock.js";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts.js";
import { usePresentation } from "./usePresentation.js";
import { useTransitionAnim, ANIM_SPEED_MS, animDurationMs } from "./useTransitionAnim.js";
import { usePresence } from "./usePresence.js";
import { flattenByKey, isInside, makeNodeKey, parseNodeKey, planMove } from "./treeOverlay.js";
import { dbGet, dbSet } from "./db.js";
import {
  formatBytes,
  freeSpaceWarning,
  omitKeys,
  applyStar,
  starredEntries,
  folderListRecords,
  nextRecentFiles,
  toggleBookmarkList,
  removeBookmarkFromList,
  toggleOutlinePath,
  pageSizeLabel,
  docInfoRows,
  tabsToRecords,
} from "./appHelpers.js";
import { AnnotationEditorType } from "pdfjs-dist";
import {
  IconX,
  IconFolder,
  IconChecklist,
  IconPlus,
  IconFolderPlus,
  IconFilePlus,
  IconWifi,
  IconClock,
  IconBookmark,
  IconListTree,
  IconLayoutGrid,
  IconLayoutSidebar,
  IconSearch,
  IconArrowLeft,
  IconDotsVertical,
} from "@tabler/icons-react";
import TreeView from "./TreeView.jsx";
import SearchResults from "./SearchResults.jsx";
import OutlineView from "./OutlineView.jsx";
import BookmarksView from "./BookmarksView.jsx";
import RecentView from "./RecentView.jsx";
import ThumbnailView from "./ThumbnailView.jsx";
import Pane from "./Pane.jsx";
import Toolbar from "./Toolbar.jsx";
import TabBar from "./TabBar.jsx";
import CopyProgressModal from "./CopyProgressModal.jsx";
import AddFilesModal from "./AddFilesModal.jsx";
import WifiModal from "./WifiModal.jsx";
import { withPath } from "./transfer.js";
import ConfirmRemoveModal from "./ConfirmRemoveModal.jsx";
import RenameModal from "./RenameModal.jsx";
import SortMenu from "./SortMenu.jsx";
import MovePicker from "./MovePicker.jsx";
import MoveClashModal from "./MoveClashModal.jsx";
import CopyExtrasModal from "./CopyExtrasModal.jsx";
import RotateSheet from "./RotateSheet.jsx";
import ToolModal from "./ToolModal.jsx";
import ProtectModal from "./ProtectModal.jsx";
import PasswordModal from "./PasswordModal.jsx";
import { setPasswordAsker } from "./edoc.js";
import { flattenAnnotations, protectPdf, rotatePages } from "./pdfTools.js";
import PlaceFolderModal from "./PlaceFolderModal.jsx";
import ChoiceModal from "./ChoiceModal.jsx";
import DocumentInfoModal from "./DocumentInfoModal.jsx";
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
  // Two documents loaded at once is the memory risk on an iPad (see usePane.js),
  // so touch devices opt in; mouse-and-keyboard devices start with it on.
  splitView: !window.matchMedia("(pointer: coarse)").matches,
  paneColours: true, // amber / pink on the two panes of a split and their tabs, instead of L / R letters
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
  const [viewerApiL, setViewerApiL] = useState(null); // each pane's pdf.js viewer, set once its PdfViewer mounts
  const [viewerApiR, setViewerApiR] = useState(null);
  // Phone starts with the drawer closed; iPad and desktop start with the
  // sidebar expanded, regardless of window width.
  const [sidebarOpen, setSidebarOpen] = useState(() => !IS_MOBILE);
  // Narrow phones only (CSS-gated): the toolbar becomes a right-side drawer.
  const [toolbarOpen, setToolbarOpen] = useState(false);
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
  const [stars, setStars] = useState({}); // { fileKey: colour id } — see STAR_COLORS
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
  const [removeRequest, setRemoveRequest] = useState(null); // { name, kind, count, annotatedCount, otherCount, items: [{ isRoot, folderKey, relPath, cleanNames, ... }] } while the Delete confirmation is open
  const [removeBusy, setRemoveBusy] = useState(false);
  const [manageMode, setManageMode] = useState(false); // tree rows show checkboxes and the Manage bar is up
  const [renameRequest, setRenameRequest] = useState(null); // { key, name } while the Rename dialog is open
  const lastRenameRef = useRef(null);
  const [moveRequest, setMoveRequest] = useState(null); // { nodes, done } while the Move picker is open; done() clears the ticks
  const [clashRequest, setClashRequest] = useState(null); // { clash, remaining, resolve } while the "name already there" prompt is open
  const lastClashRef = useRef(null);
  const [extrasRequest, setExtrasRequest] = useState(null); // { otherCount, annotatedCount, resolve } while the "copy with notes?" prompt is open
  const lastExtrasRef = useRef(null);
  const [rotateRequest, setRotateRequest] = useState(null); // { node, file, done } while the Rotate sheet is open
  const [flattenRequest, setFlattenRequest] = useState(null); // { node, file, done } while the Flatten dialog is open
  const [protectRequest, setProtectRequest] = useState(null); // { node, file, done } while the Protect dialog is open
  const [passwordRequest, setPasswordRequest] = useState(null); // { name, wrong, resolve } while a file is asking for its password
  const [toolBusy, setToolBusy] = useState(false); // a PDF tool dialog is saving its result
  // A file that needs a password asks for it in our own dialog (see edoc.js).
  useEffect(() => {
    setPasswordAsker(({ name, wrong }) => new Promise((resolve) => setPasswordRequest({ name, wrong, resolve })));
    return () => setPasswordAsker(null);
  }, []);
  const [placement, setPlacement] = useState(null); // { folderName, resolve } while the Add folder "where to show it" dialog is open
  const lastPlacementRef = useRef(null); // keeps that dialog's content on screen through its exit animation
  const [choice, setChoice] = useState(null); // { ...ChoiceModal spec, resolve } while a "pick one" question is open
  const lastChoiceRef = useRef(null);
  const [docInfo, setDocInfo] = useState(null); // [{ label, value }] while the Document properties dialog is open
  const lastDocInfoRef = useRef(null);
  const lastErrorRef = useRef(null);
  const lastRemoveRef = useRef(null); // keeps the confirmation's content on screen through its exit animation
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const [wifiOpen, setWifiOpen] = useState(false); // Send / receive via wifi dialog
  const [newKeys, setNewKeys] = useState(() => new Set()); // node keys that show the NEW chip; memory only, so a refresh clears them
  const fabRef = useRef(null);
  const [addFilesBusy, setAddFilesBusy] = useState(false);
  const lastAddFilesRef = useRef(null); // keeps the dialog's content on screen through its exit animation
  const copyControllerRef = useRef(null); // AbortController for the in-progress copy, so the modal's Cancel button can reach it
  // Persist-on-change effects below would otherwise fire once on mount
  // with default state, racing ahead of (and clobbering) the load below.
  const initializedRef = useRef(false);
  const tabsRestoredRef = useRef(false);

  const {
    tabs,
    split,
    activePane,
    setActivePane,
    panes,
    active,
    selectFile,
    closeDocument,
    closeTab,
    closeTabsFor,
    restoreTabs,
    openSplit,
    closePane,
  } = usePdfDocument({
    isNarrow,
    viewerApis: { L: viewerApiL, R: viewerApiR },
    closeSidebarIfAutoHide,
    addToRecent,
    setError,
    confirmLeave: confirmLeaveDocument,
  });
  // Everything below that reads "the open document" reads the active pane's.
  const {
    pdf,
    activeKey,
    selectedHandle,
    numPages,
    currentPage,
    scale,
    viewMode,
    setViewMode,
    loading,
    outline,
    hasUnsavedAnnotations,
    chosenViewMode,
  } = active;
  const viewerApi = activePane === "L" ? viewerApiL : viewerApiR;

  // Shared between the sidebar tree (renders/edits it) and search (needs the
  // same arranged view so results show where things are drawn) — see
  // useTreeOverlay.js.
  const { displayFolders, allDisplayFolders, placeRoot, releaseNested, renameNode, moveNodes, sort, setSort } = useTreeOverlay(
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
      // Files saved before sizes were kept get theirs filled in once, in the
      // background, so Size sorting works on them too.
      Promise.all(loaded.map((f) => fillMissingSizes(f.tree))).then((counts) => {
        if (cancelled || !counts.some(Boolean)) return;
        setFolders((prev) => {
          const next = [...prev];
          saveFolderList(next);
          return next;
        });
      });
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
      setStars((await dbGet("stars")) || {});

      if (resolvedSettings.resumePosition) {
        // Tabs are saved as OPFS addresses (see tabsToRecords) — "still
        // connected" just means the file's folder hasn't been removed. A
        // session from before tabs left only its last file (lastFileHandle).
        const saved =
          (await dbGet("openTabs")) ??
          (await dbGet("lastFileHandle").then((last) => last && { tabs: [last], active: null }));
        const nodes = (saved?.tabs ?? []).map((r) => fileNodeOf(r.folderId, r.relativePath)).filter(Boolean);
        if (nodes.length > 0) {
          restoreTabs(nodes.map((n) => n.handle));
          const open = nodes.find((n) => extrasKey(n.handle) === saved.active) ?? nodes[nodes.length - 1];
          selectFile(open.handle);
        }
      }
      // From here on tab changes are saved — not before, or the empty tab bar
      // of a fresh launch would overwrite what the last session left.
      tabsRestoredRef.current = true;
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
    if (!tabsRestoredRef.current) return;
    dbSet("openTabs", { tabs: tabsToRecords(tabs), active: activeKey });
  }, [tabs, activeKey]);

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
    const main = app.querySelector(".main");
    if (!sidebar || !topbar || !row || !main) return undefined;

    const opts = { duration: ms, easing: "cubic-bezier(.4, 0, .2, 1)" };
    const undo = [];
    // The reading panel keeps its final layout and slides from where it used
    // to sit (transform only, so pdf.js doesn't re-layout mid-animation). The
    // row clips meanwhile so the offset panel can't spawn page scrollbars.
    const slideMain = (dx, dy) => {
      const a = main.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], opts);
      row.style.overflow = "clip";
      // cancel/finish events fire async: a newer slide may already own the clip.
      const unclip = () => { if (!main.getAnimations().length) row.style.overflow = ""; };
      a.onfinish = unclip;
      a.oncancel = unclip;
      undo.push(() => a.cancel());
    };
    if (sidebarOpen) {
      slideMain(-sidebar.offsetWidth, -topbarHeightRef.current);
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
      slideMain(sc.offsetWidth, h);
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

  async function showDocInfo() {
    if (!pdf) return;
    try {
      const [{ info }, firstPage, { length }] = await Promise.all([
        pdf.getMetadata(),
        pdf.getPage(1),
        pdf.getDownloadInfo(),
      ]);
      const [x0, y0, x1, y1] = firstPage.view;
      setDocInfo(
        docInfoRows({
          name: selectedHandle?.name,
          info,
          numPages: pdf.numPages,
          pageSize: pageSizeLabel(Math.abs(x1 - x0), Math.abs(y1 - y0)),
          bytes: length,
        })
      );
    } catch (err) {
      setError(`Couldn't read the document's properties: ${err.message}`);
    }
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
    const cleanups = [];
    for (const [id, api] of [
      ["L", viewerApiL],
      ["R", viewerApiR],
    ]) {
      if (!api || !panes[id].pdf) continue;
      // Only the active pane takes the tool; the other one's editors sleep.
      const mode =
        id === activePane
          ? (ANNOTATION_EDITOR_MODE_BY_TOOL[annotationTool] ?? AnnotationEditorType.NONE)
          : AnnotationEditorType.NONE;
      const applyMode = () => {
        try {
          api.pdfViewer.annotationEditorMode = { mode };
        } catch {
          // Not ready yet — the event listener below re-applies once it is.
        }
      };
      applyMode();
      api.eventBus.on("annotationeditoruimanager", applyMode);
      cleanups.push(() => api.eventBus.off("annotationeditoruimanager", applyMode));
    }
    return () => cleanups.forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerApiL, viewerApiR, panes.L.pdf, panes.R.pdf, annotationTool, activePane]);

  const {
    presenting,
    isFullscreen,
    fullscreenSupported,
    startPresentation,
    stopPresentation,
    toggleFullscreen,
  } = usePresentation({ pdfViewer: viewerApi?.pdfViewer, viewMode: chosenViewMode, setViewMode, setAnnotationTool });
  useKeyboardShortcuts(viewerApi, { presenting, onExitPresentation: stopPresentation });

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

  // Bakes a document's annotation edits into the file's app copy (see
  // annotations.js) and clears its "unsaved" flag. `doc` is { handle, pdf,
  // markSaved } — the pane's own, since the document being saved isn't always
  // the active pane's. Resolves to whether it saved.
  async function saveAnnotationsOf({ handle, pdf: doc, markSaved }) {
    if (!handle || !doc) return false;
    try {
      await saveAnnotations(handle, doc);
      markSaved();
      return true;
    } catch (err) {
      console.error(err);
      setError(`Couldn't save annotations on "${handle.name}": ${err.message}`);
      return false;
    }
  }

  function handleSaveAnnotations() {
    return saveAnnotationsOf(active.leave);
  }

  // Asked before a document is switched away from or closed while it has
  // unsaved annotations. Resolves true once it's fine to go on: they were
  // saved, or the user chose to discard them.
  async function confirmLeaveDocument(doc) {
    const choice = await askChoice({
      title: "UNSAVED ANNOTATIONS",
      subtitle: doc.handle?.name,
      body: "This file has annotations that aren't saved yet. Save them before leaving, or discard them?",
      actions: [
        { label: "Save", value: "save", primary: true },
        { label: "Discard", value: "discard" },
      ],
    });
    if (choice === "save") return saveAnnotationsOf(doc);
    return choice === "discard";
  }

  // Split view is offered on wide screens when it's switched on in Settings,
  // with a document open to split from. Shrinking the window (an iPad turned
  // to portrait) or switching it off closes the second pane — its tab stays.
  const splitDisabledReason = !settings.splitView
    ? "Turned off in Settings → Reading"
    : isNarrow
      ? "Needs a wider screen"
      : !pdf
        ? "Open a document first"
        : null;
  const splitForbidden = !settings.splitView || isNarrow;
  useEffect(() => {
    if (split && splitForbidden) closePane(activePane === "L" ? "R" : "L");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [split, splitForbidden]);

  // Splits the screen, the new pane opening the most recently used other tab
  // (or empty if there is none), or closes the pane that isn't the active one.
  function toggleSplit() {
    if (split) {
      closePane(activePane === "L" ? "R" : "L");
      return;
    }
    const otherTab =
      recentFiles
        .map((e) => tabs.find((t) => t.key === extrasKey(e.fileHandle)))
        .find((t) => t && t.key !== activeKey) ?? tabs.find((t) => t.key !== activeKey);
    openSplit(otherTab?.handle ?? null);
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
  // Resolves to true once the folder is updated, false if it wasn't.
  async function updateExistingFolder(existing, tree, folderId, alreadySaved = false) {
    const name = tree.name;
    const oldCount = flattenTreeFiles(existing.tree).length;
    const newFiles = flattenTreeFiles(tree);
    const go = await askChoice({
      title: "UPDATE FOLDER",
      subtitle: name,
      body: `"${name}" is already in the app. Update it with the folder you picked? Its ${oldCount} file${oldCount === 1 ? "" : "s"} are replaced by these ${newFiles.length}, and anything you removed from it comes back. If this is a different folder that just has the same name, cancel and rename it first.`,
      actions: [{ label: "Update", value: "update", primary: true }],
    });
    if (go !== "update") return false;

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
      if (c === undefined) return false;
      discard = c === "discard";
    }

    const sizeBytes = treeByteSize(tree);
    const estimate = await getStorageEstimate();
    const spaceNote = freeSpaceWarning(`"${name}"`, sizeBytes, estimate ? estimate.quota - foldersBytesUsed : null);
    if (spaceNote) setError(spaceNote);
    try {
      if (!alreadySaved) await copyFolderFiles(folderId, tree, "Updating folder", name);
    } catch (err) {
      await deleteLegacyFolderFiles(folderId);
      if (err.name !== "AbortError") setError(`Couldn't update "${name}": ${err.message}`);
      return false;
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
    markNew([makeNodeKey(name, ""), ...newFiles.map((f) => fileKeyFor(name, f.relativePath))]);
    if (discard) for (const f of affectedFiles) await deleteAnnotatedCopy(fileKeyFor(name, f.relativePath));
    // The open document and Recent entries pointed at the old copy.
    handleFilesRemovedFromView(oldHandles);
    setRecentFiles((prev) => {
      const next = prev.filter((e) => e.fileHandle.folderId !== oldFolderId);
      persistRecent(next);
      return next;
    });
    refreshStorageEstimate();
    return true;
  }

  // Resolves to a node key (show the new folder inside that one), null
  // (top level), or undefined (cancelled). Doesn't ask at all when there's
  // nothing yet to put it inside.
  function askPlacement(folderName) {
    if (displayFolders.length === 0) return Promise.resolve(null);
    return new Promise((resolve) => setPlacement({ folderName, resolve }));
  }

  // NEW chip: set when something is added or replaced, cleared when the
  // file is opened or the folder is opened (see TreeView). Node keys are
  // "rootName:path", the same as fileKeyFor.
  function markNew(keys) {
    setNewKeys((prev) => new Set([...prev, ...keys]));
  }

  function forgetNew(key) {
    setNewKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function openFile(handle) {
    forgetNew(extrasKey(handle));
    return selectFile(handle);
  }

  async function handleAddFolder() {
    let fileList;
    try {
      fileList = await pickFolderLegacy();
    } catch {
      return; // cancelled
    }
    await addFolderFromList(fileList);
  }

  // `savedAs`: the storage id the files were already saved under as they
  // arrived over wifi. Without it they're copied into storage here instead.
  async function addFolderFromList(fileList, savedAs) {
    const folderId = savedAs ?? crypto.randomUUID();
    let kept = false;
    try {
      kept = await addFolderToStorage(fileList, folderId, !!savedAs);
    } finally {
      // Cancelled or failed after the files were saved: don't leave them behind.
      if (savedAs && !kept) await deleteLegacyFolderFiles(folderId);
    }
  }

  // Resolves to true once the folder is in the app, false if it wasn't added.
  async function addFolderToStorage(fileList, folderId, alreadySaved) {
    const tree = buildTreeFromFileList(fileList, folderId);
    if (!tree) {
      setError("No PDF files found in that folder.");
      return false;
    }
    const alreadyThere = folders.find((f) => f.tree?.name === tree.name);
    if (alreadyThere) return updateExistingFolder(alreadyThere, tree, folderId, alreadySaved);
    const dirHandle = tree.handle;
    const parentKey = await askPlacement(dirHandle.name);
    if (parentKey === undefined) return false;
    const sizeBytes = treeByteSize(tree);

    const estimate = await getStorageEstimate();
    const spaceNote = freeSpaceWarning(
      `"${dirHandle.name}"`,
      sizeBytes,
      estimate ? estimate.quota - foldersBytesUsed : null
    );
    if (spaceNote) setError(spaceNote);
    try {
      if (!alreadySaved) await copyFolderFiles(folderId, tree, "Adding folder", dirHandle.name);
    } catch (err) {
      await deleteLegacyFolderFiles(folderId);
      if (err.name !== "AbortError") setError(`Couldn't save "${dirHandle.name}": ${err.message}`);
      return false;
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
    markNew([
      makeNodeKey(tree.name, ""),
      ...flattenTreeFiles(tree).map((f) => fileKeyFor(tree.name, f.relativePath)),
    ]);
    refreshStorageEstimate();
    return true;
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
    startAddFiles(picked);
  }

  function startAddFiles(picked) {
    const files = picked.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (files.length === 0) {
      setError("No PDF files were selected.");
      return;
    }
    setAddFiles({ files });
  }

  // A folder arriving over wifi is saved to storage file by file as it comes
  // in (see openLink), so a folder of any size never sits in memory.
  function beginReceive(kind) {
    if (kind !== "folder") return null;
    const folderId = crypto.randomUUID();
    return {
      folderId,
      async save(file) {
        const storedAs = newStoredName();
        await writeLegacyFile(folderId, storedAs, file);
        // Backed by the stored copy, not by memory; keeps the real name and path.
        const saved = withPath(await readLegacyFile(folderId, storedAs), file.webkitRelativePath, file.name);
        saved.storedAs = storedAs;
        return saved;
      },
      discard: () => deleteLegacyFolderFiles(folderId),
    };
  }

  // Files that came over wifi (WifiModal) go through the same flows as
  // picked ones: a folder like Add folder, loose PDFs like Add files. With no
  // folder yet to put loose PDFs in, they start one called "Received".
  function handleReceived({ kind, files, store }) {
    if (kind === "folder") {
      addFolderFromList(files, store?.folderId).catch((err) => setError(`Couldn't add the folder: ${err.message}`));
    } else if (addFilesTargets.length === 0) {
      addFolderFromList(files.map((f) => withPath(f, `Received/${f.name}`))).catch((err) =>
        setError(`Couldn't add the files: ${err.message}`)
      );
    } else {
      startAddFiles(files);
    }
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
              size: file.size,
              addedAt: Date.now(),
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
        markNew(added.map((n) => fileKeyFor(target.tree.name, n.relativePath)));
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
    if (removedFolder?.tree) {
      closeTabsFor(flattenTreeFileHandles(removedFolder.tree).map((f) => f.handle));
    }
  }

  // Mirrors handleRemoveFolder's close-its-tabs check above, for the
  // individual-file/folder "remove from view" action instead of removing an
  // entire connected folder.
  function handleFilesRemovedFromView(handles) {
    closeTabsFor(handles);
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
    setStars((prev) => {
      const next = omitKeys(prev, keys);
      dbSet("stars", next);
      return next;
    });
  }

  // Gives the files (by key) a star colour, or takes it away with null.
  function starFiles(keys, colorId) {
    setStars((prev) => {
      const next = applyStar(prev, keys, colorId);
      dbSet("stars", next);
      return next;
    });
  }

  // The Manage bar's Delete on the ticked subfolders, files or whole
  // folders: ask first, once for the lot. A node's key always points back at
  // the folder it physically lives in (see parseNodeKey), so this finds the
  // right connected folder and path even if the overlay has moved the node
  // somewhere else in the displayed tree.
  async function requestRemoveNodes(nodes) {
    try {
      const built = (await Promise.all(nodes.map(buildRemoveItem))).filter(Boolean);
      // Whatever sits inside another ticked item goes with it already.
      const items = built.filter(
        (a) =>
          !built.some(
            (b) =>
              b !== a &&
              b.folderKey === a.folderKey &&
              !a.isRoot &&
              (b.isRoot || a.relPath.startsWith(`${b.relPath}/`))
          )
      );
      if (items.length === 0) return;
      const sum = (k) => items.reduce((n, i) => n + i[k], 0);
      setRemoveRequest({
        name: items.length === 1 ? items[0].name : `${items.length} items`,
        kind: items.length === 1 ? items[0].kind : "multi",
        count: sum("count"),
        annotatedCount: sum("annotatedCount"),
        otherCount: sum("otherCount"),
        items,
      });
    } catch (err) {
      setError(`Couldn't prepare the removal: ${err.message}`);
    }
  }

  async function buildRemoveItem(node) {
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
    return {
      name: node.name,
      kind: isRoot ? "directory" : node.kind,
      isRoot,
      folderKey: folder.key,
      relPath,
      count: files.length,
      cleanNames,
      annotatedCount,
      otherCount,
    };
  }

  // Takes the given paths (files or whole subfolders) out of one connected
  // folder for good: deletes the app's stored copies and frees the space.
  // The user's original files outside the app are never involved. Shared by
  // the tree's × and the one-time clean-up of the old hidden list.
  async function removePathsFromFolder(target, relPaths, keep = null) {
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
              tree: relPaths.reduce((tree, p) => removeNodeFromTree(tree, p, keep), f.tree),
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

  // Deletes what buildRemoveItem described, for good: paths inside a folder
  // first (grouped per folder), then whole folders. Shared by the Delete
  // confirmation and by a move that replaces a file. keepKeys are node keys
  // of folders that must survive being emptied (see removeNodeFromTree).
  async function removeItems(items, keepKeys = []) {
    const roots = foldersRef.current.filter((f) => f.tree);
    const keepByFolder = new Map();
    for (const k of keepKeys) {
      const parsed = parseNodeKey(k, roots.map((f) => f.tree.name));
      const folder = parsed && roots.find((f) => f.tree.name === parsed.rootName);
      if (folder && parsed.relPath) {
        keepByFolder.set(folder.key, (keepByFolder.get(folder.key) ?? new Set()).add(parsed.relPath));
      }
    }
    const pathsByFolder = new Map();
    for (const i of items.filter((i) => !i.isRoot)) {
      pathsByFolder.set(i.folderKey, [...(pathsByFolder.get(i.folderKey) ?? []), i.relPath]);
    }
    for (const [folderKey, relPaths] of pathsByFolder) {
      const target = foldersRef.current.find((f) => f.key === folderKey);
      if (target?.tree) await removePathsFromFolder(target, relPaths, keepByFolder.get(folderKey));
    }
    for (const i of items.filter((i) => i.isRoot)) await handleRemoveFolder(i.folderKey);
    await forgetFileExtras(items.flatMap((i) => i.cleanNames));
  }

  async function confirmRemoveNode() {
    const req = removeRequest;
    if (!req) return;
    setRemoveBusy(true);
    try {
      await removeItems(req.items);
      setRemoveRequest(null);
    } catch (err) {
      setError(`Couldn't remove "${req.name}": ${err.message}`);
      setRemoveRequest(null);
    } finally {
      setRemoveBusy(false);
    }
  }

  // Moving only changes where things are shown (see treeOverlay.js). Items
  // whose name is already taken in the destination are asked about one at a
  // time — keep the one already there, replace it, or keep both (the arriving
  // one is shown as "x (1)").
  async function runMove(nodes, destKey) {
    const dest = destKey ? flattenByKey(displayFolders).get(destKey) : null;
    const { clean, clashes } = planMove(nodes, dest);
    const entries = clean.map((n) => ({ key: n.key, destKey }));
    const taken = new Set([...(dest?.children ?? []).map((c) => c.name.toLowerCase())]);
    for (const n of clean) taken.add(n.name.toLowerCase());
    let all = null;
    try {
      for (const [i, clash] of clashes.entries()) {
        const choice = all ?? (await askClash(clash, clashes.length - i));
        if (choice.all) all = choice;
        const incoming = clash.incoming;
        if (choice.action === "skip") continue;
        let name;
        if (choice.action === "replace" && !clash.inBatch && incoming.kind === "file") {
          // The folder it lands in must survive losing its only file.
          await removeItems([await buildRemoveItem(clash.existing)], destKey ? [destKey] : []);
        } else {
          name = uniqueFileName(incoming.name, taken, incoming.kind === "directory");
          taken.add(name.toLowerCase());
        }
        entries.push({ key: incoming.key, destKey, name });
      }
    } catch (err) {
      setError(`Couldn't finish the move: ${err.message}`);
    }
    if (entries.length) moveNodes(entries);
  }

  // Copy makes real duplicates (unlike Move): each file is written to storage
  // again under a new stored name, so the copy and the original never share
  // anything. A connected folder becomes a new connected folder; anything else
  // goes into the destination folder. Items are copied one at a time, and a
  // cancel or failure undoes only the item in progress.
  async function runCopy(picked, destKey) {
    const roots = foldersRef.current.filter((f) => f.tree);
    const rootNames = roots.map((f) => f.tree.name);
    const byKey = flattenByKey(displayFolders);
    // Whatever sits inside another ticked item is copied with it already.
    const nodes = picked.filter((n) => !picked.some((m) => m !== n && isInside(n.key, m.key, byKey)));
    const dest = destKey ? byKey.get(destKey) : null;
    let destFolder = null;
    let destDir = "";
    if (dest) {
      const parsed = parseNodeKey(destKey, rootNames);
      destFolder = parsed && roots.find((f) => f.tree.name === parsed.rootName);
      if (!destFolder) return;
      destDir = parsed.relPath;
    }
    const rawOf = (node) => {
      if (node.folderRef) return roots.find((f) => f.key === node.folderRef.key)?.tree;
      const parsed = parseNodeKey(node.key, rootNames);
      const folder = parsed && roots.find((f) => f.tree.name === parsed.rootName);
      return folder && findNodeAt(folder.tree, parsed.relPath);
    };

    const items = []; // { node, name, plan, isRoot, replace? }
    const takenRoots = new Set(rootNames.map((n) => n.toLowerCase()));
    for (const n of nodes.filter((n) => n.folderRef)) {
      const raw = rawOf(n);
      if (!raw) continue;
      const name = uniqueFileName(n.name, takenRoots, true);
      takenRoots.add(name.toLowerCase());
      items.push({ node: n, name, isRoot: true, plan: planCopyRoot(raw, name) });
    }
    const others = nodes.filter((n) => !n.folderRef);
    if (dest && others.length) {
      const { clean, clashes } = planMove(others, dest, true);
      const taken = new Set(dest.children.map((c) => c.name.toLowerCase()));
      for (const n of clean) {
        const raw = rawOf(n);
        if (raw) items.push({ node: n, name: n.name, plan: planCopy(raw, n.name, destDir) });
      }
      let all = null;
      for (const [i, clash] of clashes.entries()) {
        const choice = all ?? (await askClash(clash, clashes.length - i));
        if (choice.all) all = choice;
        if (choice.action === "skip") continue;
        const n = clash.incoming;
        const raw = rawOf(n);
        if (!raw) continue;
        if (choice.action === "replace" && !clash.inBatch && n.kind === "file") {
          items.push({ node: n, name: n.name, plan: planCopy(raw, n.name, destDir), replace: clash.existing });
        } else {
          const name = uniqueFileName(n.name, taken, n.kind === "directory");
          taken.add(name.toLowerCase());
          items.push({ node: n, name, plan: planCopy(raw, name, destDir) });
        }
      }
    }
    if (items.length === 0) return;

    // Bookmarks and annotations go along only if the user says so.
    const leaves = items.flatMap((i) => planFiles(i.plan));
    const annotated = new Set(await listAnnotatedCopyNames());
    const positions = (await dbGet("filePositions")) || {};
    let annotatedCount = 0;
    let otherCount = 0;
    for (const { srcKey: k } of leaves) {
      if (!k) continue;
      if (annotated.has(k)) annotatedCount++;
      if (bookmarks[k]?.length || positions[k] || outlineExpanded[k]) otherCount++;
    }
    let notes = { bookmarks: false, annotations: false };
    if (annotatedCount + otherCount > 0) {
      notes = await askExtras({ otherCount, annotatedCount });
      if (!notes) return;
    }

    const estimate = await getStorageEstimate();
    const spaceNote = freeSpaceWarning(
      "This copy",
      items.reduce((sum, i) => sum + planBytes(i.plan), 0),
      estimate ? estimate.quota - foldersBytesUsed : null
    );
    if (spaceNote) setError(spaceNote);

    const controller = new AbortController();
    copyControllerRef.current = controller;
    setCopyProgress({
      title: "Copying",
      folderName: destFolder ? destFolder.tree.name : "Top level",
      files: items.flatMap((it, i) => planFiles(it.plan).map((l) => ({ name: l.name, relativePath: `${i}/${l.relativePath}` }))),
      doneCount: 0,
    });
    const tick = makeProgressTicker();
    try {
      for (const item of items) {
        const folderId = item.isRoot ? crypto.randomUUID() : destFolder.folderId;
        const written = [];
        try {
          await writePlan(folderId, item.plan, { signal: controller.signal, onFileDone: tick, written });
        } catch (err) {
          if (item.isRoot) await deleteLegacyFolderFiles(folderId);
          else await deleteLegacyFiles(folderId, written);
          if (err.name !== "AbortError") setError(`Couldn't copy "${item.node.name}": ${err.message}`);
          break;
        }
        const bytes = planBytes(item.plan);
        const rootName = item.isRoot ? item.name : destFolder.tree.name;
        const finished = finishPlan(item.plan, folderId, rootName, item.isRoot);
        if (item.replace) {
          // Safe order: the new file is already written before the old one goes.
          await removeItems([await buildRemoveItem(item.replace)], destKey ? [destKey] : []);
        }
        if (item.isRoot) {
          placeRoot(makeNodeKey(item.name, ""), destKey);
          setFolders((prev) => {
            const next = [
              ...prev,
              { key: crypto.randomUUID(), dirHandle: finished.handle, tree: finished, connectedAt: Date.now(), folderId, sizeBytes: bytes },
            ];
            saveFolderList(next);
            return next;
          });
        } else {
          setFolders((prev) => {
            const next = prev.map((f) =>
              f.key === destFolder.key
                ? { ...f, tree: insertFilesIntoTree(f.tree, destDir, [finished]), sizeBytes: (f.sizeBytes || 0) + bytes }
                : f
            );
            saveFolderList(next);
            return next;
          });
        }
        const pairs = planFiles(item.plan).map((l) => ({ from: l.srcKey, to: fileKeyFor(rootName, l.relativePath) }));
        await copyFileExtras(pairs, notes);
        markNew([makeNodeKey(rootName, item.isRoot ? "" : destDir ? `${destDir}/${item.name}` : item.name), ...pairs.map((p) => p.to)]);
      }
    } finally {
      setCopyProgress(null);
      copyControllerRef.current = null;
      refreshStorageEstimate();
    }
  }

  // Gives each new file the bookmarks / saved page / outline state and the
  // annotated copy of the file it was copied from, as far as the user chose.
  async function copyFileExtras(pairs, { bookmarks: withMarks, annotations: withNotes }) {
    const carry = (prev, store) => {
      const next = { ...prev };
      for (const { from, to } of pairs) if (from && prev[from] !== undefined) next[to] = prev[from];
      dbSet(store, next);
      return next;
    };
    if (withMarks) {
      setBookmarks((prev) => carry(prev, "bookmarks"));
      setOutlineExpanded((prev) => carry(prev, "outlineExpanded"));
      await dbSet("filePositions", carry((await dbGet("filePositions")) || {}, "filePositions"));
    }
    if (withNotes) {
      for (const { from, to } of pairs) {
        const saved = from && (await readAnnotatedCopy(from));
        if (saved) await writeAnnotatedCopy(to, saved);
      }
    }
  }

  // Rotate: opens the sheet on what the file shows (its saved annotated
  // version when it has one), so the turned file keeps the annotations.
  async function startRotate(node, done) {
    try {
      const file = (await readAnnotatedCopy(extrasKey(node.handle))) ?? (await node.handle.getFile());
      setRotateRequest({ node, file, done });
    } catch (err) {
      setError(`Couldn't open "${node.name}": ${err.message}`);
    }
  }

  // Saves what a PDF tool made (a Blob) next to the original as "name
  // (suffix).pdf", or over it. Replacing also drops the saved annotated
  // version, which would otherwise keep opening instead of the new file.
  async function saveFileResult(node, blob, suffix, replace) {
    const roots = foldersRef.current.filter((f) => f.tree);
    const parsed = parseNodeKey(node.key, roots.map((f) => f.tree.name));
    const folder = parsed && roots.find((f) => f.tree.name === parsed.rootName);
    const raw = folder && findNodeAt(folder.tree, parsed.relPath);
    if (!raw) throw new Error("the file is no longer in the app");
    if (replace) {
      await writeLegacyFile(folder.folderId, raw.storedAs, blob);
      const delta = blob.size - (raw.size ?? 0);
      raw.size = blob.size;
      await deleteAnnotatedCopy(extrasKey(raw.handle));
      setFolders((prev) => {
        const next = prev.map((f) =>
          f.key === folder.key ? { ...f, sizeBytes: Math.max(0, (f.sizeBytes || 0) + delta) } : f
        );
        saveFolderList(next);
        return next;
      });
      handleFilesRemovedFromView([raw.handle]);
    } else {
      const dir = parsed.relPath.includes("/") ? parsed.relPath.slice(0, parsed.relPath.lastIndexOf("/")) : "";
      const taken = new Set(filesInDirectory(folder.tree, dir).map((f) => f.name.toLowerCase()));
      const name = uniqueFileName(`${raw.name.replace(/\.pdf$/i, "")} (${suffix}).pdf`, taken);
      const relativePath = dir ? `${dir}/${name}` : name;
      const storedAs = newStoredName();
      await writeLegacyFile(folder.folderId, storedAs, blob);
      const added = {
        name,
        kind: "file",
        relativePath,
        storedAs,
        size: blob.size,
        addedAt: Date.now(),
        handle: reviveLegacyFileHandle(folder.folderId, name, relativePath, folder.tree.name, storedAs),
      };
      setFolders((prev) => {
        const next = prev.map((f) =>
          f.key === folder.key
            ? { ...f, tree: insertFilesIntoTree(f.tree, dir, [added]), sizeBytes: (f.sizeBytes || 0) + blob.size }
            : f
        );
        saveFolderList(next);
        return next;
      });
      markNew([fileKeyFor(folder.tree.name, relativePath)]);
    }
    refreshStorageEstimate();
  }

  async function saveRotated(rotations, replace) {
    const { node, file, done } = rotateRequest;
    try {
      const blob = new Blob([await rotatePages(await file.arrayBuffer(), rotations)], { type: "application/pdf" });
      await saveFileResult(node, blob, "rotated", replace);
      setRotateRequest(null);
      done();
    } catch (err) {
      setError(`Couldn't rotate "${node.name}": ${err.message}`);
    }
  }

  // Protect: asks for the password, working on what the file shows.
  async function startProtect(node, done) {
    try {
      const file = (await readAnnotatedCopy(extrasKey(node.handle))) ?? (await node.handle.getFile());
      setProtectRequest({ node, file, done });
    } catch (err) {
      setError(`Couldn't open "${node.name}": ${err.message}`);
    }
  }

  async function saveProtected(replace, password) {
    const { node, file, done } = protectRequest;
    setToolBusy(true);
    try {
      const bytes = await protectPdf(await file.arrayBuffer(), password);
      await saveFileResult(node, new Blob([bytes], { type: "application/pdf" }), "protected", replace);
      setProtectRequest(null);
      done();
    } catch (err) {
      const already = /encrypt/i.test(err.message) ? "it is already password protected" : err.message;
      setError(`Couldn't protect "${node.name}": ${already}`);
    } finally {
      setToolBusy(false);
    }
  }

  // Flatten: asks first (it can't be taken back), working on what the file
  // shows, so its saved annotations are the ones baked in.
  async function startFlatten(node, done) {
    try {
      const file = (await readAnnotatedCopy(extrasKey(node.handle))) ?? (await node.handle.getFile());
      setFlattenRequest({ node, file, done });
    } catch (err) {
      setError(`Couldn't open "${node.name}": ${err.message}`);
    }
  }

  async function saveFlattened(replace) {
    const { node, file, done } = flattenRequest;
    setToolBusy(true);
    try {
      const { bytes, count } = await flattenAnnotations(await file.arrayBuffer());
      if (count === 0) {
        setError(`There is nothing to flatten in "${node.name}": it has no annotations or form fields.`);
      } else {
        await saveFileResult(node, new Blob([bytes], { type: "application/pdf" }), "flattened", replace);
        done();
      }
      setFlattenRequest(null);
    } catch (err) {
      setError(`Couldn't flatten "${node.name}": ${err.message}`);
    } finally {
      setToolBusy(false);
    }
  }

  // Resolves to { bookmarks, annotations }, or null if the user cancelled.
  function askExtras(counts) {
    return new Promise((resolve) => setExtrasRequest({ ...counts, resolve }));
  }

  // Opens the "name already there" prompt and resolves with the user's pick:
  // { action: "skip" | "replace" | "both", all }.
  function askClash(clash, remaining) {
    return new Promise((resolve) => setClashRequest({ clash, remaining, resolve }));
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
  async function handleGlobalSearchChange(value) {
    if (pdf && !(await closeDocument())) return;
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
  const starredAll = useMemo(
    () => starredEntries(folders.flatMap((f) => (f.tree ? flattenTreeFileHandlesWithPath(f.tree) : [])), stars),
    [folders, stars]
  );
  const tabAvailable = {
    folders: true,
    recent: recentFiles.length > 0 || starredAll.length > 0,
    bookmarks: currentBookmarks.length > 0,
    outline: !!outline,
    pages: !!pdf && numPages > 0,
  };
  const showTabs =
    folders.length > 0 || tabAvailable.recent || tabAvailable.bookmarks || tabAvailable.outline || tabAvailable.pages;
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
  const wifiPresence = usePresence(wifiOpen);
  if (removeRequest) lastRemoveRef.current = removeRequest;
  const removePresence = usePresence(!!removeRequest);
  if (placement) lastPlacementRef.current = placement;
  const placementPresence = usePresence(!!placement);
  const placementShown = placement ?? lastPlacementRef.current;
  const removeShown = removeRequest ?? lastRemoveRef.current;
  if (renameRequest) lastRenameRef.current = renameRequest;
  const renamePresence = usePresence(!!renameRequest);
  const renameShown = renameRequest ?? lastRenameRef.current;
  if (clashRequest) lastClashRef.current = clashRequest;
  const clashPresence = usePresence(!!clashRequest);
  const clashShown = clashRequest ?? lastClashRef.current;
  if (extrasRequest) lastExtrasRef.current = extrasRequest;
  const extrasPresence = usePresence(!!extrasRequest);
  const extrasShown = extrasRequest ?? lastExtrasRef.current;
  if (choice) lastChoiceRef.current = choice;
  const choicePresence = usePresence(!!choice);
  const choiceShown = choice ?? lastChoiceRef.current;
  if (docInfo) lastDocInfoRef.current = docInfo;
  const docInfoPresence = usePresence(!!docInfo);
  const docInfoShown = docInfo ?? lastDocInfoRef.current;
  if (error) lastErrorRef.current = error;
  const errorPresence = usePresence(!!error);
  const errorShown = error ?? lastErrorRef.current;
  const backBannerPresence = usePresence(!!(globalSearch.trim() && pdf));
  const presentExitPresence = usePresence(presenting);
  const foldersBytesUsed = folders.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);
  const storagePercent = storageEstimate?.quota ? (foldersBytesUsed / storageEstimate.quota) * 100 : 0;

  return (
    <div
      ref={appRef}
      className={`app${IS_MOBILE ? " is-phone" : ""}${presenting ? " is-presenting" : ""}${split && settings.paneColours ? " pane-colours" : ""}`}
      onDragOver={handleDragOver} onDrop={handleDrop}>
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
      {wifiPresence.present && (
        <WifiModal
          closing={wifiPresence.closing}
          hidden={!!(addFiles || placement || copyProgress || choice)}
          appError={error}
          onReceived={handleReceived}
          beginReceive={beginReceive}
          onClose={() => setWifiOpen(false)}
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
      {docInfoPresence.present && docInfoShown && (
        <DocumentInfoModal
          closing={docInfoPresence.closing}
          rows={docInfoShown}
          onClose={() => setDocInfo(null)}
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
      {moveRequest && (
        <MovePicker
          folders={displayFolders}
          moving={moveRequest.nodes}
          copy={!!moveRequest.copy}
          onClose={() => setMoveRequest(null)}
          onConfirm={(destKey) => {
            const { nodes, done, copy } = moveRequest;
            setMoveRequest(null);
            (copy ? runCopy : runMove)(nodes, destKey).then(done);
          }}
        />
      )}
      {rotateRequest && (
        <RotateSheet
          file={rotateRequest.file}
          name={rotateRequest.node.name}
          onSave={saveRotated}
          onClose={() => setRotateRequest(null)}
        />
      )}
      {protectRequest && (
        <ProtectModal
          name={protectRequest.node.name}
          busy={toolBusy}
          onSave={saveProtected}
          onClose={() => setProtectRequest(null)}
        />
      )}
      {passwordRequest && (
        <PasswordModal
          key={passwordRequest.wrong ? "again" : "first"}
          request={passwordRequest}
          onSubmit={(password) => {
            passwordRequest.resolve(password);
            setPasswordRequest(null);
          }}
          onCancel={() => {
            passwordRequest.resolve(null);
            setPasswordRequest(null);
          }}
        />
      )}
      {flattenRequest && (
        <ToolModal
          title="FLATTEN"
          subtitle={flattenRequest.node.name}
          busy={toolBusy}
          onSave={saveFlattened}
          onClose={() => setFlattenRequest(null)}
        >
          <p>
            Bakes your annotations and filled-in form fields into the pages, so they can no longer be edited or
            removed. Links keep working.
          </p>
          <p>Replace original overwrites the file and can't be undone.</p>
        </ToolModal>
      )}
      {extrasPresence.present && extrasShown && (
        <CopyExtrasModal
          closing={extrasPresence.closing}
          request={extrasShown}
          onChoose={(choice) => {
            extrasShown.resolve(choice);
            setExtrasRequest(null);
          }}
        />
      )}
      {clashPresence.present && clashShown && (
        <MoveClashModal
          key={clashShown.clash.incoming.key}
          closing={clashPresence.closing}
          request={clashShown}
          onChoose={(action, all) => {
            clashShown.resolve({ action, all });
            setClashRequest(null);
          }}
        />
      )}
      {renamePresence.present && renameShown && (
        <RenameModal
          key={renameShown.key}
          closing={renamePresence.closing}
          request={renameShown}
          onConfirm={(name) => {
            renameNode(renameShown.key, name);
            setRenameRequest(null);
          }}
          onClose={() => setRenameRequest(null)}
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
          className="icon-btn toolbar-toggle"
          onClick={() => setToolbarOpen(true)}
          aria-label="View options"
          aria-expanded={toolbarOpen}
        >
          <IconDotsVertical size={16} />
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
                  Recent/Favs
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
          {showTabs && folders.length > 0 && (
            <button
              className={`sidebar-tab manage-row${manageMode && activeTab === "folders" ? " active" : ""}`}
              aria-pressed={manageMode && activeTab === "folders"}
              onClick={() => {
                // From any other tab: go to the folders and start managing.
                setManageMode(activeTab === "folders" ? !manageMode : true);
                setSidebarTab("folders");
              }}
            >
              <IconChecklist size={14} />
              {manageMode && activeTab === "folders" ? "Done" : "Manage"}
            </button>
          )}
          {activeTab === "recent" && (
            <div className={`sidebar-tab-panel ${sidebarAnim.className}`} style={sidebarAnim.style}>
              <RecentView
                recentFiles={recentFiles}
                starred={starredAll}
                onSelectFile={openFile}
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
            {(storageEstimate || folders.length > 0) && (
              <div className="folders-header">
                <div className="storage-meter">
                  {storageEstimate && (
                    <>
                      <div className="storage-usage">
                        {formatBytes(foldersBytesUsed)} / {formatBytes(storageEstimate.quota)}
                      </div>
                      <div className="storage-bar">
                        <div
                          className={`storage-bar-fill${storagePercent >= 80 ? " warn" : ""}`}
                          style={{ width: `${foldersBytesUsed > 0 ? Math.max(storagePercent, 2) : 0}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
                {folders.length > 0 && <SortMenu sort={sort} onChange={setSort} />}
              </div>
            )}
            <TreeView
              displayFolders={displayFolders}
              onSelectFile={openFile}
              newKeys={newKeys}
              onSeen={forgetNew}
              selectedHandle={selectedHandle}
              manageMode={manageMode}
              onDeleteNodes={requestRemoveNodes}
              onRenameNode={(node) => setRenameRequest({ key: node.key, name: node.name })}
              onMoveNodes={(nodes, done) => setMoveRequest({ nodes, done })}
              onCopyNodes={(nodes, done) => setMoveRequest({ nodes, done, copy: true })}
              onRotateNode={startRotate}
              onFlattenNode={startFlatten}
              onProtectNode={startProtect}
              onStarNodes={(nodes, colorId) => starFiles(nodes.map((n) => extrasKey(n.handle)), colorId)}
              stars={stars}
            />
            {/* Anchored to .folders-panel, not .tree-rows — stays put in the
                corner as the tree scrolls underneath it. */}
            <div className="add-fab" ref={fabRef} hidden={manageMode}>
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
                    <IconFolderPlus size={16} /> Add Folder
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
                    <IconFilePlus size={16} /> Add Files
                  </button>
                  <button
                    className="tree-kebab-item"
                    style={{ "--i": 2 }}
                    onClick={() => {
                      setFabMenuOpen(false);
                      setWifiOpen(true);
                    }}
                  >
                    <IconWifi size={16} /> Send / Receive Via WIFI
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
          <div className={`sidebar-backdrop${toolbarOpen ? " open" : ""}`} onClick={() => setToolbarOpen(false)} />
          <Toolbar
            drawerOpen={toolbarOpen}
            onCloseDrawer={() => setToolbarOpen(false)}
            viewMode={viewMode}
            viewModeLocked={split}
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
            onShowInfo={showDocInfo}
            onStartPresentation={startPresentation}
            isFullscreen={isFullscreen}
            fullscreenSupported={fullscreenSupported}
            onToggleFullscreen={toggleFullscreen}
            onOpenSettings={openSettings}
            settingsUpdateAvailable={update.needRefresh}
          />
          {tabs.length > 0 && (
            <TabBar
              tabs={tabs}
              activeKey={activeKey}
              split={split}
              paneOf={(key) => (panes.L.activeKey === key ? "L" : panes.R.activeKey === key ? "R" : null)}
              splitDisabledReason={splitDisabledReason}
              onSelect={selectFile}
              onClose={closeTab}
              onActivatePane={setActivePane}
              onShowInfo={showDocInfo}
              onToggleSplit={toggleSplit}
              onStartPresentation={startPresentation}
            />
          )}
          {errorPresence.present && (
            <div className={`error-banner${errorPresence.closing ? " is-closing" : ""}`}>
              <span>{errorShown}</span>
              <button aria-label="Dismiss" onClick={() => setError(null)}>
                <IconX size={16} />
              </button>
            </div>
          )}
          {backBannerPresence.present && (
            <div className={`back-to-results-banner${backBannerPresence.closing ? " is-closing" : ""}`}>
              <button className="cb-btn" onClick={backToResults}>
                <IconArrowLeft size={14} />
                Back to results
              </button>
            </div>
          )}
          {presentExitPresence.present && (
            <button
              className={`presentation-exit${presentExitPresence.closing ? " is-closing" : ""}`}
              aria-label="Exit presentation"
              onClick={stopPresentation}
            >
              <IconX size={18} />
            </button>
          )}
          <div className={`panes${split ? " is-split" : ""}`}>
            {["L", "R"].map((id) => (
              <Pane
                key={id}
                id={id}
                pane={panes[id]}
                viewerApi={id === "L" ? viewerApiL : viewerApiR}
                split={split}
                isActive={activePane === id}
                hidden={!split && activePane !== id}
                searchActive={!!globalSearch.trim()}
                onReady={id === "L" ? setViewerApiL : setViewerApiR}
                onActivate={setActivePane}
                onClose={closePane}
                readingTheme={settings.readingTheme}
                readingBrightness={settings.readingBrightness}
                readingContrast={settings.readingContrast}
                annotationTool={annotationTool}
                presenting={presenting}
              />
            ))}
          </div>
          {globalSearch.trim() && !pdf && !loading && (
            <SearchResults query={globalSearch} folders={displayFolders} onOpenResult={openFile} />
          )}
          <button
            className={`sidebar-pill${pdf && !loading ? " over-doc" : ""}`}
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            aria-pressed={sidebarOpen}
          >
            <IconLayoutSidebar size={16} />
          </button>
        </main>
      </div>
    </div>
  );
}

export default App;
