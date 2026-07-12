/*
 * GetSome - extension popup controller
 *
 * Connects stable user commands to page extraction, downloads, clipboard
 * output, content picking, and progress or error status.
 */

const buttons = [...document.querySelectorAll("button")];
const selectionStatus = document.querySelector("#selection-status");
const clearSelectionButton = document.querySelector("#clear-selection");
const message = document.querySelector("#message");

let activeTabId = null;
let busy = false;
let pageAvailable = false;
let selectionIsManual = false;

/** Injects the page helper only after the user opens the extension. */
async function ensurePageHelper() {
  await chrome.scripting.executeScript({
    target: { tabId: activeTabId },
    files: ["capture-core.js", "semantic-html.js", "content.js"],
  });
}

async function sendToPage(type, extra = {}) {
  await ensurePageHelper();
  const response = await chrome.tabs.sendMessage(activeTabId, { type, ...extra });
  if (response?.__getSomeError) throw new Error(response.__getSomeError);
  return response;
}

/** Keeps all command availability synchronized with page and job state. */
function applyButtonStates() {
  for (const button of buttons) button.disabled = busy || !pageAvailable;
  clearSelectionButton.disabled = busy || !pageAvailable || !selectionIsManual;
}

function setBusy(nextBusy, text = "") {
  busy = nextBusy;
  applyButtonStates();
  message.classList.remove("error");
  message.textContent = text;
}

function showError(error) {
  const text = error instanceof Error ? error.message : String(error);
  busy = false;
  applyButtonStates();
  message.classList.add("error");
  message.textContent = text;
}

async function refreshStatus() {
  const status = await sendToPage("GET_STATUS");
  selectionIsManual = status.selected;
  applyButtonStates();
  selectionStatus.textContent = status.selected
    ? `Source: ${status.description}`
    : `Source: automatic likely main region (${status.description})`;
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Chrome did not grant clipboard access.");
  }
}

async function copyAllText() {
  setBusy(true, "Collecting text…");
  const result = await sendToPage("EXTRACT_TEXT");
  if (!result?.text) throw new Error("No visible text was found in the selected content.");
  await writeClipboard(result.text);
  setBusy(false, result.partial
    ? `Copied the available text; ${result.missingCount} virtual turns did not render after retries.`
    : `Copied ${result.text.length.toLocaleString()} characters.`);
}

/** Requests a complete Markdown transcript and hands it to the downloader. */
async function downloadMarkdown() {
  setBusy(true, "Building Markdown…");
  const result = await chrome.runtime.sendMessage({
    type: "DOWNLOAD_MARKDOWN",
    tabId: activeTabId,
  });
  if (!result?.ok) throw new Error(result?.error || "The Markdown file could not be created.");
  setBusy(false, result.partial
    ? `Download started; ${result.missingCount} virtual turns did not render after retries.`
    : "Download started.");
}

/** Requests a semantic conversation archive and hands it to the downloader. */
async function downloadHtml() {
  setBusy(true, "Building semantic HTML…");
  const result = await chrome.runtime.sendMessage({
    type: "DOWNLOAD_HTML",
    tabId: activeTabId,
  });
  if (!result?.ok) throw new Error(result?.error || "The HTML file could not be created.");
  setBusy(false, result.partial
    ? `Download started; ${result.missingCount} virtual turns did not render after retries.`
    : "Download started.");
}

/** Starts one PDF mode and reports partial-capture recovery to the user. */
async function startExport(mode) {
  setBusy(true, mode === "searchable" ? "Preparing clean PDF…" : "Capturing the page…");
  const result = await chrome.runtime.sendMessage({
    type: "EXPORT_PDF",
    tabId: activeTabId,
    mode,
  });
  if (!result?.ok) throw new Error(result?.error || "The PDF could not be created.");
  setBusy(false, result.partial
    ? `Partial PDF download started. ${result.partialReason}`
    : "Download started.");
}

document.querySelector("#pick-content").addEventListener("click", async () => {
  try {
    await sendToPage("START_PICKER");
    window.close();
  } catch (error) {
    showError(error);
  }
});

document.querySelector("#clear-selection").addEventListener("click", async () => {
  try {
    await sendToPage("CLEAR_SELECTION");
    await refreshStatus();
  } catch (error) {
    showError(error);
  }
});

document.querySelector("#copy-text").addEventListener("click", () => {
  copyAllText().catch(showError);
});

document.querySelector("#download-markdown").addEventListener("click", () => {
  downloadMarkdown().catch(showError);
});

document.querySelector("#download-html").addEventListener("click", () => {
  downloadHtml().catch(showError);
});

document.querySelector("#searchable-pdf").addEventListener("click", () => {
  startExport("searchable").catch(showError);
});

document.querySelector("#scrolling-pdf").addEventListener("click", () => {
  startExport("scrolling").catch(showError);
});

(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.match(/^(https?|file):/)) {
      throw new Error("Chrome does not allow page capture on this tab.");
    }
    activeTabId = tab.id;
    pageAvailable = true;
    await refreshStatus();
  } catch (error) {
    showError(error);
  }
})();
