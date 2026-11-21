import { ScrollMode, SpreadMode } from "pdfjs-dist/web/pdf_viewer.mjs";

// How each of the app's view modes maps onto pdf.js's scroll and spread
// modes, and the zoom limits. Kept apart from PdfViewer.jsx so that file only
// exports a component.
export const SCROLL_MODE_BY_VIEW = {
  single: ScrollMode.PAGE,
  continuous: ScrollMode.VERTICAL,
  "two-up": ScrollMode.PAGE,
  "two-up-continuous": ScrollMode.VERTICAL,
};
export const SPREAD_MODE_BY_VIEW = {
  single: SpreadMode.NONE,
  continuous: SpreadMode.NONE,
  "two-up": SpreadMode.ODD,
  "two-up-continuous": SpreadMode.ODD,
};

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 5;
