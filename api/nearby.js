// Tankstellen / Ladestationen / Ort in der Nähe (für das Fahrtenbuch)
// kind=fuel   → E-Control Spritpreisrechner (Österreich, mit Preisen), sonst OpenStreetMap
// kind=charge → Ladestationen aus OpenStreetMap (Overpass)
// kind=place  → Adresse/Ort aus Koordinaten (Nominatim)
const UA = "FinDocu/1.0 (private Finanz-App)";

function distKm(a, b, c, d) {
  const R = 6371, r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
async function getJson(url, opts = {}, ms = 8000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal, headers: { "user-agent": UA, accept: "application/json", ...(opts.headers || {}) } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function overpass(lat, lon, filter, radius) {
  const q = `[out:json][timeout:10];(node[${filter}](around:${radius},${lat},${lon});way[${filter}](around:${radius},${lat},${lon}););out center tags 30;`;
  const j = await getJson("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "content-type": "application/x-www-form-urlencoded" } }, 12000);
  return (j.elements || []).map((e) => {
    const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon, g = e.tags || {};
    const addr = [g["addr:street"] && `${g["addr:street"]} ${g["addr:housenumber"] || ""}`.trim(), [g["addr:postcode"], g["addr:city"]].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const power = Object.entries(g).filter(([k]) => /^socket:.*:output$/.test(k)).map(([, v]) => v)[0] || "";
    return { name: g.brand || g.name || g.operator || (filter.includes("charging") ? "Ladestation" : "Tankstelle"), operator: g.operator || "", address: addr,
      lat: la, lon: lo, dist: la ? distKm(lat, lon, la, lo) : null, power, sockets: g.capacity || "" };
  }).filter((x) => x.lat).sort((a, b) => a.dist - b.dist).slice(0, 15);
}

export default async function handler(req, res) {
  const token = process.env.APP_TOKEN;
  if (token && req.headers["x-app-token"] !== token) return res.status(401).json({ error: "Falscher App-Token" });
  const lat = Number(req.query.lat), lon = Number(req.query.lon), kind = String(req.query.kind || "fuel");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "lat/lon fehlen" });
  try {
    if (kind === "place") {
      const j = await getJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=de`);
      const a = j.address || {};
      const city = a.city || a.town || a.village || a.municipality || "";
      const street = [a.road, a.house_number].filter(Boolean).join(" ");
      return res.status(200).json({ city, street, label: [street, city].filter(Boolean).join(", ") || j.display_name || "", name: j.name || "" });
    }
    if (kind === "charge") return res.status(200).json({ source: "OpenStreetMap", stations: await overpass(lat, lon, '"amenity"="charging_station"', 3000) });
    const fuel = ["SUP", "DIE", "GAS"].includes(req.query.fuel) ? req.query.fuel : "SUP";
    try {
      const j = await getJson(`https://api.e-control.at/sprit/1.0/search/gas-stations/by-address?latitude=${lat}&longitude=${lon}&fuelType=${fuel}&includeClosed=true`);
      const stations = (Array.isArray(j) ? j : []).map((s) => ({
        name: s.name, address: [s.location?.address, [s.location?.postalCode, s.location?.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
        lat: s.location?.latitude, lon: s.location?.longitude, dist: s.distance ?? (s.location ? distKm(lat, lon, s.location.latitude, s.location.longitude) : null),
        open: s.open, price: s.prices?.find((p) => p.fuelType === fuel)?.amount ?? null
      })).sort((a, b) => (a.dist ?? 99) - (b.dist ?? 99));
      if (stations.length) return res.status(200).json({ source: "E-Control Spritpreisrechner", fuel, stations });
    } catch { /* weiter mit OpenStreetMap */ }
    return res.status(200).json({ source: "OpenStreetMap", stations: await overpass(lat, lon, '"amenity"="fuel"', 3000) });
  } catch (e) {
    return res.status(502).json({ error: "Standortdienst nicht erreichbar: " + (e.message || e) });
  }
}
