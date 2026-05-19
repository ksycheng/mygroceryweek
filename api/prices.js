// Physical Canadian grocery chains only — no online stores
// Base Canadian grocery chains (always searched)
const BASE_STORES = [
  "Walmart", "Loblaws", "No Frills", "Real Canadian Superstore", "Superstore",
  "Metro", "Sobeys", "FreshCo", "Food Basics", "Costco",
  "Farm Boy", "Giant Tiger", "Bulk Barn", "Foodland",
  "IGA", "Zehrs", "Valu-mart", "Your Independent Grocer"
];

// Cuisine-specific specialty stores
const CUISINE_STORES = {
  "Asian":            ["T&T", "T&T Supermarket", "Nations Fresh Foods", "Foody Mart", "PAT Mart", "Oceans Fresh Food Market", "Sunny Foodmart", "Ample Food Market", "Galleria Supermarket", "Grand Fortune", "Well Come Food Mart"],
  "Japanese":         ["T&T", "Galleria Supermarket", "Sanko", "Fujiya"],
  "Thai":             ["T&T", "Nations Fresh Foods", "Foody Mart", "Thai grocery"],
  "Chinese":          ["T&T", "Nations Fresh Foods", "Foody Mart", "PAT Mart", "Grand Fortune", "Well Come Food Mart", "Sunny Foodmart"],
  "Korean":           ["Galleria Supermarket", "Hannam Supermarket", "PAT Mart", "Kim's Convenient"],
  "Indian":           ["Oceans Fresh Food Market", "Nations Fresh Foods", "Iqbal Foods", "Chalo FreshCo", "Spice Village", "Surati Sweet Mart"],
  "Mediterranean":    ["Oceans Fresh Food Market", "Iqbal Foods", "Middle East Bakery"],
  "Middle Eastern":   ["Oceans Fresh Food Market", "Iqbal Foods", "Halal Farms", "Hasty Market"],
  "Italian":          ["Commisso's", "Emilio's", "Italian store"],
  "Mexican":          ["No Frills", "Walmart", "Latin grocery"],
  "Vegetarian":       ["Farm Boy", "Whole Foods", "Nature's Emporium"],
  "Vegan":            ["Farm Boy", "Whole Foods", "Nature's Emporium"],
  "Keto/Low-carb":    ["Farm Boy", "Whole Foods", "Costco"],
};

function getStoresForCuisines(cuisines) {
  const extra = new Set();
  (cuisines || []).forEach(c => {
    // Match cuisine key
    const key = Object.keys(CUISINE_STORES).find(k => c.toLowerCase().includes(k.toLowerCase()));
    if (key) CUISINE_STORES[key].forEach(s => extra.add(s));
    // Also check Asian broadly
    if (["Japanese","Thai","Chinese","Korean","Asian"].some(a => c.includes(a))) {
      CUISINE_STORES["Asian"].forEach(s => extra.add(s));
    }
  });
  return [...BASE_STORES, ...extra];
}

// All physical stores for validation
const PHYSICAL_STORES = [
  ...BASE_STORES,
  ...Object.values(CUISINE_STORES).flat()
];

function isPhysicalStore(name, storeList) {
  if (!name) return false;
  const lower = name.toLowerCase();
  const list = storeList || PHYSICAL_STORES;
  return list.some(s => lower.includes(s.toLowerCase()));
}

function normalizeStore(name, storeList) {
  if (!name) return null;
  const lower = name.toLowerCase();
  const list = storeList || PHYSICAL_STORES;
  const match = list.find(s => lower.includes(s.toLowerCase()));
  return match || null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const serperKey = process.env.SERPER_KEY;
  const { prompt, system, mode, items, postal, budget, itemName, searchResults, cuisines } = req.body;
  const activeStores = getStoresForCuisines(cuisines);

  // ── SEARCH MODE ────────────────────────────────────────────────────
  if (mode === "search" && items && postal && serperKey) {
    try {
      const city = getCity(postal.replace(/\s/g, "").toUpperCase());
      const itemList = Array.isArray(items) ? items : items.split(",").map(s => s.trim());
      const cleanedItems = [...new Set(itemList.map(cleanItemName))];

      const [itemResults, storeResults] = await Promise.all([
        Promise.all(cleanedItems.map(item => Promise.all([
          shoppingSearch(item, serperKey),
          webSearch('"' + item + '" price (site:walmart.ca OR site:nofrills.ca OR site:metro.ca OR site:loblaws.ca OR site:sobeys.com OR site:realcanadiansuperstore.ca OR site:freshco.com OR site:foodbasics.ca OR site:tntsupermarket.com)', serperKey),
          webSearch('"' + item + '" price ' + activeStores.filter(s => !BASE_STORES.includes(s)).slice(0,5).map(s => '"'+s+'"').join(' OR ') + ' grocery canada', serperKey),
        ]))),
        Promise.all([
          webSearch('Walmart Loblaws "No Frills" "Real Canadian Superstore" grocery store ' + city + ' Ontario address hours', serperKey),
          webSearch('Costco Metro Sobeys FreshCo "Food Basics" grocery store ' + city + ' Ontario address hours', serperKey),
        ])
      ]);

      const itemSnippets = {};
      cleanedItems.forEach((item, i) => {
        const all = itemResults[i].flat();
        console.log(item + ": " + all.length + " results");
        itemSnippets[item] = all.slice(0, 15).map(r => (r.title + ": " + r.snippet).substring(0, 300)).join("\n");
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
      const BATCH = 4;
      const batches = [];
      for (let i = 0; i < cleanedItems.length; i += BATCH) batches.push(cleanedItems.slice(i, i + BATCH));
      console.log("Batches:", batches.length, "for", cleanedItems.length, "items");

      const batchResults = await Promise.all(batches.map(async (batchItems, bi) => {
        const priceContext = batchItems.map(item => "=== " + item + " ===\n" + (itemSnippets[item] || "")).join("\n\n");
        try {
          const aiResp = await callAI(
            "You extract grocery prices from search snippets. Return ONLY valid JSON.",
            buildPrompt(batchItems, priceContext, storeSnippets, city),
            groqKey, geminiKey, 1500
          );
          if (!aiResp) return [];
          const items = parseAIResponse(aiResp, bi);
          console.log("Batch", bi, "raw:", items.length, items.map(p => p.name + "@" + p.store).join(", "));
          return items.filter(p => p.name && p.price > 0 && isPhysicalStore(p.store));
        } catch(e) { console.error("Batch", bi, "err:", e.message); return []; }
      }));

      const allPrices = batchResults.flat().map(p => ({ ...p, store: normalizeStore(p.store) || p.store }));
      console.log("Physical store prices:", allPrices.length, allPrices.map(p => p.name + "@" + p.store + "=$" + p.price).join(", "));

      const result = await buildResult(allPrices, city, budgetAmt);
      return res.status(200).json({ text: JSON.stringify(result) });
    } catch (err) {
      console.error("Analyze error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PRICES MODE ────────────────────────────────────────────────────
  if (mode === "prices" && items && postal && serperKey) {
    try {
      const city = getCity(postal.replace(/\s/g, "").toUpperCase());
      const itemList = Array.isArray(items) ? items : items.split(",").map(s => s.trim());
      const cleanedItems = [...new Set(itemList.map(cleanItemName))];
      const budgetAmt = budget || 200;

      const [itemResults, storeResults] = await Promise.all([
        Promise.all(cleanedItems.map(item => Promise.all([
          shoppingSearch(item, serperKey),
          webSearch('"' + item + '" price (site:walmart.ca OR site:nofrills.ca OR site:metro.ca OR site:loblaws.ca OR site:sobeys.com OR site:realcanadiansuperstore.ca OR site:freshco.com OR site:foodbasics.ca OR site:tntsupermarket.com)', serperKey),
          webSearch('"' + item + '" price ' + activeStores.filter(s => !BASE_STORES.includes(s)).slice(0,5).map(s => '"'+s+'"').join(' OR ') + ' grocery canada', serperKey),
        ]))),
        Promise.all([
          webSearch('Walmart Loblaws "No Frills" "Real Canadian Superstore" grocery store ' + city + ' Ontario address hours', serperKey),
          webSearch('Costco Metro Sobeys FreshCo "Food Basics" grocery store ' + city + ' Ontario address hours', serperKey),
        ])
      ]);

      const itemSnippets = {};
      cleanedItems.forEach((item, i) => {
        itemSnippets[item] = itemResults[i].flat().slice(0, 15).map(r => (r.title + ": " + r.snippet).substring(0, 300)).join("\n");
      });
      const storeSnippets = storeResults.flat().slice(0, 12).map(r => (r.title + ": " + r.snippet).substring(0, 250)).join("\n");

      const BATCH = 4;
      const batches = [];
      for (let i = 0; i < cleanedItems.length; i += BATCH) batches.push(cleanedItems.slice(i, i + BATCH));

      const batchResults = await Promise.all(batches.map(async (batchItems, bi) => {
        const priceContext = batchItems.map(item => "=== " + item + " ===\n" + (itemSnippets[item] || "")).join("\n\n");
        try {
          const aiResp = await callAI(
            "You extract grocery prices from search snippets. Return ONLY valid JSON.",
            buildPrompt(batchItems, priceContext, storeSnippets, city),
            groqKey, geminiKey, 1500
          );
          if (!aiResp) return [];
          const its = parseAIResponse(aiResp, bi);
          return its.filter(p => p.name && p.price > 0 && isPhysicalStore(p.store));
        } catch(e) { return []; }
      }));

      const allPrices = batchResults.flat().map(p => ({ ...p, store: normalizeStore(p.store) || p.store }));
      console.log("Prices mode physical:", allPrices.length, allPrices.map(p => p.name + "@" + p.store + "=$" + p.price).join(", "));

      const result = await buildResult(allPrices, city, budgetAmt);
      return res.status(200).json({ text: JSON.stringify(result) });
    } catch (err) {
      console.error("Prices error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── WISHLIST MODE ──────────────────────────────────────────────────
  if (mode === "wishlist" && itemName && postal && serperKey) {
    try {
      const city = getCity(postal.replace(/\s/g, "").toUpperCase());
      const [shopping, web] = await Promise.all([
        shoppingSearch(itemName, serperKey),
        webSearch('"' + itemName + '" price (site:walmart.ca OR site:nofrills.ca OR site:metro.ca OR site:loblaws.ca)', serperKey),
      ]);
      const snippets = [...shopping, ...web].slice(0, 10).map(r => r.title + ": " + r.snippet).join("\n");
      const aiResp = await callAI(
        "Extract grocery price from snippets. Only use physical store prices. Return ONLY valid JSON.",
        'Price for "' + itemName + '" near ' + city + ':\n\n' + snippets + '\n\nReturn: {"currentPrice":2.99,"regularPrice":3.49,"onSale":true,"saleStore":"No Frills","address":null,"hours":null,"saleEnds":null,"savings":0.50,"source":"snippet source","note":"brief note"}',
        groqKey, geminiKey, 500
      );
      const clean = (aiResp || "").replace(/```json|```/g, "").replace(/[\r\n]+/g, " ").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return res.status(200).json({ currentPrice: 0, note: "No price found at physical stores" });
      return res.status(200).json(JSON.parse(match[0]));
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── STANDARD AI ────────────────────────────────────────────────────
  try {
    const text = await callAI(system || "You are a helpful assistant.", prompt || "", groqKey, geminiKey, 1500, true);
    return res.status(200).json({ text: text.replace(/[\r\n]+/g, " ").trim() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ── BUILD AI PROMPT ────────────────────────────────────────────────
function buildPrompt(items, priceContext, storeSnippets, city) {
  return "SEARCH RESULTS FROM CANADIAN GROCERY STORE WEBSITES:\n" + priceContext +
    "\n\nFor each item, find its price from a PHYSICAL grocery store in the search results." +
    "\nItems: " + items.join(", ") +
    "\n\nRules:" +
    "\n- ONLY use prices from physical stores: Walmart, No Frills, Loblaws, Metro, Sobeys, FreshCo, Food Basics, Costco, Real Canadian Superstore" +
    "\n- NEVER use online-only retailers, brand names, or unknown sources as the store" +
    "\n- Use the lowest price found from a physical store" +
    "\n- If no physical store price found for an item, omit it" +
    "\n- Return compact JSON:\n" +
    '{"perItemPrices":[{"name":"item","store":"Walmart","price":2.99,"onSale":false}]}';
}

// ── PARSE AI RESPONSE ──────────────────────────────────────────────
function parseAIResponse(raw, bi) {
  const clean = raw.replace(/```json|```/g, "").replace(/[\r\n]+/g, " ").trim();
  let items = [];
  try {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) { const p = JSON.parse(m[0]); items = p.perItemPrices || []; }
  } catch(e) {
    // Truncated - regex extract
    const matches = clean.matchAll(/"name"\s*:\s*"([^"]+)"[^}]*"store"\s*:\s*"([^"]+)"[^}]*"price"\s*:\s*([\d.]+)/g);
    for (const m of matches) items.push({ name: m[1], store: m[2], price: parseFloat(m[3]) });
  }
  if (!items.length) {
    const a = clean.match(/\[[\s\S]*?\]/);
    if (a) { try { items = JSON.parse(a[0]); } catch(e) {} }
  }
  return items;
}

// ── BUILD RESULT ───────────────────────────────────────────────────
async function buildResult(allPrices, city, budgetAmt) {
  const placesKey = process.env.GOOGLE_PLACES_KEY;

  // Cheapest price per item across all physical stores
  const byItem = {};
  allPrices.forEach(p => {
    const key = p.name.toLowerCase();
    if (!byItem[key] || p.price < byItem[key].price) byItem[key] = p;
  });
  const cheapest = Object.values(byItem);

  // Get store addresses + hours in parallel
  const storeNames = [...new Set(cheapest.map(p => p.store))];
  const storeInfo = {};
  await Promise.all(storeNames.map(async store => {
    const info = await getStoreAddress(store, city, placesKey);
    storeInfo[store] = info || { address: city + ", ON", hours: null };
  }));

  // Group by store
  const byStore = {};
  cheapest.forEach(p => {
    if (!byStore[p.store]) byStore[p.store] = [];
    byStore[p.store].push(p);
  });
  const sorted = Object.entries(byStore).sort((a, b) => b[1].length - a[1].length);

  // Build combinations
  const combos = [];
  const makeCombo = (stores, rank, label, tip) => {
    const breakdown = stores.map(([s, ps]) => ({
      store: s,
      items: ps.map(p => p.name + " - $" + p.price.toFixed(2)),
      subtotal: +ps.reduce((sum, p) => sum + p.price, 0).toFixed(2)
    }));
    return {
      rank, label,
      stores: stores.map(([s]) => ({ name: s, address: (storeInfo[s]||{}).address||(city+", ON"), hours: (storeInfo[s]||{}).hours||null })),
      totalCAD: +breakdown.reduce((sum, b) => sum + b.subtotal, 0).toFixed(2),
      savingsVsWorst: 0, trips: stores.length, breakdown, tip
    };
  };

  if (sorted.length >= 1) combos.push(makeCombo([sorted[0]], 1, "Best single store", "Cheapest single store for your list. Always verify prices in-store."));
  if (sorted.length >= 2 && sorted[1][1].length > 0) combos.push(makeCombo([sorted[0], sorted[1]], 2, "Best two stores", "Split your shop between two stores for more savings."));
  if (sorted.length >= 3 && sorted[2][1].length > 0) combos.push(makeCombo([sorted[0], sorted[1], sorted[2]], 3, "Best three stores", "Maximum coverage across three stores."));

  if (combos.length > 1) {
    const best = Math.min(...combos.map(c => c.totalCAD));
    combos.forEach(c => { c.savingsVsWorst = +(c.totalCAD - best).toFixed(2); });
  }

  const total = cheapest.reduce((sum, p) => sum + p.price, 0);
  return {
    combinations: combos,
    budgetCAD: budgetAmt,
    withinBudget: total <= budgetAmt,
    overBy: Math.max(0, +(total - budgetAmt).toFixed(2)),
    perItemPrices: cheapest,
    saleItems: cheapest.filter(p => p.onSale).map(p => p.name),
    priceNote: "Prices from physical Canadian grocery stores (Walmart, Loblaws, No Frills, Metro, Sobeys, FreshCo, Costco). Always verify in-store."
  };
}

// ── SHOPPING SEARCH (physical stores only) ─────────────────────────
async function shoppingSearch(item, serperKey) {
  try {
    const r = await fetch("https://google.serper.dev/shopping", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": serperKey },
      body: JSON.stringify({ q: item + " grocery store Canada", gl: "ca", hl: "en", num: 10 })
    });
    const data = await r.json();
    return (data.shopping || [])
      .filter(s => s.price && isPhysicalStore(s.source))
      .map(s => ({
        title: normalizeStore(s.source) + ": " + (s.title || item),
        snippet: (s.title || item) + " - " + s.price + " at " + normalizeStore(s.source)
      }));
  } catch(e) { return []; }
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

// ── GOOGLE PLACES ──────────────────────────────────────────────────
async function getStoreAddress(storeName, city, placesKey) {
  if (!placesKey) return null;
  try {
    const query = encodeURIComponent(storeName + " grocery store " + city + " Ontario");
    const searchRes = await fetch("https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=" + query + "&inputtype=textquery&fields=place_id,formatted_address&key=" + placesKey);
    const searchData = await searchRes.json();
    const candidate = searchData?.candidates?.[0];
    if (!candidate) return null;
    const detailRes = await fetch("https://maps.googleapis.com/maps/api/place/details/json?place_id=" + candidate.place_id + "&fields=opening_hours&key=" + placesKey);
    const detailData = await detailRes.json();
    const weekdayText = detailData?.result?.opening_hours?.weekday_text;
    const today = new Date().getDay();
    const todayHours = weekdayText?.[today === 0 ? 6 : today - 1];
    const hours = todayHours ? todayHours.replace(/^[^:]+:\s*/, "") : null;
    console.log("Places:", storeName, "->", candidate.formatted_address, hours);
    return { address: candidate.formatted_address || null, hours };
  } catch(e) { return null; }
}

// ── CLEAN ITEM NAME ────────────────────────────────────────────────
function cleanItemName(item) {
  return item
    .replace(/^\d+x?\s+/i, "")
    .replace(/^\d+\s*\/\s*\d+\s+/i, "")
    .replace(/^[\d.]+\s*(cups?|tbsp|tsp|pounds?|lbs?|kg|g|oz|ml|l|slices?|cloves?|pieces?|cans?|bags?|heads?)\s+/i, "")
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

// ── AI PROVIDERS ───────────────────────────────────────────────────
async function callGroq(system, prompt, apiKey, maxTokens, fast) {
  const models = fast ? ["llama-3.1-8b-instant","gemma2-9b-it"] : ["llama-3.3-70b-versatile","llama-3.1-8b-instant"];
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
    method: "POST", headers: { "Content-Type": "application/json" },
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
  } catch(e) { return null; }
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
  } catch(e) { console.error("Mistral timeout/error:", e.message); return null; }
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
    } catch(err) { console.error(name + " failed:", err.message); }
  }
  throw new Error("All AI providers unavailable. Please try again in a few minutes.");
}
