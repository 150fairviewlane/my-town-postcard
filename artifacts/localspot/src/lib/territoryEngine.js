// Territory engine — clusters US ZIP codes near a dealer's home ZIP into
// k distinct postcard zones. Pure browser JS, no external dependencies.
// Backed by /data/zips.json (compact array-of-arrays format) which is
// served from the localspot public folder and lazy-fetched the first
// time loadZips() is called.
//
// Pipeline:
//   1. loadZips(): fetch + index ~41k US ZIPs by zip, lat/lng, city, state
//   2. nearbyCities(): collect all distinct named cities within the search
//      radius, computing a centroid and ZIP list for each
//   3. kmeans(cities, k): cluster city centroids into k groups
//   4. buildTerritories(): glue — expands radius until enough cities are
//      found, runs the cluster, returns territory objects
//
// Each territory corresponds to one or two neighbouring towns, labelled by
// whichever city in the cluster has the most ZIP codes. This gives clean,
// recognisable community names ("Canton, GA", "Roswell, GA") rather than
// arbitrary geographic blobs.
//
// Deterministic when given a seed so the "Re-shuffle" button produces a
// different but reproducible layout each click.

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

// Mulberry32 — deterministic 32-bit PRNG used to make K-means reproducible.
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// K-means++ init: spread starting centroids so clusters don't collapse.
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

// K-means clustering over any array of { lat, lng, ... } objects.
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

// Collect all distinct named cities within `radius` miles of `home`.
// Returns array of city objects sorted nearest-first, each with:
//   { name, zips, lat, lng }  where lat/lng is the city's centroid.
function nearbyCities(home, all, radius) {
  const cityMap = new Map();
  for (const z of all) {
    if (haversineMiles(home, z) > radius) continue;
    const key = `${z.city}, ${z.state}`;
    if (!cityMap.has(key)) cityMap.set(key, { name: key, zips: [] });
    cityMap.get(key).zips.push(z);
  }
  return [...cityMap.values()]
    .map((c) => {
      const lat = c.zips.reduce((s, z) => s + z.lat, 0) / c.zips.length;
      const lng = c.zips.reduce((s, z) => s + z.lng, 0) / c.zips.length;
      return { name: c.name, zips: c.zips, lat, lng };
    })
    .sort((a, b) => haversineMiles(home, a) - haversineMiles(home, b));
}

// Estimate households in a territory.
// 1,500 households/ZIP × density scale factor, capped at 5,000.
// Density is approximated by the median nearest-neighbour distance
// between ZIP centroids in the territory:
//   < 2 mi  → dense/urban    → ×0.7
//   2–5 mi  → suburban       → ×1.0
//   > 5 mi  → rural/sparse   → ×1.8
function estimateHouseholds(zips) {
  if (zips.length === 0) return 0;
  if (zips.length === 1) return Math.min(5000, 1500);
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
 * Each territory is named after a real, recognisable community — not an
 * anonymous radius blob. The algorithm:
 *   1. Collects all distinct named cities within the adaptive search radius.
 *   2. Runs K-means on those city centroids (one point per city), using only
 *      "anchor" cities (≥ 2 ZIPs) to avoid tiny hamlets distorting clusters.
 *   3. Absorbs single-ZIP satellite towns into the nearest anchor cluster.
 *   4. Labels each cluster by whichever city in it has the most ZIP codes.
 *
 * The search radius adapts: starts at `minRadiusMiles` and expands in 5-mile
 * steps until the nearby ZIP count reaches `targetZips` AND k anchor cities
 * are available — or `maxRadiusMiles` is reached. Dense areas stop early;
 * rural areas widen as needed.
 *
 * @param {string} homeZip
 * @param {object} [opts]
 * @param {number} [opts.minRadiusMiles=10]
 * @param {number} [opts.maxRadiusMiles=50]
 * @param {number} [opts.targetZips]   Target nearby ZIP count. Defaults to k*6.
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
  const targetZips = opts.targetZips ?? k * 6;

  const data = await loadZips();
  const home = data.byZip.get(homeZip);
  if (!home) {
    const err = new Error(`We don't have ZIP code ${homeZip} in our dataset.`);
    err.code = "ZIP_NOT_FOUND";
    throw err;
  }

  // Expand radius in 5-mile steps until:
  //   - the total ZIP count within radius reaches targetZips, AND
  //   - at least k "anchor" cities (≥ 2 ZIPs each) are in range.
  // Anchors are cities with real community presence; single-ZIP hamlets are
  // "satellites" that join the nearest anchor cluster after K-means so they
  // don't form underpopulated standalone territories.
  let radius = minRadiusMiles;
  let cities = nearbyCities(home, data.all, radius);
  let nearbyZipCount = cities.reduce((s, c) => s + c.zips.length, 0);
  let anchors = cities.filter((c) => c.zips.length >= 2);
  while (
    (nearbyZipCount < targetZips || anchors.length < k) &&
    radius < maxRadiusMiles
  ) {
    radius = Math.min(radius + 5, maxRadiusMiles);
    cities = nearbyCities(home, data.all, radius);
    nearbyZipCount = cities.reduce((s, c) => s + c.zips.length, 0);
    anchors = cities.filter((c) => c.zips.length >= 2);
  }

  if (cities.length < k) {
    const err = new Error(
      `Not enough nearby communities around ${homeZip} to build ${k} territories.`
    );
    err.code = "NOT_ENOUGH_ZIPS";
    throw err;
  }

  // Prefer same-state communities. Cross-state cities are included only when
  // in-state supply is insufficient for k territories (border rural areas).
  const homeState = home.state;
  const sameState = cities.filter((c) => c.zips.some((z) => z.state === homeState));
  if (sameState.length >= k) {
    cities = sameState;
    anchors = anchors.filter((c) => c.zips.some((z) => z.state === homeState));
  }

  // K-means runs on anchor cities only (when we have enough of them).
  // Satellites are absorbed into the nearest anchor cluster afterward.
  const satellites = cities.filter((c) => c.zips.length < 2);
  const clusterInput = anchors.length >= k ? anchors : cities;

  // Cluster city centroids into k groups.
  const clusters = kmeans(clusterInput, k, seed);

  // Absorb satellite cities into the nearest cluster.
  for (const sat of anchors.length >= k ? satellites : []) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      const d = haversineMiles(sat, clusters[i].center);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    clusters[best].points.push(sat);
  }

  return clusters.map((c, i) => {
    // Gather all ZIP records from every city assigned to this cluster.
    const allZips = c.points.flatMap((city) => city.zips);

    // Label: city with the most ZIP codes in this cluster.
    let label = c.points[0]?.name ?? homeZip;
    let best = 0;
    for (const city of c.points) {
      if (city.zips.length > best) { best = city.zips.length; label = city.name; }
    }

    return {
      territoryIndex: i,
      centerLat: Number(c.center.lat.toFixed(4)),
      centerLng: Number(c.center.lng.toFixed(4)),
      zipCodes: allZips.map((z) => z.zip),
      cityLabel: label,
      estimatedHouseholds: estimateHouseholds(allZips),
      distanceFromHomeMiles: Number(haversineMiles(home, c.center).toFixed(1)),
    };
  });
}
