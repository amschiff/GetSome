import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("manifest references packaged extension files", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
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
    access(new URL(manifest.background.service_worker, root)),
    access(new URL(manifest.action.default_popup, root)),
    access(new URL("content.js", root)),
    access(new URL("capture-core.js", root)),
    access(new URL("filename.js", root)),
    access(new URL("offscreen.html", root)),
    ...Object.values(manifest.icons).map((path) => access(new URL(path, root))),
  ]);
});

test("popup and offscreen helper expose the intended stable controls", async () => {
  const [popup, popupScript, offscreen] = await Promise.all([
    readFile(new URL("popup.html", root), "utf8"),
    readFile(new URL("popup.js", root), "utf8"),
    readFile(new URL("offscreen.html", root), "utf8"),
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
    readFile(new URL("popup.html", root), "utf8"),
    readFile(new URL("content.js", root), "utf8"),
    readFile(new URL("background.js", root), "utf8"),
    readFile(new URL("offscreen.js", root), "utf8"),
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
  assert.doesNotMatch(await readFile(new URL("popup.css", root), "utf8"), /button:disabled\s*\{[^}]*cursor:\s*wait/s);
  assert.match(background, /DOWNLOAD_MARKDOWN/);
  assert.match(offscreen, /MAKE_MARKDOWN_URL/);
  assert.match(offscreen, /text\/markdown;charset=utf-8/);
});
