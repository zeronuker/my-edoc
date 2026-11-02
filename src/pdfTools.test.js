import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDict, PDFDocument, PDFName, degrees } from "@cantoo/pdf-lib";
import { appearanceMatrix, flattenAnnotations, protectPdf, rotatePages } from "./pdfTools.js";

async function threePages() {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i++) doc.addPage([200, 300]);
  doc.getPage(2).setRotation(degrees(90));
  return doc.save();
}

test("rotatePages turns only the pages given, on top of their existing turn", async () => {
  const out = await rotatePages(await threePages(), [90, 0, 270]);
  const angles = (await PDFDocument.load(out)).getPages().map((p) => p.getRotation().angle);
  assert.deepEqual(angles, [90, 0, 0]); // page 3 was 90, +270 = 360 = 0
});

test("rotatePages rejects a password-protected file instead of mangling it", async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.encrypt({ userPassword: "pw", ownerPassword: "pw" });
  await assert.rejects(rotatePages(await doc.save(), [90]));
});

// A file annotated the way the app saves one: pdf.js writes the annotations,
// with their appearances, into the saved bytes.
async function annotatedFile() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await doc.save()), verbosity: 0 }).promise;
  pdf.annotationStorage.setValue("pdfjs_internal_editor_0", {
    annotationType: 3, pageIndex: 0, rect: [40, 300, 200, 340], rotation: 0, fontSize: 14, color: [0, 0, 0], value: "Hello note", isCopy: false,
  });
  pdf.annotationStorage.setValue("pdfjs_internal_editor_1", {
    annotationType: 9, pageIndex: 0, rect: [40, 200, 200, 220], rotation: 0, color: [255, 255, 0], opacity: 0.4,
    quadPoints: [40, 220, 200, 220, 40, 200, 200, 200], outlines: [[40, 220, 200, 220, 200, 200, 40, 200]], thickness: 12,
  });
  return new Uint8Array(await pdf.saveDocument());
}

test("appearanceMatrix stretches the appearance box to fill the annotation's rect", () => {
  assert.deepEqual(appearanceMatrix([0, 0, 10, 10], null, [100, 200, 120, 240]), [2, 0, 0, 4, 100, 200]);
  // A quarter-turn Matrix swaps the box's width and height before fitting.
  const [sx, , , sy] = appearanceMatrix([0, 0, 10, 20], [0, 1, -1, 0, 0, 0], [0, 0, 40, 10]);
  assert.deepEqual([sx, sy], [2, 1]);
});

test("flattenAnnotations bakes annotations into the page and removes them", async () => {
  const before = await PDFDocument.load(await annotatedFile());
  assert.equal(before.getPage(0).node.Annots().size(), 2);
  const { bytes, count } = await flattenAnnotations(await annotatedFile());
  assert.equal(count, 2);
  const page = (await PDFDocument.load(bytes)).getPage(0);
  assert.equal(page.node.Annots(), undefined);
  assert.ok(page.node.Resources().lookup(PDFName.of("XObject"), PDFDict).keys().length >= 2);
});

test("flattenAnnotations flattens form fields, and counts nothing for a plain file", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  const field = doc.getForm().createTextField("name");
  field.setText("Ada");
  field.addToPage(page, { x: 20, y: 100, width: 120, height: 24 });
  const flat = await flattenAnnotations(await doc.save());
  assert.equal(flat.count, 1);
  assert.equal((await PDFDocument.load(flat.bytes)).getForm().getFields().length, 0);

  const plain = await PDFDocument.create();
  plain.addPage();
  assert.equal((await flattenAnnotations(await plain.save())).count, 0);
});

test("protectPdf makes a file that only opens with the password", async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const plain = await PDFDocument.create();
  plain.addPage([200, 200]);
  plain.addPage([200, 200]);
  const locked = new Uint8Array(await protectPdf(await plain.save(), "s3cret"));

  await assert.rejects(pdfjs.getDocument({ data: locked.slice(), verbosity: 0 }).promise, { name: "PasswordException" });
  const wrong = pdfjs.getDocument({ data: locked.slice(), password: "nope", verbosity: 0 }).promise;
  await assert.rejects(wrong, { name: "PasswordException" });
  const opened = await pdfjs.getDocument({ data: locked.slice(), password: "s3cret", verbosity: 0 }).promise;
  assert.equal(opened.numPages, 2);
  // pdf-lib agrees, and a protected file is not protected a second time.
  assert.equal((await PDFDocument.load(locked, { password: "s3cret" })).getPageCount(), 2);
  await assert.rejects(protectPdf(locked, "another"));
});
