# GetSome (Version 0.1, last edit 14Jul26)

*Take the whole conversation with you.*

A Chrome extension you need.
AI chat sites often keep only the visible portion of a long conversation in the page, so ordinary copy, print, and save commands can omit most of the thread. GetSome traverses the conversation from beginning to end, removes interface clutter, and exports a portable archive. Semantic HTML preserves roles, structure, source context, and media for people and agents; Markdown provides a compact transcript; PDF remains available as a fallback. Capture runs locally in Chrome with no account, server, analytics, or telemetry.

GetSome can also save the useful content of ordinary web pages, using automatically detected main content or a region you pick.

## What it saves

- **Semantic HTML** — the recommended archive. It is a readable, standalone web page with conversation roles, source information, media descriptions, and Schema.org `Conversation` and `Message` markup. Images are included when the page allows it.
- **Markdown** — a compact, portable transcript for text editors, repositories, and AI tools.
- **Searchable PDF** — clean text and ordinary page content using Chrome's PDF renderer.
- **Scrolling PDF** — a pixel-based fallback for difficult viewers and virtual lists.
- **Copied text** — the same cleaned content on the clipboard.

GetSome has conversation-aware capture for ChatGPT, Claude, Gemini, and Grok.

## Install from this repository

1. Download or clone the repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the repository's `extension` folder.

After updating the source, return to `chrome://extensions` and click GetSome's reload button. You do not need to remove and reinstall it.

## Use it

Open the page you want, click GetSome's page icon, and choose an output. For a full chat, GetSome starts at the real beginning and traverses to the end regardless of your current scroll position.

**Pick content** limits the export. On a recognized chat, click one turn for a single selection, Shift-click another turn for a range, or Option-click to add or remove turns. On an ordinary page, use the arrow keys to move between child and parent regions, Enter to accept, and Escape to cancel.

Long or uncooperative pages can take time. GetSome retries ignored scrolls and stalled browser capture operations. If it still cannot recover everything, it saves the useful partial result when possible and identifies it as partial.

## Privacy

GetSome works locally in Chrome. It has no account, server, analytics, advertising, or telemetry. It reads a page only after you invoke it, and saves the result through Chrome's download flow. Image embedding may request an image again from its original page source; nothing is sent to the extension's developer.

Exports can contain private conversations and attachments. Treat the saved files accordingly.

## Practical limits

- Chat sites change their page structure, so provider-specific capture may occasionally need maintenance.
- GetSome can save only content your current browser session can display; it does not retrieve inaccessible conversations or hidden attachments.
- Some images cannot be embedded because of size, format, access, or time limits. Their descriptions and source references remain when available.
- PDF capture uses Chrome's debugger interface, so Chrome displays a temporary “being debugged” banner. Close DevTools on the tab before starting a PDF.
- Semantic HTML or Markdown is usually a better input for another agent than PDF.

## Development

GetSome is a Manifest V3 extension with no build step and no runtime dependencies. See [Technical reference](doc/TECHNICAL.md) for its architecture, capture behavior, and test coverage. See [Public release guide](doc/PUBLISHING.md) before putting it on GitHub. That guide also records the additional issues that would apply if Chrome Web Store publication is ever considered.

GetSome was developed collaboratively with OpenAI Codex 5.6 Sol; see the [technical reference](doc/TECHNICAL.md#development-provenance) for details.

```sh
npm run check
npm test
```
