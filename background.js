/*
 * GetSome - extension service worker
 *
 * Coordinates reversible page preparation, Chrome DevTools Protocol capture,
 * screenshot capture, and a user-controlled Save As download.
 */

const activeJobs = new Set();
let creatingOffscreenDocument = null;

function friendlyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/another debugger|already attached|cannot attach|attach to this target/i.test(message)) {
    return "Close DevTools for this tab, then try again. Chrome allows only one debugger attachment at a time.";
  }
  return message;
}

async function setBadge(tabId, text) {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#1473e6" });
    await chrome.action.setBadgeText({ tabId, text });
  } catch {
    // The tab may have closed during capture.
  }
}

async function withTimeout(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function ensurePageHelper(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

async function sendToPage(tabId, type, extra = {}) {
  const response = await chrome.tabs.sendMessage(tabId, { type, ...extra });
  if (response?.__getSomeError) throw new Error(response.__getSomeError);
  return response;
}

function suggestedFilename(title, mode) {
  const cleanTitle = (title || "page")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 110) || "page";
  return `${cleanTitle} - ${mode === "scrolling" ? "scrolling" : "clean"}.pdf`;
}

async function ensureOffscreenDocument() {
  const url = chrome.runtime.getURL("offscreen.html");
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [url],
  });
  if (contexts.length) return;
  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["BLOBS"],
      justification: "Create a temporary Blob URL for the generated PDF Save As dialog.",
    }).finally(() => {
      creatingOffscreenDocument = null;
    });
  }
  await creatingOffscreenDocument;
}

async function savePdf(pdf, filename) {
  await ensureOffscreenDocument();
  const payload = pdf.kind === "segments" ? { segments: pdf.segments } : { base64: pdf.base64 };
  const response = await withTimeout(
    chrome.runtime.sendMessage({
      target: "offscreen",
      type: "MAKE_PDF_URL",
      ...payload,
    }),
    120_000,
    "PDF assembly did not finish within two minutes.",
  );
  if (!response?.ok) throw new Error(response?.error || "Could not prepare the PDF download.");
  await chrome.downloads.download({
    url: response.url,
    filename,
    saveAs: true,
    conflictAction: "uniquify",
  });
}

async function attachDebugger(tabId) {
  const target = { tabId };
  try {
    await chrome.debugger.attach(target, "1.3");
    await chrome.debugger.sendCommand(target, "Page.enable");
    return target;
  } catch (error) {
    throw new Error(friendlyError(error));
  }
}

async function createSearchablePdf(target) {
  await chrome.debugger.sendCommand(target, "Emulation.setEmulatedMedia", { media: "screen" });
  const result = await chrome.debugger.sendCommand(target, "Page.printToPDF", {
    displayHeaderFooter: false,
    landscape: false,
    marginBottom: 0.35,
    marginLeft: 0.35,
    marginRight: 0.35,
    marginTop: 0.35,
    paperHeight: 11,
    paperWidth: 8.5,
    preferCSSPageSize: false,
    printBackground: true,
    scale: 1,
    transferMode: "ReturnAsBase64",
  });
  if (!result?.data) throw new Error("Chrome returned an empty PDF.");
  return { kind: "base64", base64: result.data };
}

function normalizedClip(clip) {
  if (![clip.x, clip.y, clip.width, clip.height].every(Number.isFinite) || clip.width <= 0 || clip.height <= 0) {
    throw new Error("The page returned invalid capture geometry.");
  }
  return {
    x: Math.max(0, Math.floor(clip.x)),
    y: Math.max(0, Math.floor(clip.y)),
    width: Math.max(1, Math.ceil(clip.width)),
    height: Math.max(1, Math.ceil(clip.height)),
    scale: 1,
  };
}

async function createScrollingPdf(tabId, target, initialPlan) {
  const segments = [];
  let coverage = 0;
  let totalHeight = initialPlan.contentHeight;
  let growthEvents = 0;
  const startedAt = Date.now();

  while (coverage < totalHeight) {
    if (Date.now() - startedAt > 180_000) {
      throw new Error("Scrolling capture exceeded three minutes. Pick a smaller content region and try again.");
    }
    if (segments.length >= 240 || coverage >= 250_000) {
      throw new Error("The capture is too long. Pick a smaller content region and try again.");
    }

    const position = await sendToPage(tabId, "SET_CAPTURE_POSITION", { coverage });
    if (!Number.isFinite(position.contentHeight) || position.contentHeight <= 0) {
      throw new Error("The page returned an invalid content height.");
    }
    if (position.contentHeight > totalHeight + 4) {
      growthEvents += 1;
      totalHeight = position.contentHeight;
      if (growthEvents > 16) {
        throw new Error("The page keeps adding content while scrolling. Pick a finite content region and try again.");
      }
    }
    const advance = position.clip.height;
    if (!Number.isFinite(advance) || advance < 1 || coverage + advance <= coverage) {
      throw new Error("Scrolling capture stopped making progress.");
    }
    const clip = normalizedClip(position.clip);
    const result = await withTimeout(
      chrome.debugger.sendCommand(target, "Page.captureScreenshot", {
        format: "jpeg",
        quality: 90,
        fromSurface: true,
        captureBeyondViewport: true,
        clip,
      }),
      20_000,
      "Chrome did not return a screenshot segment within 20 seconds.",
    );
    if (!result?.data) throw new Error("Chrome returned an empty screenshot segment.");
    segments.push({
      base64: result.data,
      cssWidth: clip.width,
      cssHeight: clip.height,
    });
    coverage += advance;
    await setBadge(tabId, `${Math.min(99, Math.floor((coverage / totalHeight) * 100))}%`);
  }

  console.info("[GetSome] scrolling capture complete", { segments: segments.length, height: coverage });
  return { kind: "segments", segments };
}

/** Runs one complete export while guaranteeing page and debugger cleanup. */
async function exportPdf(tabId, mode) {
  if (activeJobs.has(tabId)) throw new Error("A PDF capture is already running for this tab.");
  activeJobs.add(tabId);
  await setBadge(tabId, "PDF");

  let debuggerTarget = null;
  let pdf;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url?.match(/^(https?|file):/)) throw new Error("Chrome does not allow page capture on this tab.");
    try {
      await ensurePageHelper(tabId);
      const plan = await sendToPage(tabId, "PREPARE_EXPORT", { mode });
      debuggerTarget = await attachDebugger(tabId);
      pdf = mode === "scrolling"
        ? await createScrollingPdf(tabId, debuggerTarget, plan)
        : await createSearchablePdf(debuggerTarget);
    } finally {
      if (debuggerTarget) {
        if (mode === "searchable") {
          await chrome.debugger.sendCommand(debuggerTarget, "Emulation.setEmulatedMedia", { media: "" }).catch(() => {});
        }
        await chrome.debugger.detach(debuggerTarget).catch(() => {});
        debuggerTarget = null;
      }
      await sendToPage(tabId, "RESTORE_EXPORT").catch(() => {});
    }
    await setBadge(tabId, "SAVE");
    await savePdf(pdf, suggestedFilename(tab.title, mode));
  } finally {
    if (debuggerTarget) await chrome.debugger.detach(debuggerTarget).catch(() => {});
    await sendToPage(tabId, "RESTORE_EXPORT").catch(() => {});
    await setBadge(tabId, "");
    activeJobs.delete(tabId);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "EXPORT_PDF") return false;
  exportPdf(message.tabId, message.mode)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.error("[GetSome] export failed", error);
      sendResponse({ ok: false, error: friendlyError(error) });
    });
  return true;
});
