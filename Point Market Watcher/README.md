Point Market Watcher browser script for TORN.

Install `torn-point-market-watcher.js` in Tampermonkey, open Torn, then use the POINTS tab on the left side of the screen.

How it watches:

- It reads the lowest point listing from Torn's points market API.
- The reference price is the last normal lowest price the script saw.
- If a new lowest listing is at least 2% below that reference, the script opens its panel and sends a browser notification.
- You can set a manual reference price if you want the alert threshold to stay fixed.
- The panel has buttons for the stock market and points market.

Your API key is stored only in local browser storage and is only sent to `api.torn.com`.
