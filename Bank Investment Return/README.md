# Torn Bank Investment Return

Tampermonkey userscript that fetches Torn bank APRs from the Torn API bank selection and calculates investment returns for all bank terms.

Install `torn-bank-investment-return.js` in Tampermonkey, then open Torn's bank screen. The calculator appears from the `BANK` side tab and is hidden elsewhere.

What it accounts for:

- Current Torn bank APRs, fetched from `torn/?selections=bank` with your API key.
- Torn's five bank terms: 1 week, 2 weeks, 1 month, 2 months, and 3 months.
- Bank Interest merits: each merit adds 5% to APR.
- The Torn City Investments stock block, `TCI`: 1.5 million shares for a 10% bank interest bonus.
- Standard `$2B` bank limit or `$3B` 10-star Oil Rig limit.

The table compares Regular, TCI only, selected merits only, and selected merits plus TCI. The base APR is shown above each period, and each return cell shows the effective APR for that scenario. The large value is total interest for the period; the cyan value below it is average daily return.

The calculation follows TornTools' bank investment table approach: APRs are read from the bank response keys `1w`, `2w`, `1m`, `2m`, and `3m`; the period ratio is rounded to four decimals before multiplying by the amount.

Your API key is stored only in local browser storage and is only sent to `api.torn.com`. If the API request fails, open `Manual APR` and enter the current APRs yourself.

The calculation uses simple annual APR prorated by term days:

```text
bonus multiplier = (TCI ? 1.10 : 1) * (merits ? 1 + merits * 0.05 : 1)
interest = round(((APR / 100) * bonus multiplier / 365 * term days).toFixed(4) * investment)
```
