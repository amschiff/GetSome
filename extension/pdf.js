/*
 * GetSome - image PDF writer
 *
 * Builds a compact PDF whose pages are JPEG screenshot segments. The writer is
 * intentionally narrow: Chrome supplies the JPEG encoding; this module wraps it.
 */

const textEncoder = new TextEncoder();

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function bytesToBase64(bytes) {
  const chunkSize = 0x6000;
  let base64 = "";
  for (let start = 0; start < bytes.length; start += chunkSize) {
    const chunk = bytes.subarray(start, Math.min(bytes.length, start + chunkSize));
    let binary = "";
    for (let index = 0; index < chunk.length; index += 1) binary += String.fromCharCode(chunk[index]);
    base64 += btoa(binary);
  }
  return base64;
}

/** Reads dimensions from a baseline or progressive JPEG marker stream. */
export function jpegDimensions(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Chrome returned an invalid JPEG segment.");
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 1 >= bytes.length) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;
    if (startOfFrameMarkers.has(marker)) {
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }
    offset += length;
  }
  throw new Error("The JPEG segment has no readable dimensions.");
}

function concatBytes(chunks, totalLength) {
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/** Wraps JPEG page images in a valid PDF 1.4 container. */
export function buildImagePdf(segments) {
  if (!segments.length) throw new Error("No screenshot segments were captured.");

  const images = segments.map((segment) => {
    const bytes = base64ToBytes(segment.base64);
    return { ...segment, bytes, pixels: jpegDimensions(bytes) };
  });
  const objectCount = 2 + images.length * 3;
  const offsets = new Array(objectCount + 1).fill(0);
  const chunks = [];
  let totalLength = 0;

  function pushBytes(bytes) {
    chunks.push(bytes);
    totalLength += bytes.length;
  }

  function pushText(text) {
    pushBytes(textEncoder.encode(text));
  }

  function beginObject(id) {
    offsets[id] = totalLength;
    pushText(`${id} 0 obj\n`);
  }

  function endObject() {
    pushText("endobj\n");
  }

  pushBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  beginObject(1);
  pushText("<< /Type /Catalog /Pages 2 0 R >>\n");
  endObject();

  beginObject(2);
  const pageIds = images.map((_image, index) => 3 + index * 3);
  pushText(`<< /Type /Pages /Count ${images.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>\n`);
  endObject();

  images.forEach((image, index) => {
    const pageId = 3 + index * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const pageWidth = 612;
    const scale = pageWidth / Math.max(1, image.cssWidth);
    const pageHeight = Math.max(1, image.cssHeight * scale);

    beginObject(pageId);
    pushText(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(3)} ${pageHeight.toFixed(3)}] `
      + `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\n`,
    );
    endObject();

    beginObject(imageId);
    pushText(
      `<< /Type /XObject /Subtype /Image /Width ${image.pixels.width} /Height ${image.pixels.height} `
      + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
    );
    pushBytes(image.bytes);
    pushText("\nendstream\n");
    endObject();

    const drawing = `q ${pageWidth.toFixed(3)} 0 0 ${pageHeight.toFixed(3)} 0 0 cm /Im0 Do Q\n`;
    beginObject(contentId);
    pushText(`<< /Length ${textEncoder.encode(drawing).length} >>\nstream\n${drawing}endstream\n`);
    endObject();
  });

  const xrefOffset = totalLength;
  pushText(`xref\n0 ${objectCount + 1}\n`);
  pushText("0000000000 65535 f \n");
  for (let id = 1; id <= objectCount; id += 1) {
    pushText(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return concatBytes(chunks, totalLength);
}
