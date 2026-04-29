// Industry image library — used to auto-fill template photo slots when the
// business has not uploaded their own. Keeping URLs and tags here (mirroring
// the on-disk public/industries/<industry>/<business>/manifest.json files)
// avoids an async fetch during render.

const BASE = import.meta.env.BASE_URL;

const RESTAURANT_LIBRARY = [
  { url: `${BASE}industries/restaurants/mr-biscuits/menu-biscuit-egg-cheese.jpg`,
    tag: "hero", caption: "Buttermilk biscuit with egg and American cheese" },
  { url: `${BASE}industries/restaurants/mr-biscuits/menu-chicken-biscuit.jpg`,
    tag: "hero", caption: "Crispy chicken tender biscuit on red checker paper" },
  { url: `${BASE}industries/restaurants/mr-biscuits/menu-croissant-breakfast.jpg`,
    tag: "hero", caption: "Croissant breakfast sandwich with bacon, egg, and cheese" },
  { url: `${BASE}industries/restaurants/mr-biscuits/menu-bagel-cream-cheese.jpg`,
    tag: "food-detail", caption: "New York kettle-boiled bagel with cream cheese" },
  { url: `${BASE}industries/restaurants/mr-biscuits/menu-bagel-plain.jpg`,
    tag: "food-detail", caption: "Golden plain bagel close-up" },
  { url: `${BASE}industries/restaurants/mr-biscuits/menu-croissant.jpg`,
    tag: "food-detail", caption: "Flaky French butter croissant" },
  { url: `${BASE}industries/restaurants/mr-biscuits/gen-buttermilk-biscuit-hero.jpg`,
    tag: "hero", caption: "Stack of from-scratch buttermilk biscuits, hero shot" },
  { url: `${BASE}industries/restaurants/mr-biscuits/gen-breakfast-plate.jpg`,
    tag: "hero", caption: "Southern breakfast plate with biscuits, eggs, and bacon" },
  { url: `${BASE}industries/restaurants/mr-biscuits/gen-cafe-interior.jpg`,
    tag: "interior", caption: "Warm small-town café interior" },
  { url: `${BASE}industries/restaurants/mr-biscuits/gen-iced-boba-lineup.jpg`,
    tag: "drink", caption: "Colorful boba tea drink lineup" },
  { url: `${BASE}industries/restaurants/mr-biscuits/gen-chicken-biscuit-detail.jpg`,
    tag: "food-detail", caption: "Crispy fried chicken biscuit close-up" },
];

const RESTAURANT_INDUSTRIES = new Set([
  "Restaurant", "Pizza Restaurant", "Mexican Restaurant", "Chinese Restaurant",
  "Breakfast and Cafe", "Bar and Grill", "Italian Restaurant", "Bakery",
]);

function libraryFor(industry) {
  if (RESTAURANT_INDUSTRIES.has(industry)) return RESTAURANT_LIBRARY;
  return [];
}

// Stable string hash (djb2-ish, 32-bit).
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Pick a deterministic fallback photo from the industry library.
// Same (industry, businessName, tag, slot) always returns the same URL,
// and different slots return distinct images when the pool is large enough.
export function pickFallbackPhoto(industry, businessName, tag = "hero", slot = 0) {
  const lib = libraryFor(industry);
  let pool = lib.filter(i => i.tag === tag);
  if (pool.length === 0) pool = lib;
  if (pool.length === 0) return null;
  const seed = `${businessName || "default"}|${slot}`;
  const startIdx = hash(seed) % pool.length;
  const idx = (startIdx + slot) % pool.length;
  return pool[idx].url;
}

// Resolve a photo array against the library — replaces empty slots with
// deterministic fallbacks. Always returns an array of length `count` of URLs.
export function resolvePhotos(industry, businessName, photos = [], count = 3) {
  const out = [];
  const tags = ["hero", "food-detail", "interior"];
  for (let i = 0; i < count; i++) {
    const supplied = photos[i];
    if (supplied) { out.push(supplied); continue; }
    const tag = tags[i] || "hero";
    out.push(pickFallbackPhoto(industry, businessName, tag, i));
  }
  return out;
}

export function hasIndustryLibrary(industry) {
  return libraryFor(industry).length > 0;
}
