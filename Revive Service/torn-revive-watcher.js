// ==UserScript==
// @name         Torn Revive Queue Watcher @AmrisG
// @namespace    torn-revive-queue-watcher @AmrisG
// @version      1.0.0
// @description  Shows your shared revive request queue and notifies when new Torn revive requests arrive.
// @author       AmrisG
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_notification
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const SERVICE_URL = "PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
  const STORE_KEY = "trqw:v1";
  const DEFAULT_REFRESH_SECONDS = 20;
  const state = loadState();
  let isOpen = false;
  let isChecking = false;
  let refreshTimer = 0;
  let requests = [];

  addStyles();
  buildShell();
  render();
  scheduleNextCheck(1000);

  function buildShell() {
    const toggle = document.createElement("button");
    toggle.id = "trqw-toggle";
    toggle.type = "button";
    toggle.textContent = "REVIVES";
    toggle.title = "Open revive queue";
    toggle.addEventListener("click", () => setOpen(!isOpen));

    const panel = document.createElement("section");
    panel.id = "trqw-panel";
    panel.innerHTML = `
      <div class="trqw-head">
        <div class="trqw-title">Revive Queue</div>
        <div class="trqw-head-actions">
          <button class="trqw-btn" id="trqw-refresh" type="button">Refresh</button>
          <button class="trqw-icon-btn" id="trqw-close" type="button" title="Close">&times;</button>
        </div>
      </div>
      <div class="trqw-stats">
        <div class="trqw-stat">
          <div class="trqw-label">Open</div>
          <div class="trqw-value" id="trqw-count">0</div>
        </div>
        <div class="trqw-stat">
          <div class="trqw-label">Last check</div>
          <div class="trqw-value" id="trqw-checked">Never</div>
        </div>
      </div>
      <div class="trqw-status" id="trqw-status"></div>
      <div id="trqw-list"></div>
    `;

    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    document.getElementById("trqw-close").addEventListener("click", () => setOpen(false));
    document.getElementById("trqw-refresh").addEventListener("click", () => checkQueue(true));
    panel.addEventListener("click", handlePanelClick);
  }

  function setOpen(nextOpen) {
    isOpen = nextOpen;
    document.getElementById("trqw-panel").classList.toggle("trqw-open", isOpen);
    document.getElementById("trqw-toggle").classList.toggle("trqw-attached", isOpen);
  }

  function checkQueue(manual) {
    if (isChecking) return;
    if (!isConfigured()) {
      setStatus("Paste your Apps Script URL into this userscript first.");
      scheduleNextCheck();
      return;
    }

    isChecking = true;
    setStatus(manual ? "Checking revive queue..." : "Auto-checking revive queue...");

    requestJson("GET", `${SERVICE_URL}?action=list`)
      .then((data) => {
        if (!data || !data.ok) throw new Error((data && data.error) || "Queue check failed.");
        const nextRequests = Array.isArray(data.requests) ? data.requests : [];
        notifyNewRequests(nextRequests);
        requests = nextRequests;
        state.lastChecked = Date.now();
        saveState();
        setStatus(requests.length ? `${requests.length} open revive request${requests.length === 1 ? "" : "s"}.` : "No open revive requests.");
        render();
      })
      .catch((error) => setStatus(error.message))
      .finally(() => {
        isChecking = false;
        scheduleNextCheck();
      });
  }

  function handlePanelClick(event) {
    const openButton = event.target.closest("[data-open-profile]");
    if (openButton) {
      window.open(openButton.dataset.openProfile, "_blank", "noopener,noreferrer");
      return;
    }

    const resolveButton = event.target.closest("[data-resolve]");
    if (resolveButton) {
      resolveRequest(resolveButton.dataset.resolve);
    }
  }

  function resolveRequest(id) {
    if (!id || !isConfigured()) return;
    setStatus("Resolving request...");
    requestJson("POST", SERVICE_URL, { action: "resolve", id })
      .then((data) => {
        if (!data || !data.ok) throw new Error((data && data.error) || "Resolve failed.");
        requests = requests.filter((request) => request.id !== id);
        render();
        setStatus("Request marked resolved.");
      })
      .catch((error) => setStatus(error.message));
  }

  function notifyNewRequests(nextRequests) {
    const known = state.knownIds || {};

    nextRequests.forEach((request) => {
      if (known[request.id]) return;
      known[request.id] = Date.now();
      notify(request);
      setOpen(true);
    });

    state.knownIds = known;
  }

  function notify(request) {
    const name = request.name || "Unknown";
    const body = `${name}${request.tornId ? ` [${request.tornId}]` : ""}${request.hospitalUntil ? ` - ${request.hospitalUntil}` : ""}`;

    if (typeof GM_notification === "function") {
      GM_notification({
        title: "New revive request",
        text: body,
        timeout: 15000,
        onclick: () => openProfile(request),
      });
      return;
    }

    if ("Notification" in window && Notification.permission === "granted") {
      const notification = new Notification("New revive request", { body });
      notification.onclick = () => openProfile(request);
    } else if ("Notification" in window && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }

  function openProfile(request) {
    const url = request.profileUrl || (request.tornId ? `https://www.torn.com/profiles.php?XID=${request.tornId}` : "");
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  function render() {
    textOf("trqw-count", String(requests.length));
    textOf("trqw-checked", state.lastChecked ? formatClock(state.lastChecked) : "Never");

    const list = document.getElementById("trqw-list");
    if (!requests.length) {
      list.innerHTML = `<div class="trqw-empty">No revive requests loaded.</div>`;
      return;
    }

    list.innerHTML = requests.map((request) => {
      const profile = request.profileUrl || (request.tornId ? `https://www.torn.com/profiles.php?XID=${request.tornId}` : "");
      return `
        <div class="trqw-request">
          <div class="trqw-request-main">
            <div class="trqw-name">${escapeHtml(request.name || "Unknown")}${request.tornId ? ` <span>[${escapeHtml(request.tornId)}]</span>` : ""}</div>
            <div class="trqw-meta">${escapeHtml(timeAgo(request.requestedAt))}${request.hospitalUntil ? ` | ${escapeHtml(request.hospitalUntil)}` : ""}</div>
            ${request.message ? `<div class="trqw-message">${escapeHtml(request.message)}</div>` : ""}
          </div>
          <div class="trqw-actions">
            ${profile ? `<button class="trqw-btn trqw-primary" data-open-profile="${escapeHtml(profile)}" type="button">Profile</button>` : ""}
            <button class="trqw-btn" data-resolve="${escapeHtml(request.id)}" type="button">Done</button>
          </div>
        </div>
      `;
    }).join("");
  }

  function requestJson(method, url, payload) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        data: payload ? JSON.stringify(payload) : undefined,
        headers: payload ? { "Content-Type": "application/json" } : undefined,
        timeout: 20000,
        onload: (response) => {
          try {
            resolve(JSON.parse(response.responseText));
          } catch (_) {
            reject(new Error("Invalid service response."));
          }
        },
        onerror: () => reject(new Error("Network failed.")),
        ontimeout: () => reject(new Error("Request timed out.")),
      });
    });
  }

  function scheduleNextCheck(delay) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(
      () => checkQueue(false),
      typeof delay === "number" ? delay : DEFAULT_REFRESH_SECONDS * 1000,
    );
  }

  function isConfigured() {
    return /^https:\/\/script\.google\.com\//.test(SERVICE_URL);
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      return {
        lastChecked: Math.max(0, Number(saved.lastChecked) || 0),
        knownIds: saved.knownIds && typeof saved.knownIds === "object" ? saved.knownIds : {},
      };
    } catch (_) {
      return { lastChecked: 0, knownIds: {} };
    }
  }

  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function setStatus(text) {
    textOf("trqw-status", text);
  }

  function textOf(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function formatClock(ms) {
    return new Date(ms).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function timeAgo(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Unknown time";
    const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    return `${hours}h ago`;
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
      #trqw-toggle {
        position: fixed; left: 0; top: 52%; z-index: 999998;
        width: 25px; height: 92px; border: 0; border-radius: 0 6px 6px 0;
        background: #151719; color: #9bc7ff; box-shadow: 2px 0 14px rgba(0,0,0,.5);
        cursor: pointer; font: 800 9px/1 Arial, sans-serif; letter-spacing: .5px;
        writing-mode: vertical-rl; text-orientation: mixed;
      }
      #trqw-toggle.trqw-attached { left: min(390px, calc(100vw - 32px)); z-index: 1000000; }
      #trqw-panel {
        position: fixed; left: 0; top: 0; bottom: 0; z-index: 999999;
        width: min(390px, calc(100vw - 32px)); display: flex; flex-direction: column;
        background: #17191b; color: #eef4fb; box-shadow: 7px 0 30px rgba(0,0,0,.55);
        transform: translateX(calc(-100% - 16px)); transition: transform .2s ease;
        font: 13px/1.45 Arial, sans-serif;
      }
      #trqw-panel.trqw-open { transform: translateX(0); }
      #trqw-panel, #trqw-panel * { box-sizing: border-box; text-shadow: none !important; }
      .trqw-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 12px; border-bottom: 1px solid #28313a; background: #101214;
      }
      .trqw-title { font-size: 15px; font-weight: 800; color: #eef7ff; }
      .trqw-head-actions, .trqw-actions { display: flex; gap: 6px; }
      .trqw-icon-btn, .trqw-btn {
        border: 1px solid #34414f; border-radius: 5px; background: #202830; color: #eef4fb;
        cursor: pointer; font: 700 12px Arial, sans-serif;
      }
      .trqw-icon-btn { width: 30px; height: 30px; font-size: 18px; line-height: 1; }
      .trqw-btn { height: 30px; padding: 0 10px; }
      .trqw-primary { background: #14304d; border-color: #285c8d; color: #9bc7ff; }
      .trqw-stats { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #28313a; }
      .trqw-stat { padding: 10px 12px; border-right: 1px solid #28313a; }
      .trqw-stat:nth-child(even) { border-right: 0; }
      .trqw-label {
        color: #8995a1; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px;
      }
      .trqw-value { margin-top: 2px; color: #f5faff; font: 800 15px/1.25 Consolas, monospace; }
      .trqw-status {
        min-height: 28px; padding: 7px 12px; border-bottom: 1px solid #28313a;
        color: #a3afba; font-size: 12px; font-weight: 700;
      }
      #trqw-list { overflow-y: auto; flex: 1; }
      .trqw-empty { padding: 12px; color: #8995a1; font-weight: 700; }
      .trqw-request {
        display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 10px 12px;
        border-top: 1px solid #26313b; align-items: start;
      }
      .trqw-request:nth-child(odd) { background: #1b2025; }
      .trqw-name { font-weight: 900; color: #f5faff; }
      .trqw-name span { color: #9bc7ff; }
      .trqw-meta { margin-top: 2px; color: #8995a1; font-size: 11px; font-weight: 700; }
      .trqw-message { margin-top: 5px; color: #d3dde7; font-size: 12px; overflow-wrap: anywhere; }
      @media (max-width: 520px) {
        #trqw-panel { width: calc(100vw - 28px); }
        #trqw-toggle.trqw-attached { left: calc(100vw - 28px); }
        .trqw-request { grid-template-columns: 1fr; }
      }
    `);
  }
})();
