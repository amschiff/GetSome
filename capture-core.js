/*
 * GetSome - virtualized content traversal
 *
 * Keeps records from transiently mounted slices while retrying scroll positions
 * that do not move or render on the first request.
 */

(() => {
  function recordScore(record) {
    return [record.markdown, record.text, record.printNode?.textContent]
      .reduce((total, value) => total + (value?.length || 0), 0);
  }

  function mergeSnapshot(records, expected, snapshot) {
    for (const item of snapshot.expected || []) {
      if (!item?.key) continue;
      const previous = expected.get(item.key);
      if (!previous || Number.isFinite(item.position)) {
        const merged = { ...previous, ...item };
        if (previous?.required || item.required) merged.required = true;
        else if (item.required === false) merged.required = false;
        expected.set(item.key, merged);
      }
    }
    for (const record of snapshot.records || []) {
      if (!record?.key) continue;
      const previous = records.get(record.key);
      if (!previous || recordScore(record) > recordScore(previous)) records.set(record.key, record);
    }
  }

  function sortedRecords(records, expected) {
    return [...records.values()].sort((left, right) => {
      const leftExpected = expected.get(left.key);
      const rightExpected = expected.get(right.key);
      const leftOrder = Number.isFinite(left.order) ? left.order : leftExpected?.order;
      const rightOrder = Number.isFinite(right.order) ? right.order : rightExpected?.order;
      if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return (leftExpected?.position || 0) - (rightExpected?.position || 0);
    });
  }

  /** Traverses a virtual list and retains records before their DOM slices unmount. */
  async function collectVirtualized(options) {
    const records = new Map();
    const expected = new Map();
    const retryCount = Math.max(1, options.retryCount || 3);
    const maxMilliseconds = Math.max(1_000, options.maxMilliseconds || 180_000);
    const maxSteps = Math.max(1, options.maxSteps || 1_200);
    const startedAt = Date.now();
    let steps = 0;
    let stoppedReason = "";

    const sample = async () => {
      const snapshot = await options.snapshot();
      mergeSnapshot(records, expected, snapshot || {});
      return snapshot || {};
    };

    const visit = async (requestedPosition) => {
      for (let attempt = 0; attempt < retryCount; attempt += 1) {
        if (Date.now() - startedAt >= maxMilliseconds) {
          stoppedReason = "The page traversal reached its time limit.";
          return false;
        }
        if (steps >= maxSteps) {
          stoppedReason = "The page traversal reached its safety step limit.";
          return false;
        }
        steps += 1;
        await options.moveTo(requestedPosition, attempt);
        await options.settle(attempt);
        await sample();

        const maximum = Math.max(0, Number(await options.maxPosition()) || 0);
        const requested = Math.min(Math.max(0, requestedPosition), maximum);
        const actual = Math.max(0, Number(await options.currentPosition()) || 0);
        const tolerance = Math.max(3, (Number(await options.viewportSize()) || 1) * 0.08);
        if (Math.abs(actual - requested) <= tolerance || (requested === maximum && actual >= maximum - tolerance)) {
          return true;
        }
      }
      return true;
    };

    await sample();
    await visit(0);

    let position = 0;
    while (!stoppedReason) {
      const maximum = Math.max(0, Number(await options.maxPosition()) || 0);
      const viewport = Math.max(240, Number(await options.viewportSize()) || 800);
      const stride = Math.max(180, Math.floor(viewport * 0.58));
      if (position >= maximum) {
        await visit(maximum);
        break;
      }
      position = Math.min(maximum, position + stride);
      if (!await visit(position)) break;
    }

    // Placeholder positions remain present on ChatGPT even while their message
    // contents are unmounted. Re-anchor every missed turn individually.
    for (let pass = 0; pass < 2 && !stoppedReason; pass += 1) {
      const missing = [...expected.values()].filter((item) => item.required !== false && !records.has(item.key));
      if (!missing.length) break;
      const before = records.size;
      for (const item of missing) {
        if (!await visit(item.position || 0)) break;
      }
      if (records.size === before) break;
    }

    const requiredItems = [...expected.values()].filter((item) => item.required !== false);
    const inactiveKeys = [...expected.values()]
      .filter((item) => item.required === false && !records.has(item.key))
      .map((item) => item.key);
    const missingKeys = requiredItems.filter((item) => !records.has(item.key)).map((item) => item.key);
    return {
      records: sortedRecords(records, expected),
      expectedCount: requiredItems.length,
      complete: !stoppedReason && missingKeys.length === 0,
      missingKeys,
      inactiveKeys,
      stoppedReason,
      steps,
    };
  }

  /** Applies familiar single, range, and additive selection semantics. */
  function updateTurnSelection({ orderedKeys, selectedKeys, anchorKey, clickedKey, shiftKey, additiveKey }) {
    const selected = new Set(selectedKeys || []);
    const clickedIndex = orderedKeys.indexOf(clickedKey);
    if (clickedIndex < 0) return { selectedKeys: selected, anchorKey };

    if (shiftKey && anchorKey && orderedKeys.includes(anchorKey)) {
      const anchorIndex = orderedKeys.indexOf(anchorKey);
      const start = Math.min(anchorIndex, clickedIndex);
      const end = Math.max(anchorIndex, clickedIndex);
      if (!additiveKey) selected.clear();
      for (const key of orderedKeys.slice(start, end + 1)) selected.add(key);
      return { selectedKeys: selected, anchorKey };
    }

    if (additiveKey) {
      if (selected.has(clickedKey)) selected.delete(clickedKey);
      else selected.add(clickedKey);
    } else {
      selected.clear();
      selected.add(clickedKey);
    }
    return { selectedKeys: selected, anchorKey: clickedKey };
  }

  globalThis.GetSomeCaptureCore = { collectVirtualized, updateTurnSelection };
})();
