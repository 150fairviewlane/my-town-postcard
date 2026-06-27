/**
 * Pure prompt-building logic for the Grok ad generator.
 * No Express, no database, no file-system access — only string assembly.
 * Import from both the route handler and the prompt-size check script.
 */


// ── Surprise Me — 5 named style themes ────────────────────────────────────────

export interface SurpriseMeTheme {
  name: string;
  palette: string;
  typography: string;
  layoutLandscape: string;
  layoutPortrait: string;
  mood: string;
}

export const SURPRISE_ME_THEMES: SurpriseMeTheme[] = [
  {
    name: "Midnight Luxe",
    palette: "Near-black/deep charcoal dominant bg; electric gold or platinum white accent; ivory/cream body text; near-black footer.",
    typography: "Tall condensed serif headline, generous letter-spacing; fine italic or ultra-light sans tagline; thin rule separators.",
    layoutLandscape: "Right ⅔: full-bleed atmospheric hero photo; left ⅓: narrow opaque dark vertical panel (headline + tagline + services); coupon: refined gold-bordered box lower-right.",
    layoutPortrait: "Hero photo upper 55% with cinematic vignette; full-width near-black band below (headline in condensed gold serif); services in slim column with thin gold rule dividers; coupon: gold-bordered box at bottom.",
    mood: "premium, sophisticated, high-end, exclusive",
  },
  {
    name: "Coastal Bright",
    palette: "Warm white/light cream dominant bg; ocean blue primary accent; sandy coral/warm peach secondary; deep ocean blue/navy footer.",
    typography: "Bold rounded sans-serif headline, friendly and approachable; lightweight sans body; wave/arc motifs in dividers.",
    layoutLandscape: "Photo strip or rounded-rect panel spanning top third; headline large in left zone on white bg; services in pill-badge row or two-column list center; coupon: coral-bordered rounded rect lower-right.",
    layoutPortrait: "Rounded-rect hero photo in upper third; headline large below on white/cream bg; two-column service list with circular ocean-blue icon badges; coupon: coral accent rounded box near bottom.",
    mood: "fresh, friendly, clean, approachable",
  },
  {
    name: "Industrial Edge",
    palette: "Concrete/slate gray or weathered charcoal texture dominant bg; vivid orange or electric yellow primary accent; crisp white text; near-black/dark concrete footer.",
    typography: "Wide ultra-bold condensed all-caps stencil/block typeface — very large, stacked; bold sans for services; sharp angular graphic elements.",
    layoutLandscape: "Concrete/slate texture bg; bold diagonal cut divides hero photo zone (right half) from text zone (left half); oversized all-caps stacked headline left; vivid accent bar diagonal across center; coupon: heavy-bordered rectangular badge lower-right.",
    layoutPortrait: "Full-width texture bg; hero photo with bold diagonal slash blending into texture; oversized stacked all-caps headline left-aligned below; horizontal vivid accent band separating services from coupon; coupon: heavy-bordered box at bottom.",
    mood: "bold, rugged, authoritative, high-contrast",
  },
  {
    name: "Botanical Garden",
    palette: "Sage green or dusty rose dominant bg; deep forest green primary accent; warm blush/antique cream secondary; deep forest green footer.",
    typography: "Refined upright serif headline, editorial, generously sized; flowing italic or delicate script tagline; soft organic shapes and fine rules around text zones.",
    layoutLandscape: "Organic blob/torn-paper shapes in sage green framing hero photo right ⅔; headline in large refined serif on cream panel upper-left; services in soft rounded list with small botanical leaf icons; coupon: delicate dashed or hand-drawn border box lower-left.",
    layoutPortrait: "Organic tinted blob framing hero photo upper third; headline on wide cream panel in large refined serif; service list with small botanical icon accents; coupon: soft rounded or hand-drawn border box near bottom.",
    mood: "natural, artisanal, boutique, warm",
  },
  {
    name: "Urban Pop",
    palette: "Vivid primary color full-bleed bg (bold red, cobalt blue, or deep violet); contrasting bright secondary accent (lime green, warm yellow, or electric white); footer: same primary darkened 20%.",
    typography: "Oversized stacked display type — extremely large/bold, flat graphic weight, tight leading; flat bold geometric icons for services.",
    layoutLandscape: "Bold flat color block fills left 40% (oversized stacked headline); hero photo right 60% with hard-edge or diagonal cut; services in vivid accent-colored band lower center; coupon: contrasting bright flat-color box lower-left.",
    layoutPortrait: "Full-bleed vivid bg; hero photo upper half with color-band overlay at bottom blending into layout; oversized stacked headline in center band; services as flat circular badge icons; coupon: bright contrasting flat-color box at bottom.",
    mood: "energetic, modern, eye-catching, playful",
  },
];

/** Return the index into SURPRISE_ME_THEMES best matching the given industry. Falls back to Urban Pop (4). */
export function getDefaultThemeIndex(industry: string): number {
  const ind = industry.toLowerCase();
  if (/legal|law|attorney|lawyer|finance|financial|accounting|accountant|cpa|insurance|real estate|realtor|mortgage|wealth|investment|consulting|consultant|advisor|notary/.test(ind)) return 0;
  if (/health|medical|clinic|hospital|veterinarian|veterinary|\bvet\b|dental|dentist|wellness|spa|chiropractic|chiropractor|physical therapy|therapy|optometry|optometrist|physician|doctor|pharmacy|pediatric|gynecolog|oncolog|orthopedic|audiolog/.test(ind)) return 1;
  if (/contractor|hvac|heating|cooling|plumbing|plumber|electrical|electrician|roofing|roofer|auto|automotive|mechanic|landscaping|landscape|lawn|pest|exterminator|construction|renovation|remodel|flooring|painting|painter|pressure wash|pool|septic|junk|moving|storage/.test(ind)) return 2;
  if (/restaurant|bakery|bake|cafe|coffee|catering|florist|floral|boutique|yoga|nutrition|supplement|organic|farm|winery|brewery|distillery|beauty|cosmetic|nail|estheti|massage|candle|gift|jewelry|jewellery|antique|art studio/.test(ind)) return 3;
  return 4;
}

// ── Footer zone builder ──────────────────────────────────────────────────────

export function buildFooterZone(phone: string, address: string, isLandscape = false, sizeKey?: string): string {
  // Physical card size for the composited QR square (cardSize = round(qrSize × 1.075)).
  // Must stay in sync with CARD_MARGIN in compositeQr.ts.
  const sk = (sizeKey ?? "").toLowerCase();
  // cardSize = round(qrSize × 1.0375) / 300 DPI — must stay in sync with compositeQr.ts CARD_MARGIN
  const qrCardInches = sk === "xl" ? 0.62 : sk === "l" ? 0.45 : 0.31; // m / s / unknown

  // Bottom-right square zone: solid footer-colored fill, no marks — a real QR is composited here.
  const qrSlot =
    `BOTTOM-RIGHT: solid square ${qrCardInches.toFixed(2)}"×${qrCardInches.toFixed(2)}" at print size — ` +
    `RIGHT and BOTTOM edges flush with image border, zero margin. ` +
    `Fill with footer bg color — no QR/barcode marks; zone max ${qrCardInches.toFixed(2)}"×${qrCardInches.toFixed(2)}".`;

  if (isLandscape) {
    const hasAddr = address !== "(none)";
    return (
      `FOOTER (full-width dark bar, 20% of card height): ` +
      `THREE inline columns left to right — ` +
      `LEFT: "${phone}" bold white, very large (the largest text in the footer); ` +
      `CENTER: ` + (hasAddr
        ? `"${address}" bold white, large, split to 2 lines at the comma (street on line 1, city/state on line 2), center-aligned in the bar; `
        : `(centered placeholder); `) +
      qrSlot + ` ` +
      `Phone once, footer only.\n\n`
    );
  }
  return (
    `FOOTER (full-width dark bar, 20% of card height): ` +
    `"${phone}" bold white, very large, left-aligned (the largest text in the footer); ` +
    (address !== "(none)" ? `"${address}" bold white, large, directly below phone (same left column); ` : "") +
    qrSlot + ` ` +
    `Phone once, footer only.\n\n`
  );
}

// ── Industry photo descriptions ───────────────────────────────────────────────

export interface IndustryPhotos {
  hero:     string;
  c1:       string;
  c2:       string;
  c3:       string;
  p1:       string;
  p2:       string;
  outdoor:  string;
  interior: string;
}

export function getIndustryPhotos(industry: string): IndustryPhotos {
  const ind = industry.toLowerCase();
  if (ind.includes("hvac") || ind.includes("heating") || ind.includes("cooling") || ind.includes("air condition")) {
    return {
      hero:     "a technician in uniform servicing a rooftop HVAC unit, clear blue sky background",
      c1:       "gleaming condenser units installed beside a home exterior",
      c2:       "close-up of a digital thermostat on a clean white wall",
      c3:       "happy homeowner relaxing in a comfortably cool living room",
      p1:       "technician inspecting ductwork inside a clean utility room",
      p2:       "modern air handler unit in a well-lit mechanical room",
      outdoor:  "HVAC technician working on condenser units outside a suburban home",
      interior: "bright clean utility room with a high-efficiency furnace and new ductwork",
    };
  }
  if (ind.includes("plumb")) {
    return {
      hero:     "a licensed plumber professionally installing a fixture in a bright modern bathroom",
      c1:       "gleaming new chrome faucet and sink in a clean bathroom",
      c2:       "plumber's tool belt with wrenches and pipe fittings",
      c3:       "happy homeowner in a beautifully renovated bathroom",
      p1:       "under-sink plumbing with new copper pipes",
      p2:       "water heater installation in a clean utility room",
      outdoor:  "plumber unloading tools from a professional service van in a driveway",
      interior: "bright modern kitchen with new plumbing fixtures under natural light",
    };
  }
  if (ind.includes("electric")) {
    return {
      hero:     "a licensed electrician working on a breaker panel in a clean residential setting",
      c1:       "modern electrical panel with labeled circuit breakers",
      c2:       "electrician installing recessed lighting in a bright room",
      c3:       "well-lit kitchen after professional lighting upgrade",
      p1:       "electrician checking wiring with a digital multimeter",
      p2:       "new smart outlet and USB charging port installation",
      outdoor:  "electrician on a ladder installing exterior lighting on a home",
      interior: "bright home interior with professionally installed pendant lights",
    };
  }
  if (ind.includes("roof")) {
    return {
      hero:     "roofing crew installing new architectural shingles on a residential home",
      c1:       "crisp new asphalt shingle roof on a beautiful suburban home",
      c2:       "roofer applying flashing around a chimney",
      c3:       "home exterior after complete roof replacement, strong curb appeal",
      p1:       "shingle samples and roofing materials spread on a workbench",
      p2:       "gutters and fascia freshly installed on a home",
      outdoor:  "roofing team on a residential roof under a clear sky",
      interior: "dry clean attic with new decking and insulation after re-roof",
    };
  }
  if (ind.includes("lawn") || ind.includes("landscap") || ind.includes("garden")) {
    return {
      hero:     "a professional landscaper mowing a lush green residential lawn in bright sunlight",
      c1:       "perfectly edged lawn with vibrant flower borders",
      c2:       "landscaper pruning hedges into clean geometric shapes",
      c3:       "beautiful patio garden with fresh mulch and colorful plantings",
      p1:       "riding mower on a wide open suburban lawn",
      p2:       "newly planted garden beds in front of a home",
      outdoor:  "landscaping crew working on a manicured front yard",
      interior: "bright sunlit backyard patio surrounded by lush mature landscaping",
    };
  }
  if (ind.includes("paint")) {
    return {
      hero:     "a professional painter applying fresh paint on a home exterior with precision",
      c1:       "freshly painted white exterior home with clean crisp trim",
      c2:       "painter rolling smooth interior wall in warm neutral tones",
      c3:       "beautifully painted living room with elegant accent wall",
      p1:       "painter's brush and paint cans on a clean drop cloth",
      p2:       "smooth freshly painted cabinet doors in a bright kitchen",
      outdoor:  "crew painting a home exterior with scaffolding in bright daylight",
      interior: "bright freshly painted living room with crisp white trim",
    };
  }
  if (ind.includes("clean")) {
    return {
      hero:     "a professional cleaner in uniform vacuuming a bright pristine living room",
      c1:       "sparkling clean kitchen with gleaming countertops and appliances",
      c2:       "cleaner mopping a spotless hardwood floor",
      c3:       "gleaming bathroom tile and mirrors after deep clean",
      p1:       "cleaning supplies and microfiber cloths neatly arranged",
      p2:       "bright clean home office after professional cleaning service",
      outdoor:  "cleaning team arriving at a home in a professional branded van",
      interior: "immaculate freshly cleaned living room bathed in natural light",
    };
  }
  if (ind.includes("pest")) {
    return {
      hero:     "a pest control technician in uniform inspecting a home exterior",
      c1:       "pest control professional applying treatment along a baseboard",
      c2:       "clean pest-free kitchen with gleaming countertops",
      c3:       "happy family in a comfortable pest-free home",
      p1:       "technician setting a professional pest trap device",
      p2:       "pest control equipment and protective gear in a service van",
      outdoor:  "pest control technician treating the perimeter of a suburban home",
      interior: "bright clean kitchen and pantry after professional pest treatment",
    };
  }
  if (ind.includes("dent")) {
    return {
      hero:     "a friendly dentist examining a patient in a modern dental office",
      c1:       "bright modern dental operatory with state-of-the-art equipment",
      c2:       "patient smiling with a beautiful healthy smile after treatment",
      c3:       "clean dental reception area with natural light and plants",
      p1:       "dentist reviewing digital X-rays on a high-resolution monitor",
      p2:       "hygienist performing a professional teeth cleaning",
      outdoor:  "welcoming modern dental office building exterior",
      interior: "bright cheerful dental waiting room with comfortable seating",
    };
  }
  if (ind.includes("medical") || ind.includes("health") || ind.includes("clinic") || ind.includes("doctor") || ind.includes("physician")) {
    return {
      hero:     "a friendly doctor in a white coat consulting with a patient in a modern exam room",
      c1:       "bright clean modern medical exam room with professional equipment",
      c2:       "doctor reviewing patient records on a tablet",
      c3:       "welcoming medical clinic reception area with natural light",
      p1:       "nurse taking a patient's vitals in a clinic",
      p2:       "modern diagnostic equipment in a clean exam room",
      outdoor:  "modern medical clinic building exterior with professional signage",
      interior: "bright comfortable waiting room with natural light and plants",
    };
  }
  if (ind.includes("vet") || ind.includes("pet") || ind.includes("animal")) {
    return {
      hero:     "a smiling veterinarian examining a healthy golden retriever on a clinic table",
      c1:       "vet technician comforting a cat during a wellness exam",
      c2:       "happy dog owner reuniting with their pet after treatment",
      c3:       "bright clean modern veterinary exam room",
      p1:       "puppy getting a checkup at a friendly animal clinic",
      p2:       "veterinarian reviewing pet health records on a tablet",
      outdoor:  "welcoming animal hospital exterior with a pet-friendly entrance",
      interior: "warm friendly veterinary waiting room with natural light",
    };
  }
  if (ind.includes("auto") || ind.includes("car") || ind.includes("mechanic") || ind.includes("tire")) {
    return {
      hero:     "a skilled auto mechanic servicing a car in a clean professional garage",
      c1:       "mechanic performing a precision oil change under a lifted vehicle",
      c2:       "clean modern auto service bay with professional equipment",
      c3:       "happy customer picking up their freshly serviced car",
      p1:       "technician using diagnostic equipment on a vehicle",
      p2:       "new tires installed on a car, gleaming alloy wheels",
      outdoor:  "clean professional auto service shop exterior with customer cars",
      interior: "spotless auto service bay with a car on a hydraulic lift",
    };
  }
  if (ind.includes("real estate") || ind.includes("realt") || ind.includes("home sale") || ind.includes("property")) {
    return {
      hero:     "a smiling real estate agent standing in front of a beautiful residential home",
      c1:       "bright open-concept kitchen in a staged home for sale",
      c2:       "real estate agent showing a family a beautiful living room",
      c3:       "beautifully landscaped home exterior with a sold sign",
      p1:       "cozy master bedroom with natural light and modern decor",
      p2:       "inviting backyard patio of a home for sale",
      outdoor:  "stunning curb appeal of a for-sale home in a friendly neighborhood",
      interior: "bright spacious living room with hardwood floors and large windows",
    };
  }
  if (ind.includes("mexican") || ind.includes("taco") || ind.includes("tex-mex") || ind.includes("burrito") || ind.includes("enchilada") || ind.includes("tamale")) {
    return {
      hero:     "a steaming plate of street tacos with grilled carne asada, fresh cilantro, diced onion, lime wedges, and salsa on a colorful ceramic plate",
      c1:       "a vibrant spread of enchiladas smothered in red sauce and melted cheese, garnished with sour cream and jalapeños",
      c2:       "fresh handmade guacamole with chunky avocado, tomato, and cilantro served in a molcajete",
      c3:       "a festive platter of nachos loaded with beans, cheese, pico de gallo, and jalapeños",
      p1:       "chef pressing fresh masa tortillas by hand in a traditional Mexican kitchen",
      p2:       "colorful bowls of salsa roja, salsa verde, and pico de gallo with fresh chips",
      outdoor:  "vibrant Mexican restaurant exterior with colorful folk-art murals and warm string lights",
      interior: "warm festive Mexican restaurant dining room with bright Talavera tile accents and happy diners",
    };
  }
  if (ind.includes("italian") || ind.includes("pasta") || ind.includes("trattoria") || ind.includes("osteria") || ind.includes("risotto") || ind.includes("gelato")) {
    return {
      hero:     "a beautifully plated bowl of fresh handmade pasta with rich Bolognese sauce, Parmigiano-Reggiano, and fresh basil",
      c1:       "a wood-fired Neapolitan pizza with San Marzano tomato sauce, fresh mozzarella, and basil leaves",
      c2:       "creamy risotto with sautéed mushrooms and truffle oil in a white ceramic bowl",
      c3:       "a tiramisu dessert dusted with cocoa powder on an elegant plate",
      p1:       "Italian chef hand-rolling pasta dough in a traditional kitchen",
      p2:       "antipasto board with cured meats, olives, artichokes, and fresh bread",
      outdoor:  "charming Italian trattoria exterior with warm lanterns and ivy-covered walls",
      interior: "warm rustic Italian restaurant interior with exposed brick, candlelight, and happy diners",
    };
  }
  if (ind.includes("chinese") || ind.includes("asian") || ind.includes("dim sum") || ind.includes("wonton") || ind.includes("stir fry") || ind.includes("stir-fry") || ind.includes("noodle") || ind.includes("dumpling")) {
    return {
      hero:     "a wok-tossed stir-fry with fresh vegetables, tender beef, and glossy savory sauce served over steamed rice",
      c1:       "a bamboo steamer basket filled with delicate dim sum dumplings and har gow",
      c2:       "lacquered Peking duck with crispy skin served with hoisin sauce and scallions",
      c3:       "a bowl of rich broth noodle soup garnished with green onions and slow-braised pork",
      p1:       "chef expertly tossing ingredients in a flaming wok over high heat",
      p2:       "elegant dim sum spread with bamboo steamers, dipping sauces, and jasmine tea",
      outdoor:  "welcoming Chinese restaurant exterior with decorative red lanterns and gold signage",
      interior: "elegant Asian restaurant interior with warm lighting, red lacquer accents, and bustling tables",
    };
  }
  if (ind.includes("bbq") || ind.includes("barbecue") || ind.includes("smokehouse") || ind.includes("smoked") || ind.includes("brisket") || ind.includes("ribs")) {
    return {
      hero:     "a platter of slow-smoked beef brisket sliced thick with a dark bark crust, served with pickles and white bread",
      c1:       "a rack of fall-off-the-bone smoked pork ribs glazed with tangy BBQ sauce",
      c2:       "a BBQ sampler platter with brisket, pulled pork, sausage links, coleslaw, and beans",
      c3:       "smoke billowing from a massive offset smoker filled with meat",
      p1:       "pitmaster pulling tender smoked pork shoulder in a professional smokehouse",
      p2:       "close-up of smoky charred brisket bark on a butcher-paper-lined tray",
      outdoor:  "rustic BBQ smokehouse exterior with a large smoker and wooden sign",
      interior: "casual warm BBQ joint interior with picnic tables, string lights, and diners enjoying plates of smoked meat",
    };
  }
  if (ind.includes("steakhouse") || ind.includes("steak house") || ind.includes("chophouse") || ind.includes("chop house")) {
    return {
      hero:     "a perfectly seared prime ribeye steak with a golden crust, served with roasted asparagus and compound butter",
      c1:       "a filet mignon sliced to reveal a perfect medium-rare pink center, topped with herb butter",
      c2:       "an elegant steakhouse table setting with a dry-aged porterhouse and a glass of red wine",
      c3:       "a classic wedge salad with blue cheese crumbles, bacon, and cherry tomatoes",
      p1:       "chef searing a thick-cut steak on a cast-iron skillet over high flame",
      p2:       "dry-aged prime cuts displayed in a glass-front aging case",
      outdoor:  "upscale steakhouse exterior with valet stand and warm entrance lighting",
      interior: "elegant steakhouse dining room with dark wood paneling, white tablecloths, and intimate lighting",
    };
  }
  if (ind.includes("seafood") || ind.includes("oyster") || ind.includes("lobster") || ind.includes("crab") || ind.includes("shrimp") || ind.includes("fish") || ind.includes("clam")) {
    return {
      hero:     "a stunning seafood platter with fresh lobster, crab claws, oysters on the half shell, and shrimp cocktail over crushed ice",
      c1:       "a dozen freshly shucked oysters on the half shell with mignonette sauce",
      c2:       "a whole grilled branzino with lemon, capers, and fresh herbs on a white plate",
      c3:       "steaming bowl of rich New England clam chowder topped with oyster crackers",
      p1:       "chef shucking fresh oysters at a raw bar station",
      p2:       "a beautiful whole steamed lobster with drawn butter and lemon",
      outdoor:  "charming coastal seafood restaurant exterior with nautical decor and ocean views",
      interior: "breezy seafood restaurant interior with shiplap walls, blue accents, and diners enjoying fresh catches",
    };
  }
  if (ind.includes("sushi") || ind.includes("japanese") || ind.includes("ramen") || ind.includes("udon") || ind.includes("sashimi") || ind.includes("izakaya") || ind.includes("teriyaki") || ind.includes("tempura")) {
    return {
      hero:     "an artfully arranged sushi platter with nigiri, maki rolls, sashimi, and edamame on a dark slate board",
      c1:       "a rich tonkotsu ramen bowl with chashu pork, soft-boiled egg, nori, bamboo shoots, and scallions",
      c2:       "chef's hands precisely slicing fresh sashimi-grade tuna with a Japanese knife",
      c3:       "a colorful dragon roll topped with sliced avocado and tobiko",
      p1:       "itamae chef pressing nigiri rice by hand with precision",
      p2:       "elegant Japanese presentation of sashimi with shiso, daikon, and wasabi",
      outdoor:  "sleek modern Japanese restaurant exterior with minimalist signage and warm entry lighting",
      interior: "serene Japanese restaurant interior with clean lines, wood accents, and sushi bar seating",
    };
  }
  if (ind.includes("burger") || ind.includes("sandwich") || ind.includes("sub") || ind.includes("hoagie") || ind.includes("deli")) {
    return {
      hero:     "a towering gourmet burger with a juicy smash patty, melted American cheese, caramelized onions, pickles, and special sauce on a brioche bun",
      c1:       "a cross-section of a fully loaded club sandwich on toasted sourdough with turkey, bacon, lettuce, and tomato",
      c2:       "a basket of crispy golden hand-cut fries with dipping sauces alongside a burger",
      c3:       "a perfectly stacked deli sub piled high with cured meats, provolone, and fresh vegetables",
      p1:       "cook pressing a smash burger on a flat-top grill until perfectly crispy",
      p2:       "artisan burger buns and fresh toppings neatly arranged on a prep counter",
      outdoor:  "lively burger joint exterior with bold signage and a line of hungry customers",
      interior: "fun casual burger restaurant interior with counter seating, chalkboard menu, and happy diners",
    };
  }
  if (ind.includes("pizza") || ind.includes("pizzeria")) {
    return {
      hero:     "a freshly baked New York-style pizza with bubbling mozzarella, San Marzano tomato sauce, and fresh basil pulled from a wood-fired oven",
      c1:       "a perfectly charred Neapolitan margherita pizza with a puffy cornicione crust",
      c2:       "a Chicago deep-dish pizza slice with thick layers of sausage, cheese, and chunky tomato sauce",
      c3:       "close-up of melted cheese stretching from a hot pizza slice",
      p1:       "pizzaiolo hand-tossing pizza dough in the air in a professional kitchen",
      p2:       "rows of artisan pizzas baking in a blazing wood-fired brick oven",
      outdoor:  "welcoming pizzeria exterior with a vintage neon sign and warm street lighting",
      interior: "lively pizzeria interior with brick walls, open kitchen, and the aroma of fresh pizza",
    };
  }
  if (ind.includes("restaurant") || ind.includes("food") || ind.includes("cafe") || ind.includes("bakery") || ind.includes("diner") || ind.includes("bistro") || ind.includes("grill") || ind.includes("bar")) {
    return {
      hero:     "a beautifully plated signature dish with vibrant colors under warm restaurant lighting",
      c1:       "chef preparing fresh ingredients in a professional kitchen",
      c2:       "cozy inviting restaurant dining room with warm ambient lighting",
      c3:       "close-up of a tempting dessert or specialty drink",
      p1:       "sizzling pan of fresh seasonal ingredients being tossed",
      p2:       "artfully arranged appetizers on a rustic wooden board",
      outdoor:  "charming restaurant exterior with warm lighting and inviting entrance",
      interior: "warm cozy restaurant interior with diners enjoying their meals",
    };
  }
  if (ind.includes("salon") || ind.includes("beauty") || ind.includes("hair") || ind.includes("nail") || ind.includes("spa") || ind.includes("barber")) {
    return {
      hero:     "a skilled stylist creating a beautiful hair transformation in a modern salon",
      c1:       "gorgeous finished hairstyle under professional studio lighting",
      c2:       "clean modern salon interior with styling stations and mirrors",
      c3:       "happy client smiling at their reflection in a salon mirror",
      p1:       "stylist applying highlights with precision foils",
      p2:       "luxurious hair care products and tools neatly arranged",
      outdoor:  "stylish modern salon storefront with welcoming signage",
      interior: "bright airy salon interior with natural light and modern decor",
    };
  }
  if (ind.includes("gym") || ind.includes("fitness") || ind.includes("workout") || ind.includes("training") || ind.includes("yoga") || ind.includes("crossfit")) {
    return {
      hero:     "a personal trainer motivating a client through a dynamic workout in a modern gym",
      c1:       "rows of clean modern cardio and strength equipment in a bright gym",
      c2:       "group fitness class in an energetic bright studio",
      c3:       "athlete completing a strength training session with proper form",
      p1:       "close-up of weights and gym equipment in a professional facility",
      p2:       "clean locker room with modern amenities",
      outdoor:  "modern fitness center building exterior with motivational signage",
      interior: "bright spacious gym floor with high-end equipment and natural light",
    };
  }
  if (ind.includes("insur")) {
    return {
      hero:     "a friendly insurance agent meeting with a family in a professional office",
      c1:       "insurance agent reviewing a policy with a smiling client",
      c2:       "happy family standing in front of their protected home",
      c3:       "professional modern insurance office with welcoming decor",
      p1:       "agent shaking hands with a satisfied client",
      p2:       "insurance forms and documents on a clean organized desk",
      outdoor:  "professional insurance office building exterior",
      interior: "bright welcoming insurance office lobby with comfortable seating",
    };
  }
  if (ind.includes("daycare") || ind.includes("child") || ind.includes("preschool") || ind.includes("kinder")) {
    return {
      hero:     "happy children playing and learning in a bright colorful daycare classroom",
      c1:       "teacher reading to a group of engaged young children",
      c2:       "colorful safe outdoor play area with happy children",
      c3:       "clean bright classroom with learning materials and cheerful decor",
      p1:       "children doing arts and crafts at a colorful table",
      p2:       "teacher comforting and playing with toddlers",
      outdoor:  "inviting daycare building exterior with safe fenced playground",
      interior: "warm safe daycare room with age-appropriate toys and natural light",
    };
  }
  if (ind.includes("financ") || ind.includes("account") || ind.includes("tax") || ind.includes("wealth") || ind.includes("invest") || ind.includes("bank")) {
    return {
      hero:     "a professional financial advisor consulting with a client in a modern office",
      c1:       "financial advisor reviewing growth charts with a satisfied client",
      c2:       "clean modern financial office with large windows",
      c3:       "happy couple reviewing their financial plan",
      p1:       "professional reviewing financial documents at a tidy desk",
      p2:       "modern laptop displaying investment portfolio performance",
      outdoor:  "professional financial services office building exterior",
      interior: "bright modern financial office with clean desk and natural light",
    };
  }
  if (ind.includes("photo")) {
    return {
      hero:     "a professional photographer composing a portrait in a well-equipped studio",
      c1:       "beautifully lit family portrait captured by a professional",
      c2:       "wedding couple embracing in a romantic outdoor setting",
      c3:       "photographer reviewing stunning shots on a camera LCD",
      p1:       "professional camera with prime lens on a clean studio surface",
      p2:       "beautifully framed prints displayed in a photography studio",
      outdoor:  "photographer capturing a couple in a golden-hour outdoor session",
      interior: "professional photography studio with softboxes and clean white backdrop",
    };
  }
  return {
    hero:     `a professional ${industry} business providing excellent service to happy customers`,
    c1:       `professional ${industry} work being performed by a skilled technician`,
    c2:       `a satisfied customer with a completed ${industry} project`,
    c3:       `${industry} professional tools and equipment ready for service`,
    p1:       `${industry} specialist at work in a clean professional setting`,
    p2:       `${industry} team providing friendly professional service`,
    outdoor:  `${industry} business exterior with professional signage and welcoming entrance`,
    interior: `clean professional ${industry} workspace with natural light`,
  };
}

// ── Input type ───────────────────────────────────────────────────────────────

export interface AdPromptInput {
  bizName: string;
  tagline: string;
  phone: string;
  city: string;
  address: string;
  website: string;
  industry: string;
  menu: string[];
  offer: string;
  offerFine: string;
  template: string;
  sizeKey: string;
  photoUrl: string;
  logoData: string;
  generationIndex: number;
  spotId?: number;
  primaryColor?: string;
  accentColor?: string;
}

// ── Main builder ─────────────────────────────────────────────────────────────

/**
 * Build the Grok image-generation prompt for a single ad.
 * Pure function — no I/O. Returns the raw prompt string (before runtime trimming).
 *
 * @param d                Parsed request data matching AdPromptInput
 * @param isLandscape      True for medium/landscape spots (3"×2")
 * @param resolvedTemplate When provided, overrides d.template (used by adGenGrok to
 *                         pass the already-resolved surprise-me template key so the
 *                         prompt and the template reference image stay in sync).
 */
export function buildAdPrompt(
  d: AdPromptInput,
  isLandscape: boolean,
  resolvedTemplate?: string,
): string {
  const templateKey = resolvedTemplate ?? d.template ?? "parchment-classic";

  // Surprise Me theme selection
  const surpriseMeDefaultIdx = getDefaultThemeIndex(d.industry);
  const surpriseMeThemeIdx =
    d.generationIndex === 0
      ? surpriseMeDefaultIdx
      : (() => {
          const opts = SURPRISE_ME_THEMES.map((_, i) => i).filter(
            (i) => i !== surpriseMeDefaultIdx,
          );
          return opts[Math.floor(Math.random() * opts.length)]!;
        })();
  const selectedTheme = SURPRISE_ME_THEMES[surpriseMeThemeIdx]!;

  // Derived values
  const menu      = isLandscape ? d.menu.filter(Boolean).slice(0, 3) : d.menu.filter(Boolean);
  const menuStr   = menu.map((m, i) => `  ${i + 1}. ${m}`).join("\n") || "  (none)";
  const menuCount = menu.length;
  const fullAddress = [d.address, d.city].filter(Boolean).join(", ") || "(none)";
  const hasPhoto    = !!d.photoUrl;
  const hasLogo     = !!d.logoData;
  const ipc         = getIndustryPhotos(d.industry);
  const abbr        = (s: string) => s.split(' ').slice(0, 5).join(' ');

  const businessBlock = [
    `Business Name : ${d.bizName}`,
    `Tagline       : ${d.tagline  || "(none)"}`,
    `Phone         : ${d.phone    || "(none)"}`,
    `Address       : ${fullAddress}`,
    `Industry      : ${d.industry}`,
    `Menu/Services :\n${menuStr}`,
    `Special Offer : ${d.offer    || "(none)"}`,
    `Fine Print    : ${d.offerFine || "(none)"}`,
  ].join("\n");

  // Reference image lines
  const refLines: string[] = [];
  let imgIdx: number;
  let logoImg: number;

  if (isLandscape) {
    imgIdx = 1;
    if (templateKey !== "surprise-me") {
      const lsTmplDesc =
        templateKey === "parchment-classic"
          ? "landscape Parchment Classic layout: warm parchment texture, orange bookmark-ribbon pennant top-left, dark brush-stroke headline band, orange circular checkmark service badges left column, dashed coupon box, dark footer strip. Reproduce every zone exactly."
          : templateKey === "made-fresh"
            ? "landscape Made Fresh layout: warm wood-table bg, white plate + gingham cloth left, 'Made Fresh For You' chalkboard A-frame sign upper-right, white paint-stroke business info panel, golden ticket-stub coupon right. Reproduce all textures and zones exactly."
            : templateKey === "neighborhood-pro"
              ? "landscape Neighborhood Pro layout: deep forest-green bg, large white brush-stroke splash panel upper-left (headline zone), full-bleed hero photo upper-right, horizontal row of diagonal-cut service panels with circular lime-green icon badges, wide white brush-stroke offer/coupon area lower-center, dark green footer bar. Reproduce exactly."
              : templateKey === "at-your-service"
                ? "landscape At Your Service layout: light gray/cream textured bg, large dark navy hexagonal badge upper-left (logo zone), gold/yellow brush-stroke sweeping upper area, large hero photo zone blending into bg upper-right, wide dark navy band with circular white icon service badges, gold/yellow dashed-border coupon box lower-right, footer: location-pin + address left, phone center, QR right. Reproduce exactly."
                : templateKey === "home-elegance"
                  ? "landscape Home Elegance layout: cream/off-white bg with organic blob wave shapes, dark navy + gold accent scheme. Left side (cream blob area): dark navy hexagonal house-icon badge top-left, navy-bordered rounded-rect business-name box, smaller tagline box, additional text boxes, phone/address icons lower-left. Right side: large hero photo upper-right blending naturally, dark navy lower-right section with three overlapping circular photos (interior, kitchen, outdoor service), four rounded-rect service card tiles each topped by circular dark navy icon badge (house, tools, leaf, people), QR code far right. Reproduce exactly."
                  : templateKey === "sage-organic"
                  ? "landscape Sage Organic layout: cream/beige textured bg with dark olive/sage green and kraft paper accents. Upper-left: large dark olive circle with botanical leaf sprigs; large white/cream rounded-rect business-name zone; dark olive paint brush stroke below it. Upper-right: large hero photo in curved wave cutout, no hard border. Middle: four dark olive circular icon badges (award, people, handshake, shield) with vertical dividers; four cream rounded-rect service tiles below. Lower olive wave band: three equal-width landscape photos side by side. Lower-right: kraft paper dashed-stitch coupon rectangle. Footer: dark olive strip with location pin + address left, QR right. Reproduce exactly."
                  : templateKey === "purple-sage"
                  ? "landscape Purple Sage layout: cream/beige bg with muted lavender-purple and sage green accents. Upper-left: large muted purple circle + dot grid (decorative); sage green botanical leaf sprig (decorative). Large white/cream rounded-rect business-name panel; sweeping purple brush stroke below it. Upper-right: large circular hero photo in sage green ring border. Lower-right: two smaller overlapping circles (kitchen, outdoor patio). Middle: four muted sage green circular icon badges (professional, award, team, shield) with dividers; four cream service tiles below. Lower purple wave band with sage green brush stroke. Footer: dark purple strip with phone + oval pill | location pin + oval pill | QR. Reproduce exactly."
                  : templateKey === "brush-stroke"
                  ? "landscape Brush Stroke layout: cream/parchment bg with dark olive green and charcoal accents. Left half: large circular hero photo framed by dark organic brush-stroke swoosh curving around left side (no hard rectangular border). Upper-right: dark olive hexagonal house-icon badge (logo zone); wide horizontal olive green paint brush stroke above (headline zone); thin dark rule with diamond separator below. Middle-right: vertical column of service rows — each row has a circular olive-bordered icon badge on the left and a dark charcoal horizontal brush-stroke label in white on the right. Footer: dark charcoal curved-top band full-width — circular phone icon + field left, circular location pin + field center, QR code right. Reproduce exactly."
                  : templateKey === "heritage-home"
                  ? "landscape Heritage Home layout: cream/off-white (#f5f0e8) bg, deep burgundy (#6b1a2a) accents. Sweeping organic burgundy brush stroke diagonal lower-left to upper-right for depth. Left 40%: hero photo zone, full bleed left/top/bottom, right edge dissolves organically into brush stroke. Right 60%: upper area — large rounded-rect headline zone with thin burgundy border (business name bold serif, large; tagline in elegant italic serif below thin burgundy rule with diamond ◆ separator). Center-right: horizontal row of circular dark burgundy icon badges with thin vertical burgundy rule dividers; brush-stroke label for service + price below each badge. Footer: full-width dark burgundy bar — phone icon + number left, location pin + address center-left, dashed-border coupon box with scissor ✂ icon + offer center-right, QR code far right. Reproduce exactly."
                  : templateKey === "wok-fire"
                  ? "landscape Wok Fire layout: near-black bg with deep red, gold, and parchment accents. Upper-left: large torn-edge deep red paper panel (headline zone) with gold bookmark-ribbon pennant + three gold circular brad accents. Upper-right: large hero photo zone natural edges into dark bg, no hard border. Center: wide parchment/kraft torn-edge banner (tagline zone). Lower-left: golden ticket-stub coupon (dashed border, notched edges). Lower-right: dark chalkboard A-frame sign with wood frame (menu/services). Footer: location pin + address pill left, phone + phone pill center, QR code right, gold arrow accent. Reproduce exactly."
                  : "landscape Health & Wellness layout: soft cream/off-white bg, clinic/office photo in organic curved teal blob upper-left, large wide rounded-rectangle white headline panel upper-center, teal pill-shaped tagline bar below it, service panels row with circular teal icon badges and white rounded-rect text boxes, reception photo in organic teal blob lower-left, stethoscope on dark teal circular blob lower-right, small white rounded QR box, dark teal footer bar. Reproduce exactly.";
      refLines.push(`  • IMAGE ${imgIdx++} (LANDSCAPE TEMPLATE) — ${lsTmplDesc}`);
    }
    if (hasPhoto) {
      refLines.push(`  • IMAGE ${imgIdx++} (HERO PHOTO) — the product/service photograph. Composite into the hero photo zone with professional lighting and natural edge blending — no hard rectangular border.`);
    }
    logoImg = imgIdx;
    if (hasLogo) {
      refLines.push(`  • IMAGE ${imgIdx} (BUSINESS LOGO) — exact business logo, pixel-perfect, no stylization.`);
    }
  } else if (templateKey === "surprise-me") {
    imgIdx = 1;
    if (hasPhoto) {
      refLines.push(
        `  • IMAGE ${imgIdx++} (HERO PHOTO) — the product/service photograph. ` +
        "Composite as the dominant hero visual — blend edges using an organic mask, gradient fade, diagonal cut, or brushstroke shape. " +
        "Cinematic lighting with realistic shadow blending into the background layer.",
      );
    }
    if (hasLogo) {
      refLines.push(`  • IMAGE ${imgIdx} (BUSINESS LOGO) — exact business logo, pixel-perfect, no stylization.`);
    }
    logoImg = hasPhoto ? 2 : 1;
  } else {
    refLines.push(
      templateKey === "made-fresh"
        ? "  • IMAGE 1 (TEMPLATE) — warm restaurant postcard: natural wood table surface, 'Made Fresh For You' chalkboard sign, gingham cloth, golden ticket coupon stub, fresh white plate as hero focal point. Preserve all zones and atmosphere exactly."
        : templateKey === "neighborhood-pro"
          ? "  • IMAGE 1 (TEMPLATE) — bold outdoor-service postcard on deep forest-green bg: two overlapping white paint-brush splash shapes upper-left (headline zone), large hero photo zone upper-right, horizontal row of diagonal-cut service photo panels with circular green icon badges and white brush-stroke labels, wide white brush-stroke offer area lower section, dark green footer bar. Reproduce exactly."
          : templateKey === "at-your-service"
            ? "  • IMAGE 1 (TEMPLATE) — home-services postcard on light gray/off-white textured bg, navy blue + gold/yellow scheme: large dark navy hexagonal badge upper-left (logo zone), bold horizontal gold/yellow brush-stroke sweeping upper third, large hero photo zone upper-right blending naturally, wide dark navy horizontal band center-full-width, circular white icon service badges on the navy band, gold/yellow dashed-border coupon box lower-right, dark strip footer. Reproduce exactly."
            : templateKey === "home-elegance"
              ? "  • IMAGE 1 (TEMPLATE) — premium home-services postcard on cream/off-white bg, dark navy + gold scheme: dark navy hexagonal house-icon badge upper-left, large hero photo upper-right bleeding off edge, organic cream blob wave left-center with navy-bordered rounded-rect business-name box + smaller tagline box + gold dot separator, three overlapping circular photos (living room, kitchen, outdoor service) middle-right, wide dark navy lower section with four rounded-rect service card tiles each capped by circular navy icon badge (house, tools, leaf, people), dark navy footer bar with phone icon + QR code. Reproduce exactly."
              : templateKey === "sage-organic"
              ? "  • IMAGE 1 (TEMPLATE) — botanical organic postcard on cream/beige textured bg, dark olive/sage green + kraft paper scheme: large dark olive circle with botanical leaf sprigs top-left (decorative, not logo zone), large white/cream rounded-rect business-name panel upper-left, sweeping dark olive paint brush stroke below panel, large hero photo upper-right in curved wave cutout (no hard border), four dark olive circular icon badges (award, people, handshake, shield) with vertical dividers middle row, four cream rounded-rect service tiles below badges, dark olive wave band lower section with three landscape photos side by side, kraft paper dashed-stitch coupon rectangle lower-right, dark olive footer strip with location pin + QR. Reproduce exactly."
              : templateKey === "purple-sage"
              ? "  • IMAGE 1 (TEMPLATE) — premium lifestyle/home-services postcard on cream/beige bg, muted lavender-purple + sage green scheme: large muted purple circle + dot grid top-left (decorative, NOT logo zone), sage green botanical leaf sprig left (decorative), large white/cream rounded-rect business-name panel upper-left, sweeping purple paint brush stroke below panel, large circular hero photo in sage green ring border upper-right (no rectangular frame), two smaller overlapping circular photos lower-right (kitchen, outdoor patio), four muted sage green circular icon badges (professional, award, team, shield) with vertical dividers middle row, four cream rounded-rect service tiles below badges, muted purple wave band lower section, sage green brush stroke, dark purple footer strip with phone + oval pill | location pin + oval pill | QR. Reproduce exactly."
              : templateKey === "health-wellness"
              ? "  • IMAGE 1 (TEMPLATE) — health/wellness postcard on soft cream bg with teal accents: two clinic/office photos inside organic curved teal blob shapes upper section, large wide rounded-rectangle white panel center (headline zone), narrow teal pill-shaped bar below it (tagline zone), service panels with circular teal badge icons and white rounded-rect text boxes, reception/waiting-room photo in organic blob lower-left, teal stethoscope on dark teal circular blob lower-right, small white rounded QR box, dark teal footer bar. Reproduce exactly."
              : templateKey === "wok-fire"
              ? "  • IMAGE 1 (TEMPLATE) — dramatic dark restaurant/food postcard on near-black bg, deep red + gold + parchment accents: large torn-edge deep red paper panel upper-left (headline zone) with gold bookmark pennant + gold brad accents; large hero photo zone upper-right natural edges into dark bg, no hard border; wide parchment/kraft torn-edge banner center (tagline zone); golden ticket-stub coupon lower-left (dashed border, notched edges); dark chalkboard A-frame sign lower-right (menu/services); footer: location pin + address pill left, phone + phone pill center, QR code right, gold arrow. Reproduce exactly."
              : templateKey === "brush-stroke"
              ? "  • IMAGE 1 (TEMPLATE) — home-services postcard on cream/parchment bg with dark olive green and charcoal accents: large circular hero photo on the left framed by a dark organic brush-stroke swoosh (no hard rectangular border), dark olive hexagonal house-icon badge upper-right (logo zone), wide horizontal olive green paint brush stroke across upper-right area (headline zone), thin dark horizontal rule with small diamond separator below brush stroke, vertical column of service rows on the right each with a circular olive-bordered icon badge on the left and a dark charcoal horizontal brush-stroke shape with white text on the right, dark charcoal curved-top footer band spanning full width with circular phone icon + field left, circular location pin + field center, QR code right. Reproduce every zone and element exactly."
              : templateKey === "heritage-home"
              ? "  • IMAGE 1 (TEMPLATE) — premium home services postcard on cream/off-white (#f5f0e8) bg, deep burgundy (#6b1a2a) accents: sweeping organic burgundy brush stroke diagonal lower-left to upper-right. Upper-left: hero photo zone blending right edge into the brush stroke, no hard border. Upper-right: large rounded-rect headline zone with thin burgundy border, diamond ◆ separator between business name (bold serif) and tagline (elegant italic serif). Middle: horizontal row of circular dark burgundy icon badges with thin vertical burgundy rule dividers; brush-stroke-style label for service name and price below each badge. Footer: full-width dark burgundy bar — circular phone icon + number left, diamond accent, circular location pin + address; dashed-border rounded-rect coupon box with scissor ✂ upper-right corner + offer text; QR code far right. Reproduce every zone and element exactly."
              : "  • IMAGE 1 (TEMPLATE) — postcard with parchment texture, brush-stroke headline band, orange pennant ribbon, circular checkmark badge, dashed coupon box, dark footer strip. Reproduce every zone and element exactly.",
    );
    imgIdx = 2;
    if (hasPhoto) {
      refLines.push(`  • IMAGE ${imgIdx++} (HERO PHOTO) — the product/service photograph. Composite into the main hero image zone with professional lighting and realistic shadow blending.`);
    }
    if (hasLogo) {
      refLines.push(`  • IMAGE ${imgIdx} (BUSINESS LOGO) — exact business logo, pixel-perfect, no stylization.`);
    }
    logoImg = hasPhoto ? 3 : 2;
  }

  // ── Output requirements (template × orientation) ─────────────────────────
  const LANDSCAPE_CANVAS_RULE =
    "CANVAS RULE — ABSOLUTE: The 3\"×2\" image IS the ad. Fill 100% of the canvas to every edge — top, bottom, left, right. " +
    "NEVER render the postcard as a floating card, framed artwork, or object sitting on a background. " +
    "NEVER add any outer border, drop shadow, glow, vignette, gradient halo, or decorative element outside the ad content. " +
    "The ad begins at pixel 0 on all four sides.\n\n";

  const outputRequirements = isLandscape && templateKey === "parchment-classic"
    ? (
      LANDSCAPE_CANVAS_RULE +
      "LAYOUT — reproduce Parchment Classic LANDSCAPE zones exactly:\n\n" +
      `HEADLINE (dark brush-stroke band, upper area): business name in bold condensed all-caps slab serif, white. ` +
      `If the name has a common English category noun (Cafe/Grill/Pizza/Bar/Bakery/Salon/Diner) — render ONLY that word in warm orange script. Each word exactly once.\n\n` +
      (hasLogo
        ? `LOGO (orange pennant, top-left): IMAGE ${logoImg} centered inside pennant.` + (d.tagline ? ` Tagline in italic script beside pennant.\n\n` : "\n\n")
        : (d.tagline ? `TAGLINE: tagline in italic script.\n\n` : "")) +
      `SERVICE LIST (left column, parchment area): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} stacked rows and NO MORE — one per service in BUSINESS DETAILS, exactly as written. Each row is one visual unit: an orange circular checkmark badge on the left, immediately paired with the service text (including price if shown) to its right in the same horizontal row. Do NOT place badges in a standalone column separate from the text. The template image may show more badge slots — ignore any extra slots; do NOT render empty or blank badge rows. No extras. No invented services.\n\n`
        : `no services provided — leave the service list area empty; do not render any badge labels or invented items.\n\n`) +
      (hasPhoto
        ? `HERO PHOTO (right-center): composite IMAGE 2 blended into parchment texture, no hard border.\n\n`
        : `HERO PHOTO (right-center): generate a photorealistic, professional hero image appropriate for this business. Blend naturally into parchment texture; no hard border.\n\n`) +
      (d.offer
        ? `COUPON (dashed dark box, lower-right): offer text bold white/cream, large. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain an orange circular checkmark badge, a dashed coupon box or dashed-border rectangle, or an orange bookmark-ribbon pennant. Those elements are correct elsewhere on the card but must never be recreated or bleed into this corner square.\n\n`
    )
    : isLandscape && templateKey === "made-fresh"
    ? (
      LANDSCAPE_CANVAS_RULE +
      "LAYOUT — reproduce Made Fresh LANDSCAPE zones exactly:\n\n" +
      "BACKGROUND: warm wood-table scene — gingham cloth, white plate, 'Made Fresh For You' chalkboard A-frame sign, plant props. All exactly as in template.\n\n" +
      (hasPhoto ? "HERO PHOTO: composite IMAGE 2 as the featured dish on or near the white plate. Match warm editorial lighting.\n\n" : "") +
      `WHITE PAINT-STROKE PANEL (lower-left): business name bold condensed all-caps slab serif, dark, prominent.` +
      (d.tagline ? ` Tagline in handwriting-style italic script below.` : "") +
      (hasLogo ? ` Logo (IMAGE ${logoImg}) in upper corner of panel.` : "") + "\n\n" +
      (d.offer
        ? `GOLDEN TICKET-STUB COUPON (lower-right): offer text bold dark, large. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain a golden ticket-stub coupon (dashed border, notched edges), a white paint-stroke panel, or a chalkboard A-frame sign. Those elements are correct elsewhere on the card but must never be recreated or bleed into this corner square.\n\n`
    )
    : isLandscape && templateKey === "neighborhood-pro"
    ? (
      LANDSCAPE_CANVAS_RULE +
      "LAYOUT — reproduce Neighborhood Pro LANDSCAPE zones exactly:\n\n" +
      `HEADLINE (upper-left, white brush-stroke splash panel): business name bold condensed all-caps slab serif, dark green/near-black. ` +
      `If name has a common English service-category noun (Lawn/Cleaning/Roofing/Plumbing) — that word only in bright lime-green script. Each word once.\n\n` +
      (hasLogo
        ? `LOGO (IMAGE ${logoImg} inside white brush-stroke panel).` + (d.tagline ? ` Tagline in italic script, dark green, inside white area.\n\n` : "\n\n")
        : (d.tagline ? `TAGLINE in italic script, dark green, inside white splash area.\n\n` : "")) +
      "HERO PHOTO (upper-right, full-bleed): " +
      (hasPhoto
        ? `composite IMAGE 2 — clean diagonal/curved cut at photo edge, no rectangular border.\n\n`
        : `${ipc.outdoor} — vibrant, no rectangular border.\n\n`) +
      `SERVICE PANELS (middle horizontal row): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} diagonal-cut panel${menuCount !== 1 ? "s" : ""} and NO MORE — one per service in BUSINESS DETAILS, exactly as written. Circular lime-green icon badge + white brush-stroke label per panel. The template image may show more panel slots — ignore extras; do NOT render empty panels. No extras. No invented services.\n\n`
        : `service panel row — render the structural diagonal-cut panel shapes with circular lime-green icon badge graphics only; NO text labels (no services provided).\n\n`) +
      (d.offer
        ? `OFFER (wide white brush-stroke area, lower section): offer text bold dark-green, large. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain a diagonal-cut service panel, a circular lime-green icon badge, or a white brush-stroke offer area. Those elements are correct elsewhere on the card but must never be recreated or bleed into this corner square.\n\n`
    )
    : isLandscape && templateKey === "at-your-service"
    ? (
      LANDSCAPE_CANVAS_RULE +
      "LAYOUT — reproduce At Your Service LANDSCAPE zones exactly:\n\n" +
      (hasLogo ? `LOGO (IMAGE ${logoImg} centered inside dark navy hexagonal badge, upper-left).\n\n` : "") +
      `HEADLINE (beside hexagonal badge, upper-left): business name bold condensed all-caps slab serif, dark navy. ` +
      `If name has a common English service-category noun — that word only in gold/yellow script. Each word once.` +
      (d.tagline ? ` Tagline in clean italic script, dark navy, below headline.` : "") + "\n\n" +
      "HERO PHOTO (upper-right): " +
      (hasPhoto
        ? `composite IMAGE 2 — blend left edge into bg, gold brush-stroke overlaps photo at top, no hard border.\n\n`
        : `${ipc.hero} — left edge blends naturally.\n\n`) +
      `SERVICE BADGES (wide dark navy band, center full-width): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} circular white icon badge${menuCount !== 1 ? "s" : ""} on the navy band and NO MORE — one per service in BUSINESS DETAILS, exactly as written. The template image may show more badge slots — ignore extras; do NOT render empty badges. No extras. No invented services.\n\n`
        : `navy band — render decorative circular icon badge graphics only; NO text captions or labels (no services provided).\n\n`) +
      (d.offer
        ? `COUPON (gold/yellow dashed-border box, lower-right): offer text bold dark navy, prominent. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain a gold/yellow dashed-border coupon box, a circular white icon badge from the navy band, or a gold/yellow brush-stroke element. Those elements are correct elsewhere on the card but must never be recreated or bleed into this corner square.\n\n`
    )
    : isLandscape && templateKey === "purple-sage"
    ? (
      LANDSCAPE_CANVAS_RULE +
      "LAYOUT — reproduce Purple Sage LANDSCAPE zones exactly:\n\n" +
      "DECORATIVE ACCENTS (top-left: large muted purple circle + dot grid; left: sage green botanical leaf sprig — NOT logo zones).\n\n" +
      (hasLogo ? `LOGO (IMAGE ${logoImg} placed inside or beside the white/cream rounded-rect headline panel).\n\n` : "") +
      `HEADLINE (large white/cream rounded-rect panel, upper-left): business name bold condensed all-caps sans-serif, very large, dark purple/near-black.` +
      (d.tagline ? ` Tagline in clean italic script below, dark purple.` : "") + "\n\n" +
      "BRUSH STROKE (sweeping muted purple paint brush stroke below headline panel — structural, no text).\n\n" +
      "HERO PHOTO (upper-right, large circular frame in sage green ring border):\n" +
      (hasPhoto
        ? `  Composite IMAGE ${hasLogo ? logoImg + 1 : 2} — fill circular frame with sage green ring border, no hard rectangular edges. Cinematic lighting.\n\n`
        : `  ${ipc.hero}. Fill circular frame with sage green ring border.\n\n`) +
      `SECONDARY PHOTOS (lower-right, two smaller overlapping circles): generate two circular-cropped photos — ${ipc.c1} and ${ipc.c2}. Each perfectly circular.\n\n` +
      `SERVICE BADGES + TILES (middle section): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} muted sage green circular icon badge${menuCount !== 1 ? "s" : ""} with thin vertical dividers and EXACTLY ${menuCount} cream rounded-rect tile${menuCount !== 1 ? "s" : ""} below — one per service in BUSINESS DETAILS, exactly as written. The template image may show more slots — ignore extras; do NOT render empty badges or tiles. No extras. No invented services.\n\n`
        : `four decorative sage green circular icon badges with dividers; four cream rounded-rect tile shapes; NO text labels.\n\n`) +
      "PURPLE WAVE BAND (lower section): muted lavender-purple organic wave/blob shape spanning full width, sage green brush stroke accent.\n\n" +
      (d.offer
        ? `SPECIAL OFFER (dashed coupon box, lower area): offer text bold dark, fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain a muted purple circle or dot-grid accent, a dashed coupon box, a cream rounded-rect tile, or a sage green leaf sprig element. Those elements are correct elsewhere on the card but must never be recreated or bleed into this corner square.\n\n`
    )
    : isLandscape && templateKey === "sage-organic"
    ? (
      LANDSCAPE_CANVAS_RULE +
      "LAYOUT — reproduce Sage Organic LANDSCAPE zones exactly:\n\n" +
      "BOTANICAL ACCENT (large dark olive circle with leaf sprigs, top-left corner — decorative, not a logo zone).\n\n" +
      (hasLogo ? `LOGO (IMAGE ${logoImg} placed inside or beside the cream rounded-rect headline panel).\n\n` : "") +
      `HEADLINE (large white/cream rounded-rect panel, upper-left): business name bold condensed all-caps sans-serif, very large, dark olive green.` +
      (d.tagline ? ` Tagline in clean italic script below, dark olive.` : "") + "\n\n" +
      "BRUSH STROKE (dark olive sweeping paint brush stroke below headline panel — structural, no text).\n\n" +
      "HERO PHOTO (upper-right, curved wave cutout shape):\n" +
      (hasPhoto
        ? `  Composite IMAGE ${hasLogo ? logoImg + 1 : 2} — fill upper-right wave zone, blend edges naturally into cream bg, no hard border. Cinematic lighting.\n\n`
        : `  ${ipc.hero}. Fill upper-right curved zone, blend naturally.\n\n`) +
      `SERVICE BADGES + TILES (middle section): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} dark olive circular icon badge${menuCount !== 1 ? "s" : ""} with thin vertical dividers and EXACTLY ${menuCount} cream rounded-rect tile${menuCount !== 1 ? "s" : ""} below — one per service in BUSINESS DETAILS, exactly as written. The template image may show more slots — ignore extras; do NOT render empty badges or tiles. No extras. No invented services.\n\n`
        : `four decorative dark olive circular icon badges with vertical dividers; four cream rounded-rect tile shapes; NO text labels.\n\n`) +
      `PHOTO COLLAGE STRIP (dark olive wave band, lower section): three equal-width landscape photos side by side — ${ipc.interior}, ${ipc.c1}, ${ipc.outdoor}.\n\n` +
      (d.offer
        ? `COUPON (kraft paper dashed-stitch rectangle, lower-right, scissors icon): offer text bold dark, fine print below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain a kraft paper dashed-stitch coupon rectangle, a dark olive circular icon badge, or a dark olive wave band element. Those elements are correct elsewhere on the card but must never be recreated or bleed into this corner square.\n\n`
    )
    : isLandscape && templateKey === "home-elegance"
    ? (
      LANDSCAPE_CANVAS_RULE +
      "LAYOUT — reproduce Home Elegance LANDSCAPE zones exactly:\n\n" +
      (hasLogo ? `LOGO (IMAGE ${logoImg} inside dark navy hexagonal badge, upper-left).\n\n` : "") +
      `HEADLINE (cream blob left area): business name bold condensed all-caps slab serif, dark navy.` +
      (d.tagline ? ` Tagline in clean italic script, dark navy, below headline box.` : "") + "\n\n" +
      "HERO PHOTO (upper-right, large):\n" +
      (hasPhoto
        ? `  Composite IMAGE 2 — fill upper-right zone, blend left edge naturally into cream bg, no hard border. Cinematic lighting.\n\n`
        : `  ${ipc.hero}. Fill upper-right, blend into cream bg.\n\n`) +
      "CIRCULAR PHOTOS (dark navy right area, three overlapping circles): " +
      `generate three circular-cropped photos — ${ipc.c1}, ${ipc.c2}, ${ipc.c3}. Each perfectly circular with subtle gold ring accent.\n\n` +
      `SERVICE TILES (dark navy lower-right area): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} rounded-rect service tile${menuCount !== 1 ? "s" : ""} and NO MORE — one per service from BUSINESS DETAILS, exactly as written. Each tile: circular dark navy icon badge on top, service name below inside cream card body. The template image may show more tile slots — ignore extras; do NOT render empty tiles. No extras. No invented services.\n\n`
        : `render decorative rounded-rect tile shapes with circular dark navy icon badge graphics only; NO text labels (no services provided).\n\n`) +
      (d.offer
        ? `SPECIAL OFFER (dashed coupon box, lower area): offer text bold dark navy, large. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain a solid navy filled rectangle, a rounded-rect service tile, or a circular dark navy icon badge. Those elements belong in the SERVICE TILES and dark navy lower area but must never be recreated or bleed into this corner square.\n\n`
    )
    : isLandscape && templateKey === "health-wellness"
    ? (
      LANDSCAPE_CANVAS_RULE +
      "LAYOUT — reproduce Health & Wellness LANDSCAPE zones exactly:\n\n" +
      "PHOTOS (upper area, inside organic teal blob shapes): " +
      (hasPhoto
        ? `composite IMAGE 2 into upper-left blob — edges blend naturally into teal shape. Generate a complementary second wellness image for remaining blob.\n\n`
        : `generate two photorealistic images — ${ipc.p1} in one blob, ${ipc.p2} in the other. No rectangular borders.\n\n`) +
      `HEADLINE (large rounded-rect white panel, upper-center): business name bold condensed all-caps sans-serif, dark teal/near-black. Each word exactly once.\n\n` +
      (d.tagline ? `TAGLINE (teal pill-shaped bar below white panel): tagline in clean white sans-serif, centered.\n\n` : "") +
      `SERVICE PANELS (middle section): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} equal-width panel${menuCount !== 1 ? "s" : ""} and NO MORE — one per service in BUSINESS DETAILS, exactly as written. Circular teal icon badge + white rounded-rect text box per panel. The template image may show more panel slots — ignore extras; do NOT render empty panels. No extras. No invented services.\n\n`
        : `service panel row — render the structural panel shapes with circular teal icon badge graphics only; NO text labels (no services provided).\n\n`) +
      (hasLogo ? `LOGO (IMAGE ${logoImg}) in an upper corner or within the headline panel.\n\n` : "") +
      (d.offer
        ? `OFFER (teal-bordered rect or dashed coupon box, visually distinct from service panels): offer text large and bold. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain an organic teal blob shape, a circular teal badge, or a white rounded-rect text box or panel. Those elements are correct elsewhere on the card but must never be recreated or bleed into this corner square.\n\n`
    )
    : isLandscape && templateKey === "wok-fire"
    ? (
      LANDSCAPE_CANVAS_RULE +
      "LAYOUT — reproduce Wok Fire LANDSCAPE zones exactly:\n\n" +
      `HEADLINE (upper-left, inside torn-edge deep red panel): business name bold condensed all-caps slab serif, very large, white or cream. Each word exactly once.\n\n` +
      (hasLogo
        ? `LOGO (IMAGE ${logoImg} inside gold bookmark-ribbon pennant at top-left of red panel). Scale to fit; exact colors.` +
          (d.tagline ? ` Tagline in italic script, gold/cream, inside red panel.\n\n` : "\n\n")
        : (d.tagline ? `TAGLINE: italic script, gold/cream, inside red panel below business name.\n\n` : "")) +
      "HERO FOOD PHOTO (upper-right, wok/cooking action):\n" +
      (hasPhoto
        ? `  Composite IMAGE 2 into the hero zone. Natural edges into dark bg, no hard border.\n\n`
        : `  ${ipc.hero} — dramatic, vibrant. Natural edges; no hard border.\n\n`) +
      (d.tagline
        ? `TAGLINE BANNER (center, parchment/kraft torn-edge banner): "${d.tagline}" in dark serif text.\n\n`
        : "") +
      (d.offer
        ? `COUPON (lower-left, golden ticket-stub — dashed border, notched edges): offer text bold dark. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      (menuCount > 0
        ? `CHALKBOARD MENU (lower-right, dark A-frame sign): EXACTLY ${menuCount} item${menuCount !== 1 ? "s" : ""} and NO MORE in chalk-style white text — one per service in BUSINESS DETAILS, exactly as written. The template image may show more chalkboard lines — ignore extras; do NOT render empty chalk lines. No extras.\n\n`
        : `CHALKBOARD SIGN (lower-right): A-frame — leave board surface clean.\n\n`) +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain a dark chalkboard A-frame sign, a golden ticket-stub coupon, a torn-edge deep red panel element, or a parchment/kraft torn-edge banner. Those elements are correct elsewhere on the card but must never be recreated or bleed into this corner square.\n\n`
    )
    : isLandscape && templateKey === "brush-stroke"
    ? (
      LANDSCAPE_CANVAS_RULE +
      "LAYOUT — reproduce Brush Stroke LANDSCAPE zones exactly:\n\n" +
      (hasLogo ? `LOGO (IMAGE ${logoImg} centered inside dark olive hexagonal badge, upper-right).\n\n` : "") +
      `HEADLINE (upper-right, wide horizontal olive green paint brush stroke): business name bold condensed all-caps slab serif, white, inside the olive brush stroke.` +
      (d.tagline ? ` Tagline in clean italic script, dark, below the brush stroke + thin rule with diamond separator.` : "") + "\n\n" +
      "HERO PHOTO (left half, large circular frame with dark brush-stroke swoosh):\n" +
      (hasPhoto
        ? `  Composite IMAGE 2 — fill circular frame, dark brush-stroke swoosh curves around left side, no hard rectangular border. Cinematic lighting.\n\n`
        : `  ${ipc.hero}. Fill circular frame, dark brush-stroke swoosh curves around left side; no hard border.\n\n`) +
      `SERVICE ROWS (middle-right, vertical column): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} service row${menuCount !== 1 ? "s" : ""} and NO MORE — one per service in BUSINESS DETAILS, exactly as written. Each row: circular olive-bordered icon badge on the left + dark charcoal horizontal brush-stroke shape with white text label on the right. The template image may show more row slots — ignore extras; do NOT render empty rows. No extras. No invented services.\n\n`
        : `vertical column of decorative service rows — render structural circular olive-bordered icon badge + charcoal brush-stroke shapes only; NO text labels (no services provided).\n\n`) +
      (d.offer
        ? `SPECIAL OFFER (visually distinct dashed or bordered box, lower area): offer text bold dark, large. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain a circular olive-bordered icon badge, a dark charcoal horizontal brush-stroke shape, or a dark charcoal curved-top footer extension. Those elements are correct elsewhere on the card but must never be recreated or bleed into this corner square.\n\n`
    )
    : isLandscape && templateKey === "heritage-home"
    ? (
      LANDSCAPE_CANVAS_RULE +
      "LAYOUT — reproduce Heritage Home LANDSCAPE zones exactly:\n\n" +
      "DIAGONAL BRUSH STROKE (deep burgundy, sweeping from lower-left to upper-right — organic and painterly, structural depth element, no text).\n\n" +
      (hasLogo ? `LOGO (IMAGE ${logoImg} placed inside or beside the rounded-rect headline zone, upper-right).\n\n` : "") +
      `HEADLINE (upper-right, large rounded-rect zone with thin burgundy border): business name bold serif, large, dark burgundy/near-black.` +
      (d.tagline ? ` Below a thin burgundy rule with diamond ◆ accent: tagline in elegant italic serif, dark burgundy.` : "") + "\n\n" +
      "HERO PHOTO (left 40%, full bleed left/top/bottom):\n" +
      (hasPhoto
        ? `  Composite IMAGE 2 into the hero zone. Fill left zone, right edge dissolves organically into the diagonal burgundy brush stroke; no hard border.\n\n`
        : `  ${ipc.hero}. Fill left zone, right edge dissolves into brush stroke; no hard border.\n\n`) +
      `SERVICE BADGES (center-right, horizontal row): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} circular dark burgundy icon badge${menuCount !== 1 ? "s" : ""} in a horizontal row and NO MORE — one per service in BUSINESS DETAILS, exactly as written. Thin vertical burgundy rule on right side of each badge divides them. Below each badge: brush-stroke-style label with service name and price. The template image may show more badge slots — ignore extras; do NOT render empty badge rows. No extras. No invented services.\n\n`
        : `four decorative dark burgundy circular icon badge shapes with thin vertical burgundy rule dividers; NO text labels.\n\n`) +
      (d.offer
        ? `COUPON (dashed-border box in footer, scissors ✂ icon at upper-right of box): offer text bold cream inside dashed box. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain a cream-background rounded-rect with a thin burgundy border, a headline-style box with a diamond ◆ separator, or any element from the HEADLINE zone. Those elements are correct in the upper-right area of the card but must never be recreated or bleed into this corner square.\n\n`
    )
    : isLandscape
    ? (
      `DESIGN BRIEF — original LANDSCAPE (3"×2") postcard ad. Full creative freedom.\n\n` +
      `STYLE THEME — "${selectedTheme.name}" (mood: ${selectedTheme.mood}):\n` +
      `  PALETTE: ${selectedTheme.palette}\n` +
      `  TYPOGRAPHY: ${selectedTheme.typography}\n` +
      `  LAYOUT: ${selectedTheme.layoutLandscape}\n\n` +
      "DO NOT recreate any existing LocalSpot template style: Parchment/rustic | Chalkboard/bistro | Forest-green contractor | Navy/gold home services | Teal/sage wellness | Cream/navy circular-photo elegance | Sage/olive botanical kraft | Lavender/sage circular-photo lifestyle.\n\n" +
      "VISUAL RULES (mandatory):\n" +
      "  • Fill 100% of the 3\"×2\" canvas to every edge — no blank areas, no outer border, no drop shadow outside the ad.\n" +
      "  • No hard rectangular photo borders — mask/blend edges with organic shapes, gradients, or diagonal cuts.\n" +
      "  • Background: gradient, texture, or layered wash — never flat solid color.\n" +
      "  • Three depth planes: (1) textured bg, (2) graphic mid-layer shapes, (3) foreground text with shadows/glows.\n" +
      "  • All text clearly readable: opaque backing, heavy drop shadow, or solid text fill — no subtle shadows.\n\n" +
      "CONTENT ZONES:\n" +
      `  HEADLINE: business name — very large, dominant, instantly readable.\n` +
      (hasPhoto
        ? `  HERO PHOTO: IMAGE 1 — organic-masked edges, cinematic lighting, no rectangular frame.\n`
        : `  HERO IMAGE: photorealistic business-appropriate image, cinematic quality, blended into bg.\n`) +
      (hasLogo ? `  LOGO: IMAGE ${logoImg} — exact placement, no stylization.\n` : "") +
      (d.tagline ? `  TAGLINE: tagline from BUSINESS DETAILS — supporting, secondary to headline.\n` : "") +
      (menuCount > 0 ? `  SERVICES/MENU: each service from BUSINESS DETAILS exactly once, in its own clearly defined list zone. Service text bold.\n` : "") +
      (d.offer
        ? `  SPECIAL OFFER (own visually distinct coupon zone — dashed box or bordered panel, clearly separated from services): offer text and fine print from BUSINESS DETAILS. No filler phrases. No QR inside coupon.\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey)
    )
    : templateKey === "neighborhood-pro"
    ? (
      "LAYOUT — reproduce Neighborhood Pro template zones exactly:\n\n" +
      `HEADLINE (upper-left, inside white brush-stroke splash panel): business name bold condensed all-caps slab serif, very large, dark green/near-black, horizontal. ` +
      `If name contains a common English service-category noun (Lawn/Care/Cleaning/Roofing/Plumbing/Dental/Grill/Pizza) — render ONLY that word in bright-green/lime-green script at a slight angle. Never for proper nouns. Each word once.\n\n` +
      (hasLogo
        ? `LOGO + TAGLINE (inside white brush-stroke panel): IMAGE ${logoImg} inside white splash area, above/beside headline, with clear margin.` +
          (d.tagline ? ` Tagline in clean italic script, dark green, inside white area below logo.` : "") + "\n\n"
        : (d.tagline ? `TAGLINE (inside white brush-stroke panel, below headline): tagline in clean italic script, dark green.\n\n` : "")) +
      "HERO IMAGE (upper-right, large full-bleed):\n" +
      (hasPhoto
        ? `  Composite IMAGE 2 into the upper-right zone — fill completely, no rectangular border, clean diagonal/curved cut where photo meets the green bg. Cinematic lighting.\n\n`
        : `  ${ipc.outdoor} — bright daylight, vibrant. Full bleed, no rectangular border.\n\n`) +
      `SERVICE PANELS (middle horizontal row): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} diagonal-cut panel${menuCount !== 1 ? "s" : ""} and NO MORE — one per service in BUSINESS DETAILS, exactly as written. Service photo + circular green icon badge + white brush-stroke label per panel. The template image may show more panel slots — ignore extras; do NOT render empty panels. No extras. No invented services. No offer in service panels.\n\n`
        : `service panel row — render the structural diagonal-cut panel shapes with circular green icon badge graphics only; NO text labels (no services provided).\n\n`) +
      (d.offer
        ? `SPECIAL OFFER (wide white brush-stroke area, lower section): offer text bold dark-green, large. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain a diagonal-cut service panel, a circular lime-green icon badge, or a white brush-stroke offer area. Those elements are correct elsewhere on the card but must never be recreated or bleed into this corner square.\n\n`
    )
    : templateKey === "at-your-service"
    ? (
      "LAYOUT — reproduce At Your Service template zones exactly:\n\n" +
      `HEADLINE (upper-left, beside hexagonal badge): business name bold condensed all-caps slab serif, very large, dark navy, horizontal. ` +
      `If name contains a common English service-category noun (Plumbing/Electric/Roofing/Painting/Services/Heating/Cooling/Lawn) — render ONLY that word in gold/yellow script at a slight angle. Never for proper nouns. Each word once.\n\n` +
      (hasLogo
        ? `LOGO (inside navy hexagonal badge, upper-left): IMAGE ${logoImg} centered inside dark navy hexagonal badge, with clear margin, preserving exact colors.` +
          (d.tagline ? ` Tagline in clean italic script, navy blue, below headline.\n\n` : "\n\n")
        : (d.tagline ? `TAGLINE (below headline, upper-left): tagline in clean italic script, dark navy blue.\n\n` : "")) +
      "HERO IMAGE (upper-right, large photo zone):\n" +
      (hasPhoto
        ? `  Composite IMAGE 2 — fill upper-right area, blend left edge naturally into bg, gold/yellow brush stroke overlaps photo at top, no hard border. Cinematic lighting.\n\n`
        : `  ${ipc.hero}. Fill upper-right zone, blend naturally into off-white bg.\n\n`) +
      `SERVICE ICONS (wide dark navy band, center full-width): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} circular white icon badge${menuCount !== 1 ? "s" : ""} on the navy band and NO MORE — one per service in BUSINESS DETAILS, exactly as written. The template image may show more badge slots — ignore extras; do NOT render empty badges. No extras. No invented services.\n\n`
        : `navy band — render decorative circular icon badge graphics only; NO text captions or labels (no services provided).\n\n`) +
      (d.offer
        ? `SPECIAL OFFER (gold/yellow dashed-border coupon box, lower-right): offer text bold dark navy, large. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain a gold/yellow dashed-border coupon box, a circular white icon badge from the navy band, or a gold/yellow brush-stroke element. Those elements are correct elsewhere on the card but must never be recreated or bleed into this corner square.\n\n`
    )
    : templateKey === "purple-sage"
    ? (
      "LAYOUT — reproduce Purple Sage template zones exactly:\n\n" +
      "DECORATIVE ACCENTS (top-left: muted purple circle + dot grid; left: sage green leaf sprig — structural only).\n\n" +
      (hasLogo
        ? `LOGO (IMAGE ${logoImg} inside or beside the white/cream rounded-rect headline panel).\n\n`
        : "") +
      `HEADLINE (white/cream rounded-rect panel, upper-left): business name bold condensed all-caps sans-serif, large, dark purple/near-black. Each word once.` +
      (d.tagline ? ` Tagline italic script below, dark purple.` : "") + "\n\n" +
      "BRUSH STROKES (structural, no text): muted purple below headline; sage green lower area.\n\n" +
      "HERO PHOTO (upper-right, circular frame, sage green ring border):\n" +
      (hasPhoto
        ? `  Composite IMAGE 2 — fill circular frame; sage green ring border; no hard border. Cinematic lighting.\n\n`
        : `  ${ipc.hero}. Circular frame, sage green ring border.\n\n`) +
      `SECONDARY PHOTOS (lower-right, two overlapping circles): ${abbr(ipc.c1)}, ${abbr(ipc.c2)}.\n\n` +
      `SERVICE BADGES (middle row): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} muted sage green circular icon badge${menuCount !== 1 ? "s" : ""} with thin vertical dividers — one per service in BUSINESS DETAILS. Ignore extra slots; no empty badges.\n\n`
        : `four decorative sage green circular icon badge graphics with thin vertical dividers; NO text labels.\n\n`) +
      `SERVICE TILES (below badges): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} cream rounded-rect tile${menuCount !== 1 ? "s" : ""} — one per service, label inside. Ignore extra slots; no empty tiles.\n\n`
        : `four cream rounded-rect tile shapes; NO text labels.\n\n`) +
      "PURPLE WAVE BAND (lower): muted lavender-purple wave, full width.\n\n" +
      (d.offer
        ? `SPECIAL OFFER (dashed coupon box, lower area): offer text bold dark, fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR LOCK: No purple circle/dot-grid, coupon box, cream tile, or leaf sprig in QR corner.\n\n`
    )
    : templateKey === "sage-organic"
    ? (
      "LAYOUT — reproduce Sage Organic template zones exactly:\n\n" +
      "BOTANICAL ACCENT (large dark olive circle with leaf sprigs, top-left — decorative, NOT a logo zone).\n\n" +
      (hasLogo
        ? `LOGO (IMAGE ${logoImg} placed inside or beside the white/cream rounded-rect headline panel).\n\n`
        : "") +
      `HEADLINE (large white/cream rounded-rect panel, upper-left): business name bold condensed all-caps sans-serif, very large, dark olive green. Each word once.` +
      (d.tagline ? ` Tagline in clean italic script below, dark olive green.` : "") + "\n\n" +
      "BRUSH STROKE (dark olive brush stroke below headline panel — structural, NO text).\n\n" +
      "HERO PHOTO (upper-right, curved wave organic cutout):\n" +
      (hasPhoto
        ? `  Composite IMAGE 2 — fill upper-right curved wave zone, blend left/bottom edges naturally into cream bg, no hard rectangular border. Cinematic lighting.\n\n`
        : `  ${ipc.hero}. Fill upper-right curved zone, blend naturally into cream bg.\n\n`) +
      `SERVICE BADGES (middle row): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} dark olive circular icon badge${menuCount !== 1 ? "s" : ""} with thin vertical dividers — one per service in BUSINESS DETAILS. Ignore extra slots; no empty badges.\n\n`
        : `four decorative dark olive circular icon badge graphics (award, people, handshake, shield) with thin vertical dividers; NO text labels.\n\n`) +
      `SERVICE TILES (below badges): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} cream rounded-rect tile${menuCount !== 1 ? "s" : ""} — one per service, label inside. Ignore extra slots; no empty tiles.\n\n`
        : `four cream rounded-rect tile shapes; NO text labels.\n\n`) +
      `PHOTO COLLAGE STRIP (dark olive wave band, lower): three photos — ${abbr(ipc.interior)}, ${abbr(ipc.c1)}, ${abbr(ipc.outdoor)}.\n\n` +
      (d.offer
        ? `COUPON (kraft paper/cardboard textured rectangle with dashed stitched border and scissors icon, lower-right): offer text bold dark, fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR LOCK: No kraft coupon, dark olive badge, or olive wave band in QR corner.\n\n`
    )
    : templateKey === "home-elegance"
    ? (
      "LAYOUT — reproduce Home Elegance template zones exactly:\n\n" +
      (hasLogo
        ? `LOGO (IMAGE ${logoImg} centered inside dark navy hexagonal badge, upper-left).\n\n`
        : "") +
      `HEADLINE (inside cream blob wave, left-center area): business name bold condensed all-caps slab serif, very large, dark navy. ` +
      `If name has a common English service-category noun (Plumbing/Roofing/Painting/Landscaping/Services/Remodeling) — render ONLY that word in gold script. Each word once.` +
      (d.tagline ? ` Tagline in clean italic script, dark navy, below headline box.` : "") + "\n\n" +
      "HERO PHOTO (upper-right, large photo zone):\n" +
      (hasPhoto
        ? `  Composite IMAGE 2 — fill upper-right zone, blend left/bottom edges naturally into cream bg, no hard border. Cinematic lighting.\n\n`
        : `  ${ipc.hero}. Fill upper-right zone, blend naturally into cream bg.\n\n`) +
      "CIRCULAR PHOTOS (middle-right area, three overlapping circles): " +
      `generate three circular-cropped photos — ${ipc.c1}, ${ipc.c2}, ${ipc.c3}. Each perfectly circular with subtle gold ring accent.\n\n` +
      `SERVICE TILES (wide dark navy lower area): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} equal rounded-rect service tile${menuCount !== 1 ? "s" : ""} and NO MORE — one per service in BUSINESS DETAILS, exactly as written. Each tile: circular dark navy icon badge on top (house, tools, leaf, or people icon), service name below inside cream card. The template image may show more tile slots — ignore extras; do NOT render empty tiles. No extras. No invented services.\n\n`
        : `navy area — render four decorative rounded-rect tile shapes with circular dark navy icon badge graphics only; NO text labels (no services provided).\n\n`) +
      (d.offer
        ? `SPECIAL OFFER (dashed coupon box, lower area): offer text bold dark navy, large. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR LOCK — not in QR corner: a solid navy rectangle, a rounded-rect service tile, or a circular dark navy icon badge.\n\n`
    )
    : templateKey === "surprise-me"
    ? (
      "DESIGN BRIEF — create a completely ORIGINAL postcard ad. Full creative freedom:\n\n" +
      `STYLE THEME — "${selectedTheme.name}" (mood: ${selectedTheme.mood}):\n` +
      `  PALETTE: ${selectedTheme.palette}\n` +
      `  TYPOGRAPHY: ${selectedTheme.typography}\n` +
      `  LAYOUT: ${selectedTheme.layoutPortrait}\n\n` +
      "DO NOT recreate any existing LocalSpot style (parchment/rustic, chalkboard/bistro, forest-green, navy/gold, teal/sage, cream/navy, sage/olive, lavender/sage).\n\n" +
      "VISUAL RULES: fill canvas edge-to-edge; no rectangular photo borders; textured/gradient bg; three depth planes; all text clearly readable.\n\n" +
      "CONTENT ZONES:\n" +
      `  HEADLINE: business name — very large, dominant, instantly readable.\n` +
      (hasPhoto
        ? `  HERO PHOTO: IMAGE ${imgIdx > 1 ? imgIdx - 1 : 1} — organic-masked edges (blob/brush-stroke/diagonal cut/gradient fade), cinematic lighting, no rectangular frame.\n`
        : `  HERO IMAGE: photorealistic, business-appropriate, cinematic quality, blended into bg with organic mask or gradient fade.\n`) +
      (hasLogo ? `  LOGO: IMAGE ${logoImg} — exact placement, no stylization.\n` : "") +
      (d.tagline ? `  TAGLINE: tagline from BUSINESS DETAILS — supporting, secondary to headline.\n` : "") +
      (menuCount > 0 ? `  SERVICES/MENU: each service from BUSINESS DETAILS exactly once in its own clearly defined list zone.\n` : "") +
      (d.offer
        ? `  SPECIAL OFFER (own visually distinct coupon zone, clearly separated from services): offer text and fine print from BUSINESS DETAILS. No filler phrases. No QR inside coupon.\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      "QUALITY: ✗ flat bg | ✗ rectangular frames | ✗ text on bare color | ✗ filler in coupon. ✓ Three depth planes | ✓ cinematic edge blending | ✓ 300 DPI.\n\n"
    )
    : templateKey === "health-wellness"
    ? (
      "LAYOUT — reproduce Health & Wellness template zones exactly:\n\n" +
      "HERO PHOTOS (upper section, inside organic teal blob shapes): " +
      (hasPhoto
        ? `composite IMAGE 2 into upper-right organic teal blob — no hard border, natural edges blending into teal shape. Generate a second complementary wellness/clinic image for the upper-left blob.\n\n`
        : `generate two photorealistic images — ${ipc.p1} in one blob, ${ipc.p2} in the other. No rectangular borders.\n\n`) +
      `HEADLINE (center, large rounded-rect white panel): business name bold condensed all-caps sans-serif, very large, dark teal/near-black. Each word exactly once.\n\n` +
      (d.tagline ? `TAGLINE (teal pill-shaped bar below white panel): tagline in clean white sans-serif, centered.\n\n` : "") +
      `SERVICE PANELS (middle section): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} equal-width panel${menuCount !== 1 ? "s" : ""} and NO MORE — one per service in BUSINESS DETAILS, exactly as written. Each panel: circular teal badge + white icon on top, white rounded-rect text box below. The template image may show more panel slots — ignore extras; do NOT render empty panels. No extras. No invented services. No offer in service panels.\n\n`
        : `service panel row — render the structural panel shapes with circular teal icon badge graphics only; NO text labels (no services provided).\n\n`) +
      `LOWER PHOTOS (organic blob shapes): ${ipc.interior} in left blob; ${ipc.c1} in right blob.\n\n` +
      (d.offer
        ? `SPECIAL OFFER: offer text prominently in teal or dark text in an available white-space area. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain an organic teal blob shape, a circular teal badge, or a white rounded-rect text box or panel. Those elements are correct elsewhere on the card but must never be recreated or bleed into this corner square.\n\n`
    )
    : templateKey === "wok-fire"
    ? (
      "LAYOUT — reproduce Wok Fire template zones exactly:\n\n" +
      `HEADLINE (upper-left, inside large torn-edge deep red paper panel): business name bold condensed all-caps slab serif, very large, white or cream. Each word exactly once.\n\n` +
      (hasLogo
        ? `LOGO (gold bookmark-ribbon pennant, top-left corner of red panel): IMAGE ${logoImg} centered inside pennant, scaled to fit, exact colors.` +
          (d.tagline ? ` Tagline in italic script, gold/cream, inside red panel below business name.\n\n` : "\n\n")
        : (d.tagline ? `TAGLINE: italic script, gold/cream, inside red panel below business name.\n\n` : "")) +
      "HERO FOOD PHOTO (upper-right, wok/cooking action scene):\n" +
      (hasPhoto
        ? `  Composite IMAGE 2 into the hero zone. Natural edges into dark bg, no hard border. Cinematic lighting.\n\n`
        : `  ${ipc.hero} — dramatic. Natural edges into dark bg; no hard border.\n\n`) +
      (d.tagline
        ? `TAGLINE BANNER (center, parchment/kraft torn-edge banner): "${d.tagline}" in dark serif text on the banner.\n\n`
        : "") +
      (d.offer
        ? `COUPON (lower-left, golden ticket-stub — dashed border, notched edges): offer text bold dark inside ticket-stub. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      (menuCount > 0
        ? `CHALKBOARD MENU (lower-right, dark chalkboard A-frame sign): EXACTLY ${menuCount} item${menuCount !== 1 ? "s" : ""} and NO MORE in chalk-style white text — one per service in BUSINESS DETAILS, exactly as written. The template image may show more chalkboard lines — ignore extras; do NOT render empty chalk lines. No extras. No invented items.\n\n`
        : `CHALKBOARD SIGN (lower-right): A-frame sign — leave board surface clean (no services provided).\n\n`) +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain a dark chalkboard A-frame sign, a golden ticket-stub coupon, a torn-edge deep red panel element, or a parchment/kraft torn-edge banner. Those elements must never appear in the QR corner square.\n\n`
    )
    : templateKey === "brush-stroke"
    ? (
      "LAYOUT — reproduce Brush Stroke template zones exactly:\n\n" +
      (hasLogo ? `LOGO (IMAGE ${logoImg} centered inside dark olive hexagonal badge, upper-right).\n\n` : "") +
      `HEADLINE (wide horizontal olive green paint brush stroke, upper area): business name bold condensed all-caps slab serif, white, inside the olive brush stroke.` +
      (d.tagline ? ` Tagline in clean italic script, dark, below the brush stroke + thin rule with diamond separator.` : "") + "\n\n" +
      "HERO PHOTO (large circular frame framed by dark brush-stroke swoosh):\n" +
      (hasPhoto
        ? `  Composite IMAGE 2 — fill circular frame, dark brush-stroke swoosh curves around one side, no hard rectangular border. Cinematic lighting.\n\n`
        : `  ${ipc.hero}. Fill circular frame, dark brush-stroke swoosh framing; no hard border.\n\n`) +
      `SERVICE ROWS (vertical column): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} service row${menuCount !== 1 ? "s" : ""} and NO MORE — one per service in BUSINESS DETAILS, exactly as written. Each row: circular olive-bordered icon badge on the left + dark charcoal horizontal brush-stroke shape with white text label on the right. The template image may show more row slots — ignore extras; do NOT render empty rows. No extras. No invented services.\n\n`
        : `vertical column of decorative service rows — render structural circular olive-bordered icon badge + charcoal brush-stroke shapes only; NO text labels (no services provided).\n\n`) +
      (d.offer
        ? `SPECIAL OFFER (visually distinct dashed or bordered box, lower area): offer text bold dark, large. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain a circular olive-bordered icon badge, a dark charcoal horizontal brush-stroke shape, or a dark charcoal curved-top footer extension. Those elements must never appear in the QR corner square.\n\n`
    )
    : templateKey === "heritage-home"
    ? (
      "LAYOUT — reproduce Heritage Home template zones exactly:\n\n" +
      "DIAGONAL BRUSH STROKE (deep burgundy, lower-left to upper-right — structural depth element, no text).\n\n" +
      (hasLogo ? `LOGO (IMAGE ${logoImg} placed inside or beside the rounded-rect headline zone, upper-right).\n\n` : "") +
      `HEADLINE (upper-right, rounded-rect zone with thin burgundy border): business name bold serif, very large, dark burgundy/near-black.` +
      (d.tagline ? ` Below a thin burgundy horizontal rule with diamond ◆ accent: tagline in elegant italic serif, dark burgundy.` : "") + "\n\n" +
      "HERO PHOTO (upper-left, fills upper-left area and bleeds into diagonal brush stroke):\n" +
      (hasPhoto
        ? `  Composite IMAGE 2 into the hero zone. Fill upper-left, right edge dissolves organically into the burgundy brush stroke; no hard border.\n\n`
        : `  ${ipc.hero}. Fill upper-left zone, right edge dissolves into brush stroke; no hard border.\n\n`) +
      `SERVICE BADGES (middle, horizontal row full width): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} dark burgundy circular icon badge${menuCount !== 1 ? "s" : ""} evenly spaced — one per service in BUSINESS DETAILS. Thin vertical burgundy rule divider on right of each; brush-stroke label below. Ignore extra slots; no empty badges. No invented services.\n\n`
        : `four decorative dark burgundy circular icon badge shapes with thin vertical burgundy rule dividers; NO text labels.\n\n`) +
      (d.offer
        ? `COUPON (footer area, dashed-border rounded-rect, scissors ✂ icon upper-right corner): offer text bold inside dashed box. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR LOCK — must not contain in QR corner: a cream-background rounded-rect with a thin burgundy border, a headline-style box with a diamond ◆ separator, or any element from the HEADLINE zone.\n\n`
    )
    : (
      // Default: parchment-classic portrait
      "LAYOUT — render these zones top to bottom:\n\n" +
      `HEADLINE (top): business name uses a LAYERED TWO-FONT treatment — main words in bold condensed all-caps slab/block serif, very large, dark color, horizontal. ` +
      `IF name contains a common English category/industry noun (Cafe/Grill/Spa/Pizza/Bar/Salon/Dental/Kitchen/Bakery/Bistro/Diner) — render ONLY that one word in flowing orange script at ≈−8° angle. Never for proper nouns or brand names. Each word exactly once.\n\n` +
      (hasLogo
        ? `LOGO + TAGLINE (orange pennant ribbon, top-left, TOP EDGE flush with top of ad): ` +
          `IMAGE ${logoImg} centered inside pennant, scaled to fit with clear margin, exact colors preserved.` +
          (d.tagline ? ` Tagline in handwriting-style italic script (+5°–7°), large, confident, to the right of pennant below headline.` : "") + "\n\n"
        : (d.tagline ? `TAGLINE (upper-left, below headline): tagline in handwriting-style italic script (+5°–7°), large, confident.\n\n` : "")) +
      "HERO IMAGE (right-center, large feature area): " +
      (hasPhoto
        ? `composite IMAGE 2 into the template's photo area — blend edges naturally into the dark brush-stroke/painted background, no hard border. Match warm commercial food photography style.\n\n`
        : `${ipc.hero}. Blend naturally into dark brush-stroke background, no hard border.\n\n`) +
      (menuCount > 0
        ? `MENU/SERVICES (left-center area, orange circular checkmark badges): EXACTLY ${menuCount} item${menuCount !== 1 ? "s" : ""} and NO MORE — one per service/item in BUSINESS DETAILS, exactly as written. Prices right-aligned if present. The template image may show more badge slots — ignore extras; do NOT render empty or blank badge rows. No extras. No invented items.\n\n`
        : `no services provided — leave the service list area empty; do not render any badge labels or invented items.\n\n`) +
      (d.offer
        ? `SPECIAL OFFER (dashed coupon box): offer text bold inside dashed rectangle. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape, d.sizeKey) +
      `QR ZONE HARD CONSTRAINT: The bottom-right corner square reserved for the QR code must NOT contain an orange circular checkmark badge, a dashed coupon box or dashed-border rectangle, or an orange bookmark-ribbon pennant. Those elements are correct elsewhere on the card but must never be recreated or bleed into this corner square.\n\n`
    );

  return (
    (isLandscape && templateKey === "surprise-me"
      ? "You are a world-class print advertising art director. Create a PRINT-READY LANDSCAPE (3\"×2\") postcard ad from scratch — original layout, color scheme, and typography tailored to this business.\n\n"
      : isLandscape
        ? "You are a world-class print advertising art director. Create a PRINT-READY LANDSCAPE (3\"×2\") postcard ad by integrating the business details and reference photos into the template layout — single cohesive ad, not a template with content pasted on top.\n\n"
        : templateKey === "surprise-me"
        ? "You are a world-class print advertising art director. Create a PRINT-READY postcard ad from scratch — original layout, color scheme, and typography tailored to this business.\n\n"
        : "You are a world-class print advertising art director. Create a PRINT-READY postcard ad by integrating the business details and reference photos into the template layout — single cohesive ad, not a template with content pasted on top.\n\n") +
    (refLines.length > 0
      ? `REFERENCE IMAGES (${refLines.length} provided — treat as distinct inputs, do NOT merge their styles):\n` +
        refLines.join("\n") + "\n\n"
      : "") +
    outputRequirements + "\n" +
    (d.primaryColor && d.accentColor
      ? `BRAND COLORS: Primary ${d.primaryColor} · Accent ${d.accentColor}. Use these as the brand color for header/footer bars, icon badge fills, coupon border accent, and headline highlights. Integrate them harmoniously with the template's visual framework.\n\n`
      : "") +
    "TYPOGRAPHIC RULES — ABSOLUTE:\n" +
    "  • NEVER add any word, abbreviation, or industry term not provided verbatim in the business data below — industry/category descriptors (e.g. RESTAURANT, DENTAL, HVAC, ROOFING) are strictly forbidden additions. The business name must appear EXACTLY as provided, character for character, with zero additions, zero stylistic embellishments, and zero extra words inserted.\n" +
    "  • NEVER split a business name across two visual styles (e.g. bold + script, or large + small) — render the complete business name in a single consistent typographic treatment.\n\n" +
    "STRICT FIDELITY — ABSOLUTE: Every word of text on this ad must come from BUSINESS DETAILS. Do NOT invent, add, hallucinate, or paraphrase any text, service name, menu item, or label not present in BUSINESS DETAILS. " +
    "If a field is '(none)', omit that element entirely. If no services are listed, render no service text labels anywhere on the ad. " +
    "CRITICAL: All text must appear exactly as specified — zero tolerance for errors on phone numbers, prices, business name, or address. " +
    (fullAddress !== "(none)" ? `Address "${fullAddress}" MUST appear in the footer. ` : "") +
    "No website URL text anywhere. Business name: each word appears exactly once across the entire ad. " +
    "Each menu/service item exactly once. Special offer in its own distinct coupon zone — never listed alongside menu items. " +
    "PRICES: If a menu or service item has no price, do NOT add one — never invent or append a dollar amount to any item unless that exact price appears verbatim in BUSINESS DETAILS.\n\n" +
    "QR CODE — ABSOLUTE BAN: Never draw, render, or depict any QR code, barcode, or grid of squares/dots anywhere in this image. A real, verified QR is composited server-side after generation. Bottom-right corner: solid fill only — no marks, no patterns.\n\n" +
    "BUSINESS DETAILS:\n" + businessBlock
  );
}
