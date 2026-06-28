import { useEffect, useRef, useState } from "react";
import { pickFolder, scanDirectory } from "./fileSystem.js";
import { loadDocument } from "./edoc.js";
import { dbGet, dbSet } from "./db.js";
import TreeView from "./TreeView.jsx";
import PdfViewer, { SCROLL_MODE_BY_VIEW, SPREAD_MODE_BY_VIEW } from "./PdfViewer.jsx";
import Toolbar from "./Toolbar.jsx";
import BrandBanner from "@brand/BrandBanner";
import "./App.css";

function App() {
  const [root, setRoot] = useState(null);
  const [selectedHandle, setSelectedHandle] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [viewMode, setViewMode] = useState("single");
  const [scale, setScale] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [pendingDirHandle, setPendingDirHandle] = useState(null);
  const [error, setError] = useState(null);
  const [viewerApi, setViewerApi] = useState(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  // Restore last session: directory handle needs a user gesture to
  // re-request permission in most browsers, so we surface a "Reconnect"
  // button instead of silently failing.
  useEffect(() => {
    (async () => {
      const savedState = await dbGet("viewState");
      if (savedState) {
        setViewMode(savedState.viewMode);
        setScale(savedState.scale);
      }
      const dirHandle = await dbGet("rootDirHandle");
      if (!dirHandle) return;
      const granted = (await dirHandle.queryPermission({ mode: "read" })) === "granted";
      if (granted) {
        openFolder(dirHandle);
      } else {
        setPendingDirHandle(dirHandle);
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

  async function openFolder(dirHandle) {
    const tree = await scanDirectory(dirHandle);
    setRoot(tree);
    setPendingDirHandle(null);
    await dbSet("rootDirHandle", dirHandle);

    const lastFileHandle = await dbGet("lastFileHandle");
    if (lastFileHandle && (await lastFileHandle.queryPermission({ mode: "read" })) === "granted") {
      selectFile(lastFileHandle);
    }
  }

  async function handlePickFolder() {
    const dirHandle = await pickFolder();
    openFolder(dirHandle);
  }

  async function handleReconnect() {
    const granted = (await pendingDirHandle.requestPermission({ mode: "read" })) === "granted";
    if (granted) openFolder(pendingDirHandle);
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
      await dbSet("lastFileHandle", fileHandle);
    } catch (err) {
      console.error(err);
      setError(`Couldn't open "${fileHandle.name}": ${err.message}`);
      setPdf(null);
    }
  }

  return (
    <div className="app">
      <BrandBanner subtitle="DOCUMENT VIEWER" />
      <div className="app-row">
        <aside className="sidebar">
          <button className="cb-btn cb-btn--primary" onClick={handlePickFolder}>
            Open folder…
          </button>
          {pendingDirHandle && (
            <button className="cb-btn" onClick={handleReconnect}>
              Reconnect to last folder
            </button>
          )}
          <TreeView root={root} onSelectFile={selectFile} selectedHandle={selectedHandle} />
        </aside>
        <main className="main">
          <Toolbar
            viewMode={viewMode}
            setViewMode={setViewMode}
            scale={scale}
            currentPage={currentPage}
            numPages={numPages}
            pdfViewer={viewerApi?.pdfViewer}
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
