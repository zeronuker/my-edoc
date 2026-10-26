import { useCallback, useEffect, useRef, useState } from "react";

// Browser fullscreen, and presentation mode on top of it: fullscreen, one
// page at a time fitted to the screen, no toolbar/sidebar (App.css hides them
// under .is-presenting). Leaving presentation puts the page view back. Where
// there is no Fullscreen API (iPhone Safari) presentation still hides the chrome.
export function usePresentation({ pdfViewer, viewMode, setViewMode, setAnnotationTool }) {
  const fullscreenSupported = typeof document.documentElement.requestFullscreen === "function";
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [presenting, setPresenting] = useState(false);
  const presentingRef = useRef(false);
  const savedViewMode = useRef(null);

  const stopPresentation = useCallback(() => {
    if (!presentingRef.current) return;
    presentingRef.current = false;
    setPresenting(false);
    setViewMode(savedViewMode.current);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [setViewMode]);

  function startPresentation() {
    if (presentingRef.current) return;
    presentingRef.current = true;
    savedViewMode.current = viewMode;
    setAnnotationTool(null);
    setViewMode("single");
    setPresenting(true);
    // Fails quietly when refused; the page still goes chrome-free.
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  // Esc (or the browser's own exit) leaves fullscreen without going through
  // us — end the presentation with it.
  useEffect(() => {
    function onChange() {
      setIsFullscreen(!!document.fullscreenElement);
      if (!document.fullscreenElement) stopPresentation();
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [stopPresentation]);

  // Fit the page once single-page mode is in place (pdf.js doesn't re-fit a
  // named scale when the spread changes).
  useEffect(() => {
    if (presenting && pdfViewer) pdfViewer.currentScaleValue = "page-fit";
  }, [presenting, viewMode, pdfViewer]);

  return {
    presenting,
    isFullscreen,
    fullscreenSupported,
    startPresentation,
    stopPresentation,
    toggleFullscreen,
  };
}
