import { test } from "node:test";
import assert from "node:assert/strict";
import { FileAssembler, checkPath, makeCode, cleanCode, CODE_LENGTH } from "./transfer.js";

const bytes = (...n) => new Uint8Array(n).buffer;

test("a chunk that spans two files is split by the manifest sizes", async () => {
  const asm = new FileAssembler({
    kind: "folder",
    files: [
      { path: "Docs/a.pdf", size: 3 },
      { path: "Docs/sub/b.pdf", size: 5 },
    ],
  });
  assert.equal(asm.push(bytes(1, 2)).length, 0);
  const done = asm.push(bytes(3, 4, 5, 6, 7)); // ends a.pdf, starts b.pdf
  assert.equal(done.length, 1);
  assert.equal(done[0].name, "a.pdf");
  assert.equal(done[0].webkitRelativePath, "Docs/a.pdf");
  assert.deepEqual([...new Uint8Array(await done[0].arrayBuffer())], [1, 2, 3]);
  assert.equal(asm.done, false);
  const last = asm.push(bytes(8));
  assert.equal(last[0].webkitRelativePath, "Docs/sub/b.pdf");
  assert.deepEqual([...new Uint8Array(await last[0].arrayBuffer())], [4, 5, 6, 7, 8]);
  assert.equal(asm.done, true);
});

test("paths that could escape the folder are refused", () => {
  for (const bad of ["../x.pdf", "a/../x.pdf", "/x.pdf", "a//x.pdf", "a\\x.pdf", "./x.pdf"]) {
    assert.throws(() => checkPath(bad), /Bad file path/, bad);
  }
  assert.doesNotThrow(() => checkPath("Docs/sub/x.pdf"));
});

test("zero or odd sizes are refused", () => {
  assert.throws(() => new FileAssembler({ files: [{ path: "a.pdf", size: 0 }] }), /Bad file size/);
  assert.throws(() => new FileAssembler({ files: [{ path: "a.pdf", size: 1.5 }] }), /Bad file size/);
});

test("made codes read back clean, and typed ones are forgiven", () => {
  const code = makeCode();
  assert.equal(code.length, CODE_LENGTH);
  assert.equal(cleanCode(code), code);
  assert.equal(cleanCode(` ${code.slice(0, 3).toLowerCase()}-${code.slice(3)} `), code);
  assert.equal(cleanCode("ABC"), null);
  assert.equal(cleanCode("ABCDEFG"), null);
});
