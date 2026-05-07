// Deterministic test fixtures for ad visual regression.
// Imported from both the React /test/ad page (browser) and the Playwright spec (node).
// Keep these stable — changing values here will invalidate all baselines.

// Tiny 1x1 transparent PNG (used as placeholder for "no image" cases)
const BLANK_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

// Solid-color square PNGs of various sizes — deterministic stand-ins for real photos/logos
// so screenshot baselines aren't affected by Unsplash CDN serving different bytes.
const RED_SQUARE = "data:image/svg+xml;base64," + btoaIso("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><rect width='200' height='200' fill='%23c0392b'/></svg>".replace(/%23/g, "#"));
const BLUE_SQUARE = "data:image/svg+xml;base64," + btoaIso("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><rect width='200' height='200' fill='#2c5282'/></svg>");
const TEAL_PHOTO = "data:image/svg+xml;base64," + btoaIso("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600'><rect width='800' height='600' fill='#0d9488'/><circle cx='400' cy='300' r='180' fill='#5eead4' opacity='0.5'/></svg>");
const ORANGE_PHOTO = "data:image/svg+xml;base64," + btoaIso("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600'><rect width='800' height='600' fill='#ea580c'/><rect x='100' y='100' width='600' height='400' fill='#fed7aa' opacity='0.4'/></svg>");
const HUGE_LOGO = "data:image/svg+xml;base64," + btoaIso("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 1000'><rect width='1000' height='1000' fill='#7f1d1d'/><text x='500' y='540' font-size='400' text-anchor='middle' fill='#fff' font-family='Arial' font-weight='900'>LOGO</text></svg>");

function btoaIso(s) {
  // Works in both browser (window.btoa) and node (Buffer)
  if (typeof window !== "undefined" && window.btoa) return window.btoa(s);
  return Buffer.from(s, "binary").toString("base64");
}

export const FIXTURES = {
  // 1. Baseline: short, normal data, all fields present
  baseline: {
    businessName: "Joe's Pizza",
    email: "joe@joespizza.com",
    industry: "Pizza Restaurant",
    tagline: "Hand-Tossed. Oven Fresh.",
    offer: "$5 OFF",
    offerFine: "Expires 6/30",
    address: "123 Main St, Clarkesville GA",
    phone: "(706) 555-0123",
    website: "joespizza.com",
    logo: RED_SQUARE,
    photo: ORANGE_PHOTO,
    menuItems: ["Large Pizza $14.99", "Family Special", "Free Delivery"],
  },

  // 2. Long headline / tagline — overflow stress
  longHeadline: {
    businessName: "Joe's Pizza",
    email: "joe@joespizza.com",
    industry: "Pizza Restaurant",
    tagline: "The Most Authentic Wood-Fired Neapolitan Pizza In Habersham County Since 1985",
    offer: "$5 OFF",
    offerFine: "Expires 6/30",
    address: "123 Main St, Clarkesville GA",
    phone: "(706) 555-0123",
    website: "joespizza.com",
    logo: RED_SQUARE,
    photo: ORANGE_PHOTO,
    menuItems: ["Large Pizza $14.99", "Family Special", "Free Delivery"],
  },

  // 3. Long business name
  longBusinessName: {
    businessName: "Habersham County Premier Authentic Wood-Fired Pizzeria & Italian Kitchen",
    email: "info@premierpizza.com",
    industry: "Italian Restaurant",
    tagline: "Family Recipes Since 1985",
    offer: "$10 OFF",
    offerFine: "Dine in only",
    address: "456 Washington St",
    phone: "(706) 555-9999",
    website: "premierpizza.com",
    logo: RED_SQUARE,
    photo: ORANGE_PHOTO,
    menuItems: ["Pizza", "Pasta", "Salads", "Wine"],
  },

  // 4. Missing logo
  missingLogo: {
    businessName: "Bright Smile Dental",
    email: "hello@brightsmile.com",
    industry: "Dentist",
    tagline: "New Patients Welcome",
    offer: "FREE Cleaning",
    offerFine: "New patients only",
    address: "789 Health Way",
    phone: "(706) 555-7654",
    website: "brightsmile.com",
    logo: null,
    photo: TEAL_PHOTO,
    menuItems: ["Cleanings", "Whitening", "Implants"],
  },

  // 5. Oversized logo (1000x1000) — should still constrain
  largeLogo: {
    businessName: "Mountain Realty",
    email: "team@mountainrealty.com",
    industry: "Real Estate",
    tagline: "Local Experts",
    offer: "Free Home Valuation",
    offerFine: "Call today",
    address: "100 Town Square",
    phone: "(706) 555-2200",
    website: "mountainrealty.com",
    logo: HUGE_LOGO,
    photo: BLUE_SQUARE,
    menuItems: ["Buying", "Selling", "Rentals"],
  },

  // 6. Missing photo (template should fall back gracefully)
  missingPhoto: {
    businessName: "ProTune Auto",
    email: "shop@protune.com",
    industry: "Auto Repair",
    tagline: "Honest Repairs, Fair Prices",
    offer: "$25 OFF Service",
    offerFine: "Over $100",
    address: "200 Industrial Blvd",
    phone: "(706) 555-7760",
    website: "protuneauto.com",
    logo: BLUE_SQUARE,
    photo: null,
    menuItems: ["Brakes", "Oil Change", "Tires", "Diagnostics"],
  },

  // 7. No website (no QR code should render)
  noWebsite: {
    businessName: "Happy Tails Vet",
    email: "care@happytails.com",
    industry: "Veterinarian",
    tagline: "Compassionate Care",
    offer: "FREE Wellness Exam",
    offerFine: "First visit",
    address: "400 Pet Lane",
    phone: "(706) 555-3647",
    website: "",
    logo: TEAL_PHOTO,
    photo: TEAL_PHOTO,
    menuItems: ["Dogs", "Cats", "Surgery"],
  },

  // 8. With website (QR present)
  withWebsite: {
    businessName: "GreenScape Lawn",
    email: "info@greenscape.com",
    industry: "Lawn & Landscaping",
    tagline: "A Lawn You'll Be Proud Of",
    offer: "10% OFF First Service",
    offerFine: "New customers",
    address: "555 Garden Way",
    phone: "(706) 555-2116",
    website: "greenscape-lawn.com",
    logo: TEAL_PHOTO,
    photo: TEAL_PHOTO,
    menuItems: ["Mowing", "Fertilization", "Weed Control", "Seasonal Cleanup"],
  },

  // 9. Truncated / very short phone
  shortPhone: {
    businessName: "Quick Cuts",
    email: "book@quickcuts.com",
    industry: "Salon & Beauty",
    tagline: "Walk-Ins Welcome",
    offer: "$5 OFF Cut",
    offerFine: "First visit",
    address: "12 Main",
    phone: "555-0100",
    website: "quickcuts.com",
    logo: RED_SQUARE,
    photo: ORANGE_PHOTO,
    menuItems: ["Cuts", "Color", "Styling"],
  },

  // 10. Missing tagline (templates should not collapse)
  missingTagline: {
    businessName: "Comfort HVAC",
    email: "hello@comforthvac.com",
    industry: "HVAC",
    tagline: "",
    offer: "$50 OFF Tune-Up",
    offerFine: "Restrictions apply",
    address: "300 Service Rd",
    phone: "(706) 555-4822",
    website: "comforthvac.com",
    logo: BLUE_SQUARE,
    photo: BLUE_SQUARE,
    menuItems: ["Heating", "Cooling", "Installation", "Repair", "24/7 Service"],
  },

  // 11. Long offer / CTA text
  longOffer: {
    businessName: "Mario's Pizza",
    email: "mario@mariospizza.com",
    industry: "Pizza Restaurant",
    tagline: "Authentic Italian",
    offer: "BUY ONE LARGE PIZZA, GET A SECOND OF EQUAL OR LESSER VALUE 50% OFF",
    offerFine: "Cannot combine with other offers. Expires end of month. Dine-in or carryout only.",
    address: "789 Italy St",
    phone: "(706) 555-8855",
    website: "mariospizza.com",
    logo: RED_SQUARE,
    photo: ORANGE_PHOTO,
    menuItems: ["Pizza", "Calzones", "Salads"],
  },

  // 12. Long address
  longAddress: {
    businessName: "Johnson Law Group",
    email: "intake@johnsonlaw.com",
    industry: "Other Service",
    tagline: "Personal Injury Law You Can Count On",
    offer: "Free Consultation",
    offerFine: "No obligation",
    address: "1234 Northwest Professional Plaza Drive Suite 200B, Clarkesville Georgia 30523",
    phone: "(706) 555-5291",
    website: "johnsonlawgroup.com",
    logo: BLUE_SQUARE,
    photo: BLUE_SQUARE,
    menuItems: ["Personal Injury", "Auto Accidents", "Slip & Fall"],
  },
};

export const FIXTURE_IDS = Object.keys(FIXTURES);

export const TEMPLATE_IDS = ["photo-bold", "split-clean", "magazine", "stamp", "fade-out"];

export const SIZE_IDS = ["XL", "L", "M", "S"];

// Natural pixel render dimensions per size (matches AdGenerator's preview math).
export const NATURAL_DIMS = {
  XL: { w: 400, h: 500 },
  L:  { w: 300, h: 400 },
  M:  { w: 300, h: 200 },
  S:  { w: 200, h: 200 },
};
