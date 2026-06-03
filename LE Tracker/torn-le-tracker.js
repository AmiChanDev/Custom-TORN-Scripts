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
  const LEGACY_STORE_KEY = "tlet:v1";
  const API_BASE = "https://api.torn.com/v2";
  const API_V1_BASE = "https://api.torn.com";
  const DEFAULT_RATE = 350000;
  const DEFAULT_ESCAPE_RATE = 600000;
  const DEFAULT_LOOKBACK_DAYS = 30;
  const DEFAULT_ROW_LIMIT = 1000;
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
    #tlet-toggle {
      position: fixed; right: 0; top: 50%; transform: translateY(-50%);
      z-index: 999998; width: 22px; height: 64px; border: 0;
      border-radius: 6px 0 0 6px; background: #1a1a18; color: #c8c5b8;
      box-shadow: -2px 0 12px rgba(0,0,0,.5); cursor: pointer;
      font: 700 8px/1 'Sora', sans-serif; letter-spacing: .5px;
      writing-mode: vertical-rl; text-orientation: mixed;
      transition: right .22s cubic-bezier(.2,.8,.2,1), background .15s, color .15s;
    }
    #tlet-toggle:hover { background: #252522; color: #f0efe8; }
    #tlet-toggle.tlet-attached { right: min(420px, calc(100vw - 40px)); z-index: 1000000; }

    /* ── Panel Shell ── */
    #tlet-panel {
      position: fixed; right: 0; top: 0; bottom: 0; z-index: 999999;
      width: min(420px, calc(100vw - 32px)); display: flex; flex-direction: column;
      background: #181816; color: #e8e6de;
      box-shadow: -6px 0 32px rgba(0,0,0,.6); font: 13px/1.45 'Sora', sans-serif;
      transform: translateX(calc(100% + 16px)); visibility: hidden; pointer-events: none;
      transition: transform .22s cubic-bezier(.2,.8,.2,1), visibility 0s linear .22s;
      will-change: transform;
    }
    #tlet-panel.tlet-open {
      transform: translateX(0); visibility: visible; pointer-events: auto;
      transition: transform .22s cubic-bezier(.2,.8,.2,1), visibility 0s;
    }
    #tlet-panel, #tlet-panel * {
      font-family: 'Sora', sans-serif !important; text-shadow: none !important; box-sizing: border-box;
    }

    /* ── Header ── */
    .tlet-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; border-bottom: 1px solid #2a2a27;
      background: #111110; flex-shrink: 0;
    }
    .tlet-title { font-size: 15px; font-weight: 700; color: #f0efe8; letter-spacing: -.2px; }
    .tlet-head-actions { display: flex; gap: 5px; align-items: center; }

    /* ── Buttons ── */
    .tlet-btn, .tlet-icon-btn {
      border: 1px solid #333330; border-radius: 5px; background: #222220;
      color: #d8d6ce; cursor: pointer; font: 600 12px 'Sora', sans-serif;
      transition: background .12s, color .12s, border-color .12s;
    }
    .tlet-btn { height: 28px; padding: 0 11px; }
    .tlet-icon-btn { width: 28px; height: 28px; font-size: 14px; display: flex; align-items: center; justify-content: center; }
    .tlet-btn:hover, .tlet-icon-btn:hover { background: #2e2e2b; color: #f0efe8; }
    .tlet-icon-btn.active { background: #2a2a27; border-color: #555550; color: #f0efe8; }

    /* ── Settings Drawer ── */
    .tlet-settings {
      display: none; flex-direction: column; gap: 0;
      border-bottom: 1px solid #2a2a27; background: #0e0e0d; flex-shrink: 0;
    }
    .tlet-settings.open { display: flex; }

    .tlet-settings-inner {
      padding: 10px 12px 12px;
      display: flex; flex-direction: column; gap: 8px;
    }

    .tlet-settings-title {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .8px; color: #555550; padding-bottom: 2px;
    }

    .tlet-field label {
      display: block; margin-bottom: 3px; color: #888680;
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px;
    }
    .tlet-input {
      width: 100%; height: 28px; border: 1px solid #2e2e2b; border-radius: 5px;
      background: #1a1a18; color: #e8e6de; padding: 0 7px;
      font: 600 12px 'Sora', sans-serif; transition: border-color .12s;
    }
    .tlet-input:focus { outline: none; border-color: #555550; }
    .tlet-input[type="password"] { font-weight: 400; letter-spacing: 2px; }
    .tlet-input::placeholder { color: #444440; font-weight: 400; letter-spacing: 0; }

    .tlet-key-row { display: flex; gap: 6px; align-items: end; }
    .tlet-key-row .tlet-field { flex: 1; }
    .tlet-backup-row, .tlet-source-manage-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .tlet-source-manage-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }

    .tlet-key-status {
      font-size: 11px; font-weight: 600; padding: 3px 0;
      height: 18px; display: flex; align-items: center; gap: 5px;
    }
    .tlet-key-dot {
      width: 6px; height: 6px; border-radius: 50%; background: #444440; flex-shrink: 0;
    }
    .tlet-key-dot.set { background: #5ec47a; }
    .tlet-key-text { color: #666460; }

    /* ── Config Bar ── */
    .tlet-config {
      display: grid; grid-template-columns: 72px 96px 106px 32px;
      gap: 6px; padding: 8px 12px; border-bottom: 1px solid #2a2a27;
      background: #111110; flex-shrink: 0; align-items: end;
    }

    /* ── Summary Bar ── */
    .tlet-summary {
      display: grid; grid-template-columns: repeat(4, 1fr);
      border-bottom: 1px solid #2a2a27; flex-shrink: 0;
    }
    .tlet-stat { padding: 7px 10px; border-right: 1px solid #2a2a27; }
    .tlet-stat:last-child { border-right: 0; }
    .tlet-stat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #555550; }
    .tlet-stat-value {
      font: 700 13px/1.25 'JetBrains Mono', monospace !important;
      color: #e8e6de; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px;
    }
    #tlet-outstanding { color: #e8a020; }
    #tlet-paid-stat   { color: #5ec47a; }

    /* ── View Tabs ── */
    .tlet-view-tabs {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 6px; padding: 8px 12px; border-bottom: 1px solid #2a2a27;
      background: #111110; flex-shrink: 0;
    }
    .tlet-view-tab {
      height: 28px; border: 1px solid #333330; border-radius: 5px;
      background: #1b1b19; color: #77746c; cursor: pointer;
      font: 700 11px 'Sora', sans-serif !important; text-transform: uppercase;
      letter-spacing: .5px;
    }
    .tlet-view-tab:hover { background: #252522; color: #d8d6ce; }
    .tlet-view-tab.active { background: #2a2a27; color: #f0efe8; border-color: #555550; }

    /* ── Filters and Bulk Actions ── */
    .tlet-filter-bar {
      display: grid; grid-template-columns: 1fr 92px; gap: 6px;
      padding: 8px 12px; border-bottom: 1px solid #2a2a27;
      background: #111110; flex-shrink: 0;
    }
    .tlet-bulk-bar {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
      padding: 0 12px 8px; border-bottom: 1px solid #2a2a27;
      background: #111110; flex-shrink: 0;
    }
    .tlet-btn.danger { background: #321616; color: #f0a0a0; }
    .tlet-btn.success { background: #16321f; color: #5ec47a; }
    .tlet-btn.blue { background: #162535; color: #90c0f0; }

    /* ── Due Banner ── */
    .tlet-due {
      padding: 5px 12px; border-bottom: 1px solid #2a2a27;
      font-size: 12px; font-weight: 600; color: #666460; flex-shrink: 0;
    }
    .tlet-due-amount { color: #e8a020; font-weight: 700; font-family: 'JetBrains Mono', monospace !important; }

    /* ── Status ── */
    .tlet-status {
      padding: 4px 12px; font-size: 11px; color: #555550;
      border-bottom: 1px solid #2a2a27; flex-shrink: 0; min-height: 20px;
      display: flex; align-items: center;
    }

    /* ── Scrollable Body ── */
    .tlet-body { overflow-y: auto; flex: 1; }
    .tlet-body::-webkit-scrollbar { width: 4px; }
    .tlet-body::-webkit-scrollbar-track { background: #111110; }
    .tlet-body::-webkit-scrollbar-thumb { background: #333330; border-radius: 2px; }

    /* ── Date Sections ── */
    .tlet-date-section {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px 6px; background: #111110; border-bottom: 1px solid #242421;
      color: #8d8980; font-size: 10px; font-weight: 700; letter-spacing: .7px;
      text-transform: uppercase; position: sticky; top: 0; z-index: 1;
    }
    .tlet-date-total {
      color: #c8c5b8; font: 700 11px 'JetBrains Mono', monospace !important;
      letter-spacing: 0; text-transform: none;
    }

    /* ── Contract Row ── */
    .tlet-contract { border-bottom: 1px solid #252523; }
    .tlet-contract:last-child { border-bottom: 0; }
    .tlet-contract:nth-child(odd) .tlet-contract-head { background: #222220; }
    .tlet-contract:nth-child(even) .tlet-contract-head { background: #262624; }

    .tlet-contract-head {
      display: grid; grid-template-columns: 1fr auto auto auto 16px;
      align-items: center; gap: 8px; padding: 9px 12px;
      cursor: pointer; transition: background .1s;
    }
    .tlet-contract-head:hover { background: #2d2d2b !important; }

    .tlet-target-name {
      font-size: 13px; font-weight: 700; color: #f0efe8;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .tlet-target-name a { color: inherit; text-decoration: none; }
    .tlet-target-name a:hover { color: #a8b8ff; }
    .tlet-target-meta {
      font-size: 11px; color: #666460; font-weight: 600; margin-top: 1px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    /* Pills */
    .tlet-pills { display: flex; gap: 3px; align-items: center; }
    .tlet-pill {
      border-radius: 3px; padding: 2px 5px; font-size: 10px; font-weight: 700;
      font-family: 'JetBrains Mono', monospace !important; letter-spacing: .3px;
    }
    .tlet-pill-loss { background: #3a1616; color: #f0a0a0; }
    .tlet-pill-esc  { background: #162535; color: #90c0f0; }

    /* Badge */
    .tlet-badge {
      border-radius: 3px; padding: 2px 6px; font-size: 10px;
      font-weight: 700; letter-spacing: .3px; text-transform: uppercase;
    }
    .tlet-badge-paid   { background: #0f2a1a; color: #5ec47a; }
    .tlet-badge-unpaid { background: #2a1e04; color: #e8a020; }

    .tlet-row-amount {
      font: 700 13px 'JetBrains Mono', monospace !important;
      color: #f0efe8; white-space: nowrap;
    }
    .tlet-chevron { color: #444440; font-size: 10px; transition: transform .15s; }
    .tlet-chevron.open { transform: rotate(180deg); color: #888680; }

    /* ── Expanded Body ── */
    .tlet-contract-body {
      display: none; flex-direction: column; gap: 8px;
      padding: 8px 12px 10px; border-top: 1px solid #2a2a27; background: #111110;
    }
    .tlet-contract-body.open { display: flex; }

    .tlet-body-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px; align-items: end; }
    .tlet-rate-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }

    .tlet-mini-input {
      width: 100%; height: 28px; border: 1px solid #2e2e2b; border-radius: 4px;
      background: #1a1a18; color: #e8e6de; padding: 0 7px;
      font: 600 12px 'JetBrains Mono', monospace !important;
    }
    .tlet-mini-input:focus { outline: none; border-color: #555550; }
    .tlet-source-select { font-family: 'Sora', sans-serif !important; text-transform: uppercase; }

    .tlet-formula { font: 600 11px 'JetBrains Mono', monospace !important; color: #666460; padding: 3px 0; }
    .tlet-formula-total { color: #e8e6de; }

    .tlet-mark-btn {
      height: 28px; padding: 0 11px; border-radius: 4px; border: 0; cursor: pointer;
      font: 700 11px 'Sora', sans-serif !important; letter-spacing: .3px;
      text-transform: uppercase; transition: opacity .12s; white-space: nowrap;
    }
    .tlet-mark-btn:hover { opacity: .8; }
    .tlet-mark-btn.mark-paid   { background: #1a3d28; color: #5ec47a; }
    .tlet-mark-btn.mark-unpaid { background: #2a1e04; color: #e8a020; }
    .tlet-mark-btn.mark-remove { background: #3a1616; color: #f0a0a0; }
    .tlet-mark-btn.mark-restore { background: #162535; color: #90c0f0; }

    /* ── Attack Log ── */
    .tlet-log { border-top: 1px solid #222220; padding-top: 6px; display: flex; flex-direction: column; gap: 2px; }
    .tlet-log-row {
      display: grid; grid-template-columns: 64px 1fr auto; gap: 6px;
      align-items: center; padding: 3px 0; font-size: 11px; color: #666460; font-weight: 600;
    }
    .tlet-log-time { font-family: 'JetBrains Mono', monospace !important; font-size: 11px; color: #555550; }
    .tlet-log-desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tlet-log-amt  { font-family: 'JetBrains Mono', monospace !important; color: #aaa8a0; font-weight: 700; white-space: nowrap; }

    /* Source tag */
    .tlet-source-tag {
      display: inline-block; border-radius: 3px; padding: 1px 5px;
      background: #2a2010; color: #c8901a; font-size: 10px; font-weight: 700;
      margin-right: 5px; vertical-align: 1px;
    }

    .tlet-empty { padding: 32px 16px; text-align: center; color: #444440; font-size: 13px; font-weight: 600; }

    /* ── Settings divider ── */
    .tlet-settings-sep {
      height: 1px; background: #1e1e1c; margin: 0 12px;
    }

    @media (prefers-reduced-motion: reduce) {
      #tlet-panel, #tlet-toggle { transition: none; }
    }

    @media (max-width: 600px) {
      #tlet-panel { width: calc(100vw - 28px); }
      #tlet-toggle.tlet-attached { right: calc(100vw - 28px); }
      .tlet-config { grid-template-columns: 1fr 1fr; }
      .tlet-summary { grid-template-columns: 1fr 1fr; }
      .tlet-body-row { grid-template-columns: 1fr; }
    }
  `);

  buildShell();

  /* ─── UI SHELL ─── */

  function buildShell() {
    const toggle = document.createElement("button");
    toggle.id = "tlet-toggle";
    toggle.type = "button";
    toggle.textContent = "PAY";
    toggle.title = "Open LE tracker";
    toggle.addEventListener("click", togglePanel);

    const panel = document.createElement("section");
    panel.id = "tlet-panel";
    panel.innerHTML = `
      <div class="tlet-head">
        <div class="tlet-title">LE Tracker</div>
        <div class="tlet-head-actions">
          <button class="tlet-btn" id="tlet-refresh" type="button">↻ Refresh</button>
          <button class="tlet-icon-btn" id="tlet-settings-btn" type="button" title="Settings">⚙</button>
          <button class="tlet-icon-btn" id="tlet-close" type="button" title="Close">✕</button>
        </div>
      </div>

      <!-- Settings drawer (hidden by default) -->
      <div class="tlet-settings" id="tlet-settings-drawer">
        <div class="tlet-settings-inner">
          <div class="tlet-settings-title">Settings</div>
          <div class="tlet-key-row">
            <div class="tlet-field">
              <label>API Key</label>
              <input id="tlet-key" class="tlet-input" type="password" autocomplete="off" placeholder="Paste Limited Access key" />
            </div>
            <button class="tlet-btn" id="tlet-save-key" type="button" style="align-self:end">Save</button>
          </div>
          <div id="tlet-key-status" class="tlet-key-status">
            <span class="tlet-key-dot" id="tlet-key-dot"></span>
            <span class="tlet-key-text" id="tlet-key-text">No key saved</span>
          </div>
          <div class="tlet-settings-sep"></div>
          <div class="tlet-settings-title">Sources</div>
          <div class="tlet-source-manage-row">
            <select id="tlet-source-manage" class="tlet-input tlet-source-select"></select>
            <div class="tlet-source-manage-actions">
              <button class="tlet-btn" id="tlet-rename-source" type="button">Rename</button>
              <button class="tlet-btn danger" id="tlet-delete-source" type="button">Delete</button>
            </div>
          </div>
          <div class="tlet-settings-sep"></div>
          <div class="tlet-settings-title">Backup</div>
          <div class="tlet-backup-row">
            <button class="tlet-btn" id="tlet-export-backup" type="button">Export JSON</button>
            <button class="tlet-btn" id="tlet-import-backup" type="button">Import JSON</button>
          </div>
          <input id="tlet-import-file" type="file" accept="application/json,.json" style="display:none" />
        </div>
      </div>

      <!-- Config: rows + rates + refresh -->
      <div class="tlet-config">
        <div class="tlet-field">
          <label>Rows</label>
          <input id="tlet-row-limit" class="tlet-input" type="number" min="1" max="1000" step="25" />
        </div>
        <div class="tlet-field">
          <label>Loss $</label>
          <input id="tlet-rate" class="tlet-input" type="number" min="0" step="50000" />
        </div>
        <div class="tlet-field">
          <label>Escape $</label>
          <input id="tlet-escape-rate" class="tlet-input" type="number" min="0" step="50000" />
        </div>
        <button class="tlet-icon-btn" id="tlet-load" type="button" title="Refresh latest rows" style="align-self:end">?</button>
      </div>

      <!-- Summary -->
      <div class="tlet-summary">
        <div class="tlet-stat">
          <div class="tlet-stat-label">Billable</div>
          <div class="tlet-stat-value" id="tlet-loss-count">0</div>
        </div>
        <div class="tlet-stat">
          <div class="tlet-stat-label">Expected</div>
          <div class="tlet-stat-value" id="tlet-expected">$0</div>
        </div>
        <div class="tlet-stat">
          <div class="tlet-stat-label">Paid</div>
          <div class="tlet-stat-value" id="tlet-paid-stat">$0</div>
        </div>
        <div class="tlet-stat">
          <div class="tlet-stat-label">Outstanding</div>
          <div class="tlet-stat-value" id="tlet-outstanding">$0</div>
        </div>
      </div>

      <div class="tlet-view-tabs">
        <button class="tlet-view-tab active" data-view="unpaid" type="button">Unpaid</button>
        <button class="tlet-view-tab" data-view="paid" type="button">Paid</button>
        <button class="tlet-view-tab" data-view="removed" type="button">Removed</button>
      </div>

      <div class="tlet-filter-bar">
        <input id="tlet-search" class="tlet-input" type="search" placeholder="Search name or ID" />
        <select id="tlet-source-filter" class="tlet-input tlet-source-select"></select>
      </div>
      <div class="tlet-bulk-bar">
        <button class="tlet-btn success" id="tlet-bulk-paid" type="button">Mark Paid</button>
        <button class="tlet-btn danger" id="tlet-bulk-remove" type="button">Remove</button>
        <button class="tlet-btn blue" id="tlet-bulk-restore" type="button">Restore</button>
      </div>

      <div class="tlet-due" id="tlet-due" style="display:none"></div>
      <div class="tlet-status" id="tlet-status"></div>
      <div class="tlet-body" id="tlet-table-wrap"></div>
    `;

    document.body.append(toggle, panel);

    // Wire inputs
    const keyInput = document.getElementById("tlet-key");
    const rateInput = document.getElementById("tlet-rate");
    const escRateInput = document.getElementById("tlet-escape-rate");
    const rowLimitInput = document.getElementById("tlet-row-limit");

    keyInput.value = state.apiKey || "";
    rateInput.value = String(state.defaultRate || DEFAULT_RATE);
    escRateInput.value = String(state.defaultEscapeRate || DEFAULT_ESCAPE_RATE);
    rowLimitInput.value = String(rowLimit());

    updateKeyStatus();

    document.getElementById("tlet-save-key").addEventListener("click", () => {
      state.apiKey = keyInput.value.trim();
      saveState();
      updateKeyStatus();
      setStatus(state.apiKey ? "API key saved." : "Key cleared.");
    });
    document
      .getElementById("tlet-export-backup")
      .addEventListener("click", exportBackup);
    document.getElementById("tlet-import-backup").addEventListener("click", () => {
      document.getElementById("tlet-import-file").click();
    });
    document
      .getElementById("tlet-import-file")
      .addEventListener("change", importBackup);
    document
      .getElementById("tlet-rename-source")
      .addEventListener("click", renameSelectedSource);
    document
      .getElementById("tlet-delete-source")
      .addEventListener("click", deleteSelectedSource);
    document.getElementById("tlet-search").addEventListener("input", (e) => {
      searchTerm = String(e.target.value || "").trim().toLowerCase();
      expandedGroups.clear();
      queueSearchRender();
    });
    document
      .getElementById("tlet-source-filter")
      .addEventListener("change", (e) => {
        sourceFilter = String(e.target.value || "");
        expandedGroups.clear();
        render();
      });
    document
      .getElementById("tlet-bulk-paid")
      .addEventListener("click", markVisiblePaid);
    document
      .getElementById("tlet-bulk-remove")
      .addEventListener("click", removeVisibleGroups);
    document
      .getElementById("tlet-bulk-restore")
      .addEventListener("click", restoreVisibleGroups);
    document
      .getElementById("tlet-table-wrap")
      .addEventListener("click", handleTableClick);
    document
      .getElementById("tlet-table-wrap")
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
    rowLimitInput.addEventListener("change", () => {
      state.rowLimit = clampRowLimit(rowLimitInput.value);
      rowLimitInput.value = String(state.rowLimit);
      saveState();
      setStatus("Row limit set to " + state.rowLimit + ".");
    });
    document
      .getElementById("tlet-refresh")
      .addEventListener("click", refreshLosses);
    document
      .getElementById("tlet-load")
      .addEventListener("click", refreshLosses);
    document
      .getElementById("tlet-close")
      .addEventListener("click", togglePanel);
    document
      .getElementById("tlet-settings-btn")
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
    const dot = document.getElementById("tlet-key-dot");
    const text = document.getElementById("tlet-key-text");
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
      .getElementById("tlet-settings-drawer")
      .classList.toggle("open", settingsOpen);
    document
      .getElementById("tlet-settings-btn")
      .classList.toggle("active", settingsOpen);
    if (settingsOpen) document.getElementById("tlet-key").focus();
  }

  function togglePanel() {
    isOpen = !isOpen;
    document.getElementById("tlet-panel").classList.toggle("tlet-open", isOpen);
    document
      .getElementById("tlet-toggle")
      .classList.toggle("tlet-attached", isOpen);
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
        setStatus("Backup imported. Press refresh to load the latest rows.");
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
    const keyInput = document.getElementById("tlet-key");
    const rateInput = document.getElementById("tlet-rate");
    const escRateInput = document.getElementById("tlet-escape-rate");
    const rowLimitInput = document.getElementById("tlet-row-limit");
    const searchInput = document.getElementById("tlet-search");
    const sourceFilterInput = document.getElementById("tlet-source-filter");
    if (keyInput) keyInput.value = state.apiKey || "";
    if (rateInput) rateInput.value = String(state.defaultRate || DEFAULT_RATE);
    if (escRateInput)
      escRateInput.value = String(
        state.defaultEscapeRate || DEFAULT_ESCAPE_RATE,
      );
    if (rowLimitInput) rowLimitInput.value = String(rowLimit());
    if (searchInput) searchInput.value = searchTerm;
    if (sourceFilterInput) sourceFilterInput.value = sourceFilter;
  }

  /* ─── DATA FETCH ─── */

  async function refreshLosses() {
    const key =
      state.apiKey || document.getElementById("tlet-key").value.trim();
    if (!key) {
      setStatus("No API key ? open ? Settings to add one.");
      if (!settingsOpen) toggleSettings();
      return;
    }

    setStatus("Refreshing latest rows?");
    try {
      state.rowLimit = rowLimit();
      saveState();

      const limit = rowLimit();
      const [outgoingData, legacyData] = await Promise.all([
        fetchLatestOutgoingAttacks(key, limit),
        fetchLegacyAttacks(key),
      ]);

      const attacks = mergeAttackDetails(
        tagDirection(outgoingData.attacks, "outgoing"),
        tagDirection(legacyData.attacks, "outgoing"),
      )
        .sort((a, b) => attackTimestamp(b) - attackTimestamp(a))
        .slice(0, limit);

      const fetchedRows = dedupeAttacks(attacks)
        .map((attack) => normalizeAttack(attack, attack.__tletDirection))
        .filter(isBillableAction)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);

      lossRows = dedupeRows(fetchedRows);
      await hydrateMissingNames(key, lossRows, false);
      cacheBillableRows(lossRows, false);
      saveState();
      includesEarlierUnpaid = false;
      setStatus(
        lossRows.length +
          " billable attacks loaded from " +
          attacks.length +
          " latest API rows.",
      );
      render();
    } catch (err) {
      setStatus("Error: " + err.message);
    }
  }

  async function fetchLatestOutgoingAttacks(apiKey, limit) {
    const url =
      API_BASE +
      "/user/attacksfull?filters=outgoing&sort=DESC&limit=" +
      encodeURIComponent(limit) +
      "&key=" +
      encodeURIComponent(apiKey) +
      "&comment=le-tracker";
    const data = await requestJson(url);
    if (data.error) {
      throw new Error(data.error.code + ": " + (data.error.error || "Torn API error"));
    }
    return {
      attacks: extractAttacks(data),
    };
  }

  async function fetchLegacyAttacks(apiKey) {
    const url =
      API_V1_BASE +
      "/user/?selections=attacks&key=" +
      encodeURIComponent(apiKey) +
      "&comment=LETracker";
    const data = await requestJson(url);
    if (data.error) {
      throw new Error(data.error.code + ": " + (data.error.error || "Torn API error"));
    }
    return {
      attacks: extractAttacks(data),
    };
  }

  function extractAttacks(data) {
    const attacks = data && (data.attacks || (data.data && data.data.attacks));
    if (Array.isArray(attacks)) return attacks;
    if (attacks && typeof attacks === "object") {
      return Object.entries(attacks).map(([id, attack]) => ({
        id,
        ...(attack && typeof attack === "object" ? attack : {}),
      }));
    }
    return [];
  }

  function mergeAttackDetails(primaryAttacks, secondaryAttacks) {
    const map = new Map();
    primaryAttacks.forEach((attack) => {
      const key = attackKey(attack);
      if (key) map.set(key, attack);
    });
    secondaryAttacks.forEach((attack) => {
      const key = attackKey(attack);
      if (!key || !map.has(key)) return;
      map.set(key, { ...map.get(key), ...attack });
    });
    return Array.from(map.values());
  }

  function attackKey(attack) {
    return String(
      firstValue(
        attack && attack.id,
        attack && attack.attack_id,
        attack && attack.code,
        attack && attack.timestamp_started,
        attack && attack.started,
      ) || "",
    );
  }

  function attackTimestamp(attack) {
    return Number(
      firstValue(
        attack && attack.started,
        attack && attack.start,
        attack && attack.timestamp_started,
        attack && attack.timestamp,
        attack && attack.ended,
        attack && attack.timestamp_ended,
      ) || 0,
    );
  }

  function tagDirection(attacks, direction) {
    return attacks.map((attack) => ({
      ...attack,
      __tletDirection: direction,
    }));
  }

  function dedupeAttacks(attacks) {
    const seen = new Set();
    return attacks.filter((attack) => {
      const key = String(
        attack.id ||
          attack.attack_id ||
          attack.code ||
          `${attack.started || attack.timestamp}:${attack.result}:${attack.__tletDirection}`,
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
    const tableWrap = document.getElementById("tlet-table-wrap");
    if (!tableWrap) return;

    updateViewTabs();
    updateSourceControls();

    const groups = visibleGroups();
    const visibleRows = groups.flatMap((g) => g.rows);
    const expectedTotal = visibleRows.reduce((s, r) => s + r.expected, 0);
    const paidTotal = groups.reduce((s, g) => s + g.paid, 0);
    const outstandingTotal = groups.reduce((s, g) => s + g.outstanding, 0);

    document.getElementById("tlet-loss-count").textContent = String(
      visibleRows.length,
    );
    document.getElementById("tlet-expected").textContent = money(expectedTotal);
    document.getElementById("tlet-paid-stat").textContent = money(paidTotal);
    document.getElementById("tlet-outstanding").textContent =
      money(outstandingTotal);

    const dueEl = document.getElementById("tlet-due");
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
    const panel = document.getElementById("tlet-panel");
    if (!panel) return;
    panel.querySelectorAll("[data-view]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === activeView);
    });
  }

  function updateSourceControls() {
    const filter = document.getElementById("tlet-source-filter");
    if (filter) {
      const current = sourceFilter;
      filter.innerHTML = sourceFilterOptionsHtml(current);
      filter.value = current;
    }

    const manager = document.getElementById("tlet-source-manage");
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
      return 'Paid loaded contracts: <span class="tlet-due-amount">' +
        escapeHtml(money(paidTotal)) +
        "</span>";
    }
    if (activeView === "removed") {
      return 'Removed loaded contracts: <span class="tlet-due-amount">' +
        escapeHtml(money(expectedTotal)) +
        "</span>";
    }
    return 'Due in latest loaded rows: <span class="tlet-due-amount">' +
      escapeHtml(money(outstandingTotal)) +
      "</span>";
  }

  function emptyViewHtml() {
    if (activeView === "paid") {
      return '<div class="tlet-empty">No paid contracts for this view.</div>';
    }
    if (activeView === "removed") {
      return '<div class="tlet-empty">No removed contracts for this view.</div>';
    }
    return '<div class="tlet-empty">No unpaid losses loaded.<br>Set your API key (⚙) and press refresh.</div>';
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
      <div class="tlet-date-section">
        <span>${escapeHtml(day)} · ${count} ${count === 1 ? "record" : "records"}</span>
        <span class="tlet-date-total">${escapeHtml(money(total))}</span>
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
        ? `<span class="tlet-pill tlet-pill-loss">${group.lossCount}L</span>`
        : "",
      group.escapeCount > 0
        ? `<span class="tlet-pill tlet-pill-esc">${group.escapeCount}E</span>`
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
      <div class="tlet-contract">
        <div class="tlet-contract-head" data-expand="${gId}">
          <div style="min-width:0">
            <div class="tlet-target-name">${note ? `<span class="tlet-source-tag">${escapeHtml(note)}</span>` : ""}${targetHtml}${idBit}</div>
            <div class="tlet-target-meta">${escapeHtml(group.day)} · ${escapeHtml(compactTimeRange(group.lastTimestamp, group.firstTimestamp))}</div>
          </div>
          <div class="tlet-pills">${pillsHtml}</div>
          <div class="tlet-badge ${isRemoved ? "tlet-badge-unpaid" : isPaid ? "tlet-badge-paid" : "tlet-badge-unpaid"}">${isRemoved ? "Removed" : isPaid ? "Paid" : "Unpaid"}</div>
          <div class="tlet-row-amount">${escapeHtml(money(group.expected))}</div>
          <div class="tlet-chevron${isExpanded ? " open" : ""}">▼</div>
        </div>

        <div class="tlet-contract-body${isExpanded ? " open" : ""}">
          <div class="tlet-body-row">
            <div class="tlet-rate-pair">
              ${group.lossCount > 0 ? `<div class="tlet-field"><label>Loss $</label><input class="tlet-mini-input" data-rate="${gId}" data-kind="loss" type="number" min="0" step="50000" value="${lossRate}"></div>` : ""}
              ${group.escapeCount > 0 ? `<div class="tlet-field"><label>Escape $</label><input class="tlet-mini-input" data-rate="${gId}" data-kind="escape" type="number" min="0" step="50000" value="${escapeRate}"></div>` : ""}
            </div>
            <div class="tlet-field">
              <label>Source</label>
              ${sourceSelectHtml(gId, note)}
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
              <div class="tlet-formula">${escapeHtml(formulaParts.join(" + "))} = <span class="tlet-formula-total">${escapeHtml(money(group.expected))}</span></div>
              ${groupActionsHtml(group, isPaid, isRemoved)}
            </div>
          </div>
          <div class="tlet-log">
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
      <div class="tlet-log-row">
        <span class="tlet-log-time">${escapeHtml(formatTime(row.timestamp))}</span>
        <span class="tlet-log-desc">${escapeHtml(energy)}e → ${escapeHtml(row.defenderName)}</span>
        <span class="tlet-log-amt">${escapeHtml(money(row.expected))}</span>
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
    return `<select class="tlet-mini-input tlet-source-select" data-note="${groupId}">${options.join("")}</select>`;
  }

  function groupActionsHtml(group, isPaid, isRemoved) {
    const gId = escapeAttr(group.id);
    if (isRemoved) {
      return `<button class="tlet-mark-btn mark-restore" data-restore-group="${gId}" type="button">Restore</button>`;
    }
    return `
      <div style="display:flex;gap:5px;justify-content:flex-end;flex-wrap:wrap">
        <button class="tlet-mark-btn ${isPaid ? "mark-unpaid" : "mark-paid"}" data-paid-toggle="${gId}" data-is-paid="${isPaid}" type="button">
          ${isPaid ? "Mark Unpaid" : "Mark Paid"}
        </button>
        <button class="tlet-mark-btn mark-remove" data-remove-group="${gId}" type="button">Remove</button>
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
    const select = document.getElementById("tlet-source-manage");
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
    const select = document.getElementById("tlet-source-manage");
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
        rowLimit: DEFAULT_ROW_LIMIT,
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
        rowLimit: DEFAULT_ROW_LIMIT,
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
      rowLimit: clampRowLimit(saved.rowLimit),
      sourceCodes: Array.isArray(saved.sourceCodes)
        ? saved.sourceCodes.map(normalizeSourceCode).filter(Boolean)
        : [],
    };
  }

  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }
  function setStatus(text) {
    const el = document.getElementById("tlet-status");
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

  function rowLimit() {
    return clampRowLimit(state.rowLimit);
  }

  function clampRowLimit(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_ROW_LIMIT;
    return Math.min(1000, Math.max(1, Math.floor(n)));
  }

  function clampLookbackDays(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_LOOKBACK_DAYS;
    return Math.min(365, Math.max(0, Math.floor(n)));
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
