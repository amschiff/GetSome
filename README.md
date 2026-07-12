# GetSome (Version 0.7.0, last edit 12Jul26)

GetSome saves the useful content of a web page—even when the site only renders the part currently on screen.

It is especially useful for long AI conversations. GetSome walks a conversation from beginning to end, removes controls such as copy buttons and feedback widgets, and saves the result in a form that a person or another agent can read.

## What it saves

- **Semantic HTML** — the recommended archive. It is a readable, standalone web page with conversation roles, source information, media descriptions, and Schema.org `Conversation` and `Message` markup. Images are included when the page allows it.
- **Markdown** — a compact, portable transcript for text editors, repositories, and AI tools.
- **Searchable PDF** — clean text and ordinary page content using Chrome's PDF renderer.
- **Scrolling PDF** — a pixel-based fallback for difficult viewers and virtual lists.
- **Copied text** — the same cleaned content on the clipboard.

GetSome has conversation-aware capture for ChatGPT, Claude, Gemini, and Grok. It can also use automatically detected main content or a region you pick on other pages.

## Install from this repository

1. Download or clone the repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose this repository's folder.

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

GetSome is a Manifest V3 extension with no build step and no runtime dependencies. See [Technical reference](doc/TECHNICAL.md) for its architecture, capture behavior, and test coverage. See [Publishing guide](doc/PUBLISHING.md) before putting it on GitHub or submitting it to the Chrome Web Store.

```sh
npm run check
npm test
```

The project is currently a source-installable pre-release. No license has been selected yet; add one before inviting reuse or contributions.
