import path from "node:path";
import fs from "node:fs";
import { buildAdPrompt, type AdPromptInput } from "./buildAdPrompt";
import { swapQrCode } from "./locateQrCode";
import { getTemplateQrStyle } from "./compositeQr";

/** Walk up from cwd until we find pnpm-workspace.yaml. */
function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const WORKSPACE_ROOT = findWorkspaceRoot();

const TEMPLATE_PORTRAIT: Record<string, string> = {
  "parchment-classic":  "mr_biscuits_template_no_logo_1778806527327.png",
  "neighborhood-pro":   "6300F2D5-6BF1-403E-A40B-7203E4E26402_1778948283280.jpeg",
  "at-your-service":    "IMG_0728_1779065210873.jpeg",
  "health-wellness":    "healthcare_generic_template_1779141099043.png",
  "home-elegance":      "home_services_no_text_1780946323885.png",
  "sage-organic":       "IMG_0832_1780946925550.png",
  "heritage-home":      "heritage_home_portrait.png",
  "wok-fire":           "image_1781029065584.png",
};

const CATEGORY_TEMPLATE: Record<string, string> = {
  "health":      "health-wellness",
  "medical":     "health-wellness",
  "dental":      "health-wellness",
  "restaurant":  "wok-fire",
  "food":        "wok-fire",
  "cafe":        "wok-fire",
  "pizza":       "wok-fire",
  "home":        "home-elegance",
  "roofing":     "home-elegance",
  "plumbing":    "home-elegance",
  "hvac":        "home-elegance",
  "landscaping": "home-elegance",
  "cleaning":    "home-elegance",
  "remodel":     "home-elegance",
  "contractor":  "neighborhood-pro",
  "electrician": "neighborhood-pro",
  "auto":        "at-your-service",
  "mechanic":    "at-your-service",
  "yoga":        "sage-organic",
  "spa":         "sage-organic",
  "wellness":    "sage-organic",
};

/**
 * Maps a business category to short, punchy service-box labels (≤ 3 words each).
 *
 * Outscraper `subtypes` are Google Maps category descriptors like
 * "air conditioning contractor" — useful context but too long/generic for
 * service boxes in the ad template. This helper returns a tailored list for
 * known verticals and falls back to the first 3 subtypes (truncated to 3 words)
 * for everything else.
 */
const SERVICE_MENU: Record<string, string[]> = {
  // Home services
  "hvac":        ["AC Repair", "Heating Service", "Duct Cleaning", "Tune-Ups"],
  "plumbing":    ["Drain Cleaning", "Leak Repair", "Water Heater", "Repiping"],
  "electrician": ["Panel Upgrades", "Wiring", "Outlets & Switches", "Inspections"],
  "roofing":     ["Roof Repair", "New Roofs", "Inspections", "Gutters"],
  "landscaping": ["Lawn Care", "Tree Service", "Mulching", "Design"],
  "cleaning":    ["Deep Cleaning", "Move-In/Out", "Weekly Service", "Sanitizing"],
  "remodel":     ["Kitchen Remodel", "Bath Remodel", "Flooring", "Painting"],
  "contractor":  ["New Construction", "Additions", "Renovation", "Framing"],
  "pest":        ["Termite Control", "Rodent Removal", "Mosquito Treatment", "Prevention"],
  "painting":    ["Interior", "Exterior", "Cabinet Painting", "Staining"],
  "fence":       ["Wood Fences", "Vinyl Fences", "Gate Installation", "Repairs"],
  "flooring":    ["Hardwood", "Tile", "Carpet", "LVP"],
  "pool":        ["Pool Cleaning", "Repairs", "Chemical Service", "Openings & Closings"],
  "pressure":    ["Driveways", "Decks", "Siding", "Roofs"],
  "junk":        ["Junk Removal", "Hauling", "Demo Cleanup", "Same-Day Service"],
  "septic":      ["Pumping", "Inspections", "Repairs", "New Installs"],
  "gutter":      ["Gutter Cleaning", "Leaf Guards", "Repairs", "New Installs"],
  "window":      ["Window Cleaning", "Replacement", "Screen Repair", "Tinting"],
  "garage":      ["Door Repair", "Opener Install", "Spring Replacement", "New Doors"],
  "hardware":    ["Tools & Supplies", "Home Repair", "Custom Orders", "Rentals"],
  // Health & wellness
  "dental":      ["Cleanings", "Whitening", "Fillings", "Implants"],
  "health":      ["Consultations", "Preventive Care", "Lab Work", "Telehealth"],
  "medical":     ["Consultations", "Preventive Care", "Lab Work", "Telehealth"],
  "urgent":      ["Walk-In Care", "Physicals", "Lab Work", "X-Rays"],
  "chiro":       ["Adjustments", "Spinal Decompression", "Massage", "Rehab"],
  "optom":       ["Eye Exams", "Contacts", "Glasses", "LASIK Consult"],
  "therapy":     ["Individual Sessions", "Group Therapy", "Evaluations", "Telehealth"],
  "yoga":        ["Yoga Classes", "Pilates", "Meditation", "Workshops"],
  "spa":         ["Massages", "Facials", "Body Wraps", "Waxing"],
  "wellness":    ["Massages", "Skin Care", "Nutrition", "Holistic Care"],
  "gym":         ["Personal Training", "Group Classes", "Nutrition", "Memberships"],
  "fitness":     ["Personal Training", "Group Classes", "Cardio", "Memberships"],
  "massage":     ["Swedish Massage", "Deep Tissue", "Hot Stone", "Sports Massage"],
  // Food & beverage
  "restaurant":  ["Dine-In", "Takeout", "Catering", "Happy Hour"],
  "food":        ["Dine-In", "Takeout", "Catering", "Happy Hour"],
  "cafe":        ["Coffee", "Breakfast", "Lunch", "Pastries"],
  "coffee":      ["Espresso Drinks", "Cold Brew", "Pastries", "Seasonal Specials"],
  "pizza":       ["Delivery", "Dine-In", "Catering", "Slice Deals"],
  "bakery":      ["Fresh Bread", "Custom Cakes", "Pastries", "Wholesale"],
  "ice cream":   ["Soft Serve", "Hard Scoop", "Sundaes & Shakes", "Party Catering"],
  "gelato":      ["Artisan Gelato", "Seasonal Flavors", "Cones & Cups", "Catering"],
  "frozen":      ["Frozen Treats", "Custom Flavors", "Shakes & Floats", "Party Orders"],
  "dessert":     ["Custom Cakes", "Ice Cream", "Pastries & Cookies", "Catering"],
  "sandwich":    ["Made-to-Order Subs", "Breakfast", "Catering", "Daily Specials"],
  "deli":        ["Custom Sandwiches", "Platters", "Catering", "Daily Specials"],
  "diner":       ["Breakfast All Day", "Comfort Food", "Daily Specials", "Takeout"],
  "brewery":     ["Craft Beer", "Tours & Tastings", "Private Events", "Growler Fills"],
  "winery":      ["Wine Tastings", "Bottle Sales", "Private Events", "Wine Club"],
  "distillery":  ["Spirits Tastings", "Bottle Sales", "Tours", "Private Events"],
  "catering":    ["Corporate Events", "Weddings", "Drop-Off Service", "Custom Menus"],
  "food truck":  ["Daily Specials", "Private Events", "Catering", "Takeout"],
  // Hospitality
  "inn":         ["Cozy Guest Rooms", "Full Breakfast", "Local Activities", "Event Hosting"],
  "hotel":       ["Comfortable Rooms", "Free Breakfast", "Extended Stays", "Event Hosting"],
  "motel":       ["Clean Rooms", "Free Wi-Fi", "Extended Stays", "Pet Friendly"],
  "lodge":       ["Cabin Rentals", "Outdoor Activities", "Group Stays", "Local Guides"],
  "bed":         ["Cozy Rooms", "Full Breakfast", "Local Tours", "Private Baths"],
  "resort":      ["Rooms & Suites", "Pool & Spa", "Dining", "Private Events"],
  "cabin":       ["Cabin Rentals", "Outdoor Activities", "Group Retreats", "Pet Friendly"],
  "vacation":    ["Vacation Rentals", "Full-Home Stays", "Weekly Rates", "Local Concierge"],
  "airbnb":      ["Short-Term Stays", "Full-Home Rental", "Local Recommendations", "Flexible Booking"],
  // Auto
  "auto":        ["Oil Change", "Brake Service", "Tires", "Diagnostics"],
  "mechanic":    ["Oil Change", "Brake Service", "Engine Repair", "Diagnostics"],
  "tow":         ["24/7 Towing", "Roadside Help", "Long Distance", "Lockout"],
  "car wash":    ["Full Detail", "Express Wash", "Interior Clean", "Waxing"],
  "tire":        ["Tire Sales", "Balancing", "Rotation", "Flat Repair"],
  "body shop":   ["Collision Repair", "Paint Matching", "Dent Removal", "Insurance Claims"],
  "oil change":  ["Oil Change", "Fluid Check", "Filter Replacement", "Multi-Point Inspection"],
  // Professional services
  "law":         ["Free Consult", "Estate Planning", "Injury Claims", "Family Law"],
  "attorney":    ["Free Consult", "Estate Planning", "Injury Claims", "Family Law"],
  "account":     ["Tax Prep", "Bookkeeping", "Payroll", "Business Filing"],
  "insur":       ["Home Insurance", "Auto Insurance", "Life Insurance", "Business"],
  "real estate": ["Buy a Home", "Sell Your Home", "Rentals", "Free CMA"],
  "mortgage":    ["Home Purchase Loans", "Refinancing", "Pre-Approval", "Free Consult"],
  "financial":   ["Retirement Planning", "Investments", "Tax Strategy", "Free Consult"],
  "notary":      ["Document Notarization", "Mobile Service", "Apostille", "Same-Day"],
  // Beauty
  "salon":       ["Haircuts", "Color", "Highlights", "Blowouts"],
  "barber":      ["Haircuts", "Fades", "Beard Trim", "Hot Shave"],
  "nail":        ["Manicure", "Pedicure", "Gel Nails", "Nail Art"],
  "tattoo":      ["Custom Tattoos", "Cover-Ups", "Piercings", "Consultations"],
  "esthetic":    ["Facials", "Waxing", "Brow Shaping", "Skin Treatments"],
  "lash":        ["Lash Extensions", "Lifts & Tints", "Fills", "Removal"],
  "boutique":    ["Women's Clothing", "Accessories", "Gift Items", "Personal Styling"],
  "jewelry":     ["Custom Jewelry", "Repairs", "Engraving", "Estate Buying"],
  "apparel":     ["Men's & Women's", "Custom Orders", "Alterations", "Gift Cards"],
  // Other
  "pet":         ["Grooming", "Boarding", "Daycare", "Vet Services"],
  "vet":         ["Wellness Exams", "Vaccinations", "Surgery", "Dental Care"],
  "photo":       ["Portraits", "Events", "Headshots", "Weddings"],
  "wedding":     ["Photography", "Videography", "DJ", "Planning"],
  "florist":     ["Fresh Arrangements", "Wedding Flowers", "Corporate Orders", "Delivery"],
  "tutor":       ["Math", "Reading", "SAT Prep", "Test Taking"],
  "child":       ["After School", "Summer Camp", "Tutoring", "Activities"],
  "daycare":     ["Infant Care", "Toddler Programs", "After School", "Summer Camp"],
  "church":      ["Sunday Service", "Youth Group", "Community Events", "Missions"],
  "storage":     ["Climate Control", "Drive-Up Units", "24/7 Access", "Moving Supplies"],
  "moving":      ["Local Moves", "Long Distance", "Packing", "Storage"],
  "print":       ["Banners", "Business Cards", "Signs", "T-Shirts"],
  "sign":        ["Banners", "Vehicle Wraps", "Indoor Signs", "Custom Orders"],
  "it":          ["Network Setup", "PC Repair", "Data Recovery", "Security"],
  "computer":    ["PC Repair", "Data Recovery", "Virus Removal", "Upgrades"],
  "antique":     ["Antique Furniture", "Collectibles", "Appraisals", "Estate Buying"],
  "gift":        ["Gift Baskets", "Custom Orders", "Local Artisan Goods", "Gift Cards"],
  "supplement":  ["Vitamins & Supplements", "Protein & Recovery", "Nutrition Advice", "In-Store Pickup"],
};

const GENERIC_SERVICE_MENU = ["Quality Service", "Locally Owned", "Free Estimates", "Call Today"];

/**
 * Short, punchy slogans for the tagline zone(s) in the outreach ad.
 * Must be ≤ 6 words so they read naturally as both an inline italic
 * sub-heading (inside the red panel) and a parchment-banner headline.
 */
const CATEGORY_TAGLINE: Record<string, string> = {
  // Food & beverage
  "restaurant":  "Fresh Food, Made to Order",
  "food":        "Fresh Food, Made to Order",
  "pizza":       "Hot Pizza, Every Time",
  "diner":       "Home Cooking at Its Best",
  "cafe":        "Your Favorite Local Stop",
  "coffee":      "Your Favorite Local Stop",
  "bakery":      "Baked Fresh Every Morning",
  "ice cream":   "Sweet Treats Worth Savoring",
  "gelato":      "Sweet Treats Worth Savoring",
  "frozen":      "Sweet Treats Worth Savoring",
  "dessert":     "Sweet Treats Worth Savoring",
  "sandwich":    "Made Fresh, Every Order",
  "deli":        "Made Fresh, Every Order",
  "bbq":         "Slow-Smoked, Worth the Wait",
  "barbecue":    "Slow-Smoked, Worth the Wait",
  "brewery":     "Craft Beer, Local Pride",
  "winery":      "Uncork Something Special",
  "distillery":  "Spirits Crafted with Care",
  "catering":    "Events Made Delicious",
  // Hospitality
  "inn":         "Feel Right at Home",
  "hotel":       "Feel Right at Home",
  "motel":       "Comfortable Stays, Great Value",
  "lodge":       "Adventure Starts Right Here",
  "bed":         "Feel Right at Home",
  "resort":      "Your Perfect Getaway",
  "cabin":       "Escape to the Outdoors",
  "vacation":    "Your Home Away From Home",
  // Home services
  "hvac":        "Quality Work, Done Right",
  "plumbing":    "Quality Work, Done Right",
  "electrician": "Quality Work, Done Right",
  "roofing":     "Roofs Built to Last",
  "landscaping": "Beautiful Yards, Happy Homes",
  "lawn":        "Beautiful Yards, Happy Homes",
  "cleaning":    "Spotless Homes, Happy Families",
  "remodel":     "Spaces You'll Love to Live In",
  "contractor":  "Built Right, Built to Last",
  "pest":        "Pest-Free, Peace of Mind",
  "painting":    "Fresh Look, Lasting Results",
  "fence":       "Curb Appeal Starts Here",
  "flooring":    "Beautiful Floors Underfoot",
  "pool":        "Dive Into a Cleaner Pool",
  "moving":      "Your Move, Made Easier",
  // Health & wellness
  "dental":      "Your Health, Our Priority",
  "health":      "Your Health, Our Priority",
  "medical":     "Your Health, Our Priority",
  "urgent":      "Care When You Need It",
  "chiro":       "Feel Better, Move Freely",
  "therapy":     "Healing Starts Here",
  "optom":       "See the World Clearly",
  "yoga":        "Find Your Balance Here",
  "spa":         "You Deserve to Feel Great",
  "wellness":    "You Deserve to Feel Great",
  "massage":     "Relax. Restore. Renew.",
  "gym":         "Stronger Every Single Day",
  "fitness":     "Stronger Every Single Day",
  // Auto
  "auto":        "Reliable Service You Can Trust",
  "mechanic":    "Reliable Service You Can Trust",
  "tow":         "Help Is on the Way",
  "tire":        "Safe Roads Start Here",
  // Professional services
  "law":         "Trusted Local Professionals",
  "attorney":    "Trusted Legal Professionals",
  "account":     "Trusted Local Professionals",
  "insur":       "Protection You Can Count On",
  "real estate": "Home Is Where We Help",
  "mortgage":    "Keys to Your Dream Home",
  "financial":   "Your Future, Our Focus",
  // Beauty
  "salon":       "Look Good, Feel Amazing",
  "barber":      "Sharp Cuts, Every Time",
  "nail":        "Beautiful Nails, Every Visit",
  "tattoo":      "Art That Lasts a Lifetime",
  "boutique":    "Style That Speaks for You",
  "jewelry":     "Crafted with Love and Care",
  // Other
  "pet":         "Tails Are Always Wagging",
  "vet":         "Compassionate Care for Pets",
  "photo":       "Moments Worth Remembering",
  "wedding":     "Your Day, Perfectly Captured",
  "florist":     "Fresh Flowers, Lasting Smiles",
  "tutor":       "Learning Made to Click",
  "child":       "Where Kids Love to Grow",
  "daycare":     "Safe, Loved, and Learning",
  "church":      "All Are Welcome Here",
  "storage":     "Safe Storage, Total Peace of Mind",
  "print":       "Print That Makes an Impression",
  "it":          "Tech Solutions, Simply Done",
  "computer":    "Tech Solutions, Simply Done",
  "gift":        "The Perfect Gift, Every Time",
  "antique":     "Treasures Waiting to Be Found",
};

function pickTagline(category: string | null, city: string): string {
  if (category) {
    const lower = category.toLowerCase();
    for (const [kw, phrase] of Object.entries(CATEGORY_TAGLINE)) {
      if (lower.includes(kw)) return phrase;
    }
  }
  return `Proudly Serving ${city}`;
}

function toServiceMenu(category: string | null, subtypes: string[]): string[] {
  if (category) {
    const lower = category.toLowerCase();
    for (const [kw, labels] of Object.entries(SERVICE_MENU)) {
      if (lower.includes(kw)) return labels;
    }
  }
  // Fallback: first 3 subtypes, each truncated to ≤ 3 words, title-cased
  const fromSubtypes = subtypes
    .slice(0, 3)
    .map((s) =>
      s
        .split(/\s+/)
        .slice(0, 3)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" "),
    )
    .filter(Boolean);
  // If subtypes produce fewer than 2 meaningful labels, use a safe generic set
  return fromSubtypes.length >= 2 ? fromSubtypes : GENERIC_SERVICE_MENU;
}

function pickTemplate(category: string | null): string {
  if (!category) return "parchment-classic";
  const lower = category.toLowerCase();
  for (const [kw, tmpl] of Object.entries(CATEGORY_TEMPLATE)) {
    if (lower.includes(kw)) return tmpl;
  }
  return "parchment-classic";
}

function toDataUrl(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function extractXaiImageUrl(body: Record<string, unknown>): string | null {
  const data = body["data"];
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0] as Record<string, unknown>;
  if (typeof first["url"] === "string") return first["url"];
  if (typeof first["b64_json"] === "string") {
    return `data:image/png;base64,${first["b64_json"]}`;
  }
  return null;
}

async function safeJson(resp: Response): Promise<Record<string, unknown>> {
  try {
    return (await resp.json()) as Record<string, unknown>;
  } catch {
    const text = await resp.text().catch(() => "");
    return { _raw: text };
  }
}

export interface OutreachAdParams {
  bizName: string;
  category: string | null;
  phone: string | null;
  address: string | null;
  city: string;
  state: string;
  website: string | null;
  services?: string[];
  logoUrl?: string | null;
  /**
   * When true, uses grok-imagine-image-quality (same as the customer ad flow)
   * for noticeably better layout fidelity. Costs more per image.
   * Defaults to false — use the standard model for bulk outreach sweeps.
   */
  quality?: boolean;
}

export interface GeneratedAd {
  imageUrl: string;
  template: string;
}

/**
 * Generate a sample postcard ad for a business, for use in cold-email outreach.
 *
 * Uses the same buildAdPrompt() used by the normal customer ad-generator so the
 * structured layout rules (phone exactly once, QR slot in footer, etc.) are
 * identical. After Grok returns the image, swapQrCode() detects the magenta
 * placeholder and composites a real QR code pointing to the business's website.
 *
 * Returns a data URL (base64 JPEG) for storage.
 */
export async function generateAdForOutreach(
  params: OutreachAdParams,
): Promise<GeneratedAd> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY not configured");

  const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  const templateKey = pickTemplate(params.category);
  const templateFile = TEMPLATE_PORTRAIT[templateKey] ?? TEMPLATE_PORTRAIT["parchment-classic"]!;
  const tmplPath = path.join(WORKSPACE_ROOT, "attached_assets", templateFile);

  let imageRefs: Array<{ type: "image_url"; url: string }> = [];
  if (fs.existsSync(tmplPath)) {
    const buf  = fs.readFileSync(tmplPath);
    const mime = /\.jpe?g$/i.test(templateFile) ? "image/jpeg" : "image/png";
    imageRefs  = [{ type: "image_url", url: toDataUrl(buf, mime) }];
  }

  // Include the business logo as a second image reference when available
  let logoIncluded = false;
  if (params.logoUrl) {
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12_000);
      const logoResp = await fetch(params.logoUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: ctrl.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      if (logoResp.ok) {
        const logoBuf  = Buffer.from(await logoResp.arrayBuffer());
        const logoMime = (logoResp.headers.get("content-type") ?? "image/png").split(";")[0]!.trim();
        imageRefs.push({ type: "image_url", url: toDataUrl(logoBuf, logoMime) });
        logoIncluded = true;
      }
    } catch {
      // logo download failed — proceed without it
    }
  }

  // Build the structured prompt using the same function as the customer ad-generator.
  // toServiceMenu() maps the raw Outscraper subtypes (long category descriptors like
  // "air conditioning contractor") to short punchy service-box labels ("AC Repair",
  // "Duct Cleaning", …) that fit the template's icon boxes.
  const menu = toServiceMenu(params.category, params.services ?? []);

  const industry = params.category ?? "Local Business";
  const tagline = pickTagline(params.category, params.city);

  const promptInput: AdPromptInput = {
    bizName:   params.bizName,
    tagline,
    phone:     params.phone ?? "",
    city:      params.city,
    address:   params.address ?? "",
    website:   params.website ?? "",
    industry,
    menu,
    // Non-empty offer prevents the template's coupon/ticket-stub zone from
    // being left instruction-free (which caused Grok to duplicate menu items
    // into the coupon zone). "Call for Special Offers" is always true and
    // never fabricates a discount the business never made.
    offer:     "Call for Special Offers",
    offerFine: "Ask about current promotions and seasonal deals",
    template:  templateKey,
    // Outreach images are generated at 3:4 aspect ratio → 900×1200 px ("l" slot)
    sizeKey:   "l",
    photoUrl:  "",
    logoData:  logoIncluded ? (params.logoUrl ?? "") : "",
    generationIndex: 0,
  };
  const prompt = buildAdPrompt(promptInput, false, templateKey);

  // quality=true → grok-imagine-image-quality (same tier as the customer ad flow,
  // better layout fidelity, higher cost). Default false for bulk outreach sweeps.
  const model = params.quality
    ? "grok-imagine-image-quality"
    : "grok-imagine-image";

  const reqBody: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    aspect_ratio: "3:4",
  };
  if (imageRefs.length > 0) {
    reqBody["images"] = imageRefs;
  }

  const endpoint = imageRefs.length > 0
    ? "https://api.x.ai/v1/images/edits"
    : "https://api.x.ai/v1/images/generations";

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reqBody),
  });

  const respBody = await safeJson(resp);
  if (!resp.ok) {
    const errMsg =
      (respBody["error"] as Record<string, unknown> | undefined)?.["message"] ??
      respBody["error"] ??
      respBody["_raw"] ??
      `xAI error ${resp.status}`;
    throw new Error(`Ad generation failed: ${String(errMsg).slice(0, 300)}`);
  }

  const imageUrl = extractXaiImageUrl(respBody);
  if (!imageUrl) {
    throw new Error("xAI returned no image URL");
  }

  // Download image → buffer so we can run the QR swap step
  let imgBuf: Buffer;
  if (imageUrl.startsWith("data:")) {
    imgBuf = Buffer.from(imageUrl.split(",")[1] ?? "", "base64");
  } else {
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) throw new Error(`Failed to fetch generated image: ${imgResp.status}`);
    imgBuf = Buffer.from(await imgResp.arrayBuffer());
  }

  // Resize to exact 900×1200 px (the "l" slot dimensions — 3"×4" at 300 DPI)
  let sharp: typeof import("sharp");
  try {
    sharp = (await import("sharp")).default as unknown as typeof import("sharp");
    imgBuf = await (sharp as unknown as (buf: Buffer) => import("sharp").Sharp)(imgBuf)
      .resize(900, 1200, { fit: "cover", position: "centre" })
      .jpeg({ quality: 98, chromaSubsampling: "4:4:4" })
      .toBuffer();
  } catch {
    // sharp unavailable — continue with raw buffer; swapQrCode will handle it
  }

  // Composite a real scannable QR code over the magenta placeholder.
  // Target: business website (or fallback homepage). This is a sample ad shown
  // in the cold email — there is no tracking code yet (spot not purchased).
  // Size key "l" matches the 900×1200 buffer — QR_PLACEMENT.l = { imgW:900, imgH:1200 }.
  // Using "xl" here was the original bug: it expected a 1200×1500 image, causing
  // sharp.extract() to extend past the image boundary and throw silently.
  const qrTarget = normalizeWebsite(params.website) ?? "https://mytownpostcard.com";
  const qrStyle  = getTemplateQrStyle(templateKey);
  try {
    imgBuf = await swapQrCode(imgBuf, qrTarget, "l", qrStyle);
  } catch (err) {
    // Log so adError captures it; ad still saves without QR rather than failing the cascade
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[outreach] swapQrCode failed (${templateKey}): ${msg}\n`);
  }

  // Composite the ad with the "Your Ad on Our Next Shared Postcard" right panel
  // to create the two-panel email image. Falls back gracefully to the standalone
  // ad if the panel asset is missing or sharp fails.
  try {
    imgBuf = await compositeEmailPanel(imgBuf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[outreach] compositeEmailPanel failed: ${msg}\n`);
  }

  return {
    imageUrl: `data:image/jpeg;base64,${imgBuf.toString("base64")}`,
    template: templateKey,
  };
}

/**
 * Composites the generated ad buffer with the fixed "Your Ad on Our Next
 * Shared Postcard" right-panel asset, producing a two-panel email image.
 *
 * The right-panel assets (outreach_right_panel_portrait.png /
 * outreach_right_panel_landscape.png) were extracted from the reference
 * template with the left slot (AJ House) removed — no AJ House content
 * exists anywhere in those files.
 *
 * Portrait ad (w ≤ h): uses the portrait panel (942×1200).
 * Landscape ad (w > h): uses the landscape panel (942×900).
 */
async function compositeEmailPanel(adBuf: Buffer): Promise<Buffer> {
  const sharpMod = (await import("sharp")).default as unknown as (buf: Buffer) => import("sharp").Sharp;
  const sharpFile = (await import("sharp")).default as unknown as (p: string) => import("sharp").Sharp;

  // Detect ad orientation from buffer metadata
  const adMeta = await (sharpMod(adBuf) as unknown as import("sharp").Sharp).metadata();
  const adW = adMeta.width ?? 900;
  const adH = adMeta.height ?? 1200;
  const isPortrait = adH >= adW;

  const panelFile = isPortrait
    ? "outreach_right_panel_portrait.png"
    : "outreach_right_panel_landscape.png";
  const panelPath = path.join(WORKSPACE_ROOT, "attached_assets", panelFile);

  if (!fs.existsSync(panelPath)) {
    throw new Error(`Right-panel asset not found: ${panelFile}`);
  }

  // Scale the right panel to exactly match the ad height
  const panelMeta = await (sharpFile(panelPath) as unknown as import("sharp").Sharp).metadata();
  const panelNativeH = panelMeta.height ?? adH;
  const panelNativeW = panelMeta.width ?? 942;
  const scaledPanelW = Math.round(panelNativeW * adH / panelNativeH);
  const scaledPanelBuf = await (sharpFile(panelPath) as unknown as import("sharp").Sharp)
    .resize(scaledPanelW, adH, { fit: "fill" })
    .png()
    .toBuffer();

  // Build composite canvas: ad on left, right panel on right
  const totalW = adW + scaledPanelW;
  const composite = await (sharpMod as unknown as (opts: { create: { width: number; height: number; channels: 4; background: { r: number; g: number; b: number; alpha: number } } }) => import("sharp").Sharp)({
    create: { width: totalW, height: adH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([
      { input: adBuf,         left: 0,   top: 0 },
      { input: scaledPanelBuf, left: adW, top: 0 },
    ])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();

  return composite;
}

function normalizeWebsite(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
