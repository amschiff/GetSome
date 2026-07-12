# GetSome Agent Guide (last edit 12Jul26)

## Repository shape

- `extension/` is the complete unpacked Chrome extension. Its root contains `manifest.json`; do not add repository-only files there.
- `tests/` contains Node tests, `doc/` contains technical and release notes, and `package.json` defines repository checks.
- The extension is plain Manifest V3 JavaScript with no build step or runtime dependencies.

## Working rules

- Proceed through routine, reversible work without asking for approval.
- Keep changes focused and preserve unrelated user work, including untracked files.
- Do not modify files outside this repository, rewrite Git history, or use destructive Git commands.
- Do not add or upgrade dependencies unless explicitly requested.
- Inspect named screenshots, live pages, logs, and fixtures before diagnosing a reported failure.
- Prefer evidence from a live provider page when changing provider-specific capture behavior.

## Product contracts

- GetSome is local-only: no account, developer server, analytics, advertising, telemetry, or remote code.
- Page access begins with an explicit user action and is limited to the active tab.
- Chat capture must traverse from the real beginning to the real end even when the provider mounts only transient slices.
- Ignored scrolls and stalled browser operations receive bounded retries. Preserve useful partial output when full recovery fails, and label it partial.
- ChatGPT, Claude, Gemini, and Grok are the currently supported provider adapters. Treat their DOM structures as external and changeable.
- Preserve meaningful turn structure, tables, code, links, roles, editorial context, and media references while excluding navigation, controls, feedback widgets, and other ornamentation.
- Semantic HTML, Markdown, copied text, searchable PDF, and scrolling PDF are distinct supported outputs.
- Keep popup command labels stable. Represent state through status text, enabled state, or adjacent explanation rather than renaming commands.

## Implementation and tests

- Follow the existing module style and structured source-file headers.
- Comment contracts, recovery limits, and non-obvious browser behavior; do not narrate obvious code.
- Add focused regression coverage for bug fixes when feasible, especially virtualized traversal and provider extraction failures.
- After code or manifest changes, run:

```sh
npm run check
npm test
```

- For browser-facing changes, also load `extension/` unpacked and exercise the affected workflow in Chrome. Automated tests do not replace live provider checks.
- If a check is skipped or fails, report that plainly.

## Documentation and releases

- Keep `README.md` approachable; put implementation detail in `doc/`.
- Markdown documentation title lines carry `(last edit DMonYY)`. The README title also carries the extension version.
- Update dates only on documents changed in the same work. Standard legal text such as `LICENSE.txt` is exempt from the title-date convention.
- Keep `extension/manifest.json` and `package.json` versions aligned.
- Chrome Web Store publication is speculative. Describe store requirements conditionally, not as current project work.
- Report files changed, verification performed, and any manual reload or migration step required.
