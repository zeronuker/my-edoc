import { useEffect, useRef, useState } from "react";
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
import BrandBanner from "@brand/BrandBanner";
import "./App.css";

function App() {
  const [folders, setFolders] = useState([]); // [{ dirHandle, tree }], tree is null while pending permission
  const [selectedHandle, setSelectedHandle] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [viewMode, setViewMode] = useState("single");
  const [scale, setScale] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState(null);
  const [viewerApi, setViewerApi] = useState(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  // Restore last session: directory handles need a user gesture to
  // re-request permission in most browsers, so folders without it show
  // a per-folder "Reconnect" button instead of silently failing.
  useEffect(() => {
    (async () => {
      const savedState = await dbGet("viewState");
      if (savedState) {
        setViewMode(savedState.viewMode);
        setScale(savedState.scale);
      }
      const dirHandles = (await dbGet("rootDirHandles")) || [];
      const loaded = [];
      for (const dirHandle of dirHandles) {
        const granted = (await dirHandle.queryPermission({ mode: "read" })) === "granted";
        loaded.push({ dirHandle, tree: granted ? await scanDirectory(dirHandle) : null });
      }
      setFolders(loaded);

      const lastFileHandle = await dbGet("lastFileHandle");
      if (lastFileHandle && (await lastFileHandle.queryPermission({ mode: "read" })) === "granted") {
        selectFile(lastFileHandle);
      }
    })();
  }, []);

  useEffect(() => {
    dbSet("viewState", { viewMode, scale });
  }, [viewMode, scale]);

  // Drive the pdf.js viewer from React state/events instead of rendering
  // pages ourselves — see PdfViewer.jsx.
  useEffect(() => {
    if (!viewerApi) return;
    const { eventBus } = viewerApi;
    const onPageChanging = (e) => setCurrentPage(e.pageNumber);
    const onScaleChanging = (e) => setScale(e.scale);
    const onPagesInit = () => {
      viewerApi.pdfViewer.currentScaleValue = scaleRef.current;
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
      <BrandBanner subtitle="DOCUMENT VIEWER" />
      <div className="app-row">
        <aside className="sidebar">
          <button className="cb-btn cb-btn--primary" onClick={handleAddFolder}>
            Add folder…
          </button>
          {pendingFolders.map(({ dirHandle }) => (
            <button key={dirHandle.name} className="cb-btn" onClick={() => handleReconnect(dirHandle)}>
              Reconnect "{dirHandle.name}"
            </button>
          ))}
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
