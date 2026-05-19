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

      // 3 searches per item: shopping API (best prices) + store sites + flyers
      const [itemResults, storeResults] = await Promise.all([
        Promise.all(cleanedItems.map(item => Promise.all([
          shoppingSearch(item, serperKey),  // Google Shopping — real prices from product listings
          webSearch(item + ' price (site:walmart.ca OR site:loblaws.ca OR site:nofrills.ca OR site:metro.ca OR site:costco.ca OR site:sobeys.com OR site:realcanadiansuperstore.ca OR site:freshco.com)', serperKey),
          webSearch(item + ' flyer price ' + city + ' Ontario (site:flipp.com OR site:reebee.com OR site:grocery.ca)', serperKey),
        ]))),
        Promise.all([
          webSearch('Walmart Loblaws "No Frills" "Real Canadian Superstore" grocery store ' + city + ' Ontario address hours', serperKey),
          webSearch('Costco Metro Sobeys FreshCo "Food Basics" grocery store ' + city + ' Ontario address hours', serperKey),
        ])
      ]);

      const itemSnippets = {};
      cleanedItems.forEach((item, idx) => {
        const combined = itemResults[idx].flat().slice(0, 12);
        itemSnippets[item] = combined.map(r => (r.title + ": " + r.snippet).substring(0, 300)).join("\n");
      });

      return res.status(200).json({
        itemSnippets,
        storeSnippets: storeResults.flat().slice(0, 12).map(r => (r.title + ": " + r.snippet).substring(0, 250)).join("\n"),
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

      // Run all batches in PARALLEL — fires simultaneously, done in ~2s total
      const BATCH = 4;
      const batches = [];
      for (let i = 0; i < cleanedItems.length; i += BATCH) batches.push(cleanedItems.slice(i, i + BATCH));
      console.log("Parallel batches:", batches.length, "for", cleanedItems.length, "items");
      const batchResults = await Promise.all(batches.map(async (batchItems, bi) => {
        const priceContext = batchItems.map(item => "=== " + item + " ===\n" + (itemSnippets[item] || "")).join("\n\n");
        try {
          const aiResp = await callAI(
            "Extract ONLY prices explicitly stated in snippets. Never invent prices. Return ONLY valid JSON.",
            buildAnalyzePrompt(batchItems, priceContext, storeSnippets, city, postal, budgetAmt),
            groqKey, geminiKey, 1500
          );
          if (!aiResp) return [];
          const clean = aiResp.replace(/```json|```/g, "").replace(/[\r\n]+/g, " ").trim();
          // Handle both {perItemPrices:[...]} and [{...}] formats
          let items = [];
          const objMatch = clean.match(/\{[\s\S]*\}/);
          if (objMatch) {
            try {
              const parsed = JSON.parse(objMatch[0]);
              items = parsed.perItemPrices || [];
            } catch(e) { console.error("Batch", bi, "obj parse err:", e.message); }
          }
          if (items.length === 0) {
            const arrMatch = clean.match(/\[[\s\S]*\]/);
            if (arrMatch) {
              try { items = JSON.parse(arrMatch[0]); } catch(e) {}
            }
          }
          console.log("Batch", bi, "found", items.length, "prices");
          return items.filter(p => p.name && p.store && p.store !== "store" && p.price > 0);
        } catch(e) { console.error("Batch", bi, "err:", e.message); return []; }
      }));
      const allPrices = batchResults.flat();
      console.log("Total prices:", allPrices.length);
      // For each item pick the cheapest price found across all stores
      const itemNames = [...new Set(allPrices.map(p => p.name))];
      const cheapestPerItem = {};
      itemNames.forEach(name => {
        const options = allPrices.filter(p => p.name === name);
        if (options.length > 0) cheapestPerItem[name] = options.reduce((best, p) => p.price < best.price ? p : best);
      });

      // Build store groups from cheapest prices
      const storeInfo = {}; // store name -> { address, hours }
      allPrices.forEach(p => {
        if (p.store && !storeInfo[p.store]) {
          storeInfo[p.store] = { address: p.address || null, hours: p.hours || null };
        }
      });

      // Enrich store addresses using Google Places API
      const placesKey = process.env.GOOGLE_PLACES_KEY;
      await Promise.all(Object.keys(storeInfo).map(async store => {
        if (!storeInfo[store].address) {
          const place = await getStoreAddress(store, city, placesKey);
          if (place) { storeInfo[store].address = place.address; storeInfo[store].hours = place.hours; }
        }
        if (!storeInfo[store].address) storeInfo[store].address = city + ", ON";
      }));

      // Group cheapest items by store
      const storeGroups = {};
      Object.values(cheapestPerItem).forEach(p => {
        if (!storeGroups[p.store]) storeGroups[p.store] = [];
        storeGroups[p.store].push(p);
      });

      // Sort stores by number of cheapest items (most items = best single-store)
      const sortedStores = Object.entries(storeGroups).sort((a, b) => b[1].length - a[1].length);
      const allStoreNames = sortedStores.map(([s]) => s);

      // Strategy 1: Best single store (most items cheapest there)
      // Strategy 2: Best two stores (cheapest combo of 2)
      // Strategy 3: Best three stores (cheapest combo of 3)
      const buildCombo = (storeNames, rank, label) => {
        const breakdown = storeNames.map(store => {
          const items = (storeGroups[store] || []);
          return {
            store,
            items: items.map(p => p.name + " - $" + p.price.toFixed(2) + (p.source ? " (source: " + p.source + ")" : "")),
            subtotal: +items.reduce((s, p) => s + p.price, 0).toFixed(2)
          };
        });
        const total = +breakdown.reduce((s, b) => s + b.subtotal, 0).toFixed(2);
        return {
          rank, label,
          stores: storeNames.map(s => ({ name: s, address: (storeInfo[s] || {}).address || (city + ", ON"), hours: (storeInfo[s] || {}).hours || null })),
          totalCAD: total,
          savingsVsWorst: 0,
          trips: storeNames.length,
          breakdown,
          tip: "Prices from live web search. Always verify in-store before shopping."
        };
      };

      // Build optimal multi-store combos by splitting items to minimize total cost
      // For each additional store, only include items cheaper there than at previous stores
      const buildOptimalCombos = () => {
        const results = [];
        const storeList = sortedStores.map(([s, items]) => ({ store: s, items }));
        if (storeList.length === 0) return results;

        // Strategy 1: best single store (store with most cheapest items)
        const s1 = storeList[0];
        const combo1 = buildCombo([s1.store], 1, "Best single store");
        results.push(combo1);

        // Strategy 2: find if any 2-store split is cheaper than 1 store
        if (storeList.length >= 2) {
          // Items not at store 1 that are cheapest at store 2
          const s2items = storeList[1].items;
          if (s2items.length > 0) {
            const combo2total = combo1.totalCAD + s2items.reduce((s, p) => s + p.price, 0);
            // Only show if it covers more items (not necessarily cheaper since store 1 already has cheapest)
            const combo2 = {
              rank: 2, label: "More items (2 stores)",
              stores: [
                { name: s1.store, address: (storeInfo[s1.store] || {}).address || (city + ", ON"), hours: (storeInfo[s1.store] || {}).hours || null },
                { name: storeList[1].store, address: (storeInfo[storeList[1].store] || {}).address || (city + ", ON"), hours: (storeInfo[storeList[1].store] || {}).hours || null }
              ],
              totalCAD: +combo2total.toFixed(2),
              savingsVsWorst: 0, trips: 2,
              breakdown: [
                { store: s1.store, items: s1.items.map(p => p.name + " - $" + p.price.toFixed(2)), subtotal: +s1.items.reduce((s,p)=>s+p.price,0).toFixed(2) },
                { store: storeList[1].store, items: s2items.map(p => p.name + " - $" + p.price.toFixed(2)), subtotal: +s2items.reduce((s,p)=>s+p.price,0).toFixed(2) }
              ],
              tip: "Covers more items across two stores — not necessarily cheaper overall."
            };
            results.push(combo2);
          }
        }

        // Strategy 3: add a third store for remaining items
        if (storeList.length >= 3) {
          const s3items = storeList[2].items;
          if (s3items.length > 0 && results.length >= 2) {
            const combo3total = results[1].totalCAD + s3items.reduce((s, p) => s + p.price, 0);
            const combo3 = {
              rank: 3, label: "Most coverage (3 stores)",
              stores: [
                ...results[1].stores,
                { name: storeList[2].store, address: (storeInfo[storeList[2].store] || {}).address || (city + ", ON"), hours: (storeInfo[storeList[2].store] || {}).hours || null }
              ],
              totalCAD: +combo3total.toFixed(2),
              savingsVsWorst: 0, trips: 3,
              breakdown: [
                ...results[1].breakdown,
                { store: storeList[2].store, items: s3items.map(p => p.name + " - $" + p.price.toFixed(2)), subtotal: +s3items.reduce((s,p)=>s+p.price,0).toFixed(2) }
              ],
              tip: "Maximum item coverage across three stores — most trips required."
            };
            results.push(combo3);
          }
        }

        // savingsVsWorst = how much cheaper vs the most expensive combo shown
        const worst = Math.max(...results.map(c => c.totalCAD));
        const best = Math.min(...results.map(c => c.totalCAD));
        results.forEach(c => { c.savingsVsWorst = +(c.totalCAD - best).toFixed(2); });
        return results;
      };

      const combinations = buildOptimalCombos();

      const validPrices = Object.values(cheapestPerItem);
      const totalCAD = validPrices.reduce((s, p) => s + p.price, 0);

      const result = {
        combinations,
        budgetCAD: budgetAmt,
        withinBudget: totalCAD <= budgetAmt,
        overBy: Math.max(0, +(totalCAD - budgetAmt).toFixed(2)),
        perItemPrices: Object.values(cheapestPerItem),
        saleItems: validPrices.filter(p => p.onSale).map(p => p.name),
        priceNote: "Prices from live web search (Walmart, Loblaws, No Frills, Costco, Metro, Sobeys, FreshCo). Cheapest price per item shown. Always verify in-store."
      };
      return res.status(200).json({ text: JSON.stringify(result) });
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

      // Shopping API + store sites + flyers for best price coverage
      const [itemResults, storeResults] = await Promise.all([
        Promise.all(cleanedItems.map(item => Promise.all([
          shoppingSearch(item, serperKey),
          webSearch(item + ' price (site:walmart.ca OR site:loblaws.ca OR site:nofrills.ca OR site:metro.ca OR site:costco.ca OR site:sobeys.com OR site:realcanadiansuperstore.ca OR site:freshco.com)', serperKey),
          webSearch(item + ' flyer price ' + city + ' Ontario (site:flipp.com OR site:reebee.com OR site:grocery.ca)', serperKey),
        ]))),
        Promise.all([
          webSearch('Walmart Loblaws "No Frills" "Real Canadian Superstore" grocery store ' + city + ' Ontario address hours phone', serperKey),
          webSearch('Costco Metro Sobeys FreshCo "Food Basics" grocery store ' + city + ' Ontario address hours phone', serperKey),
        ])
      ]);

      const itemSnippets = {};
      cleanedItems.forEach((item, idx) => {
        itemSnippets[item] = itemResults[idx].flat().slice(0, 12).map(r => (r.title + ": " + r.snippet).substring(0, 300)).join("\n");
      });
      const storeSnippets = storeResults.flat().slice(0, 12).map(r => (r.title + ": " + r.snippet).substring(0, 250)).join("\n");
      const priceContext = Object.entries(itemSnippets).map(([item, s]) => "=== " + item + " ===\n" + s).join("\n\n");

      // Run all batches in PARALLEL
      const BATCH_P = 4;
      const batchesP = [];
      for (let i = 0; i < cleanedItems.length; i += BATCH_P) batchesP.push(cleanedItems.slice(i, i + BATCH_P));
      const batchResultsP = await Promise.all(batchesP.map(async (batchItems, bi) => {
        const priceContext = batchItems.map(item => "=== " + item + " ===\n" + (itemSnippets[item] || "")).join("\n\n");
        try {
          const aiResp = await callAI(
            "Extract ONLY prices explicitly stated in snippets. Never invent prices. Return ONLY valid JSON.",
            buildAnalyzePrompt(batchItems, priceContext, storeSnippets, city, postal, budgetAmt),
            groqKey, geminiKey, 1500
          );
          if (!aiResp) return [];
          const clean = aiResp.replace(/```json|```/g, "").replace(/[\r\n]+/g, " ").trim();
          let items = [];
          const objMatch = clean.match(/\{[\s\S]*\}/);
          if (objMatch) {
            try {
              const parsed = JSON.parse(objMatch[0]);
              items = parsed.perItemPrices || [];
            } catch(e) {}
          }
          if (items.length === 0) {
            const arrMatch = clean.match(/\[[\s\S]*\]/);
            if (arrMatch) {
              try { items = JSON.parse(arrMatch[0]); } catch(e) {}
            }
          }
          return items.filter(p => p.name && p.store && p.store !== "store" && p.price > 0);
        } catch(e) { console.error("PricesBatch", bi, "err:", e.message); return []; }
      }));
      const allPricesP = batchResultsP.flat();
      const itemNamesP = [...new Set(allPricesP.map(p => p.name))];
      const cheapestPerItemP = {};
      itemNamesP.forEach(name => {
        const options = allPricesP.filter(p => p.name === name);
        if (options.length > 0) cheapestPerItemP[name] = options.reduce((best, p) => p.price < best.price ? p : best);
      });

      const storeInfoP = {};
      allPricesP.forEach(p => {
        if (p.store && !storeInfoP[p.store]) storeInfoP[p.store] = { address: p.address || (city + ", ON"), hours: p.hours || null };
      });

      const storeGroupsP = {};
      Object.values(cheapestPerItemP).forEach(p => {
        if (!storeGroupsP[p.store]) storeGroupsP[p.store] = [];
        storeGroupsP[p.store].push(p);
      });

      const sortedStoresP = Object.entries(storeGroupsP).sort((a, b) => b[1].length - a[1].length);
      const allStoreNamesP = sortedStoresP.map(([s]) => s);

      const buildComboP = (storeNames, rank, label) => {
        const breakdown = storeNames.map(store => {
          const items = storeGroupsP[store] || [];
          return { store, items: items.map(p => p.name + " - $" + p.price.toFixed(2) + (p.source ? " (source: " + p.source + ")" : "")), subtotal: +items.reduce((s, p) => s + p.price, 0).toFixed(2) };
        });
        return {
          rank, label,
          stores: storeNames.map(s => ({ name: s, address: (storeInfoP[s] || {}).address || (city + ", ON"), hours: (storeInfoP[s] || {}).hours || null })),
          totalCAD: +breakdown.reduce((s, b) => s + b.subtotal, 0).toFixed(2),
          savingsVsWorst: 0, trips: storeNames.length, breakdown,
          tip: "Prices from live web search. Always verify in-store before shopping."
        };
      };

      const combinationsP = [];
      if (sortedStoresP.length >= 1) {
        const s1P = sortedStoresP[0];
        combinationsP.push(buildComboP([s1P[0]], 1, "Best single store"));
        if (sortedStoresP.length >= 2 && sortedStoresP[1][1].length > 0) {
          const s2P = sortedStoresP[1];
          const c2 = {
            rank: 2, label: "More items (2 stores)",
            stores: [
              { name: s1P[0], address: (storeInfoP[s1P[0]]||{}).address||(city+", ON"), hours: (storeInfoP[s1P[0]]||{}).hours||null },
              { name: s2P[0], address: (storeInfoP[s2P[0]]||{}).address||(city+", ON"), hours: (storeInfoP[s2P[0]]||{}).hours||null }
            ],
            totalCAD: +([...s1P[1],...s2P[1]].reduce((s,p)=>s+p.price,0)).toFixed(2),
            savingsVsWorst: 0, trips: 2,
            breakdown: [
              { store: s1P[0], items: s1P[1].map(p=>p.name+" - $"+p.price.toFixed(2)), subtotal: +s1P[1].reduce((s,p)=>s+p.price,0).toFixed(2) },
              { store: s2P[0], items: s2P[1].map(p=>p.name+" - $"+p.price.toFixed(2)), subtotal: +s2P[1].reduce((s,p)=>s+p.price,0).toFixed(2) }
            ],
            tip: "Covers more items across two stores — not necessarily cheaper overall."
          };
          combinationsP.push(c2);
          if (sortedStoresP.length >= 3 && sortedStoresP[2][1].length > 0) {
            const s3P = sortedStoresP[2];
            combinationsP.push({
              rank: 3, label: "Most coverage (3 stores)",
              stores: [...c2.stores, { name: s3P[0], address: (storeInfoP[s3P[0]]||{}).address||(city+", ON"), hours: (storeInfoP[s3P[0]]||{}).hours||null }],
              totalCAD: +(c2.totalCAD + s3P[1].reduce((s,p)=>s+p.price,0)).toFixed(2),
              savingsVsWorst: 0, trips: 3,
              breakdown: [...c2.breakdown, { store: s3P[0], items: s3P[1].map(p=>p.name+" - $"+p.price.toFixed(2)), subtotal: +s3P[1].reduce((s,p)=>s+p.price,0).toFixed(2) }],
              tip: "Maximum item coverage across three stores — most trips required."
            });
          }
        }
        const worst = combinationsP[combinationsP.length-1]?.totalCAD || combinationsP[0].totalCAD;
        combinationsP.forEach(c => { c.savingsVsWorst = +Math.abs(worst - c.totalCAD).toFixed(2); });
      }

      const validPricesP = Object.values(cheapestPerItemP);
      const totalCADP = validPricesP.reduce((s, p) => s + p.price, 0);

      const result = {
        combinations: combinationsP, budgetCAD: budgetAmt,
        withinBudget: totalCADP <= budgetAmt,
        overBy: Math.max(0, +(totalCADP - budgetAmt).toFixed(2)),
        perItemPrices: validPricesP,
        saleItems: validPricesP.filter(p => p.onSale).map(p => p.name),
        priceNote: "Prices from live web search (Walmart, Loblaws, No Frills, Costco, Metro, Sobeys, FreshCo). Cheapest price per item shown. Always verify in-store."
      };
      return res.status(200).json({ text: JSON.stringify(result) });
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
      groqKey, geminiKey, 1500, true
    );
    return res.status(200).json({ text: text.replace(/\n/g, " ").trim() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function buildAnalyzePrompt(cleanedItems, priceContext, storeSnippets, city, postal, budgetAmt) {
  return "GROCERY PRICE SEARCH RESULTS (from walmart.ca, loblaws.ca, nofrills.ca, metro.ca, costco.ca, sobeys.com, flipp.com):\n" + priceContext +
    "\n\nSTORE LOCATION RESULTS NEAR " + city + ", Ontario:\n" + storeSnippets +
    "\n\nEXTRACT PRICES FOR: " + cleanedItems.join(", ") +
    "\n\nCRITICAL RULES:" +
    "\n1. Use ONLY prices explicitly written in the snippets (e.g. $2.99, 2 for $5)" +
    "\n2. NEVER invent or guess prices — if not in snippets, omit the item" +
    "\n3. store field MUST be the REAL store name from the snippet (e.g. Walmart, No Frills, Metro, Loblaws, Costco, Sobeys) — NEVER use 'store' or 'unknown'" +
    "\n4. address: extract from store location results above for that store in " + city + " — NEVER invent addresses like '123 Main St'" +
    "\n5. hours: extract from store location results — NEVER invent hours like '9am-6pm'" +
    "\n6. source: the snippet title the price came from (max 60 chars)" +
    "\n\nReturn ONLY valid JSON:\n" +
    '{"perItemPrices":[{"name":"exact item name","store":"Walmart","price":2.99,"onSale":false,"source":"snippet title","address":"full address from location results or null","hours":"hours from location results or null"}]}';
}

function cleanItemName(item) {
  return item
    .replace(/^\d+x?\s+/i, "")
    .replace(/^\d+\s*\/\s*\d+\s+/i, "")
    .replace(/^[\d.]+\s*(cups?|tbsp|tsp|tablespoons?|teaspoons?|pounds?|lbs?|kg|g|oz|ml|l|liters?|litres?|slices?|cloves?|pieces?|cans?|boxes?|bags?|bunches?|heads?|stalks?|sheets?)\s+/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .trim();
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


async function callGroq(system, prompt, apiKey, maxTokens, fast) {
  const models = fast
    ? ["llama-3.1-8b-instant", "gemma2-9b-it"]
    : ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

  for (const model of models) {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({
        model, max_tokens: maxTokens, temperature: 0.1,
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }]
      }),
    });
    const data = await r.json();
    if (data.error) {
      console.error("Groq " + model + ":", data.error.message);
      continue; // try next model
    }
    const text = data?.choices?.[0]?.message?.content ?? null;
    if (text) return text;
  }
  return null;
}

async function callGemini(system, prompt, apiKey, maxTokens) {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
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

async function getStoreAddress(storeName, city, placesKey) {
  if (!placesKey) return null;
  try {
    // Step 1: Find the place and get its place_id
    const query = encodeURIComponent(storeName + " grocery " + city + " Ontario Canada");
    const searchUrl = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=" + query + "&inputtype=textquery&fields=place_id,formatted_address,name&key=" + placesKey;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const candidate = searchData?.candidates?.[0];
    if (!candidate) { console.log("Places: no candidate for", storeName); return null; }

    // Step 2: Get place details including opening hours
    const placeId = candidate.place_id;
    const detailUrl = "https://maps.googleapis.com/maps/api/place/details/json?place_id=" + placeId + "&fields=formatted_address,opening_hours&key=" + placesKey;
    const detailRes = await fetch(detailUrl);
    const detailData = await detailRes.json();
    const details = detailData?.result;

    const address = details?.formatted_address || candidate.formatted_address || null;
    const weekdayText = details?.opening_hours?.weekday_text;
    const hours = weekdayText ? weekdayText.join(" | ") : null;
    console.log("Places found:", storeName, "->", address);
    return { address, hours };
  } catch(e) { console.error("Places error:", e.message); return null; }
}

async function callMistral(system, prompt, maxTokens) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({
        model: "open-mistral-nemo",
        max_tokens: maxTokens, temperature: 0.1,
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }]
      }),
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

  // For large analyze prompts: Gemini 1.5 Flash first (1M context, 1500 req/day free)
  // For fast/small prompts: Groq first (low latency)
  // Mistral first — reliable free tier with no daily quota cap
  // Groq and Gemini as fast fallbacks, Claude and OpenRouter as last resort
  const providers = [
    { name: "Mistral",    fn: () => callMistral(system, prompt, maxTokens) },
    { name: "Groq",       fn: () => groqKey  ? callGroq(system, prompt, groqKey, maxTokens, fast) : null },
    { name: "Gemini",     fn: () => geminiKey ? callGemini(system, prompt, geminiKey, maxTokens)  : null },
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
