// PC → iPad/phone over the local wifi, with no server: the two devices swap
// one pasted code each (a compressed WebRTC offer, then the answer), then the
// PDFs go straight across a data channel. No STUN, so only same-network
// (host) candidates are used and nothing leaves the LAN.

const READ_BLOCK = 256 * 1024;
const CHUNK = 16 * 1024; // the size every browser's data channel accepts
const HIGH_WATER = 1024 * 1024;
const GATHER_TIMEOUT_MS = 3000;

// ---- Codes ----

function toBase64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipeBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeCode(desc) {
  const json = new TextEncoder().encode(JSON.stringify({ type: desc.type, sdp: desc.sdp }));
  return toBase64Url(await pipeBytes(json, new CompressionStream("deflate-raw")));
}

// Pasted codes pick up line breaks and spaces on the way; ignore them.
export async function decodeCode(code) {
  const bytes = fromBase64Url(code.replace(/\s+/g, ""));
  const { type, sdp } = JSON.parse(
    new TextDecoder().decode(await pipeBytes(bytes, new DecompressionStream("deflate-raw")))
  );
  return { type, sdp };
}

// ---- Receiving side's file reassembly ----

// Throws on anything that could land outside the folder being received.
export function checkPath(path) {
  const parts = path.split("/");
  if (parts.some((p) => p === "" || p === "." || p === ".." || p.includes("\\"))) {
    throw new Error(`Bad file path: ${path}`);
  }
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
        Object.defineProperty(file, "webkitRelativePath", { value: cur.path });
        out.push(file);
        this.index++;
        this.got = 0;
        this.parts = [];
      }
    }
    return out;
  }
}

// ---- WebRTC plumbing ----

function newPeer() {
  return new RTCPeerConnection({ iceServers: [] });
}

// The code has to hold every candidate, so wait for gathering to finish.
function gathered(pc) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, GATHER_TIMEOUT_MS);
    const check = () => {
      if (pc.iceGatheringState !== "complete") return;
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    pc.addEventListener("icegatheringstatechange", check);
    check();
  });
}

function waitForOpen(channel) {
  return new Promise((resolve, reject) => {
    if (channel.readyState === "open") return resolve();
    channel.addEventListener("open", resolve, { once: true });
    channel.addEventListener("close", () => reject(new Error("Connection closed")), { once: true });
  });
}

// PC side. Returns the code to show, then call acceptAnswer with the reply.
export async function createOffer() {
  const pc = newPeer();
  const channel = pc.createDataChannel("edoc");
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  return { pc, channel, code: await encodeCode(pc.localDescription) };
}

export async function acceptAnswer(pc, code) {
  await pc.setRemoteDescription(await decodeCode(code));
}

// entries: [{ file, path }] where path is the file's relative path (folder
// name first for a folder). Resolves once the other side confirms it has them.
export async function sendFiles(channel, entries, kind, onProgress) {
  await waitForOpen(channel);
  channel.bufferedAmountLowThreshold = HIGH_WATER / 4;
  const total = entries.reduce((sum, e) => sum + e.file.size, 0);
  const acked = new Promise((resolve, reject) => {
    channel.addEventListener("message", () => resolve(), { once: true });
    channel.addEventListener("close", () => reject(new Error("Connection closed")), { once: true });
  });
  channel.send(JSON.stringify({ kind, files: entries.map((e) => ({ path: e.path, size: e.file.size })) }));

  let sent = 0;
  for (const { file } of entries) {
    for (let at = 0; at < file.size; at += READ_BLOCK) {
      const block = await file.slice(at, at + READ_BLOCK).arrayBuffer();
      for (let i = 0; i < block.byteLength; i += CHUNK) {
        while (channel.bufferedAmount > HIGH_WATER) {
          await new Promise((r) => channel.addEventListener("bufferedamountlow", r, { once: true }));
        }
        channel.send(block.slice(i, i + CHUNK));
      }
      sent += block.byteLength;
      onProgress?.(sent, total);
    }
  }
  await acked;
}

// iPad side. Give it the PC's code; show the returned code to be pasted back.
export async function createAnswer(offerCode) {
  const pc = newPeer();
  await pc.setRemoteDescription(await decodeCode(offerCode));
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  return { pc, code: await encodeCode(pc.localDescription) };
}

// Resolves { kind: "folder" | "files", files: File[] } once everything has
// arrived. onProgress(receivedBytes, totalBytes) fires per chunk.
export function receiveFiles(pc, onProgress) {
  return new Promise((resolve, reject) => {
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "failed") reject(new Error("Couldn't connect to the PC"));
    });
    pc.addEventListener("datachannel", ({ channel }) => {
      channel.binaryType = "arraybuffer";
      let manifest = null;
      let assembler = null;
      let total = 0;
      let got = 0;
      const files = [];
      channel.addEventListener("close", () => {
        if (!assembler?.done) reject(new Error("Connection closed before the files arrived"));
      });
      channel.addEventListener("message", ({ data }) => {
        try {
          if (typeof data === "string") {
            manifest = JSON.parse(data);
            assembler = new FileAssembler(manifest);
            total = manifest.files.reduce((sum, f) => sum + f.size, 0);
            return;
          }
          files.push(...assembler.push(data));
          got += data.byteLength;
          onProgress?.(got, total);
          if (assembler.done) {
            channel.send("ok");
            resolve({ kind: manifest.kind, files });
          }
        } catch (err) {
          reject(err);
        }
      });
    });
  });
}
