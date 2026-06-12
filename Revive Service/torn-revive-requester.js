// ==UserScript==
// @name         Torn Revive Requester @AmrisG
// @namespace    torn-revive-requester @AmrisG
// @version      1.0.0
// @description  Lets a hospitalized Torn player request a revive through your shared revive queue.
// @author       AmrisG
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const SERVICE_URL = "PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
  const STORE_KEY = "trr:v1";
  const state = loadState();
  let isOpen = false;
  let isSending = false;

  addStyles();
  buildShell();
  syncProfileFields();
  render();

  function buildShell() {
    const toggle = document.createElement("button");
    toggle.id = "trr-toggle";
    toggle.type = "button";
    toggle.textContent = "REVIVE";
    toggle.title = "Request a revive";
    toggle.addEventListener("click", () => setOpen(!isOpen));

    const panel = document.createElement("section");
    panel.id = "trr-panel";
    panel.innerHTML = `
      <div class="trr-head">
        <div class="trr-title">Revive Request</div>
        <button class="trr-icon-btn" id="trr-close" type="button" title="Close">&times;</button>
      </div>
      <div class="trr-status" id="trr-status"></div>
      <div class="trr-section">
        <label class="trr-field">
          <span>Name</span>
          <input id="trr-name" class="trr-input" type="text" maxlength="80" autocomplete="off" />
        </label>
        <label class="trr-field">
          <span>Torn ID</span>
          <input id="trr-id" class="trr-input" type="text" maxlength="24" inputmode="numeric" autocomplete="off" />
        </label>
        <label class="trr-field">
          <span>Hospital time</span>
          <input id="trr-hospital" class="trr-input" type="text" maxlength="80" autocomplete="off" placeholder="Optional" />
        </label>
        <label class="trr-field">
          <span>Message</span>
          <textarea id="trr-message" class="trr-input trr-textarea" maxlength="300" placeholder="Optional"></textarea>
        </label>
        <button class="trr-btn trr-primary" id="trr-send" type="button">Request Revive</button>
      </div>
    `;

    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    document.getElementById("trr-close").addEventListener("click", () => setOpen(false));
    document.getElementById("trr-send").addEventListener("click", submitRequest);
  }

  function setOpen(nextOpen) {
    isOpen = nextOpen;
    document.getElementById("trr-panel").classList.toggle("trr-open", isOpen);
    document.getElementById("trr-toggle").classList.toggle("trr-attached", isOpen);
  }

  function syncProfileFields() {
    const profile = detectProfile();
    if (!state.name && profile.name) state.name = profile.name;
    if (!state.tornId && profile.tornId) state.tornId = profile.tornId;
    if (!state.hospitalUntil) state.hospitalUntil = detectHospitalText();

    valueOf("trr-name", state.name);
    valueOf("trr-id", state.tornId);
    valueOf("trr-hospital", state.hospitalUntil);
    valueOf("trr-message", state.message);
  }

  function submitRequest() {
    if (isSending) return;
    if (!isConfigured()) {
      setStatus("Service URL is not configured yet.");
      setOpen(true);
      return;
    }

    const payload = {
      action: "add",
      name: valueOf("trr-name").trim(),
      tornId: valueOf("trr-id").trim(),
      hospitalUntil: valueOf("trr-hospital").trim(),
      message: valueOf("trr-message").trim(),
      profileUrl: profileUrl(valueOf("trr-id").trim()),
    };

    if (!payload.name && !payload.tornId) {
      setStatus("Enter your name or Torn ID first.");
      return;
    }

    isSending = true;
    setStatus("Sending revive request...");
    saveForm();

    requestJson("POST", SERVICE_URL, payload)
      .then((data) => {
        if (!data || !data.ok) throw new Error((data && data.error) || "Request failed.");
        setStatus(data.updated ? "Your revive request was updated." : "Your revive request was sent.");
      })
      .catch((error) => setStatus(error.message))
      .finally(() => {
        isSending = false;
        render();
      });
  }

  function saveForm() {
    state.name = valueOf("trr-name").trim();
    state.tornId = valueOf("trr-id").trim();
    state.hospitalUntil = valueOf("trr-hospital").trim();
    state.message = valueOf("trr-message").trim();
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function render() {
    const send = document.getElementById("trr-send");
    send.disabled = isSending;
    if (!document.getElementById("trr-status").textContent) {
      setStatus(isConfigured() ? hospitalHint() : "Paste your Apps Script URL into this userscript first.");
    }
  }

  function hospitalHint() {
    return looksHospitalized()
      ? "You appear to be in hospital. Send a request when ready."
      : "Use this only when you are in hospital and need a revive.";
  }

  function detectProfile() {
    const result = { name: "", tornId: "" };
    const anchors = Array.from(document.querySelectorAll('a[href*="profiles.php?XID="]'));
    const ownLink = anchors.find((anchor) => /profiles\.php\?XID=\d+/.test(anchor.href) && anchor.textContent.trim());
    const match = ownLink && ownLink.href.match(/[?&]XID=(\d+)/);

    if (ownLink) result.name = ownLink.textContent.replace(/\[[\d]+\]/g, "").trim();
    if (match) result.tornId = match[1];

    return result;
  }

  function detectHospitalText() {
    const bodyText = document.body ? document.body.innerText : "";
    const match = bodyText.match(/hospital(?:ized)?[^.\n]{0,80}/i);
    return match ? match[0].trim() : "";
  }

  function looksHospitalized() {
    const text = document.body ? document.body.innerText.toLowerCase() : "";
    return /hospital|hospitalized|medical cooldown/.test(text);
  }

  function profileUrl(tornId) {
    return tornId ? `https://www.torn.com/profiles.php?XID=${encodeURIComponent(tornId)}` : "";
  }

  function requestJson(method, url, payload) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        data: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
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

  function isConfigured() {
    return /^https:\/\/script\.google\.com\//.test(SERVICE_URL);
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    } catch (_) {
      return {};
    }
  }

  function setStatus(text) {
    document.getElementById("trr-status").textContent = text;
  }

  function valueOf(id, nextValue) {
    const el = document.getElementById(id);
    if (!el) return "";
    if (arguments.length > 1) el.value = nextValue || "";
    return el.value || "";
  }

  function addStyles() {
    GM_addStyle(`
      #trr-toggle {
        position: fixed; right: 0; top: 52%; z-index: 999998;
        width: 25px; height: 86px; border: 0; border-radius: 6px 0 0 6px;
        background: #181719; color: #ff9b9b; box-shadow: -2px 0 14px rgba(0,0,0,.5);
        cursor: pointer; font: 800 9px/1 Arial, sans-serif; letter-spacing: .5px;
        writing-mode: vertical-rl; text-orientation: mixed;
      }
      #trr-toggle.trr-attached { right: min(360px, calc(100vw - 32px)); z-index: 1000000; }
      #trr-panel {
        position: fixed; right: 0; top: 0; bottom: 0; z-index: 999999;
        width: min(360px, calc(100vw - 32px)); display: flex; flex-direction: column;
        background: #191719; color: #f4eeee; box-shadow: -7px 0 30px rgba(0,0,0,.55);
        transform: translateX(calc(100% + 16px)); transition: transform .2s ease;
        font: 13px/1.45 Arial, sans-serif;
      }
      #trr-panel.trr-open { transform: translateX(0); }
      #trr-panel, #trr-panel * { box-sizing: border-box; text-shadow: none !important; }
      .trr-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 12px; border-bottom: 1px solid #30282b; background: #121112;
      }
      .trr-title { font-size: 15px; font-weight: 800; color: #ffecec; }
      .trr-icon-btn, .trr-btn {
        border: 1px solid #443238; border-radius: 5px; background: #2a2023; color: #f4eeee;
        cursor: pointer; font: 700 12px Arial, sans-serif;
      }
      .trr-icon-btn { width: 30px; height: 30px; font-size: 18px; line-height: 1; }
      .trr-btn { width: 100%; height: 34px; margin-top: 10px; }
      .trr-btn:disabled { opacity: .65; cursor: wait; }
      .trr-primary { background: #452025; border-color: #7a343c; color: #ffb3b3; }
      .trr-status {
        min-height: 34px; padding: 8px 12px; border-bottom: 1px solid #30282b;
        color: #bfaeb2; font-size: 12px; font-weight: 700;
      }
      .trr-section { padding: 12px; }
      .trr-field { display: block; margin-bottom: 9px; }
      .trr-field span {
        display: block; margin-bottom: 4px; color: #9d8b90;
        font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px;
      }
      .trr-input {
        width: 100%; min-height: 31px; border: 1px solid #443238; border-radius: 5px;
        background: #111011; color: #f4eeee; padding: 0 8px; font: 700 12px Arial, sans-serif;
      }
      .trr-textarea { height: 72px; padding: 7px 8px; resize: vertical; }
      .trr-input:focus { outline: none; border-color: #9d4951; }
      @media (max-width: 520px) {
        #trr-panel { width: calc(100vw - 28px); }
        #trr-toggle.trr-attached { right: calc(100vw - 28px); }
      }
    `);
  }
})();
