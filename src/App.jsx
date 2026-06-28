import { useEffect, useState } from "react";
import { pickFolder, scanDirectory } from "./fileSystem.js";
import { loadDocument } from "./edoc.js";
import { dbGet, dbSet } from "./db.js";
import TreeView from "./TreeView.jsx";
import Viewer from "./Viewer.jsx";
import Toolbar from "./Toolbar.jsx";
import "./App.css";

function App() {
  const [root, setRoot] = useState(null);
  const [selectedHandle, setSelectedHandle] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [viewMode, setViewMode] = useState("single");
  const [scale, setScale] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingDirHandle, setPendingDirHandle] = useState(null);
  const [error, setError] = useState(null);

  // Restore last session: directory handle needs a user gesture to
  // re-request permission in most browsers, so we surface a "Reconnect"
  // button instead of silently failing.
  useEffect(() => {
    (async () => {
      const savedState = await dbGet("viewState");
      if (savedState) {
        setViewMode(savedState.viewMode);
        setScale(savedState.scale);
        setCurrentPage(savedState.currentPage);
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
    dbSet("viewState", { viewMode, scale, currentPage });
  }, [viewMode, scale, currentPage]);

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
      setCurrentPage(1);
      await dbSet("lastFileHandle", fileHandle);
    } catch (err) {
      console.error(err);
      setError(`Couldn't open "${fileHandle.name}": ${err.message}`);
      setPdf(null);
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <button onClick={handlePickFolder}>Open folder…</button>
        {pendingDirHandle && (
          <button onClick={handleReconnect}>Reconnect to last folder</button>
        )}
        <TreeView root={root} onSelectFile={selectFile} selectedHandle={selectedHandle} />
      </aside>
      <main className="main">
        <Toolbar
          viewMode={viewMode}
          setViewMode={setViewMode}
          scale={scale}
          setScale={setScale}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          numPages={pdf?.numPages}
          step={viewMode === "two-up" ? 2 : 1}
        />
        {error && <div className="error-banner">{error}</div>}
        <Viewer pdf={pdf} viewMode={viewMode} scale={scale} currentPage={currentPage} />
      </main>
    </div>
  );
}

export default App;
