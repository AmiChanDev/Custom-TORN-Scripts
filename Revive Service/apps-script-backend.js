const SHEET_NAME = "Revive Requests";
const DISCORD_WEBHOOK_URL = "";

function doGet(event) {
  const action = String(event.parameter.action || "list").toLowerCase();

  if (action === "list") {
    return jsonResponse({
      ok: true,
      requests: listRequests(),
      serverTime: new Date().toISOString(),
    });
  }

  return jsonResponse({ ok: false, error: "Unknown action." });
}

function doPost(event) {
  const payload = parsePayload(event);
  const action = String(payload.action || "add").toLowerCase();

  if (action === "add") {
    return addRequest(payload);
  }

  if (action === "resolve") {
    return resolveRequest(payload);
  }

  if (action === "clear") {
    return clearResolved();
  }

  return jsonResponse({ ok: false, error: "Unknown action." });
}

function addRequest(payload) {
  const tornId = clean(payload.tornId, 24);
  const name = clean(payload.name, 80);

  if (!tornId && !name) {
    return jsonResponse({ ok: false, error: "Name or Torn ID is required." });
  }

  const sheet = getSheet();
  const now = new Date();
  const requestId = Utilities.getUuid();
  const existingRow = findOpenRequestRow(sheet, tornId, name);

  if (existingRow > 0) {
    sheet.getRange(existingRow, 2, 1, 7).setValues([
      [
        now,
        name,
        tornId,
        clean(payload.hospitalUntil, 80),
        clean(payload.message, 300),
        clean(payload.profileUrl, 300),
        "open",
      ],
    ]);

    const request = rowToRequest(sheet.getRange(existingRow, 1, 1, 8).getValues()[0]);
    sendDiscordNotification(request, true);
    return jsonResponse({ ok: true, request, updated: true });
  }

  const row = [
    requestId,
    now,
    name,
    tornId,
    clean(payload.hospitalUntil, 80),
    clean(payload.message, 300),
    clean(payload.profileUrl, 300),
    "open",
  ];

  sheet.appendRow(row);
  const request = rowToRequest(row);
  sendDiscordNotification(request, false);

  return jsonResponse({ ok: true, request, updated: false });
}

function resolveRequest(payload) {
  const id = clean(payload.id, 80);
  if (!id) return jsonResponse({ ok: false, error: "Request ID is required." });

  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();

  for (let index = 1; index < values.length; index += 1) {
    if (String(values[index][0]) === id) {
      sheet.getRange(index + 1, 8).setValue("resolved");
      return jsonResponse({ ok: true });
    }
  }

  return jsonResponse({ ok: false, error: "Request not found." });
}

function clearResolved() {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();

  for (let index = values.length - 1; index >= 1; index -= 1) {
    if (String(values[index][7]).toLowerCase() === "resolved") {
      sheet.deleteRow(index + 1);
    }
  }

  return jsonResponse({ ok: true });
}

function listRequests() {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();

  return values
    .slice(1)
    .map(rowToRequest)
    .filter((request) => request.status === "open")
    .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "id",
      "requestedAt",
      "name",
      "tornId",
      "hospitalUntil",
      "message",
      "profileUrl",
      "status",
    ]);
  }

  return sheet;
}

function findOpenRequestRow(sheet, tornId, name) {
  const values = sheet.getDataRange().getValues();
  const normalizedName = String(name || "").toLowerCase();

  for (let index = 1; index < values.length; index += 1) {
    const row = values[index];
    const rowStatus = String(row[7] || "").toLowerCase();
    const rowId = String(row[3] || "");
    const rowName = String(row[2] || "").toLowerCase();

    if (rowStatus !== "open") continue;
    if (tornId && rowId === tornId) return index + 1;
    if (!tornId && normalizedName && rowName === normalizedName) return index + 1;
  }

  return 0;
}

function rowToRequest(row) {
  return {
    id: String(row[0] || ""),
    requestedAt: row[1] instanceof Date ? row[1].toISOString() : String(row[1] || ""),
    name: String(row[2] || ""),
    tornId: String(row[3] || ""),
    hospitalUntil: String(row[4] || ""),
    message: String(row[5] || ""),
    profileUrl: String(row[6] || ""),
    status: String(row[7] || "open").toLowerCase(),
  };
}

function sendDiscordNotification(request, updated) {
  if (!DISCORD_WEBHOOK_URL) return;

  const profile = request.profileUrl || (request.tornId ? `https://www.torn.com/profiles.php?XID=${request.tornId}` : "");
  const content = [
    updated ? "Revive request updated" : "New revive request",
    `${request.name || "Unknown"}${request.tornId ? ` [${request.tornId}]` : ""}`,
    request.hospitalUntil ? `Hospital: ${request.hospitalUntil}` : "",
    request.message ? `Message: ${request.message}` : "",
    profile,
  ]
    .filter(Boolean)
    .join("\n");

  UrlFetchApp.fetch(DISCORD_WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ content }),
    muteHttpExceptions: true,
  });
}

function parsePayload(event) {
  try {
    if (event.postData && event.postData.contents) {
      return JSON.parse(event.postData.contents);
    }
  } catch (error) {
    return {};
  }

  return {};
}

function clean(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
