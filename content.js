/*
 * GetSome - page-side capture helper
 *
 * Owns content picking, temporary cleanup styles, lazy-load scrolling, and
 * segment geometry. Every page mutation is recorded and restored after export.
 */

(() => {
  if (globalThis.__getSomeCaptureHelper) return;
  globalThis.__getSomeCaptureHelper = true;

  const ATTR = {
    root: "data-getsome-export",
    target: "data-getsome-target",
    path: "data-getsome-path",
    hidden: "data-getsome-hidden",
    sticky: "data-getsome-sticky",
    expanded: "data-getsome-expanded",
    internal: "data-getsome-internal",
    printShell: "data-getsome-print-shell",
  };

  const state = {
    selected: null,
    pickerCleanup: null,
    exportContext: null,
  };

  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  /** Waits for layout and paint to reflect a scroll or temporary style change. */
  async function settle(milliseconds = 120) {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (milliseconds) await delay(milliseconds);
  }

  function describeElement(element) {
    if (!element) return "whole page";
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    const classes = [...element.classList]
      .filter((name) => !name.startsWith("getsome"))
      .slice(0, 2)
      .map((name) => `.${name}`)
      .join("");
    const label = element.getAttribute("aria-label");
    return `${tag}${id}${classes}${label ? ` - ${label}` : ""}`;
  }

  function automaticTarget() {
    const candidates = [...document.querySelectorAll("main, [role='main'], article")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 100 && rect.height > 80;
      });

    if (!candidates.length) return document.body;
    return candidates.sort((left, right) => targetScore(right) - targetScore(left))[0];
  }

  function targetScore(element) {
    const textScore = Math.min(element.innerText?.length || 0, 100000);
    const sizeScore = Math.min(element.scrollHeight * element.clientWidth, 2_000_000) / 100;
    const semanticBonus = element.tagName === "MAIN" || element.getAttribute("role") === "main" ? 5000 : 0;
    return textScore + sizeScore + semanticBonus;
  }

  function currentTarget() {
    if (state.selected && !state.selected.isConnected) state.selected = null;
    return state.selected || automaticTarget();
  }

  function status() {
    const target = currentTarget();
    return {
      selected: Boolean(state.selected),
      description: describeElement(target),
    };
  }

  /** Starts an element picker with parent/child keyboard navigation. */
  function startPicker() {
    state.pickerCleanup?.();

    const outline = document.createElement("div");
    const hint = document.createElement("div");
    const commonStyle = [
      "position:fixed",
      "z-index:2147483647",
      "pointer-events:none",
      "font:13px/1.3 system-ui,sans-serif",
    ];
    outline.style.cssText = [
      ...commonStyle,
      "border:3px solid #1473e6",
      "background:rgba(20,115,230,.10)",
      "box-sizing:border-box",
    ].join(";");
    hint.style.cssText = [
      ...commonStyle,
      "top:12px",
      "left:50%",
      "transform:translateX(-50%)",
      "max-width:min(560px,calc(100vw - 24px))",
      "padding:8px 11px",
      "border-radius:7px",
      "background:#171717",
      "color:#fff",
      "box-shadow:0 3px 14px rgba(0,0,0,.3)",
    ].join(";");
    hint.textContent = "Click content to keep - Up chooses its parent - Down reverses - Esc cancels";
    document.documentElement.append(outline, hint);

    let candidate = document.body;
    const childHistory = [];

    function paint() {
      const rect = candidate.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      outline.style.left = `${left}px`;
      outline.style.top = `${top}px`;
      outline.style.width = `${Math.max(0, Math.min(innerWidth, rect.right) - left)}px`;
      outline.style.height = `${Math.max(0, Math.min(innerHeight, rect.bottom) - top)}px`;
      outline.title = describeElement(candidate);
    }

    function onMove(event) {
      if (!(event.target instanceof Element) || event.target === outline || event.target === hint) return;
      candidate = event.target;
      childHistory.length = 0;
      paint();
    }

    function cleanup() {
      removeEventListener("mousemove", onMove, true);
      removeEventListener("click", onClick, true);
      removeEventListener("keydown", onKeyDown, true);
      removeEventListener("scroll", paint, true);
      outline.remove();
      hint.remove();
      state.pickerCleanup = null;
    }

    function onClick(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      state.selected = candidate;
      cleanup();
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        cleanup();
        return;
      }
      if (event.key === "ArrowUp" && candidate.parentElement && candidate !== document.body) {
        event.preventDefault();
        childHistory.push(candidate);
        candidate = candidate.parentElement;
        paint();
      } else if (event.key === "ArrowDown" && childHistory.length) {
        event.preventDefault();
        candidate = childHistory.pop();
        paint();
      }
    }

    addEventListener("mousemove", onMove, true);
    addEventListener("click", onClick, true);
    addEventListener("keydown", onKeyDown, true);
    addEventListener("scroll", paint, true);
    state.pickerCleanup = cleanup;
    paint();
    return { started: true };
  }

  function documentHeight() {
    return Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0,
      document.documentElement.offsetHeight,
      document.body?.offsetHeight || 0,
    );
  }

  function isInternalScroller(element) {
    if (element === document.body || element === document.documentElement) return false;
    const style = getComputedStyle(element);
    return element.scrollHeight > element.clientHeight + 8 && /(auto|scroll|overlay|hidden)/.test(style.overflowY);
  }

  function findScrollableAncestor(target) {
    for (let element = target.parentElement; element && element !== document.documentElement; element = element.parentElement) {
      if (isInternalScroller(element)) return element;
    }
    return null;
  }

  function rememberScrollPositions(target) {
    const positions = [];
    for (let element = target; element; element = element.parentElement) {
      if (
        element.scrollTop ||
        element.scrollLeft ||
        element.scrollHeight > element.clientHeight + 1 ||
        element.scrollWidth > element.clientWidth + 1
      ) {
        positions.push({ element, left: element.scrollLeft, top: element.scrollTop });
      }
    }
    return positions;
  }

  function makeMarker(context) {
    const marked = new WeakMap();
    return (element, attribute, value = "") => {
      if (!element) return;
      let attributes = marked.get(element);
      if (!attributes) {
        attributes = new Set();
        marked.set(element, attributes);
      }
      if (!attributes.has(attribute)) {
        context.marks.push([element, attribute, element.getAttribute(attribute)]);
        attributes.add(attribute);
      }
      element.setAttribute(attribute, value);
    };
  }

  const BASE_EXPORT_CSS = `
    html[${ATTR.root}] *, html[${ATTR.root}] *::before, html[${ATTR.root}] *::after {
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
    }
    html[${ATTR.root}] [${ATTR.path}] > :not([${ATTR.path}]):not([${ATTR.target}]) {
      display: none !important;
    }
    html[${ATTR.root}] [${ATTR.hidden}] {
      display: none !important;
    }
    html[${ATTR.root}] [${ATTR.sticky}] {
      position: static !important;
      inset: auto !important;
    }
    html[${ATTR.root}="searchable"],
    html[${ATTR.root}="searchable"] body,
    html[${ATTR.root}="searchable"] [${ATTR.path}],
    html[${ATTR.root}="searchable"] [${ATTR.target}],
    html[${ATTR.root}="searchable"] [${ATTR.expanded}] {
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: visible !important;
      flex: 0 0 auto !important;
    }
    html[${ATTR.root}="searchable"] [${ATTR.target}],
    html[${ATTR.root}="searchable"] [${ATTR.target}] * {
      content-visibility: visible !important;
    }
    html[${ATTR.root}] [${ATTR.internal}] {
      height: var(--getsome-capture-height) !important;
      max-height: var(--getsome-capture-height) !important;
      overflow-y: auto !important;
    }
    html[${ATTR.root}="searchable"] body > :not([${ATTR.printShell}]) {
      display: none !important;
    }
    html[${ATTR.root}="searchable"] [${ATTR.printShell}] {
      display: block !important;
      box-sizing: border-box !important;
      width: min(100%, 7.8in) !important;
      margin: 0 auto !important;
      padding: 0 !important;
      color: #111 !important;
      background: #fff !important;
      font: 11pt/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }
    html[${ATTR.root}="searchable"] [${ATTR.printShell}] * {
      box-sizing: border-box !important;
      max-width: 100% !important;
      color: inherit !important;
      background: transparent !important;
      position: static !important;
    }
    html[${ATTR.root}="searchable"] [${ATTR.printShell}] section {
      padding: 0 0 0.22in !important;
      margin: 0 0 0.22in !important;
      border-bottom: 1px solid #ddd !important;
    }
    html[${ATTR.root}="searchable"] [${ATTR.printShell}] h2 {
      margin: 0 0 0.1in !important;
      font-size: 14pt !important;
    }
    html[${ATTR.root}="searchable"] [${ATTR.printShell}] table {
      width: 100% !important;
      border-collapse: collapse !important;
    }
    html[${ATTR.root}="searchable"] [${ATTR.printShell}] th,
    html[${ATTR.root}="searchable"] [${ATTR.printShell}] td {
      padding: 5px 7px !important;
      border: 1px solid #bbb !important;
      vertical-align: top !important;
    }
    html[${ATTR.root}="searchable"] [${ATTR.printShell}] pre {
      padding: 8px !important;
      white-space: pre-wrap !important;
      overflow-wrap: anywhere !important;
      background: #f5f5f5 !important;
    }
    html[${ATTR.root}="searchable"] [${ATTR.printShell}] img {
      display: block !important;
      height: auto !important;
      margin: 0.08in 0 !important;
    }
  `;

  function markPath(target, mark) {
    if (target === document.body || target === document.documentElement) return;
    mark(target, ATTR.target);
    let ancestor = target.parentElement;
    while (ancestor && ancestor !== document.documentElement) {
      mark(ancestor, ATTR.path);
      ancestor = ancestor.parentElement;
    }
  }

  function markClutter(target, mark) {
    const selectors = [
      "nav",
      "aside",
      "[role='navigation']",
      "[role='complementary']",
      "[role='dialog']",
      "[aria-modal='true']",
      "[role='toolbar']",
      "button",
      "input",
      "select",
      "textarea",
      "[contenteditable='true']",
      "[role='button']",
      "[role='textbox']",
      "[aria-hidden='true']",
      "[data-testid='thread-footer-overflow-spacer']",
      "[data-testid='thread-disclaimer']",
    ].join(",");
    for (const element of target.querySelectorAll(selectors)) mark(element, ATTR.hidden);
    if (target === document.body) {
      for (const element of document.querySelectorAll("body > header, body > footer")) {
        mark(element, ATTR.hidden);
      }
    }

    const descendants = target.querySelectorAll("*");
    const limit = Math.min(descendants.length, 15_000);
    for (let index = 0; index < limit; index += 1) {
      const element = descendants[index];
      if (element.hasAttribute(ATTR.hidden)) continue;
      const position = getComputedStyle(element).position;
      if (position === "fixed") mark(element, ATTR.hidden);
      else if (position === "sticky") mark(element, ATTR.sticky);
    }
  }

  function markExpandableContent(target, mark) {
    const elements = [target, ...target.querySelectorAll("*")];
    const limit = Math.min(elements.length, 15_000);
    for (let index = 0; index < limit; index += 1) {
      const element = elements[index];
      if (element.hasAttribute(ATTR.hidden)) continue;
      const style = getComputedStyle(element);
      if (element.scrollHeight > element.clientHeight + 8 && /(auto|scroll|overlay|hidden)/.test(style.overflowY)) {
        mark(element, ATTR.expanded);
      }
    }
  }

  /** Scrolls a generic document without refusing long or slowly growing pages. */
  async function warmDocument() {
    let y = 0;
    let steps = 0;
    const step = Math.max(400, Math.floor(innerHeight * 0.82));
    while (y < documentHeight() - innerHeight && steps < 480) {
      scrollTo({ top: y, behavior: "instant" });
      await settle(85);
      y += step;
      steps += 1;
    }
    scrollTo({ top: Math.max(0, documentHeight() - innerHeight), behavior: "instant" });
    await settle(350);
    scrollTo({ top: 0, behavior: "instant" });
    await settle(120);
  }

  function normalizeExtractedText(text) {
    return text
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function speakerLabel(role) {
    if (role === "user") return "You";
    if (role === "assistant") return "Assistant";
    if (role === "system") return "System";
    if (role === "tool") return "Tool";
    return role ? `${role[0].toUpperCase()}${role.slice(1)}` : "Speaker";
  }

  function structuredTranscript(target) {
    const messages = [...target.querySelectorAll("[data-message-author-role]")]
      .filter((element) => element.getAttribute("aria-hidden") !== "true" && getComputedStyle(element).display !== "none")
      .map((element) => ({
        role: element.getAttribute("data-message-author-role") || "",
        text: normalizeExtractedText(element.innerText || ""),
      }))
      .filter((message) => message.text);
    if (messages.length < 2) return "";
    return messages
      .map((message) => `${speakerLabel(message.role)}:\n${message.text}`)
      .join("\n\n");
  }

  function escapeMarkdownText(text) {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/([*_`\[\]])/g, "\\$1")
      .replace(/</g, "\\<")
      .replace(/>/g, "\\>");
  }

  function normalizeMarkdown(markdown) {
    const output = [];
    let fenceCharacter = "";
    let fenceLength = 0;
    let previousWasBlank = false;

    for (const sourceLine of markdown.replace(/\r\n?/g, "\n").split("\n")) {
      const line = fenceCharacter ? sourceLine : sourceLine.replace(/[ \t]+$/g, "");
      const fence = line.trimStart().match(/^(`{3,}|~{3,})/);
      if (fence) {
        const character = fence[1][0];
        if (!fenceCharacter) {
          fenceCharacter = character;
          fenceLength = fence[1].length;
        } else if (character === fenceCharacter && fence[1].length >= fenceLength) {
          fenceCharacter = "";
          fenceLength = 0;
        }
        output.push(line);
        previousWasBlank = false;
        continue;
      }

      if (fenceCharacter) {
        output.push(line);
      } else if (!line.trim()) {
        if (output.length && !previousWasBlank) output.push("");
        previousWasBlank = true;
      } else {
        output.push(line);
        previousWasBlank = false;
      }
    }

    while (output.at(-1) === "") output.pop();
    return output.join("\n").trim();
  }

  function shouldSkipMarkdownElement(element) {
    if (element.hasAttribute(ATTR.hidden) || element.hidden || element.getAttribute("aria-hidden") === "true") return true;
    if (["BUTTON", "INPUT", "SELECT", "TEXTAREA", "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "CANVAS", "AUDIO", "VIDEO", "FORM"].includes(element.tagName)) {
      return true;
    }
    return ["button", "toolbar", "navigation", "dialog", "textbox", "complementary"].includes(element.getAttribute("role"));
  }

  function markdownFence(text, minimum = 1) {
    const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
    return "`".repeat(Math.max(minimum, longest + 1));
  }

  function renderMarkdownChildren(element, context = {}) {
    return [...element.childNodes].map((child) => renderMarkdownNode(child, context)).join("");
  }

  function renderMarkdownList(list, depth = 0) {
    const ordered = list.tagName === "OL";
    const start = ordered ? Number.parseInt(list.getAttribute("start") || "1", 10) : 1;
    const indent = "  ".repeat(depth);
    const lines = [];
    const items = [...list.children].filter((child) => child.tagName === "LI");

    items.forEach((item, index) => {
      const nestedLists = [...item.children].filter((child) => child.tagName === "UL" || child.tagName === "OL");
      const body = normalizeMarkdown(
        [...item.childNodes]
          .filter((child) => !(child.nodeType === Node.ELEMENT_NODE && (child.tagName === "UL" || child.tagName === "OL")))
          .map((child) => renderMarkdownNode(child))
          .join(""),
      );
      const marker = ordered ? `${start + index}. ` : "- ";
      const bodyLines = body ? body.split("\n") : [""];
      lines.push(`${indent}${marker}${bodyLines[0]}`);
      for (const continuation of bodyLines.slice(1)) lines.push(`${indent}  ${continuation}`);
      for (const nested of nestedLists) lines.push(renderMarkdownList(nested, depth + 1));
    });
    return lines.join("\n");
  }

  function renderMarkdownTable(table) {
    const rows = [...table.rows]
      .map((row) => [...row.cells].map((cell) => (
        normalizeMarkdown(renderMarkdownChildren(cell))
          .replace(/\n+/g, "<br>")
          .replace(/\|/g, "\\|")
      )))
      .filter((row) => row.length);
    if (!rows.length) return "";
    const width = Math.max(...rows.map((row) => row.length));
    const padded = rows.map((row) => [...row, ...Array(width - row.length).fill("")]);
    return [
      `| ${padded[0].join(" | ")} |`,
      `| ${Array(width).fill("---").join(" | ")} |`,
      ...padded.slice(1).map((row) => `| ${row.join(" | ")} |`),
    ].join("\n");
  }

  function renderMarkdownNode(node, context = {}) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = context.preformatted ? node.nodeValue || "" : (node.nodeValue || "").replace(/\s+/g, " ");
      return context.preformatted ? text : escapeMarkdownText(text);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const element = node;
    if (shouldSkipMarkdownElement(element)) return "";
    const tag = element.tagName;
    if (tag === "BR") return "\n";
    if (tag === "HR") return "\n\n---\n\n";

    if (tag === "PRE") {
      const codeElement = element.querySelector("code");
      const code = (codeElement?.textContent || element.textContent || "").replace(/^\n/, "").replace(/\n+$/, "");
      const language = codeElement?.className.match(/(?:^|\s)language-([\w+-]+)/)?.[1] || "";
      const fence = markdownFence(code, 3);
      return `\n\n${fence}${language}\n${code}\n${fence}\n\n`;
    }
    if (tag === "CODE") {
      const code = (element.textContent || "").replace(/\s+/g, " ");
      const fence = markdownFence(code);
      const padding = /^`|`$|^\s|\s$/.test(code) ? " " : "";
      return `${fence}${padding}${code}${padding}${fence}`;
    }

    if (/^H[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      return `\n\n${"#".repeat(level)} ${normalizeMarkdown(renderMarkdownChildren(element))}\n\n`;
    }
    if (tag === "STRONG" || tag === "B") return `**${renderMarkdownChildren(element)}**`;
    if (tag === "EM" || tag === "I") return `*${renderMarkdownChildren(element)}*`;
    if (tag === "DEL" || tag === "S") return `~~${renderMarkdownChildren(element)}~~`;
    if (tag === "A") {
      const label = normalizeMarkdown(renderMarkdownChildren(element)).trim();
      const href = element.href || element.getAttribute("href") || "";
      if (!href || /^(javascript:|data:)/i.test(href) || label === href) return label || href;
      return `[${label || href}](${href.replace(/\)/g, "%29")})`;
    }
    if (tag === "IMG") {
      const alt = element.getAttribute("alt") || "Image";
      const source = element.currentSrc || element.src || "";
      return source && !/^(data:|blob:)/i.test(source) ? `![${escapeMarkdownText(alt)}](${source})` : `[Image: ${escapeMarkdownText(alt)}]`;
    }
    if (tag === "BLOCKQUOTE") {
      const quote = normalizeMarkdown(renderMarkdownChildren(element));
      return `\n\n${quote.split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
    }
    if (tag === "UL" || tag === "OL") return `\n\n${renderMarkdownList(element)}\n\n`;
    if (tag === "TABLE") return `\n\n${renderMarkdownTable(element)}\n\n`;

    const children = renderMarkdownChildren(element, context);
    if (["P", "DIV", "SECTION", "ARTICLE", "MAIN", "FIGURE", "FIGCAPTION", "DETAILS", "SUMMARY", "DL", "DT", "DD"].includes(tag)) {
      return `\n\n${children}\n\n`;
    }
    return children;
  }

  function structuredMarkdown(target) {
    const messages = [...target.querySelectorAll("[data-message-author-role]")]
      .filter((element) => element.getAttribute("aria-hidden") !== "true" && getComputedStyle(element).display !== "none")
      .map((element) => ({
        role: element.getAttribute("data-message-author-role") || "",
        markdown: normalizeMarkdown(renderMarkdownChildren(element)),
      }))
      .filter((message) => message.markdown);
    if (messages.length < 2) return "";
    return messages
      .map((message) => `## ${speakerLabel(message.role)}\n\n${message.markdown}`)
      .join("\n\n");
  }

  function turnOrder(turn, fallback) {
    const testId = turn.getAttribute("data-testid") || "";
    const number = Number.parseInt(testId.match(/conversation-turn-(\d+)/)?.[1] || "", 10);
    return Number.isFinite(number) ? number : fallback;
  }

  function turnKey(turn, fallback) {
    return turn.getAttribute("data-turn-id")
      || turn.getAttribute("data-testid")
      || `turn-${fallback}`;
  }

  function hasMeaningfulImageSize(image) {
    const rect = image.getBoundingClientRect();
    const width = Math.max(rect.width, image.naturalWidth || 0, Number(image.getAttribute("width")) || 0);
    const height = Math.max(rect.height, image.naturalHeight || 0, Number(image.getAttribute("height")) || 0);
    return width >= 48 && height >= 48;
  }

  function meaningfulTurnImages(turn, message) {
    return [...turn.querySelectorAll("img")].filter((image) => (
      !message.contains(image)
      && !image.closest("button,[role='button'],[aria-hidden='true']")
      && hasMeaningfulImageSize(image)
    ));
  }

  function clonePrintableTurn(turn, message, role, images) {
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    heading.textContent = speakerLabel(role);
    section.append(heading);

    for (const image of images) {
      const clone = image.cloneNode(false);
      const source = image.currentSrc || image.src;
      if (source) clone.src = source;
      clone.removeAttribute("style");
      section.append(clone);
    }

    const content = message.cloneNode(true);
    for (const element of content.querySelectorAll([
      "button", "input", "select", "textarea", "script", "style", "noscript",
      "template", "svg", "canvas", "audio", "video", "form",
      "[role='button']", "[role='toolbar']", "[role='navigation']",
      "[role='dialog']", "[aria-hidden='true']",
    ].join(","))) element.remove();
    section.append(content);
    return section;
  }

  function turnRecord(turn, fallback) {
    const message = turn.querySelector("[data-message-author-role]");
    if (!message || message.getAttribute("aria-hidden") === "true" || getComputedStyle(message).display === "none") return null;
    const role = message.getAttribute("data-message-author-role") || "";
    const images = meaningfulTurnImages(turn, message);
    const textImages = [...new Set([
      ...images,
      ...message.querySelectorAll("img"),
    ])].filter((image) => (
      !image.closest("button,[role='button'],[aria-hidden='true']")
      && hasMeaningfulImageSize(image)
    ));
    const imageMarkdown = images.map((image) => normalizeMarkdown(renderMarkdownNode(image))).filter(Boolean);
    const imageText = textImages.map((image) => `[Image: ${image.getAttribute("alt") || "uploaded image"}]`);
    const markdown = normalizeMarkdown([
      ...imageMarkdown,
      normalizeMarkdown(renderMarkdownChildren(message)),
    ].filter(Boolean).join("\n\n"));
    const text = normalizeExtractedText([
      ...imageText,
      message.innerText || "",
    ].filter(Boolean).join("\n\n"));
    if (!markdown && !text && !images.length) return null;
    return {
      key: turnKey(turn, fallback),
      order: turnOrder(turn, fallback),
      role,
      markdown,
      text,
      printNode: clonePrintableTurn(turn, message, role, images),
    };
  }

  function scrollPosition(host) {
    return host ? host.scrollTop : scrollY;
  }

  function scrollMaximum(host) {
    return host
      ? Math.max(0, host.scrollHeight - host.clientHeight)
      : Math.max(0, documentHeight() - innerHeight);
  }

  function scrollViewport(host) {
    return host ? host.clientHeight : innerHeight;
  }

  function turnScrollPosition(turn, host) {
    const rect = turn.getBoundingClientRect();
    if (!host) return Math.max(0, rect.top + scrollY);
    const hostRect = host.getBoundingClientRect();
    return Math.max(0, rect.top - hostRect.top + host.scrollTop);
  }

  /** Collects every transiently mounted conversation turn from top to bottom. */
  async function collectStructuredTurns(target) {
    const initialTurns = [...target.querySelectorAll("[data-testid^='conversation-turn-']")];
    if (initialTurns.length < 2 || !globalThis.GetSomeCaptureCore?.collectVirtualized) return null;
    const host = isInternalScroller(target) ? target : findScrollableAncestor(target);

    const snapshot = () => {
      const turns = [...target.querySelectorAll("[data-testid^='conversation-turn-']")];
      return {
        expected: turns.map((turn, index) => ({
          key: turnKey(turn, index),
          order: turnOrder(turn, index),
          position: turnScrollPosition(turn, host),
        })),
        records: turns.map(turnRecord).filter(Boolean),
      };
    };

    const moveTo = async (requested, attempt) => {
      const maximum = scrollMaximum(host);
      const position = Math.min(Math.max(0, requested), maximum);
      if (attempt > 0) {
        const turns = [...target.querySelectorAll("[data-testid^='conversation-turn-']")];
        const nearest = turns.sort((left, right) => (
          Math.abs(turnScrollPosition(left, host) - position) - Math.abs(turnScrollPosition(right, host) - position)
        ))[0];
        nearest?.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      }
      if (host) {
        host.scrollTop = position;
        host.dispatchEvent(new Event("scroll", { bubbles: false }));
      } else {
        scrollTo({ left: 0, top: position, behavior: "instant" });
      }
    };

    return globalThis.GetSomeCaptureCore.collectVirtualized({
      snapshot,
      moveTo,
      currentPosition: () => scrollPosition(host),
      maxPosition: () => scrollMaximum(host),
      viewportSize: () => scrollViewport(host),
      settle: (attempt) => settle(150 + attempt * 140),
      retryCount: 3,
      maxMilliseconds: 180_000,
      maxSteps: 1_200,
    });
  }

  function transcriptFromCollection(collection) {
    return collection.records
      .filter((record) => record.text)
      .map((record) => `${speakerLabel(record.role)}:\n${record.text}`)
      .join("\n\n");
  }

  function markdownFromCollection(collection) {
    return collection.records
      .filter((record) => record.markdown)
      .map((record) => `## ${speakerLabel(record.role)}\n\n${record.markdown}`)
      .join("\n\n");
  }

  function installPrintShell(collection, context) {
    const shell = document.createElement("article");
    shell.setAttribute(ATTR.printShell, "");
    for (const record of collection.records) {
      if (record.printNode) shell.append(record.printNode);
    }
    document.body.append(shell);
    context.printShell = shell;
    return shell;
  }

  async function withCleanTextSource(mode, extract) {
    await restoreExport();
    state.pickerCleanup?.();

    const target = currentTarget();
    if (!target) throw new Error("The page has no text source.");

    const context = {
      mode,
      target,
      marks: [],
      style: document.createElement("style"),
      originalWindowX: scrollX,
      originalWindowY: scrollY,
      originalScrolls: rememberScrollPositions(target),
      plan: null,
    };
    state.exportContext = context;
    const mark = makeMarker(context);

    try {
      mark(document.documentElement, ATTR.root, mode);
      markClutter(target, mark);
      context.style.textContent = BASE_EXPORT_CSS;
      document.documentElement.append(context.style);
      await settle(50);
      return await extract(target);
    } finally {
      await restoreExport();
    }
  }

  /** Copies all visible text from the selected or automatically detected source. */
  async function extractText() {
    return withCleanTextSource("text", async (target) => {
      const collection = await collectStructuredTurns(target);
      const text = collection
        ? transcriptFromCollection(collection)
        : structuredTranscript(target) || normalizeExtractedText(target.innerText || "");
      if (!text) throw new Error("No visible text was found in the selected content.");
      return {
        text,
        description: describeElement(target),
        partial: Boolean(collection && !collection.complete),
        missingCount: collection?.missingKeys.length || 0,
      };
    });
  }

  /** Produces a portable Markdown transcript without page controls or action rows. */
  async function extractMarkdown() {
    return withCleanTextSource("markdown", async (target) => {
      const collection = await collectStructuredTurns(target);
      const markdown = collection
        ? markdownFromCollection(collection)
        : structuredMarkdown(target) || normalizeMarkdown(renderMarkdownNode(target));
      if (!markdown) throw new Error("No visible text was found in the selected content.");
      return {
        markdown,
        description: describeElement(target),
        partial: Boolean(collection && !collection.complete),
        missingCount: collection?.missingKeys.length || 0,
      };
    });
  }

  /** Applies reversible cleanup and returns the geometry needed by the exporter. */
  async function prepareExport(mode) {
    await restoreExport();
    state.pickerCleanup?.();

    const target = currentTarget();
    if (!target) throw new Error("The page has no printable content.");

    const context = {
      mode,
      target,
      scrollHost: mode === "scrolling" ? findScrollableAncestor(target) : null,
      marks: [],
      style: document.createElement("style"),
      originalWindowX: scrollX,
      originalWindowY: scrollY,
      originalScrolls: rememberScrollPositions(target),
      plan: null,
    };
    state.exportContext = context;
    const mark = makeMarker(context);

    if (mode === "searchable") {
      const collection = await collectStructuredTurns(target);
      if (collection?.records.length >= 2) {
        mark(document.documentElement, ATTR.root, mode);
        context.style.textContent = BASE_EXPORT_CSS;
        document.documentElement.append(context.style);
        installPrintShell(collection, context);
        await settle(120);
        return {
          description: describeElement(target),
          partial: !collection.complete,
          missingCount: collection.missingKeys.length,
        };
      }
    }

    mark(document.documentElement, ATTR.root, mode);
    markPath(target, mark);
    markClutter(target, mark);
    context.style.textContent = BASE_EXPORT_CSS;
    document.documentElement.append(context.style);
    await settle(80);

    if (mode === "searchable") {
      for (const position of context.originalScrolls) {
        position.element.scrollLeft = 0;
        position.element.scrollTop = 0;
      }
      scrollTo({ left: 0, top: 0, behavior: "instant" });
      await settle(80);
      markExpandableContent(target, mark);
      await settle(80);
      await warmDocument();
      return { description: describeElement(target) };
    }

    context.plan = await makeCapturePlan(context, mark);
    return context.plan;
  }

  async function makeCapturePlan(context, mark) {
    const { target } = context;
    if (isInternalScroller(target)) {
      target.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
      await settle(100);
      const captureHeight = Math.max(120, Math.min(target.clientHeight, innerHeight - 12));
      context.capturePropertyValue = target.style.getPropertyValue("--getsome-capture-height");
      context.capturePropertyPriority = target.style.getPropertyPriority("--getsome-capture-height");
      target.style.setProperty("--getsome-capture-height", `${Math.floor(captureHeight)}px`);
      context.removeCaptureProperty = true;
      mark(target, ATTR.internal);
      await settle(120);
      target.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
      await settle(80);
      const rect = target.getBoundingClientRect();
      return {
        kind: "element",
        contentHeight: target.scrollHeight,
        viewportHeight: target.clientHeight,
        contentWidth: rect.width,
        description: describeElement(target),
      };
    }

    if (context.scrollHost?.isConnected && isInternalScroller(context.scrollHost)) {
      const host = context.scrollHost;
      let hostRect = host.getBoundingClientRect();
      let targetRect = target.getBoundingClientRect();
      const targetOffset = targetRect.top - hostRect.top + host.scrollTop;
      host.scrollTop = Math.max(0, targetOffset);
      host.dispatchEvent(new Event("scroll", { bubbles: false }));
      await settle(150);
      hostRect = host.getBoundingClientRect();
      targetRect = target.getBoundingClientRect();
      const visibleHeight = Math.max(1, Math.min(hostRect.bottom, innerHeight) - Math.max(hostRect.top, 0));
      return {
        kind: "ancestor",
        contentHeight: Math.min(
          Math.max(targetRect.height, target.scrollHeight),
          Math.max(1, host.scrollHeight - targetOffset),
        ),
        viewportHeight: Math.min(host.clientHeight, visibleHeight),
        contentWidth: Math.min(targetRect.right, hostRect.right) - Math.max(targetRect.left, hostRect.left),
        targetOffset,
        description: describeElement(target),
      };
    }

    const rect = target === document.body
      ? { top: -scrollY, left: -scrollX, width: document.documentElement.clientWidth, height: documentHeight() }
      : target.getBoundingClientRect();
    return {
      kind: "document",
      contentHeight: target === document.body ? documentHeight() : Math.max(rect.height, target.scrollHeight),
      viewportHeight: innerHeight,
      contentWidth: rect.width,
      description: describeElement(target),
    };
  }

  /** Scrolls to one uncaptured offset and returns an exact CDP screenshot clip. */
  async function setCapturePosition(coverage) {
    const context = state.exportContext;
    if (!context || context.mode !== "scrolling" || !context.plan) {
      throw new Error("The scrolling capture was not prepared.");
    }
    const { target, plan } = context;

    const moveScroller = async (element, desired) => {
      let actual = element.scrollTop;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        element.scrollTop = desired;
        element.dispatchEvent(new Event("scroll", { bubbles: false }));
        await settle(170 + attempt * 130);
        actual = element.scrollTop;
        if (Math.abs(actual - desired) <= 3) break;
        const turns = [...target.querySelectorAll("[data-testid^='conversation-turn-']")];
        const nearest = turns.sort((left, right) => (
          Math.abs(turnScrollPosition(left, element) - desired)
          - Math.abs(turnScrollPosition(right, element) - desired)
        ))[0];
        nearest?.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      }
      return actual;
    };

    if (plan.kind === "element") {
      const total = target.scrollHeight;
      if (coverage >= total) return { done: true, contentHeight: total };
      const viewportHeight = target.clientHeight;
      const desiredScroll = Math.min(coverage, Math.max(0, total - viewportHeight));
      const actualScroll = await moveScroller(target, desiredScroll);
      const offset = Math.max(0, coverage - actualScroll);
      const height = Math.min(viewportHeight - offset, total - coverage);
      if (height < 1) return { done: true, incomplete: true, contentHeight: total };
      const rect = target.getBoundingClientRect();
      return {
        contentHeight: total,
        clip: {
          x: rect.left + scrollX,
          y: rect.top + scrollY + offset,
          width: rect.width,
          height,
        },
      };
    }

    if (plan.kind === "ancestor") {
      const host = context.scrollHost;
      if (!host?.isConnected) throw new Error("The page replaced its scrolling region during capture.");
      const total = Math.min(
        Math.max(target.getBoundingClientRect().height, target.scrollHeight),
        Math.max(1, host.scrollHeight - plan.targetOffset),
      );
      if (coverage >= total) return { done: true, contentHeight: total };
      const desiredScroll = Math.min(plan.targetOffset + coverage, Math.max(0, host.scrollHeight - host.clientHeight));
      await moveScroller(host, desiredScroll);

      const visibleStart = Math.max(0, host.scrollTop - plan.targetOffset);
      const offset = Math.max(0, coverage - visibleStart);
      const hostRect = host.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const captureTop = Math.max(targetRect.top + coverage, hostRect.top, 0);
      const visibleBottom = Math.min(hostRect.bottom, innerHeight);
      const height = Math.min(plan.viewportHeight - offset, total - coverage, visibleBottom - captureTop);
      if (height < 1) return { done: true, incomplete: true, contentHeight: total };
      const left = Math.max(targetRect.left, hostRect.left);
      const right = Math.min(targetRect.right, hostRect.right);
      return {
        contentHeight: total,
        clip: {
          x: left + scrollX,
          y: captureTop + scrollY,
          width: right - left,
          height,
        },
      };
    }

    let rect = context.target === document.body
      ? { top: -scrollY, left: -scrollX, width: document.documentElement.clientWidth, height: documentHeight() }
      : context.target.getBoundingClientRect();
    let targetTop = rect.top + scrollY;
    scrollTo({ top: Math.max(0, targetTop + coverage), behavior: "instant" });
    await settle(190);

    rect = context.target === document.body
      ? { top: -scrollY, left: -scrollX, width: document.documentElement.clientWidth, height: documentHeight() }
      : context.target.getBoundingClientRect();
    targetTop = rect.top + scrollY;
    const total = context.target === document.body ? documentHeight() : Math.max(rect.height, context.target.scrollHeight);
    const height = Math.min(plan.viewportHeight, total - coverage);
    if (height < 1) return { done: true, contentHeight: total };
    return {
      contentHeight: total,
      clip: {
        x: rect.left + scrollX,
        y: targetTop + coverage,
        width: rect.width,
        height,
      },
    };
  }

  /** Restores scroll positions, attributes, and styles changed for export. */
  async function restoreExport() {
    const context = state.exportContext;
    if (!context) return { restored: false };
    state.exportContext = null;

    context.printShell?.remove();
    context.style.remove();
    if (context.removeCaptureProperty && context.target?.isConnected) {
      if (context.capturePropertyValue) {
        context.target.style.setProperty(
          "--getsome-capture-height",
          context.capturePropertyValue,
          context.capturePropertyPriority,
        );
      } else {
        context.target.style.removeProperty("--getsome-capture-height");
      }
    }
    for (let index = context.marks.length - 1; index >= 0; index -= 1) {
      const [element, attribute, previous] = context.marks[index];
      if (!element.isConnected) continue;
      if (previous === null) element.removeAttribute(attribute);
      else element.setAttribute(attribute, previous);
    }
    for (const position of context.originalScrolls) {
      if (!position.element.isConnected) continue;
      position.element.scrollLeft = position.left;
      position.element.scrollTop = position.top;
    }
    scrollTo({ left: context.originalWindowX, top: context.originalWindowY, behavior: "instant" });
    await settle(50);
    return { restored: true };
  }

  const handlers = {
    GET_STATUS: () => status(),
    START_PICKER: () => startPicker(),
    CLEAR_SELECTION: () => {
      state.selected = null;
      return status();
    },
    EXTRACT_TEXT: () => extractText(),
    EXTRACT_MARKDOWN: () => extractMarkdown(),
    PREPARE_EXPORT: (message) => prepareExport(message.mode),
    SET_CAPTURE_POSITION: (message) => setCapturePosition(message.coverage),
    RESTORE_EXPORT: () => restoreExport(),
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const handler = handlers[message?.type];
    if (!handler) return false;
    Promise.resolve(handler(message))
      .then(sendResponse)
      .catch((error) => sendResponse({
        __getSomeError: error instanceof Error ? error.message : String(error),
      }));
    return true;
  });
})();
