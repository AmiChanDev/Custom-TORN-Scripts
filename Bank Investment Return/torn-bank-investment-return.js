// ==UserScript==
// @name         Torn Bank Investment Return @AmrisG
// @namespace    torn-bank-investment-return @AmrisG
// @version      1.2.0
// @description  Shows a Torn-style bank investment return table on the bank screen using Torn API bank APRs.
// @author       AmrisG
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @connect      api.torn.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  "use strict";

  const STORE_KEY = "tbir:v1";
  const API_BANK_URLS = [
    "https://api.torn.com/torn/?selections=bank&key={key}&comment=bank-return",
    "https://api.torn.com/v2/torn?selections=bank&key={key}&comment=bank-return",
    "https://api.torn.com/v2/torn/?selections=bank&key={key}&comment=bank-return",
    "https://api.torn.com/v2/torn/bank?key={key}&comment=bank-return",
  ];
  const DAYS_IN_YEAR = 365;
  const BANK_LIMIT = 2000000000;
  const OIL_RIG_LIMIT = 3000000000;
  const STOCK_BONUS = 1.1;
  const TERMS = [
    { key: "1w", label: "1 Week", days: 7, aliases: ["1w", "1week", "oneweek", "week1", "7day", "7days"] },
    { key: "2w", label: "2 Weeks", days: 14, aliases: ["2w", "2week", "twoweek", "week2", "14day", "14days"] },
    { key: "1m", label: "1 Month", days: 30, aliases: ["1m", "1month", "onemonth", "month1", "30day", "30days"] },
    { key: "2m", label: "2 Months", days: 60, aliases: ["2m", "2month", "twomonth", "month2", "60day", "60days"] },
    { key: "3m", label: "3 Months", days: 90, aliases: ["3m", "3month", "threemonth", "month3", "90day", "90days"] },
  ];

  const state = loadState();
  let isFetching = false;
  let didAutoFetch = false;
  let isOpen = false;

  GM_addStyle(`
    #tbir-toggle {
      position: fixed; right: 0; top: 38%; z-index: 999998;
      width: 24px; height: 70px; border: 0; border-radius: 6px 0 0 6px;
      background: #151513; color: #e7d28f; box-shadow: -2px 0 14px rgba(0,0,0,.5);
      cursor: pointer; font: 800 9px/1 Arial, sans-serif; letter-spacing: .7px;
      writing-mode: vertical-rl; text-orientation: mixed;
      touch-action: none; user-select: none;
      transition: right .2s ease, background .12s, color .12s;
    }
    #tbir-toggle:hover { background: #24241f; color: #ffe59b; }
    #tbir-toggle.tbir-attached { right: min(920px, calc(100vw - 32px)); z-index: 1000000; }
    #tbir-widget {
      position: fixed; right: 0; top: 0; bottom: 0; z-index: 999999;
      width: min(920px, calc(100vw - 32px));
      display: flex; flex-direction: column;
      border: 1px solid #1f1f1f;
      background: #303030;
      color: #ddd;
      font: 14px/1.35 Arial, Helvetica, sans-serif;
      box-shadow: -7px 0 30px rgba(0,0,0,.55);
      transform: translateX(calc(100% + 16px));
      transition: transform .2s ease;
    }
    #tbir-widget.tbir-open {
      transform: translateX(0);
    }
    #tbir-widget, #tbir-widget * {
      box-sizing: border-box;
      text-shadow: none !important;
    }
    .tbir-bar {
      min-height: 35px;
      padding: 7px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: repeating-linear-gradient(90deg, #5b840f 0, #5b840f 3px, #638b12 3px, #638b12 6px);
      color: #fff;
      font: 700 16px Georgia, "Times New Roman", serif;
    }
    .tbir-collapse {
      width: 0;
      height: 0;
      border-left: 7px solid transparent;
      border-right: 7px solid transparent;
      border-top: 7px solid #fff;
      opacity: .95;
    }
    .tbir-content {
      overflow-y: auto;
      flex: 1;
      padding: 10px 11px 8px;
      background: #333;
    }
    .tbir-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 14px;
      margin-bottom: 8px;
    }
    .tbir-field {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 28px;
      color: #ddd;
    }
    .tbir-label {
      font-weight: 400;
      color: #ddd;
    }
    .tbir-input {
      height: 28px;
      border: 1px solid #111;
      border-radius: 5px;
      background: linear-gradient(#050505, #111);
      color: #fff;
      padding: 0 8px;
      font: 700 14px Arial, Helvetica, sans-serif;
      outline: none;
      box-shadow: inset 0 1px 2px rgba(255,255,255,.06);
    }
    #tbir-principal { width: 202px; }
    #tbir-merits { width: 78px; }
    .tbir-key-wrap {
      display: none;
      width: 100%;
      grid-template-columns: minmax(220px, 1fr) auto auto;
      gap: 7px;
      align-items: center;
      margin: 2px 0 8px;
    }
    .tbir-key-wrap.open { display: grid; }
    #tbir-key { width: 100%; }
    .tbir-check {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: #ddd;
      white-space: nowrap;
    }
    .tbir-check input {
      width: 15px;
      height: 15px;
      accent-color: #5f870f;
    }
    .tbir-btn {
      height: 26px;
      border: 1px solid #181818;
      border-radius: 4px;
      background: linear-gradient(#555, #363636);
      color: #e9e9e9;
      cursor: pointer;
      padding: 0 10px;
      font: 700 12px Arial, Helvetica, sans-serif;
    }
    .tbir-btn:hover { filter: brightness(1.12); }
    .tbir-status {
      min-height: 18px;
      margin: -1px 0 7px;
      color: #aaa;
      font-size: 12px;
    }
    .tbir-table-wrap {
      overflow-x: auto;
      border: 1px solid #8b8b8b;
      border-radius: 6px;
      background: #525252;
      padding: 6px;
    }
    .tbir-table {
      width: 100%;
      min-width: 760px;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .tbir-table th {
      padding: 10px 7px 11px;
      border-bottom: 1px solid #8f8f8f;
      color: #ddd;
      background: #454545;
      text-align: left;
      font-size: 14px;
      font-weight: 700;
      white-space: nowrap;
    }
    .tbir-table th:not(:first-child) { text-align: left; }
    .tbir-table td {
      padding: 5px 7px;
      border-bottom: 1px solid #838383;
      background: #555;
      color: #ddd;
      vertical-align: middle;
    }
    .tbir-table tr:last-child td { border-bottom: 0; }
    .tbir-table tr.best td {
      background: #1f7938;
      color: #e9f5e9;
    }
    .tbir-period {
      width: 19%;
      font-size: 14px;
      font-weight: 400;
    }
    .tbir-period-apr {
      display: block;
      margin-bottom: 2px;
      color: #43e9ff;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.05;
      white-space: nowrap;
    }
    .tbir-period-label {
      display: block;
      color: inherit;
      line-height: 1.1;
      white-space: nowrap;
    }
    .tbir-table th:not(:first-child),
    .tbir-table td:not(:first-child) {
      width: 20.25%;
    }
    .tbir-money {
      display: block;
      color: #ddd;
      font-size: 16px;
      font-weight: 400;
      line-height: 1.05;
      white-space: nowrap;
    }
    .tbir-daily {
      display: block;
      margin-top: 2px;
      color: #43e9ff;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.05;
      white-space: nowrap;
    }
    .tbir-manual {
      display: none;
      grid-template-columns: repeat(5, minmax(90px, 1fr));
      gap: 7px;
      margin: 6px 0 8px;
    }
    .tbir-manual.open { display: grid; }
    .tbir-apr-field label {
      display: block;
      margin-bottom: 3px;
      color: #bbb;
      font-size: 11px;
      font-weight: 700;
    }
    .tbir-apr-field input { width: 100%; }
    @media (max-width: 720px) {
      .tbir-content { padding: 10px 6px 7px; }
      #tbir-principal { width: 170px; }
      .tbir-key-wrap { grid-template-columns: 1fr; }
      .tbir-manual { grid-template-columns: 1fr 1fr; }
      #tbir-widget { width: calc(100vw - 28px); }
      #tbir-toggle.tbir-attached { right: calc(100vw - 28px); }
    }
  `);

  syncBankRoute();
  window.addEventListener("popstate", syncBankRoute);
  window.addEventListener("hashchange", syncBankRoute);
  window.setInterval(syncBankRoute, 1000);

  function buildWidget() {
    if (document.getElementById("tbir-widget")) return;

    const toggle = document.createElement("button");
    toggle.id = "tbir-toggle";
    toggle.type = "button";
    toggle.textContent = "BANK";
    toggle.title = "Open bank investment calculator";
    toggle.addEventListener("click", () => setOpen(!isOpen));

    const widget = document.createElement("section");
    widget.id = "tbir-widget";
    widget.innerHTML = `
      <div class="tbir-bar">
        <span>Bank Investment</span>
        <span class="tbir-collapse" aria-hidden="true"></span>
      </div>
      <div class="tbir-content">
        <div class="tbir-controls">
          <label class="tbir-field">
            <span class="tbir-label">Amount:</span>
            <input id="tbir-principal" class="tbir-input" type="text" inputmode="numeric" />
          </label>
          <label class="tbir-field">
            <span class="tbir-label">Merits:</span>
            <input id="tbir-merits" class="tbir-input" type="number" min="0" max="10" step="1" />
          </label>
          <select id="tbir-limit" class="tbir-input" title="Bank investment limit">
            <option value="${BANK_LIMIT}">$2B</option>
            <option value="${OIL_RIG_LIMIT}">$3B Oil Rig</option>
          </select>
          <button class="tbir-btn" id="tbir-fetch" type="button">Refresh APRs</button>
          <button class="tbir-btn" id="tbir-key-toggle" type="button">API Key</button>
          <button class="tbir-btn" id="tbir-manual-toggle" type="button">Manual APR</button>
        </div>
        <div class="tbir-key-wrap" id="tbir-key-wrap">
          <input id="tbir-key" class="tbir-input" type="password" autocomplete="off" placeholder="Paste Torn API key" />
          <button class="tbir-btn" id="tbir-save-key" type="button">Save & Fetch</button>
          <button class="tbir-btn" id="tbir-clear-key" type="button">Clear</button>
        </div>
        <div class="tbir-manual" id="tbir-manual">
          ${TERMS.map((term) => `
            <div class="tbir-apr-field">
              <label>${term.label} APR</label>
              <input id="tbir-apr-${term.key}" class="tbir-input" type="number" min="0" max="1000" step="0.01" />
            </div>
          `).join("")}
        </div>
        <div class="tbir-status" id="tbir-status"></div>
        <div class="tbir-table-wrap">
          <table class="tbir-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Regular</th>
                <th>TCI Only</th>
                <th id="tbir-merits-only-head">10/10 Merits Only</th>
                <th id="tbir-merits-stock-head">10/10 Merits + TCI</th>
              </tr>
            </thead>
            <tbody id="tbir-results"></tbody>
          </table>
        </div>
      </div>
    `;

    document.body.appendChild(toggle);
    document.body.appendChild(widget);

    document.getElementById("tbir-fetch").addEventListener("click", fetchAprs);
    document.getElementById("tbir-save-key").addEventListener("click", saveKeyAndFetch);
    document.getElementById("tbir-clear-key").addEventListener("click", clearKey);
    document.getElementById("tbir-key-toggle").addEventListener("click", () => toggleClass("tbir-key-wrap", "open"));
    document.getElementById("tbir-manual-toggle").addEventListener("click", () => toggleClass("tbir-manual", "open"));
    widget.addEventListener("input", handleInput);
    widget.addEventListener("change", handleInput);

    syncInputs();
    calculateAndRender();
    if (!didAutoFetch) {
      didAutoFetch = true;
      window.setTimeout(fetchAprs, 500);
    }
  }

  function syncBankRoute() {
    if (isBankScreen()) {
      buildWidget();
      return;
    }
    removeWidget();
  }

  function removeWidget() {
    const toggle = document.getElementById("tbir-toggle");
    const widget = document.getElementById("tbir-widget");
    if (toggle) toggle.remove();
    if (widget) widget.remove();
    isOpen = false;
  }

  function setOpen(nextOpen) {
    isOpen = nextOpen;
    const widget = document.getElementById("tbir-widget");
    const toggle = document.getElementById("tbir-toggle");
    if (widget) widget.classList.toggle("tbir-open", isOpen);
    if (toggle) toggle.classList.toggle("tbir-attached", isOpen);
  }

  function isBankScreen() {
    const path = window.location.pathname.toLowerCase();
    const search = normalizeKeyText(window.location.search);
    const hash = normalizeKeyText(window.location.hash);
    const combined = normalizeKeyText(window.location.href);
    return (
      path.includes("bank") ||
      search.includes("sidbank") ||
      search.includes("stepbank") ||
      search.includes("bank") ||
      hash.includes("bank") ||
      combined.includes("sidbank") ||
      combined.includes("stepbank")
    );
  }

  function handleInput() {
    readInputs();
    saveState();
    calculateAndRender();
  }

  function syncInputs() {
    valueOf("tbir-key", state.apiKey);
    valueOf("tbir-principal", moneyInput(state.principal));
    valueOf("tbir-merits", state.merits);
    valueOf("tbir-limit", state.bankLimit);
    TERMS.forEach((term) => valueOf(`tbir-apr-${term.key}`, state.aprs[term.key] || ""));
  }

  function readInputs() {
    state.apiKey = String(valueOf("tbir-key") || "").trim();
    state.principal = parseMoney(valueOf("tbir-principal"));
    state.merits = clampInt(valueOf("tbir-merits"), 0, 10, 10);
    state.bankLimit = Number(valueOf("tbir-limit")) === OIL_RIG_LIMIT ? OIL_RIG_LIMIT : BANK_LIMIT;
    TERMS.forEach((term) => {
      state.aprs[term.key] = clampNumber(valueOf(`tbir-apr-${term.key}`), 0, 1000, 0);
    });
  }

  function calculateAndRender() {
    const cappedPrincipal = Math.min(state.principal, state.bankLimit);
    const meritsMultiplier = 1 + state.merits * 0.05;
    const scenarios = [
      { key: "regular", multiplier: 1 },
      { key: "stock", multiplier: STOCK_BONUS },
      { key: "merits", multiplier: meritsMultiplier },
      { key: "both", multiplier: meritsMultiplier * STOCK_BONUS },
    ];
    const rows = TERMS.map((term) => {
      const baseApr = Number(state.aprs[term.key]) || 0;
      return {
        ...term,
        baseApr,
        displayApr: baseApr * meritsMultiplier,
        scenarios: scenarios.map((scenario) => calculateScenario(cappedPrincipal, term, baseApr, scenario.multiplier)),
      };
    });
    const bestInterest = Math.max(...rows.map((row) => row.scenarios[0].daily));

    textOf("tbir-merits-only-head", `${state.merits}/10 Merits Only`);
    textOf("tbir-merits-stock-head", `${state.merits}/10 Merits + TCI`);
    setStatus(statusText());

    const body = document.getElementById("tbir-results");
    if (!body) return;
    body.innerHTML = rows
      .map((row) => {
        return `
          <tr class="${row.scenarios[0].daily > 0 && row.scenarios[0].daily === bestInterest ? "best" : ""}">
            <td class="tbir-period">
              <span class="tbir-period-apr">${escapeHtml(formatApr(row.displayApr))}</span>
              <span class="tbir-period-label">${escapeHtml(row.label)}</span>
            </td>
            ${row.scenarios.map((scenario) => `
              <td>
                <span class="tbir-money">${escapeHtml(money(scenario.interest))}</span>
                <span class="tbir-daily">${escapeHtml(money(scenario.daily))}</span>
              </td>
            `).join("")}
          </tr>
        `;
      })
      .join("");
  }

  function calculateScenario(principal, term, baseApr, multiplier) {
    const aprPercent = baseApr / 100;
    const aprWithBonus = aprPercent * multiplier;
    const profitPerDayRatio = (aprWithBonus / DAYS_IN_YEAR) * term.days;
    const interest = roundNearest(Number(profitPerDayRatio.toFixed(4)) * principal, 1);
    return {
      interest,
      daily: Number((interest / term.days).toFixed()),
    };
  }

  function statusText() {
    if (state.principal > state.bankLimit) {
      return `Investment capped at ${money(state.bankLimit)} for this calculation.`;
    }
    if (aprsLoaded()) {
      return state.aprsFetchedAt
        ? `APRs fetched ${formatClock(state.aprsFetchedAt)}. Cyan values are average daily return.`
        : "APRs loaded. Cyan values are average daily return.";
    }
    return "Refresh APRs with an API key, or open Manual APR and enter rates.";
  }

  async function saveKeyAndFetch() {
    state.apiKey = String(valueOf("tbir-key") || "").trim();
    saveState();
    await fetchAprs();
  }

  function clearKey() {
    state.apiKey = "";
    valueOf("tbir-key", "");
    saveState();
    setStatus("API key cleared.");
  }

  async function fetchAprs() {
    readInputs();
    saveState();
    if (!state.apiKey) {
      toggleClass("tbir-key-wrap", "open", true);
      setStatus("Add an API key first.");
      return;
    }
    if (isFetching) return;
    isFetching = true;
    setStatus("Fetching bank APRs from Torn API...");

    try {
      const data = await requestFirstBankData();
      const aprs = extractBankAprs(data);
      const missing = TERMS.filter((term) => !aprs[term.key]);
      if (missing.length) throw new Error("Response did not include every bank APR.");

      state.aprs = aprs;
      state.aprsFetchedAt = Date.now();
      saveState();
      syncInputs();
      calculateAndRender();
      setStatus("Bank APRs fetched from Torn API.");
    } catch (error) {
      toggleClass("tbir-manual", "open", true);
      setStatus("Could not fetch APRs: " + error.message + " Enter APRs manually.");
      calculateAndRender();
    } finally {
      isFetching = false;
    }
  }

  async function requestFirstBankData() {
    const urls = API_BANK_URLS.map((url) => url.replace("{key}", encodeURIComponent(state.apiKey)));
    let lastError = null;
    for (const url of urls) {
      try {
        const data = await requestJson(url);
        if (data && data.error) throw new Error(data.error.error || data.error.message || "API error");
        return data;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("No API response.");
  }

  function extractBankAprs(data) {
    const bankInfo = firstObject(data && data.bank, data && data.torn && data.torn.bank, data && data.data && data.data.bank, data);
    const aprs = {};
    TERMS.forEach((term) => {
      aprs[term.key] = normalizeApr(bankInfo && bankInfo[term.key]) || findTermApr(data, term);
    });
    if (!TERMS.every((term) => aprs[term.key])) {
      const orderedAprs = extractOrderedAprs(data);
      if (orderedAprs.length >= TERMS.length) {
        TERMS.forEach((term, index) => {
          aprs[term.key] = aprs[term.key] || orderedAprs[index];
        });
      }
    }
    return aprs;
  }

  function extractOrderedAprs(data) {
    if (typeof data === "string") {
      return (data.match(/[0-9]+(?:\.[0-9]+)?/g) || [])
        .map(normalizeApr)
        .filter(Boolean)
        .slice(0, TERMS.length);
    }

    const values = [];
    walkValues(data, [], (path, value) => {
      const pathText = normalizeKeyText(path.join("_"));
      if (/(limit|amount|principal|duration|days|timestamp|timeleft|rfcv)/i.test(pathText)) return;
      const apr = normalizeApr(value);
      if (apr) values.push(apr);
    });
    return values;
  }

  function findTermApr(root, term) {
    if (typeof root === "string") {
      return findTermAprInText(root, term);
    }

    const direct = findDirectTermApr(root, term);
    if (direct) return direct;

    const candidates = [];
    walkValues(root, [], (path, value) => {
      const pathText = normalizeKeyText(path.join("_"));
      if (!term.aliases.some((alias) => pathText.includes(alias))) return;
      if (/(limit|amount|principal|duration|days|timestamp|timeleft)/i.test(pathText)) return;
      if (!/(apr|rate|interest|percent|percentage)/i.test(pathText) && typeof value === "object") return;
      const apr = normalizeApr(value);
      if (apr) candidates.push(apr);
    });
    return candidates[0] || 0;
  }

  function findTermAprInText(text, term) {
    const compactText = String(text || "").toLowerCase().replace(/[^a-z0-9.]/g, "");
    const alias = term.aliases.find((termAlias) => compactText.includes(termAlias));
    if (!alias) return 0;

    const loosePattern = new RegExp(`${alias}.{0,80}(?:apr|rate|interest|percent|percentage).{0,30}([0-9]+(?:\\.[0-9]+)?)`, "i");
    const reversePattern = new RegExp(`([0-9]+(?:\\.[0-9]+)?).{0,30}(?:apr|rate|interest|percent|percentage).{0,80}${alias}`, "i");
    const directPattern = new RegExp(`${alias}.{0,30}([0-9]+(?:\\.[0-9]+)?)`, "i");
    const looseMatch = compactText.match(loosePattern) || compactText.match(reversePattern) || compactText.match(directPattern);
    return looseMatch ? normalizeApr(looseMatch[1]) : 0;
  }

  function findDirectTermApr(root, term) {
    let found = 0;
    walkValues(root, [], (path, value, parent) => {
      if (found || !parent || typeof parent !== "object" || Array.isArray(parent)) return;
      if (!objectMatchesTerm(parent, term)) return;
      const apr = normalizeApr(firstValue(parent.apr, parent.rate, parent.interest, parent.percentage, parent.percent));
      if (apr) found = apr;
    });
    return found;
  }

  function objectMatchesTerm(object, term) {
    const joined = normalizeKeyText(Object.keys(object).map((key) => `${key}:${object[key]}`).join(" "));
    if (term.aliases.some((alias) => joined.includes(alias))) return true;
    return Number(object.days || object.duration || object.length) === term.days;
  }

  function walkValues(value, path, visit) {
    if (value == null) return;
    if (typeof value !== "object") {
      visit(path, value, null);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((child, index) => {
        if (child && typeof child === "object") visit(path.concat(index), child, child);
        walkValues(child, path.concat(index), visit);
      });
      return;
    }
    Object.keys(value).forEach((key) => {
      const child = value[key];
      if (child && typeof child === "object") visit(path.concat(key), child, child);
      else visit(path.concat(key), child, value);
      walkValues(child, path.concat(key), visit);
    });
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

  function loadState() {
    try {
      return normalizeState(JSON.parse(localStorage.getItem(STORE_KEY) || "{}"));
    } catch (_) {
      return normalizeState({});
    }
  }

  function normalizeState(saved) {
    return {
      principal: clampNumber(saved.principal, 0, OIL_RIG_LIMIT, BANK_LIMIT),
      apiKey: typeof saved.apiKey === "string" ? saved.apiKey : "",
      merits: clampInt(saved.merits, 0, 10, 10),
      bankLimit: Number(saved.bankLimit) === OIL_RIG_LIMIT ? OIL_RIG_LIMIT : BANK_LIMIT,
      aprsFetchedAt: Math.max(0, Number(saved.aprsFetchedAt) || 0),
      aprs: TERMS.reduce((aprs, term) => {
        aprs[term.key] = clampNumber(saved.aprs && saved.aprs[term.key], 0, 1000, 0);
        return aprs;
      }, {}),
    };
  }

  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function normalizeApr(value) {
    const number = Number(String(value).replace(/[%\s,]/g, ""));
    if (!Number.isFinite(number) || number <= 0 || number > 1000) return 0;
    return number <= 1 ? number * 100 : number;
  }

  function normalizeKeyText(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(String(value).replace(/[$,%\s,]/g, ""));
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function clampInt(value, min, max, fallback) {
    return Math.round(clampNumber(value, min, max, fallback));
  }

  function parseMoney(value) {
    return clampNumber(value, 0, OIL_RIG_LIMIT, 0);
  }

  function money(value) {
    return `$${Math.round(Number(value) || 0).toLocaleString()}`;
  }

  function moneyInput(value) {
    return Math.round(Number(value) || 0).toLocaleString();
  }

  function formatApr(value) {
    const number = Number(value) || 0;
    return `${number.toFixed(2)}% APR`;
  }

  function roundNearest(number, nearest) {
    const step = Number(nearest) || 1;
    return Math.round((Number(number) || 0) / step) * step;
  }

  function aprsLoaded() {
    return TERMS.every((term) => Number(state.aprs[term.key]) > 0);
  }

  function setStatus(text) {
    textOf("tbir-status", text);
  }

  function formatClock(ms) {
    return new Date(ms).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function toggleClass(id, className, force) {
    const el = document.getElementById(id);
    if (!el) return;
    if (typeof force === "boolean") el.classList.toggle(className, force);
    else el.classList.toggle(className);
  }

  function firstValue(...values) {
    return values.find((value) => value !== undefined && value !== null && value !== "");
  }

  function firstObject(...values) {
    return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
  }

  function valueOf(id, nextValue) {
    const el = document.getElementById(id);
    if (!el) return "";
    if (arguments.length > 1) el.value = nextValue;
    return el.value;
  }

  function textOf(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
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
