// ==UserScript==
// @name         Torn Loss Log Pay Tracker
// @namespace    torn-loss-log-pay-tracker
// @version      2.3.1
// @description  Toggleable loss-selling log panel with local payment tracking.
// @author       AmrisG
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @connect      api.torn.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  const STORE_KEY = 'tlpt:v1';
  const API_BASE = 'https://api.torn.com/v2';
  const API_V1_BASE = 'https://api.torn.com';
  const DEFAULT_RATE = 350000;
  const DEFAULT_ESCAPE_RATE = 600000;

  const state = loadState();
  let lossRows = [];
  let isOpen = false;
  const expandedGroups = new Set();

  GM_addStyle(`
    #tlpt-toggle {
      position: fixed;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      z-index: 999998;
      width: 30px;
      height: 86px;
      border: 0;
      border-radius: 8px 0 0 8px;
      background: #242422;
      color: #f0f0ea;
      box-shadow: -2px 0 14px rgba(0, 0, 0, .32);
      cursor: pointer;
      font: 700 10px/1.1 Arial, sans-serif;
      letter-spacing: 0;
      writing-mode: vertical-rl;
      text-orientation: mixed;
    }

    #tlpt-panel {
      position: fixed;
      right: 0;
      top: 12px;
      bottom: 12px;
      z-index: 999999;
      width: min(560px, calc(100vw - 54px));
      display: none;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #44443f;
      border-right: 0;
      border-radius: 10px 0 0 10px;
      background: #2d2d2a;
      color: #f1f1eb;
      box-shadow: 0 18px 42px rgba(0, 0, 0, .45);
      font: 12px/1.25 Arial, sans-serif;
    }

    #tlpt-panel.tlpt-open {
      display: flex;
    }

    #tlpt-toggle.tlpt-attached {
      right: min(560px, calc(100vw - 54px));
      z-index: 1000000;
    }

    .tlpt-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px 10px;
      border-bottom: 1px solid #44443f;
      background: #242421;
    }

    .tlpt-title {
      font-size: 15px;
      font-weight: 700;
    }

    .tlpt-subtitle {
      margin-top: 2px;
      color: #bbb9b0;
      font-size: 12px;
      font-weight: 700;
    }

    .tlpt-icon-btn,
    .tlpt-btn {
      border: 1px solid #5a5a53;
      border-radius: 9px;
      background: #2b2b28;
      color: #f4f4ed;
      cursor: pointer;
      font: 700 12px Arial, sans-serif;
    }

    .tlpt-icon-btn {
      width: 30px;
      height: 30px;
    }

    .tlpt-btn {
      height: 32px;
      padding: 0 11px;
    }

    .tlpt-btn:hover,
    .tlpt-icon-btn:hover,
    #tlpt-toggle:hover {
      background: #373733;
    }

    .tlpt-body {
      overflow: auto;
      padding: 0;
    }

    .tlpt-grid {
      display: grid;
      grid-template-columns: minmax(150px, 1fr) 78px 82px 112px auto;
      gap: 6px;
      align-items: end;
      padding: 9px 14px 10px;
      border-bottom: 1px solid #44443f;
      background: #2d2d2a;
    }

    .tlpt-field label {
      display: block;
      margin-bottom: 5px;
      color: #b9b7ae;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .tlpt-field {
      min-width: 0;
    }

    .tlpt-input {
      width: 100%;
      box-sizing: border-box;
      height: 34px;
      border: 1px solid #55554f;
      border-radius: 7px;
      background: #2a2a27;
      color: #f2f2eb;
      padding: 0 8px;
      font: 700 13px Arial, sans-serif;
    }

    .tlpt-input[type="password"] {
      font-weight: 400;
    }

    .tlpt-input::placeholder {
      color: #8d8b84;
      font-weight: 400;
    }

    .tlpt-summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      border-bottom: 1px solid #44443f;
    }

    .tlpt-stat {
      border-right: 1px solid #44443f;
      padding: 9px 14px 8px;
      background: #30302d;
      min-width: 0;
    }

    .tlpt-stat:last-child {
      border-right: 0;
    }

    .tlpt-stat-label {
      color: #bbb9b0;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .tlpt-stat-value {
      margin-top: 4px;
      font-size: 16px;
      font-weight: 800;
      color: #f4f4ee;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #tlpt-outstanding {
      color: #d7a31f;
    }

    .tlpt-status {
      color: #d4d1c6;
      min-height: 30px;
      display: flex;
      align-items: center;
      padding: 0 14px;
      border-bottom: 1px solid #44443f;
      font-weight: 700;
    }

    .tlpt-status-money {
      color: #7fd89d;
      font-weight: 900;
    }

    .tlpt-table-wrap {
      display: grid;
      gap: 0;
    }

    .tlpt-contract {
      border-bottom: 1px solid #44443f;
      background: #30302d;
      overflow: hidden;
    }

    .tlpt-contract:last-child {
      border-bottom: 0;
    }

    .tlpt-contract-head {
      display: grid;
      grid-template-columns: minmax(150px, 1fr) auto auto auto 14px;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: #30302d;
      cursor: pointer;
    }

    .tlpt-target {
      color: #f5f5ee;
      font-size: 14px;
      font-weight: 800;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tlpt-target a {
      color: #f5f5ee;
      text-decoration: none;
    }

    .tlpt-pill {
      border: 0;
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }

    .tlpt-pill-loss {
      color: #ffd1d1;
      background: #7d2424;
    }

    .tlpt-pill-escape {
      color: #b9d6ff;
      background: #24517d;
    }

    .tlpt-pill-stack {
      display: inline-flex;
      gap: 5px;
      align-items: center;
      white-space: nowrap;
    }

    .tlpt-contract-body {
      display: none;
      grid-template-columns: minmax(170px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) auto;
      gap: 10px;
      padding: 10px 14px 12px;
      border-top: 1px solid #44443f;
      background: #272724;
      align-items: end;
    }

    .tlpt-contract-body.tlpt-open {
      display: grid;
    }

    .tlpt-rate-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      min-width: 0;
    }

    .tlpt-contract-total {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #bbb9b0;
      font-weight: 700;
      padding-bottom: 6px;
    }

    .tlpt-total-value {
      color: #f2f2ec;
      font-size: 13px;
      font-weight: 800;
    }

    .tlpt-money-input {
      width: 100%;
      height: 32px;
      border: 1px solid #55554f;
      border-radius: 7px;
      background: #2d2d2a;
      color: #f2f2eb;
      padding: 0 10px;
      font: 700 12px Arial, sans-serif;
    }

    .tlpt-note-input {
      width: 100%;
      height: 32px;
      border: 1px solid #55554f;
      border-radius: 7px;
      background: #2d2d2a;
      color: #f2f2eb;
      padding: 0 10px;
      font: 700 12px Arial, sans-serif;
      box-sizing: border-box;
    }

    .tlpt-service-tag {
      display: inline-block;
      max-width: 120px;
      margin-right: 6px;
      border-radius: 999px;
      padding: 2px 7px;
      background: #4a4130;
      color: #ffd68a;
      font-size: 11px;
      font-weight: 800;
      vertical-align: 1px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tlpt-toggle-paid {
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      height: 32px;
      border: 1px solid #5a4612;
      border-radius: 999px;
      padding: 0 10px;
      background: #4b3a08;
      color: #e0b836;
      cursor: pointer;
      font-weight: 800;
      user-select: none;
    }

    .tlpt-toggle-paid input {
      margin: 0;
      accent-color: #6f7dff;
    }

    .tlpt-paid {
      color: #7fd89d;
      font-weight: 700;
    }

    .tlpt-unpaid {
      color: #d7a31f;
      font-weight: 700;
    }

    .tlpt-empty {
      padding: 28px 18px;
      color: #bbb9b0;
      text-align: center;
    }

    .tlpt-muted {
      color: #c8c5ba;
      font-size: 12px;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tlpt-contract-head > div:first-child {
      min-width: 0;
    }

    .tlpt-target-id {
      color: #9b9890;
      font-weight: 400;
    }

    .tlpt-status-badge {
      border-radius: 999px;
      padding: 3px 9px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }

    .tlpt-status-paid {
      background: #123d25;
      color: #7fd89d;
    }

    .tlpt-status-unpaid {
      background: #4b3a08;
      color: #d7a31f;
    }

    .tlpt-row-total {
      color: #f2f2ec;
      font-size: 14px;
      font-weight: 800;
      white-space: nowrap;
    }

    .tlpt-chevron {
      color: #bdb9ad;
      font-size: 14px;
      text-align: center;
      transform: rotate(0deg);
      transition: transform .12s ease;
    }

    .tlpt-chevron.tlpt-open {
      transform: rotate(180deg);
    }

    @media (max-width: 680px) {
      #tlpt-panel {
        right: 0;
        left: 8px;
        width: auto;
        top: 8px;
        bottom: 8px;
      }

      #tlpt-toggle {
        width: 34px;
      }

      #tlpt-toggle.tlpt-attached {
        right: calc(100vw - 8px);
      }

      .tlpt-grid,
      .tlpt-summary {
        grid-template-columns: 1fr;
      }

      .tlpt-contract-head {
        grid-template-columns: 1fr auto;
        gap: 8px;
      }

      .tlpt-status-badge,
      .tlpt-row-total,
      .tlpt-chevron {
        justify-self: end;
      }

      .tlpt-contract-body {
        grid-template-columns: 1fr;
      }
    }
  `);

  buildShell();

  function buildShell() {
    const toggle = document.createElement('button');
    toggle.id = 'tlpt-toggle';
    toggle.type = 'button';
    toggle.textContent = 'Loss Pay';
    toggle.title = 'Open loss pay tracker';
    toggle.addEventListener('click', togglePanel);

    const panel = document.createElement('section');
    panel.id = 'tlpt-panel';
    panel.innerHTML = `
      <div class="tlpt-head">
        <div>
          <div class="tlpt-title">Loss / escape contracts</div>
          <div class="tlpt-subtitle">Grouped by target and day. Set prices, add source, then mark paid.</div>
        </div>
        <div>
          <button class="tlpt-btn" id="tlpt-refresh" type="button">&#8635; Refresh</button>
          <button class="tlpt-icon-btn" id="tlpt-close" type="button" title="Close">x</button>
        </div>
      </div>
      <div class="tlpt-body">
        <div class="tlpt-grid">
          <div class="tlpt-field">
            <label for="tlpt-key">API key</label>
            <input id="tlpt-key" class="tlpt-input" type="password" autocomplete="off" placeholder="Paste a Limited Access key" />
          </div>
          <div class="tlpt-field">
            <label for="tlpt-rate">Loss pay</label>
            <input id="tlpt-rate" class="tlpt-input" type="number" min="0" step="50000" />
          </div>
          <div class="tlpt-field">
            <label for="tlpt-escape-rate">Escape pay</label>
            <input id="tlpt-escape-rate" class="tlpt-input" type="number" min="0" step="50000" />
          </div>
          <div class="tlpt-field">
            <label for="tlpt-date">Date</label>
            <input id="tlpt-date" class="tlpt-input" type="date" />
          </div>
          <button class="tlpt-btn" id="tlpt-load" type="button">Load</button>
        </div>

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
            <div class="tlpt-stat-label">Recorded Paid</div>
            <div class="tlpt-stat-value" id="tlpt-paid">$0</div>
          </div>
          <div class="tlpt-stat">
            <div class="tlpt-stat-label">Outstanding</div>
            <div class="tlpt-stat-value" id="tlpt-outstanding">$0</div>
          </div>
        </div>

        <div class="tlpt-status" id="tlpt-status"></div>
        <div class="tlpt-table-wrap" id="tlpt-table-wrap"></div>
      </div>
    `;

    document.body.append(toggle, panel);

    const keyInput = document.getElementById('tlpt-key');
    const rateInput = document.getElementById('tlpt-rate');
    const escapeRateInput = document.getElementById('tlpt-escape-rate');
    const dateInput = document.getElementById('tlpt-date');

    keyInput.value = state.apiKey || '';
    rateInput.value = String(state.defaultRate || DEFAULT_RATE);
    escapeRateInput.value = String(state.defaultEscapeRate || DEFAULT_ESCAPE_RATE);
    dateInput.value = state.selectedDate || todayInputValue();

    keyInput.addEventListener('change', () => {
      state.apiKey = keyInput.value.trim();
      saveState();
    });

    rateInput.addEventListener('change', () => {
      state.defaultRate = Math.max(0, Number(rateInput.value) || DEFAULT_RATE);
      saveState();
      render();
    });

    escapeRateInput.addEventListener('change', () => {
      state.defaultEscapeRate = Math.max(0, Number(escapeRateInput.value) || DEFAULT_ESCAPE_RATE);
      saveState();
      render();
    });

    dateInput.addEventListener('change', () => {
      state.selectedDate = dateInput.value || todayInputValue();
      dateInput.value = state.selectedDate;
      saveState();
    });

    document.getElementById('tlpt-refresh').addEventListener('click', refreshLosses);
    document.getElementById('tlpt-load').addEventListener('click', refreshLosses);
    document.getElementById('tlpt-close').addEventListener('click', togglePanel);

    render();
  }

  function togglePanel() {
    isOpen = !isOpen;
    document.getElementById('tlpt-panel').classList.toggle('tlpt-open', isOpen);
    document.getElementById('tlpt-toggle').classList.toggle('tlpt-attached', isOpen);
    if (isOpen && state.apiKey && lossRows.length === 0) {
      refreshLosses();
    }
  }

  async function refreshLosses() {
    const key = document.getElementById('tlpt-key').value.trim();
    state.apiKey = key;
    saveState();

    if (!key) {
      setStatus('Paste your Torn API key first. The key is stored only in this browser.');
      return;
    }

    setStatus('Loading outgoing losses and escapes...');

    try {
      state.selectedDate = document.getElementById('tlpt-date').value || todayInputValue();
      saveState();

      const range = selectedDateRange(state.selectedDate);
      const url = `${API_BASE}/user/attacksfull?filters=outgoing&sort=DESC&limit=1000&from=${range.from}&to=${range.to}&key=${encodeURIComponent(key)}&comment=loss-pay-tracker`;
      const data = await requestJson(url);

      if (data.error) {
        throw new Error(`${data.error.code}: ${data.error.error || 'Torn API error'}`);
      }

      const attacks = Array.isArray(data.attacks) ? data.attacks : [];
      lossRows = attacks
        .map(normalizeAttack)
        .filter((row) => row.timestamp >= range.from && row.timestamp < range.to)
        .filter(isBillableAction);
      await hydrateMissingNames(key, lossRows);
      setStatus(`Loaded ${lossRows.length} outgoing losses/escapes from ${attacks.length} attacks.`);
      render();
    } catch (error) {
      setStatus(`Could not load losses: ${error.message}`);
    }
  }

  function normalizeAttack(attack) {
    const attacker = firstObject(attack.attacker, attack.attacker_player, attack.attacker_user);
    const defender = firstObject(attack.defender, attack.defender_player, attack.defender_user, attack.target, attack.opponent);
    const result = String(attack.result || attack.outcome || attack.status || '').toLowerCase();
    const timestamp = attack.started || attack.start || attack.timestamp_started || attack.timestamp || attack.ended || attack.end || 0;
    const defenderId = firstValue(defender.id, defender.user_id, defender.player_id, attack.defender_id, attack.target_id, attack.opponent_id);
    const defenderName = firstValue(defender.name, defender.player_name, defender.username, attack.defender_name, attack.target_name, attack.opponent_name);
    const id = String(attack.id || attack.attack_id || `${timestamp}:${defenderId || defenderName || 'unknown'}`);

    return {
      id,
      timestamp: Number(timestamp) || 0,
      kind: actionKind(result),
      attackerId: firstValue(attacker.id, attacker.user_id, attacker.player_id, attack.attacker_id),
      attackerName: firstValue(attacker.name, attacker.player_name, attacker.username, attack.attacker_name) || 'You',
      defenderId,
      defenderName: defenderName || (defenderId ? `Player ${defenderId}` : 'Unknown'),
      result,
      respect: Number(attack.respect_gain || attack.respect || 0),
      raw: attack,
    };
  }

  function isLoss(row) {
    const result = row.result.replace(/[_-]/g, ' ');
    return result === 'lost' || result === 'loss' || result.includes('lost') || result.includes('defeat');
  }

  function isEscape(row) {
    const result = row.result.replace(/[_-]/g, ' ');
    return result === 'escape' || result === 'escaped' || result.includes('escape');
  }

  function isBillableAction(row) {
    return isLoss(row) || isEscape(row);
  }

  function actionKind(result) {
    const normalized = String(result || '').replace(/[_-]/g, ' ');
    if (normalized === 'escape' || normalized === 'escaped' || normalized.includes('escape')) return 'escape';
    return 'loss';
  }

  function defaultExpectedFor(row) {
    if (row && row.kind === 'escape') return Number(state.defaultEscapeRate) || DEFAULT_ESCAPE_RATE;
    return Number(state.defaultRate) || DEFAULT_RATE;
  }

  function render() {
    const tableWrap = document.getElementById('tlpt-table-wrap');
    if (!tableWrap) return;

    const rows = lossRows.map((row) => {
      const record = getPayRecord(row.id, row);
      const expected = record.expected === undefined || record.expected === null
        ? defaultExpectedFor(row)
        : Number(record.expected);
      const paid = Number(record.paid || 0);
      return { ...row, expected, paid, outstanding: Math.max(0, expected - paid) };
    });
    const groups = buildGroups(rows);

    const expectedTotal = rows.reduce((sum, row) => sum + row.expected, 0);
    const paidTotal = groups.reduce((sum, group) => sum + group.paid, 0);
    const outstandingTotal = groups.reduce((sum, group) => sum + group.outstanding, 0);

    document.getElementById('tlpt-loss-count').textContent = String(rows.length);
    document.getElementById('tlpt-expected').textContent = money(expectedTotal);
    document.getElementById('tlpt-paid').textContent = money(paidTotal);
    document.getElementById('tlpt-outstanding').textContent = money(outstandingTotal);
    setStatusHtml(`Accumulated outstanding for ${escapeHtml(state.selectedDate || todayInputValue())}: <span class="tlpt-status-money">${escapeHtml(money(outstandingTotal))}</span>`);

    if (rows.length === 0) {
      tableWrap.innerHTML = '<div class="tlpt-empty">No losses loaded yet. Add your API key and press Refresh.</div>';
      return;
    }

    tableWrap.innerHTML = `
      ${groups.map(groupHtml).join('')}
    `;

    tableWrap.querySelectorAll('[data-tlpt-paid-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        updateGroupPaidToggle(button.dataset.tlptPaidToggle, button.dataset.currentPaid !== 'true');
      });
    });

    tableWrap.querySelectorAll('[data-tlpt-rate]').forEach((input) => {
      input.addEventListener('change', (event) => {
        event.stopPropagation();
        updateGroupRate(input.dataset.tlptRate, input.dataset.tlptKind, input.value);
      });
    });

    tableWrap.querySelectorAll('[data-tlpt-note]').forEach((input) => {
      input.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      input.addEventListener('change', (event) => {
        event.stopPropagation();
        updateGroupNote(input.dataset.tlptNote, input.value);
      });
    });

    tableWrap.querySelectorAll('[data-tlpt-expand]').forEach((row) => {
      row.addEventListener('click', () => {
        const groupId = row.dataset.tlptExpand;
        if (expandedGroups.has(groupId)) expandedGroups.delete(groupId);
        else expandedGroups.add(groupId);
        render();
      });
    });
  }

  function buildGroups(rows) {
    const groups = new Map();

    rows.forEach((row) => {
      const day = formatDayKey(row.timestamp);
      const targetKey = row.defenderId || row.defenderName || 'unknown';
      const groupKey = `${day}:${targetKey}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          id: groupKey,
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
      }

      const group = groups.get(groupKey);
      group.rows.push(row);
      if (row.kind === 'escape') {
        group.escapeCount += 1;
        group.escapeExpected += row.expected;
      } else {
        group.lossCount += 1;
        group.lossExpected += row.expected;
      }
      group.expected += row.expected;
      group.paid += row.paid;
      group.firstTimestamp = Math.max(group.firstTimestamp, row.timestamp);
      group.lastTimestamp = Math.min(group.lastTimestamp, row.timestamp);
      if (group.defenderName.startsWith('Player ') && !row.defenderName.startsWith('Player ')) {
        group.defenderName = row.defenderName;
      }
    });

    return Array.from(groups.values()).map((group) => ({
      ...group,
      outstanding: Math.max(0, group.expected - group.paid),
    }));
  }

  function groupHtml(group) {
    const target = group.defenderId
      ? `<a href="/profiles.php?XID=${escapeAttr(group.defenderId)}" target="_blank" rel="noopener">${escapeHtml(group.defenderName)}</a> <span class="tlpt-target-id">[${escapeHtml(group.defenderId)}]</span>`
      : escapeHtml(group.defenderName);
    const statusClass = group.outstanding > 0 ? 'tlpt-unpaid' : 'tlpt-paid';
    const badgeClass = group.outstanding > 0 ? 'tlpt-status-unpaid' : 'tlpt-status-paid';
    const statusText = group.outstanding > 0 ? 'Unpaid' : 'Paid';
    const timeText = group.firstTimestamp === group.lastTimestamp
      ? formatTime(group.firstTimestamp)
      : `${formatTime(group.lastTimestamp)} - ${formatTime(group.firstTimestamp)}`;
    const lossRate = group.lossCount > 0 ? Math.round(group.lossExpected / group.lossCount) : Number(state.defaultRate) || DEFAULT_RATE;
    const escapeRate = group.escapeCount > 0 ? Math.round(group.escapeExpected / group.escapeCount) : Number(state.defaultEscapeRate) || DEFAULT_ESCAPE_RATE;
    const isExpanded = expandedGroups.has(group.id);
    const escapedGroupId = escapeAttr(group.id);
    const note = getGroupNote(group.id);
    const notePrefix = note ? `<span class="tlpt-service-tag" title="${escapeAttr(note)}">${escapeHtml(note)}</span>` : '';
    const countHtml = actionCountHtml(group);
    const totalFormula = totalFormulaText(group, lossRate, escapeRate);

    return `
      <section class="tlpt-contract">
        <div class="tlpt-contract-head" data-tlpt-expand="${escapedGroupId}">
          <div>
            <div class="tlpt-target">${notePrefix}${target}</div>
            <div class="tlpt-muted">${escapeHtml(group.day)} &middot; ${escapeHtml(timeText)}</div>
          </div>
          <div class="tlpt-pill-stack">${countHtml}</div>
          <div class="tlpt-status-badge ${badgeClass}">${escapeHtml(statusText)}</div>
          <div class="tlpt-row-total">${escapeHtml(money(group.expected))}</div>
          <div class="tlpt-chevron${isExpanded ? ' tlpt-open' : ''}">v</div>
        </div>
        <div class="tlpt-contract-body${isExpanded ? ' tlpt-open' : ''}">
          <div class="tlpt-rate-grid">
            ${group.lossCount > 0 ? `
              <div class="tlpt-field">
                <label>Loss pay</label>
                <input class="tlpt-money-input" data-tlpt-rate="${escapedGroupId}" data-tlpt-kind="loss" type="number" min="0" step="50000" value="${lossRate}">
              </div>
            ` : ''}
            ${group.escapeCount > 0 ? `
              <div class="tlpt-field">
                <label>Escape pay</label>
                <input class="tlpt-money-input" data-tlpt-rate="${escapedGroupId}" data-tlpt-kind="escape" type="number" min="0" step="50000" value="${escapeRate}">
              </div>
            ` : ''}
          </div>
          <div class="tlpt-field">
            <label>Service / comment</label>
            <input class="tlpt-note-input" data-tlpt-note="${escapedGroupId}" type="text" maxlength="40" placeholder="e.g. Discord, Forum" value="${escapeAttr(note)}">
          </div>
          <div class="tlpt-contract-total">
            <span>${escapeHtml(totalFormula)}</span>
            <span class="tlpt-total-value">= ${escapeHtml(money(group.expected))}</span>
          </div>
          <button class="tlpt-toggle-paid ${statusClass}" data-tlpt-paid-toggle="${escapedGroupId}" data-current-paid="${group.outstanding <= 0}" type="button">
            ${group.outstanding <= 0 ? 'Mark unpaid' : 'Mark paid'}
          </button>
        </div>
      </section>
    `;
  }

  function actionCountHtml(group) {
    const parts = [];
    if (group.lossCount > 0) {
      parts.push(`<span class="tlpt-pill tlpt-pill-loss">${group.lossCount} loss${group.lossCount === 1 ? '' : 'es'}</span>`);
    }
    if (group.escapeCount > 0) {
      parts.push(`<span class="tlpt-pill tlpt-pill-escape">${group.escapeCount} escape${group.escapeCount === 1 ? '' : 's'}</span>`);
    }
    return parts.join(' / ');
  }

  function totalFormulaText(group, lossRate, escapeRate) {
    const parts = [];
    if (group.lossCount > 0) parts.push(`${group.lossCount} x ${money(lossRate)}`);
    if (group.escapeCount > 0) parts.push(`${group.escapeCount} x ${money(escapeRate)}`);
    return parts.join(' + ');
  }

  function getPayRecord(id, row) {
    if (!state.payments[id]) {
      state.payments[id] = {
        expected: defaultExpectedFor(row || { kind: 'loss' }),
        paid: 0,
      };
    }
    return state.payments[id];
  }

  function getGroupNote(groupId) {
    state.groupNotes = state.groupNotes || {};
    return state.groupNotes[groupId] || '';
  }

  function updateGroupNote(groupId, value) {
    state.groupNotes = state.groupNotes || {};
    const note = String(value || '').trim();
    if (note) state.groupNotes[groupId] = note;
    else delete state.groupNotes[groupId];
    saveState();
    render();
  }

  function updateMoney(id, key, value) {
      const record = getPayRecord(id);
    record[key] = Math.max(0, Number(value) || 0);
    saveState();
    render();
  }

  function updateGroupPaidToggle(groupId, isPaid) {
    const group = buildGroups(lossRows.map((row) => {
      const record = getPayRecord(row.id, row);
      return {
        ...row,
        expected: record.expected === undefined || record.expected === null ? defaultExpectedFor(row) : Number(record.expected),
        paid: Number(record.paid || 0),
      };
    })).find((item) => item.id === groupId);

    if (!group) return;

    distributeGroupMoney(group.rows, 'paid', isPaid ? group.expected : 0);
    saveState();
    render();
  }

  function updateGroupRate(groupId, kind, value) {
    const group = buildGroups(lossRows.map((row) => {
      const record = getPayRecord(row.id, row);
      return {
        ...row,
        expected: record.expected === undefined || record.expected === null ? defaultExpectedFor(row) : Number(record.expected),
        paid: Number(record.paid || 0),
      };
    })).find((item) => item.id === groupId);

    if (!group) return;

    const rate = Math.max(0, Number(value) || 0);
    const targetRows = group.rows.filter((row) => row.kind === kind);
    const unchangedRows = group.rows.filter((row) => row.kind !== kind);
    if (targetRows.length === 0) return;

    const expectedTotal = rate * targetRows.length;
    const unchangedExpected = unchangedRows.reduce((sum, row) => {
      const record = getPayRecord(row.id, row);
      return sum + (record.expected === undefined || record.expected === null ? defaultExpectedFor(row) : Number(record.expected));
    }, 0);
    const wasPaid = group.outstanding <= 0;

    distributeGroupMoney(targetRows, 'expected', expectedTotal);
    distributeGroupMoney(group.rows, 'paid', wasPaid ? expectedTotal + unchangedExpected : 0);
    saveState();
    render();
  }

  function distributeGroupMoney(rows, key, total) {
    const base = Math.floor(total / rows.length);
    let remainder = total - base * rows.length;

    rows.forEach((row) => {
      const record = getPayRecord(row.id, row);
      const extra = remainder > 0 ? 1 : 0;
      record[key] = base + extra;
      remainder -= extra;
    });
  }

  async function hydrateMissingNames(apiKey, rows) {
    const missingIds = Array.from(new Set(rows
      .filter((row) => row.defenderId && (!row.defenderName || row.defenderName === `Player ${row.defenderId}` || row.defenderName === 'Unknown'))
      .map((row) => String(row.defenderId))));

    if (missingIds.length === 0) return;
    state.nameCache = state.nameCache || {};

    for (const id of missingIds) {
      if (!state.nameCache[id]) {
        try {
          const data = await requestJson(`${API_BASE}/user/${encodeURIComponent(id)}/basic?key=${encodeURIComponent(apiKey)}&comment=loss-pay-tracker`);
          const name = extractProfileName(data);
          if (!data.error && name) {
            state.nameCache[id] = name;
          }
        } catch (_) {
          // Try the v1 selection shape before giving up on this name.
        }
      }

      if (!state.nameCache[id]) {
        try {
          const data = await requestJson(`${API_V1_BASE}/user/${encodeURIComponent(id)}?selections=basic&key=${encodeURIComponent(apiKey)}`);
          const name = extractProfileName(data);
          if (!data.error && name) {
            state.nameCache[id] = name;
          }
        } catch (_) {
          // Name lookup is a convenience; keep the loss log usable if it fails.
        }
      }
    }

    rows.forEach((row) => {
      const cachedName = state.nameCache[String(row.defenderId)];
      if (cachedName) row.defenderName = cachedName;
    });

    saveState();
  }

  function requestJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 20000,
        onload: (response) => {
          try {
            resolve(JSON.parse(response.responseText));
          } catch (error) {
            reject(new Error('Invalid JSON from Torn API'));
          }
        },
        onerror: () => reject(new Error('Network request failed')),
        ontimeout: () => reject(new Error('Torn API request timed out')),
      });
    });
  }

  function loadState() {
    try {
      return {
        apiKey: '',
        defaultRate: DEFAULT_RATE,
        defaultEscapeRate: DEFAULT_ESCAPE_RATE,
        selectedDate: todayInputValue(),
        payments: {},
        nameCache: {},
        groupNotes: {},
        ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}'),
      };
    } catch (_) {
      return {
        apiKey: '',
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
    const status = document.getElementById('tlpt-status');
    if (status) status.textContent = text;
  }

  function setStatusHtml(html) {
    const status = document.getElementById('tlpt-status');
    if (status) status.innerHTML = html;
  }

  function money(value) {
    return `$${Math.round(Number(value) || 0).toLocaleString()}`;
  }

  function formatTime(timestamp) {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp * 1000).toLocaleTimeString();
  }

  function formatDayKey(timestamp) {
    if (!timestamp) return 'Unknown date';
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  function todayInputValue() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function selectedDateRange(dateValue) {
    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : todayInputValue();
    const start = new Date(`${safeDate}T00:00:00`);
    const end = new Date(start.getTime());
    end.setDate(end.getDate() + 1);
    return {
      from: Math.floor(start.getTime() / 1000),
      to: Math.floor(end.getTime() / 1000),
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function firstObject(...values) {
    return values.find((value) => value && typeof value === 'object') || {};
  }

  function firstValue(...values) {
    return values.find((value) => value !== undefined && value !== null && value !== '');
  }

  function extractProfileName(data) {
    return firstValue(
      data && data.name,
      data && data.username,
      data && data.player_name,
      data && data.basic && data.basic.name,
      data && data.user && data.user.name,
      data && data.profile && data.profile.name,
      data && data.player && data.player.name
    );
  }
})();
