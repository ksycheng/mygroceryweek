export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const groqKey = process.env.GROQ_API_KEY;
  const serperKey = process.env.SERPER_KEY;
  if (!groqKey) return res.status(500).json({ error: "No GROQ API key" });

  const { prompt, system, mode, items, postal, budget, itemName, targetPrice } = req.body;

  // ── WISHLIST SALE CHECK MODE ──────────────────────────────────────
  if (mode === "wishlist" && itemName && postal && serperKey) {
    try {
      const postalClean = postal.replace(/\s/g, "").toUpperCase();
      const city = getCity(postalClean);

      // Search for current sale price of specific item
      const [saleResults, flyerResults] = await Promise.all([
        webSearch('"' + itemName + '" sale price ' + city + ' Ontario Canada grocery flyer this week 2025', serperKey),
        webSearch(itemName + ' flyer deal Loblaws Walmart "No Frills" FreshCo "Food Basics" ' + city + ' 2025', serperKey),
      ]);

      const searchSnippets = [
        ...saleResults.map(r => r.title + ": " + r.snippet),
        ...flyerResults.map(r => r.title + ": " + r.snippet),
      ].slice(0, 10).join("\n");

      const aiPrompt = `Based on these web search results, what is the current price of "${itemName}" at grocery stores near ${city}, Ontario?

SEARCH RESULTS:
${searchSnippets}

Is "${itemName}" currently on sale? What is the regular price vs sale price?
${targetPrice ? 'The user wants to be alerted if price drops below $' + targetPrice + ' CAD.' : ''}

Return ONLY this JSON (no markdown):
{"currentPrice":0.00,"regularPrice":0.00,"onSale":false,"saleStore":"Store name or null","saleEnds":"date or unknown","savings":0.00,"note":"e.g. Coca-Cola 12pk $7.99 at No Frills, regular $10.99"}`;

      const aiResponse = await callGroq(
        "You are a Canadian grocery price expert. Extract real prices from web search results. Return ONLY valid JSON.",
        aiPrompt, groqKey, 1024
      );

      const clean = aiResponse.replace(/```json|```/g, "").replace(/[\r\n]+/g, " ").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return res.status(200).json({ result: null, error: "Could not parse" });
      return res.status(200).json({ result: JSON.parse(match[0]) });

    } catch (err) {
      console.error("Wishlist check error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PRICE SEARCH MODE ──────────────────────────────────────────────
  if (mode === "prices" && items && postal && serperKey) {
    try {
      const postalClean = postal.replace(/\s/g, "").toUpperCase();
      const city = getCity(postalClean);
      const itemList = Array.isArray(items) ? items : items.split(",").map(s => s.trim());

      // Single focused search for all items + flyers
      const itemStr = itemList.slice(0, 8).join(" ");
      const [itemResults, flyerResults] = await Promise.all([
        webSearch("cheapest " + itemStr + " grocery price " + city + " Ontario Canada 2025", serperKey),
        webSearch("No Frills Loblaws Walmart FreshCo flyer deals " + city + " Ontario this week", serperKey),
      ]);

      const searchSnippets = [
        ...itemResults.map(r => r.title + ": " + r.snippet),
        ...flyerResults.map(r => r.title + ": " + r.snippet),
      ].slice(0, 12).join("\n");

      const aiPrompt = `Canadian grocery price expert. Find prices for items near ${city}, ON (${postal}).

WEB SEARCH RESULTS:
${searchSnippets}

ITEMS: ${itemList.join(", ")}
BUDGET: $${budget || 200} CAD

Rules:
- Use specific brand+size for each item (e.g. "Lay's Classic 200g" not just "chips")
- Use REAL full street addresses for stores in ${city} (e.g. "4261 Highway 7, Markham, ON L3R 9W6")
- Use prices from search results where found, estimate otherwise
- Format items as "Brand Product Size - $x.xx"

Return ONLY this JSON:
{"combinations":[{"rank":1,"label":"Best single store","stores":[{"name":"Store","address":"Full address, ${city}, ON","distanceKm":1.5,"hours":"Mon-Sun 7am-11pm"}],"totalCAD":0.00,"savingsVsWorst":0.00,"trips":1,"breakdown":[{"store":"Store","items":["Brand Product Size - $x.xx"],"subtotal":0.00}],"tip":"tip"},{"rank":2,"label":"Best two stores","stores":[{"name":"Store A","address":"Full address, ${city}, ON","distanceKm":1.2,"hours":"Mon-Sun 8am-10pm"},{"name":"Store B","address":"Full address, ${city}, ON","distanceKm":2.5,"hours":"Mon-Sun 7am-11pm"}],"totalCAD":0.00,"savingsVsWorst":0.00,"trips":2,"breakdown":[{"store":"Store A","items":["Brand Product Size - $x.xx"],"subtotal":0.00},{"store":"Store B","items":["Brand Product Size - $x.xx"],"subtotal":0.00}],"tip":"tip"},{"rank":3,"label":"Best three stores","stores":[{"name":"Store A","address":"Full address, ${city}, ON","distanceKm":1.2,"hours":"Mon-Sun 7am-11pm"},{"name":"Store B","address":"Full address, ${city}, ON","distanceKm":2.5,"hours":"Mon-Sun 8am-10pm"},{"name":"Store C","address":"Full address, ${city}, ON","distanceKm":3.8,"hours":"Mon-Sat 9am-9pm"}],"totalCAD":0.00,"savingsVsWorst":0.00,"trips":3,"breakdown":[{"store":"Store A","items":["Brand Product Size - $x.xx"],"subtotal":0.00},{"store":"Store B","items":["Brand Product Size - $x.xx"],"subtotal":0.00},{"store":"Store C","items":["Brand Product Size - $x.xx"],"subtotal":0.00}],"tip":"tip"}],"budgetCAD":${budget || 200},"withinBudget":true,"overBy":0,"perItemPrices":[{"name":"Brand Product Size","store":"store","price":0.00,"source":"web"}],"priceNote":"Prices from web search for ${city}. Verify in-store."}`;

      const aiResponse = await callGroq(
        "You are a Canadian grocery price expert. Return ONLY valid compact JSON, no markdown, no newlines.",
        aiPrompt,
        groqKey,
        4096
      );

      if (!aiResponse || aiResponse.trim() === "") {
        return res.status(500).json({ error: "AI returned empty response" });
      }

      const clean = aiResponse.replace(/```json|```/g, "").replace(/[\r\n]+/g, " ").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return res.status(500).json({ error: "Could not parse AI response", raw: clean.substring(0, 200) });
      return res.status(200).json({ text: match[0] });

    } catch (err) {
      console.error("Price search error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── STANDARD AI MODE ───────────────────────────────────────────────
  try {
    const text = await callGroq(
      system || "You are a helpful assistant.",
      prompt || "",
      groqKey,
      4096
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
    const organic = (data.organic || []).slice(0, 5).map(r => ({
      title: r.title || "", snippet: r.snippet || ""
    }));
    const answerBox = data.answerBox
      ? [{ title: "Answer", snippet: data.answerBox.answer || data.answerBox.snippet || "" }]
      : [];
    return [...answerBox, ...organic];
  } catch (e) { return []; }
}

function getCity(postalClean) {
  const prefix = postalClean.slice(0, 3).toUpperCase();
  const map = {
    "L6C": "Markham", "L6B": "Markham", "L6E": "Markham", "L6G": "Markham",
    "L3R": "Markham", "L3S": "Markham", "L3T": "Markham",
    "M1B": "Scarborough", "M1C": "Scarborough", "M1E": "Scarborough",
    "M1G": "Scarborough", "M1H": "Scarborough", "M1J": "Scarborough",
    "M1K": "Scarborough", "M1L": "Scarborough", "M1M": "Scarborough",
    "M1N": "Scarborough", "M1P": "Scarborough", "M1R": "Scarborough",
    "M1S": "Scarborough", "M1T": "Scarborough", "M1V": "Scarborough",
    "M1W": "Scarborough", "M1X": "Scarborough",
    "M2H": "North York", "M2J": "North York", "M2K": "North York",
    "M2L": "North York", "M2M": "North York", "M2N": "North York",
    "M2P": "North York", "M2R": "North York",
    "M3A": "North York", "M3B": "North York", "M3C": "North York",
    "M3H": "North York", "M3J": "North York", "M3K": "North York",
    "M3L": "North York", "M3M": "North York", "M3N": "North York",
    "M4A": "East York", "M4B": "East York", "M4C": "East York",
    "M4E": "East End Toronto", "M4G": "Leaside",
    "M4H": "East York", "M4J": "East York", "M4K": "East York",
    "M4L": "East End Toronto", "M4M": "East End Toronto",
    "M4N": "Lawrence Park", "M4P": "Davisville",
    "M4R": "North Toronto", "M4S": "Davisville",
    "M4T": "Midtown Toronto", "M4V": "Forest Hill",
    "M4W": "Rosedale", "M4X": "Cabbagetown",
    "M4Y": "Church-Yonge Corridor",
    "M5A": "Downtown Toronto", "M5B": "Downtown Toronto",
    "M5C": "Downtown Toronto", "M5E": "Downtown Toronto",
    "M5G": "Downtown Toronto", "M5H": "Downtown Toronto",
    "M5J": "Downtown Toronto", "M5K": "Downtown Toronto",
    "M5L": "Downtown Toronto", "M5M": "Bedford Park",
    "M5N": "Lawrence Park", "M5P": "Forest Hill",
    "M5R": "Annex", "M5S": "University of Toronto",
    "M5T": "Kensington Market", "M5V": "Downtown Toronto",
    "M5W": "Downtown Toronto", "M5X": "Downtown Toronto",
    "M6A": "Lawrence Heights", "M6B": "Glencairn",
    "M6C": "Humewood", "M6E": "Caledonia",
    "M6G": "Christie", "M6H": "Dufferin Grove",
    "M6J": "Trinity Bellwoods", "M6K": "Parkdale",
    "M6L": "Maple Leaf", "M6M": "Mount Dennis",
    "M6N": "Runnymede", "M6P": "High Park",
    "M6R": "Roncesvalles", "M6S": "Swansea",
    "M8V": "Etobicoke", "M8W": "Etobicoke",
    "M8X": "Etobicoke", "M8Y": "Etobicoke",
    "M8Z": "Etobicoke", "M9A": "Etobicoke",
    "M9B": "Etobicoke", "M9C": "Etobicoke",
    "M9L": "Humber Summit", "M9M": "Humber Summit",
    "M9N": "Weston", "M9P": "Humberlea",
    "M9R": "Kingsview Village", "M9V": "Etobicoke",
    "M9W": "Etobicoke",
    "L4B": "Richmond Hill", "L4C": "Richmond Hill",
    "L4E": "Richmond Hill", "L4S": "Richmond Hill",
    "L3Y": "Newmarket", "L3X": "Newmarket", "L9N": "Newmarket",
    "L4J": "Thornhill", "L4K": "Vaughan", "L4L": "Vaughan",
    "L6A": "Maple", "L6K": "Oakville", "L6L": "Oakville",
    "L5A": "Mississauga", "L5B": "Mississauga", "L5C": "Mississauga",
    "L5E": "Mississauga", "L5G": "Mississauga", "L5H": "Mississauga",
    "L5J": "Mississauga", "L5K": "Mississauga", "L5L": "Mississauga",
    "L5M": "Mississauga", "L5N": "Mississauga", "L5R": "Mississauga",
    "L5S": "Mississauga", "L5T": "Mississauga", "L5V": "Mississauga",
    "L5W": "Mississauga", "L4T": "Mississauga", "L4V": "Mississauga",
    "L4W": "Mississauga", "L4X": "Mississauga", "L4Y": "Mississauga",
    "L4Z": "Mississauga",
    "L7A": "Brampton", "L6P": "Brampton", "L6R": "Brampton",
    "L6S": "Brampton", "L6T": "Brampton", "L6V": "Brampton",
    "L6W": "Brampton", "L6X": "Brampton", "L6Y": "Brampton",
    "L6Z": "Brampton",
  };
  return map[prefix] || "Toronto";
}

async function callGroq(system, prompt, apiKey, maxTokens = 2048) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: maxTokens,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ]
    }),
  });
  const data = await response.json();
  if (data.error) console.error("Groq error:", JSON.stringify(data.error));
  return data?.choices?.[0]?.message?.content ?? "";
}
