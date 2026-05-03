import { useState, useRef, useCallback, useEffect } from "react";
import { INDUSTRIES, INDUSTRY_LIST } from "./industryAssets";
import { AdQRCode, InlineQRCode, hasQR, normalizeWebsite, generateSpotCode } from "./qrUtils";
import AdAssistant from "./AdAssistant";

// Tracks the live viewport width so the modal can flip between the
// three-column desktop layout and the tabbed mobile layout below 768px.
function useWindowWidth() {
  const [w, setW] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth
  );
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}
const MOBILE_BREAKPOINT = 768;

// ─────────────────────────────────────────────────────────────────────────────
//   EDITABLE TEXT — click any text in the preview to edit it inline
// ─────────────────────────────────────────────────────────────────────────────
function EditableText({ value, onChange, style = {}, multiline = false, placeholder = "Click to edit" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef();

  const startEdit = (e) => {
    e.stopPropagation();
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) onChange(draft.trim() || value);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !multiline) { e.preventDefault(); commit(); }
    if (e.key === "Escape") { setEditing(false); setDraft(value); }
  };

  const editHoverStyle = {
    cursor: "text",
    outline: editing ? "2px solid rgba(255,255,255,0.9)" : "none",
    outlineOffset: 2,
    borderRadius: 2,
    transition: "outline 0.1s",
    position: "relative",
  };

  if (editing) {
    const sharedInputStyle = {
      ...style,
      background: "rgba(0,0,0,0.55)",
      border: "none",
      outline: "2px solid #fff",
      outlineOffset: 2,
      borderRadius: 3,
      color: style.color || "#fff",
      padding: "1px 3px",
      width: "100%",
      fontFamily: style.fontFamily || "inherit",
      fontSize: style.fontSize || "inherit",
      fontWeight: style.fontWeight || "inherit",
      lineHeight: style.lineHeight || "inherit",
      letterSpacing: style.letterSpacing || "inherit",
      resize: "none",
      boxSizing: "border-box",
    };
    return multiline ? (
      <textarea ref={inputRef} value={draft} rows={2}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={handleKey}
        style={sharedInputStyle} />
    ) : (
      <input ref={inputRef} value={draft} type="text"
        onChange={e => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={handleKey}
        style={sharedInputStyle} />
    );
  }

  return (
    <div onClick={startEdit} title="Click to edit"
      style={{ ...style, ...editHoverStyle, display: style.display || "block" }}
      className="editable-text">
      {value || <span style={{ opacity: 0.4, fontStyle: "italic" }}>{placeholder}</span>}
      <span style={{
        position: "absolute", top: -8, right: -6,
        fontSize: 9, opacity: 0, transition: "opacity 0.15s",
        pointerEvents: "none", background: "rgba(0,0,0,0.7)",
        color: "#fff", borderRadius: 3, padding: "1px 3px",
      }} className="edit-hint">✎</span>
    </div>
  );
}

const EDITABLE_CSS = `.editable-text:hover { outline: 1.5px dashed rgba(255,255,255,0.5) !important; border-radius: 2px; } .editable-text:hover .edit-hint { opacity: 1 !important; } .editable-text { cursor: text !important; }`;

// ─────────────────────────────────────────────────────────────────────────────
//   AD GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

const AD_SIZES = {
  XL: { label: "Extra Large", price: 450, ratio: "4:5", width: 4, height: 5,   desc: "Hero spot · maximum impact" },
  L:  { label: "Large",       price: 350, ratio: "4:3", width: 4, height: 3,   desc: "Premium placement" },
  M:  { label: "Medium",      price: 250, ratio: "3:2", width: 3, height: 2,   desc: "Great visibility" },
  S:  { label: "Small",       price: 199, ratio: "2:2", width: 2, height: 2,   desc: "Affordable local reach" },
};

const TEMPLATE_STYLES = ["photo-bold", "split-clean", "magazine", "stamp"];

// ─── Helper: Logo Badge ───────────────────────────────────────────────────────
function LogoBadge({ logo, name, emoji, size = 40, bg = "rgba(255,255,255,0.15)", color = "#fff", border }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: bg,
      border: border || `2px solid ${color}55`,
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", flexShrink: 0,
    }}>
      {logo ? (
        <img src={logo} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ fontSize: size * 0.5 }}>{emoji}</span>
      )}
    </div>
  );
}

// ─── Helper: Coupon ───────────────────────────────────────────────────────────
function Coupon({ offer, fine, accent, scale = 1, dark = false, onEditOffer, onEditFine }) {
  if (!offer) return null;
  return (
    <div style={{
      border: `${1.5 * scale}px dashed ${accent}`, background: dark ? "rgba(0,0,0,0.3)" : `${accent}15`,
      borderRadius: 4 * scale, padding: `${5 * scale}px ${10 * scale}px ${4 * scale}px`,
      textAlign: "center", position: "relative", flexShrink: 0,
    }}>
      <div style={{ position: "absolute", top: -1, left: 0, right: 0, display: "flex", alignItems: "center", padding: `0 ${4 * scale}px` }}>
        <span style={{ fontSize: 9 * scale, lineHeight: 1, flexShrink: 0, opacity: 0.75 }}>✂</span>
        <div style={{ flex: 1, marginLeft: 3 * scale, borderTop: `${1.2 * scale}px dashed ${accent}88` }} />
        <span style={{ fontSize: 9 * scale, lineHeight: 1, flexShrink: 0, opacity: 0.75, transform: "scaleX(-1)", display: "inline-block" }}>✂</span>
      </div>
      {onEditOffer ? (
        <EditableText value={offer} onChange={onEditOffer}
          style={{ color: accent, fontWeight: 900, fontSize: 12 * scale, lineHeight: 1, letterSpacing: 0.3, marginTop: 3 * scale }} />
      ) : (
        <div style={{ color: accent, fontWeight: 900, fontSize: 12 * scale, lineHeight: 1, letterSpacing: 0.3, marginTop: 3 * scale }}>{offer}</div>
      )}
      {fine && onEditFine ? (
        <EditableText value={fine} onChange={onEditFine}
          style={{ color: dark ? "rgba(255,255,255,0.7)" : "#666", fontSize: 6.5 * scale, marginTop: 2, fontFamily: "sans-serif" }} />
      ) : fine ? (
        <div style={{ color: dark ? "rgba(255,255,255,0.7)" : "#666", fontSize: 6.5 * scale, marginTop: 2, fontFamily: "sans-serif" }}>{fine}</div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 1: PHOTO-BOLD
// ─────────────────────────────────────────────────────────────────────────────
function PhotoBoldTemplate({ data, sizeKey, onEdit }) {
  const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
  const photo = data.photo || ind.photos[0];
  const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
  const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.65;
  const edit = (field) => (val) => onEdit(field, val);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", fontFamily: "Georgia, serif" }}>
      <img src={photo} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${ind.colors.dark}99 0%, ${ind.colors.dark}55 40%, ${ind.colors.dark}f0 100%)` }} />

      <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: `${10 * fScale}px ${12 * fScale}px`, display: "flex", alignItems: "center", gap: 8 * fScale }}>
        <LogoBadge logo={data.logo} name={data.businessName} emoji={ind.emoji} size={36 * fScale} bg={`${ind.colors.primary}cc`} color="#fff" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <EditableText value={data.businessName} onChange={edit("businessName")}
            style={{ color: "#fff", fontWeight: 900, fontSize: 16 * fScale, lineHeight: 1.05, textShadow: "0 2px 8px rgba(0,0,0,0.7)" }} />
          {!isS && (
            <EditableText value={data.industry} onChange={edit("industry")}
              style={{ color: "rgba(255,255,255,0.85)", fontSize: 8 * fScale, marginTop: 2, fontFamily: "sans-serif", letterSpacing: 1, textTransform: "uppercase" }} />
          )}
        </div>
      </div>

      {/* Center block: tagline always shows (even on Small); menu + center
          phone are L/XL-only since they don't fit at smaller sizes. */}
      <div style={{ position: "absolute", top: isS ? "32%" : "38%", bottom: isS ? "32%" : "28%", left: 12 * fScale, right: 12 * fScale, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 * fScale, textAlign: "center" }}>
        <EditableText value={data.tagline || ind.taglines[0]} onChange={edit("tagline")}
          style={{ color: "#fff", fontWeight: 800, fontSize: (isXL ? 22 : isL ? 18 : isM ? 14 : 13) * fScale, lineHeight: 1.1, fontStyle: "italic", textShadow: "0 2px 12px rgba(0,0,0,0.8)", textAlign: "center" }} />
        {(isXL || isL) && (
          <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: `2px ${10 * fScale}px` }}>
            {((data.menuItems && data.menuItems.length > 0) ? data.menuItems : ind.menu).slice(0, 3).map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: "#fff", fontSize: 6 * fScale }}>●</span>
                <span style={{ color: "#fff", fontSize: 9 * fScale, fontFamily: "sans-serif", textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>{item}</span>
              </div>
            ))}
          </div>
        )}
        {(isXL || isL) && data.phone && (
          <EditableText value={data.phone} onChange={edit("phone")}
            style={{ color: "#fff", fontWeight: 900, fontSize: (isXL ? 24 : 20) * fScale, fontFamily: "sans-serif", textAlign: "center", letterSpacing: -0.5, textShadow: "0 2px 8px rgba(0,0,0,0.7)" }} />
        )}
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: `${8 * fScale}px ${12 * fScale}px`, display: "flex", flexDirection: "column", gap: 4 * fScale }}>
        {data.offer && <Coupon offer={data.offer} fine={data.offerFine} accent="#fff" scale={fScale} dark={true} onEditOffer={edit("offer")} onEditFine={edit("offerFine")} />}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", color: "rgba(255,255,255,0.85)", fontSize: 9 * fScale, fontFamily: "sans-serif" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {data.address && (
              <EditableText value={data.address} onChange={edit("address")} multiline
                style={{ color: "#fff", fontSize: 11 * fScale, fontWeight: 700, fontFamily: "sans-serif", lineHeight: 1.2, textShadow: "0 1px 3px rgba(0,0,0,0.6)" }} />
            )}
            {(isS || isM) && data.phone && (
              <EditableText value={data.phone} onChange={edit("phone")}
                style={{ color: "#fff", fontSize: 13 * fScale, fontWeight: 900, fontFamily: "sans-serif", whiteSpace: "nowrap" }} />
            )}
          </div>
          {hasQR(data) && (
            <AdQRCode website={normalizeWebsite(data.website)} spotCode={generateSpotCode(data.businessName, "current")}
              size={isXL ? 44 : isS ? 30 : 36} dark={true} scale={fScale * (isS ? 0.85 : 0.7)} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 2: SPLIT-CLEAN
// ─────────────────────────────────────────────────────────────────────────────
function SplitCleanTemplate({ data, sizeKey, onEdit }) {
  const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
  const photo = data.photo || ind.photos[0];
  const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
  const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.65;
  const isVertical = isXL;
  const edit = (field) => (val) => onEdit(field, val);
  const editMenu = (i) => (val) => onEdit("menuItems", data.menuItems.map((m, j) => j === i ? val : m));

  return (
    <div style={{
      width: "100%", height: "100%", overflow: "hidden", display: "flex",
      flexDirection: isVertical ? "column" : "row",
      background: ind.colors.light, fontFamily: "sans-serif",
    }}>
      <div style={{ width: isVertical ? "100%" : "45%", height: isVertical ? "45%" : "100%", position: "relative", flexShrink: 0 }}>
        <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <div style={{ position: "absolute", top: 8 * fScale, left: 8 * fScale }}>
          <LogoBadge logo={data.logo} name={data.businessName} emoji={ind.emoji}
            size={36 * fScale} bg={ind.colors.primary} color="#fff" border="2px solid #fff" />
        </div>
      </div>

      {/* Right column laid out as Header (fixed) / Middle (flex, clips) /
          Footer (fixed). The footer holds the coupon, so it must be
          flexShrink:0 — and the middle must own all the spare space with
          minHeight:0+overflow:hidden so it shrinks instead of pushing the
          coupon out of the card's clipped bounds. The previous version used
          `justifyContent: space-between` which let total content exceed the
          container height and clipped the coupon on XL. */}
      <div style={{ flex: 1, padding: `${10 * fScale}px ${12 * fScale}px`, display: "flex", flexDirection: "column", background: ind.colors.light, minWidth: 0, minHeight: 0 }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ color: ind.colors.accent, fontSize: 8 * fScale, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 3 }}>{data.industry}</div>
          <EditableText value={data.businessName} onChange={edit("businessName")}
            style={{ color: ind.colors.dark, fontWeight: 900, fontSize: 20 * fScale, fontFamily: "Georgia, serif", lineHeight: 1.0 }} />
          <EditableText value={data.tagline || ind.taglines[0]} onChange={edit("tagline")}
            style={{ fontSize: (isS ? 9 : 10) * fScale, color: ind.colors.primary, fontWeight: 700, marginTop: 4, fontStyle: "italic" }} />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center", gap: 3 * fScale, margin: `${4 * fScale}px 0` }}>
          {!isS && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 * fScale }}>
              {((data.menuItems && data.menuItems.length > 0) ? data.menuItems : ind.menu).slice(0, isXL ? 3 : isL ? 3 : 2).map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <div style={{ width: 14 * fScale, height: 14 * fScale, borderRadius: "50%", background: ind.colors.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ color: "#fff", fontSize: 7 * fScale, fontWeight: 900 }}>✓</span>
                  </div>
                  <EditableText value={item} onChange={editMenu(i)} style={{ fontSize: 10 * fScale, color: "#333" }} />
                </div>
              ))}
            </div>
          )}

          {!isS && data.hours && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 9 * fScale }}>🕒</span>
              <EditableText value={data.hours} onChange={edit("hours")}
                style={{ color: ind.colors.primary, fontWeight: 700, fontSize: 9 * fScale }} />
            </div>
          )}
        </div>

        <div style={{ flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: data.offer ? 5 * fScale : 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              {data.address && (
                <EditableText value={data.address} onChange={edit("address")} multiline
                  style={{ fontSize: 10 * fScale, color: "#222", fontWeight: 700, whiteSpace: "normal", lineHeight: 1.2 }} />
              )}
              {data.phone && (
                <EditableText value={data.phone} onChange={edit("phone")}
                  style={{ fontSize: 14 * fScale, color: ind.colors.primary, fontWeight: 900, whiteSpace: "nowrap" }} />
              )}
            </div>
            {hasQR(data) && (
              <AdQRCode website={normalizeWebsite(data.website)} spotCode={generateSpotCode(data.businessName, "current")}
                size={isXL ? 48 : isS ? 32 : 38} dark={false} scale={fScale * (isS ? 0.85 : 0.65)} />
            )}
          </div>
          <Coupon offer={data.offer} fine={data.offerFine} accent={ind.colors.primary} scale={fScale}
            onEditOffer={edit("offer")} onEditFine={edit("offerFine")} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 3: MAGAZINE
// ─────────────────────────────────────────────────────────────────────────────
function MagazineTemplate({ data, sizeKey, onEdit }) {
  const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
  const photos = data.photo ? [data.photo] : ind.photos.slice(0, 3);
  const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
  const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.65;
  const edit = (field) => (val) => onEdit(field, val);
  const editMenu = (i) => (val) => onEdit("menuItems", data.menuItems.map((m, j) => j === i ? val : m));

  return (
    <div style={{
      width: "100%", height: "100%", overflow: "hidden", display: "flex", flexDirection: "column",
      background: "#fff", fontFamily: "Georgia, serif",
      border: `${3 * fScale}px solid ${ind.colors.primary}`, boxSizing: "border-box",
    }}>
      <div style={{
        background: ind.colors.primary, padding: `${5 * fScale}px ${10 * fScale}px`,
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 * fScale }}>
          <LogoBadge logo={data.logo} name={data.businessName} emoji={ind.emoji} size={28 * fScale} bg={ind.colors.accent} color="#fff" />
          <EditableText value={data.businessName} onChange={edit("businessName")}
            style={{ color: "#fff", fontWeight: 900, fontSize: 17 * fScale, fontFamily: "Georgia, serif" }} />
        </div>
        {!isS && data.phone && (
          <EditableText value={data.phone} onChange={edit("phone")}
            style={{
              color: "#fff", fontSize: 13 * fScale, fontWeight: 900,
              background: "rgba(0,0,0,0.25)", padding: `${2 * fScale}px ${7 * fScale}px`, borderRadius: 3,
              fontFamily: "sans-serif",
            }} />
        )}
      </div>

      {!isS && (
        <div style={{ display: "flex", gap: 1, height: isXL ? "30%" : isL ? "35%" : "40%", flexShrink: 0 }}>
          {photos.slice(0, 2).map((src, i) => (
            <div key={i} style={{ flex: 1, overflow: "hidden", background: ind.colors.dark }}>
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                onError={e => { e.target.style.display = "none"; }} />
            </div>
          ))}
        </div>
      )}

      {/* Same Header / Middle (flex, clips) / Footer (fixed) pattern as
          SplitClean to guarantee the coupon footer is always visible. */}
      <div style={{ flex: 1, padding: `${4 * fScale}px ${10 * fScale}px ${5 * fScale}px`, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ color: ind.colors.accent, fontSize: 7.5 * fScale, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{data.industry}</div>
          <EditableText value={data.tagline || ind.taglines[0]} onChange={edit("tagline")}
            style={{ color: ind.colors.dark, fontSize: 16 * fScale, fontWeight: 900, fontFamily: "Georgia, serif", lineHeight: 1.1, marginTop: 2 }} />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 * fScale, margin: `${3 * fScale}px 0` }}>
          {!isS && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: `2px ${10 * fScale}px` }}>
              {((data.menuItems && data.menuItems.length > 0) ? data.menuItems : ind.menu).slice(0, (isXL || isL) ? 6 : 4).map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ color: ind.colors.primary, fontSize: 10 * fScale }}>●</span>
                  <EditableText value={item} onChange={editMenu(i)} style={{ fontSize: 11 * fScale, color: "#333", fontFamily: "sans-serif", fontWeight: 500 }} />
                </div>
              ))}
            </div>
          )}

          {!isS && data.hours && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10 * fScale }}>🕒</span>
              <EditableText value={data.hours} onChange={edit("hours")}
                style={{ color: ind.colors.primary, fontWeight: 700, fontSize: 10 * fScale, fontFamily: "sans-serif" }} />
            </div>
          )}
        </div>

        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 3 * fScale }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {data.address && (
                <EditableText value={data.address} onChange={edit("address")} multiline
                  style={{ fontSize: 11 * fScale, color: "#222", fontWeight: 700, fontFamily: "sans-serif", whiteSpace: "normal", lineHeight: 1.2 }} />
              )}
              {data.phone && (
                <EditableText value={data.phone} onChange={edit("phone")}
                  style={{ fontSize: 12 * fScale, color: ind.colors.primary, fontWeight: 900, fontFamily: "sans-serif", whiteSpace: "nowrap" }} />
              )}
            </div>
            {hasQR(data) && (
              <AdQRCode website={normalizeWebsite(data.website)} spotCode={generateSpotCode(data.businessName, "current")}
                size={isXL ? 44 : isS ? 30 : 34} dark={false} scale={fScale * (isS ? 0.85 : 0.65)} />
            )}
          </div>
          <Coupon offer={data.offer} fine={data.offerFine} accent={ind.colors.primary} scale={fScale}
            onEditOffer={edit("offer")} onEditFine={edit("offerFine")} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 4: STAMP
// ─────────────────────────────────────────────────────────────────────────────
function StampTemplate({ data, sizeKey, onEdit }) {
  const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
  const photo = data.photo || ind.photos[0];
  const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
  const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.65;
  const edit = (field) => (val) => onEdit(field, val);

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative", background: ind.colors.dark, fontFamily: "sans-serif" }}>
      <div style={{ position: "absolute", inset: 0, clipPath: "polygon(0 0, 100% 0, 100% 55%, 0 75%)", overflow: "hidden" }}>
        <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${ind.colors.dark}50 0%, ${ind.colors.dark}cc 100%)` }} />
      </div>

      <div style={{ position: "absolute", top: 8 * fScale, left: 10 * fScale, zIndex: 3 }}>
        <div style={{
          background: ind.colors.accent, color: ind.colors.dark, padding: `${3 * fScale}px ${8 * fScale}px`,
          fontSize: 8 * fScale, fontWeight: 900, letterSpacing: 1.5, borderRadius: 3, display: "inline-block",
        }}>
          {ind.menu[0]?.toUpperCase() || "FEATURED"}
        </div>
      </div>

      <div style={{ position: "absolute", top: 8 * fScale, right: 10 * fScale, zIndex: 3 }}>
        <LogoBadge logo={data.logo} name={data.businessName} emoji={ind.emoji}
          size={36 * fScale} bg="rgba(255,255,255,0.15)" color="#fff" border="2px solid rgba(255,255,255,0.5)" />
      </div>

      <div style={{ position: "absolute", top: "32%", left: 0, right: 0, padding: `0 ${12 * fScale}px`, textAlign: "center", zIndex: 3 }}>
        <EditableText value={data.businessName} onChange={edit("businessName")}
          style={{ color: "#fff", fontWeight: 900, fontSize: 13 * fScale, fontFamily: "Georgia, serif", textShadow: "0 2px 8px rgba(0,0,0,0.6)", lineHeight: 1.1, textAlign: "center" }} />
        {!isS && data.phone && (
          <EditableText value={data.phone} onChange={edit("phone")}
            style={{ color: ind.colors.accent, fontWeight: 900, fontSize: (isXL ? 28 : isL ? 24 : 18) * fScale, lineHeight: 1, marginTop: 4, letterSpacing: -0.5, textShadow: "0 2px 12px rgba(0,0,0,0.8)", textAlign: "center" }} />
        )}
        <EditableText value={data.tagline || ind.taglines[0]} onChange={edit("tagline")}
          style={{ color: "rgba(255,255,255,0.85)", fontSize: (isS ? 8 : 9) * fScale, marginTop: 4, fontStyle: "italic", textAlign: "center" }} />
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: `${8 * fScale}px ${10 * fScale}px`, display: "flex", flexDirection: "column", gap: 4 * fScale, zIndex: 3 }}>
        {!isS && !isM && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: `2px ${8 * fScale}px`, justifyContent: "center" }}>
            {(data.menuItems || ind.menu).slice(0, 3).map((item, i) => (
              <EditableText key={i} value={`✓ ${item}`}
                onChange={(v) => edit("menuItems")(data.menuItems.map((m, j) => j === i ? v.replace("✓ ", "") : m))}
                style={{ color: "rgba(255,255,255,0.85)", fontSize: 8 * fScale }} />
            ))}
          </div>
        )}
        {data.offer && (
          <div style={{ background: `linear-gradient(90deg, ${ind.colors.accent}, ${ind.colors.accent}dd)`, padding: `${4 * fScale}px ${8 * fScale}px`, borderRadius: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <EditableText value={data.offer} onChange={edit("offer")}
              style={{ color: ind.colors.dark, fontWeight: 900, fontSize: 12 * fScale }} />
            {data.offerFine && !isS && (
              <EditableText value={data.offerFine} onChange={edit("offerFine")}
                style={{ color: ind.colors.dark, fontSize: 7 * fScale, opacity: 0.8 }} />
            )}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "sans-serif" }}>
          <div>
            {data.address && <EditableText value={data.address.split(",")[0]} onChange={edit("address")} style={{ color: "#fff", fontSize: 11 * fScale, fontWeight: 800, display: "block", whiteSpace: "nowrap", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }} />}
            {isS && data.phone && <EditableText value={data.phone} onChange={edit("phone")} style={{ color: "#fff", fontSize: 10 * fScale, fontWeight: 800, display: "block", whiteSpace: "nowrap", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }} />}
          </div>
          {hasQR(data) && (
            <InlineQRCode website={normalizeWebsite(data.website)} spotCode={generateSpotCode(data.businessName, "current")}
              size={isXL ? 36 : isS ? 26 : 28} dark={true} scale={fScale * (isS ? 0.95 : 0.72)} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Template Registry ────────────────────────────────────────────────────────
const TEMPLATES = {
  "photo-bold":  { name: "Photo Bold",    desc: "Hero photo, bold overlay text", Component: PhotoBoldTemplate },
  "split-clean": { name: "Split Clean",   desc: "50/50 photo + content split",   Component: SplitCleanTemplate },
  "magazine":    { name: "Magazine",      desc: "Editorial multi-photo layout",  Component: MagazineTemplate },
  "stamp":       { name: "Service Stamp", desc: "Diagonal cut, oversized phone", Component: StampTemplate },
};

function suggestTemplate(industry) {
  const restaurantTypes = ["Pizza Restaurant", "Mexican Restaurant", "Chinese Restaurant", "Breakfast & Cafe", "Bar & Grill", "Italian Restaurant", "Bakery", "Coffee Shop"];
  const medicalTypes = ["Dentist", "Medical & Healthcare", "Chiropractor", "Veterinarian"];
  const editorialTypes = ["Real Estate", "Insurance", "Financial Services", "Photography", "Retail Shop", "Daycare", "Salon & Beauty"];
  const serviceTypes = ["HVAC", "Plumber", "Electrician", "Lawn & Landscaping", "Roofing", "Painting", "Cleaning Service", "Pest Control", "Auto Repair"];
  if (restaurantTypes.includes(industry)) return "photo-bold";
  if (medicalTypes.includes(industry)) return "split-clean";
  if (editorialTypes.includes(industry)) return "magazine";
  if (serviceTypes.includes(industry)) return "stamp";
  return "split-clean";
}

// ─────────────────────────────────────────────────────────────────────────────
//   IMAGE UPLOAD
// ─────────────────────────────────────────────────────────────────────────────
function ImageUpload({ label, hint, value, onChange }) {
  const ref = useRef();
  const handleFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onChange(ev.target.result);
    reader.readAsDataURL(file);
  };
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 3 }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 5 }}>{hint}</div>}
      <div onClick={() => ref.current.click()}
        style={{
          border: `2px dashed ${value ? "#16a34a" : "#d1d5db"}`,
          borderRadius: 8, padding: value ? "5px" : "10px",
          cursor: "pointer", textAlign: "center", background: value ? "#f0fdf4" : "#fafafa",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
        {value ? (
          <>
            <img src={value} alt="" style={{ height: 40, maxWidth: 60, objectFit: "contain", borderRadius: 3 }} />
            <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>
              ✓ Uploaded<br />
              <span style={{ color: "#6b7280", fontWeight: 400 }}>Click to change</span>
            </div>
          </>
        ) : (
          <>
            <span style={{ fontSize: 18 }}>📁</span>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Click to upload</div>
          </>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function AdGenerator({ initialSize = "L", onComplete, onClose }) {
  const [sizeKey, setSizeKey] = useState(initialSize);
  const [formData, setFormData] = useState({
    businessName: "",
    industry: "",
    tagline: "",
    offer: "",
    offerFine: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    logo: null,
    photo: null,
    menuItems: [],
    hours: "",
  });
  const [selectedTemplate, setSelectedTemplate] = useState("photo-bold");

  const handleIndustryChange = (e) => {
    const industry = e.target.value;
    const defaultMenu = INDUSTRIES[industry]?.menu || [];
    setFormData(d => ({ ...d, industry, menuItems: [...defaultMenu] }));
    if (industry) setSelectedTemplate(suggestTemplate(industry));
  };

  const handleInlineEdit = useCallback((field, value) => {
    setFormData(d => ({ ...d, [field]: value }));
  }, []);

  // ── Responsive layout state ────────────────────────────────────────────────
  // Below 768px the three-column desktop layout collapses into a tabbed,
  // full-screen experience. Each panel keeps its own state (form text,
  // assistant chat history) by toggling `display: none` instead of
  // unmounting, so switching tabs never clears typed input or chat.
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < MOBILE_BREAKPOINT;
  const [activeTab, setActiveTab] = useState("build"); // build | preview | assistant
  const previewPeekTimeoutRef = useRef(null);

  // Email validation: we keep the button always clickable so it never feels
  // dead. If the user clicks Reserve without a valid email we flip
  // `showEmailError`, jump them to the form tab on mobile, scroll the email
  // field into view, and focus it. The red ring auto-clears the moment the
  // email parses cleanly so the user gets immediate positive feedback.
  const emailInputRef = useRef(null);
  const [showEmailError, setShowEmailError] = useState(false);
  // Used by the Reserve button below to debounce the iPad Safari case
  // where both `onClick` and `onPointerUp` end up firing for the same
  // tap. 400ms is enough to dedupe without making double-clicks feel slow.
  const lastReserveFireRef = useRef(0);

  // Mobile-only "preview peek": when the user touches a field on the Build
  // tab, briefly flip to Preview so they can confirm the change, then return
  // to Build so they can keep filling out the form. Debounced — while the
  // user is still typing/tapping, we keep the peek open and only revert
  // 1.5s after they stop.
  const pokePreview = useCallback(() => {
    if (!isMobile) return;
    setActiveTab((cur) =>
      cur === "build" || cur === "preview" ? "preview" : cur,
    );
    if (previewPeekTimeoutRef.current) clearTimeout(previewPeekTimeoutRef.current);
    previewPeekTimeoutRef.current = setTimeout(() => {
      setActiveTab((cur) => (cur === "preview" ? "build" : cur));
    }, 1500);
  }, [isMobile]);

  // Cancel any pending peek timeout when the modal unmounts so we don't
  // call setState after the component is gone.
  useEffect(() => () => {
    if (previewPeekTimeoutRef.current) clearTimeout(previewPeekTimeoutRef.current);
  }, []);

  // Tab-aware setters used by every Build-tab control. On desktop these
  // are the same as the underlying setters; on mobile they additionally
  // trigger the preview peek. Manual tab presses cancel any pending peek.
  const setFormDataB = useCallback((u) => { setFormData(u); pokePreview(); }, [pokePreview]);
  const setSizeKeyB = useCallback((k) => { setSizeKey(k); pokePreview(); }, [pokePreview]);
  const setSelectedTemplateB = useCallback((t) => { setSelectedTemplate(t); pokePreview(); }, [pokePreview]);
  const handleIndustryChangeB = useCallback((e) => { handleIndustryChange(e); pokePreview(); }, [pokePreview]);
  const selectTab = useCallback((t) => {
    if (previewPeekTimeoutRef.current) clearTimeout(previewPeekTimeoutRef.current);
    setActiveTab(t);
  }, []);

  const sizeInfo = AD_SIZES[sizeKey];
  const Tpl = TEMPLATES[selectedTemplate].Component;
  // Email is required so we can send the receipt and reservation
  // confirmation. Use a basic shape check to avoid obviously bad addresses.
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim());

  // Clear the inline error as soon as the email starts validating.
  useEffect(() => {
    if (emailValid && showEmailError) setShowEmailError(false);
  }, [emailValid, showEmailError]);
  // The preview should populate live as soon as the user has a business
  // name and an industry — that's what the empty-state copy promises and
  // it lets them see their ad come together while they keep filling out
  // the rest of the form. `formValid` (which additionally requires a
  // valid email) only gates the "Approve & Reserve Spot" button.
  const previewReady = formData.businessName.trim() && formData.industry;
  const formValid = previewReady && emailValid;

  // Lock background scroll while the modal is open so swipes inside the ad
  // generator never bubble up to scroll the landing page underneath.
  // Plain `overflow: hidden` on body works on desktop but iOS Safari ignores
  // it once a touch is in flight, so we also pin body with position:fixed and
  // restore the scroll position on unmount. This is the standard
  // body-scroll-lock pattern.
  useEffect(() => {
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const body = document.body;
    const html = document.documentElement;
    const prev = {
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    return () => {
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.left = prev.bodyLeft;
      body.style.right = prev.bodyRight;
      body.style.width = prev.bodyWidth;
      body.style.overflow = prev.bodyOverflow;
      html.style.overflow = prev.htmlOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      window.scrollTo(0, scrollY);
    };
  }, []);

  return (
    <div
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        padding: isMobile ? 0 : 16,
        overscrollBehavior: "contain",
      }}
    >
      <div style={{
        background: "#f8fafc",
        borderRadius: isMobile ? 0 : 18,
        width: "100%",
        maxWidth: isMobile ? "none" : 1280,
        height: isMobile ? "100%" : "auto",
        maxHeight: isMobile ? "100%" : "94vh",
        overflow: "hidden", display: "flex", flexDirection: "column",
        boxShadow: isMobile ? "none" : "0 40px 100px rgba(0,0,0,0.4)",
        fontFamily: "system-ui, sans-serif",
      }}>

        {/* Header */}
        <div style={{
          padding: "16px 24px", borderBottom: "1px solid #e5e7eb", background: "#fff",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>Build Your Ad</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#111", fontFamily: "Georgia, serif" }}>
              {sizeInfo.label} Ad &nbsp;<span style={{ color: "#991b1b" }}>${sizeInfo.price}</span>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "#f3f4f6", border: "none", borderRadius: "50%", width: 36, height: 36,
            cursor: "pointer", fontSize: 20, color: "#374151",
          }}>×</button>
        </div>

        {/* Mobile-only tab bar — collapses the three-column desktop layout
            into Build / Preview / Assistant tabs below 768px. */}
        {isMobile && (
          <div style={{
            display: "flex", borderBottom: "1px solid #e5e7eb",
            background: "#fff", flexShrink: 0,
          }}>
            {[
              { key: "build", label: "Build" },
              { key: "preview", label: "Preview" },
              { key: "assistant", label: "Assistant" },
            ].map((t) => {
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => selectTab(t.key)}
                  style={{
                    flex: 1, padding: "13px 8px", border: "none",
                    background: active ? "#fef2f2" : "transparent",
                    color: active ? "#991b1b" : "#6b7280",
                    fontWeight: active ? 800 : 600, fontSize: 13,
                    letterSpacing: 0.5, textTransform: "uppercase",
                    borderBottom: `3px solid ${active ? "#991b1b" : "transparent"}`,
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Body — three columns on desktop, tabbed single-column on mobile.
            Panels use display:none rather than unmounting so form text and
            assistant chat history survive tab switches. */}
        <div style={{
          flex: 1, display: "flex",
          flexDirection: isMobile ? "column" : "row",
          overflow: "hidden", minHeight: 0,
        }}>

          {/* LEFT: form */}
          <div style={{
            width: isMobile ? "100%" : 380,
            flex: isMobile ? 1 : "0 0 auto",
            display: isMobile && activeTab !== "build" ? "none" : "block",
            padding: "20px 24px", overflowY: "auto",
            borderRight: isMobile ? "none" : "1px solid #e5e7eb",
            background: "#fff", flexShrink: 0,
            minHeight: 0,
          }}>

            {/* Size selector */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#111", marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>Ad Size</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {Object.entries(AD_SIZES).map(([k, s]) => (
                  <button key={k} onClick={() => setSizeKeyB(k)}
                    style={{
                      padding: "8px 10px", borderRadius: 8, border: `2px solid ${sizeKey === k ? "#991b1b" : "#e5e7eb"}`,
                      background: sizeKey === k ? "#fef2f2" : "#fff", cursor: "pointer", textAlign: "left",
                    }}>
                    <div style={{ fontWeight: 800, fontSize: 12, color: "#111" }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>${s.price} · {s.ratio}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Form fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>Business Name *</label>
                <input value={formData.businessName} onChange={e => setFormDataB(d => ({ ...d, businessName: e.target.value }))}
                  placeholder="e.g. Joe's Pizza" style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>Industry *</label>
                <select value={formData.industry} onChange={handleIndustryChangeB} style={inputStyle}>
                  <option value="">Select your industry...</option>
                  {INDUSTRY_LIST.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>Tagline / Slogan</label>
                <input value={formData.tagline} onChange={e => setFormDataB(d => ({ ...d, tagline: e.target.value }))}
                  placeholder={formData.industry ? INDUSTRIES[formData.industry]?.taglines[0] : "Your catchy slogan"}
                  style={inputStyle} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>Special Offer</label>
                  <input value={formData.offer} onChange={e => setFormDataB(d => ({ ...d, offer: e.target.value }))}
                    placeholder="$10 OFF" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>Offer Fine Print</label>
                  <input value={formData.offerFine} onChange={e => setFormDataB(d => ({ ...d, offerFine: e.target.value }))}
                    placeholder="Expires 6/30" style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>
                  Email <span style={{ color: "#991b1b" }}>*</span>
                </label>
                <input ref={emailInputRef}
                  value={formData.email} onChange={e => setFormDataB(d => ({ ...d, email: e.target.value }))}
                  type="email" inputMode="email" autoComplete="email"
                  placeholder="you@yourbusiness.com"
                  style={{
                    ...inputStyle,
                    ...(showEmailError ? { borderColor: "#dc2626", boxShadow: "0 0 0 3px rgba(220,38,38,0.15)" } : null),
                  }} />
                <div style={{ fontSize: 11, color: showEmailError ? "#dc2626" : "#9ca3af", marginTop: 4, fontWeight: showEmailError ? 600 : 400 }}>
                  {showEmailError
                    ? "Please enter a valid email so we can send your receipt and reservation confirmation."
                    : "We'll send your receipt and reservation confirmation here."}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>Phone Number</label>
                <input value={formData.phone} onChange={e => setFormDataB(d => ({ ...d, phone: e.target.value }))}
                  placeholder="(555) 123-4567" style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>Business Hours</label>
                <input value={formData.hours} onChange={e => setFormDataB(d => ({ ...d, hours: e.target.value }))}
                  placeholder="Mon-Fri 9am-5pm" style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>Address</label>
                <input value={formData.address} onChange={e => setFormDataB(d => ({ ...d, address: e.target.value }))}
                  placeholder="123 Main St, Your Town" style={inputStyle} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>
                  Website <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
                </label>
                <input value={formData.website} onChange={e => setFormDataB(d => ({ ...d, website: e.target.value }))}
                  placeholder="www.yourbusiness.com" style={inputStyle} />
                {formData.website ? (
                  <div style={{ fontSize: 11, color: "#16a34a", marginTop: 4, padding: "5px 8px", background: "#f0fdf4", borderRadius: 6, display: "flex", alignItems: "center", gap: 5 }}>
                    <span>📱</span><span>A trackable QR code will be added to your ad automatically!</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>Add your website to get a free trackable QR code on your ad</div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, paddingTop: 8, borderTop: "1px solid #f3f4f6" }}>
                <ImageUpload label="Your Logo" hint="Optional" value={formData.logo} onChange={v => setFormDataB(d => ({ ...d, logo: v }))} />
                <ImageUpload label="Your Photo" hint="Or use stock" value={formData.photo} onChange={v => setFormDataB(d => ({ ...d, photo: v }))} />
              </div>
              {formData.industry && !formData.photo && (
                <div style={{ fontSize: 11, color: "#6b7280", padding: "6px 10px", background: "#f0fdf4", borderRadius: 6 }}>
                  💡 We'll use a professional stock photo for {formData.industry} since you didn't upload one.
                </div>
              )}
            </div>

            {/* Template picker */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#111", marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>Design Style</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {TEMPLATE_STYLES.map(tpl => (
                  <button key={tpl} onClick={() => setSelectedTemplateB(tpl)}
                    style={{
                      padding: "8px 10px", borderRadius: 8,
                      border: `2px solid ${selectedTemplate === tpl ? "#991b1b" : "#e5e7eb"}`,
                      background: selectedTemplate === tpl ? "#fef2f2" : "#fff",
                      cursor: "pointer", textAlign: "left",
                    }}>
                    <div style={{ fontWeight: 800, fontSize: 12, color: "#111" }}>{TEMPLATES[tpl].name}</div>
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1, lineHeight: 1.3 }}>{TEMPLATES[tpl].desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* CENTER: live preview */}
          <div style={{
            flex: 1,
            display: isMobile && activeTab !== "preview" ? "none" : "flex",
            padding: "20px 24px", overflowY: "auto",
            flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
            background: "linear-gradient(135deg, #1e293b, #0f172a)",
            minHeight: 0,
          }}>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
              Live Preview · {sizeInfo.label} · {sizeInfo.ratio}
            </div>

            {previewReady ? (
              <>
                <style>{EDITABLE_CSS}</style>

                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginBottom: 10, textAlign: "center", fontFamily: "sans-serif" }}>
                  {sizeInfo.label} · {AD_SIZES[sizeKey].width}" × {AD_SIZES[sizeKey].height}" · ${sizeInfo.price}
                </div>

                {/* Ad preview — single px-per-inch scale so every size is truly
                    proportional to the others (matches the picker shapes exactly):
                    XL 4×5 portrait, L 4×3 landscape, M 3×2, S 2×2 square */}
                {(() => {
                  const PX_PER_INCH = 100;
                  const w = AD_SIZES[sizeKey].width * PX_PER_INCH;
                  const h = AD_SIZES[sizeKey].height * PX_PER_INCH;
                  return (
                    <div style={{
                      width: w,
                      height: h,
                      borderRadius: 6, overflow: "hidden",
                      boxShadow: "0 12px 48px rgba(0,0,0,0.6)",
                      flexShrink: 0,
                    }}>
                      <Tpl data={formData} sizeKey={sizeKey} onEdit={handleInlineEdit} />
                    </div>
                  );
                })()}

                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, marginTop: 10, textAlign: "center", fontStyle: "italic" }}>
                  ✎ Click any text in the preview to edit it directly
                </div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginTop: 4, textAlign: "center" }}>
                  Style: <strong style={{ color: "#fff" }}>{TEMPLATES[selectedTemplate].name}</strong>
                  {!formData.photo && formData.industry && <> · Using stock photo for {formData.industry}</>}
                </div>

                {(() => {
                  // iPad Safari is finicky about taps on buttons inside
                  // a position:fixed modal that also has overflowY:auto.
                  // The fix kit:
                  //   • explicit `type="button"` so iOS can't misclassify it
                  //   • `touchAction: "manipulation"` to kill the 300ms
                  //     double-tap delay and the synthetic-click cancel
                  //     iOS sometimes does after a near-tap
                  //   • `WebkitTapHighlightColor` so the user gets visible
                  //     feedback on tap (and so iOS treats it as tappable)
                  //   • `WebkitAppearance: none` so iOS doesn't apply its
                  //     own button chrome, which can swallow taps
                  //   • belt-and-braces `onPointerUp` mirroring `onClick`,
                  //     guarded by a 400ms ref so we never fire twice
                  const lastFire = lastReserveFireRef;
                  const submit = () => {
                    const now = Date.now();
                    if (now - (lastFire.current || 0) < 400) return;
                    lastFire.current = now;
                    if (formValid) {
                      onComplete?.({ sizeKey, price: sizeInfo.price, template: selectedTemplate, ...formData });
                      return;
                    }
                    // Form isn't valid — surface why instead of silently
                    // failing. Right now the only field that gates Reserve
                    // beyond previewReady (name + industry, both already
                    // present here since the button only renders when
                    // previewReady is true) is the email.
                    setShowEmailError(true);
                    if (isMobile) setActiveTab("build");
                    setTimeout(() => {
                      emailInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                      emailInputRef.current?.focus();
                    }, 50);
                  };
                  return (
                    <button
                      type="button"
                      onClick={submit}
                      onPointerUp={submit}
                      style={{
                        marginTop: 20, padding: "14px 32px", background: "#991b1b",
                        color: "#fff", border: "none", borderRadius: 10, fontSize: 15,
                        fontWeight: 800, cursor: "pointer", letterSpacing: 0.5,
                        touchAction: "manipulation",
                        WebkitAppearance: "none",
                        WebkitTapHighlightColor: "rgba(255,255,255,0.15)",
                        userSelect: "none",
                      }}>
                      Approve &amp; Reserve Spot — ${sizeInfo.price}
                    </button>
                  );
                })()}
              </>
            ) : (
              <div style={{
                width: AD_SIZES[sizeKey].width * 100,
                height: AD_SIZES[sizeKey].height * 100,
                borderRadius: 6, border: "2px dashed rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.04)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", padding: 20,
              }}>
                Fill in your business name and<br />industry to see your ad preview
              </div>
            )}
          </div>

          {/* RIGHT: AI Assistant */}
          <div style={{
            width: isMobile ? "100%" : 320,
            flex: isMobile ? 1 : "0 0 auto",
            display: isMobile && activeTab !== "assistant" ? "none" : "flex",
            flexDirection: "column",
            borderLeft: isMobile ? "none" : "1px solid #e5e7eb",
            overflow: "hidden", flexShrink: 0, minHeight: 0,
          }}>
            <AdAssistant formData={formData} onUpdate={handleInlineEdit} sizeKey={sizeKey} />
          </div>

        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 7,
  border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none",
  fontFamily: "system-ui, sans-serif", boxSizing: "border-box", background: "#fff",
};
