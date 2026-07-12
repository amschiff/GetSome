# GetSome Public Release Guide (last edit 12Jul26)

GetSome 0.7.0 is technically suitable for a public source repository. This document first covers that practical goal. Chrome Web Store publication is speculative; its separate section records issues that would matter only if store distribution is considered later.

## Public GitHub repository

- Choose and add a license. With no license, people may view the public source but do not receive general permission to copy, modify, or distribute it.
- Add the eventual repository URL and contact route to the project metadata and privacy policy.
- Confirm that no test downloads, private conversations, screenshots with private data, browser profiles, or local configuration files are committed.
- Add screenshots made from a non-sensitive sample conversation.
- Tag releases using the matching versions in `extension/manifest.json` and `package.json`.

### Suggested descriptive material

**Repository description**

> Export complete AI chats from ChatGPT, Claude, Gemini, and Grok as semantic HTML, Markdown, or PDF—even when older turns are virtualized.

**Short tagline**

> Take the whole conversation with you.

**Longer project summary**

> AI chat sites often keep only the visible portion of a long conversation in the page, so ordinary copy, print, and save commands can omit most of the thread. GetSome traverses the conversation from beginning to end, removes interface clutter, and exports a portable archive. Semantic HTML preserves roles, structure, source context, and media for people and agents; Markdown provides a compact transcript; PDF remains available as a fallback. Capture runs locally in Chrome with no account, server, analytics, or telemetry.

**Suggested GitHub topics**

`chrome-extension`, `chat-export`, `ai-chat`, `semantic-html`, `markdown`, `pdf`, `manifest-v3`, `local-first`

**Screenshot set**

1. The popup on a recognizable but non-sensitive sample chat.
2. A long source conversation containing a table and image.
3. The same conversation as semantic HTML, showing its clean header and speaker turns.
4. A Markdown excerpt beside the source conversation.
5. Turn picking with a Shift-selected range.

Use short captions that state the benefit rather than narrating the interface: “Captures turns that are not currently rendered,” “Preserves tables and media,” and “Exports clean speaker-attributed HTML.” Avoid real private conversations and provider logos as the main project identity.

The README already supplies installation, use, privacy, limits, and development information. A public repository would also benefit from a license, a small synthetic sample export, and an initial GitHub release containing a source archive. Contribution rules and issue templates can wait until outside contributions create a real need for them.

## If this extension is ever put on the Chrome Web Store

Store publication is not assumed or currently required. If it is pursued, the submission would need more than the extension source:

1. a [Chrome Web Store developer account](https://developer.chrome.com/docs/webstore/register), including the one-time registration fee and required 2-Step Verification;
2. a store listing, icon, screenshots, and promotional copy;
3. a public privacy-policy URL;
4. accurate data-use disclosures and permission justifications in the developer dashboard;
5. a ZIP of `extension/` with `manifest.json` at its root;
6. a version bump for every uploaded revision; and
7. a final test of the exact ZIP loaded unpacked into a clean Chrome profile.

Store requirements and dashboard wording change. Verify the current [program policies](https://developer.chrome.com/docs/webstore/program-policies), [privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), and [submission instructions](https://developer.chrome.com/docs/webstore/publish/) immediately before submission rather than treating this document as the authority for current policy.

### Possible store single-purpose description

A defensible store purpose is:

> GetSome exports content the user can already view in the active tab into a clean semantic HTML, Markdown, text, or PDF file.

Keep the listing focused on reliable capture and portable archives. Do not describe GetSome as bypassing authentication, paywalls, access controls, DRM, or provider security. It does not do those things.

### Possible store permission justifications

Use factual, narrow explanations:

- **activeTab:** Accesses only the tab on which the user invokes the extension so it can identify and export the selected or likely main content.
- **scripting:** Injects the local capture helper after the user opens GetSome; there is no persistent page access and no remote code.
- **clipboardWrite:** Copies cleaned text when the user chooses **Copy all text**.
- **downloads:** Saves requested files through Chrome and checks recent download filenames only to suggest a short name without collisions.
- **offscreen:** Provides the document context needed to create temporary local Blob URLs and assemble screenshot-based PDFs.
- **debugger:** Calls Chrome's DevTools Protocol only during PDF capture to print cleaned content or capture successive page segments, then detaches. This permission is likely to receive the most user and reviewer scrutiny because Chrome displays a debugging warning.

Chrome [does not allow `debugger` to be declared as an optional permission](https://developer.chrome.com/docs/extensions/reference/api/permissions#step2). If store installation warnings or review ever become a concern, removing the two direct PDF commands and relying on printable semantic HTML would materially reduce permission sensitivity, but that would be a future product decision rather than a packaging change.

### Possible store privacy-policy facts

A public policy should accurately state all of the following:

- GetSome processes website content, including text, links, conversation roles, images, source information, and potentially personal communications, only after the user invokes it.
- Processing occurs locally in the browser. There is no GetSome server, account, analytics, advertising, telemetry, sale of data, or sharing with the developer.
- The extension does not retain conversation content after preparing the requested download or clipboard value.
- Semantic HTML may request an image again from its original URL with the browser's current credentials so it can embed that image. This request goes to the page's original source, not to the GetSome developer.
- Chrome's recent download metadata is read only to propose a compact non-conflicting filename.
- Saved exports remain under the user's control and may contain sensitive conversation content or attachments.
- Uninstalling the extension removes it but does not delete files the user previously saved.
- The policy should identify a repository or other contact path and record its effective date.

Do not publish a policy with an invented contact or repository URL. Add those after the GitHub location is known.

### Possible store package

The repository's `extension/` directory is the runtime package. A possible store ZIP would contain its contents at the archive root:

```text
manifest.json
background.js
capture-core.js
content.js
filename.js
offscreen.html
offscreen.js
pdf.js
popup.html
popup.css
popup.js
semantic-html.js
icons/
```

Repository documentation, tests, and package metadata remain outside `extension/` and would not belong in a store ZIP. There is currently no build or packaging script, so compare the ZIP contents against this list and load `extension/` unpacked before any possible submission.

### Possible store release verification

Run:

```sh
npm run check
npm test
```

Then test the packaged extension in Chrome:

- semantic HTML and Markdown on current ChatGPT, Claude, Gemini, and Grok conversations;
- a long virtualized conversation from a middle scroll position;
- tables, code, links, uploaded images, image-only turns, and generated media;
- full and picked-turn exports;
- short filenames and repeated-download numbering;
- searchable and scrolling PDF, including cancellation and debugger cleanup; and
- a partial-result path where a page refuses to expose a turn or screenshot segment.

Inspect the browser console and extension service-worker console during these tests. Confirm that page scroll position and styling are restored after success, failure, and cancellation.
