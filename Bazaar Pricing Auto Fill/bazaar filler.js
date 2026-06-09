// ==UserScript==
// @name         Bazaar Price Auto Filler @AmrisG
// @namespace    AmrisG
// @version      1.0.0
// @description  Autofills Torn bazaar prices using combined item market and bazaar listings with outlier and cluster protection.
// @author       AmrisG
// @match        https://www.torn.com/bazaar.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.3.1/jquery.min.js
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      api.torn.com
// @connect      weav3r.dev
// ==/UserScript==

(function () {
  "use strict";

  const marketUrl =
    "https://api.torn.com/v2/market?id={itemId}&selections=itemMarket&key={apiKey}&comment=BazaarFiller";
  const itemUrl =
    "https://api.torn.com/torn/{itemId}?selections=items&key={apiKey}&comment=BazaarFiller";
  const weav3rMarketplaceUrl = "https://weav3r.dev/api/marketplace/{itemId}";
  const minimumMarketValueRatio = 0.99;
  const maximumMarketValueRatio = 1;
  const pricingListingLimit = 8;
  const updateAllConcurrency = 3;
  const updateAllBatchDelayMs = 25;
  const updateAllScrollDelayMs = 250;
  let priceDeltaRaw =
    localStorage.getItem("silmaril-torn-bazaar-filler-price-delta") ?? "-1";
  let apiKey = localStorage.getItem("silmaril-torn-bazaar-filler-apikey");

  try {
    GM_registerMenuCommand("Set Price Delta", setPriceDelta);
    GM_registerMenuCommand("Set Api Key", function () {
      checkApiKey(false);
    });
  } catch (error) {
    console.warn("[TornBazaarFiller] Tampermonkey not detected!");
  }

  // TornPDA support for GM_addStyle
  let GM_addStyle = function (s) {
    let style = document.createElement("style");
    style.type = "text/css";
    style.innerHTML = s;
    document.head.appendChild(style);
  };

  GM_addStyle(
    `.btn-wrap.torn-bazaar-fill-qty-price{float:right;margin-left:auto;z-index:99999}.btn-wrap.torn-bazaar-clear-qty-price{z-index:99999}.btn-wrap.torn-bazaar-update-all-prices{display:inline-block;margin-left:10px;z-index:99999}div.title-wrap div.name-wrap{display:flex;justify-content:flex-end}.wave-animation{position:relative;overflow:hidden}.wave{pointer-events:none;position:absolute;width:100%;height:33px;background-color:transparent;opacity:0;transform:translateX(-100%);animation:waveAnimation 1s cubic-bezier(0, 0, 0, 1)}@keyframes waveAnimation{0%{opacity:1;transform:translateX(-100%)}100%{opacity:0;transform:translateX(100%)}}.overlay-percentage{position:absolute;top:0;background-color:rgba(0, 0, 0, 0.9);padding:0 5px;border-radius:15px;font-size:10px}.overlay-percentage-add{right:-30px}.overlay-percentage-manage{right:0}.torn-bazaar-price-dataset{display:inline-block;margin-left:6px;color:#9fd6ff;background:rgba(0,0,0,.65);border:1px solid rgba(159,214,255,.35);border-radius:3px;padding:0 3px;font-size:10px;line-height:14px;cursor:help;vertical-align:middle;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis}.torn-bazaar-price-dataset::after{content:attr(data-detail);display:none;position:fixed;right:14px;top:106px;max-width:430px;white-space:normal;background:rgba(0,0,0,.94);color:#d7edff;border:1px solid rgba(159,214,255,.45);border-radius:4px;padding:6px 8px;z-index:999999;line-height:13px}.torn-bazaar-price-dataset:hover::after{display:block}`,
  );

  const pages = { AddItems: 10, ManageItems: 20 };
  const addItemsLabels = ["Fill", "Clear"];
  const updateItemsLabels = ["Update"];

  const viewPortWidthPx = window.innerWidth;
  const isMobileView = viewPortWidthPx <= 784;

  const observerTarget = $(".content-wrapper")[0] || document.body;
  const observerConfig = {
    attributes: false,
    childList: true,
    characterData: false,
    subtree: true,
  };

  let scanScheduled = false;
  function scanAndInject() {
    scanScheduled = false;

    // Add Items page rows (legacy non-virtualized list)
    $("ul.items-cont li.clearfix")
      .find("div.title-wrap div.name-wrap")
      .each(function () {
        let isParentRowDisabled =
          this.parentElement.parentElement.classList.contains("disabled");
        let alreadyHasFillBtn =
          this.querySelector(".btn-wrap.torn-bazaar-fill-qty-price") != null;
        if (!alreadyHasFillBtn && !isParentRowDisabled) {
          insertFillAndWaveBtn(this, addItemsLabels, pages.AddItems);
        }
      });

    // Manage Items page rows (virtualized list — rows mount/unmount on scroll & dnd-kit reorder)
    $('div[data-testid="sortable-item"], div[class*="row___"]')
      .find('div[class*="item___"] div[class*="desc___"]')
      .each(function () {
        let alreadyHasUpdateBtn =
          this.querySelector(".btn-wrap.torn-bazaar-fill-qty-price") != null;
        if (!alreadyHasUpdateBtn) {
          insertFillAndWaveBtn(this, updateItemsLabels, pages.ManageItems);
        }
      });

    insertUpdateAllButton();
  }

  function scheduleScan() {
    if (!scanScheduled) {
      scanScheduled = true;
      requestAnimationFrame(scanAndInject);
    }
  }

  const observer = new MutationObserver(function (mutations) {
    for (const m of mutations) {
      if (m.addedNodes.length || m.removedNodes.length) {
        scheduleScan();
        return;
      }
    }
  });
  observer.observe(observerTarget, observerConfig);

  // Self-heal across tab navigation. Hash changes when switching #/add, #/manage, #/personalize, #/.
  window.addEventListener("hashchange", scheduleScan);

  // Belt-and-braces: tab-link clicks. The old aria-labelledby IDs are now dynamic
  // (e.g. link-aria-label-1) so we delegate on the stable `href` instead.
  $(document).on(
    "click",
    'div[class*="topSection___"] a[href="#/add"], ' +
      'div[class*="topSection___"] a[href="#/manage"], ' +
      'div[class*="topSection___"] a[href="#/personalize"], ' +
      'div[class*="topSection___"] a[href="#/"]',
    scheduleScan,
  );

  // Initial pass — rows may already be in the DOM at script start (run-at: document-idle).
  scheduleScan();

  function insertFillAndWaveBtn(element, buttonLabels, pageType) {
    const waveDiv = document.createElement("div");
    waveDiv.className = "wave";

    const outerSpanFill = document.createElement("span");
    outerSpanFill.className = "btn-wrap torn-bazaar-fill-qty-price";
    const outerSpanClear = document.createElement("span");
    outerSpanClear.className = "btn-wrap torn-bazaar-clear-qty-price";

    const innerSpanFill = document.createElement("span");
    innerSpanFill.className = "btn";
    const innerSpanClear = document.createElement("span");
    innerSpanClear.className = "btn";
    innerSpanClear.style.display = "none";

    const inputElementFill = document.createElement("input");
    inputElementFill.type = "button";
    inputElementFill.value = buttonLabels[0];
    inputElementFill.className = "torn-btn";
    const inputElementClear = document.createElement("input");
    inputElementClear.type = "button";
    inputElementClear.value = buttonLabels[1];
    inputElementClear.className = "torn-btn";

    innerSpanFill.appendChild(inputElementFill);
    innerSpanClear.appendChild(inputElementClear);
    outerSpanFill.appendChild(innerSpanFill);
    outerSpanClear.appendChild(innerSpanClear);

    element.append(outerSpanFill, outerSpanClear, waveDiv);

    switch (pageType) {
      case pages.AddItems:
        $(outerSpanFill).on("click", "input", function (event) {
          if (!checkApiKey()) {
            event.stopPropagation();
            return;
          }
          this.parentNode.style.display = "none";
          fillQuantityAndPrice(this, pageType);
          event.stopPropagation();
        });

        $(outerSpanClear).on("click", "input", function (event) {
          this.parentNode.style.display = "none";
          clearQuantityAndPrice(this);
          event.stopPropagation();
        });
        break;
      case pages.ManageItems:
        $(outerSpanFill).on("click", "input", function (event) {
          if (!checkApiKey()) {
            event.stopPropagation();
            return;
          }
          updatePrice(this);
          event.stopPropagation();
        });
        break;
    }
  }

  function insertUpdateAllButton() {
    if (document.querySelector(".btn-wrap.torn-bazaar-update-all-prices"))
      return;

    let updateButtons = getManageUpdateButtons();
    if (updateButtons.length === 0) return;

    const outerSpan = document.createElement("span");
    outerSpan.className = "btn-wrap torn-bazaar-update-all-prices";

    const innerSpan = document.createElement("span");
    innerSpan.className = "btn";

    const inputElement = document.createElement("input");
    inputElement.type = "button";
    inputElement.value = "Update all prices";
    inputElement.className = "torn-btn";

    innerSpan.appendChild(inputElement);
    outerSpan.appendChild(innerSpan);

    let target = findUpdateAllButtonTarget(updateButtons[0]);
    target.appendChild(outerSpan);

    $(outerSpan).on("click", "input", function (event) {
      if (!checkApiKey()) {
        event.stopPropagation();
        return;
      }
      updateAllPrices(this);
      event.stopPropagation();
    });
  }

  function findUpdateAllButtonTarget(firstUpdateButton) {
    let saveButton = Array.from(
      document.querySelectorAll("input, button"),
    ).find((element) =>
      /^save changes$/i.test(
        (element.value || element.textContent || "").trim(),
      ),
    );

    if (saveButton && saveButton.parentElement) {
      return saveButton.parentElement.parentElement || saveButton.parentElement;
    }

    let manageHeader = Array.from(
      document.querySelectorAll("div, h4, h5"),
    ).find((element) => /manage your bazaar/i.test(element.textContent || ""));

    if (manageHeader && manageHeader.parentElement) {
      return manageHeader.parentElement;
    }

    return (
      firstUpdateButton.closest(
        'div[class*="row___"], div[data-testid="sortable-item"], li.clearfix',
      )?.parentElement ||
      document.querySelector(".content-wrapper") ||
      document.body
    );
  }

  function getManageUpdateButtons() {
    return Array.from(
      document.querySelectorAll(
        'span.torn-bazaar-fill-qty-price input[value="Update"]',
      ),
    ).filter((button) => button.isConnected && button.offsetParent !== null);
  }

  function getUpdateButtonKey(updateButton) {
    if (updateButton.dataset.tornBazaarUpdateAllKey) {
      return updateButton.dataset.tornBazaarUpdateAllKey;
    }

    let row = updateButton.closest(
      'div[class*="row___"], div[data-testid="sortable-item"], li.clearfix',
    );
    if (row && row.dataset.tornBazaarUpdateAllKey) {
      updateButton.dataset.tornBazaarUpdateAllKey =
        row.dataset.tornBazaarUpdateAllKey;
      return row.dataset.tornBazaarUpdateAllKey;
    }

    let image = row && row.querySelector("div[class*=imgContainer___] img");
    let itemId = getItemIdFromImage(image);
    let rowText = row ? row.textContent.replace(/\s+/g, " ").trim() : "";

    return `${itemId}:${rowText}`;
  }

  function setUpdateButtonKey(updateButton, key) {
    updateButton.dataset.tornBazaarUpdateAllKey = key;
    let row = updateButton.closest(
      'div[class*="row___"], div[data-testid="sortable-item"], li.clearfix',
    );
    if (row) {
      row.dataset.tornBazaarUpdateAllKey = key;
    }
  }

  function findManageScrollContainer(firstUpdateButton) {
    let row = firstUpdateButton.closest(
      'div[class*="row___"], div[data-testid="sortable-item"], li.clearfix',
    );
    let element = row ? row.parentElement : null;

    while (element && element !== document.body) {
      if (element.scrollHeight > element.clientHeight + 20) {
        return element;
      }
      element = element.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  function getScrollTop(scrollContainer) {
    return scrollContainer === document.body ||
      scrollContainer === document.documentElement
      ? window.scrollY
      : scrollContainer.scrollTop;
  }

  function getMaxScrollTop(scrollContainer) {
    if (
      scrollContainer === document.body ||
      scrollContainer === document.documentElement
    ) {
      return Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      ) - window.innerHeight;
    }

    return scrollContainer.scrollHeight - scrollContainer.clientHeight;
  }

  function scrollManageContainer(scrollContainer) {
    if (
      scrollContainer === document.body ||
      scrollContainer === document.documentElement
    ) {
      window.scrollBy(0, Math.max(window.innerHeight * 0.75, 300));
      return;
    }

    scrollContainer.scrollTop += Math.max(
      scrollContainer.clientHeight * 0.75,
      300,
    );
  }

  function setScrollTop(scrollContainer, scrollTop) {
    if (
      scrollContainer === document.body ||
      scrollContainer === document.documentElement
    ) {
      window.scrollTo(0, scrollTop);
      return;
    }

    scrollContainer.scrollTop = scrollTop;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function updateAllPrices(button) {
    if (button.dataset.running === "true") return;

    let updateButtons = getManageUpdateButtons();
    if (updateButtons.length === 0) {
      button.value = "No visible items";
      await sleep(800);
      button.value = "Update all prices";
      return;
    }

    button.dataset.running = "true";
    button.disabled = true;

    try {
      let completed = 0;
      let seenRows = new Set();
      let idleScrolls = 0;
      let scrollContainer = findManageScrollContainer(updateButtons[0]);
      let initialScrollTop = getScrollTop(scrollContainer);

      while (idleScrolls < 2) {
        let visibleKeyCounts = {};
        let visibleButtons = getManageUpdateButtons().filter(
          (updateButton) => {
            let baseKey = getUpdateButtonKey(updateButton);
            visibleKeyCounts[baseKey] = (visibleKeyCounts[baseKey] || 0) + 1;
            let key = updateButton.dataset.tornBazaarUpdateAllKey
              ? baseKey
              : `${baseKey}#${visibleKeyCounts[baseKey]}`;
            setUpdateButtonKey(updateButton, key);
            if (seenRows.has(key)) {
              return false;
            }
            seenRows.add(key);
            return true;
          },
        );

        for (let i = 0; i < visibleButtons.length; i += updateAllConcurrency) {
          let batch = visibleButtons.slice(i, i + updateAllConcurrency);
          button.value = `Updating ${completed}/${seenRows.size}`;

          await Promise.all(
            batch.map((updateButton) =>
              Promise.resolve(updatePrice(updateButton))
                .catch((error) =>
                  console.error(
                    "[TornBazaarFiller] Failed to update row:",
                    error,
                  ),
                )
                .finally(() => {
                  completed++;
                  button.value = `Updating ${completed}/${seenRows.size}`;
                }),
            ),
          );

          if (i + updateAllConcurrency < visibleButtons.length) {
            await sleep(updateAllBatchDelayMs);
          }
        }

        let beforeScrollTop = getScrollTop(scrollContainer);
        let maxScrollTop = getMaxScrollTop(scrollContainer);

        if (beforeScrollTop >= maxScrollTop - 5) {
          break;
        }

        scrollManageContainer(scrollContainer);
        await sleep(updateAllScrollDelayMs);

        let afterScrollTop = getScrollTop(scrollContainer);
        idleScrolls = afterScrollTop <= beforeScrollTop + 5 ? idleScrolls + 1 : 0;
      }

      setScrollTop(scrollContainer, initialScrollTop);
      button.value = "Update all prices";
    } finally {
      button.disabled = false;
      button.dataset.running = "false";
    }
  }

  function insertPercentageSpan(element) {
    let moneyGroupDiv = element.querySelector(
      "div.price div.input-money-group",
    );

    if (!moneyGroupDiv) {
      return null;
    }

    if (moneyGroupDiv.querySelector("span.overlay-percentage") === null) {
      const percentageSpan = document.createElement("span");
      percentageSpan.className = "overlay-percentage overlay-percentage-add";
      moneyGroupDiv.appendChild(percentageSpan);
    }

    return moneyGroupDiv.querySelector("span.overlay-percentage");
  }

  function insertPercentageManageSpan(element) {
    let moneyGroupDiv = element.querySelector("div.input-money-group");

    if (!moneyGroupDiv) {
      return null;
    }

    if (moneyGroupDiv.querySelector("span.overlay-percentage") === null) {
      const percentageSpan = document.createElement("span");
      percentageSpan.className = "overlay-percentage overlay-percentage-manage";
      moneyGroupDiv.appendChild(percentageSpan);
    }

    return moneyGroupDiv.querySelector("span.overlay-percentage");
  }

  function insertDatasetSpan(container, triggerElement) {
    let datasetParent = null;

    if (triggerElement) {
      datasetParent =
        triggerElement.parentElement?.parentElement?.parentElement || null;
    }

    let moneyGroupDiv =
      container.querySelector("div.price div.input-money-group") ||
      container.querySelector("div.input-money-group");

    if (!datasetParent && moneyGroupDiv) {
      datasetParent = moneyGroupDiv.parentElement || container;
    }

    if (!datasetParent) {
      return null;
    }

    if (
      datasetParent.querySelector(":scope > span.torn-bazaar-price-dataset") ===
      null
    ) {
      const datasetSpan = document.createElement("span");
      datasetSpan.className = "torn-bazaar-price-dataset";
      datasetParent.appendChild(datasetSpan);
    }

    return datasetParent.querySelector(
      ":scope > span.torn-bazaar-price-dataset",
    );
  }

  function formatPriceDataset(result) {
    if (!result) {
      return "";
    }

    let marketBounds =
      Number.isFinite(result.marketValue) && result.marketValue > 0
        ? ` | market ${result.marketValue} | bounds ${result.marketMinPrice}-${result.marketMaxPrice}`
        : "";
    let clamp =
      result.clampedToMarketBounds && result.rawLowBallPrice !== result.lowBallPrice
        ? ` | clamped ${result.rawLowBallPrice}->${result.lowBallPrice}`
        : "";

    if (!result.filteredPrices) {
      return `Market value pricing | fill ${result.lowBallPrice}${marketBounds}${clamp}`;
    }

    let prices = result.filteredPrices
      .slice(0, 8)
      .map(formatDatasetListing)
      .join(", ");
    let suffix =
      result.filteredPrices.length > 8
        ? ` +${result.filteredPrices.length - 8}`
        : "";
    let minPrice = Math.min(
      ...result.filteredPrices.map((listing) => listing.price),
    );
    let maxPrice = Math.max(
      ...result.filteredPrices.map((listing) => listing.price),
    );
    let range = `range ${minPrice}-${maxPrice}`;
    let ignored =
      result.ignoredPrices && result.ignoredPrices.length > 0
        ? ` | ignored ${result.ignoredPrices.map(formatDatasetListing).join(", ")}`
        : "";

    let sample =
      Number.isFinite(result.sourceListingCount) &&
      result.sourceListingCount > result.sampledListingCount
        ? `sample first ${result.sampledListingCount}/${result.sourceListingCount}`
        : `sample ${result.sampledListingCount}`;

    return `TornW3B rank pricing | ${sample} | used [${prices}${suffix}] | ${range} | ref ${Math.round(result.referencePrice)} | fill ${result.lowBallPrice}${marketBounds}${clamp}${ignored}`;
  }

  function formatDatasetListing(listing) {
    return `${listing.price}${listing.source === "itemmarket" ? "m" : "b"}`;
  }

  function updateDatasetDisplay(container, result, triggerElement) {
    let datasetSpan = insertDatasetSpan(container, triggerElement);
    if (!datasetSpan) return;

    let datasetText = formatPriceDataset(result);
    let referencePrice = Number.isFinite(result.referencePrice)
      ? result.referencePrice
      : result.marketValue;
    datasetSpan.textContent = `data ${Math.round(referencePrice)} -> ${result.lowBallPrice}`;
    datasetSpan.dataset.detail = datasetText;
    datasetSpan.title = datasetText;
  }

  function fillQuantityAndPrice(element, pageType) {
    let amountDiv =
      element.parentElement.parentElement.parentElement.parentElement.parentElement.querySelector(
        "div.amount-main-wrap",
      );
    if (!amountDiv) {
      console.warn("[TornBazaarFiller] Amount container not found");
      return;
    }

    let priceInputs = amountDiv.querySelectorAll("div.price div input");
    let keyupEvent = new Event("keyup", { bubbles: true });
    let inputEvent = new Event("input", { bubbles: true });

    let image =
      element.parentElement.parentElement.parentElement.parentElement.querySelector(
        "div.image-wrap img",
      );
    let extractedItemId = getItemIdFromImage(image);

    let wave =
      element.parentElement.parentElement.parentElement.querySelector(
        "div.wave",
      );
    wave.style.animation = "none";
    wave.offsetHeight;
    wave.style.animation = null;
    wave.style.backgroundColor = "transparent";
    wave.style.animationDuration = "1s";

    return calculatePrice(extractedItemId)
      .then((result) => {
        if (!result) return;
        let lowBallPrice = result.lowBallPrice;
        applyPriceComparison(result, insertPercentageSpan(amountDiv), wave);
        updateDatasetDisplay(amountDiv, result, element);

        setPriceInputs(priceInputs, lowBallPrice, inputEvent);

        let isQuantityCheckbox =
          amountDiv.querySelector("div.amount.choice-container") !== null;
        if (isQuantityCheckbox) {
          let quantityCheckbox = amountDiv.querySelector(
            "div.amount.choice-container input",
          );
          if (quantityCheckbox) {
            quantityCheckbox.click();
          }
        } else {
          let quantityInput = amountDiv.querySelector("div.amount input");
          if (!quantityInput) {
            console.warn("[TornBazaarFiller] Quantity input not found");
            return;
          }
          quantityInput.value = getQuantity(element, pageType);
          quantityInput.dispatchEvent(keyupEvent);
        }
      })
      .catch((error) => {
        wave.style.backgroundColor = "red";
        wave.style.animationDuration = "5s";
        handlePricingError(error, wave);
      })
      .finally(() => {
        let clearButton = element.parentNode.parentNode.parentNode.querySelector(
          "span.btn-wrap.torn-bazaar-clear-qty-price span.btn",
        );
        if (clearButton) {
          clearButton.style.display = "inline-block";
        }
      });
  }

  function updatePrice(element) {
    let moneyGroupDiv;
    let parentNode4 = element.parentNode.parentNode.parentNode.parentNode;
    if (isMobileView) {
      if (
        parentNode4.querySelector(
          "[class*=menuActivators___] button[class*=iconContainer___][aria-label=Manage] span[class*=active___]",
        ) == null
      ) {
        let manageButton = parentNode4.querySelector(
          "[class*=menuActivators___] button[class*=iconContainer___][aria-label=Manage]",
        );
        if (!manageButton) {
          console.warn("[TornBazaarFiller] Mobile manage button not found.");
          return;
        }
        manageButton.click();
      }
      moneyGroupDiv = parentNode4.parentNode.querySelector(
        "[class*=bottomMobileMenu___] [class*=priceMobile___]",
      );
      if (moneyGroupDiv == null) {
        console.warn(
          "[TornBazaarFiller] Mobile price container not found — '[class*=bottomMobileMenu___] [class*=priceMobile___]' returned null. Mobile DOM may have changed.",
        );
        return;
      }
    } else {
      moneyGroupDiv =
        element.parentNode.parentNode.parentNode.parentNode.querySelector(
          "div[class*=price___]",
        );
    }
    if (!moneyGroupDiv) {
      console.warn("[TornBazaarFiller] Price container not found.");
      return;
    }

    let priceInputs = moneyGroupDiv.querySelectorAll(
      "div.input-money-group input",
    );
    let inputEvent = new Event("input", { bubbles: true });

    let image =
      element.parentElement.parentElement.parentElement.parentElement.querySelector(
        "div[class*=imgContainer___] img",
      );
    let extractedItemId = getItemIdFromImage(image);

    let wave =
      element.parentElement.parentElement.parentElement.querySelector(
        "div.wave",
      );
    wave.style.animation = "none";
    wave.offsetHeight;
    wave.style.animation = null;
    wave.style.backgroundColor = "transparent";
    wave.style.animationDuration = "1s";

    return calculatePrice(extractedItemId)
      .then((result) => {
        if (!result) return;
        let lowBallPrice = result.lowBallPrice;
        applyPriceComparison(
          result,
          insertPercentageManageSpan(moneyGroupDiv),
          wave,
        );
        updateDatasetDisplay(moneyGroupDiv, result, element);

        setPriceInputs(priceInputs, lowBallPrice, inputEvent);
      })
      .catch((error) => {
        wave.style.backgroundColor = "red";
        wave.style.animationDuration = "5s";
        handlePricingError(error, wave);
      })
      .finally(() => {
        // element.parentNode.parentNode.parentNode.querySelector("span.btn-wrap.torn-bazaar-clear-qty-price span.btn").style.display = "inline-block";
      });
  }

  function clearQuantityAndPrice(element) {
    let amountDiv =
      element.parentElement.parentElement.parentElement.parentElement.parentElement.querySelector(
        "div.amount-main-wrap",
      );
    if (!amountDiv) {
      console.warn("[TornBazaarFiller] Amount container not found");
      return;
    }

    let priceInputs = amountDiv.querySelectorAll("div.price div input");
    let keyupEvent = new Event("keyup", { bubbles: true });
    let inputEvent = new Event("input", { bubbles: true });

    let wave =
      element.parentElement.parentElement.parentElement.querySelector(
        "div.wave",
      );
    wave.style.backgroundColor = "white";

    let isQuantityCheckbox =
      amountDiv.querySelector("div.amount.choice-container") !== null;
    if (isQuantityCheckbox) {
      let quantityCheckbox = amountDiv.querySelector(
        "div.amount.choice-container input",
      );
      if (quantityCheckbox) {
        quantityCheckbox.click();
      }
    } else {
      let quantityInput = amountDiv.querySelector("div.amount input");
      if (quantityInput) {
        quantityInput.value = "";
        quantityInput.dispatchEvent(keyupEvent);
      }
    }

    priceInputs.forEach((input) => {
      input.value = "";
    });
    if (priceInputs[0]) {
      priceInputs[0].dispatchEvent(inputEvent);
    }

    wave.style.animation = "none";
    wave.offsetHeight;
    wave.style.animation = null;

    let fillButton = element.parentNode.parentNode.parentNode.querySelector(
      "span.btn-wrap.torn-bazaar-fill-qty-price span.btn",
    );
    if (fillButton) {
      fillButton.style.display = "inline-block";
    }
  }

  function getQuantity(element, pageType) {
    let rgx = /x(\d+)$/;
    let rgxMobile = /^x(\d+)/;
    let quantityText = 0;
    switch (pageType) {
      case pages.AddItems:
        quantityText = element.parentNode.parentNode.parentNode.innerText;
        break;
      case pages.ManageItems:
        quantityText =
          element.parentNode.parentNode.parentNode.querySelector("span")
            ?.innerText || "";
        break;
    }
    let match = isMobileView
      ? rgxMobile.exec(quantityText)
      : rgx.exec(quantityText);
    let quantity = match === null ? 1 : match[1];
    return quantity;
  }

  function getItemIdFromImage(image) {
    if (!image || !image.src) {
      console.warn("[TornBazaarFiller] Item image not found");
      return 0;
    }

    let numberPattern = /\/(\d+)\//;
    let match = image.src.match(numberPattern);
    if (match) {
      return parseInt(match[1], 10);
    }

    console.warn("[TornBazaarFiller] ItemId not found");
    return 0;
  }

  function setPriceInputs(priceInputs, price, inputEvent) {
    if (!priceInputs || priceInputs.length === 0) {
      throw new Error("[TornBazaarFiller] Price input not found");
    }

    priceInputs.forEach((input) => {
      input.value = price;
    });
    priceInputs[0].dispatchEvent(inputEvent);
    priceInputs[0].dispatchEvent(new Event("change", { bubbles: true }));
  }

  function parsePricingFormula() {
    let firstTagIndex = priceDeltaRaw.indexOf("[");
    let operation =
      firstTagIndex === -1
        ? priceDeltaRaw
        : priceDeltaRaw.substring(0, firstTagIndex);
    operation = operation.trim() || "-1";

    let source = "combined";
    let slotOffset = 0;
    let tagPattern = /\[([^\]]+)\]/g;
    let match;

    while ((match = tagPattern.exec(priceDeltaRaw)) !== null) {
      let tag = match[1].trim().toLowerCase();
      let tagParts = tag.split(":");
      let tagName = tagParts[0].trim();

      if (tagName === "market") {
        source = "market";
      } else if (
        tagName === "combined" ||
        tagName === "bazaar" ||
        tagName === "itemmarket"
      ) {
        source = tagName;
        if (tagParts.length > 1 && tagParts[1].trim() !== "") {
          slotOffset = parseInt(tagParts[1].trim(), 10);
        }
      } else if (/^\d+$/.test(tagName)) {
        slotOffset = parseInt(tagName, 10);
      }
    }

    if (!Number.isFinite(slotOffset) || slotOffset < 0) {
      slotOffset = 0;
    }

    return { operation, source, slotOffset };
  }

  function fetchJson(url) {
    return new Promise((resolve, reject) => {
      let requestOptions = {
        method: "GET",
        url,
        timeout: 15000,
        onload: (response) => {
          try {
            if (response.status >= 200 && response.status < 300) {
              resolve(JSON.parse(response.responseText));
            } else {
              reject(
                new Error(
                  `Request failed with status ${response.status}: ${url}`,
                ),
              );
            }
          } catch (error) {
            reject(error);
          }
        },
        onerror: reject,
        ontimeout: () => reject(new Error(`Request timed out: ${url}`)),
      };

      if (typeof GM_xmlhttpRequest === "function") {
        GM_xmlhttpRequest(requestOptions);
        return;
      }

      if (
        typeof GM !== "undefined" &&
        typeof GM.xmlHttpRequest === "function"
      ) {
        GM.xmlHttpRequest(requestOptions);
        return;
      }

      fetch(url)
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              `Request failed with status ${response.status}: ${url}`,
            );
          }
          return response.json();
        })
        .then(resolve)
        .catch(reject);
    });
  }

  function validateTornApiResponse(data) {
    if (data && data.error != null && data.error.code === 2) {
      apiKey = null;
      localStorage.removeItem("silmaril-torn-bazaar-filler-apikey");
      let error = new Error("[TornBazaarFiller] Incorrect Api Key");
      error.apiKeyInvalid = true;
      error.data = data;
      throw error;
    }
  }

  function getMarketValue(itemId) {
    let requestUrl = itemUrl
      .replace("{itemId}", itemId)
      .replace("{apiKey}", apiKey);

    return fetchJson(requestUrl).then((data) => {
      validateTornApiResponse(data);
      let marketValue = Number(
        data.items && data.items[itemId] && data.items[itemId].market_value,
      );
      if (!Number.isFinite(marketValue) || marketValue <= 0) {
        throw new Error("[TornBazaarFiller] Market value not found");
      }
      return marketValue;
    });
  }

  function clampPriceToMarketBounds(price, marketValue) {
    let marketMinPrice = Math.ceil(marketValue * minimumMarketValueRatio);
    let marketMaxPrice = Math.floor(marketValue * maximumMarketValueRatio);
    let clampedPrice = Math.min(Math.max(price, marketMinPrice), marketMaxPrice);

    return {
      lowBallPrice: clampedPrice,
      rawLowBallPrice: price,
      marketValue,
      marketMinPrice,
      marketMaxPrice,
      clampedToMarketBounds: clampedPrice !== price,
    };
  }

  function normalizeItemMarketListings(data, itemId) {
    validateTornApiResponse(data);

    if (!data.itemmarket || !Array.isArray(data.itemmarket.listings)) {
      console.warn(
        "[TornBazaarFiller] Item market listings unavailable:",
        data,
      );
      return [];
    }

    if (data.itemmarket.item && data.itemmarket.item.id != itemId) {
      console.warn(
        "[TornBazaarFiller] Item market API returned a different item:",
        data.itemmarket.item,
      );
    }

    return data.itemmarket.listings
      .map((listing) => ({
        source: "itemmarket",
        price: Number(listing.price),
        quantity: Number(listing.quantity || 1),
      }))
      .filter((listing) => Number.isFinite(listing.price) && listing.price > 0);
  }

  function normalizeBazaarListings(data) {
    if (!data || !Array.isArray(data.listings)) {
      console.warn("[TornBazaarFiller] Bazaar listings unavailable:", data);
      return [];
    }

    return data.listings
      .map((listing) => ({
        source: "bazaar",
        price: Number(listing.price),
        quantity: Number(listing.quantity || 1),
      }))
      .filter((listing) => Number.isFinite(listing.price) && listing.price > 0);
  }

  function getListingsForPricing(itemId, source) {
    if (source === "itemmarket") {
      let itemMarketRequest = fetchJson(
        marketUrl.replace("{itemId}", itemId).replace("{apiKey}", apiKey),
      );
      return itemMarketRequest.then((data) =>
        normalizeItemMarketListings(data, itemId),
      );
    }

    if (source === "bazaar") {
      let bazaarRequest = fetchJson(
        weav3rMarketplaceUrl.replace("{itemId}", itemId),
      );
      return bazaarRequest.then(normalizeBazaarListings);
    }

    let itemMarketRequest = fetchJson(
      marketUrl.replace("{itemId}", itemId).replace("{apiKey}", apiKey),
    );
    let bazaarRequest = fetchJson(
      weav3rMarketplaceUrl.replace("{itemId}", itemId),
    );

    return Promise.allSettled([itemMarketRequest, bazaarRequest]).then(
      (results) => {
        let listings = [];

        if (results[0].status === "fulfilled") {
          listings = listings.concat(
            normalizeItemMarketListings(results[0].value, itemId),
          );
        } else {
          console.warn(
            "[TornBazaarFiller] Item market request failed:",
            results[0].reason,
          );
        }

        if (results[1].status === "fulfilled") {
          listings = listings.concat(normalizeBazaarListings(results[1].value));
        } else {
          console.warn(
            "[TornBazaarFiller] Bazaar request failed, using item market only:",
            results[1].reason,
          );
        }

        return listings;
      },
    );
  }

  function filterCheapOutliers(listings) {
    if (listings.length < 4) {
      return { listings, ignoredListings: [] };
    }

    let prices = listings.map((listing) => listing.price).sort((a, b) => a - b);
    let clusterIndex = Math.min(3, prices.length - 1);
    let clusterPrice = prices[clusterIndex];
    let q1 = median(prices.slice(0, Math.floor(prices.length / 2)));
    let q3 = median(prices.slice(Math.ceil(prices.length / 2)));
    let iqr = q3 - q1;

    if (
      !Number.isFinite(clusterPrice) ||
      clusterPrice <= 0 ||
      !Number.isFinite(iqr)
    ) {
      return { listings, ignoredListings: [] };
    }

    let minimumReasonablePrice = Math.max(clusterPrice * 0.7, q1 - iqr * 1.25);
    let filteredListings = listings.filter(
      (listing) =>
        listing.price >= minimumReasonablePrice || listing.quantity > 2,
    );
    let ignoredListings = listings.filter(
      (listing) =>
        listing.price < minimumReasonablePrice && listing.quantity <= 2,
    );

    if (
      filteredListings.length !== listings.length &&
      filteredListings.length > 0
    ) {
      console.warn(
        `[TornBazaarFiller] Ignored ${listings.length - filteredListings.length} cheap outlier listing(s). ` +
          `Reference price: ${clusterPrice}, minimum accepted: ${Math.round(minimumReasonablePrice)}.`,
      );
      return { listings: filteredListings, ignoredListings };
    }

    return { listings, ignoredListings: [] };
  }

  function median(numbers) {
    if (!numbers || numbers.length === 0) {
      return Number.NaN;
    }

    let sorted = numbers.slice().sort((a, b) => a - b);
    let middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  }

  function selectTornW3BReferenceListing(listings, slotOffset) {
    if (slotOffset > 0 || listings.length < 2) {
      return listings[Math.min(slotOffset, listings.length - 1)];
    }

    let cumulativeQuantity = listings[0].quantity || 1;
    for (let i = 1; i < Math.min(listings.length, 8); i++) {
      let previousPrice = listings[i - 1].price;
      let currentPrice = listings[i].price;
      let priceGap = currentPrice - previousPrice;
      let gapPercent = priceGap / previousPrice;

      if (priceGap >= 100 && gapPercent >= 0.03 && cumulativeQuantity <= 250) {
        console.warn(
          `[TornBazaarFiller] Pricing into price gap: ${previousPrice} -> ${currentPrice}, ` +
            `stock before gap: ${cumulativeQuantity}.`,
        );
        return listings[i];
      }

      cumulativeQuantity += listings[i].quantity || 1;
    }

    return listings[0];
  }

  function calculatePrice(itemId) {
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return Promise.reject(new Error("[TornBazaarFiller] Invalid item id"));
    }

    let formula = parsePricingFormula();

    if (formula.source === "market") {
      return getMarketValue(itemId).then((price) => {
        let rawLowBallPrice = calculateFinalPrice(price, formula.operation);
        return {
          ...clampPriceToMarketBounds(rawLowBallPrice, price),
          comparisonPrice: null,
          source: formula.source,
        };
      });
    }

    return Promise.all([
      getListingsForPricing(itemId, formula.source),
      getMarketValue(itemId),
    ]).then(([listings, marketValue]) => {
      listings.sort((a, b) => a.price - b.price);
      let bazaarListings = listings.filter(
        (listing) => listing.source === "bazaar",
      );
      let sourceListings = bazaarListings.length > 0 ? bazaarListings : listings;
      let pricingListings = sourceListings.slice(0, pricingListingLimit);
      let filteredResult = filterCheapOutliers(pricingListings);
      pricingListings = filteredResult.listings;

      if (pricingListings.length === 0) {
        throw new Error("[TornBazaarFiller] No usable listings found");
      }

      let referenceListing = selectTornW3BReferenceListing(
        pricingListings,
        formula.slotOffset,
      );
      let comparisonListing =
        pricingListings[Math.min(2, pricingListings.length - 1)];
      let rawLowBallPrice = calculateFinalPrice(
        referenceListing.price,
        formula.operation,
      );

      return {
        ...clampPriceToMarketBounds(rawLowBallPrice, marketValue),
        comparisonPrice: comparisonListing.price,
        source: formula.source,
        referencePrice: referenceListing.price,
        referenceListing,
        filteredPrices: pricingListings,
        ignoredPrices: filteredResult.ignoredListings,
        sourceListingCount: sourceListings.length,
        sampledListingCount: Math.min(
          sourceListings.length,
          pricingListingLimit,
        ),
      };
    });
  }

  function applyPriceComparison(result, percentageOverlaySpan, wave) {
    if (!result.comparisonPrice) {
      if (percentageOverlaySpan) {
        percentageOverlaySpan.style.display = "none";
      }
      wave.style.backgroundColor = "green";
      return;
    }

    let priceCoefficient = (
      (result.lowBallPrice / result.comparisonPrice) *
      100
    ).toFixed(0);

    if (priceCoefficient <= 95) {
      if (percentageOverlaySpan) {
        percentageOverlaySpan.style.display = "block";
      }
      if (priceCoefficient <= 50) {
        if (percentageOverlaySpan) {
          percentageOverlaySpan.style.color = "red";
        }
        wave.style.backgroundColor = "red";
        wave.style.animationDuration = "5s";
      } else if (priceCoefficient <= 75) {
        if (percentageOverlaySpan) {
          percentageOverlaySpan.style.color = "yellow";
        }
        wave.style.backgroundColor = "yellow";
        wave.style.animationDuration = "3s";
      } else {
        if (percentageOverlaySpan) {
          percentageOverlaySpan.style.color = "green";
        }
        wave.style.backgroundColor = "green";
      }
      if (percentageOverlaySpan) {
        percentageOverlaySpan.innerText = priceCoefficient + "%";
      }
    } else {
      if (percentageOverlaySpan) {
        percentageOverlaySpan.style.display = "none";
      }
      wave.style.backgroundColor = "green";
    }
  }

  function calculateFinalPrice(referencePrice, operation) {
    return Math.max(1, Math.round(performOperation(referencePrice, operation)));
  }

  function handlePricingError(error, wave) {
    wave.style.backgroundColor = "red";
    wave.style.animationDuration = "5s";
    if (error && error.apiKeyInvalid) {
      console.error("[TornBazaarFiller] Incorrect Api Key:", error.data);
      return;
    }
    console.error("[TornBazaarFiller] Error fetching data:", error);
  }

  function performOperation(number, operation) {
    // Parse the operation string to extract the operator and value
    const match = operation.match(/^([-+]?)(\d+(?:\.\d+)?)(%)?$/);

    if (!match) {
      throw new Error("Invalid operation string");
    }

    const [, operator, operand, isPercentage] = match;
    const operandValue = parseFloat(operand);

    // Check for percentage and convert if necessary
    const adjustedOperand = isPercentage
      ? (number * operandValue) / 100
      : operandValue;

    // Perform the operation based on the operator
    switch (operator) {
      case "":
      case "+":
        return number + adjustedOperand;
      case "-":
        return number - adjustedOperand;
      default:
        throw new Error("Invalid operator");
    }
  }

  function setPriceDelta() {
    let userInput = prompt(
      "Enter price delta formula. Examples: -1, -5, -1[2], -1[bazaar:2], -1[itemmarket:2], -1[market]. Default source uses TornW3B bazaar rank pricing: target rank #1 after ignoring tiny cheap dumps, then apply delta:",
      priceDeltaRaw,
    );
    if (userInput !== null) {
      priceDeltaRaw = userInput;
      localStorage.setItem(
        "silmaril-torn-bazaar-filler-price-delta",
        userInput,
      );
    } else {
      console.error("[TornBazaarFiller] User cancelled the Price Delta input.");
    }
  }

  function checkApiKey(checkExisting = true) {
    if (!checkExisting || !apiKey || apiKey.length !== 16) {
      let userInput = prompt(
        "Please enter a PUBLIC Api Key, it will be used to get current bazaar prices:",
        apiKey && apiKey.length === 16 ? apiKey : "",
      );
      let normalizedApiKey = userInput === null ? "" : userInput.trim();
      if (normalizedApiKey.length === 16) {
        apiKey = normalizedApiKey;
        localStorage.setItem(
          "silmaril-torn-bazaar-filler-apikey",
          normalizedApiKey,
        );
        return true;
      } else {
        apiKey = null;
        localStorage.removeItem("silmaril-torn-bazaar-filler-apikey");
        console.error("[TornBazaarFiller] User cancelled the Api Key input.");
        return false;
      }
    }

    return true;
  }
})();
