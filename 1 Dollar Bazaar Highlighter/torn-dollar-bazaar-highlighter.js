// ==UserScript==
// @name         Torn $1 Bazaar Highlighter @AmrisG
// @namespace    torn-dollar-bazaar-highlighter @AmrisG
// @version      1.2.1
// @description  Highlights visible $1 bazaar item cards and colors buyable ones differently.
// @author       AmrisG
// @match        https://www.torn.com/bazaar.php*
// @match        https://torn.com/bazaar.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  "use strict";

  const HIGHLIGHT_CLASS = "tdbh-dollar-sale";
  const BUYABLE_CLASS = "tdbh-buyable";
  const BADGE_CLASS = "tdbh-badge";
  const COUNT_ID = "tdbh-count";
  const RESCAN_ID = "tdbh-rescan";
  const STARTUP_SCAN_DELAYS = [300, 900, 1800, 3200, 5000];

  let scanTimers = [];

  addStyles();
  addControls();
  scanBurst();

  // Torn often renders bazaar rows after page load. This observer is throttled
  // and only reacts to added/removed nodes, avoiding continuous heavy scans.
  const observer = new MutationObserver((mutations) => {
    if (mutations.some(hasUsefulDomChange)) {
      scanBurst();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("hashchange", scanBurst);

  function scanBurst() {
    scanTimers.forEach(window.clearTimeout);
    scanTimers = [];
    STARTUP_SCAN_DELAYS.forEach(scheduleScan);
  }

  function hasUsefulDomChange(mutation) {
    return Array.from(mutation.addedNodes)
      .concat(Array.from(mutation.removedNodes))
      .some(
        (node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          !node.closest?.(`#${COUNT_ID}, #${RESCAN_ID}`),
      );
  }

  function scheduleScan(delay) {
    scanTimers.push(window.setTimeout(scanPage, delay));
  }

  function scanPage() {
    clearMarks();

    const priceNodes = findVisibleDollarPriceNodes();
    const items = [];

    for (const node of priceNodes) {
      const item = findItemCard(node.parentElement);
      if (!item || items.includes(item)) continue;
      items.push(item);
    }

    const buyableCount = items.filter(isBuyableItem).length;
    items.forEach(markItem);
    updateCount(items.length, buyableCount);
  }

  function findVisibleDollarPriceNodes() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!isExactDollarPrice(node.nodeValue)) {
            return NodeFilter.FILTER_REJECT;
          }

          const parent = node.parentElement;
          if (!parent || parent.closest(`#${COUNT_ID}, #${RESCAN_ID}`)) {
            return NodeFilter.FILTER_REJECT;
          }

          return isVisible(parent)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      },
    );

    const nodes = [];
    let node = walker.nextNode();
    while (node) {
      nodes.push(node);
      node = walker.nextNode();
    }
    return nodes;
  }

  function findItemCard(start) {
    let current = start;

    while (current && current !== document.body) {
      if (looksLikeOneItem(current)) return current;
      current = current.parentElement;
    }

    return null;
  }

  function looksLikeOneItem(element) {
    if (!isVisible(element)) return false;

    const text = normalizeText(element.textContent);
    if (!text.includes("$1")) return false;

    const images = element.querySelectorAll("img").length;
    if (images !== 1) return false;

    const exactPrices = countExactDollarPrices(element);
    if (exactPrices !== 1) return false;

    const rect = element.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 35) return false;
    if (rect.width > window.innerWidth * 0.5) return false;
    if (rect.height > 180) return false;

    return true;
  }

  function markItem(item) {
    item.classList.add(HIGHLIGHT_CLASS);
    item.classList.toggle(BUYABLE_CLASS, isBuyableItem(item));

    const badge = document.createElement("span");
    badge.className = BADGE_CLASS;
    badge.textContent = isBuyableItem(item) ? "$1 buy" : "$1";
    badge.dataset.tdbhBadge = "true";

    const target =
      item.querySelector('[class*="name"], [class*="title"]') ||
      item.firstElementChild ||
      item;
    target.insertAdjacentElement("afterbegin", badge);
  }

  function clearMarks() {
    document
      .querySelectorAll('[data-tdbh-badge="true"]')
      .forEach((badge) => badge.remove());

    document
      .querySelectorAll(`.${HIGHLIGHT_CLASS}`)
      .forEach((item) => item.classList.remove(HIGHLIGHT_CLASS, BUYABLE_CLASS));
  }

  function addControls() {
    const count = document.createElement("div");
    count.id = COUNT_ID;
    count.textContent = "$1 items: 0";

    const rescan = document.createElement("button");
    rescan.id = RESCAN_ID;
    rescan.type = "button";
    rescan.textContent = "Rescan $1";
    rescan.addEventListener("click", scanPage);

    document.body.appendChild(count);
    document.body.appendChild(rescan);
  }

  function updateCount(count, buyableCount) {
    const element = document.getElementById(COUNT_ID);
    if (element) element.textContent = `$1 items: ${count} | buyable: ${buyableCount}`;
  }

  function isBuyableItem(item) {
    if (hasLockedVisual(item)) return false;

    return Array.from(
      item.querySelectorAll('button, input[type="button"], input[type="submit"], a'),
    ).some(
      (control) =>
        isVisible(control) &&
        !isDisabled(control) &&
        !isViewOnlyControl(control) &&
        isActionControl(control),
    );
  }

  function isActionControl(control) {
    const text = controlLabel(control);
    const hint = normalizeText(
      [
        control.className,
        control.id,
        control.getAttribute("data-action"),
        control.getAttribute("data-testid"),
        control.innerHTML,
      ].join(" "),
    );

    return /\b(buy|cart|purchase|basket|shopping)\b/i.test(`${text} ${hint}`);
  }

  function isDisabled(control) {
    return (
      control.disabled ||
      control.getAttribute("aria-disabled") === "true" ||
      control.classList.contains("disabled") ||
      control.closest(".disabled") !== null
    );
  }

  function isViewOnlyControl(control) {
    const text = controlLabel(control);
    return /\b(view|preview|inspect|details)\b/i.test(text);
  }

  function hasLockedVisual(item) {
    return (
      item.querySelector(
        '[class*="lock" i], [aria-label*="lock" i], [title*="lock" i], img[src*="lock" i], svg[class*="lock" i]',
      ) !== null
    );
  }

  function controlLabel(control) {
    return normalizeText(
      control.value ||
        control.getAttribute("aria-label") ||
        control.getAttribute("title") ||
        control.getAttribute("href") ||
        control.textContent,
    );
  }

  function isExactDollarPrice(value) {
    return /^\s*\$1\s*$/.test(String(value || ""));
  }

  function countExactDollarPrices(element) {
    let count = 0;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (isExactDollarPrice(node.nodeValue)) count += 1;
      node = walker.nextNode();
    }
    return count;
  }

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function addStyles() {
    GM_addStyle(`
      .${HIGHLIGHT_CLASS} {
        outline: 3px solid #d6a537 !important;
        outline-offset: -3px !important;
        box-shadow: inset 0 0 0 9999px rgba(214, 165, 55, .12) !important;
      }
      .${HIGHLIGHT_CLASS}.${BUYABLE_CLASS} {
        outline-color: #31c36b !important;
        box-shadow: inset 0 0 0 9999px rgba(49, 195, 107, .14) !important;
      }
      .${BADGE_CLASS} {
        display: inline-flex !important;
        align-items: center !important;
        margin: 0 6px 4px 0 !important;
        padding: 2px 7px !important;
        border-radius: 4px !important;
        background: #d6a537 !important;
        color: #111 !important;
        font: 900 11px/1.4 Arial, sans-serif !important;
        text-shadow: none !important;
        white-space: nowrap !important;
      }
      .${HIGHLIGHT_CLASS}.${BUYABLE_CLASS} .${BADGE_CLASS} {
        background: #31c36b !important;
      }
      #${COUNT_ID}, #${RESCAN_ID} {
        position: fixed !important;
        right: 12px !important;
        z-index: 999999 !important;
        box-sizing: border-box !important;
        border: 1px solid #2f5d3b !important;
        background: #101410 !important;
        color: #9af0ad !important;
        font: 800 12px Arial, sans-serif !important;
        text-shadow: none !important;
      }
      #${COUNT_ID} {
        bottom: 50px !important;
        padding: 7px 10px !important;
        border-radius: 5px !important;
      }
      #${RESCAN_ID} {
        bottom: 12px !important;
        height: 30px !important;
        padding: 0 10px !important;
        border-radius: 5px !important;
        cursor: pointer !important;
      }
      #${RESCAN_ID}:hover {
        background: #172217 !important;
      }
    `);
  }
})();
