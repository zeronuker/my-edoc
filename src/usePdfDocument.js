import { useRef, useState } from "react";
import { extrasKey } from "./fileSystem.js";
import { openTab, pickNeighbor } from "./appHelpers.js";
import { usePane } from "./usePane.js";

const otherOf = (id) => (id === "L" ? "R" : "L");

// What the panes share: the tab list, whether the screen is split, which pane
// is the active one (the one the toolbar, search and sidebar panels act on),
// and closing tabs. The document state itself lives in one usePane per pane —
// see usePane.js. Unsplit, only the active pane is on screen and the other
// holds nothing, so at most two documents are ever loaded.
export function usePdfDocument({ isNarrow, viewerApis, closeSidebarIfAutoHide, addToRecent, setError, confirmLeave }) {
  const [tabs, setTabs] = useState([]); // [{ key, handle }], see openTab
  const [split, setSplit] = useState(false);
  const [activePane, setActivePaneRaw] = useState("L");

  const shared = { isNarrow, split, tabs, setTabs, closeSidebarIfAutoHide, addToRecent, setError, confirmLeave };
  const panes = {
    L: usePane({ ...shared, viewerApi: viewerApis.L }),
    R: usePane({ ...shared, viewerApi: viewerApis.R }),
  };
  const active = panes[activePane];

  // The latest of what the close paths below need, for when they're reached
  // through an older render's closure (a folder removal awaits several things
  // before it gets here).
  const latest = useRef(null);
  latest.current = { tabs, split, activePane, shown: { L: panes.L.activeKey, R: panes.R.activeKey } };

  // Closes the tabs in `removed` (a Set of keys). A pane that was showing one
  // moves to the nearest tab that is neither closing nor on show in the other
  // pane; with none left, an unsplit viewer empties and a split collapses to
  // the pane that remains.
  function dropTabs(removed) {
    const { tabs: current, split: wasSplit, activePane: ap, shown } = latest.current;
    const shownNow = { ...shown };
    let splitNow = wasSplit;
    let activeNow = ap;
    setTabs((prev) => prev.filter((t) => !removed.has(t.key)));
    for (const id of wasSplit ? ["L", "R"] : [ap]) {
      if (!removed.has(shownNow[id])) continue;
      const otherKey = splitNow ? shownNow[otherOf(id)] : null;
      const next = pickNeighbor(current, shownNow[id], new Set([...removed, otherKey]));
      if (next) {
        panes[id].loadFile(next.handle);
        shownNow[id] = next.key;
      } else {
        panes[id].unloadDocument();
        shownNow[id] = null;
        if (splitNow) {
          splitNow = false;
          activeNow = otherOf(id);
        }
      }
    }
    if (splitNow !== wasSplit) {
      setSplit(splitNow);
      setActivePaneRaw(activeNow);
    }
  }

  // Opens a file in the active pane — or, if the other pane is already
  // showing it, just makes that pane the active one (one file is never loaded
  // twice).
  async function selectFile(fileHandle) {
    const other = panes[otherOf(activePane)];
    if (split && other.activeKey === extrasKey(fileHandle) && (other.pdf || other.loading)) {
      setActivePaneRaw(otherOf(activePane));
      return;
    }
    await active.selectFile(fileHandle);
  }

  // The user closes a tab (its ×). Only the document on screen can hold
  // unsaved annotations, so only closing a tab that's showing asks.
  async function closeTab(key) {
    const { split: isSplit, activePane: ap, shown } = latest.current;
    const id = (isSplit ? ["L", "R"] : [ap]).find((p) => shown[p] === key);
    if (id && panes[id].hasUnsavedAnnotations && !(await confirmLeave(panes[id].selectedHandle))) return;
    dropTabs(new Set([key]));
  }

  // Closes every tab whose file was removed from under the user — no
  // unsaved-annotations confirm, the file is gone.
  function closeTabsFor(handles) {
    const gone = new Set(handles);
    const keys = latest.current.tabs.filter((t) => gone.has(t.handle)).map((t) => t.key);
    if (keys.length > 0) dropTabs(new Set(keys));
  }

  // Fills the tab bar without loading anything — the caller opens one of them
  // right after (the tabs saved by the last session, see App.jsx).
  function restoreTabs(handles) {
    setTabs(handles.reduce((list, handle) => openTab(list, handle), []));
  }

  // Splits the screen: the other pane opens `handle` (null leaves it empty).
  function openSplit(handle) {
    setSplit(true);
    if (handle) panes[otherOf(activePane)].loadFile(handle);
  }

  // Closes one pane of a split, keeping the other on screen. The closed pane's
  // tab stays in the bar; its document is released straight away.
  async function closePane(id) {
    if (!split) return;
    if (panes[id].hasUnsavedAnnotations && !(await confirmLeave(panes[id].selectedHandle))) return;
    panes[id].unloadDocument();
    setSplit(false);
    setActivePaneRaw(otherOf(id));
  }

  return {
    tabs,
    split,
    activePane,
    setActivePane: (id) => split && setActivePaneRaw(id),
    panes,
    active,
    selectFile,
    closeDocument: () => active.closeDocument(),
    closeTab,
    closeTabsFor,
    restoreTabs,
    openSplit,
    closePane,
  };
}
