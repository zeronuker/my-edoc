import { useEffect, useRef, useState } from "react";
import { RenderingCancelledException } from "pdfjs-dist";
import { IconChecks, IconChevronLeft, IconRotate, IconRotateClockwise, IconSquareOff, IconX } from "@tabler/icons-react";
import ChamferFrame from "@brand/ChamferFrame";
import { loadDocument } from "./edoc.js";
import { parsePageRange } from "./appHelpers.js";

const THUMB = 96; // px: longest side of a page thumbnail
// Grid geometry for drawing only the rows near the screen. Must match .rotate-thumb's height
// and the grid gap in App.css; a cell is 108px wide at least.
const ROW_H = 130;
const GAP = 8;
const CELL_MIN = 108;
const PAD_X = 24; // the scroller's left + right padding
const BUFFER_ROWS = 2;

// One page at a time: rendering several big scanned pages at once is what
// runs a small device out of memory.
let renderQueue = Promise.resolve();
const enqueue = (task) => {
  const run = renderQueue.then(task);
  renderQueue = run.catch(() => {});
  return run;
};

// A page thumbnail that draws once it scrolls near view, turned by `rotation`
// degrees on top of the page's own turn. The frame is square, and the page is
// drawn with its longest side at THUMB, so any turn fits inside it.
function PageThumb({ pdf, pageNumber, rotation, checked, onToggle }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    if (drawn) return;
    const el = wrapRef.current;
    let cancelled = false;
    let renderTask = null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        enqueue(draw).catch(() => {});
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);

    async function draw() {
      if (cancelled) return;
      const page = await pdf.getPage(pageNumber);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (THUMB * ratio) / Math.max(natural.width, natural.height) });
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / ratio}px`;
      canvas.style.height = `${viewport.height / ratio}px`;
      renderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport });
      try {
        await renderTask.promise;
      } catch (err) {
        if (!(err instanceof RenderingCancelledException)) throw err;
        return;
      }
      page.cleanup();
      if (!cancelled) setDrawn(true);
    }

    return () => {
      cancelled = true;
      renderTask?.cancel();
      observer.disconnect();
    };
  }, [pdf, pageNumber, drawn]);

  return (
    <button
      ref={wrapRef}
      className={`rotate-thumb${checked ? " checked" : ""}`}
      aria-pressed={checked}
      aria-label={`Page ${pageNumber}`}
      onClick={() => onToggle(pageNumber)}
    >
      <span className="rotate-thumb-frame">
        <canvas ref={canvasRef} hidden={!drawn} style={{ transform: `rotate(${rotation}deg)` }} />
        {checked && <span className="rotate-thumb-tick">✓</span>}
      </span>
      <span className="thumb-page-num">{pageNumber}</span>
    </button>
  );
}

// Window for turning a file's pages. Nothing starts selected (a file can have
// thousands of pages): type a range like "5, 12-20" (the grid jumps to its first page), tap pages, or press All.
// Only the rows near the screen are drawn. `initialPage` (the page being read)
// starts selected and scrolled to. `file` is what the sheet shows and turns
// (the saved annotated version when the file has one). onSave(rotations, replace) gets the degrees to add
// to each page and whether to replace the original; it resolves once saved.
export default function RotateSheet({ file, name, initialPage = null, onSave, onClose, closing = false }) {
  const [pdf, setPdf] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [turns, setTurns] = useState([]); // degrees added so far, per page
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState("");
  const [bad, setBad] = useState([]);
  const [box, setBox] = useState({ w: 0, h: 0 }); // the grid scroller's inner size
  const [scrollTop, setScrollTop] = useState(0);
  const gridRef = useRef(null);
  const placed = useRef(false);

  useEffect(() => {
    const el = gridRef.current;
    const measure = () => setBox({ w: el.clientWidth - PAD_X, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let doc = null;
    let gone = false;
    loadDocument(file, { skipPassword: true })
      .then((loaded) => {
        doc = loaded;
        if (gone) return loaded.destroy();
        setPdf(loaded);
        setTurns(new Array(loaded.numPages).fill(0));
        if (initialPage >= 1 && initialPage <= loaded.numPages) {
          setSelected(new Set([initialPage]));
          setRange(String(initialPage));
        }
      })
      .catch(() => !gone && setError("This file can't be opened here. It may be password protected or damaged."));
    return () => {
      gone = true;
      doc?.destroy();
    };
  }, [file, initialPage]);

  const turn = (delta) => setTurns((prev) => prev.map((t, i) => (selected.has(i + 1) ? (t + delta) % 360 : t)));
  const toggle = (n) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  const numPages = pdf?.numPages ?? 0;
  const cols = box.w > 0 ? Math.max(1, Math.floor((box.w + GAP) / (CELL_MIN + GAP))) : 3;
  const rowCount = Math.ceil(numPages / cols);
  const firstRow = Math.max(0, Math.floor(scrollTop / (ROW_H + GAP)) - BUFFER_ROWS);
  const lastRow = Math.min(rowCount, Math.ceil((scrollTop + box.h) / (ROW_H + GAP)) + BUFFER_ROWS);
  const visible = [];
  for (let n = firstRow * cols + 1; n <= Math.min(numPages, lastRow * cols); n++) visible.push(n);

  const scrollToPage = (n) => {
    if (gridRef.current) gridRef.current.scrollTop = Math.floor((n - 1) / cols) * (ROW_H + GAP);
  };
  // Once the page count and the width are known, show the page being read.
  useEffect(() => {
    if (placed.current || !pdf || box.w <= 0) return;
    placed.current = true;
    if (initialPage >= 1 && initialPage <= numPages) scrollToPage(initialPage);
  });
  const onRange = (text) => {
    const { pages, bad: unreadable } = parsePageRange(text, numPages);
    setRange(text);
    setBad(unreadable);
    setSelected(new Set(pages));
    if (pages.length) scrollToPage(pages[0]);
  };
  const changed = turns.some((t) => t !== 0);
  const noneSelected = selected.size === 0;

  async function save(replace) {
    setBusy(true);
    try {
      await onSave(turns, replace);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={busy ? undefined : onClose} />
      <ChamferFrame className={`modal-dialog move-picker${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-label={`Rotate ${name}`}>
      <div className="move-picker-head">
        <button className="icon-btn" aria-label="Back" onClick={onClose} disabled={busy}>
          <IconChevronLeft size={18} />
        </button>
        <div className="move-picker-title">Rotate "{name}"</div>
      </div>

      <div className="rotate-tools">
        <button className="cb-btn" onClick={() => turn(270)} disabled={noneSelected || busy}>
          <IconRotate size={14} /> Left
        </button>
        <button className="cb-btn" onClick={() => turn(90)} disabled={noneSelected || busy}>
          <IconRotateClockwise size={14} /> Right
        </button>
        <button className="cb-btn" onClick={() => turn(180)} disabled={noneSelected || busy}>
          180°
        </button>
        <span className="rotate-tools-gap" />
        <button className="cb-btn" onClick={() => setSelected(new Set(Array.from({ length: numPages }, (_, i) => i + 1)))} disabled={busy}>
          <IconChecks size={14} /> All
        </button>
        <button className="cb-btn" onClick={() => setSelected(new Set())} disabled={busy}>
          <IconSquareOff size={14} /> None
        </button>
      </div>
      <div className="rotate-find">
        <input
          className="rename-input rotate-range"
          aria-label="Pages to select"
          placeholder="Pages: 5, 12-20, 300"
          value={range}
          onChange={(e) => onRange(e.target.value)}
          disabled={!pdf || busy}
        />
      </div>
      <div className="move-picker-crumbs">
        {pdf ? `${selected.size} of ${numPages} pages selected` : error ?? "Loading pages…"}
        {bad.length > 0 && ` · can't use: ${bad.join(", ")}`}
      </div>

      <div className="rotate-grid" ref={gridRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        {pdf && (
          <div
            className="rotate-rows"
            style={{
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              paddingTop: firstRow * (ROW_H + GAP),
              paddingBottom: Math.max(0, rowCount - lastRow) * (ROW_H + GAP),
            }}
          >
            {visible.map((n) => (
              <PageThumb key={n} pdf={pdf} pageNumber={n} rotation={turns[n - 1] ?? 0} checked={selected.has(n)} onToggle={toggle} />
            ))}
          </div>
        )}
      </div>

      <div className="move-picker-foot rotate-foot">
        <span className="move-picker-hint">
          {changed ? "Replace overwrites the original and can't be undone." : "Rotate pages, then save."}
        </span>
        <button className="cb-btn" onClick={onClose} disabled={busy}>
          <IconX size={14} /> Cancel
        </button>
        <button className="cb-btn" onClick={() => save(true)} disabled={!changed || busy}>
          Replace original
        </button>
        <button className="cb-btn update-dialog-now" onClick={() => save(false)} disabled={!changed || busy}>
          {busy ? "Saving…" : "Save as new file"}
        </button>
      </div>
      </ChamferFrame>
    </>
  );
}
