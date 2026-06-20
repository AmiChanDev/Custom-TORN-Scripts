// ==UserScript==
// @name         Torn Abroad Stock Watcher @AmrisG
// @namespace    torn-abroad-stock-watcher @AmrisG
// @version      1.1.0
// @description  Watches selected YATA abroad country/item stocks and shows stock quantity plus last stocked time.
// @author       AmrisG
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @connect      yata.yt
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_notification
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const STORE_KEY = "tasw:v2";
  const LEGACY_STORE_KEY = "tasw:v1";
  const TRAVEL_URL = "https://www.torn.com/page.php?sid=travel";
  const YATA_TRAVEL_URL = "https://yata.yt/api/v1/travel/export/";
  const DEFAULT_REFRESH_SECONDS = 60;
  const MIN_REFRESH_SECONDS = 20;

  const COUNTRIES = {
    mex: "Mexico",
    cay: "Cayman Islands",
    can: "Canada",
    haw: "Hawaii",
    uni: "United Kingdom",
    arg: "Argentina",
    swi: "Switzerland",
    jap: "Japan",
    chi: "China",
    uae: "UAE",
    sou: "South Africa",
  };

  const state = loadState();
  let isOpen = false;
  let isChecking = false;
  let refreshTimer = 0;
  let feed = null;
  let lastRows = [];
  let lastAlertRows = [];

  addStyles();
  buildShell();
  syncInputs();
  render();
  scheduleNextCheck(1200);

  function buildShell() {
    const toggle = document.createElement("button");
    toggle.id = "tasw-toggle";
    toggle.type = "button";
    toggle.textContent = "ABROAD";
    toggle.title = "Open abroad stock watcher";
    makeToggleMovable(toggle);
    toggle.addEventListener("click", () => {
      if (toggle.dataset.dragged === "true") {
        toggle.dataset.dragged = "";
        return;
      }
      setOpen(!isOpen);
    });

    const panel = document.createElement("section");
    panel.id = "tasw-panel";
    panel.innerHTML = `
      <div class="tasw-head">
        <div class="tasw-title">Abroad Stock Watcher</div>
        <div class="tasw-head-actions">
          <button class="tasw-btn" id="tasw-refresh" type="button">Refresh</button>
          <button class="tasw-icon-btn" id="tasw-close" type="button" title="Close">&times;</button>
        </div>
      </div>
      <div class="tasw-stats">
        <div class="tasw-stat">
          <div class="tasw-label">Watching</div>
          <div class="tasw-value" id="tasw-watching">0</div>
        </div>
        <div class="tasw-stat">
          <div class="tasw-label">Available</div>
          <div class="tasw-value good" id="tasw-available">0</div>
        </div>
        <div class="tasw-stat">
          <div class="tasw-label">Last stocked</div>
          <div class="tasw-value" id="tasw-last-stocked">Never</div>
        </div>
        <div class="tasw-stat">
          <div class="tasw-label">Last check</div>
          <div class="tasw-value" id="tasw-checked">Never</div>
        </div>
      </div>
      <div class="tasw-status" id="tasw-status">Select a country and item, then add it to the watch list.</div>
      <div class="tasw-alert" id="tasw-alert">
        <div class="tasw-alert-title">Selected abroad stock available</div>
        <div class="tasw-alert-text" id="tasw-alert-text"></div>
        <div class="tasw-actions">
          <button class="tasw-btn tasw-primary" id="tasw-open-travel" type="button">Open Travel Agency</button>
        </div>
      </div>
      <div class="tasw-section">
        <div class="tasw-grid">
          <label class="tasw-field">
            <span>Country</span>
            <select id="tasw-country" class="tasw-input"></select>
          </label>
          <label class="tasw-field">
            <span>Item</span>
            <select id="tasw-item" class="tasw-input"></select>
          </label>
          <label class="tasw-field">
            <span>Refresh seconds</span>
            <input id="tasw-interval" class="tasw-input" type="number" min="${MIN_REFRESH_SECONDS}" max="900" step="5" />
          </label>
          <label class="tasw-field">
            <span>Notify again after minutes</span>
            <input id="tasw-repeat" class="tasw-input" type="number" min="1" max="1440" step="1" />
          </label>
        </div>
        <div class="tasw-actions">
          <button class="tasw-btn tasw-primary" id="tasw-add" type="button">Add Watch</button>
          <button class="tasw-btn" id="tasw-save" type="button">Save Timers</button>
        </div>
        <div class="tasw-actions">
          <button class="tasw-btn" id="tasw-reset-alerts" type="button">Reset Alerts</button>
          <button class="tasw-btn tasw-danger" id="tasw-clear" type="button">Clear Watch List</button>
        </div>
      </div>
      <div class="tasw-list-title">Selected stocks</div>
      <div id="tasw-list"></div>
    `;

    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    document.getElementById("tasw-close").addEventListener("click", () => setOpen(false));
    document.getElementById("tasw-refresh").addEventListener("click", () => checkStocks(true));
    document.getElementById("tasw-open-travel").addEventListener("click", openTravel);
    document.getElementById("tasw-country").addEventListener("change", populateItemSelect);
    document.getElementById("tasw-item").addEventListener("change", () => {
      state.selectedItemId = valueOf("tasw-item");
      saveState();
    });
    document.getElementById("tasw-add").addEventListener("click", addWatch);
    document.getElementById("tasw-save").addEventListener("click", saveTimers);
    document.getElementById("tasw-reset-alerts").addEventListener("click", resetAlerts);
    document.getElementById("tasw-clear").addEventListener("click", clearWatchList);
    document.getElementById("tasw-list").addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove-watch]");
      if (!remove) return;
      removeWatch(remove.dataset.removeWatch);
    });
  }

  function setOpen(nextOpen) {
    isOpen = nextOpen;
    document.getElementById("tasw-panel").classList.toggle("tasw-open", isOpen);
    document.getElementById("tasw-toggle").classList.toggle("tasw-attached", isOpen);
  }

  function syncInputs() {
    valueOf("tasw-interval", state.refreshSeconds);
    valueOf("tasw-repeat", state.repeatMinutes);
    populateCountrySelect();
    populateItemSelect();
  }

  function populateCountrySelect() {
    const select = document.getElementById("tasw-country");
    if (!select) return;
    select.innerHTML = Object.entries(COUNTRIES)
      .map(([code, name]) => `<option value="${escapeHtml(code)}">${escapeHtml(name)}</option>`)
      .join("");
    select.value = state.selectedCountry || "mex";
  }

  function populateItemSelect() {
    const country = valueOf("tasw-country") || state.selectedCountry || "mex";
    state.selectedCountry = country;
    const select = document.getElementById("tasw-item");
    if (!select) return;

    const items = getCountryItems(country);
    if (!items.length) {
      select.innerHTML = `<option value="">Refresh to load items</option>`;
      return;
    }

    select.innerHTML = items
      .map((item) => `<option value="${escapeHtml(String(item.id))}">${escapeHtml(item.name)} - ${money(item.cost)}</option>`)
      .join("");

    if (items.some((item) => String(item.id) === String(state.selectedItemId))) {
      select.value = String(state.selectedItemId);
    } else {
      select.value = String(items[0].id);
      state.selectedItemId = String(items[0].id);
    }
  }

  function getCountryItems(country) {
    const countryFeed = feed && feed.stocks && feed.stocks[country];
    if (!countryFeed || !Array.isArray(countryFeed.stocks)) return [];
    return countryFeed.stocks
      .filter((item) => item && Number.isFinite(Number(item.id)) && item.name)
      .map(normalizeItem)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function addWatch() {
    const country = valueOf("tasw-country");
    const itemId = valueOf("tasw-item");
    if (!country || !itemId) {
      setStatus("Refresh first so items can be loaded for the selected country.");
      return;
    }

    const item = getCountryItems(country).find((entry) => String(entry.id) === String(itemId));
    const watch = {
      country,
      itemId: String(itemId),
      itemName: item ? item.name : `Item ${itemId}`,
    };
    const key = watchKey(watch);
    if (!state.watches.some((entry) => watchKey(entry) === key)) {
      state.watches.push(watch);
    }
    state.selectedCountry = country;
    state.selectedItemId = String(itemId);
    saveState();
    buildRowsFromFeed();
    render();
    setStatus(`Watching ${watch.itemName} in ${countryName(country)}.`);
  }

  function removeWatch(key) {
    state.watches = state.watches.filter((watch) => watchKey(watch) !== key);
    saveState();
    buildRowsFromFeed();
    render();
    setStatus("Watch removed.");
  }

  function saveTimers() {
    state.refreshSeconds = clampNumber(valueOf("tasw-interval"), MIN_REFRESH_SECONDS, 900, DEFAULT_REFRESH_SECONDS);
    state.repeatMinutes = clampNumber(valueOf("tasw-repeat"), 1, 1440, 15);
    state.selectedCountry = valueOf("tasw-country") || state.selectedCountry;
    state.selectedItemId = valueOf("tasw-item") || state.selectedItemId;
    saveState();
    syncInputs();
    scheduleNextCheck();
    setStatus("Timers saved.");
  }

  function resetAlerts() {
    state.seenAvailable = {};
    lastAlertRows = [];
    saveState();
    render();
    setStatus("Alert history reset.");
  }

  function clearWatchList() {
    state.watches = [];
    lastRows = [];
    lastAlertRows = [];
    saveState();
    render();
    setStatus("Watch list cleared.");
  }

  async function checkStocks(manual) {
    if (isChecking) return;

    isChecking = true;
    setStatus(manual ? "Checking YATA abroad stocks..." : "Auto-checking YATA abroad stocks...");

    try {
      feed = await requestJson(YATA_TRAVEL_URL);
      if (!feed || !feed.stocks || typeof feed.stocks !== "object") {
        throw new Error("Unexpected YATA travel payload.");
      }

      state.lastChecked = Date.now();
      populateCountrySelect();
      populateItemSelect();
      const alerts = buildRowsFromFeed();
      lastAlertRows = alerts;

      if (alerts.length) {
        notifyAvailable(alerts);
        setStatus(`${alerts.length} selected stock item${alerts.length === 1 ? "" : "s"} available.`);
      } else if (lastRows.length) {
        const availableCount = lastRows.filter((row) => row.available).length;
        setStatus(`${availableCount} of ${lastRows.length} selected stock rows available.`);
      } else {
        setStatus("Select a country and item, then add it to the watch list.");
      }

      saveState();
      render();
    } catch (error) {
      setStatus("Could not check YATA abroad stocks: " + error.message);
    } finally {
      isChecking = false;
      scheduleNextCheck();
    }
  }

  function buildRowsFromFeed() {
    if (!feed || !feed.stocks) {
      lastRows = [];
      return [];
    }

    const rows = state.watches
      .map((watch) => rowForWatch(watch))
      .filter(Boolean)
      .sort((a, b) => {
        if (b.available !== a.available) return Number(b.available) - Number(a.available);
        return a.countryName.localeCompare(b.countryName) || a.itemName.localeCompare(b.itemName);
      });

    lastRows = rows;
    return updateHistoryAndFindAlerts(rows);
  }

  function rowForWatch(watch) {
    const countryFeed = feed.stocks[watch.country];
    if (!countryFeed || !Array.isArray(countryFeed.stocks)) return null;
    const item = countryFeed.stocks.map(normalizeItem).find((entry) => String(entry.id) === String(watch.itemId));
    if (!item) return null;

    return {
      country: watch.country,
      countryName: countryName(watch.country),
      itemId: String(item.id),
      itemName: item.name,
      quantity: item.quantity,
      cost: item.cost,
      available: item.quantity > 0,
      yataUpdatedAt: unixMs(countryFeed.update || feed.timestamp),
    };
  }

  function updateHistoryAndFindAlerts(rows) {
    const now = Date.now();
    const alerts = [];
    const rowKeys = new Set(rows.map(rowKey));

    rows.forEach((row) => {
      const key = rowKey(row);
      const history = state.stockHistory[key] || {};
      const wasAvailable = Boolean(history.currentlyAvailable);

      if (row.available && !wasAvailable) {
        history.previousStockedAt = history.lastStockedAt || 0;
        history.lastStockedAt = row.yataUpdatedAt || now;
      } else if (row.available && !history.lastStockedAt) {
        history.lastStockedAt = row.yataUpdatedAt || now;
      }

      if (row.available) {
        const lastAlertedAt = Number(state.seenAvailable[key] || 0);
        if (!wasAvailable || now - lastAlertedAt >= state.repeatMinutes * 60 * 1000) {
          alerts.push(row);
          state.seenAvailable[key] = now;
        }
      }

      history.currentlyAvailable = row.available;
      history.lastQuantity = row.quantity;
      history.lastCost = row.cost;
      history.yataUpdatedAt = row.yataUpdatedAt;
      history.lastSeenAt = now;
      state.stockHistory[key] = history;
    });

    Object.keys(state.stockHistory).forEach((key) => {
      if (!rowKeys.has(key)) return;
      const row = rows.find((entry) => rowKey(entry) === key);
      if (row && !row.available) state.stockHistory[key].currentlyAvailable = false;
    });

    return alerts;
  }

  function notifyAvailable(rows) {
    const summary = rows
      .slice(0, 4)
      .map((row) => `${row.itemName} in ${row.countryName}: ${quantityText(row.quantity)}`)
      .join("; ");
    const extra = rows.length > 4 ? ` and ${rows.length - 4} more` : "";
    const message = summary + extra;

    if (typeof GM_notification === "function") {
      GM_notification({
        title: "Torn abroad stock available",
        text: message,
        timeout: 12000,
        onclick: openTravel,
      });
      return;
    }

    if ("Notification" in window && Notification.permission === "granted") {
      const notification = new Notification("Torn abroad stock available", { body: message });
      notification.onclick = openTravel;
    } else if ("Notification" in window && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }

  function render() {
    const availableRows = lastRows.filter((row) => row.available);
    textOf("tasw-watching", state.watches.length.toLocaleString());
    textOf("tasw-available", availableRows.length.toLocaleString());
    textOf("tasw-last-stocked", formatOptionalTime(mostRecentLastStocked()));
    textOf("tasw-checked", state.lastChecked ? formatClock(state.lastChecked) : "Never");

    const alert = document.getElementById("tasw-alert");
    const alertText = document.getElementById("tasw-alert-text");
    if (lastAlertRows.length) {
      alert.classList.add("show");
      alertText.textContent = lastAlertRows
        .slice(0, 3)
        .map((row) => `${row.itemName} in ${row.countryName} has ${quantityText(row.quantity)}.`)
        .join(" ");
    } else {
      alert.classList.remove("show");
      alertText.textContent = "";
    }

    const list = document.getElementById("tasw-list");
    if (!state.watches.length) {
      list.innerHTML = `<div class="tasw-listing"><div class="tasw-listing-meta">No selected stocks yet.</div></div>`;
      return;
    }

    const rowsByKey = new Map(lastRows.map((row) => [rowKey(row), row]));
    list.innerHTML = state.watches
      .map((watch) => {
        const key = watchKey(watch);
        const row = rowsByKey.get(key);
        const history = state.stockHistory[key] || {};
        const itemName = row ? row.itemName : watch.itemName || `Item ${watch.itemId}`;
        const country = row ? row.countryName : countryName(watch.country);
        const quantity = row ? quantityText(row.quantity) : "-";
        const cost = row ? money(row.cost) : "-";
        const available = row ? row.available : false;
        return `
          <div class="tasw-listing">
            <div>
              <div class="tasw-listing-name">${escapeHtml(itemName)}</div>
              <div class="tasw-listing-meta">${escapeHtml(country)} · ID ${escapeHtml(watch.itemId)} · Cost ${escapeHtml(cost)}</div>
              <div class="tasw-listing-meta">Last stocked: ${escapeHtml(formatOptionalTime(history.lastStockedAt))}</div>
              <div class="tasw-listing-meta">Previous stocked: ${escapeHtml(formatOptionalTime(history.previousStockedAt))}</div>
              <div class="tasw-listing-meta">YATA updated: ${escapeHtml(formatOptionalTime(history.yataUpdatedAt || (row && row.yataUpdatedAt)))}</div>
            </div>
            <div class="tasw-side">
              <div class="tasw-qty">${escapeHtml(quantity)}</div>
              <span class="tasw-pill ${available ? "tasw-live" : ""}">${available ? "Available" : "Empty"}</span>
              <button class="tasw-mini" type="button" data-remove-watch="${escapeHtml(key)}" title="Remove">Remove</button>
            </div>
          </div>
        `;
      })
      .join("");
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
    const height = toggle.getBoundingClientRect().height || 88;
    const margin = 8;
    return Math.round(Math.min(window.innerHeight - height - margin, Math.max(margin, Number(value) || margin)));
  }

  function requestJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        timeout: 20000,
        onload: (response) => {
          if (response.status && (response.status < 200 || response.status >= 300)) {
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
      () => checkStocks(false),
      typeof delay === "number" ? delay : state.refreshSeconds * 1000,
    );
  }

  function loadState() {
    try {
      return normalizeState(
        JSON.parse(localStorage.getItem(STORE_KEY) || localStorage.getItem(LEGACY_STORE_KEY) || "{}"),
      );
    } catch (_) {
      return normalizeState({});
    }
  }

  function normalizeState(saved) {
    const legacyWatches = typeof saved.watchlistText === "string"
      ? saved.watchlistText
          .split(/[\n,]+/)
          .map((text) => text.trim())
          .filter((text) => /^\d+$/.test(text))
          .map((itemId) => ({ country: "can", itemId, itemName: `Item ${itemId}` }))
      : [];

    return {
      watches: Array.isArray(saved.watches) ? saved.watches.map(normalizeWatch).filter(Boolean) : legacyWatches,
      selectedCountry: COUNTRIES[saved.selectedCountry] ? saved.selectedCountry : "mex",
      selectedItemId: saved.selectedItemId ? String(saved.selectedItemId) : "",
      refreshSeconds: clampNumber(saved.refreshSeconds, MIN_REFRESH_SECONDS, 900, DEFAULT_REFRESH_SECONDS),
      repeatMinutes: clampNumber(saved.repeatMinutes, 1, 1440, 15),
      lastChecked: Math.max(0, Number(saved.lastChecked) || 0),
      seenAvailable: saved.seenAvailable && typeof saved.seenAvailable === "object" ? saved.seenAvailable : {},
      stockHistory: saved.stockHistory && typeof saved.stockHistory === "object" ? saved.stockHistory : {},
      toggleTop: Number.isFinite(Number(saved.toggleTop)) ? Number(saved.toggleTop) : null,
    };
  }

  function normalizeWatch(watch) {
    if (!watch || !COUNTRIES[watch.country] || !watch.itemId) return null;
    return {
      country: watch.country,
      itemId: String(watch.itemId),
      itemName: String(watch.itemName || `Item ${watch.itemId}`),
    };
  }

  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function normalizeItem(item) {
    return {
      id: Number(item.id),
      name: String(item.name || `Item ${item.id}`),
      quantity: Math.max(0, Number(item.quantity) || 0),
      cost: Math.max(0, Number(item.cost) || 0),
    };
  }

  function watchKey(watch) {
    return `${watch.country}:${watch.itemId}`;
  }

  function rowKey(row) {
    return `${row.country}:${row.itemId}`;
  }

  function countryName(code) {
    return COUNTRIES[code] || code.toUpperCase();
  }

  function mostRecentLastStocked() {
    return Object.values(state.stockHistory).reduce((latest, history) => {
      const value = Number(history && history.lastStockedAt) || 0;
      return value > latest ? value : latest;
    }, 0);
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function unixMs(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return number < 100000000000 ? number * 1000 : number;
  }

  function quantityText(value) {
    const quantity = Number(value) || 0;
    return quantity ? quantity.toLocaleString() : "0";
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

  function formatOptionalTime(ms) {
    const value = Number(ms) || 0;
    if (!value) return "Never";
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function openTravel() {
    window.open(TRAVEL_URL, "_blank", "noopener,noreferrer");
  }

  function setStatus(text) {
    textOf("tasw-status", text);
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
      #tasw-toggle {
        position: fixed; right: 0; top: 55%; z-index: 999998;
        width: 25px; height: 88px; border: 0; border-radius: 6px 0 0 6px;
        background: #171717; color: #9fd6ff; box-shadow: -2px 0 14px rgba(0,0,0,.5);
        cursor: pointer; font: 800 9px/1 Arial, sans-serif; letter-spacing: .5px;
        writing-mode: vertical-rl; text-orientation: mixed;
        touch-action: none; user-select: none;
        transition: right .2s ease, background .12s, color .12s;
      }
      #tasw-toggle:hover { background: #22272b; color: #c8e8ff; }
      #tasw-toggle.tasw-attached { right: min(430px, calc(100vw - 32px)); z-index: 1000000; }
      #tasw-panel {
        position: fixed; right: 0; top: 0; bottom: 0; z-index: 999999;
        width: min(430px, calc(100vw - 32px)); display: flex; flex-direction: column;
        background: #151719; color: #eef5f7; box-shadow: -7px 0 30px rgba(0,0,0,.55);
        transform: translateX(calc(100% + 16px)); transition: transform .2s ease;
        font: 13px/1.45 Arial, sans-serif;
      }
      #tasw-panel.tasw-open { transform: translateX(0); }
      #tasw-panel, #tasw-panel * { box-sizing: border-box; text-shadow: none !important; }
      .tasw-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 12px; border-bottom: 1px solid #2b3338; background: #101214;
      }
      .tasw-title { font-size: 15px; font-weight: 800; color: #f4fbff; }
      .tasw-head-actions { display: flex; gap: 6px; }
      .tasw-btn, .tasw-icon-btn, .tasw-mini {
        border: 1px solid #33424a; border-radius: 5px; background: #20262a; color: #eef5f7;
        cursor: pointer; font: 700 12px Arial, sans-serif;
      }
      .tasw-btn { height: 30px; padding: 0 10px; }
      .tasw-icon-btn { width: 30px; height: 30px; font-size: 18px; line-height: 1; }
      .tasw-mini { margin-top: 6px; height: 24px; padding: 0 7px; font-size: 10px; }
      .tasw-btn:hover, .tasw-icon-btn:hover, .tasw-mini:hover { background: #2b353b; color: #fff; }
      .tasw-btn.tasw-primary { background: #123044; border-color: #28607c; color: #9fd6ff; }
      .tasw-btn.tasw-danger { background: #3a1c1c; border-color: #653030; color: #ffb3a9; }
      .tasw-stats { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #2b3338; }
      .tasw-stat { padding: 10px 12px; border-right: 1px solid #2b3338; }
      .tasw-stat:nth-child(even) { border-right: 0; }
      .tasw-label, .tasw-field span {
        display: block; color: #87969e; font-size: 10px; font-weight: 800;
        text-transform: uppercase; letter-spacing: .6px;
      }
      .tasw-value {
        margin-top: 2px; color: #f4fbff; font: 800 15px/1.25 Consolas, monospace;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .tasw-value.good { color: #72d38a; }
      .tasw-status {
        min-height: 28px; padding: 7px 12px; border-bottom: 1px solid #2b3338;
        color: #9ba8ad; font-size: 12px; font-weight: 700;
      }
      .tasw-alert {
        display: none; margin: 12px; padding: 10px; border: 1px solid #28607c; border-radius: 6px;
        background: #102331; color: #9fd6ff;
      }
      .tasw-alert.show { display: block; }
      .tasw-alert-title { font-weight: 900; margin-bottom: 3px; }
      .tasw-alert-text { font-size: 12px; color: #d4efff; }
      .tasw-section { padding: 12px; border-bottom: 1px solid #2b3338; }
      .tasw-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .tasw-field span { margin-bottom: 4px; }
      .tasw-input {
        width: 100%; height: 30px; border: 1px solid #33424a; border-radius: 5px;
        background: #101214; color: #eef5f7; padding: 0 8px; font: 700 12px Arial, sans-serif;
      }
      .tasw-input:focus { outline: none; border-color: #4382a3; }
      .tasw-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
      .tasw-list-title {
        padding: 10px 12px 6px; color: #87969e; font-size: 10px; font-weight: 800;
        text-transform: uppercase; letter-spacing: .6px;
      }
      #tasw-list { overflow-y: auto; flex: 1; }
      .tasw-listing {
        display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding: 8px 12px;
        border-top: 1px solid #273138; align-items: center;
      }
      .tasw-listing:nth-child(odd) { background: #1a1f22; }
      .tasw-listing-name { font: 800 14px Arial, sans-serif; color: #f4fbff; overflow-wrap: anywhere; }
      .tasw-listing-meta { margin-top: 2px; color: #87969e; font-size: 11px; font-weight: 700; }
      .tasw-side { text-align: right; min-width: 82px; }
      .tasw-qty { font: 800 14px Consolas, monospace; color: #f4fbff; margin-bottom: 4px; }
      .tasw-pill {
        display: inline-block; border-radius: 4px; background: #34201a; color: #ffb199; padding: 3px 6px;
        font-size: 10px; font-weight: 900; text-transform: uppercase;
      }
      .tasw-pill.tasw-live { background: #11351c; color: #72d38a; }
      @media (max-width: 520px) {
        #tasw-panel { width: calc(100vw - 28px); }
        #tasw-toggle.tasw-attached { right: calc(100vw - 28px); }
        .tasw-grid, .tasw-actions, .tasw-stats { grid-template-columns: 1fr; }
        .tasw-stat { border-right: 0; }
      }
    `);
  }
})();
