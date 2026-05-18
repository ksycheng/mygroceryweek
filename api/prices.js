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

  // ── SEARCH MODE: fetch raw web results for all stores ─────────────
  // ── SEARCH MODE ───────────────────────────────────────────────────
  if (mode === "search" && items && postal && serperKey) {
    try {
      const city = getCity(postal.replace(/\s/g, "").toUpperCase());
      const itemList = Array.isArray(items) ? items : items.split(",").map(s => s.trim());
      const cleanedItems = [...new Set(itemList.map(cleanItemName))];

      // ALL searches run in parallel — 2 per item + store search
      const [itemResults, storeResults] = await Promise.all([
        Promise.all(cleanedItems.map(item => Promise.all([
          webSearch('"' + item + '" price Walmart Loblaws "No Frills" "Food Basics" Costco Metro Canada grocery 2026', serperKey),
          webSearch(item + ' grocery price Ontario Canada flyer sale 2026', serperKey),
        ]))),
        Promise.all([
          webSearch('Walmart Loblaws "No Frills" Costco Metro FreshCo store address hours ' + city + ' Ontario', serperKey),
        ])
      ]);

      const itemSnippets = {};
      cleanedItems.forEach((item, idx) => {
        const combined = itemResults[idx].flat().slice(0, 10);
        itemSnippets[item] = combined.map(r => (r.title + ": " + r.snippet).substring(0, 250)).join("\n");
      });

      return res.status(200).json({
        itemSnippets,
        storeSnippets: storeResults.flat().slice(0, 8).map(r => (r.title + ": " + r.snippet).substring(0, 200)).join("\n"),
        city,
        cleanedItems,
        originalItems: itemList
      });
    } catch (err) {
      console.error("Search error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }


  // ── ANALYZE MODE: AI extracts prices from search results ──────────
  if (mode === "analyze" && searchResults && postal) {
    try {
      const { itemSnippets, storeSnippets, city, cleanedItems } = searchResults;
      const budgetAmt = budget || 200;
      const priceContext = Object.entries(itemSnippets).map(([item, s]) => "=== " + item + " ===\n" + s).join("\n\n");

      const aiResponse = await callAI(
        "You are a Canadian grocery price extractor. Your ONLY job is to read prices that are explicitly stated in the search snippets provided. You MUST NOT guess, estimate, or invent any price. If a price is not clearly stated in the snippets, set price to null. Return ONLY valid JSON with no markdown.",
        buildAnalyzePrompt(cleanedItems, priceContext, storeSnippets, city, postal, budgetAmt),
        groqKey, geminiKey, 4096
      );

      const clean = aiResponse.replace(/```json|```/g, "").replace(/\n/g, " ").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return res.status(500).json({ error: "Could not parse AI response" });
      return res.status(200).json({ text: match[0] });
    } catch (err) {
      console.error("Analyze error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PRICES MODE: combined search + analyze in one call ────────────
  if (mode === "prices" && items && postal && serperKey) {
    try {
      const city = getCity(postal.replace(/\s/g, "").toUpperCase());
      const itemList = Array.isArray(items) ? items : items.split(",").map(s => s.trim());
      const cleanedItems = [...new Set(itemList.map(cleanItemName))]; // Search ALL items - no cap
      const budgetAmt = budget || 200;

      // 2 searches per item + store search (was 6 per item — too slow for Vercel timeout)
      const [itemResults, storeResults] = await Promise.all([
        Promise.all(cleanedItems.map(item => Promise.all([
          webSearch('"' + item + '" price Walmart Loblaws "No Frills" "Food Basics" Canada grocery 2026', serperKey),
          webSearch('"' + item + '" price Costco Metro Sobeys FreshCo Ontario flyer sale 2026', serperKey),
        ]))),
        Promise.all([
          webSearch('Walmart Loblaws "No Frills" Costco Metro FreshCo store address hours ' + city + ' Ontario', serperKey),
        ])
      ]);

      const itemSnippets = {};
      cleanedItems.forEach((item, idx) => {
        itemSnippets[item] = itemResults[idx].flat().slice(0, 8).map(r => (r.title + ": " + r.snippet).substring(0, 200)).join("\n");
      });
      const storeSnippets = storeResults.flat().slice(0, 10).map(r => (r.title + ": " + r.snippet).substring(0, 200)).join("\n");
      const priceContext = Object.entries(itemSnippets).map(([item, s]) => "=== " + item + " ===\n" + s).join("\n\n");

      const aiResponse = await callAI(
        "You are a Canadian grocery price extractor. Your ONLY job is to read prices that are explicitly stated in the search snippets provided. You MUST NOT guess, estimate, or invent any price. If a price is not clearly stated in the snippets, set price to null. Return ONLY valid JSON.",
        buildAnalyzePrompt(cleanedItems, priceContext, storeSnippets, city, postal, budgetAmt),
        groqKey, geminiKey, 4096
      );

      const clean = aiResponse.replace(/```json|```/g, "").replace(/\n/g, " ").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return res.status(500).json({ error: "Could not parse response" });
      return res.status(200).json({ text: match[0] });
    } catch (err) {
      console.error("Prices error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── WISHLIST MODE ─────────────────────────────────────────────────
  if (mode === "wishlist" && itemName && postal && serperKey) {
    try {
      const city = getCity(postal.replace(/\s/g, "").toUpperCase());
      const results = await Promise.all([
        webSearch('"' + itemName + '" price Walmart OR Loblaws OR "No Frills" Ontario Canada grocery 2026', serperKey),
        webSearch('"' + itemName + '" price Costco OR Metro OR Sobeys OR FreshCo Canada 2026', serperKey),
        webSearch(itemName + ' grocery store sale flyer ' + city + ' Ontario Canada this week 2026', serperKey),
      ]);
      const snippets = results.flat().slice(0, 15).map(r => r.title + ": " + r.snippet).join("\n");

      const aiResponse = await callAI(
        "You extract grocery prices ONLY from web search results that are explicitly provided to you. NEVER invent, guess, or estimate any price. If no price is clearly stated in the results, set currentPrice to null. Return ONLY valid JSON.",
        'Search results for "' + itemName + '" near ' + city + ', Ontario:\n\n' + snippets + '\n\nCRITICAL: Extract ONLY prices that are explicitly written in the search results above (e.g. "$3.99", "2 for $5"). NEVER guess or estimate a price. If no price is clearly stated in the results, set currentPrice to null.\n\nReturn ONLY this JSON: {"currentPrice":null,"regularPrice":null,"onSale":false,"saleStore":"store name from results or null","address":"address from results or null","hours":"hours from results or null","saleEnds":"date from results or null","savings":null,"source":"which snippet the price came from, or null","note":"what was found or not found in the search results"}',
        groqKey, geminiKey, 512
      );
      const clean = aiResponse.replace(/```json|```/g, "").replace(/\n/g, " ").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return res.status(200).json({ result: null });
      return res.status(200).json({ result: JSON.parse(match[0]) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── STANDARD AI (meals, dishes, suggestions) ─────────────────────
  try {
    const text = await callAI(
      system || "You are a helpful assistant.",
      prompt || "",
      groqKey, geminiKey, 4096, true
    );
    return res.status(200).json({ text: text.replace(/\n/g, " ").trim() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function buildAnalyzePrompt(cleanedItems, priceContext, storeSnippets, city, postal, budgetAmt) {
  return "LIVE WEB SEARCH RESULTS PER ITEM:\n" +
    priceContext + "\n\nSTORE LOCATION SEARCH RESULTS:\n" + storeSnippets +
    "\n\nITEMS NEEDED: " + cleanedItems.join(", ") +
    "\nCITY: " + city + ", Ontario (postal: " + postal + ")" +
    "\nBUDGET: $" + budgetAmt + " CAD" +
    "\n\nCRITICAL RULES - YOU MUST FOLLOW THESE:\n" +
    "1. ONLY use prices explicitly stated in the search snippets above (e.g. '$3.99', '2 for $5', '$1.99/100g')\n" +
    "2. NEVER guess, estimate, or invent a price. If no price appears in the snippets for an item, set price to null\n" +
    "3. For each price you use, record which snippet/source it came from in the 'source' field\n" +
    "4. Only include an item in a store's breakdown if you found a real price for it at that store\n" +
    "5. Totals must be the sum of only the non-null prices found — never fill in zeros for missing items\n" +
    "6. If fewer than 2 items have real prices found, return an empty combinations array\n" +
    "7. Costco prices are bulk — note the pack size (e.g. 'Chicken Breast 2kg - $14.99')\n" +
    "8. For store addresses use only addresses found in the store location results above\n" +
    "9. saleItems: only list items where the snippet explicitly mentions 'sale', 'flyer', 'this week', or a crossed-out price\n\n" +
    'Return ONLY this JSON (price is null if not found in snippets):\n' +
    '{"combinations":[{"rank":1,"label":"Best single store","stores":[{"name":"Store Name","address":"Full address from search, ' + city + ' ON","hours":"Hours from search or null"}],"totalCAD":0.00,"savingsVsWorst":0.00,"trips":1,"breakdown":[{"store":"Store","items":["Brand Product Size - $x.xx (source: snippet title)"],"subtotal":0.00}],"tip":"tip"},{"rank":2,"label":"Best two stores","stores":[{"name":"A","address":"Addr","hours":"h"},{"name":"B","address":"Addr","hours":"h"}],"totalCAD":0.00,"savingsVsWorst":0.00,"trips":2,"breakdown":[{"store":"A","items":["Product - $x.xx (source: snippet)"],"subtotal":0.00},{"store":"B","items":["Product - $x.xx (source: snippet)"],"subtotal":0.00}],"tip":"tip"},{"rank":3,"label":"Best three stores","stores":[{"name":"A","address":"Addr","hours":"h"},{"name":"B","address":"Addr","hours":"h"},{"name":"C","address":"Addr","hours":"h"}],"totalCAD":0.00,"savingsVsWorst":0.00,"trips":3,"breakdown":[{"store":"A","items":["p"],"subtotal":0.00},{"store":"B","items":["p"],"subtotal":0.00},{"store":"C","items":["p"],"subtotal":0.00}],"tip":"tip"}],' +
    '"budgetCAD":' + budgetAmt + ',"withinBudget":true,"overBy":0,' +
    '"perItemPrices":[{"name":"item name","store":"store name or null","price":0.00,"priceNull":false,"source":"snippet title it came from"}],' +
    '"saleItems":[],' +
    '"priceNote":"Prices extracted from live Google search results (Walmart, Loblaws, No Frills, Costco, Metro, Sobeys, FreshCo, Food Basics flyers/websites). Items with no price found are marked null. Always verify in-store."}';
}

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
    const r = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": serperKey },
      body: JSON.stringify({ q: query, gl: "ca", hl: "en", num: 8 })
    });
    const data = await r.json();
    const organic = (data.organic || []).slice(0, 8).map(r => ({ title: r.title || "", snippet: r.snippet || "" }));
    const ab = data.answerBox ? [{ title: "Answer", snippet: data.answerBox.answer || data.answerBox.snippet || "" }] : [];
    return [...ab, ...organic];
  } catch (e) { return []; }
}

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

async function callGroq(system, prompt, apiKey, maxTokens, fast) {
  // fast=true (suggestions, dishes): use 8b-instant — low latency, generous TPM
  // fast=false (price analysis): use 70b-versatile — better reasoning, but only as fallback
  //   since large prompts may hit the 6k TPM free limit
  const model = fast ? "llama-3.1-8b-instant" : "llama-3.3-70b-versatile";
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature: 0.1,
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }]
    }),
  });
  const data = await r.json();
  if (data.error) { console.error("Groq:", data.error.message); return null; }
  return data?.choices?.[0]?.message?.content ?? null;
}

async function callGemini(system, prompt, apiKey, maxTokens) {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: system + "\n\n" + prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens }
    }),
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

async function callAI(system, prompt, groqKey, geminiKey, maxTokens, fast) {
  maxTokens = maxTokens || 2048;
  fast = fast || false;
  const claudeKey = process.env.ANTHROPIC_API_KEY;

  // For large analyze prompts: Gemini 1.5 Flash first (1M context, 1500 req/day free)
  // For fast/small prompts: Groq first (low latency)
  const providers = fast
    ? [
        { name: "Groq",       fn: () => groqKey  ? callGroq(system, prompt, groqKey, maxTokens, fast) : null },
        { name: "Gemini",     fn: () => geminiKey ? callGemini(system, prompt, geminiKey, maxTokens)  : null },
        { name: "Claude",     fn: () => claudeKey ? callClaude(system, prompt, claudeKey, maxTokens)  : null },
        { name: "OpenRouter", fn: () => callOpenRouter(system, prompt, maxTokens) },
      ]
    : [
        { name: "Gemini",     fn: () => geminiKey ? callGemini(system, prompt, geminiKey, maxTokens)  : null },
        { name: "Groq",       fn: () => groqKey  ? callGroq(system, prompt, groqKey, maxTokens, fast) : null },
        { name: "Claude",     fn: () => claudeKey ? callClaude(system, prompt, claudeKey, maxTokens)  : null },
        { name: "OpenRouter", fn: () => callOpenRouter(system, prompt, maxTokens) },
      ];

  for (const { name, fn } of providers) {
    try {
      const val = await fn();
      if (val && val.trim() !== "") return val;
      console.log(`${name}: returned empty, trying next provider`);
    } catch (err) {
      console.error(`${name} failed:`, err.message);
    }
  }
  throw new Error("All AI providers unavailable. Please try again in a few minutes.");
}
