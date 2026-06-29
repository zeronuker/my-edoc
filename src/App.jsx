import { useCallback, useEffect, useRef, useState } from "react";
import {
  pickFolder,
  scanDirectory,
  supportsDirectoryPicker,
  pickFolderLegacy,
  buildTreeFromFileList,
  wrapDroppedFile,
} from "./fileSystem.js";
import { loadDocument } from "./edoc.js";
import { dbGet, dbSet } from "./db.js";
import TreeView from "./TreeView.jsx";
import OutlineView from "./OutlineView.jsx";
import PdfViewer, { SCROLL_MODE_BY_VIEW, SPREAD_MODE_BY_VIEW } from "./PdfViewer.jsx";
import Toolbar from "./Toolbar.jsx";
import UpdatePrompt from "./UpdatePrompt.jsx";
import Settings from "./Settings.jsx";
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

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const onSplashFinish = useCallback(() => setShowSplash(false), []);
  const [folders, setFolders] = useState([]); // [{ dirHandle, tree }], tree is null while pending permission
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [outline, setOutline] = useState(null);
  const [sidebarTab, setSidebarTab] = useState("folders");
  const pendingRestoreRef = useRef(null);
  const restoringRef = useRef(false);
  // Persist-on-change effects below would otherwise fire once on mount
  // with default state, racing ahead of (and clobbering) the load below.
  const initializedRef = useRef(false);

  // Restore last session: directory handles need a user gesture to
  // re-request permission in most browsers, so folders without it show
  // a per-folder "Reconnect" button instead of silently failing.
  useEffect(() => {
    (async () => {
      const savedSettings = await dbGet("settings");
      const resolvedSettings = { ...DEFAULT_SETTINGS, ...savedSettings };
      setSettings(resolvedSettings);
      initializedRef.current = true;

      const dirHandles = (await dbGet("rootDirHandles")) || [];
      const loaded = [];
      for (const dirHandle of dirHandles) {
        const granted = (await dirHandle.queryPermission({ mode: "read" })) === "granted";
        loaded.push({ dirHandle, tree: granted ? await scanDirectory(dirHandle) : null });
      }
      setFolders(loaded);

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

  function persistFolders(next) {
    // Legacy (Safari/iOS) handles carry functions IndexedDB can't
    // structured-clone — only real FileSystemHandle objects persist.
    const persistable = next.filter((f) => !f.dirHandle.__legacy);
    dbSet("rootDirHandles", persistable.map((f) => f.dirHandle));
  }

  async function handleAddFolder() {
    let dirHandle, tree;
    if (supportsDirectoryPicker()) {
      dirHandle = await pickFolder();
      tree = await scanDirectory(dirHandle);
    } else {
      const fileList = await pickFolderLegacy();
      tree = buildTreeFromFileList(fileList);
      if (!tree) {
        setError("No PDF files found in that folder.");
        return;
      }
      dirHandle = tree.handle;
    }
    setFolders((prev) => {
      const next = [...prev, { dirHandle, tree }];
      persistFolders(next);
      return next;
    });
  }

  async function handleReconnect(dirHandle) {
    const granted = (await dirHandle.requestPermission({ mode: "read" })) === "granted";
    if (!granted) return;
    const tree = await scanDirectory(dirHandle);
    setFolders((prev) => prev.map((f) => (f.dirHandle === dirHandle ? { ...f, tree } : f)));
  }

  async function handleReconnectAll(dirHandles) {
    for (const dirHandle of dirHandles) await handleReconnect(dirHandle);
  }

  function handleRemoveFolder(dirHandle) {
    setFolders((prev) => {
      const next = prev.filter((f) => f.dirHandle !== dirHandle);
      persistFolders(next);
      return next;
    });
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
            const next = [...prev, { dirHandle: handle, tree }];
            persistFolders(next);
            return next;
          });
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
    setSidebarOpen(false); // no-op on wide screens, closes the drawer on narrow ones
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

  return (
    <div className="app" onDragOver={handleDragOver} onDrop={handleDrop}>
      {showSplash && <SplashScreen onFinish={onSplashFinish} />}
      <UpdatePrompt />
      {settingsOpen && (
        <Settings
          settings={settings}
          onChange={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <div className="topbar">
        <button
          className="icon-btn sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="Toggle folders"
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
            <button className="cb-btn cb-btn--primary" onClick={handleAddFolder}>
              Add folder
            </button>
            {pendingFolders.length > 0 && (
              <button
                className="cb-btn"
                onClick={() => handleReconnectAll(pendingFolders.map((f) => f.dirHandle))}
              >
                Reconnect all
              </button>
            )}
            <TreeView
              folders={folders.filter((f) => f.tree)}
              onSelectFile={selectFile}
              selectedHandle={selectedHandle}
              onRemoveFolder={handleRemoveFolder}
            />
          </div>
        </aside>
        <main className="main">
          <Toolbar
            viewMode={viewMode}
            setViewMode={setViewMode}
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
