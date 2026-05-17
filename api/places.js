export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { postal } = req.query;
  if (!postal) return res.status(400).json({ error: "No postal code" });

  try {
    // Step 1: Geocode the postal code using Nominatim (free, no key needed)
    const geoRes = await fetch(
      "https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(postal + ", Canada") + "&format=json&limit=1",
      { headers: { "User-Agent": "MyGroceryWeek/1.0" } }
    );
    const geoData = await geoRes.json();
    if (!geoData.length) return res.status(200).json({ stores: [] });

    const lat = parseFloat(geoData[0].lat);
    const lon = parseFloat(geoData[0].lon);

    // Step 2: Query Overpass API for supermarkets within 5km
    const overpassQuery = `
      [out:json][timeout:10];
      (
        node["shop"="supermarket"](around:5000,${lat},${lon});
        node["shop"="grocery"](around:5000,${lat},${lon});
        node["shop"="convenience"](around:5000,${lat},${lon});
      );
      out body;
    `;

    const overpassRes = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: overpassQuery,
      headers: { "Content-Type": "text/plain" }
    });
    const overpassData = await overpassRes.json();

    const stores = (overpassData.elements || [])
      .filter(el => el.tags?.name)
      .map(el => {
        const dlat = el.lat - lat;
        const dlon = el.lon - lon;
        const distanceKm = Math.round(Math.sqrt(dlat*dlat + dlon*dlon) * 111 * 10) / 10;
        const hours = el.tags?.["opening_hours"] || null;
        return {
          name: el.tags.name,
          address: [el.tags?.["addr:housenumber"], el.tags?.["addr:street"], el.tags?.["addr:city"]].filter(Boolean).join(" ") || null,
          distanceKm,
          hours,
          lat: el.lat,
          lon: el.lon,
        };
      })
      .filter(s => s.distanceKm <= 10)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 8);

    return res.status(200).json({ stores, center: { lat, lon } });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
