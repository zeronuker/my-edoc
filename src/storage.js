// Asks the browser to exempt this origin's storage from automatic
// eviction (Safari otherwise may clear untouched site data after ~7
// days) and to raise the storage ceiling. Safari/Chrome grant this
// silently based on heuristics like "installed to the home screen" —
// there's no prompt, and nothing to react to beyond calling it.
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

// { usage, quota } in bytes, or null if the browser can't report it.
export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}
