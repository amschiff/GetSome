import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);
const extensionRoot = new URL("../extension/", import.meta.url);

test("manifest references packaged extension files", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", extensionRoot), "utf8"));
  const packageJson = JSON.parse(await readFile(new URL("package.json", repositoryRoot), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.background.type, "module");
  assert.ok(manifest.permissions.includes("debugger"));
  assert.ok(manifest.permissions.includes("downloads"));
  assert.ok(manifest.permissions.includes("clipboardWrite"));
  assert.deepEqual(manifest.action.default_icon, {
    16: "icons/page-16.png",
    32: "icons/page-32.png",
  });

  await Promise.all([
    access(new URL(manifest.background.service_worker, extensionRoot)),
    access(new URL(manifest.action.default_popup, extensionRoot)),
    access(new URL("content.js", extensionRoot)),
    access(new URL("capture-core.js", extensionRoot)),
    access(new URL("filename.js", extensionRoot)),
    access(new URL("semantic-html.js", extensionRoot)),
    access(new URL("offscreen.html", extensionRoot)),
    ...Object.values(manifest.icons).map((path) => access(new URL(path, extensionRoot))),
  ]);
});

test("comment-capable extension sources state their purpose", async () => {
  const javascript = [
    "background.js", "capture-core.js", "content.js", "filename.js",
    "offscreen.js", "pdf.js", "popup.js", "semantic-html.js",
  ];
  const stylesheets = ["popup.css"];
  const documents = ["offscreen.html", "popup.html"];
  for (const path of [...javascript, ...stylesheets]) {
    const source = await readFile(new URL(path, extensionRoot), "utf8");
    assert.match(source, /^\/\*[\s\S]*?GetSome -[\s\S]*?\*\//, `${path} needs a purpose block`);
  }
  for (const path of documents) {
    const source = await readFile(new URL(path, extensionRoot), "utf8");
    assert.match(source, /^<!doctype html>\s*<!--[\s\S]*?GetSome -[\s\S]*?-->/, `${path} needs a purpose block`);
  }
});

test("major extension functions have adjacent contract comments", async () => {
  const expected = {
    "background.js": ["ensurePageHelper", "ensureOffscreenDocument", "createSearchablePdf", "createScrollingPdf", "exportPdf", "downloadMarkdown", "downloadHtml"],
    "capture-core.js": ["mergeSnapshot", "collectVirtualized", "updateTurnSelection"],
    "content.js": ["automaticTarget", "chatProvider", "providerTurnDescriptor", "startPicker", "markClutter", "renderMarkdownNode", "turnRecord", "collectStructuredTurns", "withCleanTextSource", "extractMarkdown", "extractHtml", "prepareExport", "makeCapturePlan", "setCapturePosition", "restoreExport"],
    "pdf.js": ["jpegDimensions", "buildImagePdf"],
    "popup.js": ["ensurePageHelper", "downloadMarkdown", "downloadHtml", "startExport"],
    "semantic-html.js": ["renderMedia", "renderTurn", "buildSemanticHtml"],
  };
  for (const [path, names] of Object.entries(expected)) {
    const source = await readFile(new URL(path, extensionRoot), "utf8");
    for (const name of names) {
      const pattern = new RegExp(`\\/\\*\\*[\\s\\S]*?\\*\\/\\s*(?:export\\s+)?(?:async\\s+)?function ${name}\\b`);
      assert.match(source, pattern, `${path}:${name} needs an adjacent contract comment`);
    }
  }
});

test("popup and offscreen helper expose the intended stable controls", async () => {
  const [popup, popupScript, offscreen] = await Promise.all([
    readFile(new URL("popup.html", extensionRoot), "utf8"),
    readFile(new URL("popup.js", extensionRoot), "utf8"),
    readFile(new URL("offscreen.html", extensionRoot), "utf8"),
  ]);
  assert.match(popup, /id="clear-selection"[^>]*disabled/);
  assert.match(popup, />Clear picked content</);
  assert.match(popup, /id="copy-text"/);
  assert.match(popup, />Copy all text</);
  assert.match(popupScript, /`Source: \$\{status\.description\}`/);
  assert.doesNotMatch(popupScript, /Source: picked \$\{status\.description\}/);
  assert.match(offscreen, /<script type="module" src="offscreen\.js"><\/script>/);
});

test("Markdown transcript download is wired end to end", async () => {
  const [popup, content, background, offscreen] = await Promise.all([
    readFile(new URL("popup.html", extensionRoot), "utf8"),
    readFile(new URL("content.js", extensionRoot), "utf8"),
    readFile(new URL("background.js", extensionRoot), "utf8"),
    readFile(new URL("offscreen.js", extensionRoot), "utf8"),
  ]);
  assert.match(popup, /id="download-markdown"/);
  assert.match(popup, />Download Markdown</);
  assert.match(popup, /Shift range; Option add\/remove/);
  assert.match(content, /data-message-author-role/);
  assert.match(content, /EXTRACT_MARKDOWN/);
  assert.match(content, /collectStructuredTurns/);
  assert.match(content, /provider === "claude"/);
  assert.match(content, /provider === "gemini"/);
  assert.match(content, /provider === "grok"/);
  assert.match(content, /This is a copy of a chat between Claude and/);
  assert.match(content, /editorial\.map\(\(line\) => `> /);
  assert.match(background, /capture-core\.js/);
  assert.doesNotMatch(await readFile(new URL("popup.css", extensionRoot), "utf8"), /button:disabled\s*\{[^}]*cursor:\s*wait/s);
  assert.match(background, /DOWNLOAD_MARKDOWN/);
  assert.match(offscreen, /MAKE_MARKDOWN_URL/);
  assert.match(offscreen, /text\/markdown;charset=utf-8/);
});

test("semantic HTML archive download is wired end to end", async () => {
  const [popup, popupScript, content, background, offscreen] = await Promise.all([
    readFile(new URL("popup.html", extensionRoot), "utf8"),
    readFile(new URL("popup.js", extensionRoot), "utf8"),
    readFile(new URL("content.js", extensionRoot), "utf8"),
    readFile(new URL("background.js", extensionRoot), "utf8"),
    readFile(new URL("offscreen.js", extensionRoot), "utf8"),
  ]);
  assert.match(popup, /id="download-html"/);
  assert.match(popup, />Download semantic HTML</);
  assert.match(popupScript, /DOWNLOAD_HTML/);
  assert.match(popupScript, /semantic-html\.js/);
  assert.match(content, /EXTRACT_HTML/);
  assert.match(content, /withEmbeddedMedia/);
  assert.match(background, /DOWNLOAD_HTML/);
  assert.match(background, /suggestedHtmlFilename/);
  assert.match(offscreen, /MAKE_HTML_URL/);
  assert.match(offscreen, /text\/html;charset=utf-8/);
});

test("image exports retain provider sizing and wait for printable pixels", async () => {
  const [content, semanticHtml] = await Promise.all([
    readFile(new URL("content.js", extensionRoot), "utf8"),
    readFile(new URL("semantic-html.js", extensionRoot), "utf8"),
  ]);
  assert.match(content, /displayWidth: rect\.width > 0/);
  assert.match(content, /CommonMark has no image-size syntax/);
  assert.match(content, /clone\.setAttribute\("loading", "eager"\)/);
  assert.match(content, /await awaitPrintableImages\(shell\)/);
  const cleanSource = content.slice(
    content.indexOf("async function withCleanTextSource"),
    content.indexOf("async function extractText"),
  );
  assert.ok(cleanSource.indexOf("collectStructuredTurns(target)") < cleanSource.indexOf("markClutter(target, mark)"));
  assert.match(semanticHtml, /displayWidth \? ` width=/);
  assert.match(semanticHtml, /itemprop="width"/);
});

test("exports download automatically without opening a Save As dialog", async () => {
  const [background, popup] = await Promise.all([
    readFile(new URL("background.js", extensionRoot), "utf8"),
    readFile(new URL("popup.js", extensionRoot), "utf8"),
  ]);
  assert.match(background, /saveAs:\s*false/);
  assert.doesNotMatch(background, /saveAs:\s*true/);
  assert.doesNotMatch(popup, /Save As dialog/);
});
