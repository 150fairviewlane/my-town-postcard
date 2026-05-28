/**
 * Pure prompt-building logic for the Grok ad generator.
 * No Express, no database, no file-system access — only string assembly.
 * Import from both the route handler and the prompt-size check script.
 */

// ── Variant lookup tables ────────────────────────────────────────────────────

export const FONT_VARIANTS: Record<string, string[]> = {
  "parchment-classic": [
    "Typography variant A — Headline: bold condensed slab serif (Rockwell Extra Bold / Clarendon style). Script accent: warm orange flowing script (Pacifico / Lobster style) applied only to a single English category noun in the business name. Together they create a layered editorial premium headline.",
    "Typography variant B — Headline: strong display serif (Playfair Display Black / Bodoni 72 Bold style), all-caps, maximum weight, rich contrast. Script accent: refined italic serif at a slight angle for a single category noun — no rounded script/cursive. Elegant editorial weight contrast.",
    "Typography variant C — Headline: geometric sans-serif (Futura ExtraBold / Raleway ExtraBold style), all-caps, ultra-clean. No script accent — the entire business name in solid bold geometric caps. Modern minimalist label aesthetic, zero ornamentation.",
  ],
  "made-fresh": [
    "Typography variant A — Headline: bold condensed slab serif (Rockwell / Clarendon Bold style). Script accent: warm chalk-style handwriting script (Pacifico style) for a single English category noun. Warm bistro editorial feel.",
    "Typography variant B — Headline: rounded display sans-serif (Nunito ExtraBold / Poppins Black style). Script accent: bouncy marker-style script (Satisfy style) for a single category noun. Casual approachable cafe energy.",
    "Typography variant C — Headline: vintage wood-type display (Alfa Slab One / Zilla Slab Highlight style). No script accent — full blocky vintage poster lettering, all caps. Old-fashioned diner charm.",
  ],
  "neighborhood-pro": [
    "Typography variant A — Headline: bold condensed slab serif (Impact / Anton style), all-caps, dominant. Script accent: bright lime-green flowing script for a single English service-category noun in the business name. Outdoorsy contractor authority.",
    "Typography variant B — Headline: extra-bold industrial sans (Barlow Condensed ExtraBold / Oswald Bold style), all-caps. Script accent: dark forest-green casual script for a single service noun. Modern trades feel.",
    "Typography variant C — Headline: heavy display grotesque (Teko Bold / Black Han Sans style), all-caps full-width. No script accent — monochromatic display type only. Clean bold utility aesthetic.",
  ],
  "at-your-service": [
    "Typography variant A — Headline: bold condensed slab serif (Rockwell Extra Bold / Josefin Slab Bold style), all-caps. Script accent: gold/yellow flowing script for a single English service-category noun. Premium home-services look.",
    "Typography variant B — Headline: strong military-style condensed (Bebas Neue / Oswald ExtraBold style), all-caps. Script accent: copper-toned elegant italic for a single category noun. Established trades authority.",
    "Typography variant C — Headline: geometric block sans (Exo 2 ExtraBold / Furore style), all-caps. No script accent — monochromatic all-caps geometric headline only. Technical precision aesthetic.",
  ],
  "health-wellness": [
    "Typography variant A — Headline: bold condensed sans-serif (Montserrat ExtraBold / Source Sans Pro Black style), all-caps. No script accent — clean clinical authority. Professional medical trust.",
    "Typography variant B — Headline: refined humanist sans-serif (Lato Bold / Raleway SemiBold style), mixed-case or small-caps. Script accent: soft sage-green cursive for a single wellness noun only. Calm, nurturing feel.",
    "Typography variant C — Headline: elegant display serif (Cormorant Garamond Bold / Libre Baskerville Bold style), all-caps. No script accent — sophisticated serif confidence. Upscale boutique wellness look.",
  ],
  "surprise-me": [
    "Typography variant A — Bold editorial display: strong condensed serif headline (Playfair Display Black / Rockwell Extra Bold style), all-caps, dominant weight. No script accent — render the business name only, never add decorative category words not present in the name. Premium layered editorial headline.",
    "Typography variant B — Modern geometric: ultra-clean bold sans-serif headline (Futura ExtraBold / Bebas Neue style), all-caps, zero ornamentation. No script accent. Confident, minimal, high-contrast.",
    "Typography variant C — Vintage artisan: expressive wood-type display or slab (Alfa Slab One / Zilla Slab Highlight style), all-caps, textured feel. No script accent. Handcrafted, collectible, character-driven.",
  ],
};

export const COUPON_VARIANTS: string[] = [
  "Coupon box style: CLASSIC PERFORATION STRIP — dashed rectangular border with a scissor ✂ icon on the left edge and a small 'CUT HERE' label. Clean, universally recognized coupon strip format.",
  "Coupon box style: MOVIE-TICKET STUB — vertical dotted tear-line running along the left edge of the coupon box, subtle diagonal micro-stripe background pattern inside the box — NEVER write 'Admit One Offer', 'Admit Offer', any serial numbers, or any promotional phrase not supplied by the business. Festive, collectible feel.",
  "Coupon box style: RUBBER-STAMP SEAL — a circular ink-ring border centered around the offer text with a slight distressed texture, 'SPECIAL OFFER' arced along the top of the ring border in small caps. Authentic artisan-stamp aesthetic.",
];

export const COLOR_VARIANTS: Record<string, string[]> = {
  "parchment-classic": [
    "Color palette A — Primary: deep burgundy. Background: warm ivory. Accent/script: warm orange-gold. Footer: near-black. Rich, warm, appetite-driving.",
    "Color palette B — Primary: rich chocolate brown. Background: parchment beige. Accent/script: copper-amber. Footer: dark espresso. Warm artisan depth.",
    "Color palette C — Primary: forest-ink dark green. Background: cream. Accent/script: warm amber. Footer: near-black with green tint. Natural, premium, farm-to-table.",
  ],
  "made-fresh": [
    "Color palette A — Primary: warm charcoal. Chalkboard: near-black. Accent: golden yellow. Highlight: fresh white. Classic bistro chalk-art palette.",
    "Color palette B — Primary: tomato red. Background: rustic cream. Accent: basil green. Warm highlight: honey tan. Italian trattoria energy.",
    "Color palette C — Primary: navy blue. Background: warm white. Accent: bright coral. Footer: deep navy. Modern casual-dining freshness.",
  ],
  "neighborhood-pro": [
    "Color palette A — Background: forest green. Panels and text: clean white. Accent/script: lime green. Footer: dark forest. Energetic outdoor contractor look.",
    "Color palette B — Background: deep navy. Panels and text: white. Accent/script: electric blue. Footer: near-black navy. Trustworthy professional trades.",
    "Color palette C — Background: charcoal. Panels and text: white. Accent/script: bold orange. Footer: near-black. High-visibility construction aesthetic.",
  ],
  "at-your-service": [
    "Color palette A — Primary: dark navy. Background: light gray. Accent: gold/yellow. Footer: near-black navy. Premium home-services authority.",
    "Color palette B — Primary: deep slate. Background: off-white. Accent: copper. Footer: darkest slate. Established artisan trades feel.",
    "Color palette C — Primary: charcoal. Background: white. Accent: steel blue. Footer: near-black. Clean technical precision.",
  ],
  "health-wellness": [
    "Color palette A — Primary: teal. Background: cream/off-white. Accent: sage green. Footer: dark teal. Calm, trustworthy clinical warmth.",
    "Color palette B — Primary: deep teal. Background: warm white. Accent: soft coral. Footer: darkest teal. Nurturing boutique wellness feel.",
    "Color palette C — Primary: forest teal. Background: light mint. Accent: warm gold. Footer: deep forest teal. Upscale spa and wellness luxury.",
  ],
  "surprise-me": [
    "Color palette A — Warm and rich: dominant deep burgundy/crimson paired with warm ivory and antique gold accents. Footer: near-black. Appetite-driving, premium editorial warmth.",
    "Color palette B — Cool and bold: dominant deep navy/charcoal paired with crisp white and electric blue or vivid coral as the hero accent. Footer: near-black navy. High-contrast, authoritative, modern.",
    "Color palette C — Natural and fresh: dominant deep forest green paired with warm cream and warm amber accents. Footer: near-black with green undertone. Earthy, premium, inviting.",
  ],
};

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
    palette:
      "Near-black or deep charcoal dominant background; electric gold or platinum white as the primary accent; rich ivory or cream for secondary body text; footer zone in near-black.",
    typography:
      "Elegant condensed serif headline — tall, refined, editorial weight with generous letter-spacing; fine italic or ultra-light sans-serif tagline; thin rule separators between info zones.",
    layoutLandscape:
      "Full-bleed atmospheric hero photo filling the right two-thirds of the card; headline and tagline locked onto a narrow opaque near-black vertical panel on the left third; services listed in fine italic below; coupon in a refined gold-bordered rectangular box lower-right.",
    layoutPortrait:
      "Hero photo filling the upper 55% of the card with a cinematic vignette at the bottom edge; a full-width near-black opaque band below holding the headline in condensed gold serif; services in a slim column with thin gold rule dividers; coupon in a gold-bordered box at the very bottom.",
    mood: "premium, sophisticated, high-end, exclusive",
  },
  {
    name: "Coastal Bright",
    palette:
      "Warm white or light cream dominant background; ocean blue as the primary accent; sandy coral or warm peach as the secondary accent; footer in deep ocean blue or near-black navy.",
    typography:
      "Bold rounded sans-serif headline — friendly, approachable, confident; light-weight sans body text; wave or arc motifs in graphic dividers.",
    layoutLandscape:
      "Horizontal photo strip or rounded-rectangle photo panel spanning the top third of the card; headline large in the left zone on the white background; services in a clean pill-badge row or two-column list in the center; coupon in a coral-bordered rounded rectangle lower-right.",
    layoutPortrait:
      "Rounded-rectangle hero photo centered in the upper third; headline large below on the white/cream background; clean two-column service list with circular ocean-blue icon badges; coupon in a coral accent rounded box near the bottom.",
    mood: "fresh, friendly, clean, approachable",
  },
  {
    name: "Industrial Edge",
    palette:
      "Concrete, slate gray, or weathered charcoal texture as the dominant background; vivid orange or electric yellow as the primary accent; crisp white for all text; footer in near-black or dark concrete.",
    typography:
      "Wide ultra-bold condensed all-caps stencil or block typeface for the headline — very large, zero-ambiguity, stacked; bold sans-serif for service items; sharp angular graphic elements throughout.",
    layoutLandscape:
      "Background filled with a concrete or slate texture; a bold diagonal cut divides the hero photo zone (right half) from the text info zone (left half); headline in oversized all-caps stacked vertically on the left; vivid orange or yellow accent bar or stripe cuts diagonally across the center; coupon in a bold heavy-bordered rectangular badge lower-right.",
    layoutPortrait:
      "Full-width concrete or slate texture background; large hero photo with a bold diagonal slash edge blending into the texture; oversized stacked all-caps headline left-aligned below; horizontal vivid-accent band separating the services from the coupon; coupon in a heavy-bordered rectangular box at the bottom.",
    mood: "bold, rugged, authoritative, high-contrast",
  },
  {
    name: "Botanical Garden",
    palette:
      "Sage green or dusty rose as the dominant background tone; deep forest green as the primary accent; warm blush or antique cream as the secondary; footer in deep forest green.",
    typography:
      "Refined upright serif headline — elegant, editorial, generously sized; flowing italic or delicate script tagline; soft organic shapes and fine rules around text zones.",
    layoutLandscape:
      "Organic blob or torn-paper shapes in sage green framing the hero photo on the right two-thirds; headline in large refined serif on a cream or white panel upper-left; services in a soft rounded list with small botanical leaf icon accents; coupon in a delicate dashed or hand-drawn-style border box lower-left.",
    layoutPortrait:
      "Organic tinted blob shape framing the hero photo in the upper third; headline on a wide cream panel below in a large refined serif; service list with small botanical icon accents beside each item; coupon in a soft rounded or hand-drawn border box near the bottom.",
    mood: "natural, artisanal, boutique, warm",
  },
  {
    name: "Urban Pop",
    palette:
      "Vivid primary color field as the full-bleed background — bold red, cobalt blue, or deep violet; contrasting bright secondary — lime green, warm yellow, or electric white for accent elements; footer in the same primary color, darkened by 20%.",
    typography:
      "Oversized stacked display type for the headline — extremely large, extremely bold, flat graphic weight with tight leading; playful scale contrast between the headline and supporting body text; flat bold geometric icons for service items.",
    layoutLandscape:
      "Bold flat color block fills the left 40% of the card holding the headline in oversized stacked type; hero photo occupies the right 60% with a hard-edge or slight diagonal cut against the color field; services listed in a vivid accent-colored band across the lower center; coupon in a contrasting bright flat-color box lower-left.",
    layoutPortrait:
      "Full-bleed vivid background color; hero photo in the upper half with a bold color-band overlay at the bottom edge blending it into the layout; oversized stacked headline in the center band; service items as flat circular badge icons; coupon in a bright contrasting flat-color rectangular box at the bottom.",
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

export function buildFooterZone(
  phone: string,
  address: string,
  phoneIconStyle: "circular-badge" | "inline-icon" | "minimal",
): string {
  const hasAddr = address !== "(none)";
  const addrRule = !hasAddr
    ? ""
    : address.length <= 28
      ? `"${address}" on a SINGLE line, same font size as the phone number.`
      : `"${address}" — street on line 1, city/state on line 2 (split at the natural comma; ` +
        `line 1 must NOT end with a comma). City/state MUST appear immediately below the street ` +
        `on the very next line — NEVER in a separate column or distant area. ` +
        `Same font size as phone number (never shrink text).`;
  const iconPrefix =
    phoneIconStyle === "circular-badge" ? "a circular phone-icon badge + " :
    phoneIconStyle === "inline-icon"    ? "a small phone icon + "           : "";

  return (
    "FOOTER REGION (bottom 15–20% of card): a SOLID DARK BACKGROUND BAR spanning the full card width — opaque, high contrast, no transparency or bleed into imagery above.\n" +
    "  PHONE NUMBER RULE — CRITICAL: the phone number must appear EXACTLY ONCE in the entire ad — ONLY inside this footer bar. NEVER place the phone number in any service panel, coupon zone, headline area, right column, or anywhere else outside the footer.\n" +
    `  LEFT — ${iconPrefix}phone "${phone}" in bold white, large and dominant. Zero digit changes.\n` +
    (hasAddr ? `  ADDRESS — directly below the phone number, left-aligned in the same left column (NEVER drift to a center or right column, NEVER appear in a separate area): ${addrRule}\n` : "") +
    "  RIGHT — small QR code graphic (max 0.5\"×0.5\" at print size). No coupon box, dashed frame, or decorative border.\n" +
    "  QR CODE RULE — CRITICAL: the QR code must appear EXACTLY ONCE in the entire ad — ONLY here in the footer bottom-right corner. NEVER place a QR code anywhere outside this footer — not in any coupon zone, service panel, headline area, or elsewhere.\n" +
    "  QR QUIET ZONE: 4-unit clear white border on all sides, no overlaps.\n" +
    "  TYPOGRAPHY: phone minimum 18pt bold white — the largest text in the footer bar; address minimum 14pt bold white. NEVER render the address text smaller than 12pt — if space is tight, shrink the coupon or reduce service panel height before reducing the address font size. No website URL text.\n\n"
  );
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
}

// ── Main builder ─────────────────────────────────────────────────────────────

/**
 * Build the Grok image-generation prompt for a single ad.
 * Pure function — no I/O. Returns the raw prompt string (before runtime trimming).
 *
 * @param d           Parsed request data matching AdPromptInput
 * @param isLandscape True for medium/landscape spots (3"×2")
 * @param adIndex     Number of same-template spots already reserved/paid in the
 *                    campaign — used for variant rotation (0 is fine for tests)
 */
export function buildAdPrompt(
  d: AdPromptInput,
  isLandscape: boolean,
  adIndex: number,
): string {
  const templateKey = d.template || "parchment-classic";

  // Variant rotation
  const fontVariant   = adIndex % 3;
  const couponVariant = (adIndex + 1) % 3;
  const colorVariant  = (adIndex + 2) % 3;
  const tmplFonts  = FONT_VARIANTS[templateKey]  ?? FONT_VARIANTS["parchment-classic"]!;
  const tmplColors = COLOR_VARIANTS[templateKey] ?? COLOR_VARIANTS["parchment-classic"]!;

  const variantBlock =
    "VARIANT DIRECTIVES — follow these exactly, they override any defaults:\n" +
    `  TYPOGRAPHY: ${tmplFonts[fontVariant]}\n` +
    `  COUPON: ${COUPON_VARIANTS[couponVariant]}\n` +
    `  COLORS: ${tmplColors[colorVariant]}\n`;

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
  const menuStr     = d.menu.filter(Boolean).map((m, i) => `  ${i + 1}. ${m}`).join("\n") || "  (none)";
  const menuCount   = d.menu.filter(Boolean).length;
  const fullAddress = [d.address, d.city].filter(Boolean).join(", ") || "(none)";
  const hasPhoto    = !!d.photoUrl;
  const hasLogo     = !!d.logoData;

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
          ? "the full landscape postcard layout with warm parchment texture, orange bookmark-ribbon pennant at top-left, a sweeping horizontal dark brush-stroke band for the headline, orange circular checkmark service badges on the left column, a dashed dark rectangular coupon box, and a dark footer strip with phone icon + QR code. Reproduce every zone, texture, and design element exactly."
          : templateKey === "made-fresh"
            ? "the full landscape postcard layout with a warm wood-table background. A white ceramic plate and gingham cloth prop sit on the left; a chalkboard 'Made Fresh For You' A-frame sign sits upper-right. A white paint-stroke panel provides the business info zone; a golden ticket-stub coupon shape sits on the right. Reproduce all textures, props, zones, and atmospheric lighting exactly."
            : templateKey === "neighborhood-pro"
              ? "the full landscape postcard layout on a deep forest-green background. Upper-left: large white brush-stroke splash panel (headline zone). Upper-right: full-bleed hero photo area. Middle: horizontal row of four diagonal-cut service photo panels each topped by a circular lime-green icon badge and a white brush-stroke label below. Lower-center: wide white brush-stroke area (offer/coupon zone). Footer: dark green bar with phone icon left, location pin center-left, and QR code lower-right. Reproduce every zone and shape exactly."
              : templateKey === "at-your-service"
                ? "the full landscape postcard layout on a light gray/cream textured background. Upper-left: large dark navy hexagonal badge (logo zone). Gold/yellow horizontal brush-stroke sweeping across the upper area. Upper-right: large hero photo zone blending naturally into the background. Center: wide dark navy band spanning full width with four circular white icon service badges. Lower-right: gold/yellow dashed-border coupon box. Footer: location-pin icon + address left; phone icon + phone center; QR code right. Reproduce every zone, shape, and color exactly."
                : "the full landscape postcard layout on a soft cream/off-white background. Upper-left: clinic/office photo inside an organic curved teal blob shape. Upper-center: large wide rounded-rectangle white headline panel; below it a teal pill-shaped tagline bar. Middle: four equal-width service panels with circular teal icon badges on top and white rounded-rectangle text boxes below. Lower-left: reception photo in an organic teal blob. Lower-right: stethoscope on a dark teal circular blob, plus a small white rounded QR box. Right edge: anatomical spine model prop. Footer: dark teal bar — circular phone icon badge + phone left; circular location pin icon badge + address right. Reproduce every zone, blob shape, and layout exactly.";
      refLines.push(`  • IMAGE ${imgIdx++} (LANDSCAPE TEMPLATE) — ${lsTmplDesc}`);
    }
    if (hasPhoto) {
      refLines.push(`  • IMAGE ${imgIdx++} (HERO PHOTO) — the product/service photograph. Seamlessly composite it into the hero photo zone with professional lighting and natural edge blending — no hard rectangular border.`);
    }
    logoImg = imgIdx;
    if (hasLogo) {
      refLines.push(`  • IMAGE ${imgIdx} (BUSINESS LOGO) — the exact business logo. Reproduce it pixel-perfect with no stylization, color changes, or distortion.`);
    }
  } else if (templateKey === "surprise-me") {
    imgIdx = 1;
    if (hasPhoto) {
      refLines.push(
        `  • IMAGE ${imgIdx++} (HERO PHOTO) — the product/service photograph. ` +
        "Composite it as the dominant hero visual with NO hard rectangular border — " +
        "blend its edges using an organic mask, gradient fade, diagonal cut, color-band overlay, or brushstroke shape. " +
        "Apply cinematic lighting with realistic shadow and soft-light blending into the background layer. " +
        "The photo must feel fully embedded in the composition, not dropped on top like a placed sticker.",
      );
    }
    if (hasLogo) {
      refLines.push(`  • IMAGE ${imgIdx} (BUSINESS LOGO) — the exact business logo. Reproduce it pixel-perfect with no stylization, color changes, or distortion.`);
    }
    logoImg = hasPhoto ? 2 : 1;
  } else {
    refLines.push(
      templateKey === "made-fresh"
        ? "  • IMAGE 1 (TEMPLATE) — a bright, warm restaurant postcard layout featuring a natural wood table surface, " +
          "a chalkboard-style 'Made Fresh For You' sign, gingham cloth accents, a golden ticket coupon stub, " +
          "and a fresh white plate as the hero focal point. Preserve all zones, props, and warm editorial atmosphere exactly."
        : templateKey === "neighborhood-pro"
          ? "  • IMAGE 1 (TEMPLATE) — a bold outdoor-service postcard layout on a deep forest-green background. " +
            "Upper-left: two overlapping white paint-brush splash shapes that form a bright organic panel for the headline text. " +
            "Upper-right: large full-bleed hero photo zone (outdoor/service scene). " +
            "Middle band: a horizontal row of four diagonal-cut service photo panels, each topped by a circular green icon badge and a short white brush-stroke label beneath it. " +
            "Lower section: a wide white brush-stroke area for the special offer / coupon text. " +
            "Footer strip: dark green bar with a bold phone number on the left, a clean QR code box on the right, and three small circular decorative icon graphics between them. " +
            "Reproduce every zone, the forest-green background, all brush-stroke shapes, and the footer layout exactly."
          : templateKey === "at-your-service"
            ? "  • IMAGE 1 (TEMPLATE) — a home-services postcard on a light gray/off-white textured background with a navy blue and gold/yellow color scheme. " +
              "Upper-left: a large dark navy hexagonal badge emblem with a gold/yellow interior accent — this is the logo zone. " +
              "A bold horizontal gold/yellow paint-brush stroke sweeps across the upper third of the layout connecting the logo badge to the photo zone. " +
              "Upper-right: large hero photo zone (tool belt packed with tools) blending naturally into the background without a hard border. " +
              "Center: a wide dark navy blue horizontal band spanning the full width. " +
              "On the navy band: a horizontal row of six circular white icon badges showing home-service icons (house, paint roller, lightbulb, faucet, door, wrench/tools). " +
              "Lower-right: a gold/yellow dashed-border coupon box. Lower-left: small gold/yellow triangle accent. " +
              "Footer: dark strip with a circular phone icon on the left and a QR code square on the right. " +
              "Reproduce every zone, the navy/gold color scheme, all geometric and brush-stroke shapes, and the footer layout exactly."
            : templateKey === "health-wellness"
              ? "  • IMAGE 1 (TEMPLATE) — a health and wellness postcard on a soft cream/off-white background with teal and sage green accents. " +
                "Upper section: two overlapping clinic/office photos arranged inside organic curved teal blob shapes that bleed off the top and right edges. " +
                "Center: a large wide rounded-rectangle white panel — this is the headline/business-name zone. " +
                "Below the headline panel: a narrow teal pill-shaped bar for the tagline or sub-headline. " +
                "Middle section: four equal-width service panels side by side, each with a circular teal badge icon on top and a white rounded-rectangle text box beneath it. " +
                "Lower section: a reception/waiting-room photo in an organic curved blob shape on the left, and a teal stethoscope on a dark teal circular blob on the right. " +
                "Lower-right corner: a small white rounded square — this is the QR/contact box. " +
                "Footer: a dark teal horizontal bar spanning the full width. Left side has a circular phone icon badge + phone number field; right side has a circular location pin icon badge + address field. " +
                "Color palette: teal (#3d8b9c), sage green, cream/off-white. Reproduce every zone, blob shape, icon badge style, and footer layout exactly."
              : "  • IMAGE 1 (TEMPLATE) — the full postcard layout with parchment texture, brush-stroke band, " +
                "pennant ribbon, circular checkmark badge, dashed coupon box, and dark footer strip. " +
                "Reproduce every zone, texture, and design element exactly.",
    );
    imgIdx = 2;
    if (hasPhoto) {
      refLines.push(`  • IMAGE ${imgIdx++} (HERO FOOD PHOTO) — the actual food/product photograph. Composite it into the main hero image zone with professional lighting and realistic shadow blending.`);
    }
    if (hasLogo) {
      refLines.push(`  • IMAGE ${imgIdx} (BUSINESS LOGO) — the exact business logo. Reproduce it pixel-perfect with no stylization, color changes, or distortion.`);
    }
    logoImg = hasPhoto ? 3 : 2;
  }

  // Output requirements block (template × orientation)
  const outputRequirements = isLandscape && templateKey === "parchment-classic"
    ? (
      "LAYOUT — reproduce the Parchment Classic LANDSCAPE template zones exactly:\n\n" +
      "  ZONE 1 — HEADLINE (dark horizontal brush-stroke band, upper area):\n" +
      `    Business name "${d.bizName}" in bold condensed all-caps slab serif, white or cream, rendered inside the dark brush-stroke sweep.\n` +
      `    ONLY IF the name has a common English category noun (Cafe, Grill, Pizza, Bar, etc.) — render ONLY that word in a flowing warm orange script. NEVER repeat any word.\n\n` +
      (hasLogo
        ? `  ZONE 2 — LOGO (orange bookmark-ribbon pennant, top-left corner):\n` +
          `    IMAGE ${logoImg} centered inside the orange pennant. Scale to fit with clear margin; preserve exact logo colors.\n` +
          (d.tagline ? `    Tagline: "${d.tagline}" in italic script beside the pennant.\n` : "") + "\n"
        : (d.tagline ? `  ZONE 2 — TAGLINE: "${d.tagline}" in italic script beside the pennant.\n\n` : "")) +
      "  ZONE 3 — SERVICE LIST (left column, parchment area):\n" +
      (menuStr !== "  (none)"
        ? `    Orange circular checkmark badges listing: ${menuStr}\n    Each item exactly once.\n\n`
        : "    Four orange circular checkmark badge items with relevant services for this business type.\n\n") +
      (hasPhoto
        ? `  ZONE 4 — HERO PHOTO (right-center area):\n    Composite IMAGE 2 into the right portion — blend edges into the parchment texture, no hard rectangular border. Cinematic lighting.\n\n`
        : "") +
      (d.offer
        ? `  ZONE 5 — COUPON (dashed dark rectangular box, lower-right):\n` +
          `    Inside: "${d.offer}" in bold white or cream text, large and prominent.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" smaller below.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +
      buildFooterZone(d.phone || "", fullAddress, "inline-icon") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps slab serif, white on dark brush-stroke\n" +
      "  • Script: warm orange, single English category noun only; never proper nouns\n" +
      "  • TEXT LEGIBILITY: every text element must be clearly readable — dark text on light zones, light text on dark zones. If any zone background is ambiguous, add a semi-opaque backing panel. Subtle 1px shadows are NOT sufficient.\n" +
      "  • NEVER render website URL as text"
    )
    : isLandscape && templateKey === "made-fresh"
    ? (
      "LAYOUT — reproduce the Made Fresh LANDSCAPE template zones exactly:\n\n" +
      "  BACKGROUND: the warm wood-table scene — gingham cloth, white plate, chalkboard 'Made Fresh For You' A-frame sign, and plant props — all exactly as in the template.\n\n" +
      (hasPhoto
        ? "  HERO FOOD PHOTO: Composite IMAGE 2 as the featured dish — place it on or near the white plate as the hero food item. Match warm editorial lighting.\n\n"
        : "") +
      `  ZONE A — WHITE PAINT-STROKE PANEL (lower-left, over the table):\n` +
      `    Business name "${d.bizName}" in bold condensed all-caps slab serif — large, dark, prominent.\n` +
      (d.tagline ? `    Tagline: "${d.tagline}" in handwriting-style italic script below the business name.\n` : "") +
      (hasLogo ? `    Logo (IMAGE ${logoImg}): upper corner of the white panel; preserve exact colors.\n` : "") + "\n" +
      (d.offer
        ? `  ZONE B — GOLDEN TICKET-STUB COUPON (lower-right):\n` +
          `    Inside: "${d.offer}" in bold dark text, large and prominent.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" smaller below.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +
      buildFooterZone(d.phone || "", fullAddress, "inline-icon") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Business name: bold condensed all-caps slab serif, dark on white panel\n" +
      "  • Tagline: handwriting-style italic, slightly smaller\n" +
      "  • TEXT LEGIBILITY: every text element must be clearly readable — dark text on light zones, light text on dark zones. If any zone background is ambiguous, add a semi-opaque backing panel. Subtle 1px shadows are NOT sufficient.\n" +
      "  • NEVER render website URL as text"
    )
    : isLandscape && templateKey === "neighborhood-pro"
    ? (
      "LAYOUT — reproduce the Neighborhood Pro LANDSCAPE template zones exactly:\n\n" +
      "  ZONE 1 — HEADLINE (upper-left, white brush-stroke splash panel):\n" +
      `    Business name "${d.bizName}" in bold condensed all-caps slab serif — very large, dark green or near-black.\n` +
      `    ONLY IF the name has a common English service-category word (Lawn, Cleaning, Roofing, etc.) — render ONLY that word in bright lime-green script at a slight angle. NEVER repeat any word.\n\n` +
      (hasLogo
        ? `  ZONE 1B — LOGO (IMAGE ${logoImg} inside the white brush-stroke panel). Scale to fit; preserve exact colors.\n` +
          (d.tagline ? `    Tagline: "${d.tagline}" in italic script, dark green, inside the white area.\n` : "") + "\n"
        : (d.tagline ? `  ZONE 1B — TAGLINE: "${d.tagline}" in italic script, dark green, inside the white splash area.\n\n` : "")) +
      "  ZONE 2 — HERO PHOTO (upper-right, full-bleed):\n" +
      (hasPhoto
        ? `    Seamlessly composite IMAGE 2 into the upper-right zone. Clean diagonal/curved cut where photo meets the green background. No rectangular border.\n\n`
        : "    Generate a photorealistic outdoor service scene — bright daylight, vibrant. Full bleed into upper-right zone; no rectangular border.\n\n") +
      "  ZONE 3 — SERVICE PANELS (middle horizontal row):\n" +
      (menuStr !== "  (none)"
        ? `    Render EXACTLY ${menuCount} diagonal-cut photo panel${menuCount !== 1 ? "s" : ""} — one per service listed. ` +
          "Do NOT add extra panels to fill unused slots, and do NOT place the Special Offer in any panel.\n" +
          "    Each panel: circular lime-green icon badge on top, white brush-stroke label below.\n" +
          `    Services: ${menuStr}\n    Each item exactly once.\n\n`
        : "    Four diagonal-cut photo panels, each with a circular lime-green icon badge on top and a white brush-stroke label below. Relevant service types for this business.\n\n") +
      (d.offer
        ? `  ZONE 4 — OFFER (wide white brush-stroke area, lower section):\n` +
          `    "${d.offer}" in bold dark-green text, large and prominent.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" smaller below.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +
      buildFooterZone(d.phone || "", fullAddress, "inline-icon") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps slab serif, dark green or near-black\n" +
      "  • Script: bright lime-green, single English service-category noun only\n" +
      "  • TEXT LEGIBILITY: every text element must be clearly readable — dark text on light zones, light text on dark zones. If any zone background is ambiguous, add a semi-opaque backing panel. Subtle 1px shadows are NOT sufficient.\n" +
      "  • NEVER render website URL as text"
    )
    : isLandscape && templateKey === "at-your-service"
    ? (
      "LAYOUT — reproduce the At Your Service LANDSCAPE template zones exactly:\n\n" +
      (hasLogo
        ? `  ZONE 1 — LOGO (IMAGE ${logoImg} centered inside the dark navy hexagonal badge, upper-left). Scale to fit; preserve exact colors.\n\n`
        : "") +
      `  ZONE 2 — HEADLINE (beside the hexagonal badge, upper-left):\n` +
      `    Business name "${d.bizName}" in bold condensed all-caps slab serif — very large, dark navy blue.\n` +
      `    ONLY IF the name has a common English service-category noun — render ONLY that word in gold/yellow script. NEVER repeat any word.\n` +
      (d.tagline ? `    Tagline: "${d.tagline}" in clean italic script, dark navy, below the headline.\n` : "") + "\n" +
      "  ZONE 3 — HERO PHOTO (upper-right, large photo zone):\n" +
      (hasPhoto
        ? `    Composite IMAGE 2 — blend left edge into the background; gold brush-stroke overlaps the photo at top. No hard border.\n\n`
        : "    Generate professional tools/equipment or home-service scene. Fill upper-right zone, left edge blends naturally.\n\n") +
      "  ZONE 4 — SERVICE BADGES (wide dark navy band, center full width):\n" +
      "    Four circular white icon service badges on the navy band.\n" +
      (menuStr !== "  (none)"
        ? `    Use icons for: ${menuStr}\n    Each service once only.\n\n`
        : "    Use home-service icons (house, paint roller, wrench, lightbulb). Each once only.\n\n") +
      (d.offer
        ? `  ZONE 5 — COUPON (gold/yellow dashed-border box, lower-right):\n` +
          `    "${d.offer}" in bold dark navy text, prominent.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" smaller below.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +
      buildFooterZone(d.phone || "", fullAddress, "circular-badge") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps slab serif, dark navy blue\n" +
      "  • Script: gold/yellow, single English service-category noun only\n" +
      "  • Gold/yellow brush stroke must remain visible in the upper area\n" +
      "  • TEXT LEGIBILITY: every text element must be clearly readable — dark text on light zones, light text on dark zones. If any zone background is ambiguous, add a semi-opaque backing panel. Subtle 1px shadows are NOT sufficient.\n" +
      "  • NEVER render website URL as text"
    )
    : isLandscape && templateKey === "health-wellness"
    ? (
      "LAYOUT — reproduce the Health & Wellness LANDSCAPE template zones exactly:\n\n" +
      "  ZONE 1 — PHOTOS (upper area, inside organic teal blob shapes):\n" +
      (hasPhoto
        ? `    Composite IMAGE 2 into the upper-left organic teal blob zone — edges blend naturally into the teal shape. Professional wellness lighting.\n` +
          "    Generate a complementary second clinic or wellness image for any remaining blob zone.\n\n"
        : "    Generate two photorealistic clinic or wellness images for the teal blob zones. Edges blend naturally — no rectangular borders.\n\n") +
      `  ZONE 2 — HEADLINE (large rounded-rectangle white panel, upper-center):\n` +
      `    "${d.bizName}" in bold condensed all-caps sans-serif — very large, dark teal or near-black. Each word EXACTLY ONCE — NEVER repeat.\n\n` +
      (d.tagline ? `  ZONE 3 — TAGLINE (teal pill-shaped bar below the white panel):\n    "${d.tagline}" in clean white sans-serif, centered inside the teal pill bar.\n\n` : "") +
      (menuStr !== "  (none)"
        ? `  ZONE 4 — SERVICE PANELS (EXACTLY ${menuCount} equal-width panel${menuCount !== 1 ? "s" : ""}, middle section):\n` +
          `    Render EXACTLY ${menuCount} panel${menuCount !== 1 ? "s" : ""} — do NOT add extras to fill unused slots, and do NOT place the Special Offer in any panel.\n` +
          "    Circular teal icon badge on top + white rounded-rectangle text box below per panel.\n" +
          `    Services: ${menuStr}\n    Each service exactly once.\n\n`
        : "  ZONE 4 — SERVICE PANELS (four equal-width, middle section):\n" +
          "    Circular teal icon badge on top + white rounded-rectangle text box below per panel.\n" +
          "    Relevant wellness/medical services for this practice. Each once only.\n\n") +
      (hasLogo ? `  LOGO: IMAGE ${logoImg} in an upper corner or within the headline panel. Preserve exact colors.\n\n` : "") +
      (d.offer
        ? `  ZONE 5 — OFFER (its own visually distinct zone — a teal-bordered rectangle, contrasting panel, or dashed coupon box; NEVER merged with or placed adjacent to the service panels):\n` +
          `    "${d.offer}" prominently inside this dedicated offer zone — large, bold text.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" smaller below, inside the same offer zone.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +
      buildFooterZone(d.phone || "", fullAddress, "circular-badge") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps sans-serif, dark teal or near-black\n" +
      "  • NEVER repeat any word from the business name\n" +
      "  • TEXT LEGIBILITY: every text element must be clearly readable — dark text on light zones, light text on dark zones. If any zone background is ambiguous, add a semi-opaque backing panel. Subtle 1px shadows are NOT sufficient.\n" +
      "  • NEVER render website URL as text"
    )
    : isLandscape
    ? (
      `DESIGN BRIEF — original LANDSCAPE (3"x2") postcard ad for this business. Full creative freedom.\n\n` +
      `STYLE THEME — "${selectedTheme.name}" (mood: ${selectedTheme.mood}):\n` +
      `  PALETTE: ${selectedTheme.palette}\n` +
      `  TYPOGRAPHY: ${selectedTheme.typography}\n` +
      `  LAYOUT APPROACH: ${selectedTheme.layoutLandscape}\n\n` +
      "FORBIDDEN styles — do NOT recreate any of these existing LocalSpot templates:\n" +
      "  Parchment/rustic | Chalkboard/bistro | Forest-green contractor | Navy/gold home services | Teal/sage wellness\n" +
      "  Apply your theme faithfully while making something genuinely original.\n\n" +
      "MANDATORY VISUAL RULES:\n" +
      "  - FILL THE ENTIRE 3\"×2\" (landscape) ad space — 100% coverage. No blank, empty, or unused areas anywhere in the ad.\n" +
      "  - IMAGE CANVAS RULE — ABSOLUTE: The image canvas boundary IS the ad boundary. Fill 100% of the canvas to every edge — top, bottom, left, right. NEVER render the ad as a card, postcard object, or framed artwork floating on a surface. NEVER add any outer border, drop shadow, glow, vignette, gradient halo, or background color outside the ad content. The composition begins at pixel 0 on all four sides.\n" +
      "  - No hard rectangular photo borders — mask/blend edges with organic shapes, gradients, or diagonal cuts.\n" +
      "  - Background must have depth: gradient, texture, or layered wash — NEVER flat solid color.\n" +
      "  - Three depth planes: (1) textured bg, (2) graphic mid-layer shapes, (3) foreground text with shadows/glows.\n" +
      "  - Hero photo: cinematic rim/soft lighting, edges blend into mid-layer — never floating above it.\n" +
      "  - All text sits ON the composition with drop shadows, glows, or dark-field backlighting.\n" +
      "  - TEXT LEGIBILITY — CRITICAL: every text block must be CLEARLY readable at arm's length against its background. For any text placed over a photo, gradient, or texture you MUST use ONE of: (a) a semi-opaque or fully opaque backing panel / brush-stroke shape behind the text, (b) very heavy multi-layer drop shadow (thick and clearly visible, NOT a subtle 1px shadow), or (c) a solid-fill opaque text zone. Subtle shadows alone are not enough. Headlines especially: NEVER dark text on dark background, NEVER light text on light/golden gradient — anchor them on a contrasting panel. Sacrifice decorative detail to achieve legibility.\n\n" +
      "REQUIRED CONTENT ZONES:\n" +
      `  HEADLINE: "${d.bizName}" — very large, dominant, instantly readable.\n` +
      (hasPhoto
        ? `  HERO PHOTO: IMAGE 1 — composite as dominant visual, organic-masked edges, cinematic lighting, no rectangular frame.\n`
        : `  HERO IMAGE: photorealistic business-appropriate image, cinematic quality, blended into bg — no rectangular frame.\n`) +
      (hasLogo ? `  LOGO: IMAGE ${logoImg} — exact placement, no stylization.\n` : "") +
      (d.tagline ? `  TAGLINE: "${d.tagline}" — supporting, secondary to headline.\n` : "") +
      (menuStr !== "  (none)" ? `  SERVICES/MENU: ${menuStr} — each item exactly once, in its own clearly defined list zone.\n` : "") +
      (d.offer
        ? `  SPECIAL OFFER — in its OWN VISUALLY DISTINCT ZONE (dashed coupon box, contrasting rectangle, or bordered panel) that is CLEARLY SEPARATED from the services/menu list. The coupon zone contains ONLY the offer text and fine print — NEVER merge with the services list, NEVER add filler phrases like 'Admit One Offer' or 'Stub No.':\n` +
          `    "${d.offer}" — large, bold, prominent inside the coupon zone.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" — smaller, inside same coupon zone.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n"
        : "") +
      buildFooterZone(d.phone || "", fullAddress, "minimal") +
      "TYPOGRAPHIC RULES:\n" +
      "  - NEVER repeat any word from the business name — each appears exactly once.\n" +
      "  - NEVER add script accent words or category nouns not present in the business name.\n" +
      "  - Headline: maximum weight, instantly legible.\n" +
      "  - NEVER render the website URL as visible text.\n" +
      "  - NEVER render any hex color code (e.g. #0F1C10, #FFFFFF), CSS value, or design metadata as visible text anywhere in the ad."
    )
    : templateKey === "neighborhood-pro"
    ? (
      "LAYOUT — reproduce the Neighborhood Pro template zones exactly as described:\n\n" +
      "  ZONE 1 — HEADLINE (upper-left, inside the white brush-stroke splash panel):\n" +
      `    Business name "${d.bizName}" rendered in bold condensed all-caps slab serif — very large, dark green or near-black, maximum weight, horizontal (no angle). ` +
      `    The text sits INSIDE the white paint-brush splash area; the white shape is the background for this headline.\n` +
      `    ONLY IF the business name contains a widely-recognised English business-category word (e.g. "Lawn", "Care", "Cleaning", "Roofing", "Plumbing", "Dental", "Grill", "Pizza") — render ONLY that one word in a flowing bright-green or lime-green script/cursive at a slight angle, large size. Do NOT apply to proper nouns or brand names. If no such word exists, use all-caps treatment only. NEVER repeat any word.\n\n` +
      (hasLogo
        ? `  ZONE 2 — LOGO${d.tagline ? " + TAGLINE" : ""} (inside the white brush-stroke panel, upper-left):\n` +
          `    Place IMAGE ${logoImg} inside the white brush-stroke splash area, above or beside the headline. Scale it to fit with clear margin — do not let it overflow the white shape. Preserve exact logo colors and proportions.\n` +
          (d.tagline ? `    Tagline: render "${d.tagline}" in a clean italic script, dark green, below the logo inside the white splash area.\n` : "") +
          "\n"
        : d.tagline
          ? `  ZONE 2 — TAGLINE (inside the white brush-stroke panel, below headline):\n` +
            `    "${d.tagline}" in a clean italic script, dark green, confident — placed inside the white splash area.\n\n`
          : "") +
      "  ZONE 3 — HERO IMAGE (upper-right, large full-bleed photo zone):\n" +
      (hasPhoto
        ? `    Take IMAGE 2 and SEAMLESSLY INTEGRATE it into the upper-right hero photo area:\n` +
          "    • Fill the entire upper-right zone with the photo — no rectangular frame or border.\n" +
          "    • Left edge: a clean diagonal or curved cut where photo meets the green background (match template exactly).\n" +
          "    • Professional outdoor lighting, vibrant color, cinematic quality. The photo must look native to the design.\n\n"
        : `    Generate a photorealistic outdoor service scene appropriate for this business — bright daylight, vibrant green tones, professional composition. Fill the entire upper-right zone with no rectangular border.\n\n`) +
      (menuStr !== "  (none)"
        ? `  ZONE 4 — SERVICES PANELS (EXACTLY ${menuCount} panel${menuCount !== 1 ? "s" : ""}, middle horizontal row):\n` +
          `    Render EXACTLY ${menuCount} diagonal-cut panel${menuCount !== 1 ? "s" : ""} — one per service listed. ` +
          "Do NOT add extra panels to fill unused template slots. Do NOT place the Special Offer in any service panel.\n" +
          "    Each panel: service photo behind diagonal-cut edge; circular dark-green badge with white icon above; short white brush-stroke label below.\n" +
          `    Services: ${menuStr}\n` +
          "    Each service name must appear exactly once across the entire ad.\n\n"
        : "  ZONE 4 — SERVICES PANELS (middle horizontal row):\n" +
          "    Reproduce the four diagonal-cut service photo panels from the template with relevant service imagery for this business type.\n" +
          "    Each panel has a circular green icon badge on top and a white brush-stroke label below.\n\n") +
      (d.offer
        ? "  ZONE 5 — SPECIAL OFFER (wide white brush-stroke area, lower section):\n" +
          `    Inside the large white brush-stroke shape: render "${d.offer}" in bold dark-green text, large and prominent.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" in smaller text below.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +
      buildFooterZone(d.phone || "", fullAddress, "inline-icon") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps slab serif, very large, dark green or near-black\n" +
      "  • Script accent: bright-green cursive ONLY for a single common English service-category noun in the business name — never for proper nouns or brand names; never duplicate any word\n" +
      "  • All text inside white brush-stroke areas: dark green or near-black for contrast\n" +
      "  • Fine print: smallest text, still legible\n" +
      "  • NEVER render the website URL as visible text"
    )
    : templateKey === "at-your-service"
    ? (
      "LAYOUT — reproduce the At Your Service template zones exactly as described:\n\n" +
      "  ZONE 1 — HEADLINE (upper-left, beside the hexagonal badge):\n" +
      `    Business name "${d.bizName}" in bold condensed all-caps slab serif — very large, dark navy blue, maximum weight, horizontal (no angle).\n` +
      `    ONLY IF the business name contains a widely-recognised English service-category word (e.g. "Plumbing", "Electric", "Roofing", "Painting", "Services", "Heating", "Cooling", "Lawn") — render ONLY that single word in a flowing gold/yellow script at a slight angle. Do NOT apply to proper nouns or brand names. If no such word exists, use all-caps only. NEVER repeat any word.\n\n` +
      (hasLogo
        ? `  ZONE 2 — LOGO (inside the navy hexagonal badge, upper-left):\n` +
          `    Place IMAGE ${logoImg} centered inside the dark navy hexagonal badge emblem. Scale it to fit with clear margin — it must not overflow the hexagon. Preserve exact logo colors and proportions. The hexagonal badge retains its dark navy border and gold/yellow accent fill.\n` +
          (d.tagline ? `    Tagline: render "${d.tagline}" in a clean italic script, navy blue, below the headline.\n` : "") +
          "\n"
        : d.tagline
          ? `  ZONE 2 — TAGLINE (below headline, upper-left):\n` +
            `    "${d.tagline}" in a clean italic script, dark navy blue, below the headline.\n\n`
          : "") +
      "  ZONE 3 — HERO IMAGE (upper-right, large photo zone):\n" +
      (hasPhoto
        ? `    Take IMAGE 2 and SEAMLESSLY INTEGRATE it into the upper-right hero photo zone:\n` +
          "    • Fill the entire upper-right area with the photo — blend the left edge naturally into the background; no hard rectangular border.\n" +
          "    • The gold/yellow brush stroke in the upper portion overlaps the photo zone — keep it visible overlapping the image.\n" +
          "    • Professional lighting, vibrant color, cinematic quality. Photo must look native to the design.\n\n"
        : `    Generate a photorealistic hero image of tools, equipment, or a professional at work — appropriate for this home-services business. Fill the upper-right zone with no rectangular border, blending naturally into the off-white background.\n\n`) +
      "  ZONE 4 — SERVICE ICONS (on the navy horizontal band, center):\n" +
      "    Reproduce the wide dark navy blue horizontal band spanning the full card width.\n" +
      (menuStr !== "  (none)"
        ? `    On the band: a horizontal row of circular white icon badges, one per key service. Use icons representing: ${menuStr}. Keep the circular white badge style from the template. Each service must appear exactly once — no repeated labels or icons.\n\n`
        : "    On the band: a horizontal row of six circular white icon badges with home-service icons (house, paint roller, lightbulb, faucet, door, wrench/tools) as in the template.\n\n") +
      (d.offer
        ? "  ZONE 5 — SPECIAL OFFER (gold/yellow dashed-border coupon box, lower-right):\n" +
          `    Inside the gold/yellow dashed coupon rectangle: render "${d.offer}" in bold dark navy text, large and prominent.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" in smaller text below the offer.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +
      buildFooterZone(d.phone || "", fullAddress, "circular-badge") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps slab serif, very large, dark navy blue\n" +
      "  • Script accent: gold/yellow cursive ONLY for a single common English service-category noun — never for proper nouns or brand names; never duplicate any word\n" +
      "  • Gold/yellow brush stroke: must remain visible in the upper portion, overlapping the hero image zone\n" +
      "  • Fine print: smallest text, still legible\n" +
      "  • NEVER render the website URL as visible text"
    )
    : templateKey === "surprise-me"
    ? (
      "DESIGN BRIEF — create a completely ORIGINAL postcard ad for this business. You have full creative freedom:\n\n" +
      `  STYLE THEME — "${selectedTheme.name}" (mood: ${selectedTheme.mood}):\n` +
      `    PALETTE: ${selectedTheme.palette}\n` +
      `    TYPOGRAPHY: ${selectedTheme.typography}\n` +
      `    LAYOUT APPROACH: ${selectedTheme.layoutPortrait}\n\n` +
      "  FORBIDDEN — do NOT recreate any of these five existing ad styles:\n" +
      "    • Parchment/rustic (warm ivory background, orange pennant ribbon, brush-stroke swoosh, burgundy)\n" +
      "    • Chalkboard/bistro (dark chalkboard, wood table, golden ticket, gingham)\n" +
      "    • Forest-green contractor (deep green background, white paint-brush splashes, lime-green script accent)\n" +
      "    • Navy/gold home services (navy hexagonal badge, gold brush-stroke, circular icon band)\n" +
      "    • Teal/sage wellness (teal blob shapes, teal pill bar, cream background, teal footer)\n" +
      "    Apply your theme faithfully while creating something genuinely original.\n\n" +
      "  VISUAL CONSTRUCTION — these rules are MANDATORY, not optional:\n" +
      "    (a) NO hard rectangular photo borders. Every photo must be masked or blended into the background " +
      "using an organic shape (blob, brush-stroke, diagonal cut, arch, vignette, or color-band overlay). " +
      "Edges of the photo must dissolve or fade into the surrounding layer — never sit inside a visible frame or box.\n" +
      "    (b) Background must have material depth. Use a rich multi-stop gradient, a brushstroke-wash overlay, " +
      "a paper/fabric/concrete/wood texture, or an environmental surface tone — NEVER a flat solid color.\n" +
      "    (c) Compose three distinct depth planes:\n" +
      "        PLANE 1 (deepest) — textured or gradient background fill\n" +
      "        PLANE 2 (mid) — graphic elements (color bands, geometric shapes, organic swooshes, brushstroke blocks) " +
      "that frame zones and divide the layout\n" +
      "        PLANE 3 (front) — headline text, logo, and offer copy rendered on top with depth treatment\n" +
      "    (d) Hero photo must appear cinematically lit with soft-light or rim-light, and its shadow/edge must " +
      "blend realistically into the mid-layer (Plane 2), not float above it.\n" +
      "    (e) Every text element must sit ON the composition with drop shadows, glows, light knockouts, or dark-field " +
      "backlighting — NEVER floating on bare flat color.\n" +
      "    (f) FILL EVERY SQUARE INCH of the card — NO empty, bare, or background-only zones. Every region not occupied by a content zone must be covered by textures, patterns, color fills, or decorative graphic elements from your theme.\n" +
      "    (g) IMAGE CANVAS RULE — ABSOLUTE: The canvas boundary IS the ad boundary. Fill 100% of the canvas to every edge — top, bottom, left, right. NEVER render the ad as a card or postcard floating on a surface or background. NEVER add any outer border, drop shadow, glow, vignette, gradient halo, or background color outside the ad content. The composition begins at pixel 0 on all four sides.\n\n" +
      "  REQUIRED CONTENT ZONES (place and style these however fits your design):\n" +
      `    HEADLINE: Business name "${d.bizName}" — very large, dominant, instantly readable at a glance. Maximum typographic impact.\n` +
      (hasPhoto
        ? `    HERO PHOTO: IMAGE ${imgIdx > 1 ? imgIdx - 1 : 1} — composite the provided photo as the dominant visual. ` +
          "Mask or blend its edges (organic shape / gradient fade / diagonal cut / brushstroke overlay) — NO hard rectangular frame. " +
          "Cinematic lighting, realistic shadow blending into Plane 2.\n"
        : `    HERO IMAGE: Generate a photorealistic, business-appropriate hero image at cinematic quality — ` +
          "professional studio or location lighting, shallow depth of field. Blend it into the background using an organic mask or gradient fade — no hard rectangular frame.\n") +
      (hasLogo ? `    LOGO: IMAGE ${logoImg} — place exactly as provided, no stylization or color changes.\n` : "") +
      (d.tagline ? `    TAGLINE: "${d.tagline}" — supporting, secondary to headline.\n` : "") +
      (menuStr !== "  (none)" ? `    SERVICES/MENU: ${menuStr} — displayed clearly, not crowded. Each item exactly once.\n` : "") +
      (d.offer
        ? `    SPECIAL OFFER — in its OWN VISUALLY DISTINCT ZONE (dashed coupon box, contrasting panel, or bordered shape) that is CLEARLY SEPARATED from the services/menu list — NEVER placed in the same column or merged with services:\n` +
          `    "${d.offer}" — large, bold, prominent inside the coupon zone. ONLY this offer text and fine print here — no filler phrases.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" — smaller, inside same coupon zone.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n"
        : "") +
      buildFooterZone(d.phone || "", fullAddress, "minimal") +
      "  QUALITY STANDARD — all of the following are required, no exceptions:\n" +
      "    ✗ NO flat solid-color backgrounds — must have gradient, texture, or layered depth\n" +
      "    ✗ NO rectangular photo frames or visible borders around any image\n" +
      "    ✗ NO text floating on bare flat color — every text element needs shadow, glow, knockout, or dark-field anchor\n" +
      "    ✗ NO decorative filler text in the coupon area that was not provided ('Admit One Offer', 'Stub No.', etc.)\n" +
      "    ✓ THREE visual depth planes minimum (texture → graphic mid-layer → foreground text)\n" +
      "    ✓ Hero photo composited with cinematic lighting and edge blending\n" +
      "    ✓ Print-ready 300 DPI sharpness throughout — no generic clip-art, no thin strokes on busy backgrounds\n\n" +
      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: very large, maximum weight — instantly legible\n" +
      "  • NEVER repeat any word from the business name — each word appears exactly once across the entire ad\n" +
      "  • NEVER add script accent words or decorative category nouns not present in the business name\n" +
      "  • Fine print: smallest text, still legible\n" +
      "  • NEVER render the website URL as visible text\n" +
      "  • NEVER render any hex color code (e.g. #0F1C10, #FFFFFF), CSS value, or design metadata as visible text anywhere in the ad"
    )
    : templateKey === "health-wellness"
    ? (
      "LAYOUT — reproduce the Health & Wellness template zones exactly as described:\n\n" +
      "  ZONE 1 — HERO PHOTOS (upper section, inside organic teal blob shapes):\n" +
      (hasPhoto
        ? `    Seamlessly composite IMAGE 2 into the upper-right organic teal blob photo zone — no hard rectangular border, natural edges blending into the teal shape.\n` +
          "    Generate a second complementary wellness/clinic image for the upper-left blob zone.\n\n"
        : "    Generate two photorealistic clinic or wellness imagery photos — one for each upper blob zone (bright reception or treatment room; calming nature or lifestyle detail). No rectangular borders — blend naturally into the teal blob shapes.\n\n") +
      "  ZONE 2 — HEADLINE (center, inside the large rounded-rectangle white panel):\n" +
      `    Business name: "${d.bizName}" in bold condensed all-caps sans-serif — very large, dark teal or near-black, maximum weight.\n` +
      `    CRITICAL: Render the business name EXACTLY as given — "${d.bizName}". ` +
      `    Each word must appear EXACTLY ONCE. NEVER repeat any individual word. If the name already contains a category word (e.g. "Chiropractic", "Wellness", "Health", "Dental"), do NOT add it again elsewhere.\n\n` +
      (d.tagline
        ? `  ZONE 3 — TAGLINE (teal pill-shaped bar below the white panel):\n` +
          `    Render "${d.tagline}" in clean white sans-serif, centered inside the teal pill bar.\n\n`
        : "") +
      (menuStr !== "  (none)"
        ? `  ZONE 4 — SERVICE PANELS (EXACTLY ${menuCount} equal-width panel${menuCount !== 1 ? "s" : ""}, middle section):\n` +
          `    Render EXACTLY ${menuCount} panel${menuCount !== 1 ? "s" : ""}. Do NOT add more panels to fill unused slots. Do NOT place the Special Offer in any service panel.\n` +
          "    Each panel has:\n" +
          "    • A circular teal badge with a white wellness/medical icon on top\n" +
          "    • A white rounded-rectangle text box below showing one service\n" +
          `    Use these services: ${menuStr}\n` +
          "    Each service must appear exactly once — never repeat.\n\n"
        : "  ZONE 4 — SERVICE PANELS (four equal-width panels, middle section):\n" +
          "    Reproduce the four-panel row with circular teal icon badges (spine, massage, leaf/wellness, doctor) and white rounded-rectangle text boxes relevant to this practice type.\n\n") +
      "  ZONE 5 — LOWER PHOTOS (organic blob shapes):\n" +
      "    Left: generate a photorealistic reception or waiting-room scene inside an organic curved blob shape.\n" +
      "    Right: place a teal stethoscope or relevant medical prop on a dark teal circular blob shape.\n\n" +
      (d.offer
        ? "  ZONE 5B — SPECIAL OFFER:\n" +
          `    Render "${d.offer}" prominently in teal or dark text in an available white space area.\n` +
          (d.offerFine ? `    Fine print: "${d.offerFine}" in smaller text below.\n` : "") +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +
      buildFooterZone(d.phone || "", fullAddress, "circular-badge") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Business name: bold condensed all-caps sans-serif, very large, dark teal or near-black\n" +
      "  • NEVER repeat any word from the business name — each word appears exactly once across the entire ad\n" +
      "  • Tagline: clean white sans-serif inside the teal pill bar, centered\n" +
      "  • Service labels: clean dark sans-serif inside white rounded-rectangle boxes\n" +
      "  • Fine print: smallest text, still legible\n" +
      "  • NEVER render the website URL as visible text"
    )
    : (
      "LAYOUT — render these zones in order from top to bottom:\n\n" +
      "  ZONE 1 — HEADLINE (top of ad, above everything else):\n" +
      `    Business name "${d.bizName}" uses a LAYERED TWO-FONT treatment:\n` +
      `    • Main words: bold condensed all-caps slab/block serif — very large, dominant, horizontal (no angle). Deep black or dark color, maximum weight.\n` +
      `    • ONLY IF the business name contains a common English category/industry word (e.g. "Cafe", "Grill", "Spa", "Pizza", "Bar", "Salon", "Dental", "Kitchen", "Bakery", "Bistro", "Diner") — render ONLY that one common-noun word in a flowing orange script/cursive at a slight downward angle (≈-8°), large size, warm orange color. Do NOT apply this treatment to proper nouns, brand names, foreign-language words, or any word that is not a widely-recognised English business-category noun. If no such common category word exists in the name, render the entire business name in the bold condensed all-caps treatment only — do NOT split or duplicate any word.\n` +
      `    Together these two styles create a premium editorial stacked headline — not a single flat font. NEVER render the same word twice in the headline.\n\n` +
      (hasLogo
        ? `  ZONE 2 — LOGO${d.tagline ? " + TAGLINE" : ""} (orange pennant ribbon, top-left corner):\n` +
          `    PENNANT: Copy the orange pennant ribbon from IMAGE 1 exactly — same height, same width, same shape. Its TOP EDGE must be flush with the TOP EDGE of the entire ad (touching the very top of the canvas). It sits in the top-left column. Do NOT move it down, elongate it, float it, or detach it from the top of the ad in any way.\n` +
          `    Logo: place IMAGE ${logoImg} at the very top of the ad, centered inside the pennant. Scale it DOWN until it fits comfortably within the pennant with a small margin on every side — the logo must not overflow or touch the pennant edges. Keep it small and tidy inside the flag shape. Preserve exact logo colors and proportions.\n` +
          (d.tagline ? `    Tagline: render "${d.tagline}" in a loose handwriting-style italic script at a slight upward angle (+5°–7°), large and confident, black — placed to the right of the pennant, below the headline.\n` : "") +
          "\n"
        : d.tagline
          ? `  ZONE 2 — TAGLINE (upper-left, below headline):\n` +
            `    "${d.tagline}" in a loose handwriting-style italic script at a slight upward angle (+5°–7°), large and confident, black.\n\n`
          : "") +
      "  ZONE 3 — HERO IMAGE (right-center, large feature area):\n" +
      (hasPhoto
        ? "    Take the food/dish from IMAGE 2 and SEAMLESSLY INTEGRATE it into the template's photo area as if it was professionally shot for this exact ad:\n" +
          "    • Blend the food's edges naturally into the surrounding dark brush-stroke/painted background — NO hard rectangular border or frame.\n" +
          "    • Match the lighting, shadows, perspective, and color grading to the warm, appetizing commercial food photography style of a high-end restaurant ad.\n" +
          "    • The food should look like it BELONGS in the design — not pasted on top. Adjust edges, add subtle plate shadows or gradient fade as needed for realism.\n" +
          "    • Preserve the dark painted brush-stroke swoosh behind and around the photo area exactly as in the template.\n\n"
        : `    Generate a photorealistic, appetizing hero image for this business — cinematic quality, appetizing styling, vibrant color. Blend it naturally into the dark brush-stroke background with no hard rectangular border.\n\n`) +
      (menuStr !== "  (none)"
        ? "  ZONE 4 — MENU / SERVICES (left-center card area):\n" +
          "    List each item clearly. Use a clean, legible sans-serif. Prices right-aligned if present.\n\n"
        : "") +
      (d.offer
        ? "  ZONE 5 — SPECIAL OFFER (dashed coupon box):\n" +
          `    "${d.offer}" in bold inside the dashed coupon rectangle. If fine print exists, render it smaller below.\n` +
          "    NEVER place a QR code inside or adjacent to this coupon zone — the QR code belongs ONLY in the footer bottom-right corner.\n\n"
        : "") +
      buildFooterZone(d.phone || "", fullAddress, "inline-icon") +
      "TYPOGRAPHIC RULES:\n" +
      "  • Headline: bold condensed all-caps slab/block serif for the full business name. Apply the flowing orange script (angled ≈-8°) ONLY to a common English category noun within the name (e.g. Cafe, Grill, Spa, Pizza, Bar). NEVER split a proper noun, foreign word, or brand name into a second-line script — and NEVER render any word from the business name more than once.\n" +
      "  • Tagline: loose handwriting-style italic script, slight upward angle (+5°–7°), large, confident — never flat/horizontal\n" +
      "  • Logo: scaled small to fit ENTIRELY INSIDE the orange pennant ribbon; pennant stays fixed in top-left exactly as in the template\n" +
      "  • Footer phone/address: bold sans-serif, noticeably larger than fine print\n" +
      "  • Fine print / coupon terms: smallest text, still legible\n" +
      "  • NEVER render the website URL as visible text"
    );

  return (
    (isLandscape && templateKey === "surprise-me"
      ? "You are a world-class print advertising art director with complete creative freedom. " +
        "Invent a PRINT-READY premium LANDSCAPE (3\"×2\") postcard ad from scratch — original layout, original color scheme, original typography — " +
        "tailored specifically to this business's industry and personality. " +
        "The result must look like a bespoke ad designed by a top agency for this exact business, not a generic template.\n\n"
      : isLandscape
        ? "You are a world-class print advertising art director and expert photo compositor. " +
          "Create a PRINT-READY premium LANDSCAPE (3\"×2\") postcard ad by taking the template layout and seamlessly integrating " +
          "the business details and any provided reference photos into it — the result must look like a single cohesive ad designed by a top agency, " +
          "not a template with content pasted on top.\n\n"
        : templateKey === "surprise-me"
        ? "You are a world-class print advertising art director with complete creative freedom. " +
          "Invent a PRINT-READY premium postcard ad from scratch — original layout, original color scheme, original typography — " +
          "tailored specifically to this business's industry and personality. " +
          "The result must look like a bespoke ad designed by a top agency for this exact business, not a generic template.\n\n"
        : "You are a world-class print advertising art director and expert photo compositor. " +
          "Create a PRINT-READY premium postcard ad by taking the template layout and seamlessly integrating " +
          "the business details and any provided reference photos into it — the result must look like a single cohesive ad designed by a top agency, " +
          "not a template with content pasted on top.\n\n") +
    (refLines.length > 0
      ? `REFERENCE IMAGES: You are provided ${refLines.length} reference image${refLines.length > 1 ? "s" : ""}. ` +
        "Treat them as distinct inputs — do NOT merge their design styles or treat any of them as already finished:\n" +
        refLines.join("\n") + "\n\n"
      : "") +
    (variantBlock ? variantBlock + "\n" : "") +
    outputRequirements + "\n" +
    "STYLE: high-end editorial advertising aesthetic. Cinematic photography with rich, vibrant color and " +
    "professional lighting. Bold confident typography hierarchy. Premium color palette — deep, saturated, controlled. " +
    "Every element is intentionally placed; nothing looks accidental or generic. Print-ready sharpness throughout.\n\n" +
    "CRITICAL: Every piece of text must appear EXACTLY as specified. " +
    "Phone numbers, prices, business name, and address — zero tolerance for errors or omissions. " +
    (fullAddress !== "(none)" ? `The address "${fullAddress}" MUST be visible in the footer region — do not skip it. ` : "") +
    "No website URL text anywhere. " +
    "FOOTER STANDARD: phone number minimum 18pt bold — the largest text element in the footer bar; address minimum 14pt bold. " +
    "QR code must have a clear 4-unit white quiet zone on all four sides. " +
    `BUSINESS NAME INTEGRITY: The business name is "${d.bizName}". Render it EXACTLY as given — every word appears EXACTLY ONCE across the entire ad. ` +
    "NEVER split the name and repeat any single word (e.g. if the name is 'Smith Chiropractic', do NOT write 'Chiropractic' a second time anywhere on the ad as a headline, label, icon badge, or decorative element). " +
    "NO DUPLICATE SERVICES OR MENU ITEMS: each service or menu item from the list must appear exactly once in the ad — never repeat the same item or a near-synonym of it in two different zones or icon badges. " +
    "OFFER IS NOT A MENU ITEM: the Special Offer must appear in its own distinct zone (coupon box, stamp, or highlighted panel) — it must NEVER be listed alongside or treated as one of the menu/service items.\n\n" +
    "BUSINESS DETAILS:\n" + businessBlock
  );
}
