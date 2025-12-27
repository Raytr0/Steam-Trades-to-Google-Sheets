function doPost(e) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = JSON.parse(e.postData.contents);

    const lastRow = sheet.getLastRow();
    let existingSignatures = new Set();

    // 1. Load existing trades
    // getValues() retrieves the *display value*, so even if it's a hyperlink later,
    // it returns the name (e.g., "Bob"), allowing our duplicate check to still work.
    if (lastRow > 1) {
        const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
        values.forEach(row => existingSignatures.add(row[0] + "|" + row[1] + "|" + row[2]));
    }

    const newRows = [];

    // 2. Process Data
    data.reverse().forEach(trade => {
        const signature = trade.date + "|" + trade.time + "|" + trade.partner;

        if (!existingSignatures.has(signature)) {
            const givenString = summarizeItems(trade.itemsGiven);
            const receivedString = summarizeItems(trade.itemsReceived);

            // --- HYPERLINK LOGIC ---
            // If we have a URL, write the spreadsheet formula. Otherwise, just text.
            let partnerCell = trade.partner;
            if (trade.partnerUrl) {
                // Escape double quotes in the name to prevent formula errors
                const safeName = trade.partner.replace(/"/g, '""');
                partnerCell = `=HYPERLINK("${trade.partnerUrl}", "${safeName}")`;
            }

            newRows.push([trade.date, trade.time, partnerCell, givenString, receivedString]);
            existingSignatures.add(signature);
        }
    });

    // 3. Save
    if (newRows.length > 0) {
        sheet.getRange(lastRow + 1, 1, newRows.length, 5).setValues(newRows);
        return ContentService.createTextOutput(JSON.stringify({result: "success", added: newRows.length}));
    } else {
        return ContentService.createTextOutput(JSON.stringify({result: "success", added: 0}));
    }
}

// --- HELPER: ITEM COUNTING ---
function summarizeItems(items) {
    if (!items || items.length === 0) return "";
    const counts = {};
    items.forEach(item => {
        let name = item;
        let qty = 1.0;
        const match = item.match(/^\(x([\d\.]+)\)\s+(.+)$/);
        if (match) {
            qty = parseFloat(match[1]);
            name = match[2];
        }
        counts[name] = (counts[name] || 0) + qty;
    });
    return Object.entries(counts).map(([name, count]) => {
        const niceCount = Number.isInteger(count) ? count : parseFloat(count.toFixed(2));
        return niceCount !== 1 ? `${name} (x${niceCount})` : name;
    }).join(", ");
}