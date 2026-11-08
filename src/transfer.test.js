import { test } from "node:test";
import assert from "node:assert/strict";
import { FileAssembler, withPath, checkPath, makeCode, cleanCode, openLink, CODE_LENGTH } from "./transfer.js";

const bytes = (...n) => new Uint8Array(n).buffer;
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function fakeConn() {
  const handlers = {};
  const sent = [];
  return {
    sent,
    bufferSize: 0,
    on: (e, f) => (handlers[e] = f),
    once: (e, f) => (handlers[`once:${e}`] = f),
    send: (m) => sent.push(m),
    emit: (e, d) => handlers[e](d),
  };
}

// What a sender announces before the bytes: a header, then the list in pieces.
function announce(conn, files) {
  conn.emit("data", JSON.stringify({ t: "manifest", kind: "folder", count: files.length }));
  conn.emit("data", JSON.stringify({ t: "files", files }));
}

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

test("withPath copies a file under a folder path without changing its bytes", async () => {
  const file = new File([new Uint8Array([1, 2, 3])], "a.pdf", { type: "application/pdf" });
  const copy = withPath(file, "Received/a.pdf");
  assert.equal(copy.name, "a.pdf");
  assert.equal(copy.webkitRelativePath, "Received/a.pdf");
  assert.deepEqual([...new Uint8Array(await copy.arrayBuffer())], [1, 2, 3]);
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

test("a received folder is saved file by file, and only confirmed once all are saved", async () => {
  const conn = fakeConn();
  const saved = [];
  const store = {
    save: async (file) => {
      saved.push(file.name);
      return withPath(file, file.webkitRelativePath, `saved-${file.name}`);
    },
  };
  let received = null;
  openLink(conn, { onReceived: (r) => (received = r), beginReceive: () => store });
  announce(conn, [{ path: "F/a.pdf", size: 3 }, { path: "F/b.pdf", size: 2 }]);
  conn.emit("data", bytes(1, 2, 3, 4, 5));
  assert.equal(conn.sent.length, 0); // nothing confirmed before the saves finish
  await tick();
  assert.deepEqual(saved, ["a.pdf", "b.pdf"]);
  assert.deepEqual(conn.sent.map((m) => JSON.parse(m).t), ["ok"]);
  assert.deepEqual(received.files.map((f) => f.name), ["saved-a.pdf", "saved-b.pdf"]);
  assert.equal(received.store, store);
});

test("if saving fails the sender is told, the partial save is discarded, and nothing is added", async () => {
  const conn = fakeConn();
  let discarded = false;
  let n = 0;
  const store = {
    save: async (file) => {
      if (++n === 2) throw new Error("Out of space");
      return file;
    },
    discard: async () => (discarded = true),
  };
  let received = null;
  let error = null;
  openLink(conn, { onReceived: (r) => (received = r), onError: (e) => (error = e), beginReceive: () => store });
  announce(conn, [{ path: "F/a.pdf", size: 1 }, { path: "F/b.pdf", size: 1 }]);
  conn.emit("data", bytes(1, 2));
  await tick();
  assert.deepEqual(JSON.parse(conn.sent[0]), { t: "fail", message: "Out of space" });
  assert.equal(discarded, true);
  assert.equal(received, null);
  assert.equal(error.message, "Out of space");
});

test("without a store, files are kept in memory as before", async () => {
  const conn = fakeConn();
  let received = null;
  openLink(conn, { onReceived: (r) => (received = r) });
  announce(conn, [{ path: "F/a.pdf", size: 2 }]);
  conn.emit("data", bytes(1, 2));
  await tick();
  assert.equal(received.files[0].webkitRelativePath, "F/a.pdf");
  assert.equal(JSON.parse(conn.sent[0]).t, "ok");
});

test("a send fails with the receiver's reason when it could not save", async () => {
  const conn = fakeConn();
  const link = openLink(conn, { onReceived() {} });
  const sending = link.send([{ file: new File([new Uint8Array([1, 2, 3])], "a.pdf"), path: "F/a.pdf" }], "folder");
  await tick(20); // all chunks are out; now waiting on the receiver
  conn.emit("data", JSON.stringify({ t: "fail", message: "Out of space" }));
  await assert.rejects(sending, /Out of space/);
});

test("a list of thousands of files goes in small messages and arrives whole", async () => {
  const names = [...Array(3000)].map((_, i) => `Company Manuals/Section ${i % 40}/A fairly long document title number ${i}.pdf`);
  const entries = names.map((path) => ({ file: new File([new Uint8Array([7])], "x.pdf"), path }));
  const a = fakeConn();
  const b = fakeConn();
  let received = null;
  openLink(b, { onReceived: (r) => (received = r) });
  const sending = openLink(a, { onReceived() {} }).send(entries, "folder");
  await tick(200);
  const strings = a.sent.filter((m) => typeof m === "string");
  assert.ok(strings.length > 10);
  assert.ok(strings.every((m) => new TextEncoder().encode(m).length < 16 * 1024), "every message is small");
  for (const m of a.sent) b.emit("data", m);
  await tick();
  assert.equal(received.files.length, 3000);
  assert.deepEqual(received.files.map((f) => f.webkitRelativePath), names);
  a.emit("data", b.sent[0]); // the receiver's "ok"
  await sending;
});

test("files the sender couldn't read are announced and handed to onReceived", async () => {
  const conn = fakeConn();
  let received = null;
  openLink(conn, { onReceived: (r) => (received = r) });
  conn.emit("data", JSON.stringify({ t: "manifest", kind: "folder", count: 1 }));
  conn.emit("data", JSON.stringify({ t: "skipped", names: ["F/long1.pdf", "F/long2.pdf"] }));
  conn.emit("data", JSON.stringify({ t: "skipped", names: ["F/long3.pdf"] }));
  conn.emit("data", JSON.stringify({ t: "files", files: [{ path: "F/a.pdf", size: 1 }] }));
  conn.emit("data", bytes(1));
  await tick();
  assert.deepEqual(received.skipped, ["F/long1.pdf", "F/long2.pdf", "F/long3.pdf"]);
});

test("a sender with nothing skipped gives an empty skipped list", async () => {
  const conn = fakeConn();
  let received = null;
  openLink(conn, { onReceived: (r) => (received = r) });
  announce(conn, [{ path: "F/a.pdf", size: 1 }]);
  conn.emit("data", bytes(1));
  await tick();
  assert.deepEqual(received.skipped, []);
});
