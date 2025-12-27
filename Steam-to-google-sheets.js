// ==UserScript==
// @name         Steam Trade to Google Sheets
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Syncs Steam trades to Sheets. Supports Metal decimals, History Bastard, and Profile Links.
// @author       You
// @match        https://steamcommunity.com/*/tradehistory*
// @match        https://steamcommunity.com/id/*/tradehistory*
// @match        https://steamcommunity.com/profiles/*/tradehistory*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIGURATION ---
    const BUTTON_ID = 'steam-sync-sheets-btn';
    const BTN_STYLE = "background: #66c0f4; color: black; padding: 10px 20px; border: none; cursor: pointer; margin-bottom: 15px; font-weight: bold; border-radius: 2px;";

    // --- HELPER: WEBHOOK URL ---
    function getWebhookUrl() {
        let url = GM_getValue("sheetWebhookUrl", "");
        if (!url) {
            url = prompt("Please paste your Google Web App URL (Setup in Apps Script):");
            if (url) GM_setValue("sheetWebhookUrl", url.trim());
        }
        return url;
    }

    GM_registerMenuCommand("Reset Webhook URL", () => {
        GM_setValue("sheetWebhookUrl", "");
        alert("URL reset. Reload page and click Sync.");
    });

    // --- HELPER: METAL CONVERSION ---
    function normalizeMetal(itemList) {
        let metalTotal = 0.0;
        const nonMetalItems = [];
        itemList.forEach(name => {
            if (name === "Refined Metal") metalTotal += 1.0;
            else if (name === "Reclaimed Metal") metalTotal += 0.33;
            else if (name === "Scrap Metal") metalTotal += 0.11;
            else nonMetalItems.push(name);
        });
        if (metalTotal > 0) {
            nonMetalItems.push(`(x${parseFloat(metalTotal.toFixed(2))}) Metal`);
        }
        return nonMetalItems;
    }

    // --- MAIN LOGIC: PARSING ---
    function scrapeTrades() {
        const trades = [];
        const rows = document.querySelectorAll('.tradehistoryrow');

        console.log(`Found ${rows.length} trade rows.`);

        rows.forEach((row, index) => {
            try {
                // 1. Date & Time
                const dateBlock = row.querySelector('.tradehistory_date');
                let date = "", time = "";
                if (dateBlock) {
                    const timeDiv = dateBlock.querySelector('.tradehistory_timestamp');
                    if (timeDiv) time = timeDiv.innerText.trim();
                    date = dateBlock.innerText.replace(time, "").trim();
                }

                // 2. Partner (Name AND URL)
                const eventDesc = row.querySelector('.tradehistory_event_description');
                let partner = "Unknown";
                let partnerUrl = "";

                if (eventDesc) {
                    const link = eventDesc.querySelector('a');
                    if (link) {
                        partner = link.innerText.replace(/['"]+/g, ''); // Remove quotes
                        partnerUrl = link.href; // Get the profile URL
                    }
                }

                // 3. Items
                let rawReceived = [];
                let rawGiven = [];
                const allItems = row.querySelectorAll('.history_item');

                allItems.forEach(item => {
                    const nameEl = item.querySelector('.history_item_name');
                    if (!nameEl) return;

                    const rawName = nameEl.innerText.trim();

                    // Quantity (Decimals for History Bastard)
                    const qtyEl = item.querySelector('.nx');
                    const qty = qtyEl ? parseFloat(qtyEl.innerText.trim()) : 1;
                    const finalName = qty !== 1 ? `(x${qty}) ${rawName}` : rawName;

                    // Direction
                    const itemId = item.id || "";
                    let isReceived = false;

                    if (itemId.includes('received')) isReceived = true;
                    else if (itemId.includes('given')) isReceived = false;
                    else {
                        const container = item.closest('.tradehistory_items');
                        if (container) {
                            const signDiv = container.querySelector('.tradehistory_items_plusminus');
                            const sign = signDiv ? signDiv.innerText.trim() : "";
                            if (sign === "+" || sign === "") isReceived = true;
                        }
                    }

                    if (isReceived) rawReceived.push(finalName);
                    else rawGiven.push(finalName);
                });

                const itemsReceived = normalizeMetal(rawReceived);
                const itemsGiven = normalizeMetal(rawGiven);

                trades.push({
                    date: date,
                    time: time,
                    partner: partner,
                    partnerUrl: partnerUrl, // Sending the URL now
                    itemsGiven: itemsGiven,
                    itemsReceived: itemsReceived
                });
            } catch (err) {
                console.error(`Error parsing row ${index}:`, err);
            }
        });

        return trades;
    }

    // --- NETWORK ---
    function sendData(trades, btn) {
        const url = getWebhookUrl();
        if (!url) return;

        GM_xmlhttpRequest({
            method: "POST",
            url: url,
            data: JSON.stringify(trades),
            headers: { "Content-Type": "application/json" },
            onload: function(response) {
                if (response.status === 200 || response.status === 302) {
                    btn.innerText = "Sync Complete!";
                    setTimeout(() => { btn.innerText = "Sync to Google Sheets"; }, 3000);
                } else {
                    console.error("Sync Error:", response);
                    btn.innerText = "Error (See Console)";
                }
            },
            onerror: function(err) {
                console.error("Network Error", err);
                btn.innerText = "Network Error";
            }
        });
    }

    // --- INIT ---
    function init() {
        const header = document.querySelector('.tradehistory_content');
        if (header && !document.getElementById(BUTTON_ID)) {
            const btn = document.createElement('button');
            btn.id = BUTTON_ID;
            btn.innerText = "Sync to Google Sheets";
            btn.style = BTN_STYLE;
            header.insertBefore(btn, header.firstChild);

            btn.addEventListener('click', () => {
                btn.innerText = "Scanning...";
                const trades = scrapeTrades();
                if (trades.length === 0) {
                    alert("No trades found.");
                    btn.innerText = "Sync to Google Sheets";
                    return;
                }
                btn.innerText = `Syncing ${trades.length} trades...`;
                sendData(trades, btn);
            });
        }
    }

    window.addEventListener('load', init);
    const checkInterval = setInterval(() => {
        if (document.querySelector('.tradehistoryrow')) {
            init();
            clearInterval(checkInterval);
        }
    }, 1000);

})();