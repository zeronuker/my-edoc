import { test } from "node:test";
import assert from "node:assert/strict";
import { FileAssembler, encodeCode, decodeCode, checkPath } from "./transfer.js";

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

test("a code survives the round trip, including pasted line breaks", async () => {
  const desc = { type: "offer", sdp: "v=0\r\n" + "a=candidate:1 1 udp 2113937151 abcd.local 54321 typ host\r\n".repeat(20) };
  const code = await encodeCode(desc);
  assert.ok(code.length < JSON.stringify(desc).length);
  const pasted = code.replace(/(.{40})/g, "$1\n  ");
  assert.deepEqual(await decodeCode(pasted), desc);
});
