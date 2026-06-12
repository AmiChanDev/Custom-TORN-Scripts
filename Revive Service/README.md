# Torn Revive Service

Small revive request queue for Torn.

It has three pieces:

- `apps-script-backend.js`: Google Apps Script web app that stores revive requests in a Google Sheet.
- `torn-revive-requester.js`: userscript for hospitalized players. They click `REVIVE` and submit their request.
- `torn-revive-watcher.js`: your userscript. It shows the queue and notifies you when new requests arrive.

## Set up the backend

1. Create a Google Sheet.
2. Open **Extensions > Apps Script**.
3. Paste the contents of `apps-script-backend.js` into `Code.gs`.
4. Optional: add your Discord webhook URL to `DISCORD_WEBHOOK_URL`.
5. Deploy with **Deploy > New deployment > Web app**.
6. Set **Execute as** to yourself.
7. Set **Who has access** to anyone with the link.
8. Copy the web app URL.

## Configure the userscripts

Paste the web app URL into both userscripts:

```js
const SERVICE_URL = "PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
```

Then install:

- Give `torn-revive-requester.js` to players who should be able to request revives.
- Install `torn-revive-watcher.js` for yourself.

## How it works

The requester script adds a `REVIVE` side tab on Torn. It tries to auto-fill a name, Torn ID, and hospital text from the page, but the player can edit the fields before sending.

The watcher script adds a `REVIVES` side tab on Torn. It polls the Google Apps Script every 20 seconds, displays open requests, sends a browser notification for new requests, and lets you mark requests as done.

If `DISCORD_WEBHOOK_URL` is configured in the backend, every new or updated revive request is also posted to Discord.

## Notes

- The requester script should only be used by players who are actually in hospital.
- The web app URL acts as the public submit endpoint, so only share the requester script with people you trust.
- Browser notifications require the Torn tab and userscript manager to be running. Discord webhook notifications are more reliable when you are away from the tab.
