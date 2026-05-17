export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const serperKey = process.env.SERPER_KEY;

  const { prompt, system, mode, items, postal, budget, itemName, targetPrice } = req.body;

  // ── WISHLIST SALE CHECK ───────────────────────────────────────────
  if (mode === "wishlist" && itemName && postal && serperKey) {
    try {
      const city = getCity(postal.replace(/\s/g, "").toUpperCase());
      const [r1, r2, r3] = await Promise.all([
        webSearch('"' + itemName + '" price walmart.ca OR loblaws.ca OR nofrills.ca Canada 2026', serperKey),
        webSearch(itemName + ' grocery sale price ' + city + ' Ontario Canada 2026', serperKey),
        webSearch(itemName + ' flyer deal Canada supermarket this week 2026', serperKey),
      ]);
      const snippets = [...r1, ...r2, ...r3].slice(0, 12).map(r => r.title + ": " + r.snippet).join("\n");
      const aiResponse = await callAI(
        "You extract grocery prices from web search results. Only report prices explicitly found. Return ONLY valid JSON.",
        `Find current price of "${itemName}" near ${city}, Ontario from these search results:\n\n${snippets}\n\nReturn ONLY: {"currentPrice":0.00,"regularPrice":0.00,"onSale":false,"saleStore":"store name or null","saleEnds":"date or unknown","savings":0.00,"note":"what you found"}`,
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

  // ── PRICE SEARCH MODE ─────────────────────────────────────────────
  if (mode === "prices" && items && postal && serperKey) {
    try {
      const postalClean = postal.replace(/\s/g, "").toUpperCase();
      const city = getCity(postalClean);
      const itemList = Array.isArray(items) ? items : items.split(",").map(s => s.trim());

      // Search EVERY item individually for thorough price coverage
      // Run in parallel batches of 4 to stay within timeout
      const allItemSnippets = {};
      const batchSize = 4;
      for (let i = 0; i < itemList.length; i += batchSize) {
        const batch = itemList.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(item => webSearch(
            '"' + item + '" price canada grocery walmart loblaws "no frills" "food basics" 2026',
            serperKey
          ))
        );
        batch.forEach((item, idx) => {
          allItemSnippets[item] = batchResults[idx].map(r => r.title + ": " + r.snippet).join("\n");
        });
      }

      // Search store locations separately
      const storeSearch = await webSearch(
        'Walmart Loblaws "No Frills" FreshCo "Food Basics" store address hours ' + city + ' Ontario ' + postal,
        serperKey
      );
      const storeSnippets = storeSearch.map(r => r.title + ": " + r.snippet).join("\n");

      // Build price context with per-item search results
      const priceContext = Object.entries(allItemSnippets).map(([item, snippets]) =>
        `=== ${item} ===\n${snippets}`
      ).join("\n\n");

      const aiPrompt = `You are a Canadian grocery price expert. Extract REAL prices from these web search results.

SEARCH RESULTS PER ITEM:
${priceContext}

STORE LOCATION RESULTS:
${storeSnippets}

ITEMS NEEDED: ${itemList.join(", ")}
CITY: ${city}, Ontario, postal ${postal}
BUDGET: $${budget || 200} CAD

INSTRUCTIONS:
- For each item, carefully read its search results and find any price mentioned (look for $, /ea, /lb, /kg, "for $", "at $", "only $")
- Use the cheapest price found across all stores
- Specify exact product brand and size found (e.g. "Beatrice 2% Milk 2L - $4.97 at Walmart")
- For store addresses, use addresses found in store search results
- For store hours, use hours found in store search results
- If an item has no price in search results, still include it but note "price varies - check store"
- Calculate realistic totals based on prices found

Return ONLY this JSON (no markdown):
{
  "combinations": [
    {
      "rank": 1,
      "label": "Best single store",
      "stores": [{"name": "Store Name", "address": "Real address from search, ${city} ON", "distanceKm": 2.5, "hours": "Hours from search"}],
      "totalCAD": 0.00,
      "savingsVsWorst": 0.00,
      "trips": 1,
      "breakdown": [{"store": "Store", "items": ["Exact Product Size - $x.xx"], "subtotal": 0.00}],
      "tip": "tip based on actual prices found"
    },
    {
      "rank": 2,
      "label": "Best two stores",
      "stores": [
        {"name": "Store A", "address": "Real address, ${city} ON", "distanceKm": 1.5, "hours": "Hours"},
        {"name": "Store B", "address": "Real address, ${city} ON", "distanceKm": 3.2, "hours": "Hours"}
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
        {"name": "Store A", "address": "Real address, ${city} ON", "distanceKm": 1.5, "hours": "Hours"},
        {"name": "Store B", "address": "Real address, ${city} ON", "distanceKm": 2.8, "hours": "Hours"},
        {"name": "Store C", "address": "Real address, ${city} ON", "distanceKm": 4.1, "hours": "Hours"}
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
  "perItemPrices": [{"name": "Exact Product Name Size", "store": "store", "price": 0.00, "source": "search result source"}],
  "saleItems": ["item1", "item2"],
  "priceNote": "Prices from web search of walmart.ca, loblaws.ca, nofrills.ca. Verify in-store before shopping."
}`;

      const aiResponse = await callAI(
        "You extract real grocery prices from web search results. Be thorough — find prices in all snippets. Return ONLY valid JSON.",
        aiPrompt, groqKey, geminiKey, 4096
      );

      const clean = aiResponse.replace(/```json|```/g, "").replace(/[\r\n]+/g, " ").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return res.status(500).json({ error: "Could not parse response" });
      return res.status(200).json({ text: match[0] });

    } catch (err) {
      console.error("Price error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── STANDARD AI MODE ──────────────────────────────────────────────
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
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
    body: JSON.stringify({
      model: fast ? "gemma2-9b-it" : "llama-3.3-70b-versatile",
      max_tokens: maxTokens,
      temperature: 0.1,
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }]
    }),
  });
  const data = await response.json();
  if (data.error) return null;
  return data?.choices?.[0]?.message?.content ?? null;
}

async function callGemini(system, prompt, apiKey, maxTokens = 2048) {
  const response = await fetch(
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
  const data = await response.json();
  if (data.error) return null;
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

async function callClaude(system, prompt, apiKey, maxTokens = 2048) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system: system,
      messages: [{ role: "user", content: prompt }]
    }),
  });
  const data = await response.json();
  if (data.error) return null;
  return data?.content?.[0]?.text ?? null;
}

async function callOpenRouter(system, prompt, maxTokens = 2048) {
  const apiKey = process.env.OPENROUTER_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
        "HTTP-Referer": "https://mygroceryweek.vercel.app",
        "X-Title": "MyGroceryWeek"
      },
      body: JSON.stringify({
        model: "openrouter/auto",
        max_tokens: maxTokens,
        temperature: 0.1,
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }]
      }),
    });
    const data = await response.json();
    if (data.error) { console.error("OpenRouter:", JSON.stringify(data.error)); return null; }
    return data?.choices?.[0]?.message?.content ?? null;
  } catch(e) { return null; }
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
  throw new Error("All AI providers unavailable. Please try again.");
}
