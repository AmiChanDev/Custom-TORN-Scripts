# Torn $1 Bazaar Highlighter

Highlights `$1` listings on the Torn bazaar page you are currently viewing.

## What it does

- Scans only the visible bazaar page loaded in your browser.
- Highlights item cards that contain a visible price text exactly matching `$1`.
- Uses amber for `$1` items and green for `$1` items that appear to have a visible enabled buy action.
- Shows a tiny `$1 items` and `buyable` counter.
- Adds a manual `Rescan $1` button.

## What it does not do

- It does not auto-refresh.
- It does not guarantee buyability beyond what is visible on the current page.
- It does not open other bazaars.
- It does not click buy.
- It does not submit purchases.
- It does not use your API key.
- It does not make Torn network requests.

Install `torn-dollar-bazaar-highlighter.js` in Tampermonkey or TornPDA.
