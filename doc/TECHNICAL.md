# GetSome Technical Reference (last edit 12Jul26)

This document describes the implementation and maintenance boundaries of GetSome 0.7.0. The user-facing introduction belongs in the repository [README](../README.md).

## Runtime structure

GetSome is a Chrome Manifest V3 extension with no bundler and no runtime dependencies.

| File | Responsibility |
| --- | --- |
| `popup.html`, `popup.css`, `popup.js` | Stable commands, selection status, content-script injection, clipboard output, and progress/error reporting. |
| `content.js` | Main-content detection, provider adapters, turn and media extraction, selection UI, reversible page cleanup, virtual-page movement, and export geometry. |
| `capture-core.js` | Provider-independent traversal and merging of transient virtualized slices, including retry and partial-result decisions. |
| `semantic-html.js` | Standalone semantic document generation. |
| `background.js` | Job coordination, downloads, Chrome debugger lifecycle, searchable PDF printing, scrolling screenshots, retry, and cleanup. |
| `offscreen.html`, `offscreen.js` | Blob URL creation for downloads and pixel-PDF assembly outside the service worker. |
| `pdf.js` | Minimal PDF writer for JPEG screenshot segments. |
| `filename.js` | Short title-derived filenames and collision numbering based on recent downloads. |

The popup injects the capture modules only after the user invokes the extension. A capture records and restores its page attributes, styles, expanded elements, and scroll positions. The background worker also detaches the Chrome debugger in `finally` cleanup paths.

## Conversation capture

The provider adapters recognize turns in ChatGPT, Claude, Gemini, and Grok, then normalize them into records with a stable key, order, role, text, Markdown, semantic body HTML, print node, and media records.

Modern chat pages often virtualize long conversations: only a small window of turns exists in the DOM, and scrolling replaces that window. GetSome therefore does not take one DOM snapshot. It:

1. identifies the conversation's scroll host;
2. starts traversal at the real top, independent of the current viewport;
3. samples each mounted slice and retains the best version of every turn;
4. advances through the full scroll range while discovering turns that were not initially mounted;
5. retries positions that the page ignores, including targeted passes for missing turns;
6. excludes empty inactive answer-branch shells; and
7. returns an explicitly marked partial collection only after recovery limits are exhausted.

The current structured traversal allows three retries per movement, up to 1,200 steps or 180 seconds. This is intentionally bounded: a page that continually grows or refuses to settle must not hold the extension forever.

Provider-specific DOM selectors are maintenance points, not a claim about a provider API. When a provider changes its markup, validate roles, ordering, tables, code, links, uploaded images, generated images, and long virtualized threads before changing a selector.

## Output formats

### Semantic HTML

The HTML archive is a complete ordinary `.html` document. It uses native `article`, `header`, `main`, `ol`, `figure`, `time`, and related elements, plus Schema.org `Conversation`, `Message`, `Organization`, and `ImageObject` microdata.

The header records provider, source URL, export time, scope, completeness, and media status. Nearby provider editorial or source metadata is preserved in a visually and semantically separate aside without imposing a common provider schema. Individual metadata items are clipped to 600 characters, deduplicated, limited to eight entries, and constrained to 1,800 characters in total.

Page controls, navigation, toolbars, feedback widgets, forms, and hidden decoration are omitted. Turn body structure such as headings, lists, links, tables, quotations, and code is retained when available.

Image embedding is best-effort and bounded:

- at most 24 unique image sources;
- at most 12 MiB per image;
- at most 32 MiB embedded in total;
- at most 35 seconds for the embedding phase; and
- four fetches at a time, using the current browser credentials and the source's existing URL.

If an image cannot be embedded, the archive retains its description and original source reference when available. The extension does not create MHTML; the semantic archive is intentionally plain HTML with embedded data URLs where possible.

### Markdown and copied text

Markdown keeps speaker headings and meaningful document structure while omitting chat controls. Copied text uses simple speaker labels and cleaned plain text. Both use the same full virtualized traversal as semantic HTML.

### PDF

Searchable PDF installs a clean print shell for structured chats, asks Chrome's DevTools Protocol to print it, and retries the debugger connection up to three times. It uses screen media so the result does not inherit hostile or broken print-only styling.

Scrolling PDF captures successive JPEG segments and writes them into a PDF. Positioning and screenshot calls are retried; the debugger connection is restarted after screenshot failures. Capture stops after 180 seconds, 240 pages, 250,000 CSS pixels, or repeated non-progress/growth. If at least one segment exists, GetSome saves a partial PDF rather than discarding all work.

## Content picker

Recognized chats use turn-level selection:

- click selects one turn;
- Shift-click selects the span from the anchor;
- Option-click toggles a turn without discarding the existing selection;
- Enter accepts and Escape cancels.

Turn labels show the speaker and sequence without copying the first line of message text. Generic pages use element-level picking, with Up and Down moving through parent and child regions.

## Permissions

| Permission | Why it is required |
| --- | --- |
| `activeTab` | Limits access to the page on which the user invokes GetSome. |
| `scripting` | Injects the capture helper after that invocation. |
| `clipboardWrite` | Implements **Copy all text**. |
| `downloads` | Opens Chrome's download flow and inspects recent filenames to suggest a short, non-conflicting name. |
| `offscreen` | Creates Blob URLs and assembles scrolling PDFs in a document context. |
| `debugger` | Uses the Chrome DevTools Protocol for searchable PDF and screenshot capture. |

There are no host permissions, remotely hosted code, extension accounts, developer services, analytics, or telemetry.

## Verification

Run the repository gates from its root:

```sh
npm run check
npm test
```

The automated tests cover manifest wiring, filename compaction, semantic HTML attribution and metadata clipping, multi-page PDF assembly, disappearing virtualized slices, ignored scroll requests, permanently missing turns, inactive branches, discovery from mounted slices, tables, image-only turns, uploaded media references, and click/Shift/Option selection semantics.

Live validation is still necessary because provider DOMs are external and change without notice. Version 0.7.0 was exercised on both shared and signed-in chat pages where available. The validation conversations included long threads, tables, uploaded images, generated content, sidebars, and virtualized turns. The tested providers were ChatGPT, Claude, Gemini, and Grok.

For a release candidate, repeat a full-conversation semantic HTML and Markdown export on each provider, inspect first and last turns, count roles, check tables and media, and test both PDF modes on at least one long virtualized conversation.
