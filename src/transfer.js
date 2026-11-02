import Peer from "peerjs";

// PC ↔ iPad/phone over the local wifi. One device shows a short code, the
// other types or scans it; PeerJS's public broker only passes the connection
// details between them. The PDFs themselves go straight across the wifi, and
// with no STUN/TURN servers configured only same-network routes are tried.

const CHUNK = 16 * 1024; // the size every browser's data channel accepts
const READ_BLOCK = 256 * 1024;
const MAX_QUEUED = 64; // chunks PeerJS may hold before sending pauses
const PEER_OPTIONS = { config: { iceServers: [] } };
const ID_PREFIX = "edoc-";
// No 0/O/1/I/L: the code gets read off one screen and typed on another.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

export function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

// Typed or scanned text → the canonical code, or null if it can't be one.
export function cleanCode(text) {
  const code = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === CODE_LENGTH ? code : null;
}

// ---- Receiving side's file reassembly ----

// Throws on anything that could land outside the folder being received.
export function checkPath(path) {
  const parts = path.split("/");
  if (parts.some((p) => p === "" || p === "." || p === ".." || p.includes("\\"))) {
    throw new Error(`Bad file path: ${path}`);
  }
}

// A copy of `file` that reports `path` as its place inside a picked folder,
// which is what buildTreeFromFileList reads. Copies the reference, not the bytes.
export function withPath(file, path, name = file.name) {
  const copy = new File([file], name, { type: file.type });
  Object.defineProperty(copy, "webkitRelativePath", { value: path });
  return copy;
}

// Files arrive back to back as raw chunks, in manifest order; a chunk can end
// one file and start the next, so the manifest sizes are what split them.
export class FileAssembler {
  constructor(manifest) {
    for (const f of manifest.files) {
      checkPath(f.path);
      if (!Number.isInteger(f.size) || f.size <= 0) throw new Error(`Bad file size for ${f.path}`);
    }
    this.files = manifest.files;
    this.index = 0;
    this.got = 0;
    this.parts = [];
  }

  get done() {
    return this.index >= this.files.length;
  }

  // Returns the files this chunk completed, as File objects. webkitRelativePath
  // is set so buildTreeFromFileList treats them like a picked folder.
  push(chunk) {
    const out = [];
    let offset = 0;
    while (offset < chunk.byteLength && !this.done) {
      const cur = this.files[this.index];
      const take = Math.min(chunk.byteLength - offset, cur.size - this.got);
      this.parts.push(chunk.slice(offset, offset + take));
      this.got += take;
      offset += take;
      if (this.got === cur.size) {
        const file = new File(this.parts, cur.path.split("/").pop(), { type: "application/pdf" });
        out.push(withPath(file, cur.path));
        this.index++;
        this.got = 0;
        this.parts = [];
      }
    }
    return out;
  }
}

// ---- Pairing ----

// Shows up as `code` for the other device to join. onConnection fires once
// with the first device to connect; any later one is turned away.
export function hostSession(code, onConnection, onError) {
  const peer = new Peer(ID_PREFIX + code, PEER_OPTIONS);
  let taken = false;
  peer.on("connection", (conn) => {
    if (taken) return conn.close();
    taken = true;
    conn.on("open", () => onConnection(conn));
  });
  peer.on("error", onError);
  return peer;
}

export function joinSession(code, onConnection, onError) {
  const peer = new Peer(PEER_OPTIONS);
  peer.on("open", () => {
    const conn = peer.connect(ID_PREFIX + code, { serialization: "raw", reliable: true });
    conn.on("open", () => onConnection(conn));
    conn.on("error", onError);
  });
  peer.on("error", onError);
  return peer;
}

// ---- The open link, both directions ----

// Wraps a connected `conn`. onReceived({ kind, files, store }) fires per
// completed incoming transfer (kind is "folder" or "files"), onReceiveProgress
// (done, total) while it arrives. Returns { send } for outgoing transfers.
//
// beginReceive(kind) may return a store { save(file) → file, discard() }:
// each file is then handed to save() the moment it is complete and only what
// save() returns is kept, so a big folder never sits in memory all at once.
// The "ok" goes back only after every file is saved; if saving fails the
// sender is told instead (and discard() cleans up).
export function openLink(conn, { onReceived, onReceiveProgress, onError, beginReceive }) {
  let assembler = null;
  let kind = "";
  let total = 0;
  let got = 0;
  let files = [];
  let store = null;
  let saving = Promise.resolve();
  let saveError = null;
  let ack = null;
  let nack = null;

  function fail(err) {
    conn.send(JSON.stringify({ t: "fail", message: err.message }));
    onError?.(err);
  }

  conn.on("data", (data) => {
    try {
      if (typeof data === "string") {
        const msg = JSON.parse(data);
        if (msg.t === "ok") ack?.();
        else if (msg.t === "fail") nack?.(new Error(msg.message));
        else if (msg.t === "manifest") {
          assembler = new FileAssembler(msg);
          kind = msg.kind;
          total = msg.files.reduce((sum, f) => sum + f.size, 0);
          got = 0;
          files = [];
          store = beginReceive?.(kind) ?? null;
          saving = Promise.resolve();
          saveError = null;
        }
        return;
      }
      if (!assembler) throw new Error("Files arrived before their list");
      const done = assembler.push(data);
      if (!store) files.push(...done);
      for (const file of done) {
        if (!store) break;
        saving = saving.then(async () => {
          if (saveError) return;
          try {
            files.push(await store.save(file));
          } catch (err) {
            saveError = err;
          }
        });
      }
      got += data.byteLength;
      onReceiveProgress?.(got, total);
      if (assembler.done) {
        assembler = null;
        const finished = { kind, store, files };
        saving
          .then(async () => {
            if (saveError) {
              await finished.store?.discard();
              return fail(saveError);
            }
            conn.send(JSON.stringify({ t: "ok" }));
            onReceived({ kind: finished.kind, files: finished.files, store: finished.store });
          })
          .catch((err) => onError?.(err));
      }
    } catch (err) {
      onError?.(err);
    }
  });

  // entries: [{ file, path }], path being the relative path (folder name
  // first for a folder). Resolves when the other side confirms it has saved
  // them, or rejects if it couldn't.
  async function send(entries, sendKind, onProgress) {
    const total = entries.reduce((sum, e) => sum + e.file.size, 0);
    const acked = new Promise((resolve, reject) => {
      ack = resolve;
      nack = reject;
      conn.once("close", () => reject(new Error("Connection closed")));
    });
    conn.send(JSON.stringify({ t: "manifest", kind: sendKind, files: entries.map((e) => ({ path: e.path, size: e.file.size })) }));
    let sent = 0;
    for (const { file } of entries) {
      for (let at = 0; at < file.size; at += READ_BLOCK) {
        const block = await file.slice(at, at + READ_BLOCK).arrayBuffer();
        for (let i = 0; i < block.byteLength; i += CHUNK) {
          while (conn.bufferSize > MAX_QUEUED) await new Promise((r) => setTimeout(r, 20));
          conn.send(block.slice(i, i + CHUNK));
        }
        sent += block.byteLength;
        onProgress?.(sent, total);
      }
    }
    await acked;
  }

  return { send };
}
