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

  /** Scrolls through a finite document once so lazy content has a chance to load. */
  async function warmDocument() {
    let y = 0;
    let steps = 0;
    const step = Math.max(400, Math.floor(innerHeight * 0.82));
    while (y < documentHeight() - innerHeight && steps < 160) {
      scrollTo({ top: y, behavior: "instant" });
      await settle(85);
      y += step;
      steps += 1;
      if (documentHeight() > 250_000) {
        throw new Error("This page is extremely long. Pick a smaller content region and try again.");
      }
    }
    if (steps === 160 && y < documentHeight() - innerHeight) {
      throw new Error("This page keeps growing. Pick a finite content region and try again.");
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

  /** Copies all visible text from the selected or automatically detected source. */
  async function extractText() {
    await restoreExport();
    state.pickerCleanup?.();

    const target = currentTarget();
    if (!target) throw new Error("The page has no text source.");

    const context = {
      mode: "text",
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
      mark(document.documentElement, ATTR.root, "text");
      markClutter(target, mark);
      context.style.textContent = BASE_EXPORT_CSS;
      document.documentElement.append(context.style);
      await settle(50);
      const text = structuredTranscript(target) || normalizeExtractedText(target.innerText || "");
      if (!text) throw new Error("No visible text was found in the selected content.");
      return { text, description: describeElement(target) };
    } finally {
      await restoreExport();
    }
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
        contentHeight: Math.max(targetRect.height, target.scrollHeight),
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

    if (plan.kind === "element") {
      const total = target.scrollHeight;
      const viewportHeight = target.clientHeight;
      const desiredScroll = Math.min(coverage, Math.max(0, total - viewportHeight));
      target.scrollTop = desiredScroll;
      target.dispatchEvent(new Event("scroll", { bubbles: false }));
      await settle(170);

      const actualScroll = target.scrollTop;
      const offset = Math.max(0, coverage - actualScroll);
      const height = Math.min(viewportHeight - offset, total - coverage);
      if (height < 1) throw new Error("The selected viewer would not scroll far enough to capture.");
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
      const total = Math.max(target.getBoundingClientRect().height, target.scrollHeight);
      const desiredScroll = Math.min(plan.targetOffset + coverage, Math.max(0, host.scrollHeight - host.clientHeight));
      host.scrollTop = desiredScroll;
      host.dispatchEvent(new Event("scroll", { bubbles: false }));
      await settle(190);

      const visibleStart = Math.max(0, host.scrollTop - plan.targetOffset);
      const offset = Math.max(0, coverage - visibleStart);
      const height = Math.min(plan.viewportHeight - offset, total - coverage);
      if (height < 1) throw new Error("The page stopped scrolling before all selected content was captured.");
      const hostRect = host.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const left = Math.max(targetRect.left, hostRect.left);
      const right = Math.min(targetRect.right, hostRect.right);
      return {
        contentHeight: total,
        clip: {
          x: left + scrollX,
          y: targetRect.top + scrollY + coverage,
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
