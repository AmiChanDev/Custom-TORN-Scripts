// ==UserScript==
// @name         Torn Xanax Bazaar Watcher @AmrisG
// @namespace    torn-xanax-bazaar-watcher @AmrisG
// @version      1.0.0
// @description  Watches Weav3r TornW3B bazaar listings and notifies when Xanax is listed at or below your target price.
// @author       AmrisG
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @connect      weav3r.dev
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_notification
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const STORE_KEY = "txbw:v1";
  const XANAX_ITEM_ID = 206;
  const XANAX_URL = "https://www.torn.com/imarket.php#/p=shop&type=&searchname=Xanax";
  const WEAV3R_URL = `https://weav3r.dev/api/marketplace/${XANAX_ITEM_ID}`;
  const DEFAULT_TARGET_PRICE = 820000;
  const DEFAULT_REFRESH_SECONDS = 30;
  const MIN_REFRESH_SECONDS = 10;

  const state = loadState();
  let isOpen = false;
  let isChecking = false;
  let refreshTimer = 0;
  let lastListings = [];
  let lastDeal = null;

  addStyles();
  buildShell();
  syncInputs();
  render();
  scheduleNextCheck(1000);

  function buildShell() {
    const toggle = document.createElement("button");
    toggle.id = "txbw-toggle";
    toggle.type = "button";
    toggle.textContent = "XANAX";
    toggle.title = "Open Xanax bazaar watcher";
    makeToggleMovable(toggle);
    toggle.addEventListener("click", () => {
      if (toggle.dataset.dragged === "true") {
        toggle.dataset.dragged = "";
        return;
      }
      setOpen(!isOpen);
    });

    const panel = document.createElement("section");
    panel.id = "txbw-panel";
    panel.innerHTML = `
      <div class="txbw-head">
        <div class="txbw-title">Xanax Watcher</div>
        <div class="txbw-head-actions">
          <button class="txbw-btn" id="txbw-refresh" type="button">Refresh</button>
          <button class="txbw-icon-btn" id="txbw-close" type="button" title="Close">&times;</button>
        </div>
      </div>
      <div class="txbw-stats">
        <div class="txbw-stat">
          <div class="txbw-label">Current lowest</div>
          <div class="txbw-value" id="txbw-current">-</div>
        </div>
        <div class="txbw-stat">
          <div class="txbw-label">Notify at/below</div>
          <div class="txbw-value warn" id="txbw-target">-</div>
        </div>
        <div class="txbw-stat">
          <div class="txbw-label">Last check</div>
          <div class="txbw-value" id="txbw-checked">Never</div>
        </div>
        <div class="txbw-stat">
          <div class="txbw-label">Matches</div>
          <div class="txbw-value good" id="txbw-matches">0</div>
        </div>
      </div>
      <div class="txbw-status" id="txbw-status">Watching Weav3r bazaar prices.</div>
      <div class="txbw-alert" id="txbw-alert">
        <div class="txbw-alert-title">Cheap Xanax found</div>
        <div class="txbw-alert-text" id="txbw-alert-text"></div>
        <div class="txbw-actions">
          <button class="txbw-btn txbw-primary" id="txbw-open-market" type="button">Open Item Market</button>
        </div>
      </div>
      <div class="txbw-section">
        <div class="txbw-grid">
          <label class="txbw-field">
            <span>Target price</span>
            <input id="txbw-target-input" class="txbw-input" type="number" min="1" step="1000" />
          </label>
          <label class="txbw-field">
            <span>Refresh seconds</span>
            <input id="txbw-interval-input" class="txbw-input" type="number" min="${MIN_REFRESH_SECONDS}" max="600" step="5" />
          </label>
        </div>
        <div class="txbw-actions">
          <button class="txbw-btn txbw-primary" id="txbw-save" type="button">Save Settings</button>
          <button class="txbw-btn" id="txbw-reset-seen" type="button">Reset Alerts</button>
        </div>
      </div>
      <div class="txbw-list-title">Cheapest Weav3r listings</div>
      <div id="txbw-list"></div>
    `;

    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    document
      .getElementById("txbw-close")
      .addEventListener("click", () => setOpen(false));
    document
      .getElementById("txbw-refresh")
      .addEventListener("click", () => checkMarket(true));
    document
      .getElementById("txbw-save")
      .addEventListener("click", saveSettings);
    document
      .getElementById("txbw-reset-seen")
      .addEventListener("click", resetSeen);
    document
      .getElementById("txbw-open-market")
      .addEventListener("click", openXanaxMarket);
  }

  function setOpen(nextOpen) {
    isOpen = nextOpen;
    document.getElementById("txbw-panel").classList.toggle("txbw-open", isOpen);
    document.getElementById("txbw-toggle").classList.toggle("txbw-attached", isOpen);
  }

  function makeToggleMovable(toggle) {
    applyToggleTop(toggle);

    let drag = null;
    toggle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const rect = toggle.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startTop: rect.top,
        moved: false,
      };
      toggle.setPointerCapture(event.pointerId);
    });

    toggle.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const deltaY = event.clientY - drag.startY;
      if (Math.abs(deltaY) > 3) drag.moved = true;
      if (!drag.moved) return;
      state.toggleTop = clampToggleTop(drag.startTop + deltaY, toggle);
      toggle.style.top = `${state.toggleTop}px`;
      event.preventDefault();
    });

    toggle.addEventListener("pointerup", finishToggleDrag);
    toggle.addEventListener("pointercancel", finishToggleDrag);
    window.addEventListener("resize", () => applyToggleTop(toggle));

    function finishToggleDrag(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.moved) {
        toggle.dataset.dragged = "true";
        saveState();
      }
      drag = null;
    }
  }

  function applyToggleTop(toggle) {
    if (!Number.isFinite(state.toggleTop)) return;
    state.toggleTop = clampToggleTop(state.toggleTop, toggle);
    toggle.style.top = `${state.toggleTop}px`;
  }

  function clampToggleTop(value, toggle) {
    const height = toggle.getBoundingClientRect().height || 82;
    const margin = 8;
    return Math.round(Math.min(window.innerHeight - height - margin, Math.max(margin, Number(value) || margin)));
  }

  function syncInputs() {
    valueOf("txbw-target-input", state.targetPrice);
    valueOf("txbw-interval-input", state.refreshSeconds);
  }

  function saveSettings() {
    state.targetPrice = clampNumber(
      valueOf("txbw-target-input"),
      1,
      1000000000,
      DEFAULT_TARGET_PRICE,
    );
    state.refreshSeconds = clampNumber(
      valueOf("txbw-interval-input"),
      MIN_REFRESH_SECONDS,
      600,
      DEFAULT_REFRESH_SECONDS,
    );
    saveState();
    syncInputs();
    render();
    setStatus("Settings saved.");
    scheduleNextCheck();
  }

  function resetSeen() {
    state.seenDeals = {};
    lastDeal = null;
    saveState();
    render();
    setStatus("Alert history reset.");
  }

  async function checkMarket(manual) {
    if (isChecking) return;

    isChecking = true;
    setStatus(manual ? "Checking Xanax listings..." : "Auto-checking Xanax listings...");

    try {
      const data = await requestJson(WEAV3R_URL);
      const listings = normalizeListings(data).sort(
        (a, b) => a.price - b.price || b.quantity - a.quantity,
      );

      if (!listings.length) {
        throw new Error("No Weav3r Xanax listings returned.");
      }

      lastListings = listings.slice(0, 10);
      state.lastChecked = Date.now();

      const deal = listings.find((listing) => listing.price <= state.targetPrice);
      if (deal) {
        handleDeal(deal, listings);
      } else {
        lastDeal = null;
        setStatus(`Lowest Xanax listing is ${money(listings[0].price)}.`);
      }

      saveState();
      render();
    } catch (error) {
      setStatus("Could not check Weav3r: " + error.message);
    } finally {
      isChecking = false;
      scheduleNextCheck();
    }
  }

  function handleDeal(deal, listings) {
    lastDeal = {
      ...deal,
      matchCount: listings.filter((listing) => listing.price <= state.targetPrice).length,
    };

    const message =
      `${money(deal.price)} Xanax found, ` +
      `${lastDeal.matchCount} listing${lastDeal.matchCount === 1 ? "" : "s"} at/below ${money(state.targetPrice)}.`;
    setStatus(message);

    const key = listingKey(deal);
    if (!state.seenDeals[key]) {
      state.seenDeals[key] = Date.now();
      notifyDeal(message);
      setOpen(true);
    }
  }

  function notifyDeal(message) {
    if (typeof GM_notification === "function") {
      GM_notification({
        title: "Torn Xanax price alert",
        text: message,
        timeout: 15000,
        onclick: openXanaxMarket,
      });
      return;
    }

    if ("Notification" in window && Notification.permission === "granted") {
      const notification = new Notification("Torn Xanax price alert", {
        body: message,
      });
      notification.onclick = openXanaxMarket;
    } else if (
      "Notification" in window &&
      Notification.permission !== "denied"
    ) {
      Notification.requestPermission();
    }
  }

  function render() {
    const current = lastListings[0]?.price || 0;
    const matchCount = lastListings.filter(
      (listing) => listing.price <= state.targetPrice,
    ).length;

    textOf("txbw-current", current ? money(current) : "-");
    textOf("txbw-target", money(state.targetPrice));
    textOf(
      "txbw-checked",
      state.lastChecked ? formatClock(state.lastChecked) : "Never",
    );
    textOf("txbw-matches", String(matchCount));

    const alert = document.getElementById("txbw-alert");
    const alertText = document.getElementById("txbw-alert-text");
    if (lastDeal) {
      alert.classList.add("show");
      alertText.textContent =
        `${money(lastDeal.price)} for ${lastDeal.quantity.toLocaleString()} ` +
        `Xanax from Weav3r marketplace data.`;
    } else {
      alert.classList.remove("show");
      alertText.textContent = "";
    }

    const list = document.getElementById("txbw-list");
    if (!lastListings.length) {
      list.innerHTML =
        `<div class="txbw-listing"><div class="txbw-listing-meta">No listings loaded yet.</div></div>`;
      return;
    }

    list.innerHTML = lastListings
      .map((listing) => {
        const isDeal = listing.price <= state.targetPrice;
        return `
          <div class="txbw-listing">
            <div>
              <div class="txbw-listing-price">${escapeHtml(money(listing.price))}</div>
              <div class="txbw-listing-meta">${escapeHtml(listing.quantity.toLocaleString())} available${listing.seller ? " by " + escapeHtml(listing.seller) : ""}</div>
            </div>
            ${isDeal ? `<span class="txbw-pill">Alert</span>` : ""}
          </div>
        `;
      })
      .join("");
  }

  function normalizeListings(data) {
    const raw = firstArray(data?.listings, data?.marketplace, data?.bazaar, data);

    return raw
      .map((entry, index) => normalizeListing(entry, index))
      .filter((entry) => entry && entry.price > 0 && entry.quantity > 0);
  }

  function normalizeListing(entry, index) {
    const row = Array.isArray(entry) ? entry[1] : entry;
    if (!row || typeof row !== "object") return null;

    return {
      id: String(row.id || row.listing_id || row.uid || row.key || index),
      price: numberFrom(row.price, row.cost, row.amount),
      quantity: numberFrom(row.quantity, row.qty, row.stock, row.amount_available, 1),
      seller: String(
        row.seller ||
          row.seller_name ||
          row.player_name ||
          row.name ||
          row.username ||
          "",
      ),
    };
  }

  function firstArray(...values) {
    for (const value of values) {
      if (Array.isArray(value)) return value;
      if (value && typeof value === "object") return Object.entries(value);
    }
    return [];
  }

  function requestJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        timeout: 20000,
        onload: (response) => {
          if (
            response.status &&
            (response.status < 200 || response.status >= 300)
          ) {
            reject(new Error("HTTP " + response.status));
            return;
          }

          try {
            resolve(JSON.parse(response.responseText));
          } catch (_) {
            reject(new Error("Invalid JSON"));
          }
        },
        onerror: () => reject(new Error("Network failed")),
        ontimeout: () => reject(new Error("Request timed out")),
      });
    });
  }

  function scheduleNextCheck(delay) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(
      () => checkMarket(false),
      typeof delay === "number" ? delay : state.refreshSeconds * 1000,
    );
  }

  function listingKey(listing) {
    return [listing.id, listing.price, listing.quantity].join(":");
  }

  function loadState() {
    try {
      return normalizeState(
        JSON.parse(localStorage.getItem(STORE_KEY) || "{}"),
      );
    } catch (_) {
      return normalizeState({});
    }
  }

  function normalizeState(saved) {
    return {
      targetPrice: clampNumber(
        saved.targetPrice,
        1,
        1000000000,
        DEFAULT_TARGET_PRICE,
      ),
      refreshSeconds: clampNumber(
        saved.refreshSeconds,
        MIN_REFRESH_SECONDS,
        600,
        DEFAULT_REFRESH_SECONDS,
      ),
      lastChecked: Math.max(0, Number(saved.lastChecked) || 0),
      seenDeals:
        saved.seenDeals && typeof saved.seenDeals === "object"
          ? saved.seenDeals
          : {},
      toggleTop: Number.isFinite(Number(saved.toggleTop))
        ? Number(saved.toggleTop)
        : null,
    };
  }

  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function numberFrom(...values) {
    for (const value of values) {
      const number = Number(String(value).replace(/[$,]/g, ""));
      if (Number.isFinite(number) && number > 0) return number;
    }
    return 0;
  }

  function openXanaxMarket() {
    window.open(XANAX_URL, "_blank", "noopener,noreferrer");
  }

  function setStatus(text) {
    textOf("txbw-status", text);
  }

  function textOf(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function valueOf(id, nextValue) {
    const el = document.getElementById(id);
    if (!el) return "";
    if (arguments.length > 1) el.value = nextValue;
    return el.value;
  }

  function money(value) {
    return `$${Math.round(Number(value) || 0).toLocaleString()}`;
  }

  function formatClock(ms) {
    return new Date(ms).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function addStyles() {
    GM_addStyle(`
      #txbw-toggle {
        position: fixed; right: 0; top: 42%; z-index: 999998;
        width: 25px; height: 82px; border: 0; border-radius: 6px 0 0 6px;
        background: #151513; color: #9af0ad; box-shadow: -2px 0 14px rgba(0,0,0,.5);
        cursor: pointer; font: 800 9px/1 Arial, sans-serif; letter-spacing: .5px;
        writing-mode: vertical-rl; text-orientation: mixed;
        touch-action: none; user-select: none;
        transition: right .2s ease, background .12s, color .12s;
      }
      #txbw-toggle:hover { background: #20251f; color: #b8ffc4; }
      #txbw-toggle.txbw-attached { right: min(380px, calc(100vw - 32px)); z-index: 1000000; }
      #txbw-panel {
        position: fixed; right: 0; top: 0; bottom: 0; z-index: 999999;
        width: min(380px, calc(100vw - 32px)); display: flex; flex-direction: column;
        background: #161916; color: #e9f0e9; box-shadow: -7px 0 30px rgba(0,0,0,.55);
        transform: translateX(calc(100% + 16px)); transition: transform .2s ease;
        font: 13px/1.45 Arial, sans-serif;
      }
      #txbw-panel.txbw-open { transform: translateX(0); }
      #txbw-panel, #txbw-panel * { box-sizing: border-box; text-shadow: none !important; }
      .txbw-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 12px; border-bottom: 1px solid #283228; background: #101410;
      }
      .txbw-title { font-size: 15px; font-weight: 800; color: #eaffea; }
      .txbw-head-actions { display: flex; gap: 6px; }
      .txbw-btn, .txbw-icon-btn {
        border: 1px solid #334233; border-radius: 5px; background: #202820; color: #e9f0e9;
        cursor: pointer; font: 700 12px Arial, sans-serif;
      }
      .txbw-btn { height: 30px; padding: 0 10px; }
      .txbw-icon-btn { width: 30px; height: 30px; font-size: 18px; line-height: 1; }
      .txbw-btn:hover, .txbw-icon-btn:hover { background: #2c382c; color: #fff; }
      .txbw-btn.txbw-primary { background: #12331c; border-color: #286138; color: #9af0ad; }
      .txbw-stats { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #283228; }
      .txbw-stat { padding: 10px 12px; border-right: 1px solid #283228; }
      .txbw-stat:nth-child(even) { border-right: 0; }
      .txbw-label, .txbw-field span {
        display: block; color: #829182; font-size: 10px; font-weight: 800;
        text-transform: uppercase; letter-spacing: .6px;
      }
      .txbw-value {
        margin-top: 2px; color: #f2fff2; font: 800 15px/1.25 Consolas, monospace;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .txbw-value.good { color: #72d38a; }
      .txbw-value.warn { color: #ffcf6a; }
      .txbw-status {
        min-height: 28px; padding: 7px 12px; border-bottom: 1px solid #283228;
        color: #9aa89a; font-size: 12px; font-weight: 700;
      }
      .txbw-alert {
        display: none; margin: 12px; padding: 10px; border: 1px solid #286138; border-radius: 6px;
        background: #102719; color: #9af0ad;
      }
      .txbw-alert.show { display: block; }
      .txbw-alert-title { font-weight: 900; margin-bottom: 3px; }
      .txbw-alert-text { font-size: 12px; color: #caf8d0; }
      .txbw-section { padding: 12px; border-bottom: 1px solid #283228; }
      .txbw-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .txbw-field span { margin-bottom: 4px; }
      .txbw-input {
        width: 100%; height: 30px; border: 1px solid #334233; border-radius: 5px;
        background: #101410; color: #e9f0e9; padding: 0 8px; font: 700 12px Arial, sans-serif;
      }
      .txbw-input:focus { outline: none; border-color: #4b965b; }
      .txbw-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
      .txbw-list-title {
        padding: 10px 12px 6px; color: #829182; font-size: 10px; font-weight: 800;
        text-transform: uppercase; letter-spacing: .6px;
      }
      #txbw-list { overflow-y: auto; flex: 1; }
      .txbw-listing {
        display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 8px 12px;
        border-top: 1px solid #243024; align-items: center;
      }
      .txbw-listing:nth-child(odd) { background: #1b211b; }
      .txbw-listing-price { font: 800 14px Consolas, monospace; color: #f2fff2; }
      .txbw-listing-meta { margin-top: 2px; color: #829182; font-size: 11px; font-weight: 700; }
      .txbw-pill {
        border-radius: 4px; background: #11351c; color: #72d38a; padding: 3px 6px;
        font-size: 10px; font-weight: 900; text-transform: uppercase;
      }
      @media (max-width: 520px) {
        #txbw-panel { width: calc(100vw - 28px); }
        #txbw-toggle.txbw-attached { right: calc(100vw - 28px); }
        .txbw-grid, .txbw-actions, .txbw-stats { grid-template-columns: 1fr; }
        .txbw-stat { border-right: 0; }
      }
    `);
  }
})();
