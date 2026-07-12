/*
 * GetSome - extension service worker
 *
 * Coordinates reversible page preparation, Chrome DevTools Protocol capture,
 * screenshot capture, and a user-controlled Save As download.
 */

import { nextAvailableFilename, suggestedMarkdownFilename, suggestedPdfFilename } from "./filename.js";

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
  await chrome.scripting.executeScript({ target: { tabId }, files: ["capture-core.js", "content.js"] });
}

async function sendToPage(tabId, type, extra = {}) {
  const response = await chrome.tabs.sendMessage(tabId, { type, ...extra });
  if (response?.__getSomeError) throw new Error(response.__getSomeError);
  return response;
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
      justification: "Create a temporary Blob URL for a generated file's Save As dialog.",
    }).finally(() => {
      creatingOffscreenDocument = null;
    });
  }
  await creatingOffscreenDocument;
}

async function downloadFromOffscreen(message, filename, timeoutMessage) {
  await ensureOffscreenDocument();
  const response = await withTimeout(
    chrome.runtime.sendMessage({
      target: "offscreen",
      ...message,
    }),
    120_000,
    timeoutMessage,
  );
  if (!response?.ok) throw new Error(response?.error || "Could not prepare the download.");
  const history = await chrome.downloads.search({ limit: 500, orderBy: ["-startTime"] }).catch(() => []);
  const availableFilename = nextAvailableFilename(
    filename,
    history.filter((item) => item.exists !== false).map((item) => item.filename),
  );
  await chrome.downloads.download({
    url: response.url,
    filename: availableFilename,
    saveAs: true,
    conflictAction: "uniquify",
  });
}

async function savePdf(pdf, filename) {
  const payload = pdf.kind === "segments" ? { segments: pdf.segments } : { base64: pdf.base64 };
  await downloadFromOffscreen(
    { type: "MAKE_PDF_URL", ...payload },
    filename,
    "PDF assembly did not finish within two minutes.",
  );
}

async function saveMarkdown(markdown, filename) {
  await downloadFromOffscreen(
    { type: "MAKE_MARKDOWN_URL", markdown },
    filename,
    "Markdown download preparation did not finish within two minutes.",
  );
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

async function restartDebugger(tabId, state) {
  await withTimeout(
    chrome.debugger.detach(state.target),
    5_000,
    "Chrome did not release the stalled capture connection.",
  ).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 300));
  state.target = await attachDebugger(tabId);
}

async function createSearchablePdf(tabId, debuggerState) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await chrome.debugger.sendCommand(debuggerState.target, "Emulation.setEmulatedMedia", { media: "screen" });
      const result = await withTimeout(
        chrome.debugger.sendCommand(debuggerState.target, "Page.printToPDF", {
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
        }),
        60_000,
        "Chrome did not finish the searchable PDF within one minute.",
      );
      if (!result?.data) throw new Error("Chrome returned an empty PDF.");
      return { kind: "base64", base64: result.data };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await restartDebugger(tabId, debuggerState);
    }
  }
  throw lastError;
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

async function createScrollingPdf(tabId, debuggerState, initialPlan) {
  const segments = [];
  let coverage = 0;
  let totalHeight = initialPlan.contentHeight;
  if (!Number.isFinite(totalHeight) || totalHeight <= 0) {
    throw new Error("The page returned an invalid initial content height.");
  }
  let growthEvents = 0;
  let partialReason = "";
  const startedAt = Date.now();

  while (coverage < totalHeight) {
    if (Date.now() - startedAt > 180_000) {
      partialReason = "Scrolling capture reached its three-minute recovery limit.";
      break;
    }
    if (segments.length >= 240 || coverage >= 250_000) {
      partialReason = "Scrolling capture reached its safety page limit.";
      break;
    }

    let position;
    let positionError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        position = await withTimeout(
          sendToPage(tabId, "SET_CAPTURE_POSITION", { coverage }),
          18_000,
          "The page did not finish moving to the next capture position.",
        );
        break;
      } catch (error) {
        positionError = error;
        await ensurePageHelper(tabId).catch(() => {});
      }
    }
    if (!position) {
      if (!segments.length) throw positionError;
      partialReason = positionError?.message || "The page stopped responding while scrolling.";
      break;
    }
    if (position.done) {
      if (position.incomplete || coverage + 1 < totalHeight) {
        partialReason = "The page would not expose any more scrollable content after recovery attempts.";
      }
      break;
    }
    if (!Number.isFinite(position.contentHeight) || position.contentHeight <= 0) {
      partialReason = "The page returned invalid capture geometry.";
      break;
    }
    if (position.contentHeight > totalHeight + 4) {
      growthEvents += 1;
      totalHeight = position.contentHeight;
      if (growthEvents > 32) {
        partialReason = "The page kept adding content after repeated recovery passes.";
        break;
      }
    }
    const advance = position.clip?.height;
    if (!Number.isFinite(advance) || advance < 1 || coverage + advance <= coverage) {
      partialReason = "Scrolling capture stopped making progress after recovery attempts.";
      break;
    }
    const clip = normalizedClip(position.clip);
    let result;
    let screenshotError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        result = await withTimeout(
          chrome.debugger.sendCommand(debuggerState.target, "Page.captureScreenshot", {
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
        break;
      } catch (error) {
        screenshotError = error;
        if (attempt < 2) await restartDebugger(tabId, debuggerState).catch(() => {});
      }
    }
    if (!result?.data) {
      if (!segments.length) throw screenshotError;
      partialReason = screenshotError?.message || "Chrome stopped returning screenshot segments.";
      break;
    }
    segments.push({
      base64: result.data,
      cssWidth: clip.width,
      cssHeight: clip.height,
    });
    coverage += advance;
    await setBadge(tabId, `${Math.min(99, Math.floor((coverage / totalHeight) * 100))}%`);
  }

  if (!segments.length) throw new Error(partialReason || "Chrome did not capture any PDF pages.");
  console.info("[GetSome] scrolling capture complete", {
    segments: segments.length,
    height: coverage,
    partial: Boolean(partialReason),
  });
  return { kind: "segments", segments, partial: Boolean(partialReason), partialReason };
}

/** Runs one complete export while guaranteeing page and debugger cleanup. */
async function exportPdf(tabId, mode) {
  if (activeJobs.has(tabId)) throw new Error("A PDF capture is already running for this tab.");
  activeJobs.add(tabId);
  await setBadge(tabId, "PDF");

  const debuggerState = { target: null };
  let pdf;
  let plan;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url?.match(/^(https?|file):/)) throw new Error("Chrome does not allow page capture on this tab.");
    try {
      await ensurePageHelper(tabId);
      plan = await withTimeout(
        sendToPage(tabId, "PREPARE_EXPORT", { mode }),
        210_000,
        "The page did not finish preparing its full content within three and a half minutes.",
      );
      debuggerState.target = await attachDebugger(tabId);
      pdf = mode === "scrolling"
        ? await createScrollingPdf(tabId, debuggerState, plan)
        : await createSearchablePdf(tabId, debuggerState);
      if (mode === "searchable" && plan.partial) {
        pdf.partial = true;
        pdf.partialReason = `${plan.missingCount} virtual conversation turns did not render after recovery attempts.`;
      } else if (mode === "scrolling" && plan.partial && !pdf.partial) {
        pdf.partial = true;
        pdf.partialReason = `${plan.missingCount} picked conversation turns did not render after recovery attempts.`;
      }
    } finally {
      if (debuggerState.target) {
        if (mode === "searchable") {
          await chrome.debugger.sendCommand(debuggerState.target, "Emulation.setEmulatedMedia", { media: "" }).catch(() => {});
        }
        await chrome.debugger.detach(debuggerState.target).catch(() => {});
        debuggerState.target = null;
      }
      await sendToPage(tabId, "RESTORE_EXPORT").catch(() => {});
    }
    await setBadge(tabId, "SAVE");
    await savePdf(pdf, suggestedPdfFilename(tab.title, mode, pdf.partial));
    return { partial: Boolean(pdf.partial), partialReason: pdf.partialReason || "" };
  } finally {
    if (debuggerState.target) await chrome.debugger.detach(debuggerState.target).catch(() => {});
    await sendToPage(tabId, "RESTORE_EXPORT").catch(() => {});
    await setBadge(tabId, "");
    activeJobs.delete(tabId);
  }
}

async function downloadMarkdown(tabId) {
  if (activeJobs.has(tabId)) throw new Error("A capture is already running for this tab.");
  activeJobs.add(tabId);
  await setBadge(tabId, "MD");

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url?.match(/^(https?|file):/)) throw new Error("Chrome does not allow text extraction on this tab.");
    await ensurePageHelper(tabId);
    const result = await sendToPage(tabId, "EXTRACT_MARKDOWN");
    if (!result?.markdown) throw new Error("No Markdown content was found in the selected source.");
    await setBadge(tabId, "SAVE");
    await saveMarkdown(result.markdown, suggestedMarkdownFilename(tab.title));
    return { partial: Boolean(result.partial), missingCount: result.missingCount || 0 };
  } finally {
    await setBadge(tabId, "");
    activeJobs.delete(tabId);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const operation = message?.type === "EXPORT_PDF"
    ? () => exportPdf(message.tabId, message.mode)
    : message?.type === "DOWNLOAD_MARKDOWN"
      ? () => downloadMarkdown(message.tabId)
      : null;
  if (!operation) return false;
  operation()
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => {
      console.error("[GetSome] export failed", error);
      sendResponse({ ok: false, error: friendlyError(error) });
    });
  return true;
});
