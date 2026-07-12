# GetSome Publishing Guide (last edit 12Jul26)

GetSome 0.7.0 is technically suitable for public source hosting and is structured like a publishable Manifest V3 extension. Publication still requires project-owner choices and store collateral; passing local tests is not the same as Chrome Web Store approval.

## Before making the GitHub repository public

- Choose and add a license. With no license, people may view the public source but do not receive general permission to copy, modify, or distribute it.
- Add the eventual repository URL and contact route to the project metadata and privacy policy.
- Confirm that no test downloads, private conversations, screenshots with private data, browser profiles, or local configuration files are committed.
- Use a concise repository description such as: “Save complete AI chats as semantic HTML, Markdown, or PDF—even when the page virtualizes old turns.”
- Add screenshots made from a non-sensitive sample conversation.
- Tag releases using the version in `manifest.json` and `package.json`.

## Chrome Web Store preparation

The store submission needs more than the extension source:

1. a [Chrome Web Store developer account](https://developer.chrome.com/docs/webstore/register), including the one-time registration fee and required 2-Step Verification;
2. a store listing, icon, screenshots, and promotional copy;
3. a public privacy-policy URL;
4. accurate data-use disclosures and permission justifications in the developer dashboard;
5. a ZIP with `manifest.json` at its root;
6. a version bump for every uploaded revision; and
7. a final test of the exact ZIP loaded unpacked into a clean Chrome profile.

Store requirements and dashboard wording change. Verify the current [program policies](https://developer.chrome.com/docs/webstore/program-policies), [privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), and [submission instructions](https://developer.chrome.com/docs/webstore/publish/) immediately before submission rather than treating this document as the authority for current policy.

## Single-purpose description

A defensible store purpose is:

> GetSome exports content the user can already view in the active tab into a clean semantic HTML, Markdown, text, or PDF file.

Keep the listing focused on reliable capture and portable archives. Do not describe GetSome as bypassing authentication, paywalls, access controls, DRM, or provider security. It does not do those things.

## Permission justifications

Use factual, narrow explanations:

- **activeTab:** Accesses only the tab on which the user invokes the extension so it can identify and export the selected or likely main content.
- **scripting:** Injects the local capture helper after the user opens GetSome; there is no persistent page access and no remote code.
- **clipboardWrite:** Copies cleaned text when the user chooses **Copy all text**.
- **downloads:** Saves requested files through Chrome and checks recent download filenames only to suggest a short name without collisions.
- **offscreen:** Provides the document context needed to create temporary local Blob URLs and assemble screenshot-based PDFs.
- **debugger:** Calls Chrome's DevTools Protocol only during PDF capture to print cleaned content or capture successive page segments, then detaches. This permission is likely to receive the most user and reviewer scrutiny because Chrome displays a debugging warning.

Chrome [does not allow `debugger` to be declared as an optional permission](https://developer.chrome.com/docs/extensions/reference/api/permissions#step2). If store conversion or review becomes unacceptable, removing the two direct PDF commands and relying on printable semantic HTML would materially reduce permission sensitivity, but that is a product decision rather than a packaging change.

## Privacy-policy facts

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

## Release package

The runtime package consists of:

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

Documentation and tests may remain in the public source repository, but they are not needed in the store ZIP. There is currently no build or packaging script, so compare the ZIP contents against this list and load the unpacked directory before submission.

## Release verification

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
