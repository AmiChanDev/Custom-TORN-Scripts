// ==UserScript==
// @name         Torn LE Tracker
// @namespace    torn-LE-tracker
// @version      3.2.0
// @description  Compact loss/escape tracking panel with local payment tracking.
// @author       AmrisG
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @connect      api.torn.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  "use strict";

  const STORE_KEY = "tlet:v1";
  const LEGACY_STORE_KEY = "tlpt:v1";
  const API_BASE = "https://api.torn.com/v2";
  const API_V1_BASE = "https://api.torn.com";
  const DEFAULT_RATE = 350000;
  const DEFAULT_ESCAPE_RATE = 600000;
  const DEFAULT_LOOKBACK_DAYS = 30;
  const DEFAULT_SOURCE_CODES = ["BHG", "NST"];

  const state = loadState();
  let lossRows = [];
  let isOpen = false;
  let settingsOpen = false;
  let includesEarlierUnpaid = false;
  let activeView = "unpaid";
  let searchTerm = "";
  let sourceFilter = "";
  let searchRenderTimer = 0;
  const expandedGroups = new Set();

  GM_addStyle(`
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Sora:wght@400;600;700&display=swap');

    /* ── Toggle Tab ── */
    #tlpt-toggle {
      position: fixed; right: 0; top: 50%; transform: translateY(-50%);
      z-index: 999998; width: 22px; height: 64px; border: 0;
      border-radius: 6px 0 0 6px; background: #1a1a18; color: #c8c5b8;
      box-shadow: -2px 0 12px rgba(0,0,0,.5); cursor: pointer;
      font: 700 8px/1 'Sora', sans-serif; letter-spacing: .5px;
      writing-mode: vertical-rl; text-orientation: mixed;
      transition: right .22s cubic-bezier(.2,.8,.2,1), background .15s, color .15s;
    }
    #tlpt-toggle:hover { background: #252522; color: #f0efe8; }
    #tlpt-toggle.tlpt-attached { right: min(420px, calc(100vw - 40px)); z-index: 1000000; }

    /* ── Panel Shell ── */
    #tlpt-panel {
      position: fixed; right: 0; top: 0; bottom: 0; z-index: 999999;
      width: min(420px, calc(100vw - 32px)); display: flex; flex-direction: column;
      background: #181816; color: #e8e6de;
      box-shadow: -6px 0 32px rgba(0,0,0,.6); font: 13px/1.45 'Sora', sans-serif;
      transform: translateX(calc(100% + 16px)); visibility: hidden; pointer-events: none;
      transition: transform .22s cubic-bezier(.2,.8,.2,1), visibility 0s linear .22s;
      will-change: transform;
    }
    #tlpt-panel.tlpt-open {
      transform: translateX(0); visibility: visible; pointer-events: auto;
      transition: transform .22s cubic-bezier(.2,.8,.2,1), visibility 0s;
    }
    #tlpt-panel, #tlpt-panel * {
      font-family: 'Sora', sans-serif !important; text-shadow: none !important; box-sizing: border-box;
    }

    /* ── Header ── */
    .tlpt-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; border-bottom: 1px solid #2a2a27;
      background: #111110; flex-shrink: 0;
    }
    .tlpt-title { font-size: 15px; font-weight: 700; color: #f0efe8; letter-spacing: -.2px; }
    .tlpt-head-actions { display: flex; gap: 5px; align-items: center; }

    /* ── Buttons ── */
    .tlpt-btn, .tlpt-icon-btn {
      border: 1px solid #333330; border-radius: 5px; background: #222220;
      color: #d8d6ce; cursor: pointer; font: 600 12px 'Sora', sans-serif;
      transition: background .12s, color .12s, border-color .12s;
    }
    .tlpt-btn { height: 28px; padding: 0 11px; }
    .tlpt-icon-btn { width: 28px; height: 28px; font-size: 14px; display: flex; align-items: center; justify-content: center; }
    .tlpt-btn:hover, .tlpt-icon-btn:hover { background: #2e2e2b; color: #f0efe8; }
    .tlpt-icon-btn.active { background: #2a2a27; border-color: #555550; color: #f0efe8; }

    /* ── Settings Drawer ── */
    .tlpt-settings {
      display: none; flex-direction: column; gap: 0;
      border-bottom: 1px solid #2a2a27; background: #0e0e0d; flex-shrink: 0;
    }
    .tlpt-settings.open { display: flex; }

    .tlpt-settings-inner {
      padding: 10px 12px 12px;
      display: flex; flex-direction: column; gap: 8px;
    }

    .tlpt-settings-title {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .8px; color: #555550; padding-bottom: 2px;
    }

    .tlpt-field label {
      display: block; margin-bottom: 3px; color: #888680;
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px;
    }
    .tlpt-input {
      width: 100%; height: 28px; border: 1px solid #2e2e2b; border-radius: 5px;
      background: #1a1a18; color: #e8e6de; padding: 0 7px;
      font: 600 12px 'Sora', sans-serif; transition: border-color .12s;
    }
    .tlpt-input:focus { outline: none; border-color: #555550; }
    .tlpt-input[type="password"] { font-weight: 400; letter-spacing: 2px; }
    .tlpt-input::placeholder { color: #444440; font-weight: 400; letter-spacing: 0; }

    .tlpt-key-row { display: flex; gap: 6px; align-items: end; }
    .tlpt-key-row .tlpt-field { flex: 1; }
    .tlpt-backup-row, .tlpt-source-manage-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .tlpt-source-manage-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }

    .tlpt-key-status {
      font-size: 11px; font-weight: 600; padding: 3px 0;
      height: 18px; display: flex; align-items: center; gap: 5px;
    }
    .tlpt-key-dot {
      width: 6px; height: 6px; border-radius: 50%; background: #444440; flex-shrink: 0;
    }
    .tlpt-key-dot.set { background: #5ec47a; }
    .tlpt-key-text { color: #666460; }

    /* ── Config Bar ── */
    .tlpt-config {
      display: grid; grid-template-columns: 1fr 96px 106px 58px;
      gap: 6px; padding: 8px 12px; border-bottom: 1px solid #2a2a27;
      background: #111110; flex-shrink: 0; align-items: end;
    }

    /* ── Summary Bar ── */
    .tlpt-summary {
      display: grid; grid-template-columns: repeat(4, 1fr);
      border-bottom: 1px solid #2a2a27; flex-shrink: 0;
    }
    .tlpt-stat { padding: 7px 10px; border-right: 1px solid #2a2a27; }
    .tlpt-stat:last-child { border-right: 0; }
    .tlpt-stat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #555550; }
    .tlpt-stat-value {
      font: 700 13px/1.25 'JetBrains Mono', monospace !important;
      color: #e8e6de; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px;
    }
    #tlpt-outstanding { color: #e8a020; }
    #tlpt-paid-stat   { color: #5ec47a; }

    /* ── View Tabs ── */
    .tlpt-view-tabs {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 6px; padding: 8px 12px; border-bottom: 1px solid #2a2a27;
      background: #111110; flex-shrink: 0;
    }
    .tlpt-view-tab {
      height: 28px; border: 1px solid #333330; border-radius: 5px;
      background: #1b1b19; color: #77746c; cursor: pointer;
      font: 700 11px 'Sora', sans-serif !important; text-transform: uppercase;
      letter-spacing: .5px;
    }
    .tlpt-view-tab:hover { background: #252522; color: #d8d6ce; }
    .tlpt-view-tab.active { background: #2a2a27; color: #f0efe8; border-color: #555550; }

    /* ── Filters and Bulk Actions ── */
    .tlpt-filter-bar {
      display: grid; grid-template-columns: 1fr 92px; gap: 6px;
      padding: 8px 12px; border-bottom: 1px solid #2a2a27;
      background: #111110; flex-shrink: 0;
    }
    .tlpt-bulk-bar {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
      padding: 0 12px 8px; border-bottom: 1px solid #2a2a27;
      background: #111110; flex-shrink: 0;
    }
    .tlpt-btn.danger { background: #321616; color: #f0a0a0; }
    .tlpt-btn.success { background: #16321f; color: #5ec47a; }
    .tlpt-btn.blue { background: #162535; color: #90c0f0; }

    /* ── Due Banner ── */
    .tlpt-due {
      padding: 5px 12px; border-bottom: 1px solid #2a2a27;
      font-size: 12px; font-weight: 600; color: #666460; flex-shrink: 0;
    }
    .tlpt-due-amount { color: #e8a020; font-weight: 700; font-family: 'JetBrains Mono', monospace !important; }

    /* ── Status ── */
    .tlpt-status {
      padding: 4px 12px; font-size: 11px; color: #555550;
      border-bottom: 1px solid #2a2a27; flex-shrink: 0; min-height: 20px;
      display: flex; align-items: center;
    }

    /* ── Scrollable Body ── */
    .tlpt-body { overflow-y: auto; flex: 1; }
    .tlpt-body::-webkit-scrollbar { width: 4px; }
    .tlpt-body::-webkit-scrollbar-track { background: #111110; }
    .tlpt-body::-webkit-scrollbar-thumb { background: #333330; border-radius: 2px; }

    /* ── Date Sections ── */
    .tlpt-date-section {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px 6px; background: #111110; border-bottom: 1px solid #242421;
      color: #8d8980; font-size: 10px; font-weight: 700; letter-spacing: .7px;
      text-transform: uppercase; position: sticky; top: 0; z-index: 1;
    }
    .tlpt-date-total {
      color: #c8c5b8; font: 700 11px 'JetBrains Mono', monospace !important;
      letter-spacing: 0; text-transform: none;
    }

    /* ── Contract Row ── */
    .tlpt-contract { border-bottom: 1px solid #252523; }
    .tlpt-contract:last-child { border-bottom: 0; }
    .tlpt-contract:nth-child(odd) .tlpt-contract-head { background: #222220; }
    .tlpt-contract:nth-child(even) .tlpt-contract-head { background: #262624; }

    .tlpt-contract-head {
      display: grid; grid-template-columns: 1fr auto auto auto 16px;
      align-items: center; gap: 8px; padding: 9px 12px;
      cursor: pointer; transition: background .1s;
    }
    .tlpt-contract-head:hover { background: #2d2d2b !important; }

    .tlpt-target-name {
      font-size: 13px; font-weight: 700; color: #f0efe8;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .tlpt-target-name a { color: inherit; text-decoration: none; }
    .tlpt-target-name a:hover { color: #a8b8ff; }
    .tlpt-target-meta {
      font-size: 11px; color: #666460; font-weight: 600; margin-top: 1px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    /* Pills */
    .tlpt-pills { display: flex; gap: 3px; align-items: center; }
    .tlpt-pill {
      border-radius: 3px; padding: 2px 5px; font-size: 10px; font-weight: 700;
      font-family: 'JetBrains Mono', monospace !important; letter-spacing: .3px;
    }
    .tlpt-pill-loss { background: #3a1616; color: #f0a0a0; }
    .tlpt-pill-esc  { background: #162535; color: #90c0f0; }

    /* Badge */
    .tlpt-badge {
      border-radius: 3px; padding: 2px 6px; font-size: 10px;
      font-weight: 700; letter-spacing: .3px; text-transform: uppercase;
    }
    .tlpt-badge-paid   { background: #0f2a1a; color: #5ec47a; }
    .tlpt-badge-unpaid { background: #2a1e04; color: #e8a020; }

    .tlpt-row-amount {
      font: 700 13px 'JetBrains Mono', monospace !important;
      color: #f0efe8; white-space: nowrap;
    }
    .tlpt-chevron { color: #444440; font-size: 10px; transition: transform .15s; }
    .tlpt-chevron.open { transform: rotate(180deg); color: #888680; }

    /* ── Expanded Body ── */
    .tlpt-contract-body {
      display: none; flex-direction: column; gap: 8px;
      padding: 8px 12px 10px; border-top: 1px solid #2a2a27; background: #111110;
    }
    .tlpt-contract-body.open { display: flex; }

    .tlpt-body-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px; align-items: end; }
    .tlpt-rate-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }

    .tlpt-mini-input {
      width: 100%; height: 28px; border: 1px solid #2e2e2b; border-radius: 4px;
      background: #1a1a18; color: #e8e6de; padding: 0 7px;
      font: 600 12px 'JetBrains Mono', monospace !important;
    }
    .tlpt-mini-input:focus { outline: none; border-color: #555550; }
    .tlpt-source-select { font-family: 'Sora', sans-serif !important; text-transform: uppercase; }

    .tlpt-formula { font: 600 11px 'JetBrains Mono', monospace !important; color: #666460; padding: 3px 0; }
    .tlpt-formula-total { color: #e8e6de; }

    .tlpt-mark-btn {
      height: 28px; padding: 0 11px; border-radius: 4px; border: 0; cursor: pointer;
      font: 700 11px 'Sora', sans-serif !important; letter-spacing: .3px;
      text-transform: uppercase; transition: opacity .12s; white-space: nowrap;
    }
    .tlpt-mark-btn:hover { opacity: .8; }
    .tlpt-mark-btn.mark-paid   { background: #1a3d28; color: #5ec47a; }
    .tlpt-mark-btn.mark-unpaid { background: #2a1e04; color: #e8a020; }
    .tlpt-mark-btn.mark-remove { background: #3a1616; color: #f0a0a0; }
    .tlpt-mark-btn.mark-restore { background: #162535; color: #90c0f0; }

    /* ── Attack Log ── */
    .tlpt-log { border-top: 1px solid #222220; padding-top: 6px; display: flex; flex-direction: column; gap: 2px; }
    .tlpt-log-row {
      display: grid; grid-template-columns: 64px 1fr auto; gap: 6px;
      align-items: center; padding: 3px 0; font-size: 11px; color: #666460; font-weight: 600;
    }
    .tlpt-log-time { font-family: 'JetBrains Mono', monospace !important; font-size: 11px; color: #555550; }
    .tlpt-log-desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tlpt-log-amt  { font-family: 'JetBrains Mono', monospace !important; color: #aaa8a0; font-weight: 700; white-space: nowrap; }

    /* Source tag */
    .tlpt-source-tag {
      display: inline-block; border-radius: 3px; padding: 1px 5px;
      background: #2a2010; color: #c8901a; font-size: 10px; font-weight: 700;
      margin-right: 5px; vertical-align: 1px;
    }

    .tlpt-empty { padding: 32px 16px; text-align: center; color: #444440; font-size: 13px; font-weight: 600; }

    /* ── Settings divider ── */
    .tlpt-settings-sep {
      height: 1px; background: #1e1e1c; margin: 0 12px;
    }

    @media (prefers-reduced-motion: reduce) {
      #tlpt-panel, #tlpt-toggle { transition: none; }
    }

    @media (max-width: 600px) {
      #tlpt-panel { width: calc(100vw - 28px); }
      #tlpt-toggle.tlpt-attached { right: calc(100vw - 28px); }
      .tlpt-config { grid-template-columns: 1fr 1fr; }
      .tlpt-summary { grid-template-columns: 1fr 1fr; }
      .tlpt-body-row { grid-template-columns: 1fr; }
    }
  `);

  buildShell();

  /* ─── UI SHELL ─── */

  function buildShell() {
    const toggle = document.createElement("button");
    toggle.id = "tlpt-toggle";
    toggle.type = "button";
    toggle.textContent = "PAY";
    toggle.title = "Open LE tracker";
    toggle.addEventListener("click", togglePanel);

    const panel = document.createElement("section");
    panel.id = "tlpt-panel";
    panel.innerHTML = `
      <div class="tlpt-head">
        <div class="tlpt-title">LE Tracker</div>
        <div class="tlpt-head-actions">
          <button class="tlpt-btn" id="tlpt-refresh" type="button">↻ Refresh</button>
          <button class="tlpt-icon-btn" id="tlpt-settings-btn" type="button" title="Settings">⚙</button>
          <button class="tlpt-icon-btn" id="tlpt-close" type="button" title="Close">✕</button>
        </div>
      </div>

      <!-- Settings drawer (hidden by default) -->
      <div class="tlpt-settings" id="tlpt-settings-drawer">
        <div class="tlpt-settings-inner">
          <div class="tlpt-settings-title">Settings</div>
          <div class="tlpt-key-row">
            <div class="tlpt-field">
              <label>API Key</label>
              <input id="tlpt-key" class="tlpt-input" type="password" autocomplete="off" placeholder="Paste Limited Access key" />
            </div>
            <button class="tlpt-btn" id="tlpt-save-key" type="button" style="align-self:end">Save</button>
          </div>
          <div id="tlpt-key-status" class="tlpt-key-status">
            <span class="tlpt-key-dot" id="tlpt-key-dot"></span>
            <span class="tlpt-key-text" id="tlpt-key-text">No key saved</span>
          </div>
          <div class="tlpt-settings-sep"></div>
          <div class="tlpt-settings-title">Tracking</div>
          <div class="tlpt-field">
            <label>Lookback Days</label>
            <input id="tlpt-lookback" class="tlpt-input" type="number" min="0" max="365" step="1" />
          </div>
          <div class="tlpt-settings-sep"></div>
          <div class="tlpt-settings-title">Sources</div>
          <div class="tlpt-source-manage-row">
            <select id="tlpt-source-manage" class="tlpt-input tlpt-source-select"></select>
            <div class="tlpt-source-manage-actions">
              <button class="tlpt-btn" id="tlpt-rename-source" type="button">Rename</button>
              <button class="tlpt-btn danger" id="tlpt-delete-source" type="button">Delete</button>
            </div>
          </div>
          <div class="tlpt-settings-sep"></div>
          <div class="tlpt-settings-title">Backup</div>
          <div class="tlpt-backup-row">
            <button class="tlpt-btn" id="tlpt-export-backup" type="button">Export JSON</button>
            <button class="tlpt-btn" id="tlpt-import-backup" type="button">Import JSON</button>
          </div>
          <input id="tlpt-import-file" type="file" accept="application/json,.json" style="display:none" />
        </div>
      </div>

      <!-- Config: rates + date + load -->
      <div class="tlpt-config">
        <div class="tlpt-field">
          <label>Date</label>
          <input id="tlpt-date" class="tlpt-input" type="date" />
        </div>
        <div class="tlpt-field">
          <label>Loss $</label>
          <input id="tlpt-rate" class="tlpt-input" type="number" min="0" step="50000" />
        </div>
        <div class="tlpt-field">
          <label>Escape $</label>
          <input id="tlpt-escape-rate" class="tlpt-input" type="number" min="0" step="50000" />
        </div>
        <button class="tlpt-btn" id="tlpt-load" type="button" style="align-self:end">Load</button>
      </div>

      <!-- Summary -->
      <div class="tlpt-summary">
        <div class="tlpt-stat">
          <div class="tlpt-stat-label">Billable</div>
          <div class="tlpt-stat-value" id="tlpt-loss-count">0</div>
        </div>
        <div class="tlpt-stat">
          <div class="tlpt-stat-label">Expected</div>
          <div class="tlpt-stat-value" id="tlpt-expected">$0</div>
        </div>
        <div class="tlpt-stat">
          <div class="tlpt-stat-label">Paid</div>
          <div class="tlpt-stat-value" id="tlpt-paid-stat">$0</div>
        </div>
        <div class="tlpt-stat">
          <div class="tlpt-stat-label">Outstanding</div>
          <div class="tlpt-stat-value" id="tlpt-outstanding">$0</div>
        </div>
      </div>

      <div class="tlpt-view-tabs">
        <button class="tlpt-view-tab active" data-view="unpaid" type="button">Unpaid</button>
        <button class="tlpt-view-tab" data-view="paid" type="button">Paid</button>
        <button class="tlpt-view-tab" data-view="removed" type="button">Removed</button>
      </div>

      <div class="tlpt-filter-bar">
        <input id="tlpt-search" class="tlpt-input" type="search" placeholder="Search name or ID" />
        <select id="tlpt-source-filter" class="tlpt-input tlpt-source-select"></select>
      </div>
      <div class="tlpt-bulk-bar">
        <button class="tlpt-btn success" id="tlpt-bulk-paid" type="button">Mark Paid</button>
        <button class="tlpt-btn danger" id="tlpt-bulk-remove" type="button">Remove</button>
        <button class="tlpt-btn blue" id="tlpt-bulk-restore" type="button">Restore</button>
      </div>

      <div class="tlpt-due" id="tlpt-due" style="display:none"></div>
      <div class="tlpt-status" id="tlpt-status"></div>
      <div class="tlpt-body" id="tlpt-table-wrap"></div>
    `;

    document.body.append(toggle, panel);

    // Wire inputs
    const keyInput = document.getElementById("tlpt-key");
    const rateInput = document.getElementById("tlpt-rate");
    const escRateInput = document.getElementById("tlpt-escape-rate");
    const dateInput = document.getElementById("tlpt-date");
    const lookbackInput = document.getElementById("tlpt-lookback");

    keyInput.value = state.apiKey || "";
    rateInput.value = String(state.defaultRate || DEFAULT_RATE);
    escRateInput.value = String(state.defaultEscapeRate || DEFAULT_ESCAPE_RATE);
    dateInput.value = state.selectedDate || todayInputValue();
    lookbackInput.value = String(lookbackDays());

    updateKeyStatus();

    document.getElementById("tlpt-save-key").addEventListener("click", () => {
      state.apiKey = keyInput.value.trim();
      saveState();
      updateKeyStatus();
      setStatus(state.apiKey ? "API key saved." : "Key cleared.");
    });
    document
      .getElementById("tlpt-export-backup")
      .addEventListener("click", exportBackup);
    document.getElementById("tlpt-import-backup").addEventListener("click", () => {
      document.getElementById("tlpt-import-file").click();
    });
    document
      .getElementById("tlpt-import-file")
      .addEventListener("change", importBackup);
    document
      .getElementById("tlpt-rename-source")
      .addEventListener("click", renameSelectedSource);
    document
      .getElementById("tlpt-delete-source")
      .addEventListener("click", deleteSelectedSource);
    document.getElementById("tlpt-search").addEventListener("input", (e) => {
      searchTerm = String(e.target.value || "").trim().toLowerCase();
      expandedGroups.clear();
      queueSearchRender();
    });
    document
      .getElementById("tlpt-source-filter")
      .addEventListener("change", (e) => {
        sourceFilter = String(e.target.value || "");
        expandedGroups.clear();
        render();
      });
    document
      .getElementById("tlpt-bulk-paid")
      .addEventListener("click", markVisiblePaid);
    document
      .getElementById("tlpt-bulk-remove")
      .addEventListener("click", removeVisibleGroups);
    document
      .getElementById("tlpt-bulk-restore")
      .addEventListener("click", restoreVisibleGroups);
    document
      .getElementById("tlpt-table-wrap")
      .addEventListener("click", handleTableClick);
    document
      .getElementById("tlpt-table-wrap")
      .addEventListener("change", handleTableChange);

    rateInput.addEventListener("change", () => {
      state.defaultRate = Math.max(0, Number(rateInput.value) || DEFAULT_RATE);
      saveState();
      render();
    });
    escRateInput.addEventListener("change", () => {
      state.defaultEscapeRate = Math.max(
        0,
        Number(escRateInput.value) || DEFAULT_ESCAPE_RATE,
      );
      saveState();
      render();
    });
    dateInput.addEventListener("change", () => {
      state.selectedDate = dateInput.value || todayInputValue();
      saveState();
    });
    lookbackInput.addEventListener("change", () => {
      state.lookbackDays = clampLookbackDays(lookbackInput.value);
      lookbackInput.value = String(state.lookbackDays);
      saveState();
      setStatus(`Lookback set to ${state.lookbackDays} days.`);
    });

    document
      .getElementById("tlpt-refresh")
      .addEventListener("click", refreshLosses);
    document
      .getElementById("tlpt-load")
      .addEventListener("click", refreshLosses);
    document
      .getElementById("tlpt-close")
      .addEventListener("click", togglePanel);
    document
      .getElementById("tlpt-settings-btn")
      .addEventListener("click", toggleSettings);
    panel.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nextView = btn.dataset.view || "unpaid";
        if (nextView !== activeView) expandedGroups.clear();
        activeView = nextView;
        render();
      });
    });

    render();
  }

  function updateKeyStatus() {
    const dot = document.getElementById("tlpt-key-dot");
    const text = document.getElementById("tlpt-key-text");
    if (!dot || !text) return;
    if (state.apiKey) {
      dot.classList.add("set");
      text.textContent =
        "Key saved (" +
        state.apiKey.slice(0, 4) +
        "…" +
        state.apiKey.slice(-4) +
        ")";
    } else {
      dot.classList.remove("set");
      text.textContent = "No key saved";
    }
  }

  function toggleSettings() {
    settingsOpen = !settingsOpen;
    document
      .getElementById("tlpt-settings-drawer")
      .classList.toggle("open", settingsOpen);
    document
      .getElementById("tlpt-settings-btn")
      .classList.toggle("active", settingsOpen);
    if (settingsOpen) document.getElementById("tlpt-key").focus();
  }

  function togglePanel() {
    isOpen = !isOpen;
    document.getElementById("tlpt-panel").classList.toggle("tlpt-open", isOpen);
    document
      .getElementById("tlpt-toggle")
      .classList.toggle("tlpt-attached", isOpen);
    if (isOpen && state.apiKey && lossRows.length === 0) refreshLosses();
  }

  function exportBackup() {
    saveState();
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        storeKey: STORE_KEY,
        state,
      },
      null,
      2,
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `torn-le-tracker-${todayInputValue()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("Backup exported.");
  }

  function importBackup(event) {
    const input = event.target;
    const file = input && input.files && input.files[0];
    if (!file) return;

    if (!window.confirm("Import this backup and replace current LE Tracker data?")) {
      input.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const importedState = parsed && parsed.state ? parsed.state : parsed;
        const nextState = normalizeState(importedState || {});
        Object.keys(state).forEach((key) => delete state[key]);
        Object.assign(state, nextState);
        saveState();
        lossRows = [];
        expandedGroups.clear();
        includesEarlierUnpaid = false;
        activeView = "unpaid";
        searchTerm = "";
        sourceFilter = "";
        clearTimeout(searchRenderTimer);
        syncInputsFromState();
        updateKeyStatus();
        render();
        setStatus("Backup imported. Press Load to refresh the visible rows.");
      } catch (err) {
        setStatus(`Import failed: ${err.message}`);
      } finally {
        input.value = "";
      }
    };
    reader.onerror = () => {
      setStatus("Import failed: could not read file.");
      input.value = "";
    };
    reader.readAsText(file);
  }

  function syncInputsFromState() {
    const keyInput = document.getElementById("tlpt-key");
    const rateInput = document.getElementById("tlpt-rate");
    const escRateInput = document.getElementById("tlpt-escape-rate");
    const dateInput = document.getElementById("tlpt-date");
    const lookbackInput = document.getElementById("tlpt-lookback");
    const searchInput = document.getElementById("tlpt-search");
    const sourceFilterInput = document.getElementById("tlpt-source-filter");
    if (keyInput) keyInput.value = state.apiKey || "";
    if (rateInput) rateInput.value = String(state.defaultRate || DEFAULT_RATE);
    if (escRateInput)
      escRateInput.value = String(
        state.defaultEscapeRate || DEFAULT_ESCAPE_RATE,
      );
    if (dateInput) dateInput.value = state.selectedDate || todayInputValue();
    if (lookbackInput) lookbackInput.value = String(lookbackDays());
    if (searchInput) searchInput.value = searchTerm;
    if (sourceFilterInput) sourceFilterInput.value = sourceFilter;
  }

  /* ─── DATA FETCH ─── */

  async function refreshLosses() {
    const key =
      state.apiKey || document.getElementById("tlpt-key").value.trim();
    if (!key) {
      setStatus("No API key — open ⚙ Settings to add one.");
      if (!settingsOpen) toggleSettings();
      return;
    }

    setStatus("Loading…");
    try {
      state.selectedDate =
        document.getElementById("tlpt-date").value || todayInputValue();
      saveState();

      const range = selectedDateRange(state.selectedDate);
      const fetchRange = earlierRange(range, lookbackDays());
      const [outgoingData, incomingData] = await Promise.all([
        fetchAttacksForDirection(key, fetchRange, "outgoing"),
        fetchAttacksForDirection(key, fetchRange, "incoming"),
      ]);

      const attacks = [
        ...tagDirection(outgoingData.attacks, "outgoing"),
        ...tagDirection(incomingData.attacks, "incoming"),
      ];

      const fetchedRows = dedupeAttacks(attacks)
        .map((attack) => normalizeAttack(attack, attack.__tlptDirection))
        .filter((r) => r.timestamp >= fetchRange.from && r.timestamp < range.to)
        .filter(isBillableAction);
      cacheBillableRows(fetchedRows, false);

      lossRows = dedupeRows([
        ...fetchedRows,
        ...cachedBillableRows(fetchRange.from, range.to),
      ]).filter((row) => row.timestamp >= fetchRange.from && row.timestamp < range.to);

      await hydrateMissingNames(key, lossRows, false);
      cacheBillableRows(lossRows, false);
      saveState();
      includesEarlierUnpaid = lossRows.some(
        (row) => row.timestamp < range.from && rowOutstanding(row) > 0,
      );
      const earlierText = includesEarlierUnpaid
        ? `, including unpaid from up to ${lookbackDays()} earlier days`
        : "";
      setStatus(
        `${lossRows.length} billable attacks${earlierText} from ${attacks.length} total.`,
      );
      render();
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  }

  /* ─── NORMALIZE ─── */

  async function fetchAttacksForDirection(apiKey, range, direction) {
    const url = `${API_BASE}/user/attacksfull?filters=${direction}&sort=DESC&limit=1000&from=${range.from}&to=${range.to}&key=${encodeURIComponent(apiKey)}&comment=le-tracker`;
    const data = await requestJson(url);
    if (data.error) {
      throw new Error(`${data.error.code}: ${data.error.error || "Torn API error"}`);
    }
    return {
      attacks: extractAttacks(data),
    };
  }

  function extractAttacks(data) {
    const attacks = data && (data.attacks || (data.data && data.data.attacks));
    if (Array.isArray(attacks)) return attacks;
    if (attacks && typeof attacks === "object") return Object.values(attacks);
    return [];
  }

  function tagDirection(attacks, direction) {
    return attacks.map((attack) => ({
      ...attack,
      __tlptDirection: direction,
    }));
  }

  function dedupeAttacks(attacks) {
    const seen = new Set();
    return attacks.filter((attack) => {
      const key = String(
        attack.id ||
          attack.attack_id ||
          attack.code ||
          `${attack.started || attack.timestamp}:${attack.result}:${attack.__tlptDirection}`,
      );
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeAttack(attack, direction) {
    const attacker = firstObject(
      attack.attacker,
      attack.attacker_player,
      attack.attacker_user,
    );
    const defender = firstObject(
      attack.defender,
      attack.defender_player,
      attack.defender_user,
      attack.target,
      attack.opponent,
    );
    const result = normalizedAttackResult(attack);
    const timestamp =
      attack.started ||
      attack.start ||
      attack.timestamp_started ||
      attack.timestamp ||
      attack.ended ||
      attack.end ||
      0;
    const defenderId = firstValue(
      defender.id,
      defender.user_id,
      defender.player_id,
      attack.defender_id,
      attack.target_id,
      attack.opponent_id,
    );
    const defenderName = firstValue(
      defender.name,
      defender.player_name,
      defender.username,
      attack.defender_name,
      attack.target_name,
      attack.opponent_name,
    );
    const attackerId = firstValue(
      attacker.id,
      attacker.user_id,
      attacker.player_id,
      attack.attacker_id,
    );
    const attackerName = firstValue(
      attacker.name,
      attacker.player_name,
      attacker.username,
      attack.attacker_name,
    );
    const buyerId = direction === "incoming" ? attackerId : defenderId;
    const buyerName = direction === "incoming" ? attackerName : defenderName;
    const id = String(
      attack.id ||
        attack.attack_id ||
        `${timestamp}:${buyerId || buyerName || "unknown"}:${direction || "unknown"}`,
    );
    return {
      id,
      timestamp: Number(timestamp) || 0,
      kind: actionKind(result),
      direction: direction || "outgoing",
      attackerId,
      attackerName: attackerName || "You",
      defenderId: buyerId,
      defenderName:
        buyerName || (buyerId ? `Player ${buyerId}` : "Unknown"),
      result,
      respect: Number(attack.respect_gain || attack.respect || 0),
      raw: attack,
    };
  }

  function actionKind(result) {
    const n = String(result || "").replace(/[_-]/g, " ");
    if (n === "escape" || n === "escaped" || n.includes("escape"))
      return "escape";
    return "loss";
  }

  function normalizedAttackResult(attack) {
    return String(
      firstValue(
        attack.result,
        attack.outcome,
        attack.status,
        attack.attack_result,
        attack.result_text,
        attack.log && attack.log.result,
      ) || "",
    ).toLowerCase();
  }

  function isLoss(row) {
    const r = row.result.replace(/[_-]/g, " ");
    return (
      r === "lost" || r === "loss" || r.includes("lost") || r.includes("defeat")
    );
  }
  function isEscape(row) {
    const r = row.result.replace(/[_-]/g, " ");
    return r === "escape" || r === "escaped" || r.includes("escape");
  }
  function isBillableAction(row) {
    if (row.direction === "incoming") return isEscape(row);
    return isLoss(row) || isEscape(row);
  }

  function cacheBillableRows(rows, shouldSave = true) {
    state.billableRows = plainObject(state.billableRows)
      ? state.billableRows
      : {};
    rows.filter(isBillableAction).forEach((row) => {
      state.billableRows[row.id] = cachedRow(row);
    });
    pruneBillableRows();
    if (shouldSave) saveState();
  }

  function cachedBillableRows(from, to) {
    if (!plainObject(state.billableRows)) return [];
    return Object.values(state.billableRows)
      .filter((row) => row && row.timestamp >= from && row.timestamp < to)
      .filter(isBillableAction);
  }

  function cachedRow(row) {
    return {
      id: String(row.id),
      timestamp: Number(row.timestamp) || 0,
      kind: row.kind,
      direction: row.direction,
      attackerId: row.attackerId,
      attackerName: row.attackerName,
      defenderId: row.defenderId,
      defenderName: row.defenderName,
      result: row.result,
      respect: Number(row.respect || 0),
      raw: {
        energy_used: row.raw && row.raw.energy_used,
        energy: row.raw && row.raw.energy,
      },
    };
  }

  function pruneBillableRows() {
    const cutoff = Math.floor(Date.now() / 1000) - 90 * 86400;
    Object.keys(state.billableRows).forEach((id) => {
      const row = state.billableRows[id];
      if (!row || Number(row.timestamp || 0) < cutoff) {
        delete state.billableRows[id];
      }
    });
  }

  function dedupeRows(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      if (!row || !row.id || seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  }

  function rowOutstanding(row) {
    const rec = getPayRecord(row.id, row);
    const expected =
      rec.expected == null ? defaultExpectedFor(row) : Number(rec.expected);
    const paid = Number(rec.paid || 0);
    return Math.max(0, expected - paid);
  }

  function defaultExpectedFor(row) {
    return row && row.kind === "escape"
      ? Number(state.defaultEscapeRate) || DEFAULT_ESCAPE_RATE
      : Number(state.defaultRate) || DEFAULT_RATE;
  }

  /* ─── RENDER ─── */

  function enrichedRows(rows = lossRows) {
    return rows.map((row) => {
      const rec = getPayRecord(row.id, row);
      const expected =
        rec.expected == null ? defaultExpectedFor(row) : Number(rec.expected);
      const paid = Number(rec.paid || 0);
      return {
        ...row,
        expected,
        paid,
        removed: isRemovedRow(row),
        outstanding: Math.max(0, expected - paid),
      };
    });
  }

  function currentGroups() {
    return buildGroups(enrichedRows());
  }

  function visibleGroups() {
    return currentGroups()
      .filter(groupMatchesActiveView)
      .filter(groupMatchesFilters);
  }

  function queueSearchRender() {
    clearTimeout(searchRenderTimer);
    searchRenderTimer = setTimeout(render, 120);
  }

  function render() {
    const tableWrap = document.getElementById("tlpt-table-wrap");
    if (!tableWrap) return;

    updateViewTabs();
    updateSourceControls();

    const groups = visibleGroups();
    const visibleRows = groups.flatMap((g) => g.rows);
    const expectedTotal = visibleRows.reduce((s, r) => s + r.expected, 0);
    const paidTotal = groups.reduce((s, g) => s + g.paid, 0);
    const outstandingTotal = groups.reduce((s, g) => s + g.outstanding, 0);

    document.getElementById("tlpt-loss-count").textContent = String(
      visibleRows.length,
    );
    document.getElementById("tlpt-expected").textContent = money(expectedTotal);
    document.getElementById("tlpt-paid-stat").textContent = money(paidTotal);
    document.getElementById("tlpt-outstanding").textContent =
      money(outstandingTotal);

    const dueEl = document.getElementById("tlpt-due");
    if (visibleRows.length > 0) {
      dueEl.style.display = "";
      dueEl.innerHTML = viewSummaryHtml(expectedTotal, paidTotal, outstandingTotal);
    } else {
      dueEl.style.display = "none";
    }

    if (visibleRows.length === 0) {
      tableWrap.innerHTML = emptyViewHtml();
      return;
    }

    tableWrap.innerHTML = groupsByDateHtml(groups);
  }

  function updateViewTabs() {
    const panel = document.getElementById("tlpt-panel");
    if (!panel) return;
    panel.querySelectorAll("[data-view]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === activeView);
    });
  }

  function updateSourceControls() {
    const filter = document.getElementById("tlpt-source-filter");
    if (filter) {
      const current = sourceFilter;
      filter.innerHTML = sourceFilterOptionsHtml(current);
      filter.value = current;
    }

    const manager = document.getElementById("tlpt-source-manage");
    if (manager) {
      const current = manager.value;
      manager.innerHTML = sourceManageOptionsHtml(current);
      if (current) manager.value = current;
    }
  }

  function groupMatchesActiveView(group) {
    const removed = isRemovedGroup(group);
    if (activeView === "removed") return removed;
    if (removed) return false;
    if (activeView === "paid") return group.outstanding <= 0;
    return group.outstanding > 0;
  }

  function groupMatchesFilters(group) {
    if (sourceFilter && getGroupNote(group.id) !== sourceFilter) return false;
    if (!searchTerm) return true;

    const haystack = [
      group.defenderName,
      group.defenderId,
      group.day,
      getGroupNote(group.id),
      ...group.rows.flatMap((row) => [
        row.attackerName,
        row.attackerId,
        row.defenderName,
        row.defenderId,
        row.result,
      ]),
    ]
      .filter((value) => value !== undefined && value !== null)
      .join(" ")
      .toLowerCase();

    return haystack.includes(searchTerm);
  }

  function handleTableClick(event) {
    const target = event.target;
    const paidBtn = target.closest && target.closest("[data-paid-toggle]");
    if (paidBtn) {
      event.stopPropagation();
      updateGroupPaidToggle(
        paidBtn.dataset.paidToggle,
        paidBtn.dataset.isPaid !== "true",
      );
      return;
    }

    const removeBtn = target.closest && target.closest("[data-remove-group]");
    if (removeBtn) {
      event.stopPropagation();
      removeGroup(removeBtn.dataset.removeGroup);
      return;
    }

    const restoreBtn = target.closest && target.closest("[data-restore-group]");
    if (restoreBtn) {
      event.stopPropagation();
      restoreGroup(restoreBtn.dataset.restoreGroup);
      return;
    }

    const expandEl = target.closest && target.closest("[data-expand]");
    if (expandEl) {
      const id = expandEl.dataset.expand;
      expandedGroups.has(id)
        ? expandedGroups.delete(id)
        : expandedGroups.add(id);
      render();
    }
  }

  function handleTableChange(event) {
    const target = event.target;
    if (!target) return;
    if (target.dataset && target.dataset.rate) {
      event.stopPropagation();
      updateGroupRate(target.dataset.rate, target.dataset.kind, target.value);
      return;
    }
    if (target.dataset && target.dataset.note) {
      event.stopPropagation();
      handleSourceChange(target);
    }
  }

  function viewSummaryHtml(expectedTotal, paidTotal, outstandingTotal) {
    if (activeView === "paid") {
      return `Paid contracts through ${escapeHtml(state.selectedDate || todayInputValue())}: <span class="tlpt-due-amount">${escapeHtml(money(paidTotal))}</span>`;
    }
    if (activeView === "removed") {
      return `Removed contracts through ${escapeHtml(state.selectedDate || todayInputValue())}: <span class="tlpt-due-amount">${escapeHtml(money(expectedTotal))}</span>`;
    }
    const dueLabel = includesEarlierUnpaid ? "Due through" : "Due";
    return `${dueLabel} ${escapeHtml(state.selectedDate || todayInputValue())}: <span class="tlpt-due-amount">${escapeHtml(money(outstandingTotal))}</span>`;
  }

  function emptyViewHtml() {
    if (activeView === "paid") {
      return '<div class="tlpt-empty">No paid contracts for this view.</div>';
    }
    if (activeView === "removed") {
      return '<div class="tlpt-empty">No removed contracts for this view.</div>';
    }
    return '<div class="tlpt-empty">No unpaid losses loaded.<br>Set your API key (⚙) and press Load.</div>';
  }

  /* ─── GROUP BUILD ─── */

  function buildGroups(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const day = formatDayKey(row.timestamp);
      const tKey = row.defenderId || row.defenderName || "unknown";
      const gKey = `${day}:${tKey}`;

      if (!map.has(gKey))
        map.set(gKey, {
          id: gKey,
          day,
          defenderId: row.defenderId,
          defenderName: row.defenderName,
          rows: [],
          lossCount: 0,
          escapeCount: 0,
          lossExpected: 0,
          escapeExpected: 0,
          expected: 0,
          paid: 0,
          removedCount: 0,
          outstanding: 0,
          firstTimestamp: row.timestamp,
          lastTimestamp: row.timestamp,
        });

      const g = map.get(gKey);
      g.rows.push(row);
      if (row.kind === "escape") {
        g.escapeCount++;
        g.escapeExpected += row.expected;
      } else {
        g.lossCount++;
        g.lossExpected += row.expected;
      }
      g.expected += row.expected;
      g.paid += row.paid;
      if (row.removed) g.removedCount++;
      g.firstTimestamp = Math.max(g.firstTimestamp, row.timestamp);
      g.lastTimestamp = Math.min(g.lastTimestamp, row.timestamp);
      if (
        g.defenderName.startsWith("Player ") &&
        !row.defenderName.startsWith("Player ")
      )
        g.defenderName = row.defenderName;
    });

    return Array.from(map.values())
      .map((g) => ({
        ...g,
        removed: g.rows.length > 0 && g.removedCount === g.rows.length,
        outstanding: Math.max(0, g.expected - g.paid),
      }))
      .sort((a, b) => b.firstTimestamp - a.firstTimestamp);
  }

  /* ─── GROUP HTML ─── */

  function groupsByDateHtml(groups) {
    const chunks = [];
    let currentDay = null;
    let currentGroups = [];

    groups.forEach((group) => {
      if (currentDay !== null && group.day !== currentDay) {
        chunks.push(dateSectionHtml(currentDay, currentGroups));
        currentGroups = [];
      }
      currentDay = group.day;
      currentGroups.push(group);
    });

    if (currentGroups.length) {
      chunks.push(dateSectionHtml(currentDay, currentGroups));
    }

    return chunks.join("");
  }

  function dateSectionHtml(day, groups) {
    const expected = groups.reduce((sum, group) => sum + group.expected, 0);
    const outstanding = groups.reduce(
      (sum, group) => sum + group.outstanding,
      0,
    );
    const total = activeView === "unpaid" ? outstanding : expected;
    const count = groups.reduce((sum, group) => sum + group.rows.length, 0);

    return `
      <div class="tlpt-date-section">
        <span>${escapeHtml(day)} · ${count} ${count === 1 ? "record" : "records"}</span>
        <span class="tlpt-date-total">${escapeHtml(money(total))}</span>
      </div>
      ${groups.map(groupHtml).join("")}
    `;
  }

  function groupHtml(group) {
    const isExpanded = expandedGroups.has(group.id);
    const gId = escapeAttr(group.id);
    const isPaid = group.outstanding <= 0;
    const isRemoved = isRemovedGroup(group);
    const note = getGroupNote(group.id);

    const targetHtml = group.defenderId
      ? `<a href="/profiles.php?XID=${escapeAttr(group.defenderId)}" target="_blank" rel="noopener">${escapeHtml(group.defenderName)}</a>`
      : escapeHtml(group.defenderName);

    const lossRate =
      group.lossCount > 0
        ? Math.round(group.lossExpected / group.lossCount)
        : Number(state.defaultRate) || DEFAULT_RATE;
    const escapeRate =
      group.escapeCount > 0
        ? Math.round(group.escapeExpected / group.escapeCount)
        : Number(state.defaultEscapeRate) || DEFAULT_ESCAPE_RATE;

    const pillsHtml = [
      group.lossCount > 0
        ? `<span class="tlpt-pill tlpt-pill-loss">${group.lossCount}L</span>`
        : "",
      group.escapeCount > 0
        ? `<span class="tlpt-pill tlpt-pill-esc">${group.escapeCount}E</span>`
        : "",
    ].join("");

    const formulaParts = [];
    if (group.lossCount > 0)
      formulaParts.push(`${group.lossCount} × ${money(lossRate)}`);
    if (group.escapeCount > 0)
      formulaParts.push(`${group.escapeCount} × ${money(escapeRate)}`);

    const idBit = group.defenderId
      ? ` <span style="color:#555550;font-size:11px;font-weight:400">[${escapeHtml(group.defenderId)}]</span>`
      : "";

    return `
      <div class="tlpt-contract">
        <div class="tlpt-contract-head" data-expand="${gId}">
          <div style="min-width:0">
            <div class="tlpt-target-name">${note ? `<span class="tlpt-source-tag">${escapeHtml(note)}</span>` : ""}${targetHtml}${idBit}</div>
            <div class="tlpt-target-meta">${escapeHtml(group.day)} · ${escapeHtml(compactTimeRange(group.lastTimestamp, group.firstTimestamp))}</div>
          </div>
          <div class="tlpt-pills">${pillsHtml}</div>
          <div class="tlpt-badge ${isRemoved ? "tlpt-badge-unpaid" : isPaid ? "tlpt-badge-paid" : "tlpt-badge-unpaid"}">${isRemoved ? "Removed" : isPaid ? "Paid" : "Unpaid"}</div>
          <div class="tlpt-row-amount">${escapeHtml(money(group.expected))}</div>
          <div class="tlpt-chevron${isExpanded ? " open" : ""}">▼</div>
        </div>

        <div class="tlpt-contract-body${isExpanded ? " open" : ""}">
          <div class="tlpt-body-row">
            <div class="tlpt-rate-pair">
              ${group.lossCount > 0 ? `<div class="tlpt-field"><label>Loss $</label><input class="tlpt-mini-input" data-rate="${gId}" data-kind="loss" type="number" min="0" step="50000" value="${lossRate}"></div>` : ""}
              ${group.escapeCount > 0 ? `<div class="tlpt-field"><label>Escape $</label><input class="tlpt-mini-input" data-rate="${gId}" data-kind="escape" type="number" min="0" step="50000" value="${escapeRate}"></div>` : ""}
            </div>
            <div class="tlpt-field">
              <label>Source</label>
              ${sourceSelectHtml(gId, note)}
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
              <div class="tlpt-formula">${escapeHtml(formulaParts.join(" + "))} = <span class="tlpt-formula-total">${escapeHtml(money(group.expected))}</span></div>
              ${groupActionsHtml(group, isPaid, isRemoved)}
            </div>
          </div>
          <div class="tlpt-log">
            ${group.rows.map(attackLogHtml).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function attackLogHtml(row) {
    const energy = firstValue(
      row.raw && row.raw.energy_used,
      row.raw && row.raw.energy,
      25,
    );
    return `
      <div class="tlpt-log-row">
        <span class="tlpt-log-time">${escapeHtml(formatTime(row.timestamp))}</span>
        <span class="tlpt-log-desc">${escapeHtml(energy)}e → ${escapeHtml(row.defenderName)}</span>
        <span class="tlpt-log-amt">${escapeHtml(money(row.expected))}</span>
      </div>
    `;
  }

  function sourceFilterOptionsHtml(selected) {
    return [
      '<option value="">All</option>',
      ...allSourceCodes().map((code) => {
        const isSelected = code === selected;
        return `<option value="${escapeAttr(code)}"${isSelected ? " selected" : ""}>${escapeHtml(code)}</option>`;
      }),
    ].join("");
  }

  function sourceManageOptionsHtml(selected) {
    const codes = allSourceCodes();
    if (!codes.length) return '<option value="">No sources</option>';
    return codes
      .map((code) => {
        const isSelected = code === selected;
        return `<option value="${escapeAttr(code)}"${isSelected ? " selected" : ""}>${escapeHtml(code)}</option>`;
      })
      .join("");
  }

  function sourceSelectHtml(groupId, selected) {
    const codes = sourceCodes(selected);
    const options = [
      '<option value="">None</option>',
      ...codes.map((code) => {
        const isSelected = code === selected;
        return `<option value="${escapeAttr(code)}"${isSelected ? " selected" : ""}>${escapeHtml(code)}</option>`;
      }),
      '<option value="__add__">+ Add</option>',
    ];
    return `<select class="tlpt-mini-input tlpt-source-select" data-note="${groupId}">${options.join("")}</select>`;
  }

  function groupActionsHtml(group, isPaid, isRemoved) {
    const gId = escapeAttr(group.id);
    if (isRemoved) {
      return `<button class="tlpt-mark-btn mark-restore" data-restore-group="${gId}" type="button">Restore</button>`;
    }
    return `
      <div style="display:flex;gap:5px;justify-content:flex-end;flex-wrap:wrap">
        <button class="tlpt-mark-btn ${isPaid ? "mark-unpaid" : "mark-paid"}" data-paid-toggle="${gId}" data-is-paid="${isPaid}" type="button">
          ${isPaid ? "Mark Unpaid" : "Mark Paid"}
        </button>
        <button class="tlpt-mark-btn mark-remove" data-remove-group="${gId}" type="button">Remove</button>
      </div>
    `;
  }

  /* ─── STATE UPDATES ─── */

  function getPayRecord(id, row) {
    if (!state.payments[id])
      state.payments[id] = {
        expected: defaultExpectedFor(row || { kind: "loss" }),
        paid: 0,
      };
    return state.payments[id];
  }

  function getGroupNote(groupId) {
    return normalizeSourceCode((state.groupNotes || {})[groupId]);
  }

  function allSourceCodes() {
    const codes = new Set(sourceCodes());
    Object.values(state.groupNotes || {}).forEach((code) => {
      const normalized = normalizeSourceCode(code);
      if (normalized) codes.add(normalized);
    });
    return Array.from(codes).sort();
  }

  function sourceCodes(extra) {
    const codes = new Set(DEFAULT_SOURCE_CODES);
    if (Array.isArray(state.sourceCodes)) {
      state.sourceCodes.forEach((code) => {
        const normalized = normalizeSourceCode(code);
        if (normalized) codes.add(normalized);
      });
    }
    const normalizedExtra = normalizeSourceCode(extra);
    if (normalizedExtra) codes.add(normalizedExtra);
    return Array.from(codes).sort();
  }

  function handleSourceChange(select) {
    const groupId = select.dataset.note;
    if (select.value === "__add__") {
      const code = normalizeSourceCode(
        window.prompt("Enter a 3-letter source code", ""),
      );
      if (!code) {
        select.value = getGroupNote(groupId);
        return;
      }
      addSourceCode(code);
      updateGroupNote(groupId, code);
      return;
    }
    updateGroupNote(groupId, select.value);
  }

  function addSourceCode(code) {
    const normalized = normalizeSourceCode(code);
    if (!normalized || DEFAULT_SOURCE_CODES.includes(normalized)) return;
    state.sourceCodes = Array.from(
      new Set([
        ...(Array.isArray(state.sourceCodes) ? state.sourceCodes : []),
        normalized,
      ]
        .map(normalizeSourceCode)
        .filter(Boolean)
        .filter((source) => !DEFAULT_SOURCE_CODES.includes(source))),
    ).sort();
  }

  function renameSelectedSource() {
    const select = document.getElementById("tlpt-source-manage");
    const oldCode = normalizeSourceCode(select && select.value);
    if (!oldCode) return;
    if (DEFAULT_SOURCE_CODES.includes(oldCode)) {
      setStatus(`Built-in source ${oldCode} cannot be renamed.`);
      return;
    }

    const newCode = normalizeSourceCode(
      window.prompt("Rename source code", oldCode),
    );
    if (!newCode || newCode === oldCode) return;

    state.sourceCodes = Array.from(
      new Set([
        ...(Array.isArray(state.sourceCodes) ? state.sourceCodes : []),
        newCode,
      ]
        .map(normalizeSourceCode)
        .filter(Boolean)
        .filter((code) => code !== oldCode && !DEFAULT_SOURCE_CODES.includes(code))),
    ).sort();
    Object.keys(state.groupNotes || {}).forEach((groupId) => {
      if (normalizeSourceCode(state.groupNotes[groupId]) === oldCode) {
        state.groupNotes[groupId] = newCode;
      }
    });
    if (sourceFilter === oldCode) sourceFilter = newCode;
    saveState();
    render();
    setStatus(`Source ${oldCode} renamed to ${newCode}.`);
  }

  function deleteSelectedSource() {
    const select = document.getElementById("tlpt-source-manage");
    const code = normalizeSourceCode(select && select.value);
    if (!code) return;
    if (DEFAULT_SOURCE_CODES.includes(code)) {
      setStatus(`Built-in source ${code} cannot be deleted.`);
      return;
    }
    if (!window.confirm(`Delete source ${code} and clear it from contracts?`)) {
      return;
    }

    state.sourceCodes = (Array.isArray(state.sourceCodes) ? state.sourceCodes : [])
      .map(normalizeSourceCode)
      .filter((source) => source && source !== code);
    Object.keys(state.groupNotes || {}).forEach((groupId) => {
      if (normalizeSourceCode(state.groupNotes[groupId]) === code) {
        delete state.groupNotes[groupId];
      }
    });
    if (sourceFilter === code) sourceFilter = "";
    saveState();
    render();
    setStatus(`Source ${code} deleted.`);
  }

  function updateGroupNote(groupId, value) {
    state.groupNotes = state.groupNotes || {};
    const note = normalizeSourceCode(value);
    addSourceCode(note);
    if (note) state.groupNotes[groupId] = note;
    else delete state.groupNotes[groupId];
    saveState();
    render();
  }

  function normalizeSourceCode(value) {
    const code = String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 3);
    return code.length === 3 ? code : "";
  }

  function isRemovedRow(row) {
    return Boolean(state.removedRows && state.removedRows[row.id]);
  }

  function isRemovedGroup(group) {
    return Boolean(group && group.rows.length > 0 && group.rows.every(isRemovedRow));
  }

  function removeGroup(groupId) {
    const group = currentGroup(groupId);
    if (!group) return;
    if (!window.confirm("Remove contract for " + group.defenderName + "?")) return;
    state.removedRows = plainObject(state.removedRows) ? state.removedRows : {};
    group.rows.forEach((row) => {
      state.removedRows[row.id] = Date.now();
    });
    saveState();
    render();
    setStatus("Contract removed. View Removed tab to restore.");
  }

  function restoreGroup(groupId) {
    const group = currentGroup(groupId);
    if (!group || !state.removedRows) return;
    if (!window.confirm("Restore contract for " + group.defenderName + "?")) return;
    group.rows.forEach((row) => {
      delete state.removedRows[row.id];
    });
    saveState();
    render();
    setStatus("Contract restored.");
  }

  function currentGroup(groupId) {
    return currentGroups().find((g) => g.id === groupId);
  }

  function markVisiblePaid() {
    const groups = visibleGroups().filter((group) => !isRemovedGroup(group));
    if (!groups.length) {
      setStatus("No visible contracts to mark paid.");
      return;
    }
    if (!window.confirm("Mark " + groups.length + " visible contracts paid?")) return;
    groups.forEach((group) => distributeGroupMoney(group.rows, "paid", group.expected));
    saveState();
    render();
    setStatus(`${groups.length} visible contracts marked paid.`);
  }

  function removeVisibleGroups() {
    const groups = visibleGroups().filter((group) => !isRemovedGroup(group));
    if (!groups.length) {
      setStatus("No visible contracts to remove.");
      return;
    }
    if (!window.confirm(`Remove ${groups.length} visible contracts?`)) return;
    state.removedRows = plainObject(state.removedRows) ? state.removedRows : {};
    groups.forEach((group) => {
      group.rows.forEach((row) => {
        state.removedRows[row.id] = Date.now();
      });
    });
    saveState();
    render();
    setStatus(`${groups.length} visible contracts removed.`);
  }

  function restoreVisibleGroups() {
    const groups = visibleGroups().filter(isRemovedGroup);
    if (!groups.length) {
      setStatus("No visible removed contracts to restore.");
      return;
    }
    if (!window.confirm("Restore " + groups.length + " visible contracts?")) return;
    groups.forEach((group) => {
      group.rows.forEach((row) => delete state.removedRows[row.id]);
    });
    saveState();
    render();
    setStatus(`${groups.length} visible contracts restored.`);
  }

  function updateGroupPaidToggle(groupId, isPaid) {
    const group = currentGroup(groupId);
    if (!group) return;
    const action = isPaid ? "Mark paid" : "Mark unpaid";
    if (!window.confirm(action + " for " + group.defenderName + "?")) return;
    distributeGroupMoney(group.rows, "paid", isPaid ? group.expected : 0);
    saveState();
    render();
  }

  function updateGroupRate(groupId, kind, value) {
    const group = currentGroup(groupId);
    if (!group) return;
    const rate = Math.max(0, Number(value) || 0);
    const targets = group.rows.filter((r) => r.kind === kind);
    const others = group.rows.filter((r) => r.kind !== kind);
    if (!targets.length) return;
    const othersExpected = others.reduce((s, r) => {
      const rec = getPayRecord(r.id, r);
      return (
        s +
        (rec.expected == null ? defaultExpectedFor(r) : Number(rec.expected))
      );
    }, 0);
    const wasPaid = group.outstanding <= 0;
    const currentPaid = group.rows.reduce((s, r) => s + Number(r.paid || 0), 0);
    distributeGroupMoney(targets, "expected", rate * targets.length);
    if (wasPaid) {
      distributeGroupMoney(group.rows, "paid", rate * targets.length + othersExpected);
    } else if (currentPaid > 0) {
      const newExpected = rate * targets.length + othersExpected;
      distributeGroupMoney(group.rows, "paid", Math.min(currentPaid, newExpected));
    }
    saveState();
    render();
  }

  function distributeGroupMoney(rows, key, total) {
    const base = Math.floor(total / rows.length);
    let rem = total - base * rows.length;
    rows.forEach((row) => {
      const rec = getPayRecord(row.id, row);
      const extra = rem > 0 ? 1 : 0;
      rec[key] = base + extra;
      rem -= extra;
    });
  }

  /* ─── NAME HYDRATE ─── */

  async function hydrateMissingNames(apiKey, rows, shouldSave = true) {
    state.nameCache = plainObject(state.nameCache) ? state.nameCache : {};
    const missing = Array.from(
      new Set(
        rows
          .filter(
            (r) =>
              r.defenderId &&
              (!r.defenderName ||
                r.defenderName === "Player " + r.defenderId ||
                r.defenderName === "Unknown"),
          )
          .map((r) => String(r.defenderId)),
      ),
    ).filter((id) => !state.nameCache[id]);
    if (!missing.length) {
      applyCachedNames(rows);
      return;
    }

    for (let i = 0; i < missing.length; i += 5) {
      const batch = missing.slice(i, i + 5);
      await Promise.all(batch.map((id) => hydrateName(apiKey, id)));
    }

    applyCachedNames(rows);
    if (shouldSave) saveState();
  }

  function applyCachedNames(rows) {
    rows.forEach((row) => {
      const n = state.nameCache[String(row.defenderId)];
      if (n) row.defenderName = n;
    });
  }

  async function hydrateName(apiKey, id) {
    if (state.nameCache[id]) return;
    try {
      const data = await requestJson(
        API_BASE +
          "/user/" +
          encodeURIComponent(id) +
          "/basic?key=" +
          encodeURIComponent(apiKey) +
          "&comment=le-tracker",
      );
      const name = extractProfileName(data);
      if (!data.error && name) {
        state.nameCache[id] = name;
        return;
      }
    } catch (_) {}

    try {
      const data = await requestJson(
        API_V1_BASE +
          "/user/" +
          encodeURIComponent(id) +
          "?selections=basic&key=" +
          encodeURIComponent(apiKey),
      );
      const name = extractProfileName(data);
      if (!data.error && name) state.nameCache[id] = name;
    } catch (_) {}
  }

  /* --- UTILS --- */

  function requestJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        timeout: 20000,
        onload: (r) => {
          try {
            resolve(JSON.parse(r.responseText));
          } catch (e) {
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
      return normalizeState({
        apiKey: "",
        defaultRate: DEFAULT_RATE,
        defaultEscapeRate: DEFAULT_ESCAPE_RATE,
        selectedDate: todayInputValue(),
        payments: {},
        nameCache: {},
        groupNotes: {},
        billableRows: {},
        sourceCodes: [],
        removedRows: {},
        lookbackDays: DEFAULT_LOOKBACK_DAYS,
        ...JSON.parse(localStorage.getItem(STORE_KEY) || localStorage.getItem(LEGACY_STORE_KEY) || "{}"),
      });
    } catch (_) {
      return normalizeState({
        apiKey: "",
        defaultRate: DEFAULT_RATE,
        defaultEscapeRate: DEFAULT_ESCAPE_RATE,
        selectedDate: todayInputValue(),
        payments: {},
        nameCache: {},
        groupNotes: {},
        billableRows: {},
        sourceCodes: [],
        removedRows: {},
        lookbackDays: DEFAULT_LOOKBACK_DAYS,
      });
    }
  }

  function normalizeState(saved) {
    return {
      ...saved,
      apiKey: typeof saved.apiKey === "string" ? saved.apiKey : "",
      defaultRate: Math.max(0, Number(saved.defaultRate) || DEFAULT_RATE),
      defaultEscapeRate: Math.max(
        0,
        Number(saved.defaultEscapeRate) || DEFAULT_ESCAPE_RATE,
      ),
      selectedDate:
        typeof saved.selectedDate === "string" && saved.selectedDate
          ? saved.selectedDate
          : todayInputValue(),
      payments: plainObject(saved.payments) ? saved.payments : {},
      nameCache: plainObject(saved.nameCache) ? saved.nameCache : {},
      groupNotes: plainObject(saved.groupNotes) ? saved.groupNotes : {},
      billableRows: plainObject(saved.billableRows) ? saved.billableRows : {},
      removedRows: plainObject(saved.removedRows) ? saved.removedRows : {},
      lookbackDays: clampLookbackDays(saved.lookbackDays),
      sourceCodes: Array.isArray(saved.sourceCodes)
        ? saved.sourceCodes.map(normalizeSourceCode).filter(Boolean)
        : [],
    };
  }

  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }
  function setStatus(text) {
    const el = document.getElementById("tlpt-status");
    if (el) el.textContent = text;
  }
  function money(value) {
    return `$${Math.round(Number(value) || 0).toLocaleString()}`;
  }
  function formatTime(ts) {
    if (!ts) return "—";
    return new Date(ts * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
  }
  function compactTimeRange(from, to) {
    return from === to
      ? formatTime(from)
      : `${formatTime(from)} – ${formatTime(to)}`;
  }
  function formatDayKey(ts) {
    if (!ts) return "Unknown";
    return new Date(ts * 1000).toLocaleDateString([], { timeZone: "UTC" });
  }
  function todayInputValue() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  function lookbackDays() {
    return clampLookbackDays(state.lookbackDays);
  }

  function clampLookbackDays(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_LOOKBACK_DAYS;
    return Math.min(365, Math.max(0, Math.floor(n)));
  }

  function selectedDateRange(dateValue) {
    const safe = /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
      ? dateValue
      : todayInputValue();
    const [year, month, day] = safe.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const end = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
    return {
      from: Math.floor(start.getTime() / 1000),
      to: Math.floor(end.getTime() / 1000),
    };
  }
  function earlierRange(range, days) {
    return {
      from: range.from - Math.max(0, Number(days) || 0) * 86400,
      to: range.to,
    };
  }
  function escapeHtml(v) {
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  function escapeAttr(v) {
    return escapeHtml(v);
  }
  function firstObject(...vals) {
    return vals.find((v) => v && typeof v === "object") || {};
  }
  function firstValue(...vals) {
    return vals.find((v) => v !== undefined && v !== null && v !== "");
  }
  function plainObject(v) {
    return Boolean(v && typeof v === "object" && !Array.isArray(v));
  }
  function extractProfileName(data) {
    return firstValue(
      data && data.name,
      data && data.username,
      data && data.player_name,
      data && data.basic && data.basic.name,
      data && data.user && data.user.name,
      data && data.profile && data.profile.name,
      data && data.player && data.player.name,
    );
  }
})();
