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
    access(new URL("offscreen.html", root)),
    ...Object.values(manifest.icons).map((path) => access(new URL(path, root))),
  ]);
});

test("popup and offscreen helper expose the intended stable controls", async () => {
  const [popup, offscreen] = await Promise.all([
    readFile(new URL("popup.html", root), "utf8"),
    readFile(new URL("offscreen.html", root), "utf8"),
  ]);
  assert.match(popup, /id="clear-selection"[^>]*disabled/);
  assert.match(popup, />Clear picked content</);
  assert.match(popup, /id="copy-text"/);
  assert.match(popup, />Copy all text</);
  assert.match(await readFile(new URL("content.js", root), "utf8"), /data-message-author-role/);
  assert.match(offscreen, /<script type="module" src="offscreen\.js"><\/script>/);
});
