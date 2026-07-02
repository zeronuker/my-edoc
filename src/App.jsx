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
} from "./fileSystem.js";
import { deleteLegacyFolderFiles } from "./opfs.js";
import { requestPersistentStorage, getStorageEstimate } from "./storage.js";
import { loadDocument } from "./edoc.js";
import { dbGet, dbSet } from "./db.js";
import TreeView from "./TreeView.jsx";
import OutlineView from "./OutlineView.jsx";
import PdfViewer, { SCROLL_MODE_BY_VIEW, SPREAD_MODE_BY_VIEW } from "./PdfViewer.jsx";
import Toolbar from "./Toolbar.jsx";
import UpdatePrompt from "./UpdatePrompt.jsx";
import Settings from "./Settings.jsx";
import CopyProgressModal from "./CopyProgressModal.jsx";
import BrandBanner from "@brand/BrandBanner";
import SplashScreen from "@brand/SplashScreen";
import "./App.css";

const DEFAULT_SETTINGS = {
  theme: "system",
  resumePosition: true,
  keepAwake: false,
};

// Keep in sync with the mobile-layout breakpoint in App.css.
const NARROW_QUERY = "(max-width: 880px)";

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
  const [viewerApi, setViewerApi] = useState(null);
  // Mobile starts with the drawer closed; desktop starts with the sidebar
  // expanded (it has no separate "closed" affordance until now).
  const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia(NARROW_QUERY).matches);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [outline, setOutline] = useState(null);
  const [sidebarTab, setSidebarTab] = useState("folders");
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

      if (resolvedSettings.resumePosition) {
        const lastFileHandle = await dbGet("lastFileHandle");
        if (lastFileHandle && (await lastFileHandle.queryPermission({ mode: "read" })) === "granted") {
          selectFile(lastFileHandle);
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
      all[selectedHandle.name] = { page: currentPage, scale };
      await dbSet("filePositions", all);
    })();
  }, [selectedHandle, currentPage, scale]);

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
  }, [viewerApi, pdf]);

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
    setSelectedHandle(fileHandle);
    setError(null);
    setSidebarOpen(false); // give the page the most space: close the drawer (mobile) / collapse the sidebar (desktop)
    setLoading(true);
    // Two-page (or single-page on narrow screens) + fit-page is the
    // default on every open; manually switching view mode only sticks
    // for the file currently open.
    setViewMode(isNarrow ? "single" : "two-up");
    restoringRef.current = true;
    try {
      const file = await fileHandle.getFile();
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timed out loading PDF")), 15000)
      );
      const doc = await Promise.race([loadDocument(file), timeout]);
      const positions = (await dbGet("filePositions")) || {};
      pendingRestoreRef.current = positions[fileHandle.name] || null;
      setPdf(doc);
      if (!fileHandle.__legacy) await dbSet("lastFileHandle", fileHandle);
    } catch (err) {
      console.error(err);
      setError(`Couldn't open "${fileHandle.name}": ${err.message}`);
      setPdf(null);
      restoringRef.current = false;
    } finally {
      setLoading(false);
    }
  }

  const pendingFolders = folders.filter((f) => !f.tree);
  const activeTab = outline ? sidebarTab : "folders";
  const foldersBytesUsed = folders.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);

  return (
    <div className="app" onDragOver={handleDragOver} onDrop={handleDrop}>
      {showSplash && <SplashScreen onFinish={onSplashFinish} />}
      <UpdatePrompt ready={!showSplash} />
      {settingsOpen && (
        <Settings
          settings={settings}
          onChange={updateSettings}
          onClose={() => setSettingsOpen(false)}
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
      <div className="topbar">
        <button
          className="icon-btn sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          aria-pressed={sidebarOpen}
        >
          ☰
        </button>
        <BrandBanner subtitle="DOCUMENT VIEWER" />
        <button
          className="icon-btn settings-toggle"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
        >
          ⚙
        </button>
      </div>
      <div className="app-row">
        {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
        <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
          {outline && (
            <div className="sidebar-tabs">
              <button
                className={`sidebar-tab${activeTab === "folders" ? " active" : ""}`}
                onClick={() => setSidebarTab("folders")}
              >
                Folders
              </button>
              <button
                className={`sidebar-tab${activeTab === "outline" ? " active" : ""}`}
                onClick={() => setSidebarTab("outline")}
              >
                Outline
              </button>
            </div>
          )}
          {activeTab === "outline" && (
            <OutlineView
              items={outline}
              linkService={viewerApi?.linkService}
              onNavigate={() => setSidebarOpen(false)}
            />
          )}
          {/* Kept mounted (just hidden) instead of unmounted on tab switch —
              TreeView's expanded-folder state is local to each Node, and
              unmounting it collapses the whole tree back to the root. */}
          <div hidden={activeTab !== "folders"}>
            <button className="cb-btn cb-btn--primary" onClick={handleAddFolder} disabled={addingFolder}>
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
          />
          {error && <div className="error-banner">{error}</div>}
          <PdfViewer pdf={pdf} viewMode={viewMode} onReady={setViewerApi} />
          {(loading || !pdf) && (
            <div className="viewer-empty">
              {loading ? (
                <span className="viewer-loading">
                  <span className="spinner" />
                  Loading {selectedHandle?.name}…
                </span>
              ) : (
                "Select a PDF to view"
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
