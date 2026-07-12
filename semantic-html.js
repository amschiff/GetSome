/*
 * GetSome - semantic conversation document builder
 *
 * Produces one self-contained, human-readable HTML document with native HTML
 * structure and Schema.org Conversation/Message microdata.
 */

(() => {
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function speakerLabel(role) {
    if (role === "user") return "You";
    if (role === "assistant") return "Assistant";
    if (role === "system") return "System";
    if (role === "tool") return "Tool";
    return role ? `${role[0].toUpperCase()}${role.slice(1)}` : "Speaker";
  }

  function providerLabel(provider) {
    return {
      chatgpt: "ChatGPT",
      claude: "Claude",
      gemini: "Gemini",
      grok: "Grok",
    }[provider] || provider || "Unknown chat application";
  }

  function clippedMetadata(value, maximum = 600) {
    const text = String(value ?? "").replace(/\r\n?/g, "\n").trim();
    if (text.length <= maximum) return text;
    const clipped = text.slice(0, maximum + 1).replace(/\s+\S*$/, "").trim();
    return `${clipped || text.slice(0, maximum)} … [clipped]`;
  }

  function normalizedSourceMetadata(lines, title) {
    const output = [];
    const seen = new Set();
    let remaining = 1_800;
    for (const value of lines || []) {
      let text = clippedMetadata(value, Math.min(600, remaining));
      if (title) text = text.split(title).join(" ").replace(/\s+/g, " ").trim();
      const key = text.toLocaleLowerCase();
      if (!text || seen.has(key)) continue;
      output.push(text);
      seen.add(key);
      remaining -= text.length;
      if (output.length >= 8 || remaining < 40) break;
    }
    return output;
  }

  function renderSourceMetadata(lines, title) {
    const normalized = normalizedSourceMetadata(lines, title);
    if (!normalized.length) return "";
    return `
      <aside class="source-metadata" aria-labelledby="source-metadata-heading">
        <h2 id="source-metadata-heading">Source metadata and editorial context</h2>
        ${normalized.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n        ")}
      </aside>`;
  }

  function renderMedia(media, turnIndex) {
    return (media || []).map((item, mediaIndex) => {
      const alt = item.alt || `Image attached to turn ${turnIndex}`;
      const source = item.src || "";
      const originalSource = item.originalSrc || source;
      const dimensions = [
        Number(item.width) > 0 ? ` width="${Math.round(item.width)}"` : "",
        Number(item.height) > 0 ? ` height="${Math.round(item.height)}"` : "",
      ].join("");
      const sourceLink = originalSource && !originalSource.startsWith("data:")
        ? ` <a class="media-source" href="${escapeHtml(originalSource)}" rel="external">Original source</a>`
        : "";
      return `
          <figure class="attachment" data-embedded="${item.embedded ? "true" : "false"}" itemprop="messageAttachment" itemscope itemtype="https://schema.org/ImageObject">
            ${source
    ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(alt)}"${dimensions} itemprop="contentUrl">`
    : `<p class="missing-media" role="note">Image unavailable: ${escapeHtml(alt)}</p>`}
            <figcaption itemprop="caption">${escapeHtml(alt)}${sourceLink}</figcaption>
            <meta itemprop="position" content="${mediaIndex + 1}">
          </figure>`;
    }).join("");
  }

  function renderTurn(record, index) {
    const position = index + 1;
    const role = record.role || "unknown";
    const speaker = speakerLabel(role);
    const senderType = role === "user" ? "Person" : "Organization";
    return `
      <li class="turn" data-turn="${position}" data-role="${escapeHtml(role)}">
        <article class="message" aria-label="${escapeHtml(speaker)} turn ${position}" itemprop="hasPart" itemscope itemtype="https://schema.org/Message">
          <meta itemprop="position" content="${position}">
          <header class="message-header">
            <h2><span class="speaker" itemprop="sender" itemscope itemtype="https://schema.org/${senderType}"><span itemprop="name">${escapeHtml(speaker)}</span></span><small>Turn ${position}</small></h2>
          </header>${renderMedia(record.media, position)}
          <div class="message-body" itemprop="text">${record.bodyHtml || `<p>${escapeHtml(record.text || "")}</p>`}</div>
        </article>
      </li>`;
  }

  /** Builds a complete HTML document from provider-independent turn records. */
  function buildSemanticHtml({
    title = "Conversation",
    provider = "",
    sourceUrl = "",
    exportedAt = new Date().toISOString(),
    records = [],
    editorial = [],
    sourceMetadata = editorial,
    complete = true,
    missingCount = 0,
    selected = false,
  } = {}) {
    const providerName = providerLabel(provider);
    const completeness = complete ? "Complete" : `Partial (${missingCount} missing turns)`;
    const scope = selected ? "Picked turns" : "Full conversation";
    const embeddedMedia = records.flatMap((record) => record.media || []).filter((item) => item.embedded).length;
    const totalMedia = records.flatMap((record) => record.media || []).length;
    const sourceLink = sourceUrl
      ? `<a href="${escapeHtml(sourceUrl)}" rel="source external">${escapeHtml(sourceUrl)}</a>`
      : "Unavailable";

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="GetSome">
  <meta name="getsome:provider" content="${escapeHtml(provider)}">
  <meta name="getsome:complete" content="${complete ? "true" : "false"}">
  <meta name="getsome:scope" content="${selected ? "selection" : "conversation"}">
  ${sourceUrl ? `<link rel="canonical" href="${escapeHtml(sourceUrl)}">` : ""}
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; font: 17px/1.55 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; color: CanvasText; background: Canvas; }
    .conversation { width: min(100% - 2rem, 52rem); margin: 0 auto; padding: 2rem 0 4rem; }
    .conversation-header { padding-bottom: 1.5rem; border-bottom: 2px solid color-mix(in srgb, CanvasText 18%, Canvas); }
    h1 { margin: 0 0 1rem; font-size: clamp(1.7rem, 5vw, 2.35rem); line-height: 1.15; }
    h2 { margin: 0; font-size: 1.2rem; }
    h3, h4, h5, h6 { line-height: 1.25; }
    a { color: LinkText; overflow-wrap: anywhere; }
    .metadata { display: grid; grid-template-columns: max-content 1fr; gap: .25rem .8rem; margin: 0; font-size: .9rem; }
    .metadata dt { font-weight: 700; }
    .metadata dd { margin: 0; min-width: 0; }
    .source-metadata { margin-top: 1.25rem; padding: .85rem 1rem; border-left: 4px solid #777; background: color-mix(in srgb, CanvasText 5%, Canvas); }
    .source-metadata h2 { font-size: 1rem; }
    .source-metadata p { margin: .45rem 0 0; white-space: pre-wrap; }
    .turns { list-style: none; margin: 0; padding: 0; }
    .turn { margin: 0; padding: 0; }
    .message { padding: 1.5rem 0; border-bottom: 1px solid color-mix(in srgb, CanvasText 15%, Canvas); }
    .message-header h2 { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
    .message-header small { color: color-mix(in srgb, CanvasText 55%, Canvas); font-size: .75rem; font-weight: 500; }
    .message-body > :first-child { margin-top: .8rem; }
    .message-body > :last-child { margin-bottom: 0; }
    table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
    th, td { padding: .4rem .55rem; border: 1px solid color-mix(in srgb, CanvasText 25%, Canvas); text-align: left; vertical-align: top; }
    pre { max-width: 100%; padding: .8rem; overflow-x: auto; white-space: pre-wrap; overflow-wrap: anywhere; background: color-mix(in srgb, CanvasText 7%, Canvas); }
    code, kbd, samp { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    blockquote { margin-inline: 0; padding-left: 1rem; border-left: 3px solid #888; }
    .attachment { margin: 1rem 0; }
    .attachment img { display: block; max-width: 100%; height: auto; }
    .attachment figcaption { margin-top: .35rem; color: color-mix(in srgb, CanvasText 62%, Canvas); font-size: .82rem; }
    .media-source { margin-left: .45rem; }
    .missing-media { padding: .75rem; border: 1px dashed #888; }
    .document-footer { margin-top: 1.5rem; color: color-mix(in srgb, CanvasText 58%, Canvas); font-size: .8rem; }
    @media print { :root { color-scheme: light; } .conversation { width: 100%; } .message { break-inside: avoid-page; } }
  </style>
</head>
<body>
  <article class="conversation" data-provider="${escapeHtml(provider)}" data-complete="${complete ? "true" : "false"}" itemscope itemtype="https://schema.org/Conversation">
    <header class="conversation-header">
      <h1 itemprop="name">${escapeHtml(title)}</h1>
      ${sourceUrl ? `<link itemprop="url" href="${escapeHtml(sourceUrl)}">` : ""}
      <dl class="metadata">
        <dt>Provider</dt><dd itemprop="provider" itemscope itemtype="https://schema.org/Organization"><span itemprop="name">${escapeHtml(providerName)}</span></dd>
        <dt>Source</dt><dd>${sourceLink}</dd>
        <dt>Exported</dt><dd><time datetime="${escapeHtml(exportedAt)}" itemprop="dateCreated">${escapeHtml(exportedAt)}</time></dd>
        <dt>Scope</dt><dd>${escapeHtml(scope)}</dd>
        <dt>Completeness</dt><dd>${escapeHtml(completeness)}</dd>
        <dt>Media</dt><dd>${totalMedia ? `${embeddedMedia} of ${totalMedia} embedded; all retain descriptions and source references` : "No media detected"}</dd>
      </dl>${renderSourceMetadata(sourceMetadata, title)}
    </header>
    <main>
      <ol class="turns" aria-label="Conversation turns">
${records.map(renderTurn).join("\n")}
      </ol>
    </main>
    <footer class="document-footer"><p>Semantic conversation archive generated by GetSome. Page controls and feedback widgets were intentionally omitted.</p></footer>
  </article>
</body>
</html>`;
  }

  globalThis.GetSomeSemanticHtml = { buildSemanticHtml };
})();
