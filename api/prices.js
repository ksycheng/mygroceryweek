export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const serperKey = process.env.SERPER_KEY;
  if (!groqKey && !geminiKey) return res.status(500).json({ error: "No AI API key configured" });

  const { prompt, system, mode, items, postal, budget, itemName, targetPrice } = req.body;

  // ── WISHLIST SALE CHECK MODE ──────────────────────────────────────
  if (mode === "wishlist" && itemName && postal && serperKey) {
    try {
      const postalClean = postal.replace(/\s/g, "").toUpperCase();
      const city = getCity(postalClean);

      const [r1, r2, r3] = await Promise.all([
        webSearch(itemName + ' price site:walmart.ca OR site:loblaws.ca OR site:nofrills.ca OR site:freshco.com OR site:foodbasics.ca', serperKey),
        webSearch(itemName + ' flyer sale price ' + city + ' Ontario this week May 2025', serperKey),
        webSearch(itemName + ' grocery price Canada "$" 2025', serperKey),
      ]);

      const snippets = [...r1, ...r2, ...r3].slice(0, 12).map(r => r.title + ": " + r.snippet).join("\n");

      const aiResponse = await callAI(
        "You extract grocery prices from web search results. NEVER guess. Only report prices explicitly found in the search results. If no price is found, say so.",
        `Find the current sale price of "${itemName}" near ${city}, Ontario from these search results:

${snippets}

Rules:
- ONLY use prices explicitly mentioned in the search results above
- If no price is found in the results, set currentPrice to 0 and onSale to false and note "No price found online - check store flyer"
- Never invent or estimate prices
- Look for $ amounts in the snippets
${targetPrice ? '- Flag if price is at or below $' + targetPrice + ' CAD' : ''}

Return ONLY this JSON:
{"currentPrice":0.00,"regularPrice":0.00,"onSale":false,"saleStore":"exact store name from results or null","saleEnds":"date from results or unknown","savings":0.00,"note":"exact quote from search result e.g. found on walmart.ca: Coca-Cola 12pk $9.97"}`,
        groqKey, geminiKey, 1024
      );

      const clean = aiResponse.replace(/```json|```/g, "").replace(/[\r\n]+/g, " ").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return res.status(200).json({ result: null });
      return res.status(200).json({ result: JSON.parse(match[0]) });

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PRICE SEARCH MODE ──────────────────────────────────────────────
  if (mode === "prices" && items && postal && serperKey) {
    try {
      const postalClean = postal.replace(/\s/g, "").toUpperCase();
      const city = getCity(postalClean);
      const itemList = Array.isArray(items) ? items : items.split(",").map(s => s.trim());

      // Search each item individually on store websites + flyer sites
      const allSnippets = [];

      // Search items in small batches
      const batchSize = 3;
      for (let i = 0; i < Math.min(itemList.length, 9); i += batchSize) {
        const batch = itemList.slice(i, i + batchSize);
        const batchStr = batch.join(" ");
        const [storeResults, flyerResults] = await Promise.all([
          webSearch(batchStr + ' price site:walmart.ca OR site:loblaws.ca OR site:nofrills.ca OR site:freshco.com OR site:foodbasics.ca', serperKey),
          webSearch(batchStr + ' grocery price ' + city + ' Ontario flyer this week May 2025', serperKey),
        ]);
        allSnippets.push(...storeResults, ...flyerResults);
      }

      // Also search for store addresses
      const storeSearch = await webSearch(
        'Loblaws "No Frills" Walmart FreshCo "Food Basics" address ' + city + ' Ontario near ' + postal,
        serperKey
      );

      const priceSnippets = allSnippets.slice(0, 15).map(r => r.title + ": " + r.snippet).join("\n");
      const storeSnippets = storeSearch.slice(0, 5).map(r => r.title + ": " + r.snippet).join("\n");

      const aiPrompt = `You are extracting REAL grocery prices found in web search results for ${city}, Ontario.

PRICE SEARCH RESULTS (from walmart.ca, loblaws.ca, nofrills.ca, flyer sites):
${priceSnippets}

STORE LOCATION RESULTS:
${storeSnippets}

ITEMS NEEDED: ${itemList.join(", ")}
BUDGET: $${budget || 200} CAD
CITY: ${city}, Ontario, postal ${postal}

CRITICAL RULES:
1. ONLY use prices found in the search results above — NO guessing, NO estimating
2. If a price is not found in results, write "price not found" for that item
3. For store addresses, only use addresses found in the search results
4. Specify exact brand and size found (e.g. "Coca-Cola 12pk cans" not just "soda")
5. Item format in breakdown: "Exact Product Name Size - $x.xx from [source]" or "item - price not found"
6. If you cannot find a real price, do NOT make one up - leave it out of totals

Return ONLY this JSON (no markdown):
{
  "combinations": [
    {
      "rank": 1,
      "label": "Best single store",
      "stores": [{"name": "Store Name", "address": "Address from search results or TBD - verify on Google Maps", "distanceKm": 0, "hours": "Hours from search or check store website"}],
      "totalCAD": 0.00,
      "savingsVsWorst": 0.00,
      "trips": 1,
      "breakdown": [{"store": "Store", "items": ["Exact Product Size - $x.xx from source"], "subtotal": 0.00}],
      "tip": "tip based on actual search findings"
    },
    {
      "rank": 2,
      "label": "Best two stores",
      "stores": [
        {"name": "Store A", "address": "Address from search or TBD", "distanceKm": 0, "hours": "check website"},
        {"name": "Store B", "address": "Address from search or TBD", "distanceKm": 0, "hours": "check website"}
      ],
      "totalCAD": 0.00,
      "savingsVsWorst": 0.00,
      "trips": 2,
      "breakdown": [
        {"store": "Store A", "items": ["Exact Product - $x.xx"], "subtotal": 0.00},
        {"store": "Store B", "items": ["Exact Product - $x.xx"], "subtotal": 0.00}
      ],
      "tip": "tip"
    },
    {
      "rank": 3,
      "label": "Best three stores",
      "stores": [
        {"name": "Store A", "address": "TBD", "distanceKm": 0, "hours": "check website"},
        {"name": "Store B", "address": "TBD", "distanceKm": 0, "hours": "check website"},
        {"name": "Store C", "address": "TBD", "distanceKm": 0, "hours": "check website"}
      ],
      "totalCAD": 0.00,
      "savingsVsWorst": 0.00,
      "trips": 3,
      "breakdown": [
        {"store": "Store A", "items": ["Exact Product - $x.xx"], "subtotal": 0.00},
        {"store": "Store B", "items": ["Exact Product - $x.xx"], "subtotal": 0.00},
        {"store": "Store C", "items": ["Exact Product - $x.xx"], "subtotal": 0.00}
      ],
      "tip": "tip"
    }
  ],
  "budgetCAD": ${budget || 200},
  "withinBudget": true,
  "overBy": 0,
  "perItemPrices": [{"name": "Exact Product Name Size", "store": "store from search", "price": 0.00, "source": "exact URL or site name from search results"}],
  "priceNote": "Prices sourced from online search of walmart.ca, loblaws.ca, nofrills.ca and flyer sites. Some items may show 'price not found' if not available online. Always verify in-store."
}`;

      const aiResponse = await callAI(
        "You extract real grocery prices from web search results. NEVER guess or estimate prices. Only report what is explicitly found in search results. Return ONLY valid JSON.",
        aiPrompt,
        groqKey,
        geminiKey,
        4096
      );

      if (!aiResponse || aiResponse.trim() === "") {
        return res.status(500).json({ error: "No response from AI" });
      }

      const clean = aiResponse.replace(/```json|```/g, "").replace(/[\r\n]+/g, " ").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return res.status(500).json({ error: "Could not parse response" });
      return res.status(200).json({ text: match[0] });

    } catch (err) {
      console.error("Price search error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── STANDARD AI MODE ───────────────────────────────────────────────
  try {
    const text = await callAI(
      system || "You are a helpful assistant.",
      prompt || "",
      groqKey,
      geminiKey,
      4096,
      true
    );
    const cleaned = text.replace(/\\n/g, " ").replace(/\n/g, " ").trim();
    return res.status(200).json({ text: cleaned });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function webSearch(query, serperKey) {
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": serperKey },
      body: JSON.stringify({ q: query, gl: "ca", hl: "en", num: 5 })
    });
    const data = await res.json();
    const organic = (data.organic || []).slice(0, 5).map(r => ({ title: r.title || "", snippet: r.snippet || "" }));
    const answerBox = data.answerBox ? [{ title: "Answer", snippet: data.answerBox.answer || data.answerBox.snippet || "" }] : [];
    return [...answerBox, ...organic];
  } catch (e) { return []; }
}

function getCity(postalClean) {
  const prefix = postalClean.slice(0, 3).toUpperCase();
  const map = {
    "L6C":"Markham","L6B":"Markham","L6E":"Markham","L6G":"Markham",
    "L3R":"Markham","L3S":"Markham","L3T":"Markham",
    "M1B":"Scarborough","M1C":"Scarborough","M1E":"Scarborough",
    "M1G":"Scarborough","M1H":"Scarborough","M1J":"Scarborough",
    "M1K":"Scarborough","M1L":"Scarborough","M1M":"Scarborough",
    "M1N":"Scarborough","M1P":"Scarborough","M1R":"Scarborough",
    "M1S":"Scarborough","M1T":"Scarborough","M1V":"Scarborough",
    "M1W":"Scarborough","M1X":"Scarborough",
    "M2H":"North York","M2J":"North York","M2K":"North York",
    "M2L":"North York","M2M":"North York","M2N":"North York",
    "M2P":"North York","M2R":"North York",
    "M3A":"North York","M3B":"North York","M3C":"North York",
    "M3H":"North York","M3J":"North York","M3K":"North York",
    "M3L":"North York","M3M":"North York","M3N":"North York",
    "M4A":"East York","M4B":"East York","M4C":"East York",
    "M4E":"East End Toronto","M4G":"Leaside",
    "M4H":"East York","M4J":"East York","M4K":"East York",
    "M4L":"East End Toronto","M4M":"East End Toronto",
    "M4N":"Lawrence Park","M4P":"Davisville",
    "M4R":"North Toronto","M4S":"Davisville",
    "M4T":"Midtown Toronto","M4V":"Forest Hill",
    "M4W":"Rosedale","M4X":"Cabbagetown",
    "M4Y":"Church-Yonge Corridor",
    "M5A":"Downtown Toronto","M5B":"Downtown Toronto",
    "M5C":"Downtown Toronto","M5E":"Downtown Toronto",
    "M5G":"Downtown Toronto","M5H":"Downtown Toronto",
    "M5J":"Downtown Toronto","M5K":"Downtown Toronto",
    "M5L":"Downtown Toronto","M5M":"Bedford Park",
    "M5N":"Lawrence Park","M5P":"Forest Hill",
    "M5R":"Annex","M5S":"University of Toronto",
    "M5T":"Kensington Market","M5V":"Downtown Toronto",
    "M5W":"Downtown Toronto","M5X":"Downtown Toronto",
    "M6A":"Lawrence Heights","M6B":"Glencairn",
    "M6C":"Humewood","M6E":"Caledonia",
    "M6G":"Christie","M6H":"Dufferin Grove",
    "M6J":"Trinity Bellwoods","M6K":"Parkdale",
    "M6L":"Maple Leaf","M6M":"Mount Dennis",
    "M6N":"Runnymede","M6P":"High Park",
    "M6R":"Roncesvalles","M6S":"Swansea",
    "M8V":"Etobicoke","M8W":"Etobicoke",
    "M8X":"Etobicoke","M8Y":"Etobicoke",
    "M8Z":"Etobicoke","M9A":"Etobicoke",
    "M9B":"Etobicoke","M9C":"Etobicoke",
    "M9L":"Humber Summit","M9M":"Humber Summit",
    "M9N":"Weston","M9P":"Humberlea",
    "M9R":"Kingsview Village","M9V":"Etobicoke",
    "M9W":"Etobicoke",
    "L4B":"Richmond Hill","L4C":"Richmond Hill",
    "L4E":"Richmond Hill","L4S":"Richmond Hill",
    "L3Y":"Newmarket","L3X":"Newmarket","L9N":"Newmarket",
    "L4J":"Thornhill","L4K":"Vaughan","L4L":"Vaughan",
    "L6A":"Maple","L6K":"Oakville","L6L":"Oakville",
    "L5A":"Mississauga","L5B":"Mississauga","L5C":"Mississauga",
    "L5E":"Mississauga","L5G":"Mississauga","L5H":"Mississauga",
    "L5J":"Mississauga","L5K":"Mississauga","L5L":"Mississauga",
    "L5M":"Mississauga","L5N":"Mississauga","L5R":"Mississauga",
    "L5S":"Mississauga","L5T":"Mississauga","L5V":"Mississauga",
    "L5W":"Mississauga","L4T":"Mississauga","L4V":"Mississauga",
    "L4W":"Mississauga","L4X":"Mississauga","L4Y":"Mississauga",
    "L4Z":"Mississauga",
    "L7A":"Brampton","L6P":"Brampton","L6R":"Brampton",
    "L6S":"Brampton","L6T":"Brampton","L6V":"Brampton",
    "L6W":"Brampton","L6X":"Brampton","L6Y":"Brampton",
    "L6Z":"Brampton",
  };
  return map[prefix] || "Toronto";
}

async function callGroq(system, prompt, apiKey, maxTokens = 2048, fast = false) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    },
    body: JSON.stringify({
      model: fast ? "gemma2-9b-it" : "llama-3.3-70b-versatile",
      max_tokens: maxTokens,
      temperature: fast ? 0.7 : 0.1,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ]
    }),
  });
  const data = await response.json();
  if (data.error) {
    console.error("Groq error:", JSON.stringify(data.error));
    return null; // signal fallback needed
  }
  return data?.choices?.[0]?.message?.content ?? null;
}

async function callGemini(system, prompt, apiKey, maxTokens = 2048) {
  const fullPrompt = system + "\n\n" + prompt;
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens }
      }),
    }
  );
  const data = await response.json();
  if (data.error) {
    console.error("Gemini error:", JSON.stringify(data.error));
    return null;
  }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

async function callClaude(system, prompt, apiKey, maxTokens = 2048) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system: system,
      messages: [{ role: "user", content: prompt }]
    }),
  });
  const data = await response.json();
  if (data.error) {
    console.error("Claude error:", JSON.stringify(data.error));
    return null;
  }
  return data?.content?.[0]?.text ?? null;
}

async function callOpenRouter(system, prompt, maxTokens = 2048) {
  const apiKey = process.env.OPENROUTER_KEY;
  if (!apiKey) return null;
  // Try multiple free models in case one is down
  const freeModels = [
    "deepseek/deepseek-r1:free",
    "deepseek/deepseek-chat-v3-0324:free",
    "google/gemma-3-27b-it:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
  ];
  for (const model of freeModels) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + apiKey,
          "HTTP-Referer": "https://mygroceryweek.vercel.app",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt }
          ]
        }),
      });
      const data = await response.json();
      if (data.error) { console.error("OpenRouter " + model + " error:", data.error.code); continue; }
      const text = data?.choices?.[0]?.message?.content;
      if (text && text.trim()) { console.log("OpenRouter success with:", model); return text; }
    } catch(e) { continue; }
  }
  return null;
}

async function callAI(system, prompt, groqKey, geminiKey, maxTokens = 2048, fast = false) {
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  // Race all providers simultaneously - use whoever responds first
  const promises = [];
  if (groqKey) promises.push(callGroq(system, prompt, groqKey, maxTokens, fast).catch(() => null));
  if (geminiKey) promises.push(callGemini(system, prompt, geminiKey, maxTokens).catch(() => null));
  if (claudeKey) promises.push(callClaude(system, prompt, claudeKey, maxTokens).catch(() => null));
  promises.push(callOpenRouter(system, prompt, maxTokens).catch(() => null));

  // Try each result as they come in
  const results = await Promise.allSettled(promises);
  for (const r of results) {
    const val = r.status === "fulfilled" ? r.value : null;
    if (val && val.trim() !== "") {
      console.log("AI response received");
      return val;
    }
  }
  throw new Error("All AI providers are currently unavailable. Please try again in a few minutes.");
}
