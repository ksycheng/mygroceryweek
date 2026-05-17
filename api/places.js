export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { postal, query } = req.query;
  const apiKey = process.env.GOOGLE_PLACES_KEY;
  if (!apiKey) return res.status(500).json({ error: "No Places API key" });

  try {
    // First geocode the postal code to get coordinates
    const geoRes = await fetch(
      "https://maps.googleapis.com/maps/api/geocode/json?address=" + encodeURIComponent(postal + " Canada") + "&key=" + apiKey
    );
    const geoData = await geoRes.json();
    if (!geoData.results?.length) return res.status(200).json({ stores: [] });

    const { lat, lng } = geoData.results[0].geometry.location;

    // Then search for nearby grocery stores
    const placesRes = await fetch(
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=" + lat + "," + lng + "&radius=5000&type=supermarket&keyword=" + encodeURIComponent(query || "grocery supermarket") + "&key=" + apiKey
    );
    const placesData = await placesRes.json();

    const stores = (placesData.results || []).slice(0, 6).map(place => {
      const dlat = place.geometry.location.lat - lat;
      const dlng = place.geometry.location.lng - lng;
      const distanceKm = Math.round(Math.sqrt(dlat*dlat + dlng*dlng) * 111 * 10) / 10;
      return {
        name: place.name,
        address: place.vicinity,
        distanceKm,
        rating: place.rating,
        open: place.opening_hours?.open_now,
        placeId: place.place_id,
      };
    });

    // Sort by distance
    stores.sort((a, b) => a.distanceKm - b.distanceKm);
    return res.status(200).json({ stores, center: { lat, lng } });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
