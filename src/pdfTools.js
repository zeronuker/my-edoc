// PDF-rewriting tools (Rotate, and the ones that follow). The library is
// imported inside each function so it is only downloaded when one is used.

// `rotations[i]` is how many degrees (0, 90, 180 or 270) to turn page i
// clockwise, on top of whatever turn it already has. Returns the new bytes.
export async function rotatePages(bytes, rotations) {
  const { PDFDocument, degrees } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.load(bytes);
  doc.getPages().forEach((page, i) => {
    const add = rotations[i] || 0;
    if (add) page.setRotation(degrees((page.getRotation().angle + add) % 360));
  });
  return doc.save();
}

// Locks the file so it only opens with `password`: AES-256, the one password
// used both to open it and as the owner password. Everything is allowed once
// it is open (printing, copying text, annotating) — the password is the only
// restriction. Rejects a file that is already protected.
export async function protectPdf(bytes, password) {
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.load(bytes);
  doc.encrypt({
    userPassword: password,
    ownerPassword: password,
    permissions: {
      printing: "highResolution",
      modifying: true,
      copying: true,
      annotating: true,
      fillingForms: true,
      contentAccessibility: true,
      documentAssembly: true,
    },
  });
  return doc.save();
}

// Where an annotation's appearance goes on the page (PDF 32000, 12.5.5): the
// appearance's box (its BBox run through its Matrix) is stretched to fill the
// annotation's Rect. Returns the [a b c d e f] to draw it with. bbox and
// rect are [x1, y1, x2, y2]; matrix is [a b c d e f] or null.
export function appearanceMatrix(bbox, matrix, rect) {
  const [a, b, c, d, e, f] = matrix ?? [1, 0, 0, 1, 0, 0];
  const corners = [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[1]],
    [bbox[0], bbox[3]],
    [bbox[2], bbox[3]],
  ];
  const xs = corners.map(([x, y]) => a * x + c * y + e);
  const ys = corners.map(([x, y]) => b * x + d * y + f);
  const [tx1, tx2] = [Math.min(...xs), Math.max(...xs)];
  const [ty1, ty2] = [Math.min(...ys), Math.max(...ys)];
  const [rx1, rx2] = [Math.min(rect[0], rect[2]), Math.max(rect[0], rect[2])];
  const [ry1, ry2] = [Math.min(rect[1], rect[3]), Math.max(rect[1], rect[3])];
  const sx = tx2 === tx1 ? 1 : (rx2 - rx1) / (tx2 - tx1);
  const sy = ty2 === ty1 ? 1 : (ry2 - ry1) / (ty2 - ty1);
  return [sx, 0, 0, sy, rx1 - tx1 * sx, ry1 - ty1 * sy];
}

// Bakes the file's annotations (highlights, drawings, text, stamps — whatever
// has an appearance) and form fields into the pages themselves, so they can
// no longer be moved, edited or removed. Links stay links. Returns the new
// bytes and how many things were flattened; count 0 means nothing to do.
export async function flattenAnnotations(bytes) {
  // Filling in a field's look can fail on a font it can't read; the file's
  // own saved look is then used as it is.
  return flattenOnce(bytes, true).catch(() => flattenOnce(bytes, false));
}

async function flattenOnce(bytes, updateFieldAppearances) {
  const {
    PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber, PDFStream,
    pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject,
  } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.load(bytes);
  let count = 0;

  const fields = doc.getForm().getFields().length;
  if (fields) {
    doc.getForm().flatten({ updateFieldAppearances });
    count += fields;
  }

  const nums = (arr) => arr.asArray().map((n) => n.asNumber());
  const ctx = doc.context;
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    const entries = [];
    for (let i = 0; i < annots.size(); i++) {
      entries.push({ ref: annots.get(i), dict: ctx.lookupMaybe(annots.get(i), PDFDict) });
    }
    const gone = new Set();
    for (const { ref, dict } of entries) {
      if (!dict) continue;
      const subtype = dict.lookupMaybe(PDFName.of("Subtype"), PDFName)?.decodeText();
      if (subtype === "Link" || subtype === "Popup" || subtype === "Widget") continue;
      const flags = dict.lookupMaybe(PDFName.of("F"), PDFNumber)?.asNumber() ?? 0;
      if (flags & (2 | 32)) {
        gone.add(ref); // hidden, or not for viewing: it was never shown
        continue;
      }
      let normal = dict.lookupMaybe(PDFName.of("AP"), PDFDict)?.get(PDFName.of("N"));
      const first = normal && ctx.lookup(normal);
      if (first instanceof PDFDict && !(first instanceof PDFStream)) {
        // A set of looks, one per state: take the one this annotation is in.
        const state = dict.lookupMaybe(PDFName.of("AS"), PDFName);
        normal = state ? first.get(state) : undefined;
      }
      const stream = normal && ctx.lookup(normal);
      const rect = dict.lookupMaybe(PDFName.of("Rect"), PDFArray);
      const box = stream instanceof PDFStream && stream.dict.lookupMaybe(PDFName.of("BBox"), PDFArray);
      if (!rect || !box) continue; // nothing to draw: leave it as it is
      const matrix = stream.dict.lookupMaybe(PDFName.of("Matrix"), PDFArray);
      const tag = page.node.newXObject("FlatAnnot", normal);
      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(...appearanceMatrix(nums(box), matrix ? nums(matrix) : null, nums(rect))),
        drawObject(tag),
        popGraphicsState()
      );
      gone.add(ref);
      count++;
    }
    // A popup window belongs to its annotation, so it goes with it.
    const keep = entries.filter(({ ref, dict }) => {
      const parent = dict?.get(PDFName.of("Parent"));
      return !gone.has(ref) && !(parent && gone.has(parent));
    });
    if (keep.length === entries.length) continue;
    if (keep.length) page.node.set(PDFName.of("Annots"), ctx.obj(keep.map((e) => e.ref)));
    else page.node.delete(PDFName.of("Annots"));
  }
  return { bytes: await doc.save(), count };
}
