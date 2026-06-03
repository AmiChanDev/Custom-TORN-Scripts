// ==UserScript==
// @name         Torn Loss Log Pay Tracker
// @namespace    torn-loss-log-pay-tracker
// @version      3.2.0
// @description  Compact loss-selling log panel with local payment tracking.
// @author       AmrisG
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @connect      api.torn.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  "use strict";

  const STORE_KEY = "tlpt:v1";
  const API_BASE = "https://api.torn.com/v2";
  const API_V1_BASE = "https://api.torn.com";
  const DEFAULT_RATE = 350000;
  const DEFAULT_ESCAPE_RATE = 600000;

  const state = loadState();
  let lossRows = [];
  let isOpen = false;
  let settingsOpen = false;
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
      writing-mode: vertical-rl; text-orientation: mixed; transition: background .15s;
    }
    #tlpt-toggle:hover { background: #252522; color: #f0efe8; }
    #tlpt-toggle.tlpt-attached { right: min(420px, calc(100vw - 40px)); z-index: 1000000; }

    /* ── Panel Shell ── */
    #tlpt-panel {
      position: fixed; right: 0; top: 0; bottom: 0; z-index: 999999;
      width: min(420px, calc(100vw - 32px)); display: none; flex-direction: column;
      background: #181816; color: #e8e6de;
      box-shadow: -6px 0 32px rgba(0,0,0,.6); font: 12px/1.4 'Sora', sans-serif;
    }
    #tlpt-panel.tlpt-open { display: flex; }
    #tlpt-panel, #tlpt-panel * {
      font-family: 'Sora', sans-serif !important; text-shadow: none !important; box-sizing: border-box;
    }

    /* ── Header ── */
    .tlpt-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; border-bottom: 1px solid #2a2a27;
      background: #111110; flex-shrink: 0;
    }
    .tlpt-title { font-size: 13px; font-weight: 700; color: #f0efe8; letter-spacing: -.2px; }
    .tlpt-head-actions { display: flex; gap: 5px; align-items: center; }

    /* ── Buttons ── */
    .tlpt-btn, .tlpt-icon-btn {
      border: 1px solid #333330; border-radius: 5px; background: #222220;
      color: #d8d6ce; cursor: pointer; font: 600 11px 'Sora', sans-serif;
      transition: background .12s, color .12s, border-color .12s;
    }
    .tlpt-btn { height: 26px; padding: 0 10px; }
    .tlpt-icon-btn { width: 26px; height: 26px; font-size: 13px; display: flex; align-items: center; justify-content: center; }
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
      font-size: 9px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .8px; color: #555550; padding-bottom: 2px;
    }

    .tlpt-field label {
      display: block; margin-bottom: 3px; color: #888680;
      font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px;
    }
    .tlpt-input {
      width: 100%; height: 26px; border: 1px solid #2e2e2b; border-radius: 5px;
      background: #1a1a18; color: #e8e6de; padding: 0 7px;
      font: 600 11px 'Sora', sans-serif; transition: border-color .12s;
    }
    .tlpt-input:focus { outline: none; border-color: #555550; }
    .tlpt-input[type="password"] { font-weight: 400; letter-spacing: 2px; }
    .tlpt-input::placeholder { color: #444440; font-weight: 400; letter-spacing: 0; }

    .tlpt-key-row { display: flex; gap: 6px; align-items: end; }
    .tlpt-key-row .tlpt-field { flex: 1; }

    .tlpt-key-status {
      font-size: 10px; font-weight: 600; padding: 3px 0;
      height: 16px; display: flex; align-items: center; gap: 5px;
    }
    .tlpt-key-dot {
      width: 6px; height: 6px; border-radius: 50%; background: #444440; flex-shrink: 0;
    }
    .tlpt-key-dot.set { background: #5ec47a; }
    .tlpt-key-text { color: #666460; }

    /* ── Config Bar ── */
    .tlpt-config {
      display: grid; grid-template-columns: 1fr 90px 100px 52px;
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
    .tlpt-stat-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #555550; }
    .tlpt-stat-value {
      font: 700 12px/1.2 'JetBrains Mono', monospace !important;
      color: #e8e6de; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px;
    }
    #tlpt-outstanding { color: #e8a020; }
    #tlpt-paid-stat   { color: #5ec47a; }

    /* ── Due Banner ── */
    .tlpt-due {
      padding: 5px 12px; border-bottom: 1px solid #2a2a27;
      font-size: 11px; font-weight: 600; color: #666460; flex-shrink: 0;
    }
    .tlpt-due-amount { color: #e8a020; font-weight: 700; font-family: 'JetBrains Mono', monospace !important; }

    /* ── Status ── */
    .tlpt-status {
      padding: 3px 12px; font-size: 10px; color: #555550;
      border-bottom: 1px solid #2a2a27; flex-shrink: 0; min-height: 20px;
      display: flex; align-items: center;
    }

    /* ── Scrollable Body ── */
    .tlpt-body { overflow-y: auto; flex: 1; }
    .tlpt-body::-webkit-scrollbar { width: 4px; }
    .tlpt-body::-webkit-scrollbar-track { background: #111110; }
    .tlpt-body::-webkit-scrollbar-thumb { background: #333330; border-radius: 2px; }

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
      font-size: 12px; font-weight: 700; color: #f0efe8;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .tlpt-target-name a { color: inherit; text-decoration: none; }
    .tlpt-target-name a:hover { color: #a8b8ff; }
    .tlpt-target-meta {
      font-size: 10px; color: #666460; font-weight: 600; margin-top: 1px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    /* Pills */
    .tlpt-pills { display: flex; gap: 3px; align-items: center; }
    .tlpt-pill {
      border-radius: 3px; padding: 2px 5px; font-size: 9px; font-weight: 700;
      font-family: 'JetBrains Mono', monospace !important; letter-spacing: .3px;
    }
    .tlpt-pill-loss { background: #3a1616; color: #f0a0a0; }
    .tlpt-pill-esc  { background: #162535; color: #90c0f0; }

    /* Badge */
    .tlpt-badge {
      border-radius: 3px; padding: 2px 6px; font-size: 9px;
      font-weight: 700; letter-spacing: .3px; text-transform: uppercase;
    }
    .tlpt-badge-paid   { background: #0f2a1a; color: #5ec47a; }
    .tlpt-badge-unpaid { background: #2a1e04; color: #e8a020; }

    .tlpt-row-amount {
      font: 700 12px 'JetBrains Mono', monospace !important;
      color: #f0efe8; white-space: nowrap;
    }
    .tlpt-chevron { color: #444440; font-size: 9px; transition: transform .15s; }
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
      width: 100%; height: 26px; border: 1px solid #2e2e2b; border-radius: 4px;
      background: #1a1a18; color: #e8e6de; padding: 0 7px;
      font: 600 11px 'JetBrains Mono', monospace !important;
    }
    .tlpt-mini-input:focus { outline: none; border-color: #555550; }

    .tlpt-formula { font: 600 10px 'JetBrains Mono', monospace !important; color: #666460; padding: 3px 0; }
    .tlpt-formula-total { color: #e8e6de; }

    .tlpt-mark-btn {
      height: 26px; padding: 0 10px; border-radius: 4px; border: 0; cursor: pointer;
      font: 700 10px 'Sora', sans-serif !important; letter-spacing: .3px;
      text-transform: uppercase; transition: opacity .12s; white-space: nowrap;
    }
    .tlpt-mark-btn:hover { opacity: .8; }
    .tlpt-mark-btn.mark-paid   { background: #1a3d28; color: #5ec47a; }
    .tlpt-mark-btn.mark-unpaid { background: #2a1e04; color: #e8a020; }

    /* ── Attack Log ── */
    .tlpt-log { border-top: 1px solid #222220; padding-top: 6px; display: flex; flex-direction: column; gap: 2px; }
    .tlpt-log-row {
      display: grid; grid-template-columns: 58px 1fr auto; gap: 6px;
      align-items: center; padding: 2px 0; font-size: 10px; color: #666460; font-weight: 600;
    }
    .tlpt-log-time { font-family: 'JetBrains Mono', monospace !important; font-size: 10px; color: #555550; }
    .tlpt-log-desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tlpt-log-amt  { font-family: 'JetBrains Mono', monospace !important; color: #aaa8a0; font-weight: 700; white-space: nowrap; }

    /* Source tag */
    .tlpt-source-tag {
      display: inline-block; border-radius: 3px; padding: 1px 5px;
      background: #2a2010; color: #c8901a; font-size: 9px; font-weight: 700;
      margin-right: 5px; vertical-align: 1px;
    }

    .tlpt-empty { padding: 32px 16px; text-align: center; color: #444440; font-size: 12px; font-weight: 600; }

    /* ── Settings divider ── */
    .tlpt-settings-sep {
      height: 1px; background: #1e1e1c; margin: 0 12px;
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
    toggle.title = "Open loss pay tracker";
    toggle.addEventListener("click", togglePanel);

    const panel = document.createElement("section");
    panel.id = "tlpt-panel";
    panel.innerHTML = `
      <div class="tlpt-head">
        <div class="tlpt-title">Loss / Escape Tracker</div>
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

    keyInput.value = state.apiKey || "";
    rateInput.value = String(state.defaultRate || DEFAULT_RATE);
    escRateInput.value = String(state.defaultEscapeRate || DEFAULT_ESCAPE_RATE);
    dateInput.value = state.selectedDate || todayInputValue();

    updateKeyStatus();

    document.getElementById("tlpt-save-key").addEventListener("click", () => {
      state.apiKey = keyInput.value.trim();
      saveState();
      updateKeyStatus();
      setStatus(state.apiKey ? "API key saved." : "Key cleared.");
    });

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
      const [outgoingData, incomingData] = await Promise.all([
        fetchAttacksForDirection(key, range, "outgoing"),
        fetchAttacksForDirection(key, range, "incoming"),
      ]);

      const attacks = [
        ...tagDirection(outgoingData.attacks, "outgoing"),
        ...tagDirection(incomingData.attacks, "incoming"),
      ];

      lossRows = dedupeAttacks(attacks)
        .map((attack) => normalizeAttack(attack, attack.__tlptDirection))
        .filter((r) => r.timestamp >= range.from && r.timestamp < range.to)
        .filter(isBillableAction);

      await hydrateMissingNames(key, lossRows);
      setStatus(
        `${lossRows.length} billable attacks from ${attacks.length} total.`,
      );
      render();
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  }

  /* ─── NORMALIZE ─── */

  async function fetchAttacksForDirection(apiKey, range, direction) {
    const url = `${API_BASE}/user/attacksfull?filters=${direction}&sort=DESC&limit=1000&from=${range.from}&to=${range.to}&key=${encodeURIComponent(apiKey)}&comment=loss-pay-tracker`;
    const data = await requestJson(url);
    if (data.error) {
      throw new Error(`${data.error.code}: ${data.error.error || "Torn API error"}`);
    }
    return {
      attacks: Array.isArray(data.attacks) ? data.attacks : [],
    };
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

  function defaultExpectedFor(row) {
    return row && row.kind === "escape"
      ? Number(state.defaultEscapeRate) || DEFAULT_ESCAPE_RATE
      : Number(state.defaultRate) || DEFAULT_RATE;
  }

  /* ─── RENDER ─── */

  function render() {
    const tableWrap = document.getElementById("tlpt-table-wrap");
    if (!tableWrap) return;

    const rows = lossRows.map((row) => {
      const rec = getPayRecord(row.id, row);
      const expected =
        rec.expected == null ? defaultExpectedFor(row) : Number(rec.expected);
      const paid = Number(rec.paid || 0);
      return {
        ...row,
        expected,
        paid,
        outstanding: Math.max(0, expected - paid),
      };
    });

    const groups = buildGroups(rows);
    const expectedTotal = rows.reduce((s, r) => s + r.expected, 0);
    const paidTotal = groups.reduce((s, g) => s + g.paid, 0);
    const outstandingTotal = groups.reduce((s, g) => s + g.outstanding, 0);

    document.getElementById("tlpt-loss-count").textContent = String(
      rows.length,
    );
    document.getElementById("tlpt-expected").textContent = money(expectedTotal);
    document.getElementById("tlpt-paid-stat").textContent = money(paidTotal);
    document.getElementById("tlpt-outstanding").textContent =
      money(outstandingTotal);

    const dueEl = document.getElementById("tlpt-due");
    if (rows.length > 0) {
      dueEl.style.display = "";
      dueEl.innerHTML = `Due ${escapeHtml(state.selectedDate || todayInputValue())}: <span class="tlpt-due-amount">${escapeHtml(money(outstandingTotal))}</span>`;
    } else {
      dueEl.style.display = "none";
    }

    if (rows.length === 0) {
      tableWrap.innerHTML =
        '<div class="tlpt-empty">No losses loaded.<br>Set your API key (⚙) and press Load.</div>';
      return;
    }

    tableWrap.innerHTML = groups.map(groupHtml).join("");

    tableWrap.querySelectorAll("[data-expand]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.dataset.expand;
        expandedGroups.has(id)
          ? expandedGroups.delete(id)
          : expandedGroups.add(id);
        render();
      });
    });

    tableWrap.querySelectorAll("[data-paid-toggle]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        updateGroupPaidToggle(
          btn.dataset.paidToggle,
          btn.dataset.isPaid !== "true",
        );
      });
    });

    tableWrap.querySelectorAll("[data-rate]").forEach((input) => {
      input.addEventListener("change", (e) => {
        e.stopPropagation();
        updateGroupRate(input.dataset.rate, input.dataset.kind, input.value);
      });
    });

    tableWrap.querySelectorAll("[data-note]").forEach((input) => {
      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("change", (e) => {
        e.stopPropagation();
        updateGroupNote(input.dataset.note, input.value);
      });
    });
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
      g.firstTimestamp = Math.max(g.firstTimestamp, row.timestamp);
      g.lastTimestamp = Math.min(g.lastTimestamp, row.timestamp);
      if (
        g.defenderName.startsWith("Player ") &&
        !row.defenderName.startsWith("Player ")
      )
        g.defenderName = row.defenderName;
    });

    return Array.from(map.values()).map((g) => ({
      ...g,
      outstanding: Math.max(0, g.expected - g.paid),
    }));
  }

  /* ─── GROUP HTML ─── */

  function groupHtml(group) {
    const isExpanded = expandedGroups.has(group.id);
    const gId = escapeAttr(group.id);
    const isPaid = group.outstanding <= 0;
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
      ? ` <span style="color:#555550;font-size:10px;font-weight:400">[${escapeHtml(group.defenderId)}]</span>`
      : "";

    return `
      <div class="tlpt-contract">
        <div class="tlpt-contract-head" data-expand="${gId}">
          <div style="min-width:0">
            <div class="tlpt-target-name">${note ? `<span class="tlpt-source-tag">${escapeHtml(note)}</span>` : ""}${targetHtml}${idBit}</div>
            <div class="tlpt-target-meta">${escapeHtml(group.day)} · ${escapeHtml(compactTimeRange(group.lastTimestamp, group.firstTimestamp))}</div>
          </div>
          <div class="tlpt-pills">${pillsHtml}</div>
          <div class="tlpt-badge ${isPaid ? "tlpt-badge-paid" : "tlpt-badge-unpaid"}">${isPaid ? "Paid" : "Unpaid"}</div>
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
              <input class="tlpt-mini-input" data-note="${gId}" type="text" maxlength="40" placeholder="e.g. Discord" value="${escapeAttr(note)}" style="font-family:'Sora',sans-serif!important">
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
              <div class="tlpt-formula">${escapeHtml(formulaParts.join(" + "))} = <span class="tlpt-formula-total">${escapeHtml(money(group.expected))}</span></div>
              <button class="tlpt-mark-btn ${isPaid ? "mark-unpaid" : "mark-paid"}" data-paid-toggle="${gId}" data-is-paid="${isPaid}" type="button">
                ${isPaid ? "Mark Unpaid" : "Mark Paid"}
              </button>
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
    return (state.groupNotes || {})[groupId] || "";
  }

  function updateGroupNote(groupId, value) {
    state.groupNotes = state.groupNotes || {};
    const note = String(value || "").trim();
    if (note) state.groupNotes[groupId] = note;
    else delete state.groupNotes[groupId];
    saveState();
    render();
  }

  function updateGroupPaidToggle(groupId, isPaid) {
    const group = buildGroups(
      lossRows.map((row) => {
        const rec = getPayRecord(row.id, row);
        return {
          ...row,
          expected:
            rec.expected == null
              ? defaultExpectedFor(row)
              : Number(rec.expected),
          paid: Number(rec.paid || 0),
        };
      }),
    ).find((g) => g.id === groupId);
    if (!group) return;
    distributeGroupMoney(group.rows, "paid", isPaid ? group.expected : 0);
    saveState();
    render();
  }

  function updateGroupRate(groupId, kind, value) {
    const allRows = lossRows.map((row) => {
      const rec = getPayRecord(row.id, row);
      return {
        ...row,
        expected:
          rec.expected == null ? defaultExpectedFor(row) : Number(rec.expected),
        paid: Number(rec.paid || 0),
      };
    });
    const group = buildGroups(allRows).find((g) => g.id === groupId);
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
    distributeGroupMoney(targets, "expected", rate * targets.length);
    distributeGroupMoney(
      group.rows,
      "paid",
      wasPaid ? rate * targets.length + othersExpected : 0,
    );
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

  async function hydrateMissingNames(apiKey, rows) {
    const missing = Array.from(
      new Set(
        rows
          .filter(
            (r) =>
              r.defenderId &&
              (!r.defenderName ||
                r.defenderName === `Player ${r.defenderId}` ||
                r.defenderName === "Unknown"),
          )
          .map((r) => String(r.defenderId)),
      ),
    );
    if (!missing.length) return;
    state.nameCache = state.nameCache || {};

    for (const id of missing) {
      if (!state.nameCache[id]) {
        try {
          const data = await requestJson(
            `${API_BASE}/user/${encodeURIComponent(id)}/basic?key=${encodeURIComponent(apiKey)}&comment=loss-pay-tracker`,
          );
          const name = extractProfileName(data);
          if (!data.error && name) state.nameCache[id] = name;
        } catch (_) {}
      }
      if (!state.nameCache[id]) {
        try {
          const data = await requestJson(
            `${API_V1_BASE}/user/${encodeURIComponent(id)}?selections=basic&key=${encodeURIComponent(apiKey)}`,
          );
          const name = extractProfileName(data);
          if (!data.error && name) state.nameCache[id] = name;
        } catch (_) {}
      }
    }
    rows.forEach((row) => {
      const n = state.nameCache[String(row.defenderId)];
      if (n) row.defenderName = n;
    });
    saveState();
  }

  /* ─── UTILS ─── */

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
      return {
        apiKey: "",
        defaultRate: DEFAULT_RATE,
        defaultEscapeRate: DEFAULT_ESCAPE_RATE,
        selectedDate: todayInputValue(),
        payments: {},
        nameCache: {},
        groupNotes: {},
        ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}"),
      };
    } catch (_) {
      return {
        apiKey: "",
        defaultRate: DEFAULT_RATE,
        defaultEscapeRate: DEFAULT_ESCAPE_RATE,
        selectedDate: todayInputValue(),
        payments: {},
        nameCache: {},
        groupNotes: {},
      };
    }
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
