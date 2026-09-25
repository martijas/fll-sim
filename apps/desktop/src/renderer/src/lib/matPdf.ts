// The official mat print file is a PDF: render its first page to an image (about 2 px per mm of
// mat) and trim the white margin around the artwork, so it can be used like a mat image.

import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** PNG bytes of the PDF's first page, trimmed, with its size; `aspect` = width / height. */
export async function matPdfToPng(data: Uint8Array, targetWidthPx = 4800): Promise<{ png: Uint8Array; width: number; height: number; aspect: number }> {
  const task = pdfjs.getDocument({ data: data.slice(0) });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const v1 = page.getViewport({ scale: 1 });
    // landscape: the mat is wider than tall
    const rotation = v1.width < v1.height ? 90 : 0;
    const base = page.getViewport({ scale: 1, rotation });
    const viewport = page.getViewport({ scale: Math.min(targetWidthPx / base.width, 12), rotation });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const box = contentBox(ctx.getImageData(0, 0, canvas.width, canvas.height));
    const out = document.createElement("canvas");
    out.width = box.w;
    out.height = box.h;
    out.getContext("2d")!.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    const blob = await new Promise<Blob>((r) => out.toBlob((b) => r(b!), "image/png"));
    return { png: new Uint8Array(await blob.arrayBuffer()), width: box.w, height: box.h, aspect: box.w / box.h };
  } finally {
    await task.destroy();
  }
}

/** The smallest box holding everything that isn't (near-)white paper. */
function contentBox(img: ImageData) {
  const { width: w, height: h, data } = img;
  const ink = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235;
  };
  // a row/column counts as artwork if more than 0.5 % of it is ink (ignores crop marks and specks)
  const rowInk = (y: number) => { let n = 0; for (let x = 0; x < w; x += 2) if (ink(x, y)) n++; return n > w / 400; };
  const colInk = (x: number) => { let n = 0; for (let y = 0; y < h; y += 2) if (ink(x, y)) n++; return n > h / 400; };
  let top = 0, bottom = h - 1, left = 0, right = w - 1;
  while (top < bottom && !rowInk(top)) top++;
  while (bottom > top && !rowInk(bottom)) bottom--;
  while (left < right && !colInk(left)) left++;
  while (right > left && !colInk(right)) right--;
  if (right - left < w / 4 || bottom - top < h / 4) return { x: 0, y: 0, w, h }; // nothing sensible: keep the page
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}
