import { useCallback, useEffect, useRef, useState } from "react";
import {
  pickFolder,
  scanDirectory,
  supportsDirectoryPicker,
  pickFolderLegacy,
  buildTreeFromFileList,
} from "./fileSystem.js";
import { loadDocument } from "./edoc.js";
import { dbGet, dbSet } from "./db.js";
import TreeView from "./TreeView.jsx";
import PdfViewer, { SCROLL_MODE_BY_VIEW, SPREAD_MODE_BY_VIEW } from "./PdfViewer.jsx";
import Toolbar from "./Toolbar.jsx";
import UpdatePrompt from "./UpdatePrompt.jsx";
import Settings from "./Settings.jsx";
import BrandBanner from "@brand/BrandBanner";
import SplashScreen from "@brand/SplashScreen";
import "./App.css";

const DEFAULT_SETTINGS = {
  theme: "system",
  defaultViewMode: "two-up",
  resumePosition: true,
  keepAwake: false,
};

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const onSplashFinish = useCallback(() => setShowSplash(false), []);
  const [folders, setFolders] = useState([]); // [{ dirHandle, tree }], tree is null while pending permission
  const [selectedHandle, setSelectedHandle] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [viewMode, setViewMode] = useState("single");
  const [scale, setScale] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState(null);
  const [viewerApi, setViewerApi] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const restorePageRef = useRef(null);
  const seedFitPageRef = useRef(false);
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

      const savedState = await dbGet("viewState");
      setSettings(resolvedSettings);
      if (savedState) {
        setViewMode(savedState.viewMode);
        setScale(savedState.scale);
      } else {
        setViewMode(resolvedSettings.defaultViewMode);
        seedFitPageRef.current = true;
      }
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
          const lastPosition = await dbGet("lastPosition");
          restorePageRef.current = lastPosition?.page ?? null;
          selectFile(lastFileHandle);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!initializedRef.current) return;
    dbSet("viewState", { viewMode, scale });
  }, [viewMode, scale]);

  useEffect(() => {
    if (!initializedRef.current) return;
    dbSet("settings", settings);
  }, [settings]);

  useEffect(() => {
    if (!pdf) return;
    dbSet("lastPosition", { page: currentPage });
  }, [pdf, currentPage]);

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

  // Drive the pdf.js viewer from React state/events instead of rendering
  // pages ourselves — see PdfViewer.jsx.
  useEffect(() => {
    if (!viewerApi) return;
    const { eventBus } = viewerApi;
    const onPageChanging = (e) => setCurrentPage(e.pageNumber);
    const onScaleChanging = (e) => setScale(e.scale);
    const onPagesInit = () => {
      if (seedFitPageRef.current) {
        viewerApi.pdfViewer.currentScaleValue = "page-fit";
        seedFitPageRef.current = false;
      } else {
        viewerApi.pdfViewer.currentScaleValue = scaleRef.current;
      }
      if (restorePageRef.current) {
        viewerApi.pdfViewer.currentPageNumber = restorePageRef.current;
        restorePageRef.current = null;
      }
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
  }, [viewerApi]);

  useEffect(() => {
    if (!viewerApi || !pdf) return;
    viewerApi.pdfViewer.setDocument(pdf);
    viewerApi.linkService.setDocument(pdf);
    setNumPages(pdf.numPages);
  }, [viewerApi, pdf]);

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

  async function selectFile(fileHandle) {
    setSelectedHandle(fileHandle);
    setError(null);
    setSidebarOpen(false); // no-op on wide screens, closes the drawer on narrow ones
    try {
      const file = await fileHandle.getFile();
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timed out loading PDF")), 15000)
      );
      const doc = await Promise.race([loadDocument(file), timeout]);
      setPdf(doc);
      if (!fileHandle.__legacy) await dbSet("lastFileHandle", fileHandle);
    } catch (err) {
      console.error(err);
      setError(`Couldn't open "${fileHandle.name}": ${err.message}`);
      setPdf(null);
    }
  }

  const pendingFolders = folders.filter((f) => !f.tree);

  return (
    <div className="app">
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
          {!pdf && <div className="viewer-empty">Select a PDF to view</div>}
        </main>
      </div>
    </div>
  );
}

export default App;
