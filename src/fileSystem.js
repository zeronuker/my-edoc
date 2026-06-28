export async function pickFolder() {
  return window.showDirectoryPicker();
}

// Recursively builds a tree of folders and .pdf files only.
export async function scanDirectory(dirHandle, name = dirHandle.name) {
  const children = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === "directory") {
      const subtree = await scanDirectory(entry, entry.name);
      if (subtree.children.length > 0) children.push(subtree);
    } else if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".pdf")) {
      children.push({ name: entry.name, kind: "file", handle: entry });
    }
  }
  children.sort((a, b) => a.name.localeCompare(b.name));
  return { name, kind: "directory", handle: dirHandle, children };
}
