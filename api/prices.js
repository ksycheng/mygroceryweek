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

  // ── CALL 1: SEARCH ONLY — just fetch raw web results, no AI ──────
  if (mode === "search" && items && postal && serperKey) {
    try {
      const city = getCity(postal.replace(/\s/g, "").toUpperCase());
      const itemList = Array.isArray(items) ? items : items.split(",").map(s => s.trim());
      const cleanedItems = [...new Set(itemList.map(cleanItemName))];

      // Search every item across 10+ Canadian grocery stores — 8 searches per item, all parallel
      const searchPromises = cleanedItems.map(item => Promise.all([
        webSearch(`"${item}" price walmart.ca canada grocery 2026`, serperKey),
        webSearch(`"${item}" price loblaws.ca OR "real canadian superstore" canada 2026`, serperKey),
        webSearch(`"${item}" price "no frills" OR "food basics" OR "freshco" canada 2026`, serperKey),
        webSearch(`"${item}" price costco.ca canada 2026`, serperKey),
        webSearch(`"${item}" price metro.ca OR sobeys.com canada grocery 2026`, serperKey),
        webSearch(`"${item}" price "valumart" OR "valumart.ca" OR "giant tiger" canada 2026`, serperKey),
        webSearch(`"${item}" flyer sale price ontario canada this week 2026`, serperKey),
        webSearch(`${item} grocery price ontario canada supermarket 2026`, serperKey),
      ]));

      // Search store locations — 3 parallel searches for comprehensive coverage
      const storePromises = Promise.all([
        webSearch(`Walmart Loblaws "No Frills" Costco address hours ${city} Ontario ${postal}`, serperKey),
        webSearch(`FreshCo "Food Basics" Metro Sobeys address hours ${city} Ontario`, serperKey),
        webSearch(`"Real Canadian Superstore" "Value Mart" "Giant Tiger" address ${city} Ontario`, serperKey),
      ]);

      const [allItemResults, storeResults] = await Promise.all([
        Promise.all(searchPromises),
        storePromises
      ]);

      // Combine all snippets per item
      const itemSnippets = {};
      cleanedItems.forEach((item, idx) => {
        const combined = allItemResults[idx].flat();
        itemSnippets[item] = combined.map(r => r.title + ": " + r.snippet).join("\n");
      });
      const storeResult = storeResults.flat();

      return res.status(200).json({
        itemSnippets,
        storeSnippets: storeResult.map(r => r.title + ": " + r.snippet).join("\n"),
        city,
        cleanedItems,
        originalItems: itemList
      });
    } catch (err) {
      console.error("Search error:", err.message);
    }
  }

  // ── COMBINED MODE: search + analyze in one call ─────────────────
  if (mode === "prices" && items && postal && serperKey) {
    try {
      const postalClean = postal.replace(/\s/g, "").toUpperCase();
      const city = getCity(postalClean);
      const itemList = Array.isArray(items) ? items : items.split(",").map(s => s.trim());
      const cleanedItems = [...new Set(itemList.map(cleanItemName))];
      const budgetAmt = budget || 200;

      // Run all searches simultaneously
      const [itemResults, storeResults] = await Promise.all([
        Promise.all(cleanedItems.map(item => Promise.all([
          webSearch(`"${item}" price walmart.ca canada grocery 2026`, serperKey),
          webSearch(`"${item}" price loblaws.ca OR "real canadian superstore" canada 2026`, serperKey),
          webSearch(`"${item}" price "no frills" OR "food basics" OR "freshco" canada 2026`, serperKey),
          webSearch(`"${item}" price costco.ca canada 2026`, serperKey),
          webSearch(`"${item}" price metro.ca OR sobeys.com canada 2026`, serperKey),
          webSearch(`"${item}" flyer sale price ontario canada this week`, serperKey),
        ]))),
        Promise.all([
          webSearch(`Walmart Loblaws "No Frills" Costco address hours ${city} Ontario`, serperKey),
          webSearch(`FreshCo "Food Basics" Metro Sobeys address hours ${city} Ontario`, serperKey),
        ])
      ]);

      const itemSnippets = {};
      cleanedItems.forEach((item, idx) => {
        itemSnippets[item] = itemResults[idx].flat().map(r => r.title + ": " + r.snippet).join("
");
      });
      const storeSnippets = storeResults.flat().map(r => r.title + ": " + r.snippet).join("
");
      const priceContext = Object.entries(itemSnippets).map(([item, s]) => `=== ${item} ===
${s}`).join("

");

      const aiResponse = await callAI(
        "You are a Canadian grocery price expert. Extract real prices from web search snippets. Calculate correct totals. Return ONLY valid JSON.",
        `SEARCH RESULTS PER ITEM:
${priceContext}

STORE LOCATIONS:
${storeSnippets}

ITEMS: ${cleanedItems.join(", ")}
CITY: ${city}, Ontario
BUDGET: $${budgetAmt} CAD

Extract prices, calculate totals, return JSON with combinations, perItemPrices, saleItems arrays. totalCAD must be sum of all found prices.

Return ONLY this JSON:
{"combinations":[{"rank":1,"label":"Best single store","stores":[{"name":"Store","address":"Address ${city} ON","distanceKm":2.0,"hours":"Hours"}],"totalCAD":0.00,"savingsVsWorst":0.00,"trips":1,"breakdown":[{"store":"Store","items":["Product - $x.xx"],"subtotal":0.00}],"tip":"tip"},{"rank":2,"label":"Best two stores","stores":[{"name":"A","address":"Addr","distanceKm":1.5,"hours":"h"},{"name":"B","address":"Addr","distanceKm":3.0,"hours":"h"}],"totalCAD":0.00,"savingsVsWorst":0.00,"trips":2,"breakdown":[{"store":"A","items":["p"],"subtotal":0.00},{"store":"B","items":["p"],"subtotal":0.00}],"tip":"tip"},{"rank":3,"label":"Best three stores","stores":[{"name":"A","address":"Addr","distanceKm":1.5,"hours":"h"},{"name":"B","address":"Addr","distanceKm":2.5,"hours":"h"},{"name":"C","address":"Addr","distanceKm":4.0,"hours":"h"}],"totalCAD":0.00,"savingsVsWorst":0.00,"trips":3,"breakdown":[{"store":"A","items":["p"],"subtotal":0.00},{"store":"B","items":["p"],"subtotal":0.00},{"store":"C","items":["p"],"subtotal":0.00}],"tip":"tip"}],"budgetCAD":${budgetAmt},"withinBudget":true,"overBy":0,"perItemPrices":[{"name":"Product","store":"store","price":0.00}],"saleItems":[],"priceNote":"Prices from web search of Walmart, Loblaws, No Frills, Costco, Metro, Sobeys, FreshCo, Food Basics. Verify in-store."}`,
        groqKey, geminiKey, 4096
      );

      const clean = aiResponse.replace(/```json|```/g, "").replace(/
/g, " ").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return res.status(500).json({ error: "Could not parse response" });
      return res.status(200).json({ text: match[0] });

    } catch (err) {
      console.error("Prices error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── CALL 2: ANALYZE — AI reads search results and extracts prices ─
  if (mode === "analyze" && searchResults && postal) {
    try {
      const { itemSnippets, storeSnippets, city, cleanedItems } = searchResults;
      const budgetAmt = budget || 200;

      const priceContext = Object.entries(itemSnippets).map(([item, snippets]) =>
        `=== ${item} ===\n${snippets}`
      ).join("\n\n");

      const aiPrompt = `You are a Canadian grocery price expert for ${city}, Ontario.

SEARCH RESULTS PER ITEM (from walmart.ca, loblaws.ca, nofrills.ca, costco.ca, metro.ca, sobeys.com, freshco.com, foodbasics.ca, realcanadiansuperstore.ca, valumart.ca, giant tiger, and weekly flyers):
${priceContext}

STORE LOCATION RESULTS:
${storeSnippets}

ITEMS NEEDED: ${cleanedItems.join(", ")}
BUDGET: $${budgetAmt} CAD
CITY: ${city}, Ontario

EXTRACTION RULES:
- Read every snippet carefully for price mentions: $x.xx, /ea, /lb, /100g, "for $", "only $", "save", "sale"
- Use the cheapest real price found for each item across all stores
- Costco prices are usually bulk — note pack size (e.g. "Chicken Breast 2kg - $14.99 at Costco")
- For store addresses: extract real addresses from the store location results for ${city}
- For store hours: extract from results or say "check store website"
- saleItems array: list item names currently showing sale/discount prices this week
- ALL totals (totalCAD, subtotals) MUST be calculated by adding up actual item prices — never 0
- If no price found for an item, write "price varies - check store" but still include it

Return ONLY this JSON (no markdown, no explanation):
{
  "combinations": [
    {
      "rank": 1,
      "label": "Best single store",
      "stores": [{"name": "Store Name", "address": "Full street address, ${city} ON", "distanceKm": 2.0, "hours": "Mon-Sun 7am-11pm"}],
      "totalCAD": 0.00,
      "savingsVsWorst": 0.00,
      "trips": 1,
      "breakdown": [{"store": "Store", "items": ["Brand Product Size - $x.xx"], "subtotal": 0.00}],
      "tip": "Why this is the best single-store option"
    },
    {
      "rank": 2,
      "label": "Best two stores",
      "stores": [
        {"name": "Store A", "address": "Full address, ${city} ON", "distanceKm": 1.5, "hours": "Hours"},
        {"name": "Store B", "address": "Full address, ${city} ON", "distanceKm": 3.0, "hours": "Hours"}
      ],
      "totalCAD": 0.00,
      "savingsVsWorst": 0.00,
      "trips": 2,
      "breakdown": [
        {"store": "Store A", "items": ["Brand Product - $x.xx"], "subtotal": 0.00},
        {"store": "Store B", "items": ["Brand Product - $x.xx"], "subtotal": 0.00}
      ],
      "tip": "Split strategy tip"
    },
    {
      "rank": 3,
      "label": "Best three stores",
      "stores": [
        {"name": "Store A", "address": "Full address, ${city} ON", "distanceKm": 1.5, "hours": "Hours"},
        {"name": "Store B", "address": "Full address, ${city} ON", "distanceKm": 2.5, "hours": "Hours"},
        {"name": "Store C", "address": "Full address, ${city} ON", "distanceKm": 4.0, "hours": "Hours"}
      ],
      "totalCAD": 0.00,
      "savingsVsWorst": 0.00,
      "trips": 3,
      "breakdown": [
        {"store": "Store A", "items": ["Brand Product - $x.xx"], "subtotal": 0.00},
        {"store": "Store B", "items": ["Brand Product - $x.xx"], "subtotal": 0.00},
        {"store": "Store C", "items": ["Brand Product - $x.xx"], "subtotal": 0.00}
      ],
      "tip": "Three-store strategy tip"
    }
  ],
  "budgetCAD": ${budgetAmt},
  "withinBudget": true,
  "overBy": 0,
  "perItemPrices": [{"name": "Brand Product Size", "store": "store name", "price": 0.00}],
  "saleItems": [],
  "priceNote": "Prices from live web search of Walmart, Loblaws, No Frills, Costco, Metro, Sobeys, FreshCo, Food Basics, Real Canadian Superstore and weekly flyers. Verify in-store before shopping."
}`;

      const aiResponse = await callAI(
        "You are a Canadian grocery price expert. Extract real prices from web search snippets. Calculate correct totals by summing all item prices. Return ONLY valid JSON with no markdown.",
        aiPrompt, groqKey, geminiKey, 4096
      );

      const clean = aiResponse.replace(/```json|```/g, "").replace(/[\r\n]+/g, " ").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return res.status(500).json({ error: "Could not parse AI response" });
      return res.status(200).json({ text: match[0] });

    } catch (err) {
      console.error("Analyze error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── WISHLIST SALE CHECK ───────────────────────────────────────────
  if (mode === "wishlist" && itemName && postal && serperKey) {
    try {
      const city = getCity(postal.replace(/\s/g, "").toUpperCase());
      const [r1, r2, r3, r4] = await Promise.all([
        webSearch(`"${itemName}" price walmart.ca loblaws.ca nofrills.ca canada 2026`, serperKey),
        webSearch(`"${itemName}" price costco.ca canada 2026`, serperKey),
        webSearch(`${itemName} grocery sale flyer ${city} Ontario canada this week 2026`, serperKey),
        webSearch(`${itemName} price canada supermarket 2026`, serperKey),
      ]);
      const snippets = [...r1, ...r2, ...r3, ...r4].slice(0, 15).map(r => r.title + ": " + r.snippet).join("\n");
      const aiResponse = await callAI(
        "Extract grocery prices from web search results. Only report prices explicitly found in results. Return ONLY valid JSON.",
        `Find current price of "${itemName}" near ${city}, Ontario from these search results:\n\n${snippets}\n\nReturn ONLY this JSON: {"currentPrice":0.00,"regularPrice":0.00,"onSale":false,"saleStore":"store name","saleEnds":"date or unknown","savings":0.00,"note":"specific product and price found e.g. Coca-Cola 12pk $9.97 at Walmart"}`,
        groqKey, geminiKey, 512
      );
      const clean = aiResponse.replace(/```json|```/g, "").replace(/[\r\n]+/g, " ").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return res.status(200).json({ result: null });
      return res.status(200).json({ result: JSON.parse(match[0]) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── STANDARD AI (meals, suggestions, dishes) ─────────────────────
  try {
    const text = await callAI(
      system || "You are a helpful assistant.",
      prompt || "",
      groqKey, geminiKey, 4096, true
    );
    return res.status(200).json({ text: text.replace(/\\n/g, " ").replace(/\n/g, " ").trim() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ── HELPERS ───────────────────────────────────────────────────────

function cleanItemName(item) {
  return item
    .replace(/^\d+x?\s+/i, "")
    .replace(/^\d+\s*\/\s*\d+\s+/i, "")
    .replace(/^[\d.]+\s*(cups?|tbsp|tsp|tablespoons?|teaspoons?|pounds?|lbs?|kg|g|oz|ml|l|liters?|litres?|slices?|cloves?|pieces?|cans?|boxes?|bags?|bunches?|heads?|stalks?|sheets?)\s+/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .trim();
}

async function webSearch(query, serperKey) {
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": serperKey },
      body: JSON.stringify({ q: query, gl: "ca", hl: "en", num: 8 })
    });
    const data = await res.json();
    const organic = (data.organic || []).slice(0, 8).map(r => ({ title: r.title || "", snippet: r.snippet || "" }));
    const answerBox = data.answerBox ? [{ title: "Answer", snippet: data.answerBox.answer || data.answerBox.snippet || "" }] : [];
    return [...answerBox, ...organic];
  } catch (e) { return []; }
}

function getCity(postalClean) {
  const prefix = postalClean.slice(0, 3);
  const map = {
    "L6C":"Markham","L6B":"Markham","L6E":"Markham","L6G":"Markham","L3R":"Markham","L3S":"Markham","L3T":"Markham",
    "M1B":"Scarborough","M1C":"Scarborough","M1E":"Scarborough","M1G":"Scarborough","M1H":"Scarborough",
    "M1J":"Scarborough","M1K":"Scarborough","M1L":"Scarborough","M1M":"Scarborough","M1N":"Scarborough",
    "M1P":"Scarborough","M1R":"Scarborough","M1S":"Scarborough","M1T":"Scarborough","M1V":"Scarborough",
    "M1W":"Scarborough","M1X":"Scarborough",
    "M2H":"North York","M2J":"North York","M2K":"North York","M2L":"North York","M2M":"North York",
    "M2N":"North York","M2P":"North York","M2R":"North York",
    "M3A":"North York","M3B":"North York","M3C":"North York","M3H":"North York","M3J":"North York",
    "M3K":"North York","M3L":"North York","M3M":"North York","M3N":"North York",
    "M4A":"East York","M4B":"East York","M4C":"East York","M4E":"East End Toronto","M4G":"Leaside",
    "M4H":"East York","M4J":"East York","M4K":"East York","M4L":"East End Toronto","M4M":"East End Toronto",
    "M4N":"Lawrence Park","M4P":"Davisville","M4R":"North Toronto","M4S":"Davisville",
    "M4T":"Midtown Toronto","M4V":"Forest Hill","M4W":"Rosedale","M4X":"Cabbagetown","M4Y":"Church-Yonge Corridor",
    "M5A":"Downtown Toronto","M5B":"Downtown Toronto","M5C":"Downtown Toronto","M5E":"Downtown Toronto",
    "M5G":"Downtown Toronto","M5H":"Downtown Toronto","M5J":"Downtown Toronto","M5K":"Downtown Toronto",
    "M5L":"Downtown Toronto","M5M":"Bedford Park","M5N":"Lawrence Park","M5P":"Forest Hill",
    "M5R":"Annex","M5S":"University of Toronto","M5T":"Kensington Market","M5V":"Downtown Toronto",
    "M6A":"Lawrence Heights","M6B":"Glencairn","M6C":"Humewood","M6E":"Caledonia",
    "M6G":"Christie","M6H":"Dufferin Grove","M6J":"Trinity Bellwoods","M6K":"Parkdale",
    "M6L":"Maple Leaf","M6M":"Mount Dennis","M6N":"Runnymede","M6P":"High Park",
    "M6R":"Roncesvalles","M6S":"Swansea",
    "M8V":"Etobicoke","M8W":"Etobicoke","M8X":"Etobicoke","M8Y":"Etobicoke","M8Z":"Etobicoke",
    "M9A":"Etobicoke","M9B":"Etobicoke","M9C":"Etobicoke","M9L":"Humber Summit","M9M":"Humber Summit",
    "M9N":"Weston","M9P":"Humberlea","M9R":"Kingsview Village","M9V":"Etobicoke","M9W":"Etobicoke",
    "L4B":"Richmond Hill","L4C":"Richmond Hill","L4E":"Richmond Hill","L4S":"Richmond Hill",
    "L3Y":"Newmarket","L3X":"Newmarket","L9N":"Newmarket",
    "L4J":"Thornhill","L4K":"Vaughan","L4L":"Vaughan","L6A":"Maple","L6K":"Oakville","L6L":"Oakville",
    "L5A":"Mississauga","L5B":"Mississauga","L5C":"Mississauga","L5E":"Mississauga","L5G":"Mississauga",
    "L5H":"Mississauga","L5J":"Mississauga","L5K":"Mississauga","L5L":"Mississauga","L5M":"Mississauga",
    "L5N":"Mississauga","L5R":"Mississauga","L5S":"Mississauga","L5T":"Mississauga","L5V":"Mississauga",
    "L5W":"Mississauga","L4T":"Mississauga","L4V":"Mississauga","L4W":"Mississauga","L4X":"Mississauga",
    "L4Y":"Mississauga","L4Z":"Mississauga",
    "L7A":"Brampton","L6P":"Brampton","L6R":"Brampton","L6S":"Brampton","L6T":"Brampton",
    "L6V":"Brampton","L6W":"Brampton","L6X":"Brampton","L6Y":"Brampton","L6Z":"Brampton",
  };
  return map[prefix] || "Toronto";
}

async function callGroq(system, prompt, apiKey, maxTokens = 2048, fast = false) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
    body: JSON.stringify({
      model: fast ? "gemma2-9b-it" : "llama-3.3-70b-versatile",
      max_tokens: maxTokens, temperature: 0.1,
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }]
    }),
  });
  const data = await res.json();
  if (data.error) { console.error("Groq:", data.error.message); return null; }
  return data?.choices?.[0]?.message?.content ?? null;
}

async function callGemini(system, prompt, apiKey, maxTokens = 2048) {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: system + "\n\n" + prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens }
      }),
    }
  );
  const data = await res.json();
  if (data.error) { console.error("Gemini:", data.error.message); return null; }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

async function callClaude(system, prompt, apiKey, maxTokens = 2048) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001", max_tokens: maxTokens, system,
      messages: [{ role: "user", content: prompt }]
    }),
  });
  const data = await res.json();
  if (data.error) { console.error("Claude:", data.error.message); return null; }
  return data?.content?.[0]?.text ?? null;
}

async function callOpenRouter(system, prompt, maxTokens = 2048) {
  const apiKey = process.env.OPENROUTER_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
        "HTTP-Referer": "https://mygroceryweek.vercel.app",
        "X-Title": "MyGroceryWeek"
      },
      body: JSON.stringify({
        model: "openrouter/auto",
        max_tokens: maxTokens, temperature: 0.1,
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }]
      }),
    });
    const data = await res.json();
    if (data.error) { console.error("OpenRouter:", data.error.message); return null; }
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (e) { return null; }
}

async function callAI(system, prompt, groqKey, geminiKey, maxTokens = 2048, fast = false) {
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  const results = await Promise.allSettled([
    groqKey ? callGroq(system, prompt, groqKey, maxTokens, fast).catch(() => null) : Promise.resolve(null),
    geminiKey ? callGemini(system, prompt, geminiKey, maxTokens).catch(() => null) : Promise.resolve(null),
    claudeKey ? callClaude(system, prompt, claudeKey, maxTokens).catch(() => null) : Promise.resolve(null),
    callOpenRouter(system, prompt, maxTokens).catch(() => null),
  ]);
  for (const r of results) {
    const val = r.status === "fulfilled" ? r.value : null;
    if (val && val.trim() !== "") return val;
  }
  throw new Error("All AI providers unavailable. Please try again in a few minutes.");
}
