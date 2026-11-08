import { test } from "node:test";
import assert from "node:assert/strict";
import { getTurns, setTurn, clearTurns, pagesToTurn } from "./pageTurns.js";

test("turns are kept per tab and a zero turn removes the page", () => {
  setTurn("a", 5, 90);
  setTurn("a", 6, 270);
  setTurn("b", 5, 180);
  assert.deepEqual([...getTurns("a")], [[5, 90], [6, 270]]);
  setTurn("a", 5, 0);
  assert.deepEqual([...getTurns("a")], [[6, 270]]);
  assert.deepEqual([...getTurns("b")], [[5, 180]]);
});

test("clearTurns forgets a tab and an unknown tab has no turns", () => {
  setTurn("c", 1, 90);
  clearTurns("c");
  assert.equal(getTurns("c").size, 0);
  assert.equal(getTurns("never").size, 0);
});

test("pagesToTurn is the current page alone, or both pages of its spread", () => {
  const page = (n) => ({ dataset: { pageNumber: String(n) } });
  const viewer = (spreadMode, current) => ({
    spreadMode,
    currentPageNumber: current,
    getPageView: () => ({ div: { parentElement: { querySelectorAll: () => [page(current), page(current + 1)] } } }),
  });
  assert.deepEqual(pagesToTurn(viewer(0, 7)), [7]);
  assert.deepEqual(pagesToTurn(viewer(1, 4)), [4, 5]);
});
