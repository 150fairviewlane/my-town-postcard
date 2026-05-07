// Territory engine — clusters US ZIP codes near a dealer's home ZIP into
// 4 distinct postcard zones. Pure browser JS, no external dependencies.
// Backed by /data/zips.json (compact array-of-arrays format) which is
// served from the localspot public folder and lazy-fetched the first
// time loadZips() is called.
//
// Pipeline:
//   1. loadZips(): fetch + index ~41k US ZIPs by zip, lat/lng, city, state
//   2. neighbors(homeZip, radiusMiles): Haversine filter to nearby ZIPs
//   3. kmeans(points, k, seed): naive K-means on lat/lng
//   4. buildTerritories(homeZip, opts): glue — returns 4 territory objects
//      ready to send to POST /api/dealers
//
// Designed to be deterministic when given a seed so the "Re-shuffle" button
// can produce a different but reproducible layout each click.

const EARTH_RADIUS_MILES = 3958.8;

let _cache = null;
let _cachePromise = null;

function baseUrl() {
  // import.meta.env.BASE_URL ends with "/" in Vite. We strip the trailing
  // slash so the static asset URL composes cleanly.
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
      // Compact format: { format: ["zip","lat","lng","city","state"], zips: [[...]] }
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
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

// Mulberry32 — small, fast, deterministic 32-bit PRNG. We use it instead of
// Math.random() so passing a seed makes K-means reproducible (and so the
// "Re-shuffle" button can vary the seed to explore different layouts).
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// K-means++ initialization spreads the starting centroids out, which avoids
// the empty-cluster degeneracy you'd see with naive random init when the
// input points are clumped (which they always are for nearby ZIPs).
function kmeansPlusPlus(points, k, rand) {
  const centroids = [];
  // First centroid: uniformly random
  centroids.push({ ...points[Math.floor(rand() * points.length)] });
  while (centroids.length < k) {
    // Distance from each point to its nearest existing centroid
    const dists = points.map((p) => {
      let best = Infinity;
      for (const c of centroids) {
        const d = haversineMiles(p, c);
        if (d < best) best = d;
      }
      return best * best; // squared distance for D^2 weighting
    });
    const total = dists.reduce((s, d) => s + d, 0);
    if (total === 0) {
      // All points coincide with existing centroids — fall back to random
      centroids.push({ ...points[Math.floor(rand() * points.length)] });
      continue;
    }
    let r = rand() * total;
    let chosen = 0;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.push({ ...points[chosen] });
  }
  return centroids;
}

export function kmeans(points, k, seed = 1) {
  if (points.length <= k) {
    return points.map((p, i) => ({ center: { lat: p.lat, lng: p.lng }, points: [p], index: i }));
  }
  const rand = mulberry32(seed);
  let centroids = kmeansPlusPlus(points, k, rand);
  let assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < 50; iter++) {
    let changed = false;
    // Assignment step
    for (let i = 0; i < points.length; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = haversineMiles(points[i], centroids[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed = true;
      }
    }
    if (!changed) break;
    // Update step — recompute centroids as the mean lat/lng of their members.
    // For tighter geographic clusters we'd use spherical mean, but at the
    // scale of a single county a plain mean is fine.
    const sums = Array.from({ length: k }, () => ({ lat: 0, lng: 0, n: 0 }));
    for (let i = 0; i < points.length; i++) {
      const a = assignments[i];
      sums[a].lat += points[i].lat;
      sums[a].lng += points[i].lng;
      sums[a].n += 1;
    }
    centroids = centroids.map((c, idx) => {
      const s = sums[idx];
      if (s.n === 0) return c; // empty cluster — keep its old centroid
      return { lat: s.lat / s.n, lng: s.lng / s.n };
    });
  }

  const buckets = Array.from({ length: k }, (_, i) => ({
    center: { lat: centroids[i].lat, lng: centroids[i].lng },
    points: [],
    index: i,
  }));
  for (let i = 0; i < points.length; i++) buckets[assignments[i]].points.push(points[i]);

  // Drop empty buckets and re-index so downstream code never sees gaps.
  return buckets
    .filter((b) => b.points.length > 0)
    .map((b, i) => ({ ...b, index: i }));
}

// Pick a friendly label for a cluster: the city closest to the centroid,
// plus the state. Falls back to "ZIP <first> + N more" if the cluster is
// somehow nameless.
function pickLabel(cluster) {
  if (cluster.points.length === 0) return "Empty";
  let best = cluster.points[0];
  let bestDist = haversineMiles(best, cluster.center);
  for (const p of cluster.points) {
    const d = haversineMiles(p, cluster.center);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  if (best.city) return `${best.city}, ${best.state}`;
  return `${best.zip}${cluster.points.length > 1 ? ` +${cluster.points.length - 1}` : ""}`;
}

// Estimate households in a cluster. We don't have per-ZIP population in the
// bundled dataset, so we use a rough US average of ~1,500 households per
// ZIP and cap each cluster at the EDDM target of 5,000 (the practical
// mailing volume per postcard run).
function estimateHouseholds(zipCount) {
  return Math.min(5000, zipCount * 1500);
}

/**
 * Build 4 (or `k`) postcard territories around the dealer's home ZIP.
 *
 * @param {string} homeZip   5-digit ZIP code
 * @param {object} [opts]
 * @param {number} [opts.radiusMiles=30]  Search radius around home ZIP
 * @param {number} [opts.k=4]              Number of territories to produce
 * @param {number} [opts.seed]             PRNG seed for K-means init.
 *                                         Vary to "re-shuffle" the layout.
 * @returns {Promise<Array<{
 *   territoryIndex: number,
 *   centerLat: number, centerLng: number,
 *   zipCodes: string[],
 *   cityLabel: string,
 *   estimatedHouseholds: number,
 * }>>}
 */
export async function buildTerritories(homeZip, opts = {}) {
  const { radiusMiles = 30, k = 4, seed = 1 } = opts;
  const data = await loadZips();
  const home = data.byZip.get(homeZip);
  if (!home) {
    const err = new Error(`We don't have ZIP code ${homeZip} in our dataset.`);
    err.code = "ZIP_NOT_FOUND";
    throw err;
  }
  const nearby = data.all.filter((z) => haversineMiles(home, z) <= radiusMiles);
  if (nearby.length < k) {
    // Widen search if we couldn't find enough — mostly relevant in very
    // rural areas where 30 miles isn't enough.
    const widerNearby = data.all.filter((z) => haversineMiles(home, z) <= radiusMiles * 2);
    if (widerNearby.length < k) {
      const err = new Error(`Not enough nearby ZIP codes around ${homeZip} to build territories.`);
      err.code = "NOT_ENOUGH_ZIPS";
      throw err;
    }
    return finalize(kmeans(widerNearby, k, seed), home);
  }
  return finalize(kmeans(nearby, k, seed), home);
}

function finalize(clusters, home) {
  return clusters.map((c, i) => ({
    territoryIndex: i,
    centerLat: c.center.lat,
    centerLng: c.center.lng,
    zipCodes: c.points.map((p) => p.zip),
    cityLabel: pickLabel(c),
    estimatedHouseholds: estimateHouseholds(c.points.length),
    distanceFromHomeMiles: Number(haversineMiles(home, c.center).toFixed(1)),
  }));
}
