// Territory engine — clusters nearby ZIP codes into k distinct postcard zones.
// Pure browser JS, no external dependencies.
// Backed by /data/zips.json (compact array-of-arrays) lazy-fetched on first call.
//
// Pipeline:
//   1. loadZips() — fetch + index ~41k US ZIPs by zip, lat/lng, city, state
//   2. buildTerritories() — adaptive radius expansion until targetZips reached,
//      then K-means on ZIP centroids → k territory objects
//
// The radius adapts: starts at minRadiusMiles, expands in 5-mile steps until
// at least targetZips (default 24) nearby ZIPs are found. Dense areas stop
// early; rural areas widen as needed. Each territory is labelled by the most
// common city name among its ZIP codes.
//
// Deterministic when given a seed (Mulberry32 PRNG + K-means++ init).

const EARTH_RADIUS_MILES = 3958.8;

let _cache = null;
let _cachePromise = null;

function baseUrl() {
  const b =
    typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
      ? import.meta.env.BASE_URL
      : "/";
  return b.replace(/\/$/, "");
}

export async function loadZips() {
  if (_cache) return _cache;
  if (_cachePromise) return _cachePromise;
  const url = `${baseUrl()}/data/zips.json`;
  _cachePromise = fetch(url, { cache: "force-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load ZIP dataset (HTTP ${res.status})`);
      return res.json();
    })
    .then((json) => {
      const all = json.zips.map((r) => ({
        zip: r[0],
        lat: r[1],
        lng: r[2],
        city: r[3],
        state: r[4],
      }));
      const byZip = new Map();
      for (const z of all) byZip.set(z.zip, z);
      _cache = { all, byZip };
      _cachePromise = null;
      return _cache;
    })
    .catch((err) => {
      _cachePromise = null;
      throw err;
    });
  return _cachePromise;
}

export function haversineMiles(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

// Mulberry32 — deterministic 32-bit PRNG. Makes K-means reproducible across
// calls with the same seed (important for the "Re-shuffle" UX).
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// K-means++ initialisation: spread starting centroids probabilistically by
// squared distance so they are unlikely to collapse into one region.
function kmeansPlusPlus(points, k, rand) {
  const centroids = [{ ...points[Math.floor(rand() * points.length)] }];
  while (centroids.length < k) {
    const dists = points.map((p) => {
      let best = Infinity;
      for (const c of centroids) {
        const d = haversineMiles(p, c);
        if (d < best) best = d;
      }
      return best * best;
    });
    const total = dists.reduce((s, d) => s + d, 0);
    if (total === 0) {
      centroids.push({ ...points[Math.floor(rand() * points.length)] });
      continue;
    }
    let r = rand() * total;
    let chosen = points.length - 1;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { chosen = i; break; }
    }
    centroids.push({ ...points[chosen] });
  }
  return centroids;
}

// K-means clustering over an array of { lat, lng, ... } points.
export function kmeans(points, k, seed = 1) {
  if (points.length <= k) {
    return points.map((p, i) => ({
      center: { lat: p.lat, lng: p.lng },
      points: [p],
      index: i,
    }));
  }
  const rand = mulberry32(seed);
  let centroids = kmeansPlusPlus(points, k, rand);
  let assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < 100; iter++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = haversineMiles(points[i], centroids[c]);
        if (d < bestDist) { bestDist = d; best = c; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed) break;
    const sums = Array.from({ length: k }, () => ({ lat: 0, lng: 0, n: 0 }));
    for (let i = 0; i < points.length; i++) {
      const a = assignments[i];
      sums[a].lat += points[i].lat;
      sums[a].lng += points[i].lng;
      sums[a].n += 1;
    }
    centroids = centroids.map((c, idx) => {
      const s = sums[idx];
      return s.n === 0 ? c : { lat: s.lat / s.n, lng: s.lng / s.n };
    });
  }

  const buckets = Array.from({ length: k }, (_, i) => ({
    center: { lat: centroids[i].lat, lng: centroids[i].lng },
    points: [],
    index: i,
  }));
  for (let i = 0; i < points.length; i++) buckets[assignments[i]].points.push(points[i]);
  return buckets.filter((b) => b.points.length > 0).map((b, i) => ({ ...b, index: i }));
}

// Estimate households in a territory.
// Baseline: 1,500 households per ZIP code, scaled by geographic density.
// Density is approximated by the median nearest-neighbour distance between
// the territory's ZIP centroids:
//   < 2 mi  → dense/urban    → ×0.7  (~1,050 HH/ZIP)
//   2–5 mi  → suburban       → ×1.0  (~1,500 HH/ZIP)
//   > 5 mi  → rural/sparse   → ×1.8  (~2,700 HH/ZIP)
// Cap at 5,000 — one EDDM run (the mailer always sends to exactly 5,000 homes).
// Dense territories will cluster near the cap from fewer ZIPs; rural territories
// need more ZIPs to reach it, so the density scale still differentiates small
// clusters (e.g. a 2-ZIP dense zone shows ~2,100 HH, not 5,000).
export function estimateHouseholds(zips) {
  if (zips.length === 0) return 0;
  if (zips.length === 1) return 1500;
  const dists = zips.map((p) => {
    let best = Infinity;
    for (const q of zips) {
      if (q === p) continue;
      const d = haversineMiles(p, q);
      if (d < best) best = d;
    }
    return best;
  });
  dists.sort((a, b) => a - b);
  const median = dists[Math.floor(dists.length / 2)];
  const scale = median < 2 ? 0.7 : median <= 5 ? 1.0 : 1.8;
  return Math.min(5000, Math.round(zips.length * 1500 * scale));
}

/**
 * Build k postcard territories around the dealer's home ZIP.
 *
 * The radius adapts: starts at `minRadiusMiles` and expands in **5-mile
 * steps** until at least `targetZips` (default 24) ZIP codes are within
 * range, or `maxRadiusMiles` is reached. Dense areas stop early; sparse
 * rural areas widen as needed. K-means then clusters the nearby ZIP centroids
 * into k groups and labels each group by the most common city name.
 *
 * @param {string} homeZip
 * @param {object} [opts]
 * @param {number} [opts.minRadiusMiles=10]
 * @param {number} [opts.maxRadiusMiles=50]
 * @param {number} [opts.targetZips=24]  Stop expanding once this many ZIPs are
 *   in range. Dense suburbs hit the target at a tighter radius; rural areas
 *   expand until the target or maxRadius is reached.
 * @param {number} [opts.k=4]
 * @param {number} [opts.seed=1]
 * @returns {Promise<Array<{
 *   territoryIndex: number,
 *   centerLat: number,
 *   centerLng: number,
 *   zipCodes: string[],
 *   cityLabel: string,
 *   estimatedHouseholds: number,
 *   distanceFromHomeMiles: number,
 * }>>}
 */
export async function buildTerritories(homeZip, opts = {}) {
  const {
    minRadiusMiles = 10,
    maxRadiusMiles = 50,
    k = 4,
    seed = 1,
  } = opts;
  const targetZips = opts.targetZips ?? 24;

  const data = await loadZips();
  const home = data.byZip.get(homeZip);
  if (!home) {
    const err = new Error(`We don't have ZIP code ${homeZip} in our dataset.`);
    err.code = "ZIP_NOT_FOUND";
    throw err;
  }

  // Collect all ZIPs within radius of home.
  function nearbyZips(radius) {
    return data.all.filter((z) => haversineMiles(home, z) <= radius);
  }

  // Adaptive radius: 5-mile steps from minRadiusMiles.
  // Stops as soon as targetZips ZIPs are in range (or maxRadiusMiles reached).
  let radius = minRadiusMiles;
  let nearby = nearbyZips(radius);
  while (nearby.length < targetZips && radius < maxRadiusMiles) {
    radius = Math.min(radius + 5, maxRadiusMiles);
    nearby = nearbyZips(radius);
  }

  if (nearby.length < k) {
    const err = new Error(
      `Not enough ZIP codes near ${homeZip} to build ${k} territories.`
    );
    err.code = "NOT_ENOUGH_ZIPS";
    throw err;
  }

  // K-means on ZIP centroids.
  const clusters = kmeans(nearby, k, seed);

  return clusters.map((c, i) => {
    // Label by the most common city name in the cluster.
    const cityCounts = new Map();
    for (const z of c.points) {
      cityCounts.set(z.city, (cityCounts.get(z.city) ?? 0) + 1);
    }
    let label = c.points[0]?.city ?? homeZip;
    let labelState = c.points[0]?.state ?? "";
    let best = 0;
    for (const [city, count] of cityCounts) {
      if (count > best) {
        best = count;
        label = city;
        labelState = c.points.find((z) => z.city === city)?.state ?? "";
      }
    }

    return {
      territoryIndex: i,
      centerLat: Number(c.center.lat.toFixed(4)),
      centerLng: Number(c.center.lng.toFixed(4)),
      zipCodes: c.points.map((z) => z.zip),
      cityLabel: `${label}, ${labelState}`,
      estimatedHouseholds: estimateHouseholds(c.points),
      distanceFromHomeMiles: Number(haversineMiles(home, c.center).toFixed(1)),
    };
  });
}
