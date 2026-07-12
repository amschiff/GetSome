import assert from "node:assert/strict";
import test from "node:test";

import {
  compactTitle,
  nextAvailableFilename,
  suggestedMarkdownFilename,
  suggestedPdfFilename,
} from "../filename.js";

test("compacts long conversation titles into readable handles", () => {
  assert.equal(compactTitle("Beijing apartments for Sui (2)"), "Apts for Sui 2");
  assert.equal(compactTitle("Highest Elo and Newbie Rating"), "ELO Rating");
  assert.equal(
    compactTitle("Static Website Creation and Deployment - Google Gemini"),
    "Static Site Build and Deploy",
  );
  assert.equal(compactTitle("Commit messages vs status files | Claude"), "Commit messages vs status files");
});

test("uses compact names for every export format", () => {
  assert.equal(suggestedMarkdownFilename("Highest Elo and Newbie Rating"), "ELO Rating.md");
  assert.equal(suggestedPdfFilename("Beijing apartments for Sui", "searchable"), "Apts for Sui clean.pdf");
  assert.equal(
    suggestedPdfFilename("Beijing apartments for Sui", "scrolling", true),
    "Apts for Sui scrolling partial.pdf",
  );
});

test("numbers repeated downloads without parenthesized counters", () => {
  assert.equal(nextAvailableFilename("Apts for Sui.md", []), "Apts for Sui.md");
  assert.equal(
    nextAvailableFilename("Apts for Sui.md", ["/Users/ams/Downloads/Apts for Sui.md"]),
    "Apts for Sui 2.md",
  );
  assert.equal(
    nextAvailableFilename("Apts for Sui.md", [
      "/Users/ams/Downloads/Apts for Sui.md",
      "/Users/ams/Downloads/Apts for Sui (1).md",
      "/Users/ams/Downloads/Apts for Sui 3.md",
    ]),
    "Apts for Sui 4.md",
  );
});
