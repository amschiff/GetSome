/*
 * GetSome - offscreen download helper
 *
 * Creates Blob URLs for generated archives and assembles screenshot segments
 * into PDFs in the document context unavailable to the service worker.
 */

import { buildImagePdf } from "./pdf.js";

const urls = new Set();

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Converts background-worker payloads into temporary downloadable Blob URLs. */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    message?.target !== "offscreen" ||
    !["MAKE_PDF_URL", "MAKE_MARKDOWN_URL", "MAKE_HTML_URL"].includes(message.type)
  ) {
    return false;
  }

  try {
    const blob = message.type === "MAKE_MARKDOWN_URL"
      ? new Blob([message.markdown], { type: "text/markdown;charset=utf-8" })
      : message.type === "MAKE_HTML_URL"
        ? new Blob([message.html], { type: "text/html;charset=utf-8" })
        : new Blob([
        Array.isArray(message.segments)
          ? buildImagePdf(message.segments)
          : base64ToBytes(message.base64),
        ], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    urls.add(url);
    setTimeout(() => {
      URL.revokeObjectURL(url);
      urls.delete(url);
    }, 15 * 60 * 1000);
    sendResponse({ ok: true, url });
  } catch (error) {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
  return true;
});
