import assert from "node:assert/strict";
import test from "node:test";

await import("../extension/semantic-html.js");

const { buildSemanticHtml } = globalThis.GetSomeSemanticHtml;

test("builds an attributed semantic conversation without duplicating turn text", () => {
  const html = buildSemanticHtml({
    title: "Apts for Sui",
    provider: "chatgpt",
    sourceUrl: "https://chatgpt.com/share/example",
    exportedAt: "2026-07-12T21:00:00.000Z",
    editorial: [
      "Shared by Allan",
      "Unverified content may be present.",
      "Apts for SuiShared by Allan",
    ],
    records: [
      {
        role: "user",
        text: "Compare these properties.",
        bodyHtml: "<p>Compare these properties.</p>",
        media: [{
          src: "data:image/png;base64,AA==",
          originalSrc: "https://example.test/upload.png",
          alt: "Uploaded property list",
          width: 800,
          height: 600,
          displayWidth: 320,
          displayHeight: 240,
          embedded: true,
        }],
      },
      {
        role: "assistant",
        text: "Raffles is the best fit.",
        bodyHtml: "<p>Raffles is the best fit.</p><table><tr><th>Property</th><th>Judgment</th></tr><tr><td>Raffles</td><td>Definitely</td></tr></table>",
        media: [],
      },
    ],
  });

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /itemtype="https:\/\/schema\.org\/Conversation"/);
  assert.equal(html.match(/itemtype="https:\/\/schema\.org\/Message"/g)?.length, 2);
  assert.match(html, /data-role="user"/);
  assert.match(html, /data-role="assistant"/);
  assert.match(html, /itemprop="sender"[\s\S]*itemprop="name">You</);
  assert.match(html, /<aside class="source-metadata"/);
  assert.match(html, /Source metadata and editorial context/);
  assert.equal(html.match(/<p>Shared by Allan<\/p>/g)?.length, 1);
  assert.doesNotMatch(html, /Apts for SuiShared by Allan/);
  assert.match(html, /<table><tr><th>Property<\/th>/);
  assert.match(html, /itemprop="messageAttachment"/);
  assert.match(html, /src="data:image\/png;base64,AA==" alt="Uploaded property list" width="320" height="240"/);
  assert.match(html, /<meta itemprop="width" content="800">/);
  assert.match(html, /<meta itemprop="height" content="600">/);
  assert.match(html, /rel="source external"/);
  assert.equal(html.match(/Raffles is the best fit\./g)?.length, 1);
});

test("clips captured source metadata but not conversation turns", () => {
  const longMetadata = `Provider note ${"metadata ".repeat(100)}`;
  const longTurn = `Turn body ${"conversation ".repeat(100)}`;
  const html = buildSemanticHtml({
    title: "Clipping",
    sourceMetadata: [longMetadata],
    records: [{ role: "user", text: longTurn }],
  });

  assert.match(html, /\[clipped\]/);
  assert.match(html, new RegExp(longTurn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("marks partial selected archives explicitly", () => {
  const html = buildSemanticHtml({
    title: "Selection",
    provider: "claude",
    records: [{ role: "assistant", text: "Available turn" }],
    complete: false,
    missingCount: 2,
    selected: true,
  });

  assert.match(html, /meta name="getsome:complete" content="false"/);
  assert.match(html, /meta name="getsome:scope" content="selection"/);
  assert.match(html, /Partial \(2 missing turns\)/);
  assert.match(html, /<dt>Scope<\/dt><dd>Picked turns<\/dd>/);
});
