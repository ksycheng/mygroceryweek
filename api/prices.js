export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const serperKey = process.env.SERPER_KEY;
  const { prompt, system, mode, items, postal, budget, itemName, searchResults } = req.body;

  // ── SEARCH MODE ────────────────────────────────────────────────────
  if (mode === "search" && items && postal && serperKey) {
    try {
      const city = getCity(postal.replace(/\s/g, "").toUpperCase());
      const postalClean = postal.replace(/\s/g, "").toUpperCase();
      const itemList = Array.isArray(items) ? items : items.split(",").map(s => s.trim());
      const cleanedItems = [...new Set(itemList.map(cleanItemName))];

      // Search all items in parallel: Flipp first, then Shopping fallback
      const [itemResults, storeResults] = await Promise.all([
        Promise.all(cleanedItems.map(item => Promise.all([
          flippSearch(item, postalClean),           // Primary: real flyer prices
          shoppingSearch(item, serperKey),           // Fallback: Google Shopping
          webSearch(item + ' price canada grocery 2025', serperKey), // Last resort
        ]))),
        Promise.all([
          webSearch('Walmart Loblaws "No Frills" "Real Canadian Superstore" grocery store ' + city + ' Ontario address hours', serperKey),
          webSearch('Costco Metro Sobeys FreshCo "Food Basics" grocery store ' + city + ' Ontario address hours', serperKey),
        ])
      ]);

      const itemSnippets = {};
      cleanedItems.forEach((item, idx) => {
        const combined = itemResults[idx].flat();
        const flippCount = itemResults[idx][0].length;
        console.log(item + ": Flipp=" + flippCount + " Shopping=" + itemResults[idx][1].length + " Web=" + itemResults[idx][2].length);
        itemSnippets[item] = combined.slice(0, 15).map(r => (r.title + ": " + r.snippet).substring(0, 300)).join("\n");
      });

      return res.status(200).json({
        itemSnippets,
        storeSnippets: storeResults.flat().slice(0, 12).map(r => (r.title + ": " + r.snippet).substring(0, 250)).join("\n"),
        city, cleanedItems, originalItems: itemList
      });
    } catch (err) {
      console.error("Search error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── ANALYZE MODE ───────────────────────────────────────────────────
  if (mode === "analyze" && searchResults && postal) {
    try {
      const { itemSnippets, storeSnippets, city, cleanedItems } = searchResults;
      const budgetAmt = budget || 200;

      // Run all batches in PARALLEL
      const BATCH = 4;
      const batches = [];
      for (let i = 0; i < cleanedItems.length; i += BATCH) batches.push(cleanedItems.slice(i, i + BATCH));
      console.log("Parallel batches:", batches.length, "for", cleanedItems.length, "items");

      const batchResults = await Promise.all(batches.map(async (batchItems, bi) => {
        const priceContext = batchItems.map(item => "=== " + item + " ===\n" + (itemSnippets[item] || "No results")).join("\n\n");
        try {
          const aiResp = await callAI(
            "Extract grocery prices from search results. Return ONLY valid JSON.",
            buildAnalyzePrompt(batchItems, priceContext, storeSnippets, city, postal, budgetAmt),
            groqKey, geminiKey, 1500
          );
          if (!aiResp) return [];
          const clean = aiResp.replace(/```json|```/g, "").replace(/[\r\n]+/g, " ").trim();
          const items = extractPriceItems(clean, bi);
          console.log("Batch", bi, "found", items.length, "prices");
          return items.filter(p => p.name && p.store && p.price > 0);
        } catch(e) { console.error("Batch", bi, "err:", e.message); return []; }
      }));

      const allPrices = batchResults.flat();
      console.log("Raw prices:", allPrices.length, allPrices.map(p=>p.name+"@"+p.store+"=$"+p.price).join(", "));

      return res.status(200).json({ text: JSON.stringify(await buildResult(allPrices, city, budget, postal)) });
    } catch (err) {
      console.error("Analyze error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PRICES MODE (combined search+analyze) ─────────────────────────
  if (mode === "prices" && items && postal && serperKey) {
    try {
      const city = getCity(postal.replace(/\s/g, "").toUpperCase());
      const postalClean = postal.replace(/\s/g, "").toUpperCase();
      const itemList = Array.isArray(items) ? items : items.split(",").map(s => s.trim());
      const cleanedItems = [...new Set(itemList.map(cleanItemName))];
      const budgetAmt = budget || 200;

      const [itemResults, storeResults] = await Promise.all([
        Promise.all(cleanedItems.map(item => Promise.all([
          flippSearch(item, postalClean),
          shoppingSearch(item, serperKey),
          webSearch(item + ' price canada grocery 2025', serperKey),
        ]))),
        Promise.all([
          webSearch('Walmart Loblaws "No Frills" "Real Canadian Superstore" grocery store ' + city + ' Ontario address hours', serperKey),
          webSearch('Costco Metro Sobeys FreshCo "Food Basics" grocery store ' + city + ' Ontario address hours', serperKey),
        ])
      ]);

      const itemSnippets = {};
      cleanedItems.forEach((item, idx) => {
        itemSnippets[item] = itemResults[idx].flat().slice(0, 15).map(r => (r.title + ": " + r.snippet).substring(0, 300)).join("\n");
      });
      const storeSnippets = storeResults.flat().slice(0, 12).map(r => (r.title + ": " + r.snippet).substring(0, 250)).join("\n");

      const BATCH_P = 4;
      const batchesP = [];
      for (let i = 0; i < cleanedItems.length; i += BATCH_P) batchesP.push(cleanedItems.slice(i, i + BATCH_P));
      const batchResultsP = await Promise.all(batchesP.map(async (batchItems, bi) => {
        const priceContext = batchItems.map(item => "=== " + item + " ===\n" + (itemSnippets[item] || "No results")).join("\n\n");
        try {
          const aiResp = await callAI(
            "Extract grocery prices from search results. Return ONLY valid JSON.",
            buildAnalyzePrompt(batchItems, priceContext, storeSnippets, city, postal, budgetAmt),
            groqKey, geminiKey, 1500
          );
          if (!aiResp) return [];
          const clean = aiResp.replace(/```json|```/g, "").replace(/[\r\n]+/g, " ").trim();
          return extractPriceItems(clean, bi).filter(p => p.name && p.store && p.price > 0);
        } catch(e) { console.error("PricesBatch", bi, "err:", e.message); return []; }
      }));

      const allPricesP = batchResultsP.flat();
      console.log("Prices mode raw:", allPricesP.length, allPricesP.map(p=>p.name+"@"+p.store).join(", "));
      return res.status(200).json({ text: JSON.stringify(await buildResult(allPricesP, city, budgetAmt, postal)) });
    } catch (err) {
      console.error("Prices error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── WISHLIST MODE ─────────────────────────────────────────────────
  if (mode === "wishlist" && itemName && postal && serperKey) {
    try {
      const city = getCity(postal.replace(/\s/g, "").toUpperCase());
      const postalClean = postal.replace(/\s/g, "").toUpperCase();
      const [flippResults, shoppingResults, webResults] = await Promise.all([
        flippSearch(itemName, postalClean),
        shoppingSearch(itemName, serperKey),
        webSearch(itemName + ' price canada grocery store', serperKey),
      ]);
      const snippets = [...flippResults, ...shoppingResults, ...webResults]
        .slice(0, 12).map(r => r.title + ": " + r.snippet).join("\n");

      const aiResp = await callAI(
        "Extract grocery price from search results. Return ONLY valid JSON, no markdown.",
        'Search results for "' + itemName + '" near ' + city + ', Ontario:\n\n' + snippets + '\n\nExtract the best current price. Return ONLY: {"currentPrice":2.99,"regularPrice":3.49,"onSale":true,"saleStore":"No Frills","address":null,"hours":null,"saleEnds":null,"savings":0.50,"source":"snippet source","note":"brief note"}',
        groqKey, geminiKey, 500
      );
      const clean = (aiResp || "").replace(/```json|```/g, "").replace(/[\r\n]+/g, " ").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return res.status(200).json({ currentPrice: 0, note: "No price found" });
      return res.status(200).json(JSON.parse(match[0]));
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── STANDARD AI (meals, dishes, suggestions) ──────────────────────
  try {
    const text = await callAI(
      system || "You are a helpful assistant.",
      prompt || "",
      groqKey, geminiKey, 1500, true
    );
    return res.status(200).json({ text: text.replace(/[\r\n]+/g, " ").trim() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ── FLIPP API ──────────────────────────────────────────────────────
// Flipp aggregates real weekly flyers from all major Canadian grocery chains
async function flippSearch(item, postal) {
  try {
    const url = "https://backflipp.wishabi.com/flipp/items/search?locale=en-ca&postal_code=" + postal + "&q=" + encodeURIComponent(item);
    const r = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; MyGroceryWeek/1.0)"
      }
    });
    if (!r.ok) { console.log("Flipp HTTP error:", r.status, "for", item); return []; }
    const data = await r.json();
    const flippItems = (data.items || []).slice(0, 8);
    if (flippItems.length === 0) { console.log("Flipp: no results for", item); return []; }
    return flippItems.map(fi => ({
      title: (fi.merchant || "Store") + ": " + (fi.name || item),
      snippet: (fi.name || item) + " - $" + (fi.current_price || fi.sale_price || "?") +
        " at " + (fi.merchant || "store") +
        (fi.valid_to ? " (sale ends " + fi.valid_to.substring(0,10) + ")" : "") +
        (fi.pre_price ? " (was $" + fi.pre_price + ")" : "")
    }));
  } catch(e) { console.log("Flipp error for", item, ":", e.message); return []; }
}

// ── HELPER: extract price items from AI response ───────────────────
function extractPriceItems(clean, bi) {
  let items = [];
  try {
    const objMatch = clean.match(/\{[\s\S]*\}/);
    if (objMatch) {
      const parsed = JSON.parse(objMatch[0]);
      items = parsed.perItemPrices || [];
    }
  } catch(e) {
    // Truncated JSON - use regex to extract whatever completed
    const matches = clean.matchAll(/"name"\s*:\s*"([^"]+)"[^}]*"store"\s*:\s*"([^"]+)"[^}]*"price"\s*:\s*([\d.]+)/g);
    for (const m of matches) {
      if (m[2] !== "store" && parseFloat(m[3]) > 0) {
        items.push({ name: m[1], store: m[2], price: parseFloat(m[3]) });
      }
    }
  }
  if (items.length === 0) {
    const arrMatch = clean.match(/\[[\s\S]*?\]/);
    if (arrMatch) { try { items = JSON.parse(arrMatch[0]); } catch(e) {} }
  }
  return items;
}

// ── HELPER: build result object from prices ────────────────────────
async function buildResult(allPrices, city, budgetAmt, postal) {
  const placesKey = process.env.GOOGLE_PLACES_KEY;

  // Cheapest price per item - use case-insensitive matching
  const itemNames = [...new Set(allPrices.map(p => p.name.toLowerCase()))];
  const cheapestPerItem = {};
  itemNames.forEach(nameLower => {
    const options = allPrices.filter(p => p.name.toLowerCase() === nameLower);
    if (options.length > 0) {
      const best = options.reduce((best, p) => p.price < best.price ? p : best);
      cheapestPerItem[nameLower] = best;
    }
  });
  console.log("Cheapest per item:", Object.keys(cheapestPerItem).length, "items:", Object.keys(cheapestPerItem).join(", "));

  // Build store info - enrich with Places API in parallel
  const storeInfo = {};
  allPrices.forEach(p => {
    if (p.store && !storeInfo[p.store]) storeInfo[p.store] = { address: null, hours: null };
  });
  await Promise.all(Object.keys(storeInfo).map(async store => {
    const place = await getStoreAddress(store, city, placesKey);
    storeInfo[store] = place || { address: city + ", ON", hours: null };
  }));

  // Group by store
  const storeGroups = {};
  Object.values(cheapestPerItem).forEach(p => {
    if (!storeGroups[p.store]) storeGroups[p.store] = [];
    storeGroups[p.store].push(p);
  });
  const sortedStores = Object.entries(storeGroups).sort((a, b) => b[1].length - a[1].length);

  const buildCombo = (storeNames, rank, label, tip) => {
    const breakdown = storeNames.map(store => {
      const its = storeGroups[store] || [];
      return { store, items: its.map(p => p.name + " - $" + p.price.toFixed(2) + (p.source ? " (" + p.source + ")" : "")), subtotal: +its.reduce((s,p)=>s+p.price,0).toFixed(2) };
    });
    return {
      rank, label,
      stores: storeNames.map(s => ({ name: s, address: (storeInfo[s]||{}).address||(city+", ON"), hours: (storeInfo[s]||{}).hours||null })),
      totalCAD: +breakdown.reduce((s,b)=>s+b.subtotal,0).toFixed(2),
      savingsVsWorst: 0, trips: storeNames.length, breakdown, tip
    };
  };

  const combinations = [];
  if (sortedStores.length >= 1) {
    combinations.push(buildCombo([sortedStores[0][0]], 1, "Best single store", "All found prices at the cheapest store. Always verify in-store."));
    if (sortedStores.length >= 2 && sortedStores[1][1].length > 0) {
      combinations.push(buildCombo([sortedStores[0][0], sortedStores[1][0]], 2, "More items (2 stores)", "Covers more items across two stores."));
      if (sortedStores.length >= 3 && sortedStores[2][1].length > 0) {
        combinations.push(buildCombo([sortedStores[0][0], sortedStores[1][0], sortedStores[2][0]], 3, "Most coverage (3 stores)", "Maximum item coverage — most trips required."));
      }
    }
  }

  const worst = Math.max(...combinations.map(c => c.totalCAD), 0);
  const best = Math.min(...combinations.map(c => c.totalCAD), 0);
  combinations.forEach(c => { c.savingsVsWorst = +(c.totalCAD - best).toFixed(2); });

  const validPrices = Object.values(cheapestPerItem);
  const totalCAD = validPrices.reduce((s, p) => s + p.price, 0);

  return {
    combinations, budgetCAD: budgetAmt,
    withinBudget: totalCAD <= budgetAmt,
    overBy: Math.max(0, +(totalCAD - budgetAmt).toFixed(2)),
    perItemPrices: validPrices,
    saleItems: validPrices.filter(p => p.onSale).map(p => p.name),
    priceNote: "Prices from Flipp weekly flyers + Google Shopping. Flyer prices are from actual store flyers this week. Always verify in-store."
  };
}

// ── BUILD ANALYZE PROMPT ───────────────────────────────────────────
function buildAnalyzePrompt(cleanedItems, priceContext, storeSnippets, city, postal, budgetAmt) {
  return "SEARCH RESULTS (Flipp flyers + Google Shopping + web):\n" + priceContext +
    "\n\nFor each item, find its price in the results above." +
    "\nItems: " + cleanedItems.join(", ") +
    "\n\nRules:" +
    "\n- Flipp results format: 'StoreName: ItemName - $X.XX at StoreName' — these are real flyer prices, use them" +
    "\n- Shopping results format: 'StoreName: ItemName - $X.XX at StoreName'" +
    "\n- Use the lowest price found for each item" +
    "\n- store: exact store name (Walmart/No Frills/Metro/Loblaws/Costco/Sobeys/FreshCo/Food Basics)" +
    "\n- If no price found, omit the item entirely" +
    "\n- Return compact JSON only:\n" +
    '{"perItemPrices":[{"name":"item","store":"Walmart","price":2.99,"onSale":false}]}';
}

// ── CLEAN ITEM NAME ────────────────────────────────────────────────
function cleanItemName(item) {
  return item
    .replace(/^\d+x?\s+/i, "")
    .replace(/^\d+\s*\/\s*\d+\s+/i, "")
    .replace(/^[\d.]+\s*(cups?|tbsp|tsp|tablespoons?|teaspoons?|pounds?|lbs?|kg|g|oz|ml|l|liters?|litres?|slices?|cloves?|pieces?|cans?|boxes?|bags?|bunches?|heads?|stalks?|sheets?)\\s+/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .trim();
}

// ── GET CITY FROM POSTAL ───────────────────────────────────────────
function getCity(p) {
  const m = {
    "L6C":"Markham","L6B":"Markham","L6E":"Markham","L6G":"Markham","L3R":"Markham","L3S":"Markham","L3T":"Markham",
    "M1B":"Scarborough","M1C":"Scarborough","M1E":"Scarborough","M1G":"Scarborough","M1H":"Scarborough","M1J":"Scarborough",
    "M1K":"Scarborough","M1L":"Scarborough","M1M":"Scarborough","M1N":"Scarborough","M1P":"Scarborough","M1R":"Scarborough",
    "M1S":"Scarborough","M1T":"Scarborough","M1V":"Scarborough","M1W":"Scarborough","M1X":"Scarborough",
    "M2H":"North York","M2J":"North York","M2K":"North York","M2L":"North York","M2M":"North York","M2N":"North York","M2P":"North York","M2R":"North York",
    "M3A":"North York","M3B":"North York","M3C":"North York","M3H":"North York","M3J":"North York","M3K":"North York","M3L":"North York","M3M":"North York","M3N":"North York",
    "M4A":"East York","M4B":"East York","M4C":"East York","M4E":"East End Toronto","M4G":"Leaside","M4H":"East York","M4J":"East York","M4K":"East York",
    "M4L":"East End Toronto","M4M":"East End Toronto","M4N":"Lawrence Park","M4P":"Davisville","M4R":"North Toronto","M4S":"Davisville",
    "M4T":"Midtown Toronto","M4V":"Forest Hill","M4W":"Rosedale","M4X":"Cabbagetown","M4Y":"Church-Yonge Corridor",
    "M5A":"Downtown Toronto","M5B":"Downtown Toronto","M5C":"Downtown Toronto","M5E":"Downtown Toronto","M5G":"Downtown Toronto",
    "M5H":"Downtown Toronto","M5J":"Downtown Toronto","M5K":"Downtown Toronto","M5L":"Downtown Toronto","M5M":"Bedford Park",
    "M5N":"Lawrence Park","M5P":"Forest Hill","M5R":"Annex","M5S":"University of Toronto","M5T":"Kensington Market","M5V":"Downtown Toronto",
    "M6A":"Lawrence Heights","M6B":"Glencairn","M6C":"Humewood","M6E":"Caledonia","M6G":"Christie","M6H":"Dufferin Grove",
    "M6J":"Trinity Bellwoods","M6K":"Parkdale","M6L":"Maple Leaf","M6M":"Mount Dennis","M6N":"Runnymede","M6P":"High Park","M6R":"Roncesvalles","M6S":"Swansea",
    "M8V":"Etobicoke","M8W":"Etobicoke","M8X":"Etobicoke","M8Y":"Etobicoke","M8Z":"Etobicoke",
    "M9A":"Etobicoke","M9B":"Etobicoke","M9C":"Etobicoke","M9L":"Humber Summit","M9M":"Humber Summit","M9N":"Weston","M9P":"Humberlea","M9R":"Kingsview Village","M9V":"Etobicoke","M9W":"Etobicoke",
    "L4B":"Richmond Hill","L4C":"Richmond Hill","L4E":"Richmond Hill","L4S":"Richmond Hill",
    "L3Y":"Newmarket","L3X":"Newmarket","L9N":"Newmarket",
    "L4J":"Thornhill","L4K":"Vaughan","L4L":"Vaughan","L6A":"Maple","L6K":"Oakville","L6L":"Oakville",
    "L5A":"Mississauga","L5B":"Mississauga","L5C":"Mississauga","L5E":"Mississauga","L5G":"Mississauga","L5H":"Mississauga",
    "L5J":"Mississauga","L5K":"Mississauga","L5L":"Mississauga","L5M":"Mississauga","L5N":"Mississauga","L5R":"Mississauga",
    "L5S":"Mississauga","L5T":"Mississauga","L5V":"Mississauga","L5W":"Mississauga","L4T":"Mississauga","L4V":"Mississauga",
    "L4W":"Mississauga","L4X":"Mississauga","L4Y":"Mississauga","L4Z":"Mississauga",
    "L7A":"Brampton","L6P":"Brampton","L6R":"Brampton","L6S":"Brampton","L6T":"Brampton","L6V":"Brampton","L6W":"Brampton","L6X":"Brampton","L6Y":"Brampton","L6Z":"Brampton",
  };
  return m[p.slice(0,3)] || "Toronto";
}

// ── WEB SEARCH ─────────────────────────────────────────────────────
async function webSearch(query, serperKey) {
  try {
    const r = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": serperKey },
      body: JSON.stringify({ q: query, gl: "ca", hl: "en", num: 8 })
    });
    const data = await r.json();
    const organic = (data.organic || []).slice(0, 8).map(r => ({ title: r.title || "", snippet: r.snippet || "" }));
    const ab = data.answerBox ? [{ title: "Answer", snippet: data.answerBox.snippet || data.answerBox.answer || "" }] : [];
    return [...ab, ...organic];
  } catch(e) { return []; }
}

// ── SHOPPING SEARCH ────────────────────────────────────────────────
async function shoppingSearch(item, serperKey) {
  try {
    const r = await fetch("https://google.serper.dev/shopping", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": serperKey },
      body: JSON.stringify({ q: item + " grocery Canada", gl: "ca", hl: "en", num: 10 })
    });
    const data = await r.json();
    return (data.shopping || []).slice(0, 10)
      .filter(s => s.price)
      .map(s => ({
        title: (s.source || "Store") + ": " + (s.title || item),
        snippet: (s.title || item) + " - " + s.price + " at " + (s.source || "store")
      }));
  } catch(e) { return []; }
}

// ── GOOGLE PLACES ──────────────────────────────────────────────────
async function getStoreAddress(storeName, city, placesKey) {
  if (!placesKey) return null;
  try {
    const query = encodeURIComponent(storeName + " grocery store " + city + " Ontario");
    const searchUrl = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=" + query + "&inputtype=textquery&fields=place_id,formatted_address&key=" + placesKey;
    const [searchRes] = await Promise.all([fetch(searchUrl)]);
    const searchData = await searchRes.json();
    const candidate = searchData?.candidates?.[0];
    if (!candidate) return null;
    // Get hours
    const detailUrl = "https://maps.googleapis.com/maps/api/place/details/json?place_id=" + candidate.place_id + "&fields=opening_hours&key=" + placesKey;
    const detailRes = await fetch(detailUrl);
    const detailData = await detailRes.json();
    const weekdayText = detailData?.result?.opening_hours?.weekday_text;
    const today = new Date().getDay();
    const todayHours = weekdayText ? weekdayText[today === 0 ? 6 : today - 1] : null;
    const hours = todayHours ? todayHours.replace(/^[^:]+:\s*/, "") : null;
    return { address: candidate.formatted_address || null, hours };
  } catch(e) { return null; }
}

// ── AI PROVIDERS ───────────────────────────────────────────────────
async function callGroq(system, prompt, apiKey, maxTokens, fast) {
  const models = fast ? ["llama-3.1-8b-instant", "gemma2-9b-it"] : ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
  for (const model of models) {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.1, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    });
    const data = await r.json();
    if (data.error) { console.error("Groq " + model + ":", data.error.message); continue; }
    const text = data?.choices?.[0]?.message?.content ?? null;
    if (text) return text;
  }
  return null;
}

async function callGemini(system, prompt, apiKey, maxTokens) {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens } }),
  });
  const data = await r.json();
  if (data.error) { console.error("Gemini:", data.error.message); return null; }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

async function callClaude(system, prompt, apiKey, maxTokens) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await r.json();
  if (data.error) { console.error("Claude:", data.error.message); return null; }
  return data?.content?.[0]?.text ?? null;
}

async function callOpenRouter(system, prompt, maxTokens) {
  const apiKey = process.env.OPENROUTER_KEY;
  if (!apiKey) return null;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey, "HTTP-Referer": "https://mygroceryweek.vercel.app", "X-Title": "MyGroceryWeek" },
      body: JSON.stringify({ model: "openrouter/auto", max_tokens: maxTokens, temperature: 0.1, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    });
    const data = await r.json();
    if (data.error) { console.error("OpenRouter:", data.error.message); return null; }
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (e) { return null; }
}

async function callMistral(system, prompt, maxTokens) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({ model: "open-mistral-nemo", max_tokens: maxTokens, temperature: 0.1, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    });
    clearTimeout(timeout);
    const data = await r.json();
    if (data.error) { console.error("Mistral error:", JSON.stringify(data.error)); return null; }
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (e) { console.error("Mistral timeout/error:", e.message); return null; }
}

async function callAI(system, prompt, groqKey, geminiKey, maxTokens, fast) {
  maxTokens = maxTokens || 2048;
  fast = fast || false;
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  const providers = [
    { name: "Mistral",    fn: () => callMistral(system, prompt, maxTokens) },
    { name: "Groq",       fn: () => groqKey   ? callGroq(system, prompt, groqKey, maxTokens, fast)   : null },
    { name: "Gemini",     fn: () => geminiKey  ? callGemini(system, prompt, geminiKey, maxTokens)     : null },
    { name: "Claude",     fn: () => claudeKey  ? callClaude(system, prompt, claudeKey, maxTokens)     : null },
    { name: "OpenRouter", fn: () => callOpenRouter(system, prompt, maxTokens) },
  ];
  for (const { name, fn } of providers) {
    try {
      const val = await fn();
      if (val && val.trim() !== "") return val;
      console.log(name + ": returned empty, trying next provider");
    } catch (err) { console.error(name + " failed:", err.message); }
  }
  throw new Error("All AI providers unavailable. Please try again in a few minutes.");
}
