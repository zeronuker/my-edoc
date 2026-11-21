import { Component } from "react";

// Without this, one unexpected error while drawing removes the whole app and
// leaves a blank page. Inline styles on purpose: the stylesheet may be part
// of what went wrong.
const BOX = {
  minHeight: "100vh",
  display: "grid",
  placeContent: "center",
  gap: "12px",
  padding: "24px",
  textAlign: "center",
  color: "var(--cb-text, #e8eefc)",
  background: "var(--cb-surface-1, #0a1020)",
};

export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={BOX} role="alert">
        <strong>Something went wrong.</strong>
        <span>Your saved files are untouched. Annotations you hadn't saved may be lost.</span>
        <div>
          <button className="cb-btn" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
