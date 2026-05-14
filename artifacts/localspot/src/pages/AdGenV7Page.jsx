import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { Stage, Layer, Image as KImage, Rect, Text, Line, Group } from "react-konva";
import QRCode from "qrcode";
import { INDUSTRIES, INDUSTRY_LIST } from "../industryAssets";

// ── Canvas dimensions (match parchment template aspect ratio 1148:1371) ──────
const W = 480;
const H = 573;

// ── Canvas layout positions ───────────────────────────────────────────────────
const PH_X = 130, PH_Y = 0, PH_W = 350, PH_H = 458;        // photo region
const BN1_X = 120, BN1_Y = 11, BN1_W = 350;                  // headline row 1
const BN2_X = 43,  BN2_Y = 52, BN2_W = 427;                  // headline row 2 (script)
const TL_X = 7,    TL_Y = 120, TL_W = 110;                   // tagline
const MN_X = 50,   MN_Y = 281, MN_W = 228, MN_ROW = 44;     // menu rows
const MENU_NAME_W = 148, MENU_PRICE_W = 52;
const CP_X = 192,  CP_Y = 315, CP_W = 276, CP_H = 138;      // coupon box
const FT_X = 58,   FT_Y = 476;                               // footer
const QR_S = 58,   QR_X = 415, QR_Y = 504;                  // QR code
const LG_X = 7,    LG_Y = 7,   LG_S = 36;                   // logo

const ACCENT_COLORS = [
  "#C8541A", "#7B1418", "#1a3d5c", "#166534",
  "#6B21A8", "#0e7490", "#92400e", "#374151",
];

// ── Measure text width via offscreen canvas ───────────────────────────────────
function measureText(text, fontSize, fontFamily, fontStyle = "normal") {
  const cv = document.createElement("canvas");
  const ctx = cv.getContext("2d");
  if (!ctx) return text.length * fontSize * 0.6;
  ctx.font = fontStyle + " " + fontSize + "px " + fontFamily;
  return ctx.measureText(text).width;
}

function fitFontSize(text, maxW, startSize, fontFamily, fontStyle = "normal", minSize = 8) {
  if (!text) return startSize;
  let size = startSize;
  while (size > minSize && measureText(text, size, fontFamily, fontStyle) > maxW) size--;
  return size;
}

// ── Load image URL → HTMLImageElement ─────────────────────────────────────────
function useKonvaImage(src) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    if (!src) { setImg(null); return; }
    const el = new window.Image();
    el.crossOrigin = "anonymous";
    el.onload = () => setImg(el);
    el.onerror = () => setImg(null);
    el.src = src;
  }, [src]);
  return img;
}

// ── Parse "Item Name $X.XX" → { name, price } ────────────────────────────────
function parseMenuItem(str) {
  if (!str) return { name: "", price: "" };
  const m = str.match(/^(.+?)\s+(\$[\d.,]+[+]?)$/);
  return m ? { name: m[1].trim(), price: m[2].trim() } : { name: str.trim(), price: "" };
}

// ── Polished result lightbox ──────────────────────────────────────────────────
function PolishedOverlay({ imageUrl, onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.88)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "#fff", borderRadius: 14, overflow: "hidden",
        maxWidth: 560, width: "100%", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
      }}>
        <div style={{
          padding: "12px 16px", display: "flex", justifyContent: "space-between",
          alignItems: "center", borderBottom: "1px solid #e5e7eb",
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#111" }}>AI-Polished Version</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>All layers blended by gpt-image-1</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af", lineHeight: 1 }}>✕</button>
        </div>
        <img src={imageUrl} alt="polished ad" style={{ width: "100%", display: "block", maxHeight: "70vh", objectFit: "contain" }} />
        <div style={{ padding: "12px 16px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={() => { const a = document.createElement("a"); a.href = imageUrl; a.download = "ad-polished.png"; a.click(); }}
            style={{ background: "#7B1418", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
          >↓ Download Polished</button>
          <button
            onClick={onClose}
            style={{ background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
          >Keep Original</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdGenV7Page() {
  const [, navigate] = useLocation();

  // form state
  const [industry, setIndustry]         = useState("Pizza Restaurant");
  const [bizLine1, setBizLine1]         = useState("");
  const [bizLine2, setBizLine2]         = useState("");
  const [tagline, setTagline]           = useState("");
  const [phone, setPhone]               = useState("");
  const [address, setAddress]           = useState("");
  const [city, setCity]                 = useState("Clarkesville, GA");
  const [website, setWebsite]           = useState("");
  const [menuItems, setMenuItems]       = useState(["", "", "", ""]);
  const [offerAmount, setOfferAmount]   = useState("");
  const [offerItem, setOfferItem]       = useState("");
  const [offerFine, setOfferFine]       = useState("1 per visit · with this postcard");
  const [accentColor, setAccentColor]   = useState("#C8541A");

  // hero photo
  const [heroTab, setHeroTab]           = useState("stock");
  const [heroSrc, setHeroSrc]           = useState("");
  const [heroPrompt, setHeroPrompt]     = useState("");

  // logo + QR
  const [logoSrc, setLogoSrc]           = useState("");
  const [qrDataUrl, setQrDataUrl]       = useState(null);

  // status
  const [generating, setGenerating]         = useState(false);
  const [generatingHero, setGeneratingHero] = useState(false);
  const [polishing, setPolishing]           = useState(false);
  const [polishedUrl, setPolishedUrl]       = useState(null);
  const [error, setError]                   = useState("");

  const stageRef = useRef(null);

  // load images for canvas
  const templateImg = useKonvaImage("/assets/template-rustic-parchment.png");
  const heroImg     = useKonvaImage(heroSrc || null);
  const logoImg     = useKonvaImage(logoSrc || null);
  const qrImg       = useKonvaImage(qrDataUrl);

  // Load Google Fonts for Konva text rendering
  useEffect(() => {
    const ID = "adgen-v7-gfonts";
    if (!document.getElementById(ID)) {
      const link = document.createElement("link");
      link.id = ID;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Pacifico" +
        "&family=Dancing+Script:wght@700&family=Montserrat:wght@700;900" +
        "&family=DM+Sans:wght@400;500&display=swap";
      document.head.appendChild(link);
    }
    document.fonts.ready.then(() => stageRef.current?.batchDraw());
  }, []);

  // Seed menu items + first stock photo on industry change
  useEffect(() => {
    const ind = INDUSTRIES[industry];
    if (ind?.menu) setMenuItems([...ind.menu.slice(0, 4), "", "", "", ""].slice(0, 4));
    if (ind?.photos?.[0] && heroTab === "stock") setHeroSrc(ind.photos[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [industry]);

  // Generate QR code data URL client-side (no CORS issues in canvas export)
  useEffect(() => {
    if (!website) { setQrDataUrl(null); return; }
    const url = /^https?:\/\//i.test(website) ? website : "https://" + website;
    QRCode.toDataURL(url, { width: 120, margin: 2, color: { dark: "#111111", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [website]);

  // ── Auto-fit font sizes ───────────────────────────────────────────────────
  const hn1Size = useMemo(() =>
    fitFontSize((bizLine1 || "BUSINESS NAME").toUpperCase(), BN1_W - 4, 46, "'Bebas Neue'"),
    [bizLine1]);

  const hn2Size = useMemo(() =>
    fitFontSize(bizLine2 || "Business Name", BN2_W - 4, 50, "Pacifico"),
    [bizLine2]);

  const cpAmtSize = useMemo(() =>
    fitFontSize((offerAmount || "FREE").toUpperCase(), CP_W - 20, 34, "'Bebas Neue'"),
    [offerAmount]);

  const parsedMenu = useMemo(() => menuItems.map(parseMenuItem), [menuItems]);

  const stockPhotos = useMemo(() => INDUSTRIES[industry]?.photos ?? [], [industry]);

  const ind = INDUSTRIES[industry] || INDUSTRIES[INDUSTRY_LIST[0]];

  // ── Event handlers ────────────────────────────────────────────────────────
  const handleHeroUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setHeroSrc(ev.target?.result);
    reader.readAsDataURL(file);
  }, []);

  const handleLogoUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setLogoSrc(ev.target?.result);
    reader.readAsDataURL(file);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!bizLine1) { setError("Enter a business name first."); return; }
    setError("");
    setGenerating(true);
    try {
      const resp = await fetch("/api/ad-gen/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry, bizLine1, bizLine2, tagline, phone, address, city,
          menu: menuItems.filter(Boolean), offerAmount, offerItem, offerFine, accentColor,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Layout generation failed");
      const L = data.layout;
      if (L.headline1) setBizLine1(L.headline1);
      if (L.headline2) setBizLine2(L.headline2);
      if (L.tagline)   setTagline(L.tagline);
      if (L.menu?.length) setMenuItems(L.menu.map((m) => m.name + (m.price ? " " + m.price : "")));
      if (L.offer?.amount) setOfferAmount(L.offer.amount);
      if (L.offer?.item)   setOfferItem(L.offer.item);
      if (L.offer?.fine)   setOfferFine(L.offer.fine);
      if (L.heroPrompt)    setHeroPrompt(L.heroPrompt);

      // Auto-generate hero image if AI tab is active
      if (heroTab === "ai" && L.heroPrompt) {
        setGeneratingHero(true);
        try {
          const hr = await fetch("/api/ad-gen/hero", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: L.heroPrompt }),
          });
          const hd = await hr.json();
          if (hr.ok && hd.imageUrl) setHeroSrc(hd.imageUrl);
        } catch { /* non-fatal */ } finally {
          setGeneratingHero(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [industry, bizLine1, bizLine2, tagline, phone, address, city, menuItems, offerAmount, offerItem, offerFine, accentColor, heroTab]);

  const handleGenerateHeroOnly = useCallback(async () => {
    const p = heroPrompt ||
      ("Cinematic commercial photography for a " + industry +
       " business, warm golden-hour lighting, food/product hero shot, " +
       "intentionally empty left 30% of frame, shallow depth of field, photorealistic");
    setGeneratingHero(true);
    setError("");
    try {
      const resp = await fetch("/api/ad-gen/hero", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Hero generation failed");
      setHeroSrc(data.imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hero generation failed");
    } finally {
      setGeneratingHero(false);
    }
  }, [heroPrompt, industry]);

  const handlePolish = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) return;
    setPolishing(true);
    setError("");
    try {
      const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: "image/png" });
      const resp = await fetch("/api/ad-gen/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: dataUrl }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Polish failed");
      setPolishedUrl(data.imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Polish failed");
    } finally {
      setPolishing(false);
    }
  }, []);

  const handleDownload = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    try {
      const dataUrl = stage.toDataURL({ pixelRatio: 3, mimeType: "image/png" });
      const a = document.createElement("a");
      a.download = (bizLine1 || "my-ad").replace(/\s+/g, "-").toLowerCase() + ".png";
      a.href = dataUrl;
      a.click();
    } catch {
      setError("Download failed. This can happen when using stock photos with CORS restrictions. Try uploading your own photo instead.");
    }
  }, [bizLine1]);

  // ── Konva Stage ───────────────────────────────────────────────────────────
  const konvaCanvas = (
    <Stage width={W} height={H} ref={stageRef} style={{ display: "block" }}>
      <Layer>
        {/* 1 — Template background */}
        {templateImg && <KImage x={0} y={0} width={W} height={H} image={templateImg} />}

        {/* 2 — Hero photo (clipped to photo region) */}
        {heroImg && (
          <Group clipX={PH_X} clipY={PH_Y} clipWidth={PH_W} clipHeight={PH_H}>
            <KImage x={PH_X} y={PH_Y} width={PH_W} height={PH_H} image={heroImg} />
          </Group>
        )}

        {/* 3 — Left gradient blend (softens left edge of photo into parchment) */}
        {heroImg && (
          <Rect
            x={PH_X} y={PH_Y} width={90} height={PH_H}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: 90, y: 0 }}
            fillLinearGradientColorStops={[0, "rgba(236,220,188,0.72)", 1, "rgba(236,220,188,0)"]}
          />
        )}

        {/* 4 — Bottom gradient blend (darkens photo bottom for text) */}
        {heroImg && (
          <Rect
            x={PH_X} y={Math.round(PH_H * 0.44)} width={PH_W} height={Math.round(PH_H * 0.56)}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: 0, y: Math.round(PH_H * 0.56) }}
            fillLinearGradientColorStops={[0, "rgba(0,0,0,0)", 1, "rgba(0,0,0,0.78)"]}
          />
        )}

        {/* 5 — Tick marks beside headline */}
        <Line
          points={[BN1_X - 8, BN1_Y + 7, BN1_X - 8, BN1_Y + hn1Size - 3]}
          stroke={accentColor} strokeWidth={2.5}
        />
        <Line
          points={[BN1_X - 14, BN1_Y + 9, BN1_X - 14, BN1_Y + hn1Size - 5]}
          stroke={accentColor + "66"} strokeWidth={1.5}
        />

        {/* 6 — Headline row 1 (Bebas Neue) */}
        <Text
          x={BN1_X} y={BN1_Y} width={BN1_W}
          text={(bizLine1 || "YOUR BUSINESS").toUpperCase()}
          fontFamily="'Bebas Neue', 'Arial Narrow', sans-serif"
          fontSize={hn1Size}
          fill="#1C1B1A"
          rotation={-1.5}
        />

        {/* 7 — Headline row 2 (Pacifico script) */}
        {bizLine2 ? (
          <Text
            x={BN2_X} y={BN2_Y} width={BN2_W}
            text={bizLine2}
            fontFamily="Pacifico, cursive"
            fontSize={hn2Size}
            fill={accentColor}
            rotation={-2}
          />
        ) : null}

        {/* 8 — Tagline gradient rule */}
        <Rect
          x={TL_X + 4} y={TL_Y - 8} width={TL_W - 8} height={1.5}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: TL_W - 8, y: 0 }}
          fillLinearGradientColorStops={[0, "rgba(0,0,0,0)", 0.5, accentColor + "cc", 1, "rgba(0,0,0,0)"]}
        />

        {/* 9 — Tagline (Dancing Script) */}
        <Text
          x={TL_X} y={TL_Y} width={TL_W}
          text={tagline || (ind?.taglines?.[0] ?? "Quality Service")}
          fontFamily="'Dancing Script', cursive"
          fontStyle="bold"
          fontSize={17}
          fill="#2d1a06"
          align="center"
          wrap="word"
          lineHeight={1.2}
        />

        {/* 10 — Menu rows (4 items with dotted leaders) */}
        {parsedMenu.map((item, i) => {
          if (!item.name) return null;
          const ry = MN_Y + i * MN_ROW + Math.round((MN_ROW - 11) / 2);
          const dotsX1 = MN_X + MENU_NAME_W + 4;
          const dotsX2 = MN_X + MN_W - MENU_PRICE_W - 4;
          return (
            <Group key={i}>
              <Text
                x={MN_X} y={ry} width={MENU_NAME_W}
                text={item.name.toUpperCase()}
                fontFamily="Montserrat, 'Arial Narrow', sans-serif"
                fontStyle="bold"
                fontSize={10}
                fill="#1C1B1A"
                ellipsis
              />
              {dotsX2 > dotsX1 + 8 && (
                <Line
                  points={[dotsX1, ry + 8, dotsX2, ry + 8]}
                  stroke={accentColor + "55"} strokeWidth={1} dash={[2, 3]}
                />
              )}
              {item.price ? (
                <Text
                  x={MN_X + MN_W - MENU_PRICE_W} y={ry} width={MENU_PRICE_W}
                  text={item.price}
                  fontFamily="Montserrat, sans-serif"
                  fontStyle="bold"
                  fontSize={10}
                  fill={accentColor}
                  align="right"
                />
              ) : null}
            </Group>
          );
        })}

        {/* 11 — Coupon box */}
        {offerAmount ? (
          <Group>
            <Rect
              x={CP_X} y={CP_Y} width={CP_W} height={CP_H}
              fill="rgba(0,0,0,0.22)"
              stroke={accentColor} strokeWidth={1.5}
              dash={[6, 3]}
              cornerRadius={4}
            />
            <Text
              x={CP_X} y={CP_Y + 14} width={CP_W}
              text={offerAmount.toUpperCase()}
              fontFamily="'Bebas Neue', 'Arial Narrow', sans-serif"
              fontSize={cpAmtSize}
              fill="#fff"
              align="center"
            />
            {offerItem ? (
              <Text
                x={CP_X} y={CP_Y + 14 + cpAmtSize + 4} width={CP_W}
                text={offerItem}
                fontFamily="Pacifico, cursive"
                fontSize={15}
                fill={accentColor}
                align="center"
                rotation={-1.5}
              />
            ) : null}
            <Text
              x={CP_X + 8} y={CP_Y + CP_H - 17} width={CP_W - 16}
              text={offerFine || "1 per visit · with this postcard"}
              fontFamily="'DM Sans', sans-serif"
              fontSize={8}
              fill="rgba(255,255,255,0.55)"
              align="center"
            />
          </Group>
        ) : null}

        {/* 12 — Footer phone */}
        {phone ? (
          <Text
            x={FT_X} y={FT_Y}
            text={phone}
            fontFamily="'Bebas Neue', 'Arial Narrow', sans-serif"
            fontSize={22}
            fill="#fff"
            letterSpacing={1}
          />
        ) : null}
        {(address || city) ? (
          <Text
            x={FT_X} y={FT_Y + 25} width={W - FT_X - QR_S - 16}
            text={[address, city].filter(Boolean).join("  •  ")}
            fontFamily="'DM Sans', sans-serif"
            fontSize={8}
            fill="rgba(255,255,255,0.60)"
          />
        ) : null}

        {/* 13 — Logo (optional) */}
        {logoImg ? (
          <Group>
            <Rect
              x={LG_X - 2} y={LG_Y - 2} width={LG_S + 4} height={LG_S + 4}
              fill="#fff" cornerRadius={5} opacity={0.92}
            />
            <KImage x={LG_X} y={LG_Y} width={LG_S} height={LG_S} image={logoImg} cornerRadius={3} />
          </Group>
        ) : null}

        {/* 14 — QR code (generated client-side — no CORS issues) */}
        {qrImg ? (
          <Group>
            <Rect
              x={QR_X - 3} y={QR_Y - 3} width={QR_S + 6} height={QR_S + 6}
              fill="#fff" cornerRadius={4}
            />
            <KImage x={QR_X} y={QR_Y} width={QR_S} height={QR_S} image={qrImg} />
          </Group>
        ) : null}
      </Layer>
    </Stage>
  );

  // ── Styles ────────────────────────────────────────────────────────────────
  const inp = {
    width: "100%", padding: "7px 10px", border: "1.5px solid #e5e7eb",
    borderRadius: 7, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
    boxSizing: "border-box", outline: "none", color: "#111",
  };
  const sectionLabel = {
    fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
    textTransform: "uppercase", color: "#9ca3af", marginBottom: 6,
  };
  const smallLabel = {
    fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 3, display: "block",
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#f5f0eb", fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e5e7eb",
        padding: "11px 24px", display: "flex", alignItems: "center", gap: 12,
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <button
          onClick={() => navigate("/")}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}
        >← Back</button>
        <div style={{ width: 1, height: 18, background: "#e5e7eb" }} />
        <div style={{ fontWeight: 800, fontSize: 15, color: "#111" }}>AI Ad Studio</div>
        <div style={{
          background: "linear-gradient(135deg,#7B1418,#C8541A)",
          color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
          padding: "2px 8px", borderRadius: 99, textTransform: "uppercase",
        }}>v7 · Canvas + Polish</div>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "340px 1fr",
        gap: 0, maxWidth: 1080, margin: "0 auto", padding: "20px 16px",
        alignItems: "start",
      }}>
        {/* ── FORM PANEL ── */}
        <div style={{
          background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
          padding: "20px 16px", display: "flex", flexDirection: "column", gap: 18,
          position: "sticky", top: 60, maxHeight: "calc(100vh - 80px)", overflowY: "auto",
        }}>

          {/* Industry */}
          <div>
            <div style={sectionLabel}>Business Type</div>
            <select value={industry} onChange={e => setIndustry(e.target.value)} style={inp}>
              {INDUSTRY_LIST.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>

          {/* Business Name */}
          <div>
            <div style={sectionLabel}>Business Name</div>
            <label style={smallLabel}>Line 1 (Headline — Bebas Neue)</label>
            <input value={bizLine1} onChange={e => setBizLine1(e.target.value)}
                   placeholder="Tony's Pizza" style={inp} />
            <div style={{ height: 7 }} />
            <label style={smallLabel}>Line 2 (Script accent, optional — Pacifico)</label>
            <input value={bizLine2} onChange={e => setBizLine2(e.target.value)}
                   placeholder="Since 1985" style={inp} />
          </div>

          {/* Tagline */}
          <div>
            <div style={sectionLabel}>Tagline</div>
            <input value={tagline} onChange={e => setTagline(e.target.value)}
                   placeholder="AI will craft one for you" style={inp} />
          </div>

          {/* Hero Photo */}
          <div>
            <div style={sectionLabel}>Hero Photo</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
              {[["stock","📚 Library"],["upload","📁 Upload"],["ai","✨ AI Gen"]].map(([t,lbl]) => (
                <button key={t} onClick={() => setHeroTab(t)} style={{
                  flex: 1, padding: "6px 4px", border: "none", borderRadius: 6, cursor: "pointer",
                  fontSize: 11, fontWeight: 700,
                  background: heroTab === t ? "#7B1418" : "#f3f4f6",
                  color: heroTab === t ? "#fff" : "#6b7280",
                }}>{lbl}</button>
              ))}
            </div>

            {heroTab === "stock" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 5 }}>
                {stockPhotos.slice(0, 4).map((url, i) => (
                  <img key={i} src={url} alt="" onClick={() => setHeroSrc(url)} style={{
                    width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 6, cursor: "pointer",
                    border: heroSrc === url ? "2.5px solid #C8541A" : "2.5px solid transparent",
                  }} />
                ))}
              </div>
            )}

            {heroTab === "upload" && (
              <label style={{
                display: "block", border: "2px dashed #d1d5db", borderRadius: 8,
                textAlign: "center", cursor: "pointer", overflow: "hidden",
                background: "#f9fafb", minHeight: 80,
              }}>
                <input type="file" accept="image/*" onChange={handleHeroUpload} style={{ display: "none" }} />
                {heroSrc && heroTab === "upload"
                  ? <img src={heroSrc} alt="" style={{ width: "100%", maxHeight: 130, objectFit: "cover", display: "block" }} />
                  : <div style={{ padding: "24px 12px", fontSize: 12, color: "#9ca3af" }}>Click to upload hero photo</div>}
              </label>
            )}

            {heroTab === "ai" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <textarea
                  value={heroPrompt}
                  onChange={e => setHeroPrompt(e.target.value)}
                  placeholder="Describe the photo, or click Generate Ad to auto-create one"
                  rows={3}
                  style={{ ...inp, resize: "vertical", lineHeight: 1.5 }}
                />
                <button
                  onClick={handleGenerateHeroOnly}
                  disabled={generatingHero}
                  style={{
                    padding: "8px", background: generatingHero ? "#9ca3af" : "#1a3d5c",
                    color: "#fff", border: "none", borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: "pointer",
                  }}
                >{generatingHero ? "Generating photo…" : "Generate Photo Only"}</button>
                {heroSrc && (
                  <img src={heroSrc} alt="" style={{ width: "100%", borderRadius: 8, maxHeight: 120, objectFit: "cover" }} />
                )}
              </div>
            )}
          </div>

          {/* Logo */}
          <div>
            <div style={sectionLabel}>Logo (optional)</div>
            <label style={{
              display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              padding: "8px 10px", border: "1.5px dashed #d1d5db", borderRadius: 8, background: "#f9fafb",
            }}>
              <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
              {logoSrc
                ? <img src={logoSrc} alt="logo" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} />
                : <div style={{ width: 40, height: 40, background: "#e5e7eb", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#9ca3af" }}>+</div>
              }
              <span style={{ fontSize: 12, color: "#6b7280" }}>{logoSrc ? "Change logo" : "Upload your logo"}</span>
            </label>
          </div>

          {/* Contact Info */}
          <div>
            <div style={sectionLabel}>Contact Info</div>
            <label style={smallLabel}>Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)}
                   placeholder="(706) 555-1234" style={inp} />
            <div style={{ height: 7 }} />
            <label style={smallLabel}>Street Address</label>
            <input value={address} onChange={e => setAddress(e.target.value)}
                   placeholder="123 Main St" style={inp} />
            <div style={{ height: 7 }} />
            <label style={smallLabel}>City / State</label>
            <input value={city} onChange={e => setCity(e.target.value)}
                   placeholder="Clarkesville, GA" style={inp} />
          </div>

          {/* Website / QR */}
          <div>
            <div style={sectionLabel}>Website → QR Code</div>
            <input value={website} onChange={e => setWebsite(e.target.value)}
                   placeholder="yoursite.com" style={inp} />
            {qrDataUrl && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <img src={qrDataUrl} alt="QR preview" style={{ width: 48, height: 48, borderRadius: 4, border: "1px solid #e5e7eb" }} />
                <span style={{ fontSize: 11, color: "#6b7280" }}>QR code appears on the canvas</span>
              </div>
            )}
          </div>

          {/* Menu / Services */}
          <div>
            <div style={sectionLabel}>Menu / Services (up to 4)</div>
            {menuItems.map((item, i) => (
              <div key={i} style={{ marginBottom: 5 }}>
                <input
                  value={item}
                  onChange={e => setMenuItems(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                  placeholder={`Item ${i + 1}  (e.g. Large Pizza $14.99)`}
                  style={inp}
                />
              </div>
            ))}
          </div>

          {/* Special Offer */}
          <div>
            <div style={sectionLabel}>Special Offer</div>
            <label style={smallLabel}>Offer Headline</label>
            <input value={offerAmount} onChange={e => setOfferAmount(e.target.value)}
                   placeholder="$5 OFF" style={inp} />
            <div style={{ height: 7 }} />
            <label style={smallLabel}>Item / Description</label>
            <input value={offerItem} onChange={e => setOfferItem(e.target.value)}
                   placeholder="Any Large Order" style={inp} />
            <div style={{ height: 7 }} />
            <label style={smallLabel}>Fine Print</label>
            <input value={offerFine} onChange={e => setOfferFine(e.target.value)} style={inp} />
          </div>

          {/* Accent Color */}
          <div>
            <div style={sectionLabel}>Accent Color</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ACCENT_COLORS.map(c => (
                <button key={c} onClick={() => setAccentColor(c)} style={{
                  width: 28, height: 28, borderRadius: "50%", background: c,
                  border: "none", cursor: "pointer",
                  outline: accentColor === c ? "2.5px solid #111" : "2.5px solid transparent",
                  outlineOffset: 2,
                }} />
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating || generatingHero}
            style={{
              width: "100%", padding: "11px 0",
              background: (generating || generatingHero) ? "#9ca3af" : "#7B1418",
              color: "#fff", border: "none", borderRadius: 9,
              fontWeight: 800, fontSize: 14, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {(generating || generatingHero) ? "Generating…" : "✦ Generate with AI"}
          </button>

          {error && (
            <div style={{
              background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8,
              padding: "9px 12px", fontSize: 12, color: "#991b1b", lineHeight: 1.5,
            }}>{error}</div>
          )}
        </div>

        {/* ── PREVIEW PANEL ── */}
        <div style={{ paddingLeft: 24 }}>
          <div style={{
            background: "#181010", borderRadius: 16, padding: "22px 20px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
            boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
              color: "rgba(255,255,255,0.38)", textTransform: "uppercase",
            }}>Live Canvas Preview · {W} × {H} px</div>

            {/* Canvas */}
            <div style={{
              boxShadow: "0 16px 56px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.4)",
              borderRadius: 6, overflow: "hidden", maxWidth: "100%",
            }}>
              {konvaCanvas}
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8, width: "100%" }}>
              <button
                onClick={handlePolish}
                disabled={polishing}
                style={{
                  flex: 1, padding: "10px 0",
                  background: polishing ? "#6b7280" : "#92400e",
                  color: "#fff", border: "none", borderRadius: 8,
                  fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}
              >{polishing ? "Polishing…" : "✦ AI Polish"}</button>
              <button
                onClick={handleDownload}
                style={{
                  flex: 1, padding: "10px 0",
                  background: "#1a3d5c",
                  color: "#fff", border: "none", borderRadius: 8,
                  fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}
              >↓ Download 3×</button>
            </div>

            <div style={{
              fontSize: 10, color: "rgba(255,255,255,0.28)", textAlign: "center", lineHeight: 1.6,
            }}>
              Polish blends all canvas layers into a seamless AI-rendered image.<br />
              Download exports at 3× resolution (1440 × 1719 px).
            </div>

            {/* Hero generation status */}
            {generatingHero && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "rgba(255,255,255,0.07)", borderRadius: 8, padding: "8px 14px",
              }}>
                <div style={{
                  width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#C8541A", borderRadius: "50%",
                  animation: "adv7spin 0.8s linear infinite", flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>Generating hero image with AI…</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {polishedUrl && (
        <PolishedOverlay imageUrl={polishedUrl} onClose={() => setPolishedUrl(null)} />
      )}

      <style>{`
        @keyframes adv7spin { to { transform: rotate(360deg); } }
        @media (max-width: 700px) {
          .adv7-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
