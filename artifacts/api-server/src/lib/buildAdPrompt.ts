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

export function buildFooterZone(phone: string, address: string, isLandscape = false): string {
  if (isLandscape) {
    const hasAddr = address !== "(none)";
    return (
      `FOOTER (full-width dark bar, 15–20% of card height): ` +
      `THREE inline columns left to right — ` +
      `LEFT: "${phone}" bold white, very large (the largest text in the footer); ` +
      `CENTER: ` + (hasAddr
        ? `"${address}" bold white, large, split to 2 lines at the comma (street on line 1, city/state on line 2), center-aligned in the bar; `
        : `(centered placeholder); `) +
      `RIGHT: QR code, small square. ` +
      `Phone and QR appear EXACTLY ONCE — only inside this footer bar, never elsewhere.\n\n`
    );
  }
  return (
    `FOOTER (full-width dark bar, 15–20% of card): ` +
    `"${phone}" bold white, very large, left-aligned (the largest text in the footer); ` +
    (address !== "(none)" ? `"${address}" bold white, large, directly below phone (same left column); ` : "") +
    `QR code, small square, lower-right. ` +
    `Phone and QR appear EXACTLY ONCE — only inside this footer bar, never elsewhere.\n\n`
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
 */
export function buildAdPrompt(
  d: AdPromptInput,
  isLandscape: boolean,
): string {
  const templateKey = d.template || "parchment-classic";

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
        ? `EXACTLY ${menuCount} stacked rows — one per service in BUSINESS DETAILS, exactly as written. Each row is one visual unit: an orange circular checkmark badge on the left, immediately paired with the service text (including price if shown) to its right in the same horizontal row. Do NOT place badges in a standalone column separate from the text. No extras. No invented services.\n\n`
        : `no services provided — leave the service list area empty; do not render any badge labels or invented items.\n\n`) +
      (hasPhoto ? `HERO PHOTO (right-center): composite IMAGE 2 blended into parchment texture, no hard border.\n\n` : "") +
      (d.offer
        ? `COUPON (dashed dark box, lower-right): offer text bold white/cream, large. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape)
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
      buildFooterZone(d.phone || "", fullAddress, isLandscape)
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
        : `generate photorealistic outdoor service scene, vibrant, no rectangular border.\n\n`) +
      `SERVICE PANELS (middle horizontal row): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} diagonal-cut panel${menuCount !== 1 ? "s" : ""} — one per service in BUSINESS DETAILS, exactly as written. Circular lime-green icon badge + white brush-stroke label per panel. No extras. No invented services.\n\n`
        : `service panel row — render the structural diagonal-cut panel shapes with circular lime-green icon badge graphics only; NO text labels (no services provided).\n\n`) +
      (d.offer
        ? `OFFER (wide white brush-stroke area, lower section): offer text bold dark-green, large. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape)
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
        : `generate professional tools/equipment or home-service scene, left edge blends naturally.\n\n`) +
      `SERVICE BADGES (wide dark navy band, center full-width): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} circular white icon badge${menuCount !== 1 ? "s" : ""} on the navy band — one per service in BUSINESS DETAILS, exactly as written. No extras. No invented services.\n\n`
        : `navy band — render decorative circular icon badge graphics only; NO text captions or labels (no services provided).\n\n`) +
      (d.offer
        ? `COUPON (gold/yellow dashed-border box, lower-right): offer text bold dark navy, prominent. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape)
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
        : `  Generate a photorealistic organic interior or lifestyle scene. Fill circular frame with sage green ring border.\n\n`) +
      "SECONDARY PHOTOS (lower-right, two smaller overlapping circles): generate two circular-cropped photos — kitchen/dining scene and outdoor patio/pergola. Each perfectly circular.\n\n" +
      `SERVICE BADGES + TILES (middle section): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} muted sage green circular icon badge${menuCount !== 1 ? "s" : ""} with thin vertical dividers; EXACTLY ${menuCount} cream rounded-rect tile${menuCount !== 1 ? "s" : ""} below — one per service in BUSINESS DETAILS, exactly as written. No extras. No invented services.\n\n`
        : `four decorative sage green circular icon badges with dividers; four cream rounded-rect tile shapes; NO text labels.\n\n`) +
      "PURPLE WAVE BAND (lower section): muted lavender-purple organic wave/blob shape spanning full width, sage green brush stroke accent.\n\n" +
      (d.offer
        ? `SPECIAL OFFER (dashed coupon box, lower area): offer text bold dark, fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape)
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
        : `  Generate a photorealistic organic/natural interior or garden scene. Fill upper-right curved zone, blend naturally.\n\n`) +
      `SERVICE BADGES + TILES (middle section): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} dark olive circular icon badge${menuCount !== 1 ? "s" : ""} with thin vertical dividers; EXACTLY ${menuCount} cream rounded-rect tile${menuCount !== 1 ? "s" : ""} below — one per service in BUSINESS DETAILS, exactly as written. No extras. No invented services.\n\n`
        : `four decorative dark olive circular icon badges with vertical dividers; four cream rounded-rect tile shapes; NO text labels.\n\n`) +
      "PHOTO COLLAGE STRIP (dark olive wave band, lower section): three equal-width landscape photos side by side — interior, shop/café, outdoor garden/service.\n\n" +
      (d.offer
        ? `COUPON (kraft paper dashed-stitch rectangle, lower-right, scissors icon): offer text bold dark, fine print below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape)
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
        : `  Generate a photorealistic home exterior or landscaping scene. Fill upper-right, blend into cream bg.\n\n`) +
      "CIRCULAR PHOTOS (dark navy right area, three overlapping circles): " +
      `generate three circular-cropped interior/exterior photos — living space, kitchen, outdoor service scene. Each perfectly circular with subtle gold ring accent.\n\n` +
      `SERVICE TILES (dark navy lower-right area): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} rounded-rect service tile${menuCount !== 1 ? "s" : ""} — one per service from BUSINESS DETAILS, exactly as written. Each tile: circular dark navy icon badge on top, service name below inside cream card body. No extras. No invented services.\n\n`
        : `render decorative rounded-rect tile shapes with circular dark navy icon badge graphics only; NO text labels (no services provided).\n\n`) +
      (d.offer
        ? `SPECIAL OFFER (dashed coupon box, lower area): offer text bold dark navy, large. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape)
    )
    : isLandscape && templateKey === "health-wellness"
    ? (
      LANDSCAPE_CANVAS_RULE +
      "LAYOUT — reproduce Health & Wellness LANDSCAPE zones exactly:\n\n" +
      "PHOTOS (upper area, inside organic teal blob shapes): " +
      (hasPhoto
        ? `composite IMAGE 2 into upper-left blob — edges blend naturally into teal shape. Generate a complementary second wellness image for remaining blob.\n\n`
        : `generate two photorealistic clinic/wellness images for the teal blob zones. No rectangular borders.\n\n`) +
      `HEADLINE (large rounded-rect white panel, upper-center): business name bold condensed all-caps sans-serif, dark teal/near-black. Each word exactly once.\n\n` +
      (d.tagline ? `TAGLINE (teal pill-shaped bar below white panel): tagline in clean white sans-serif, centered.\n\n` : "") +
      `SERVICE PANELS (middle section): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} equal-width panel${menuCount !== 1 ? "s" : ""} — one per service in BUSINESS DETAILS, exactly as written. Circular teal icon badge + white rounded-rect text box per panel. No extras. No invented services.\n\n`
        : `service panel row — render the structural panel shapes with circular teal icon badge graphics only; NO text labels (no services provided).\n\n`) +
      (hasLogo ? `LOGO (IMAGE ${logoImg}) in an upper corner or within the headline panel.\n\n` : "") +
      (d.offer
        ? `OFFER (teal-bordered rect or dashed coupon box, visually distinct from service panels): offer text large and bold. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape)
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
      "  • All text must be clearly readable: use opaque backing panel, heavy drop shadow, or solid-fill text zone — subtle 1px shadows are insufficient.\n\n" +
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
      buildFooterZone(d.phone || "", fullAddress, isLandscape)
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
        : `  Generate a photorealistic outdoor service scene — bright daylight, vibrant. Full bleed, no rectangular border.\n\n`) +
      `SERVICE PANELS (middle horizontal row): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} diagonal-cut panel${menuCount !== 1 ? "s" : ""} — one per service in BUSINESS DETAILS, exactly as written. Service photo + circular green icon badge + white brush-stroke label per panel. No extras. No invented services. No offer in service panels.\n\n`
        : `service panel row — render the structural diagonal-cut panel shapes with circular green icon badge graphics only; NO text labels (no services provided).\n\n`) +
      (d.offer
        ? `SPECIAL OFFER (wide white brush-stroke area, lower section): offer text bold dark-green, large. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape)
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
        : `  Generate a photorealistic image of tools, equipment, or professional at work. Fill upper-right zone, blend naturally into off-white bg.\n\n`) +
      `SERVICE ICONS (wide dark navy band, center full-width): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} circular white icon badge${menuCount !== 1 ? "s" : ""} on the navy band — one per service in BUSINESS DETAILS, exactly as written. No extras. No invented services.\n\n`
        : `navy band — render decorative circular icon badge graphics only; NO text captions or labels (no services provided).\n\n`) +
      (d.offer
        ? `SPECIAL OFFER (gold/yellow dashed-border coupon box, lower-right): offer text bold dark navy, large. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape)
    )
    : templateKey === "purple-sage"
    ? (
      "LAYOUT — reproduce Purple Sage template zones exactly:\n\n" +
      "DECORATIVE ACCENTS (top-left corner: large muted purple circle + dot grid; left side: sage green botanical leaf sprig — structural, NOT logo or text zones).\n\n" +
      (hasLogo
        ? `LOGO (IMAGE ${logoImg} placed inside or beside the white/cream rounded-rect headline panel).\n\n`
        : "") +
      `HEADLINE (large white/cream rounded-rect panel, upper-left): business name bold condensed all-caps sans-serif, very large, dark purple/near-black. Each word once.` +
      (d.tagline ? ` Tagline in clean italic script below, dark purple.` : "") + "\n\n" +
      "BRUSH STROKES (structural, no text): sweeping muted purple paint brush stroke below headline panel; sage green brush stroke in lower area.\n\n" +
      "HERO PHOTO (upper-right, large circular frame in sage green ring border):\n" +
      (hasPhoto
        ? `  Composite IMAGE 2 — fill circular frame, sage green ring border, no hard rectangular edges. Cinematic lighting.\n\n`
        : `  Generate a photorealistic organic interior or lifestyle scene. Circular frame with sage green ring border.\n\n`) +
      "SECONDARY PHOTOS (lower-right, two smaller overlapping circles): generate two circular-cropped photos — kitchen/dining scene and outdoor patio/garden. Each perfectly circular.\n\n" +
      `SERVICE BADGES (middle row): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} muted sage green circular icon badge${menuCount !== 1 ? "s" : ""} with thin vertical dividers — one per service in BUSINESS DETAILS, exactly as written. No extras. No invented services.\n\n`
        : `four decorative sage green circular icon badge graphics (professional, award, team, shield) with thin vertical dividers; NO text labels.\n\n`) +
      `SERVICE TILES (below badges row): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} cream rounded-rect tile${menuCount !== 1 ? "s" : ""} — one per service, label text inside. No extras.\n\n`
        : `four cream rounded-rect tile shapes; NO text labels.\n\n`) +
      "PURPLE WAVE BAND (lower section): muted lavender-purple organic wave/blob shape spanning full width.\n\n" +
      (d.offer
        ? `SPECIAL OFFER (dashed coupon box, lower area): offer text bold dark, fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape)
    )
    : templateKey === "sage-organic"
    ? (
      "LAYOUT — reproduce Sage Organic template zones exactly:\n\n" +
      "BOTANICAL ACCENT (large dark olive green circle with botanical leaf sprig illustrations, top-left corner — decorative, NOT a logo zone).\n\n" +
      (hasLogo
        ? `LOGO (IMAGE ${logoImg} placed inside or beside the white/cream rounded-rect headline panel).\n\n`
        : "") +
      `HEADLINE (large white/cream rounded-rect panel, upper-left): business name bold condensed all-caps sans-serif, very large, dark olive green. Each word once.` +
      (d.tagline ? ` Tagline in clean italic script below, dark olive green.` : "") + "\n\n" +
      "BRUSH STROKE (sweeping dark olive green paint brush stroke below the headline panel — structural element, NO text).\n\n" +
      "HERO PHOTO (upper-right, curved wave organic cutout):\n" +
      (hasPhoto
        ? `  Composite IMAGE 2 — fill upper-right curved wave zone, blend left/bottom edges naturally into cream bg, no hard rectangular border. Cinematic lighting.\n\n`
        : `  Generate a photorealistic organic interior or garden/outdoor service scene. Fill upper-right curved zone, blend naturally into cream bg.\n\n`) +
      `SERVICE BADGES (middle row): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} dark olive green circular icon badge${menuCount !== 1 ? "s" : ""} with thin vertical dividers — one per service in BUSINESS DETAILS, exactly as written. Dark olive badge + white icon graphic. No extras. No invented services.\n\n`
        : `four decorative dark olive circular icon badge graphics (award, people, handshake, shield) with thin vertical dividers; NO text labels.\n\n`) +
      `SERVICE TILES (below badges row): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} cream rounded-rect tile${menuCount !== 1 ? "s" : ""} — one per service, label text inside. No extras.\n\n`
        : `four cream rounded-rect tile shapes; NO text labels.\n\n`) +
      "PHOTO COLLAGE STRIP (dark olive wave/brush-stroke band, lower section): three equal-width landscape photos side by side — interior living space, café/shop scene, outdoor garden/service work.\n\n" +
      (d.offer
        ? `COUPON (kraft paper/cardboard textured rectangle with dashed stitched border and scissors icon, lower-right): offer text bold dark, fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape)
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
        : `  Generate a photorealistic home exterior or professional landscaping scene. Fill upper-right zone, blend naturally into cream bg.\n\n`) +
      "CIRCULAR PHOTOS (middle-right area, three overlapping circles): " +
      `generate three circular-cropped photos — interior living space, kitchen or work area, outdoor service/garden scene. Each perfectly circular with subtle gold ring accent.\n\n` +
      `SERVICE TILES (wide dark navy lower area): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} equal rounded-rect service tile${menuCount !== 1 ? "s" : ""} — one per service in BUSINESS DETAILS, exactly as written. Each tile: circular dark navy icon badge on top (house, tools, leaf, or people icon), service name below inside cream card. No extras. No invented services.\n\n`
        : `navy area — render four decorative rounded-rect tile shapes with circular dark navy icon badge graphics only; NO text labels (no services provided).\n\n`) +
      (d.offer
        ? `SPECIAL OFFER (dashed coupon box, lower area): offer text bold dark navy, large. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape)
    )
    : templateKey === "surprise-me"
    ? (
      "DESIGN BRIEF — create a completely ORIGINAL postcard ad. Full creative freedom:\n\n" +
      `STYLE THEME — "${selectedTheme.name}" (mood: ${selectedTheme.mood}):\n` +
      `  PALETTE: ${selectedTheme.palette}\n` +
      `  TYPOGRAPHY: ${selectedTheme.typography}\n` +
      `  LAYOUT: ${selectedTheme.layoutPortrait}\n\n` +
      "DO NOT recreate any existing LocalSpot template style:\n" +
      "  Parchment/rustic | Chalkboard/bistro | Forest-green contractor | Navy/gold home services | Teal/sage wellness | Cream/navy circular-photo elegance | Sage/olive botanical kraft | Lavender/sage circular-photo lifestyle\n\n" +
      "VISUAL RULES (mandatory):\n" +
      "  • Fill 100% of the canvas to every edge — no blank areas, no outer border, no drop shadow outside the ad.\n" +
      "  • No hard rectangular photo borders — mask/blend edges with organic shapes, gradients, or diagonal cuts.\n" +
      "  • Background: gradient, texture, or layered wash — never flat solid color.\n" +
      "  • Three depth planes: (1) textured bg, (2) graphic mid-layer shapes, (3) foreground text with shadows/glows.\n" +
      "  • All text must be clearly readable: use opaque backing panel, heavy drop shadow, or solid-fill text zone — subtle 1px shadows are insufficient.\n\n" +
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
      buildFooterZone(d.phone || "", fullAddress, isLandscape) +
      "QUALITY STANDARD:\n" +
      "  ✗ No flat solid-color backgrounds | ✗ No rectangular photo frames | ✗ No text on bare flat color\n" +
      "  ✗ No filler text in coupon area (no 'Admit One Offer', 'Stub No.', etc.)\n" +
      "  ✓ Three depth planes | ✓ Hero photo with cinematic edge blending | ✓ Print-ready 300 DPI sharpness\n\n"
    )
    : templateKey === "health-wellness"
    ? (
      "LAYOUT — reproduce Health & Wellness template zones exactly:\n\n" +
      "HERO PHOTOS (upper section, inside organic teal blob shapes): " +
      (hasPhoto
        ? `composite IMAGE 2 into upper-right organic teal blob — no hard border, natural edges blending into teal shape. Generate a second complementary wellness/clinic image for the upper-left blob.\n\n`
        : `generate two photorealistic clinic/wellness images — one per upper blob zone. No rectangular borders.\n\n`) +
      `HEADLINE (center, large rounded-rect white panel): business name bold condensed all-caps sans-serif, very large, dark teal/near-black. Each word exactly once.\n\n` +
      (d.tagline ? `TAGLINE (teal pill-shaped bar below white panel): tagline in clean white sans-serif, centered.\n\n` : "") +
      `SERVICE PANELS (middle section): ` +
      (menuCount > 0
        ? `EXACTLY ${menuCount} equal-width panel${menuCount !== 1 ? "s" : ""} — one per service in BUSINESS DETAILS, exactly as written. Each panel: circular teal badge + white icon on top, white rounded-rect text box below. No extras. No invented services. No offer in service panels.\n\n`
        : `service panel row — render the structural panel shapes with circular teal icon badge graphics only; NO text labels (no services provided).\n\n`) +
      "LOWER PHOTOS (organic blob shapes): reception or waiting-room scene in left blob; teal stethoscope/medical prop on dark teal circular blob right.\n\n" +
      (d.offer
        ? `SPECIAL OFFER: offer text prominently in teal or dark text in an available white-space area. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape)
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
        : `generate a photorealistic, appetizing hero image. Blend naturally into dark brush-stroke background, no hard border.\n\n`) +
      (menuCount > 0
        ? `MENU/SERVICES (left-center area, orange circular checkmark badges): EXACTLY ${menuCount} item${menuCount !== 1 ? "s" : ""} — one per service/item in BUSINESS DETAILS, exactly as written. Prices right-aligned if present. No extras. No invented items. Do NOT add a row to fill empty template slots.\n\n`
        : `no services provided — leave the service list area empty; do not render any badge labels or invented items.\n\n`) +
      (d.offer
        ? `SPECIAL OFFER (dashed coupon box): offer text bold inside dashed rectangle. Fine print smaller below. No QR inside coupon.\n\n`
        : "") +
      buildFooterZone(d.phone || "", fullAddress, isLandscape)
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
    "STYLE: high-end editorial advertising. Cinematic photography, rich vibrant color, professional lighting. Bold confident typography hierarchy. Premium color palette — deep, saturated, controlled. Print-ready sharpness throughout.\n\n" +
    "STRICT FIDELITY — ABSOLUTE: Every word of text on this ad must come from BUSINESS DETAILS. Do NOT invent, add, hallucinate, or paraphrase any text, service name, menu item, or label not present in BUSINESS DETAILS. " +
    "If a field is '(none)', omit that element entirely. If no services are listed, render no service text labels anywhere on the ad. " +
    "CRITICAL: All text must appear exactly as specified — zero tolerance for errors on phone numbers, prices, business name, or address. " +
    (fullAddress !== "(none)" ? `Address "${fullAddress}" MUST appear in the footer. ` : "") +
    "No website URL text anywhere. Business name: each word appears exactly once across the entire ad. " +
    "Each menu/service item exactly once. Special offer in its own distinct coupon zone — never listed alongside menu items. " +
    "PRICES: If a menu or service item has no price, do NOT add one — never invent or append a dollar amount to any item unless that exact price appears verbatim in BUSINESS DETAILS.\n\n" +
    "BUSINESS DETAILS:\n" + businessBlock
  );
}
