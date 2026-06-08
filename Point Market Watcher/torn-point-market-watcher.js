// ==UserScript==
// @name         Torn Point Market Watcher @AmrisG
// @namespace    torn-point-market-watcher @AmrisG
// @version      1.0.0
// @description  Watches Torn points market prices and alerts when new listings undercut your reference price.
// @author       AmrisG
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @connect      api.torn.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_notification
// ==/UserScript==

(function () {
  "use strict";

  const STORE_KEY = "tpmw:v1";
  const API_URL = "https://api.torn.com/market/?selections=pointsmarket&key=";
  const POINTS_URL = "https://www.torn.com/pmarket.php";
  const STOCKS_URL = "https://www.torn.com/page.php?sid=stocks";
  const DEFAULT_DROP_PERCENT = 2;
  const DEFAULT_REFRESH_SECONDS = 30;
  const MIN_REFRESH_SECONDS = 5;

  const state = loadState();
  let isOpen = false;
  let isChecking = false;
  let refreshTimer = 0;
  let lastListings = [];
  let lastDeal = null;

  GM_addStyle(`
    #tpmw-toggle {
      position: fixed; left: 0; top: 42%; z-index: 999998;
      width: 24px; height: 74px; border: 0; border-radius: 0 6px 6px 0;
      background: #151513; color: #e7d28f; box-shadow: 2px 0 14px rgba(0,0,0,.5);
      cursor: pointer; font: 800 9px/1 Arial, sans-serif; letter-spacing: .7px;
      writing-mode: vertical-rl; text-orientation: mixed;
      touch-action: none; user-select: none;
      transition: left .2s ease, background .12s, color .12s;
    }
    #tpmw-toggle:hover { background: #24241f; color: #ffe59b; }
    #tpmw-toggle.tpmw-attached { left: min(380px, calc(100vw - 32px)); z-index: 1000000; }
    #tpmw-panel {
      position: fixed; left: 0; top: 0; bottom: 0; z-index: 999999;
      width: min(380px, calc(100vw - 32px)); display: flex; flex-direction: column;
      background: #171714; color: #eee9dc; box-shadow: 7px 0 30px rgba(0,0,0,.55);
      transform: translateX(calc(-100% - 16px)); transition: transform .2s ease;
      font: 13px/1.45 Arial, sans-serif;
    }
    #tpmw-panel.tpmw-open { transform: translateX(0); }
    #tpmw-panel, #tpmw-panel * { box-sizing: border-box; text-shadow: none !important; }
    .tpmw-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; border-bottom: 1px solid #2c2b25; background: #10100f;
    }
    .tpmw-title { font-size: 15px; font-weight: 800; color: #fff4d1; }
    .tpmw-head-actions { display: flex; gap: 6px; }
    .tpmw-btn, .tpmw-icon-btn {
      border: 1px solid #3a382d; border-radius: 5px; background: #23221d; color: #eee9dc;
      cursor: pointer; font: 700 12px Arial, sans-serif; transition: background .12s, color .12s;
    }
    .tpmw-btn { height: 30px; padding: 0 10px; }
    .tpmw-icon-btn { width: 30px; height: 30px; font-size: 18px; line-height: 1; }
    .tpmw-btn:hover, .tpmw-icon-btn:hover { background: #343126; color: #fff8df; }
    .tpmw-btn.tpmw-primary { background: #3c300f; border-color: #6f5616; color: #ffe59b; }
    .tpmw-btn.tpmw-danger { background: #391918; border-color: #5b2825; color: #ffb2a8; }
    .tpmw-body { overflow-y: auto; flex: 1; }
    .tpmw-section { padding: 12px; border-bottom: 1px solid #2c2b25; }
    .tpmw-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .tpmw-field label {
      display: block; margin-bottom: 4px; color: #8f8a78;
      font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px;
    }
    .tpmw-input {
      width: 100%; height: 30px; border: 1px solid #333127; border-radius: 5px;
      background: #10100f; color: #eee9dc; padding: 0 8px; font: 700 12px Arial, sans-serif;
    }
    .tpmw-input[type="password"] { letter-spacing: 2px; font-weight: 500; }
    .tpmw-input:focus { outline: none; border-color: #806622; }
    .tpmw-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
    .tpmw-stats { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #2c2b25; }
    .tpmw-stat { padding: 10px 12px; border-right: 1px solid #2c2b25; }
    .tpmw-stat:nth-child(even) { border-right: 0; }
    .tpmw-label {
      color: #777263; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px;
    }
    .tpmw-value {
      margin-top: 2px; color: #f7f0df; font: 800 15px/1.25 Consolas, monospace;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .tpmw-value.good { color: #72d38a; }
    .tpmw-value.warn { color: #ffcf6a; }
    .tpmw-status {
      min-height: 28px; padding: 7px 12px; border-bottom: 1px solid #2c2b25;
      color: #8f8a78; font-size: 12px; font-weight: 700;
    }
    .tpmw-alert {
      display: none; margin: 12px; padding: 10px; border: 1px solid #806622; border-radius: 6px;
      background: #2a220d; color: #ffe59b;
    }
    .tpmw-alert.show { display: block; }
    .tpmw-alert-title { font-weight: 900; margin-bottom: 3px; }
    .tpmw-alert-text { font-size: 12px; color: #f4deb0; }
    .tpmw-list-title {
      padding: 10px 12px 6px; color: #8f8a78; font-size: 10px; font-weight: 800;
      text-transform: uppercase; letter-spacing: .6px;
    }
    .tpmw-listing {
      display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 8px 12px;
      border-top: 1px solid #25231d; align-items: center;
    }
    .tpmw-listing:nth-child(odd) { background: #1c1b17; }
    .tpmw-listing-price { font: 800 14px Consolas, monospace; color: #f7f0df; }
    .tpmw-listing-meta { margin-top: 2px; color: #777263; font-size: 11px; font-weight: 700; }
    .tpmw-pill {
      border-radius: 4px; background: #102b18; color: #72d38a; padding: 3px 6px;
      font-size: 10px; font-weight: 900; text-transform: uppercase;
    }
    @media (max-width: 520px) {
      #tpmw-panel { width: calc(100vw - 28px); }
      #tpmw-toggle.tpmw-attached { left: calc(100vw - 28px); }
      .tpmw-grid, .tpmw-actions, .tpmw-stats { grid-template-columns: 1fr; }
      .tpmw-stat { border-right: 0; }
    }
  `);

  buildShell();
  syncInputs();
  render();
  scheduleNextCheck(800);

  function buildShell() {
    const toggle = document.createElement("button");
    toggle.id = "tpmw-toggle";
    toggle.type = "button";
    toggle.textContent = "POINTS";
    toggle.title = "Open point market watcher";
    makeToggleMovable(toggle);
    toggle.addEventListener("click", () => {
      if (toggle.dataset.dragged === "true") {
        toggle.dataset.dragged = "";
        return;
      }
      setOpen(!isOpen);
    });

    const panel = document.createElement("section");
    panel.id = "tpmw-panel";
    panel.innerHTML = `
      <div class="tpmw-head">
        <div class="tpmw-title">Point Watcher</div>
        <div class="tpmw-head-actions">
          <button class="tpmw-btn" id="tpmw-refresh" type="button">Refresh</button>
          <button class="tpmw-icon-btn" id="tpmw-close" type="button" title="Close">&times;</button>
        </div>
      </div>
      <div class="tpmw-stats">
        <div class="tpmw-stat">
          <div class="tpmw-label">Current lowest</div>
          <div class="tpmw-value" id="tpmw-current">-</div>
        </div>
        <div class="tpmw-stat">
          <div class="tpmw-label">Alert at/below</div>
          <div class="tpmw-value warn" id="tpmw-threshold">-</div>
        </div>
        <div class="tpmw-stat">
          <div class="tpmw-label">Reference</div>
          <div class="tpmw-value" id="tpmw-reference">-</div>
        </div>
        <div class="tpmw-stat">
          <div class="tpmw-label">Last check</div>
          <div class="tpmw-value" id="tpmw-checked">Never</div>
        </div>
      </div>
      <div class="tpmw-status" id="tpmw-status">Add your Torn API key to start watching.</div>
      <div class="tpmw-alert" id="tpmw-alert">
        <div class="tpmw-alert-title">Cheap points found</div>
        <div class="tpmw-alert-text" id="tpmw-alert-text"></div>
        <div class="tpmw-actions">
          <button class="tpmw-btn tpmw-primary" data-open="stocks" type="button">Open Stock Market</button>
          <button class="tpmw-btn tpmw-primary" data-open="points" type="button">Open Points Market</button>
        </div>
      </div>
      <div class="tpmw-section">
        <div class="tpmw-field">
          <label>API Key</label>
          <input id="tpmw-key" class="tpmw-input" type="password" autocomplete="off" placeholder="Paste Torn API key" />
        </div>
        <div class="tpmw-actions">
          <button class="tpmw-btn" id="tpmw-save-key" type="button">Save Key</button>
          <button class="tpmw-btn tpmw-danger" id="tpmw-clear-key" type="button">Clear Key</button>
        </div>
      </div>
      <div class="tpmw-section">
        <div class="tpmw-grid">
          <div class="tpmw-field">
            <label>Drop %</label>
            <input id="tpmw-drop" class="tpmw-input" type="number" min="0.1" max="50" step="0.1" />
          </div>
          <div class="tpmw-field">
            <label>Refresh seconds</label>
            <input id="tpmw-interval" class="tpmw-input" type="number" min="${MIN_REFRESH_SECONDS}" max="600" step="5" />
          </div>
          <div class="tpmw-field">
            <label>Manual reference</label>
            <input id="tpmw-manual" class="tpmw-input" type="number" min="1" step="100" placeholder="Optional" />
          </div>
          <div class="tpmw-field">
            <label>Auto update reference</label>
            <select id="tpmw-auto" class="tpmw-input">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
        <div class="tpmw-actions">
          <button class="tpmw-btn" id="tpmw-save-settings" type="button">Save Settings</button>
          <button class="tpmw-btn" id="tpmw-reset-reference" type="button">Reset Reference</button>
        </div>
      </div>
      <div class="tpmw-section">
        <div class="tpmw-actions" style="margin-top:0">
          <button class="tpmw-btn tpmw-primary" data-open="stocks" type="button">Open Stock Market</button>
          <button class="tpmw-btn tpmw-primary" data-open="points" type="button">Open Points Market</button>
        </div>
      </div>
      <div class="tpmw-body">
        <div class="tpmw-list-title">Cheapest listings</div>
        <div id="tpmw-list"></div>
      </div>
    `;

    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    document
      .getElementById("tpmw-close")
      .addEventListener("click", () => setOpen(false));
    document
      .getElementById("tpmw-refresh")
      .addEventListener("click", () => checkMarket(true));
    document.getElementById("tpmw-save-key").addEventListener("click", saveKey);
    document
      .getElementById("tpmw-clear-key")
      .addEventListener("click", clearKey);
    document
      .getElementById("tpmw-save-settings")
      .addEventListener("click", saveSettings);
    document
      .getElementById("tpmw-reset-reference")
      .addEventListener("click", resetReference);
    panel.addEventListener("click", (event) => {
      const target = event.target.closest("[data-open]");
      if (!target) return;
      if (target.dataset.open === "stocks") {
        openTornPage(STOCKS_URL);
      } else {
        window.location.href = POINTS_URL;
      }
    });
  }

  function setOpen(nextOpen) {
    isOpen = nextOpen;
    document.getElementById("tpmw-panel").classList.toggle("tpmw-open", isOpen);
    document.getElementById("tpmw-toggle").classList.toggle("tpmw-attached", isOpen);
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
    const height = toggle.getBoundingClientRect().height || 74;
    const margin = 8;
    return Math.round(Math.min(window.innerHeight - height - margin, Math.max(margin, Number(value) || margin)));
  }

  function syncInputs() {
    valueOf("tpmw-key", state.apiKey);
    valueOf("tpmw-drop", state.dropPercent);
    valueOf("tpmw-interval", state.refreshSeconds);
    valueOf("tpmw-manual", state.manualReference || "");
    valueOf("tpmw-auto", state.autoReference ? "yes" : "no");
  }

  function saveKey() {
    state.apiKey = String(valueOf("tpmw-key") || "").trim();
    saveState();
    setStatus(
      state.apiKey
        ? "API key saved. Checking points market..."
        : "No API key saved.",
    );
    checkMarket(true);
  }

  function clearKey() {
    state.apiKey = "";
    valueOf("tpmw-key", "");
    saveState();
    setStatus("API key cleared.");
  }

  function saveSettings() {
    state.dropPercent = clampNumber(
      valueOf("tpmw-drop"),
      0.1,
      50,
      DEFAULT_DROP_PERCENT,
    );
    state.refreshSeconds = clampNumber(
      valueOf("tpmw-interval"),
      MIN_REFRESH_SECONDS,
      600,
      DEFAULT_REFRESH_SECONDS,
    );
    state.manualReference = Math.max(0, Number(valueOf("tpmw-manual")) || 0);
    state.autoReference = valueOf("tpmw-auto") !== "no";
    saveState();
    syncInputs();
    render();
    setStatus("Settings saved.");
    scheduleNextCheck();
  }

  function resetReference() {
    state.referencePrice = 0;
    state.seenDeals = {};
    lastDeal = null;
    saveState();
    render();
    setStatus("Reference reset. The next normal market check will set it.");
  }

  async function checkMarket(manual) {
    if (isChecking) return;
    if (!state.apiKey) {
      setStatus("Add your Torn API key to start watching.");
      scheduleNextCheck();
      return;
    }

    isChecking = true;
    setStatus(
      manual ? "Checking points market..." : "Auto-checking points market...",
    );
    try {
      const data = await requestJson(
        API_URL + encodeURIComponent(state.apiKey),
      );
      if (data && data.error)
        throw new Error(data.error.error || data.error.message || "API error");

      const listings = extractListings(data);
      if (!listings.length) throw new Error("No points listings returned.");

      listings.sort((a, b) => a.cost - b.cost || b.quantity - a.quantity);
      lastListings = listings.slice(0, 8);
      state.lastChecked = Date.now();

      const cheapest = listings[0];
      const reference = effectiveReference();
      const threshold = reference
        ? reference * (1 - state.dropPercent / 100)
        : 0;
      const deal = reference && cheapest.cost <= threshold ? cheapest : null;

      if (deal) {
        handleDeal(deal, reference, threshold);
      } else {
        maybeUpdateReference(cheapest.cost);
        lastDeal = null;
        setStatus(`Current lowest is ${money(cheapest.cost)} per point.`);
      }

      saveState();
      render();
    } catch (error) {
      setStatus("Could not check market: " + error.message);
    } finally {
      isChecking = false;
      scheduleNextCheck();
    }
  }

  function maybeUpdateReference(price) {
    if (!state.autoReference || state.manualReference) return;
    state.referencePrice = price;
  }

  function handleDeal(deal, reference, threshold) {
    lastDeal = { ...deal, reference, threshold };
    const key = listingKey(deal);
    const message = `${money(deal.cost)} per point, ${percentBelow(deal.cost, reference)} below ${money(reference)}.`;
    setStatus("Cheap points found: " + message);

    if (!state.seenDeals[key]) {
      state.seenDeals[key] = Date.now();
      notifyDeal(message);
      setOpen(true);
    }
  }

  function notifyDeal(message) {
    if (typeof GM_notification === "function") {
      GM_notification({
        title: "Torn cheap points found",
        text: message,
        timeout: 12000,
        onclick: () => openTornPage(POINTS_URL),
      });
      return;
    }

    if ("Notification" in window && Notification.permission === "granted") {
      const notification = new Notification("Torn cheap points found", {
        body: message,
      });
      notification.onclick = () => openTornPage(POINTS_URL);
    } else if (
      "Notification" in window &&
      Notification.permission !== "denied"
    ) {
      Notification.requestPermission();
    }
  }

  function render() {
    const current = lastListings[0] && lastListings[0].cost;
    const reference = effectiveReference();
    const threshold = reference ? reference * (1 - state.dropPercent / 100) : 0;

    textOf("tpmw-current", current ? money(current) : "-");
    textOf("tpmw-reference", reference ? money(reference) : "-");
    textOf("tpmw-threshold", threshold ? money(threshold) : "-");
    textOf(
      "tpmw-checked",
      state.lastChecked ? formatClock(state.lastChecked) : "Never",
    );

    const alert = document.getElementById("tpmw-alert");
    const alertText = document.getElementById("tpmw-alert-text");
    if (lastDeal) {
      alert.classList.add("show");
      alertText.textContent = `${money(lastDeal.cost)} per point (${lastDeal.quantity.toLocaleString()} points) is ${percentBelow(lastDeal.cost, lastDeal.reference)} below your reference.`;
    } else {
      alert.classList.remove("show");
      alertText.textContent = "";
    }

    const list = document.getElementById("tpmw-list");
    if (!lastListings.length) {
      list.innerHTML = `<div class="tpmw-listing"><div class="tpmw-listing-meta">No listings loaded yet.</div></div>`;
      return;
    }

    list.innerHTML = lastListings
      .map((listing) => {
        const isDeal = reference && listing.cost <= threshold;
        return `
          <div class="tpmw-listing">
            <div>
              <div class="tpmw-listing-price">${escapeHtml(money(listing.cost))}</div>
              <div class="tpmw-listing-meta">${escapeHtml(listing.quantity.toLocaleString())} points${listing.seller ? " by " + escapeHtml(listing.seller) : ""}</div>
            </div>
            ${isDeal ? `<span class="tpmw-pill">Deal</span>` : ""}
          </div>
        `;
      })
      .join("");
  }

  function extractListings(data) {
    const raw = firstArray(
      data && data.pointsmarket,
      data && data.market && data.market.pointsmarket,
      data && data.market && data.market.listings,
      data && data.listings,
    );

    return raw
      .map((entry, index) => normalizeListing(entry, index))
      .filter((entry) => entry && entry.cost > 0 && entry.quantity > 0);
  }

  function normalizeListing(entry, index) {
    const row = Array.isArray(entry) ? entry[1] : entry;
    if (!row || typeof row !== "object") return null;
    const cost = numberFrom(
      row.cost,
      row.price,
      row.price_per_point,
      row.point_price,
    );
    const quantity = numberFrom(
      row.quantity,
      row.amount,
      row.points,
      row.qty,
      1,
    );
    return {
      id: String(row.id || row.listing_id || row.uid || index),
      cost,
      quantity,
      seller: String(
        row.seller || row.seller_name || row.player_name || row.name || "",
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

  function effectiveReference() {
    return Number(state.manualReference || state.referencePrice || 0);
  }

  function listingKey(listing) {
    return [listing.id, listing.cost, listing.quantity].join(":");
  }

  function numberFrom(...values) {
    for (const value of values) {
      const number = Number(String(value).replace(/[$,]/g, ""));
      if (Number.isFinite(number) && number > 0) return number;
    }
    return 0;
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
      apiKey: typeof saved.apiKey === "string" ? saved.apiKey : "",
      dropPercent: clampNumber(
        saved.dropPercent,
        0.1,
        50,
        DEFAULT_DROP_PERCENT,
      ),
      refreshSeconds: clampNumber(
        saved.refreshSeconds,
        MIN_REFRESH_SECONDS,
        600,
        DEFAULT_REFRESH_SECONDS,
      ),
      manualReference: Math.max(0, Number(saved.manualReference) || 0),
      referencePrice: Math.max(0, Number(saved.referencePrice) || 0),
      autoReference: saved.autoReference !== false,
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

  function openTornPage(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function setStatus(text) {
    textOf("tpmw-status", text);
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

  function percentBelow(price, reference) {
    if (!reference) return "0%";
    return `${Math.max(0, (1 - price / reference) * 100).toFixed(2)}%`;
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
})();
