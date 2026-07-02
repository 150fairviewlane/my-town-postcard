import { useState, useRef, useCallback, useEffect } from "react";
import { INDUSTRIES, INDUSTRY_LIST } from "./industryAssets";
import IndustryConflictDialog from "./components/IndustryConflictDialog";
import { useEmailSuggestion, EmailSuggestionHint } from "./hooks/useEmailSuggestion.jsx";
import { AdQRCode, InlineQRCode, hasQR, normalizeWebsite, generateSpotCode, PositionedQR } from "./qrUtils";
import AdAssistant from "./AdAssistant";
import { useRefineGrokAd } from "@workspace/api-client-react";

//
//   EDITABLE TEXT – click any text in the preview to edit it inline
//
const TB_BTN = {
background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)",
color: "#fff", fontSize: 11, fontWeight: 900, lineHeight: 1,
cursor: "pointer", padding: "2px 5px", borderRadius: 4,
};

function EditableText({
value, onChange, style = {}, multiline = false, placeholder = "Click to edit",
fieldKey, fontSizes, fieldWidths, onFontSizeChange, onWidthChange,
}) {
const [editing, setEditing] = useState(false);
const [draft,   setDraft]   = useState(value);
const [below,   setBelow]   = useState(false);
const inputRef = useRef();
const wrapRef  = useRef();

// Apply custom font size if overridden
const customFs       = fieldKey && fontSizes && fontSizes[fieldKey];
const activeFontSize = customFs || style.fontSize;
const resolvedStyle  = { ...style, fontSize: activeFontSize };

// Numeric size for toolbar display
const rawFs     = customFs
? Number(customFs)
: (typeof style.fontSize === "number" ? Math.round(style.fontSize) : null);
const canResize = !!(fieldKey && onFontSizeChange && rawFs !== null);

// Toolbar visible ONLY while the field is actively being edited.
// It disappears the moment the user clicks anywhere else (onBlur -> commit).
const showToolbar = canResize && editing;

// When the user clicks the field, check whether the field is near the top
// of the ad preview. If so, show the toolbar BELOW the field instead of
// above, so it stays visible inside the ad boundary.
const checkPosition = () => {
if (!wrapRef.current) return;
const rect   = wrapRef.current.getBoundingClientRect();
const parent = wrapRef.current.closest("[data-ad-preview]");
const threshold = 50;
if (parent) {
setBelow(rect.top - parent.getBoundingClientRect().top < threshold);
} else {
setBelow(rect.top < threshold + 40);
}
};

const bumpFs = (delta, e) => {
e.stopPropagation(); e.preventDefault();
onFontSizeChange(fieldKey, Math.max(6, Math.min(120, rawFs + delta)));
};
const resetFs = (e) => {
e.stopPropagation(); e.preventDefault();
onFontSizeChange(fieldKey, null);
};

const startEdit = (e) => {
e.stopPropagation();
checkPosition();
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
if (e.key === "Escape")             { setEditing(false); setDraft(value); }
};

// Position pill above or below the field
const pillPos = below
? { top: "calc(100% + 5px)", bottom: "auto" }
: { bottom: "calc(100% + 5px)", top: "auto" };

const Toolbar = showToolbar ? (
<div
onMouseDown={e => e.preventDefault()}
style={{
position: "absolute", left: 0, zIndex: 9999,
...pillPos,
display: "flex", alignItems: "center", gap: 5,
background: "rgba(8,8,8,0.96)",
border: "1px solid rgba(255,255,255,0.22)",
borderRadius: 8, padding: "5px 10px",
boxShadow: "0 6px 20px rgba(0,0,0,0.75)",
pointerEvents: "all", userSelect: "none", whiteSpace: "nowrap",
}}>
<span style={{ color: "#6b7280", fontSize: 10, fontFamily: "sans-serif" }}>Font</span>
<button onMouseDown={e => bumpFs(-1, e)} style={TB_BTN}>−</button>
<span style={{ color: "#fff", fontSize: 12, minWidth: 24, textAlign: "center",
fontFamily: "monospace", fontWeight: 800 }}>{rawFs}</span>
<button onMouseDown={e => bumpFs(+1, e)} style={TB_BTN}>+</button>
{customFs && (
<button onMouseDown={resetFs}
style={{ ...TB_BTN, marginLeft: 4, color: "#fca5a5",
background: "rgba(239,68,68,0.18)", fontSize: 10 }}>
Reset
</button>
)}
</div>
) : null;

const inputStyle = {
...resolvedStyle,
background: "rgba(0,0,0,0.6)", border: "none",
outline: "2px solid rgba(255,255,255,0.85)", outlineOffset: 2,
borderRadius: 3, color: resolvedStyle.color || "#fff",
padding: "2px 4px", width: "100%",
fontFamily:    resolvedStyle.fontFamily    || "inherit",
fontSize:      resolvedStyle.fontSize      || "inherit",
fontWeight:    resolvedStyle.fontWeight    || "inherit",
lineHeight:    resolvedStyle.lineHeight    || "inherit",
letterSpacing: resolvedStyle.letterSpacing || "inherit",
resize: "none", boxSizing: "border-box",
};

//  Editing mode
if (editing) {
return (
<div ref={wrapRef}
style={{ position: "relative", display: resolvedStyle.display || "block" }}>
{Toolbar}
{multiline
? <textarea ref={inputRef} value={draft} rows={2}
onChange={e => setDraft(e.target.value)}
onBlur={commit} onKeyDown={handleKey}
style={inputStyle} />
: <input ref={inputRef} value={draft} type="text"
onChange={e => setDraft(e.target.value)}
onBlur={commit} onKeyDown={handleKey}
style={inputStyle} />}
</div>
);
}

//  Display mode (click to activate)
return (
<div ref={wrapRef} onClick={startEdit}
title="Click to edit text and adjust font size"
style={{
...resolvedStyle,
cursor: "text", borderRadius: 2,
position: "relative", display: resolvedStyle.display || "block",
}}>
{value || <span style={{ opacity: 0.35, fontStyle: "italic" }}>{placeholder}</span>}
</div>
);
}

const EDITABLE_CSS = `.editable-text { cursor: text !important; }`;

//
//   AD GENERATOR
//   4 ad sizes x 4 distinct template styles each = 16 unique looks
//   No two ads on the same postcard will look alike
//

// Ad sizes available on the postcard (4 different sizes)
export const AD_SIZES = {
XL: { label: "Extra Large", price: 499, ratio: "4:5",  width: 4, height: 5,   desc: "Hero spot - maximum impact" },
L:  { label: "Large",       price: 399, ratio: "4:3",  width: 4, height: 3,   desc: "Premium placement" },
M:  { label: "Medium",      price: 299, ratio: "3:2",  width: 3, height: 2,   desc: "Great visibility" },
S:  { label: "Small",       price: 199, ratio: "2:2",  width: 2, height: 2,   desc: "Affordable local reach" },
};

// 4 visually distinct template styles
const TEMPLATE_STYLES = ["photo-bold", "split-clean", "magazine", "stamp", "fade-out", "brush-stroke"];

//  Helper: Logo Badge with fallback
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

//  Helper: Coupon with perforated border + scissors + inline editing
function Coupon({ offer, fine, accent, scale = 1, dark = false, onEditOffer, onEditFine, fontSizes, fieldWidths, onFontSizeChange, onWidthChange }) {
if (!offer) return null;
return (
<div style={{
border: `${1.5*scale}px dashed ${accent}`,
background: dark ? "rgba(0,0,0,0.3)" : `${accent}15`,
borderRadius: 4*scale,
// Extra top padding gives the scissors strip room to show without being clipped
padding: `${8*scale}px ${10*scale}px ${5*scale}px`,
textAlign: "center",
position: "relative",
flexShrink: 0,
width: "fit-content",
alignSelf: "center", // prevents flex-column stretch from overriding fit-content width
margin: `${5*scale}px auto 0`, // centers the coupon; top margin ensures scissors aren't flush with parent edge
}}>
{/* Scissors strip */}
<div style={{ position: "absolute", top: -(1*scale), left: 0, right: 0, display: "flex", alignItems: "center", padding: `0 ${4*scale}px` }}>
<span style={{ fontSize: 10*scale, lineHeight: 1, flexShrink: 0, opacity: 0.8 }}></span>
<div style={{ flex: 1, marginLeft: 3*scale, borderTop: `${1.2*scale}px dashed ${accent}88` }} />
<span style={{ fontSize: 10*scale, lineHeight: 1, flexShrink: 0, opacity: 0.8, transform: "scaleX(-1)", display: "inline-block" }}></span>
</div>
{onEditOffer ? (
<EditableText value={offer} onChange={onEditOffer} fieldKey="offer" fontSizes={fontSizes||{}} fieldWidths={fieldWidths||{}} onFontSizeChange={onFontSizeChange} onWidthChange={onWidthChange}
style={{ color: dark ? "#fff" : accent, fontWeight: 900, fontSize: 13*scale, lineHeight: 1.1, letterSpacing: 0.3 }} />
) : (
<div style={{ color: dark ? "#fff" : accent, fontWeight: 900, fontSize: 13*scale, lineHeight: 1.1, letterSpacing: 0.3 }}>{offer}</div>
)}
{fine && onEditFine ? (
<EditableText value={fine} onChange={onEditFine} fieldKey="offerFine" fontSizes={fontSizes||{}} fieldWidths={fieldWidths||{}} onFontSizeChange={onFontSizeChange} onWidthChange={onWidthChange}
style={{ color: dark ? "rgba(255,255,255,0.7)" : "#666", fontSize: 7*scale, marginTop: 2, fontFamily: "sans-serif" }} />
) : fine ? (
<div style={{ color: dark ? "rgba(255,255,255,0.7)" : "#666", fontSize: 7*scale, marginTop: 2, fontFamily: "sans-serif" }}>{fine}</div>
) : null}
</div>
);
}

//
// TEMPLATE 1: PHOTO-BOLD
// Full-bleed photo background with overlay text
// Best for: restaurants, salons, photography
//
function PhotoBoldTemplate({ data, sizeKey, onEdit, onFontSizeChange, onWidthChange }) {
const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
const overlayGradient = `linear-gradient(180deg, ${ind.colors.dark}99 0%, ${ind.colors.dark}55 40%, ${ind.colors.dark}f0 100%)`;
const bulletColor = ind.colors.primary;
const photo = data.photo || ind.photos[0];
const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.65;
const edit = (field) => (val) => onEdit(field, val);
const editMenu = (i) => (val) => onEdit("menuItems", data.menuItems.map((m, j) => {
  if (j !== i) return m;
  if (typeof m === "object") return { ...m, text: val };
  return val;
}));

// ef(): spread onto EditableText to enable the resize toolbar
const ef = (key) => ({
fieldKey: key,
fontSizes: data.fontSizes || {},
fieldWidths: data.fieldWidths || {},
onFontSizeChange,
onWidthChange,
});

return (
<div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", fontFamily: "Georgia, serif" }}>
<img src={photo} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
<div style={{ position: "absolute", inset: 0, background: overlayGradient }} />
  {/* Logo + name — top by default, bottom for v2 (reversed gradient) */}
  <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: `${10*fScale}px ${12*fScale}px`, display: "flex", alignItems: "center", gap: 8*fScale }}>
    <LogoBadge logo={data.logo} name={data.businessName} emoji={ind.emoji} size={36*fScale} bg={`${ind.colors.primary}cc`} color="#fff" />
    <div style={{ flex: 1, minWidth: 0 }}>
      <EditableText value={data.businessName} onChange={edit("businessName")} {...ef("businessName")}
        style={{ color: "#fff", fontWeight: 900, fontSize: 16*fScale, lineHeight: 1.05, textShadow: "0 2px 8px rgba(0,0,0,0.7)" }} />
    </div>
  </div>

  {/* Center: tagline */}
  {!isS && (
    <div style={{ position: "absolute", top: "28%", left: 12*fScale, right: 12*fScale, textAlign: "center" }}>
      <EditableText value={data.tagline || ind.taglines[0]} onChange={edit("tagline")} {...ef("tagline")}
        style={{ color: "#fff", fontWeight: 800, fontSize: (isXL?22:isL?18:14)*fScale, lineHeight: 1.1, fontStyle: "italic", textShadow: "0 2px 12px rgba(0,0,0,0.8)", textAlign: "center" }} />
    </div>
  )}

  {/* Menu / services list — 2 items on S, 4 on all larger sizes.
      For XL/L: anchor from top at 44% so items sit in the mid-section.
      For M/S: anchor from the bottom (above the contact footer) so items
      don't pile under the company name in the limited vertical space. */}
  <div style={{
    position: "absolute",
    ...(isM || isS
      ? { bottom: Math.round(36 * fScale), left: 12*fScale, right: 12*fScale }
      : { top: "44%",                       left: 12*fScale, right: 12*fScale }),
    display: "flex", flexDirection: "column", gap: 3*fScale,
  }}>
    {getActiveItems(data.menuItems, ind.menu).slice(0, isS ? 2 : 4).map((item, i) => (
      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6*fScale }}>
        <div style={{ width: 12*fScale, height: 12*fScale, borderRadius: "50%", background: bulletColor, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#fff", fontSize: 7*fScale, fontWeight: 900 }}>✓</span>
        </div>
        <EditableText value={item} onChange={editMenu(i)} {...ef(`menuItem_${i}`)}
          style={{ color: "#fff", fontSize: 9*fScale, fontWeight: 600, fontFamily: "sans-serif", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }} />
      </div>
    ))}
  </div>

  {/* Bottom: coupon + contact */}
  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: `${8*fScale}px ${12*fScale}px`, display: "flex", flexDirection: "column", gap: 4*fScale }}>
    {data.offer && <Coupon offer={data.offer} fine={data.offerFine} accent="#fff" scale={fScale} dark={true} onEditOffer={edit("offer")} onEditFine={edit("offerFine")} fontSizes={data.fontSizes||{}} fieldWidths={data.fieldWidths||{}} onFontSizeChange={onFontSizeChange} onWidthChange={onWidthChange} />}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", color: "rgba(255,255,255,0.85)", fontSize: 9*fScale, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {data.address && (
          <EditableText value={data.address} onChange={edit("address")} {...ef("address")}
            style={{ color: "rgba(255,255,255,0.85)", fontSize: 9*fScale, fontFamily: "sans-serif", whiteSpace: "normal", wordBreak: "break-word" }} />
        )}
        {data.city && (
          <EditableText value={data.city} onChange={edit("city")} {...ef("city")}
            style={{ color: "rgba(255,255,255,0.75)", fontSize: 9*fScale, fontFamily: "sans-serif", whiteSpace: "normal" }} />
        )}
        {data.phone && (
          <EditableText value={data.phone} onChange={edit("phone")} {...ef("phone")}
            style={{ color: "rgba(255,255,255,0.85)", fontSize: 9*fScale, fontWeight: 800, fontFamily: "sans-serif", whiteSpace: "normal" }} />
        )}
      </div>
    </div>
  </div>
  {!isS && <PositionedQR website={data.website} fScale={fScale} dark />}
</div>
);
}

//
// TEMPLATE 2: SPLIT-CLEAN
// 50/50 split: photo on one side, white content on the other
// Best for: dental, medical, professional services
//
function SplitCleanTemplate({ data, sizeKey, onEdit, onFontSizeChange, onWidthChange }) {
const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
const photo = data.photo || ind.photos[0];
const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.65;
const isVertical = isXL;
const contentBg = ind.colors.light;
const textDark = ind.colors.dark;
const textPrimary = ind.colors.primary;
const accentDot = ind.colors.accent;
const edit = (field) => (val) => onEdit(field, val);

// ef(): spread onto EditableText to enable the resize toolbar
const ef = (key) => ({
fieldKey: key,
fontSizes: data.fontSizes || {},
fieldWidths: data.fieldWidths || {},
onFontSizeChange,
onWidthChange,
});
const editMenu = (i) => (val) => onEdit("menuItems", data.menuItems.map((m, j) => {
if (j !== i) return m;
// Always treat as object (normalized on industry change)
const base = typeof m === "object" ? m : { text: m, enabled: true };
return { ...base, text: val };
})); // XL goes photo-on-top, others side-by-side

return (
<div style={{
width: "100%", height: "100%", overflow: "hidden", position: "relative", display: "flex",
flexDirection: isVertical ? "column" : "row",
background: contentBg, fontFamily: "sans-serif",
}}>
{/* Photo half */}
<div style={{
width: isVertical ? "100%" : "45%",
height: isVertical ? "45%" : "100%",
position: "relative", flexShrink: 0,
}}>
<img src={photo} alt="" style={{
width: "100%", height: "100%", objectFit: "cover", display: "block"
}} />
{/* Logo overlay */}
<div style={{
position: "absolute", top: 8 * fScale, left: 8 * fScale,
}}>
<LogoBadge logo={data.logo} name={data.businessName} emoji={ind.emoji}
size={36 * fScale} bg={ind.colors.primary} color="#fff" border={`2px solid #fff`} />
</div>
</div>
  {/* Content half */}
  <div style={{ flex: 1, padding: `${10*fScale}px ${12*fScale}px`, display: "flex", flexDirection: "column", justifyContent: "space-between", background: contentBg, minWidth: 0 }}>
    {/* Top */}
    <div>
      <EditableText value={data.businessName} onChange={edit("businessName")} {...ef("businessName")}
        style={{ color: textDark, fontWeight: 900, fontSize: 20*fScale, fontFamily: "Georgia, serif", lineHeight: 1.0 }} />
      {!isS && (
        <EditableText value={data.tagline || ind.taglines[0]} onChange={edit("tagline")} {...ef("tagline")}
          style={{ fontSize: 11*fScale, color: textPrimary, fontWeight: 700, marginTop: 4, fontStyle: "italic" }} />
      )}
    </div>

    {/* Middle: editable services list -- show on L and XL and M */}
    <div style={{ display: "flex", flexDirection: "column", gap: 3*fScale, margin: `${5*fScale}px 0` }}>
        {getActiveItems(data.menuItems, ind.menu).slice(0, isS ? 2 : 4).map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ width: 14*fScale, height: 14*fScale, borderRadius: "50%", background: accentDot, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "#fff", fontSize: 8*fScale, fontWeight: 900 }}>&#10003;</span>
            </div>
            <EditableText value={item} onChange={editMenu(i)} {...ef(`menuItem_${i}`)}
              style={{ fontSize: 10*fScale, color: "#222", fontWeight: 500 }} />
          </div>
        ))}
      </div>

    {/* Bottom: coupon + contact */}
    <div style={{ flexShrink: 0, overflow: "visible" }}>
      <Coupon offer={data.offer} fine={data.offerFine} accent={ind.colors.primary} scale={fScale}
        onEditOffer={edit("offer")} onEditFine={edit("offerFine")} fontSizes={data.fontSizes||{}} fieldWidths={data.fieldWidths||{}} onFontSizeChange={onFontSizeChange} onWidthChange={onWidthChange} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: data.offer ? 3 : 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {data.address && (
            <EditableText value={data.address} onChange={edit("address")} {...ef("address")}
              style={{ fontSize: Math.max(11, 10*fScale), color: "#555", whiteSpace: "normal", wordBreak: "break-word" }} />
          )}
          {data.city && (
            <EditableText value={data.city} onChange={edit("city")} {...ef("city")}
              style={{ fontSize: Math.max(10, 9*fScale), color: "#777", whiteSpace: "normal" }} />
          )}
          {data.phone && (
            <EditableText value={data.phone} onChange={edit("phone")} {...ef("phone")}
              style={{ fontSize: 14*fScale, color: textPrimary, fontWeight: 900, whiteSpace: "nowrap" }} />
          )}
        </div>
      </div>
    </div>
  </div>
  {!isS && <PositionedQR website={data.website} fScale={fScale} />}
</div>
);
}

//
// TEMPLATE 3: MAGAZINE
// Editorial style with photo strip + dense content
// Best for: real estate, insurance, financial, retail
//
function MagazineTemplate({ data, sizeKey, onEdit, onFontSizeChange, onWidthChange }) {
const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
// Magazine uses 2 photos: the selected/primary photo + one supporting photo
// If user picked a specific stock photo, show it first + the next one in rotation
const primaryPhoto = data.photo || ind.photos[0];
const primaryIdx = ind.photos.indexOf(primaryPhoto);
const secondPhoto = primaryIdx >= 0
? ind.photos[(primaryIdx + 1) % ind.photos.length]  // next stock photo in rotation
: (ind.photos[0] !== primaryPhoto ? ind.photos[0] : ind.photos[1]); // fallback
const photos = [primaryPhoto, secondPhoto].filter(Boolean);
const headerBg = ind.colors.primary;
const borderColor = ind.colors.primary;
const taglineColor = ind.colors.dark;
const bulletColor = ind.colors.primary;
const displayPhotos = photos;
const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.65;
const edit = (field) => (val) => onEdit(field, val);

// ef(): spread onto EditableText to enable the resize toolbar
const ef = (key) => ({
fieldKey: key,
fontSizes: data.fontSizes || {},
fieldWidths: data.fieldWidths || {},
onFontSizeChange,
onWidthChange,
});
const editMenu = (i) => (val) => onEdit("menuItems", data.menuItems.map((m, j) => {
if (j !== i) return m;
if (typeof m === "object") return { ...m, text: val };
return val;
}));

return (
<div style={{
width: "100%", height: "100%", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column",
background: "#fff", fontFamily: "Georgia, serif",
border: `${3 * fScale}px solid ${borderColor}`, boxSizing: "border-box",
}}>
{/* Header bar */}
<div style={{
background: headerBg, padding: `${6 * fScale}px ${10 * fScale}px`,
display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
}}>
<div style={{ display: "flex", alignItems: "center", gap: 7 * fScale }}>
<LogoBadge logo={data.logo} name={data.businessName} emoji={ind.emoji}
size={32 * fScale} bg={ind.colors.accent} color="#fff" />
<EditableText value={data.businessName} onChange={edit("businessName")} {...ef("businessName")}
style={{ color: "#fff", fontWeight: 900, fontSize: 17*fScale, fontFamily: "Georgia, serif", lineHeight: 1.0 }} />
</div>
{!isS && data.phone && (
<EditableText value={data.phone} onChange={edit("phone")} {...ef("phone")}
style={{
color: "#fff", fontSize: 13*fScale, fontWeight: 900,
background: "rgba(0,0,0,0.3)", padding: `${3*fScale}px ${8*fScale}px`,
borderRadius: 4, fontFamily: "sans-serif", whiteSpace: "nowrap",
}} />
)}
</div>
  {/* Photo strip -- only render photos that exist, max 2 to prevent broken middle image */}
  {!isS && (
    <div style={{ display: "flex", gap: 1, height: isXL ? "30%" : isL ? "35%" : "40%", flexShrink: 0 }}>
      {displayPhotos.slice(0, 2).map((src, i) => (
        <div key={i} style={{ flex: 1, overflow: "hidden", background: ind.colors.dark }}>
          <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={e => { e.target.style.display = "none"; }} />
        </div>
      ))}
    </div>
  )}

  {/* Content */}
  <div style={{ flex: 1, padding: `${4*fScale}px ${10*fScale}px ${5*fScale}px`, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 0 }}>
    <div>
      <EditableText value={data.tagline || ind.taglines[0]} onChange={edit("tagline")} {...ef("tagline")}
        style={{ color: taglineColor, fontSize: 16*fScale, fontWeight: 900, fontFamily: "Georgia, serif", lineHeight: 1.1, marginTop: 2 }} />
    </div>

    <div style={{ display: "flex", flexWrap: "wrap", gap: `${3*fScale}px ${10*fScale}px`, margin: `${4*fScale}px 0` }}>
        {getActiveItems(data.menuItems, ind.menu).slice(0, isS ? 2 : 4).map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ color: bulletColor, fontSize: 9*fScale, fontWeight: 900, marginTop: 1 }}>&#8226;</span>
            <EditableText value={item} onChange={editMenu(i)} {...ef(`menuItem_${i}`)}
              style={{ fontSize: 10*fScale, color: "#333", fontFamily: "sans-serif", fontWeight: 500 }} />
          </div>
        ))}
    </div>

    {/* Bottom: coupon then address+contact row */}
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 3*fScale, overflow: "visible", paddingBottom: 2*fScale }}>
      <Coupon offer={data.offer} fine={data.offerFine} accent={ind.colors.primary} scale={fScale}
        onEditOffer={edit("offer")} onEditFine={edit("offerFine")} fontSizes={data.fontSizes||{}} fieldWidths={data.fieldWidths||{}} onFontSizeChange={onFontSizeChange} onWidthChange={onWidthChange} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {data.address && (
            <EditableText value={data.address} onChange={edit("address")} {...ef("address")}
              style={{ fontSize: Math.max(11, 10*fScale), color: "#555", fontFamily: "sans-serif", whiteSpace: "normal", wordBreak: "break-word" }} />
          )}
          {data.city && (
            <EditableText value={data.city} onChange={edit("city")} {...ef("city")}
              style={{ fontSize: Math.max(10, 9*fScale), color: "#777", fontFamily: "sans-serif", whiteSpace: "normal" }} />
          )}
          {data.phone && (
            <EditableText value={data.phone} onChange={edit("phone")} {...ef("phone")}
              style={{ fontSize: 12*fScale, color: bulletColor, fontWeight: 900, fontFamily: "sans-serif", whiteSpace: "nowrap" }} />
          )}
        </div>
      </div>
    </div>
  </div>
  {!isS && <PositionedQR website={data.website} fScale={fScale} />}
</div>
);
}

//
// TEMPLATE 4: STAMP
// Diagonal split, oversized offer text, retro stamp feel
// Best for: services (HVAC, plumber, electrician, lawn, auto)
//
function StampTemplate({ data, sizeKey, onEdit, onFontSizeChange, onWidthChange }) {
const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
const photo = data.photo || ind.photos[0];
const bgDark = ind.colors.dark;
const accentColor = ind.colors.accent;
const clipPathVal = "polygon(0 0, 100% 0, 100% 55%, 0 75%)";
const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.65;
const edit = (field) => (val) => onEdit(field, val);

// ef(): spread onto EditableText to enable the resize toolbar
const ef = (key) => ({
fieldKey: key,
fontSizes: data.fontSizes || {},
fieldWidths: data.fieldWidths || {},
onFontSizeChange,
onWidthChange,
});
const editMenu = (i) => (val) => onEdit("menuItems", data.menuItems.map((m, j) => {
if (j !== i) return m;
if (typeof m === "object") return { ...m, text: val };
return val;
}));

return (
<div style={{
width: "100%", height: "100%", overflow: "hidden", position: "relative",
background: bgDark, fontFamily: "sans-serif",
}}>
{/* Diagonal photo on top half */}
<div style={{
position: "absolute", inset: 0,
clipPath: clipPathVal,
overflow: "hidden",
}}>
<img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
<div style={{
position: "absolute", inset: 0,
background: `linear-gradient(180deg, ${bgDark}50 0%, ${bgDark}cc 100%)`
}} />
</div>
  {/* Top: emergency/feature badge */}
  <div style={{
    position: "absolute", top: 8 * fScale, left: 10 * fScale, zIndex: 3,
  }}>
    <div style={{
      background: accentColor, color: bgDark, padding: `${3 * fScale}px ${8 * fScale}px`,
      fontSize: 8 * fScale, fontWeight: 900, letterSpacing: 1.5,
      borderRadius: 3, display: "inline-block",
    }}>
      {ind.menu[0]?.toUpperCase() || "FEATURED"}
    </div>
  </div>

  {/* Logo top-right */}
  <div style={{
    position: "absolute", top: 8 * fScale, right: 10 * fScale, zIndex: 3,
  }}>
    <LogoBadge logo={data.logo} name={data.businessName} emoji={ind.emoji}
      size={36 * fScale} bg="rgba(255,255,255,0.15)" color="#fff" border="2px solid rgba(255,255,255,0.5)" />
  </div>

  {/* Center: business name + huge phone */}
  <div style={{ position: "absolute", top: "32%", left: 0, right: 0, padding: `0 ${12*fScale}px`, textAlign: "center", zIndex: 3 }}>
    <EditableText value={data.businessName} onChange={edit("businessName")} {...ef("businessName")}
      style={{ color: "#fff", fontWeight: 900, fontSize: 13*fScale, fontFamily: "Georgia, serif", textShadow: "0 2px 8px rgba(0,0,0,0.6)", lineHeight: 1.1, textAlign: "center" }} />
    {!isS && data.phone && (
      <EditableText value={data.phone} onChange={edit("phone")} {...ef("phone")}
        style={{ color: accentColor, fontWeight: 900, fontSize: (isXL?28:isL?24:18)*fScale, lineHeight: 1, marginTop: 4, letterSpacing: -0.5, textShadow: "0 2px 12px rgba(0,0,0,0.8)", textAlign: "center" }} />
    )}
    <EditableText value={data.tagline || ind.taglines[0]} onChange={edit("tagline")} {...ef("tagline")}
      style={{ color: "rgba(255,255,255,0.85)", fontSize: Math.max(10, 9*fScale), marginTop: 4, fontStyle: "italic", textAlign: "center" }} />
  </div>

  {/* Bottom */}
  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: `${6*fScale}px ${10*fScale}px ${8*fScale}px`, display: "flex", flexDirection: "column", gap: 4*fScale, zIndex: 3 }}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: `2px ${8*fScale}px`, justifyContent: "center" }}>
        {getActiveItems(data.menuItems, ind.menu).slice(0, isS ? 2 : 4).map((item, i) => (
          <EditableText key={i} value={` ${item}`} onChange={(v) => editMenu(i)(v.replace(/^ /, ""))} {...ef(`menuItem_${i}`)}
            style={{ color: "rgba(255,255,255,0.9)", fontSize: Math.max(9, 8*fScale) }} />
        ))}
    </div>
    {data.offer && (
      <Coupon
        offer={data.offer} fine={data.offerFine}
        accent={ind.colors.accent} scale={fScale * 0.85} dark
        onEditOffer={edit("offer")} onEditFine={edit("offerFine")}
      />
    )}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "sans-serif" }}>
      <div>
        {data.address && <EditableText value={data.address} onChange={edit("address")} {...ef("address")} style={{ color: "rgba(255,255,255,0.85)", fontSize: Math.max(10, 9*fScale), display: "block", whiteSpace: "normal", wordBreak: "break-word" }} />}
        {data.city && <EditableText value={data.city} onChange={edit("city")} {...ef("city")} style={{ color: "rgba(255,255,255,0.7)", fontSize: Math.max(9, 8*fScale), display: "block", whiteSpace: "normal" }} />}
        {isS && data.phone && <EditableText value={data.phone} onChange={edit("phone")} {...ef("phone")} style={{ color: "rgba(255,255,255,0.95)", fontSize: Math.max(11, 10*fScale), fontWeight: 700, display: "block", whiteSpace: "nowrap" }} />}
      </div>
    </div>
  </div>
  {!isS && <PositionedQR website={data.website} fScale={fScale} dark />}
</div>
);
}

//  Template Registry
//
// TEMPLATE 5: FADE-OUT
// Photo bleeds in from the right and fades to the brand color on the left.
// Left side: logo, business name, tagline, services, coupon, phone.
// Right side: photo with horizontal gradient fade.
// Matches the professional style of Hometown Realty / GreenScapes reference ads.
// Best for: real estate, home services, lawn care, roofing, HVAC
//
function FadeOutTemplate({ data, sizeKey, onEdit, onFontSizeChange, onWidthChange }) {
const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
const photo = data.photo || ind.photos[0];
const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.65;
const edit = (field) => (val) => onEdit(field, val);

// ef(): spread onto EditableText to enable the resize toolbar
const ef = (key) => ({
fieldKey: key,
fontSizes: data.fontSizes || {},
fieldWidths: data.fieldWidths || {},
onFontSizeChange,
onWidthChange,
});
const editMenu = (i) => (val) => onEdit("menuItems", data.menuItems.map((m, j) => {
if (j !== i) return m;
if (typeof m === "object") return { ...m, text: val };
return val;
}));

// The left color – use industry primary darkened slightly for richness
const leftBg = ind.colors.dark || ind.colors.primary;

// How wide the left content zone is (photo fills the rest)
// For XL (portrait): content left 55%, photo right 45%
// For L/M/S (landscape): content left 50%, photo right 50%
const contentWidth = isXL ? "58%" : isL ? "55%" : "52%";

// Bottom bar – amber/accent colored strip with phone + website
// (matching the GreenScapes / Hometown reference style)
const barBg = ind.colors.accent || ind.colors.primary;
const barTextColor = "#fff";

return (
<div style={{
width: "100%", height: "100%", position: "relative", overflow: "hidden",
background: leftBg, fontFamily: "sans-serif",
}}>
  {/* Photo side — right normally, left when flipped */}
  <div style={{
    position: "absolute",
    top: 0,
    right: 0,
    left: "auto",
    bottom: isS ? 0 : `${28*fScale}px`,
    width: "70%",
  }}>
    <img
      src={photo} alt=""
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
    {/* Horizontal fade: transparent on photo edge, full leftBg on content edge */}
    <div style={{
      position: "absolute", inset: 0,
      background: `linear-gradient(90deg, ${leftBg}ff 0%, ${leftBg}ee 30%, ${leftBg}88 50%, ${leftBg}22 70%, transparent 100%)`,
    }}/>
  </div>

  {/* Content area — left normally, right when flipped */}
  <div style={{
    position: "absolute",
    top: 0,
    left: 0,
    right: "auto",
    bottom: isS ? 0 : `${28*fScale}px`,
    width: contentWidth,
    padding: isXL ? `${14*fScale}px ${14*fScale}px` : `${10*fScale}px ${12*fScale}px`,
    display: "flex", flexDirection: "column",
    justifyContent: "space-between",
    zIndex: 2,
  }}>

    {/* TOP: Logo + business name + category */}
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7*fScale, marginBottom: 4*fScale }}>
        <LogoBadge
          logo={data.logo}
          name={data.businessName}
          emoji={ind.emoji}
          size={isXL ? 42*fScale : isS ? 22*fScale : 32*fScale}
          bg={`${ind.colors.accent}33`}
          color={ind.colors.accent}
          border={`2px solid ${ind.colors.accent}66`}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <EditableText
            value={data.businessName}
            onChange={edit("businessName")} {...ef("businessName")}
            style={{
              color: "#fff", fontWeight: 900,
              fontSize: isXL ? 19*fScale : isL ? 16*fScale : isM ? 12*fScale : 10*fScale,
              lineHeight: 1.15, fontFamily: "Georgia, serif",
              textShadow: "0 1px 6px rgba(0,0,0,0.5)",
              wordBreak: "break-word",
            }}
          />
        </div>
      </div>

      {/* Tagline -- all sizes */}
      <EditableText
        value={data.tagline || ind.taglines[0]}
        onChange={edit("tagline")} {...ef("tagline")}
        multiline
        style={{
          color: "#fff", fontWeight: 800,
          fontSize: isXL ? 14*fScale : isL ? 12*fScale : 9*fScale,
          lineHeight: 1.3, fontFamily: "Georgia, serif",
          marginBottom: 8*fScale, display: "block",
          wordBreak: "break-word",
        }}
      />

      {/* Service checklist -- 4 items XL/L/M, 2 for S */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5*fScale, marginTop: 4*fScale }}>
          {getActiveItems(data.menuItems, ind.menu).slice(0, isS ? 2 : 4).map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6*fScale }}>
              <svg width={12*fScale} height={12*fScale} viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
                <circle cx="7" cy="7" r="7" fill={ind.colors.accent}/>
                <path d="M4 7l2 2 4-4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
              <EditableText value={item} onChange={editMenu(i)} {...ef(`menuItem_${i}`)}
                style={{ color: "rgba(255,255,255,0.92)", fontSize: 10*fScale, fontWeight: 600, lineHeight: 1.3 }} />
            </div>
          ))}
      </div>

      {/* Coupon -- shows for M and S */}
      {(isM || isS) && data.offer && (
        <Coupon
          offer={data.offer} fine={data.offerFine}
          accent={ind.colors.accent} scale={fScale * 0.8} dark
          onEditOffer={edit("offer")} onEditFine={edit("offerFine")}
        />
      )}
    </div>

    {/* BOTTOM: coupon (XL/L) + address -- M gets address only */}
    {!isS && (
      <div style={{ display: "flex", flexDirection: "column", gap: 4*fScale }}>
        {data.offer && !isM && (
          <Coupon
            offer={data.offer} fine={data.offerFine}
            accent={ind.colors.accent} scale={fScale * 0.85} dark
            onEditOffer={edit("offer")} onEditFine={edit("offerFine")}
          />
        )}
        {data.address && (
          <EditableText
            value={data.address}
            onChange={edit("address")} {...ef("address")}
            style={{
              color: "rgba(255,255,255,0.85)", fontSize: Math.max(11, 9*fScale),
              fontFamily: "sans-serif", lineHeight: 1.3,
            }}
          />
        )}
        {data.city && (
          <EditableText
            value={data.city}
            onChange={edit("city")} {...ef("city")}
            style={{
              color: "rgba(255,255,255,0.7)", fontSize: Math.max(10, 8*fScale),
              fontFamily: "sans-serif", lineHeight: 1.3,
            }}
          />
        )}
      </div>
    )}

    {/* S only: phone + address inline since no bottom bar */}
    {isS && (
      <div style={{ marginTop: 4*fScale, display:"flex", flexDirection:"column", gap:3 }}>
        <EditableText
          value={data.phone}
          onChange={edit("phone")} {...ef("phone")}
          style={{
            color: ind.colors.accent, fontWeight: 900,
            fontSize: Math.max(11, 11*fScale), fontFamily: "sans-serif",
          }}
        />
        {data.address && (
          <EditableText value={data.address} onChange={edit("address")} {...ef("address")}
            style={{ color: "rgba(255,255,255,0.8)", fontSize: Math.max(10, 9*fScale), fontFamily:"sans-serif" }}/>
        )}
        {data.city && (
          <EditableText value={data.city} onChange={edit("city")} {...ef("city")}
            style={{ color: "rgba(255,255,255,0.65)", fontSize: Math.max(9, 8*fScale), fontFamily:"sans-serif" }}/>
        )}
      </div>
    )}
  </div>

  {/* Bottom bar: phone + website -- not shown for S (no room) */}
  {!isS && (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0,
      height: 28*fScale,
      background: barBg,
      display: "flex", alignItems: "center",
      justifyContent: "space-between",
      paddingLeft: 12*fScale, paddingRight: 12*fScale,
      zIndex: 3,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6*fScale }}>
        <svg width={12*fScale} height={12*fScale} viewBox="0 0 24 24" fill={barTextColor} style={{ flexShrink: 0 }}>
          <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
        </svg>
        <EditableText
          value={data.phone}
          onChange={edit("phone")}
          style={{
            color: barTextColor, fontWeight: 900,
            fontSize: isXL ? 16*fScale : isL ? 14*fScale : 11*fScale,
            fontFamily: "sans-serif", letterSpacing: -0.3,
          }}
        />
      </div>
    </div>
  )}
  {!isS && <PositionedQR website={data.website} fScale={fScale} dark />}
</div>
);
}

// TEMPLATE 6: BRUSH STROKE
// Cream/parchment background with circular photo on the left, SVG brush-stroke
// banners behind text, circular service icons, and a dark charcoal footer bar.
// Gives home-services businesses an outdoorsy, handcrafted feel.
// Best for: HVAC, Plumber, Electrician, Lawn & Landscaping, Roofing, Painting,
//           Cleaning Service, Pest Control
//
const BRUSH_ICONS = [
  // house
  <path d="M3 9.5L7 6l4 3.5V14H3V9.5z M6 14v-2.5h2V14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>,
  // paint roller
  <path d="M3 4h8v4H3zM7 8v4m0 0h2m-2 0H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none"/>,
  // wrench
  <path d="M12 2a4 4 0 00-4 4c0 .5.1 1 .3 1.4L2.7 13a1 1 0 000 1.4l.9.9a1 1 0 001.4 0L10.6 9.7A4 4 0 0012 10a4 4 0 000-8z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>,
  // water drop / faucet
  <path d="M8 2C6 5 4 7.5 4 9.5a4 4 0 008 0C12 7.5 10 5 8 2z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>,
];

function BrushStrokeCircleIcon({ index, size }) {
  const oliveRing = "#5a6e3a";
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
      <circle cx="7" cy="7" r="6.2" stroke={oliveRing} strokeWidth="1.2" fill="rgba(90,110,58,0.12)" />
      <g transform="translate(0,0)" color={oliveRing}>
        {BRUSH_ICONS[index % BRUSH_ICONS.length]}
      </g>
    </svg>
  );
}

function BrushBanner({ children, width = "100%", height = 26, fScale = 1, style = {} }) {
  const olive = "#5a6e3a";
  return (
    <div style={{ position: "relative", width, height: height * fScale, display: "flex", alignItems: "center", ...style }}>
      <svg width="100%" height={height * fScale} viewBox={`0 0 200 ${height}`} preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0 }}>
        <path d={`M4,${height * 0.25} C20,0 180,2 196,${height * 0.2} C200,${height * 0.55} 198,${height * 0.85} 196,${height * 0.78} C180,${height} 20,${height - 2} 4,${height * 0.8} C0,${height * 0.5} 0,${height * 0.4} 4,${height * 0.25} Z`}
          fill={olive} />
      </svg>
      <div style={{ position: "relative", zIndex: 1, width: "100%", paddingLeft: 10, paddingRight: 10 }}>
        {children}
      </div>
    </div>
  );
}

function BrushStrokeTemplate({ data, sizeKey, onEdit, onFontSizeChange, onWidthChange }) {
  const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
  const fallbackPhoto = "/IMG_0838_1780954099138.png";
  const photo = data.photo || ind.photos[0] || fallbackPhoto;
  const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
  const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.65;

  const edit = (field) => (val) => onEdit(field, val);
  const ef = (key) => ({
    fieldKey: key,
    fontSizes: data.fontSizes || {},
    fieldWidths: data.fieldWidths || {},
    onFontSizeChange,
    onWidthChange,
  });
  const editMenu = (i) => (val) => onEdit("menuItems", data.menuItems.map((m, j) => {
    if (j !== i) return m;
    if (typeof m === "object") return { ...m, text: val };
    return val;
  }));

  const parchment = "#f5f0e8";
  const olive = "#5a6e3a";
  const charcoal = "#1c2422";
  const activeItems = getActiveItems(data.menuItems, ind.menu);

  // S size: minimal — circular photo, brush-stroke name banner, phone only
  if (isS) {
    const cirSize = 60 * fScale;
    return (
      <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative", background: parchment, fontFamily: "sans-serif" }}>
        <div style={{ position: "absolute", top: 8 * fScale, left: 8 * fScale }}>
          <div style={{
            width: cirSize, height: cirSize, borderRadius: "50%", overflow: "hidden",
            border: `${2.5 * fScale}px solid ${olive}`, flexShrink: 0,
          }}>
            <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 12 * fScale, left: 8 * fScale, right: 8 * fScale }}>
          <BrushBanner height={20} fScale={fScale} style={{ marginBottom: 4 * fScale }}>
            <EditableText value={data.businessName} onChange={edit("businessName")} {...ef("businessName")}
              style={{ color: "#fff", fontWeight: 900, fontSize: 8 * fScale, lineHeight: 1, fontFamily: "Georgia, serif", whiteSpace: "nowrap", overflow: "hidden" }} />
          </BrushBanner>
          {data.phone && (
            <EditableText value={data.phone} onChange={edit("phone")} {...ef("phone")}
              style={{ color: charcoal, fontWeight: 700, fontSize: 8 * fScale, fontFamily: "sans-serif", display: "block" }} />
          )}
        </div>
      </div>
    );
  }

  // Photo circle dimensions
  const circleSize = isXL ? 110 * fScale : isL ? 90 * fScale : 72 * fScale;
  const footerH = 28 * fScale;
  const iconSize = isXL ? 16 * fScale : 13 * fScale;
  const maxItems = isM ? 3 : 4;
  const items = activeItems.slice(0, maxItems);
  // XL stacks icons vertically; L and M go horizontal
  const iconsVertical = isXL;

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative", background: parchment, fontFamily: "sans-serif" }}>

      {/* LEFT PANEL — circular photo */}
      <div style={{
        position: "absolute",
        top: isXL ? "12%" : "10%",
        left: isXL ? "4%" : "3%",
        width: circleSize,
        height: circleSize,
        borderRadius: "50%",
        overflow: "hidden",
        border: `${3 * fScale}px solid ${olive}`,
        boxShadow: `0 0 0 ${2.5 * fScale}px #e8e0ce`,
        zIndex: 2,
      }}>
        <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      {/* RIGHT PANEL — content */}
      <div style={{
        position: "absolute",
        top: 0,
        left: isXL ? "46%" : "44%",
        right: 0,
        bottom: footerH,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: isXL ? `${14 * fScale}px ${10 * fScale}px` : `${10 * fScale}px ${10 * fScale}px`,
        gap: 6 * fScale,
        zIndex: 2,
      }}>

        {/* Logo badge (top-right of content area) */}
        {!isM && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 2 * fScale }}>
            <LogoBadge
              logo={data.logo}
              name={data.businessName}
              emoji={ind.emoji}
              size={isXL ? 34 * fScale : 26 * fScale}
              bg={`${olive}22`}
              color={olive}
              border={`2px solid ${olive}66`}
            />
          </div>
        )}

        {/* Business name on brush-stroke banner */}
        <BrushBanner height={isXL ? 28 : 22} fScale={fScale}>
          <EditableText value={data.businessName} onChange={edit("businessName")} {...ef("businessName")}
            style={{
              color: "#fff", fontWeight: 900,
              fontSize: isXL ? 13 * fScale : isL ? 11 * fScale : 9 * fScale,
              fontFamily: "Georgia, serif", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden",
            }} />
        </BrushBanner>

        {/* Thin divider with diamond */}
        {!isM && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 * fScale, marginTop: -2 * fScale }}>
            <div style={{ flex: 1, height: 1, background: `${olive}55` }} />
            <div style={{ width: 5 * fScale, height: 5 * fScale, background: olive, transform: "rotate(45deg)", flexShrink: 0 }} />
            <div style={{ flex: 1, height: 1, background: `${olive}55` }} />
          </div>
        )}

        {/* Tagline */}
        {!isM && (
          <EditableText value={data.tagline || ind.taglines[0]} onChange={edit("tagline")} {...ef("tagline")}
            style={{ color: "#5c4a2a", fontWeight: 700, fontSize: isXL ? 9 * fScale : 8 * fScale, fontStyle: "italic", lineHeight: 1.3 }} />
        )}

        {/* Service icon rows */}
        <div style={{
          display: "flex",
          flexDirection: iconsVertical ? "column" : "row",
          flexWrap: iconsVertical ? "nowrap" : "wrap",
          gap: isXL ? 5 * fScale : 4 * fScale,
          alignItems: iconsVertical ? "flex-start" : "center",
          marginTop: isM ? 0 : 2 * fScale,
        }}>
          {items.map((item, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center",
              gap: 4 * fScale,
              background: `${olive}15`,
              borderRadius: 30,
              paddingLeft: 4 * fScale, paddingRight: 6 * fScale,
              paddingTop: 2 * fScale, paddingBottom: 2 * fScale,
              border: `1px solid ${olive}40`,
              flexShrink: 0,
            }}>
              <BrushStrokeCircleIcon index={i} size={iconSize} />
              <EditableText value={item} onChange={editMenu(i)} {...ef(`menuItem_${i}`)}
                style={{
                  color: charcoal, fontWeight: 700,
                  fontSize: isXL ? 8 * fScale : isL ? 7.5 * fScale : 7 * fScale,
                  lineHeight: 1, fontFamily: "sans-serif",
                }} />
            </div>
          ))}
        </div>
      </div>

      {/* FOOTER BAR */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: footerH,
        background: charcoal,
        display: "flex", alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: 10 * fScale, paddingRight: 44 * fScale,
        zIndex: 3,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 * fScale }}>
          {/* Phone */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 * fScale }}>
            <svg width={10 * fScale} height={10 * fScale} viewBox="0 0 24 24" fill="rgba(255,255,255,0.8)" style={{ flexShrink: 0 }}>
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
            <EditableText value={data.phone} onChange={edit("phone")} {...ef("phone")}
              style={{ color: "#fff", fontWeight: 900, fontSize: isXL ? 13 * fScale : isL ? 11 * fScale : 9 * fScale, fontFamily: "sans-serif", letterSpacing: -0.3 }} />
          </div>
          {/* City */}
          {data.city && (
            <div style={{ display: "flex", alignItems: "center", gap: 3 * fScale }}>
              <svg width={9 * fScale} height={9 * fScale} viewBox="0 0 24 24" fill="rgba(255,255,255,0.65)" style={{ flexShrink: 0 }}>
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              <EditableText value={data.city} onChange={edit("city")} {...ef("city")}
                style={{ color: "rgba(255,255,255,0.75)", fontWeight: 600, fontSize: isXL ? 10 * fScale : 8 * fScale, fontFamily: "sans-serif" }} />
            </div>
          )}
        </div>
      </div>

      <PositionedQR website={data.website} fScale={fScale} dark />
    </div>
  );
}

export const TEMPLATES = {
"photo-bold":    { name: "Photo Bold",    desc: "Hero photo, bold overlay text",            Component: PhotoBoldTemplate },
"split-clean":   { name: "Split Clean",   desc: "50/50 photo + content split",               Component: SplitCleanTemplate },
"magazine":      { name: "Magazine",      desc: "Editorial multi-photo layout",              Component: MagazineTemplate },
"stamp":         { name: "Service Stamp", desc: "Diagonal cut, oversized phone",             Component: StampTemplate },
"fade-out":      { name: "Fade Out",      desc: "Photo fades right to brand color",          Component: FadeOutTemplate },
"brush-stroke":  { name: "Brush Stroke",  desc: "Circle photo, painted banners, service icons", Component: BrushStrokeTemplate },
};

// Helper: normalize menuItems array (handles both string items and {text,enabled} objects)
// Returns only the enabled items as plain strings, for use in templates
function getActiveItems(menuItems, fallback) {
// Handle missing, empty, or malformed menuItems safely
if (!menuItems || !Array.isArray(menuItems) || menuItems.length === 0) {
return fallback || [];
}
const active = menuItems
.filter(m => m != null && (typeof m === "string" ? m.trim() !== "" : m.enabled !== false))
.map(m => (typeof m === "object" && m !== null) ? (m.text || "") : String(m));
// If ALL items are disabled/empty, fall back to industry defaults
if (active.length === 0) return fallback || [];
return active;
}

//  Smart template suggestion based on industry
function suggestTemplate(industry) {
const restaurantTypes = ["Pizza Restaurant", "Mexican Restaurant", "Chinese Restaurant",
"Breakfast & Cafe", "Bar & Grill", "Italian Restaurant", "Bakery", "Coffee Shop"];
const medicalTypes = ["Dentist", "Medical & Healthcare", "Chiropractor", "Veterinarian"];
const editorialTypes = ["Real Estate", "Insurance", "Financial Services", "Photography",
"Retail Shop", "Daycare", "Salon & Beauty"];
const serviceTypes = ["Auto Repair"];
const brushTypes = ["HVAC", "Plumber", "Electrician", "Lawn & Landscaping",
"Roofing", "Painting", "Cleaning Service", "Pest Control"];

if (restaurantTypes.includes(industry)) return "photo-bold";
if (medicalTypes.includes(industry)) return "split-clean";
if (editorialTypes.includes(industry)) return "magazine";
if (brushTypes.includes(industry)) return "brush-stroke";
if (serviceTypes.includes(industry)) return "stamp";
return "split-clean";
}

//  Render dimensions for preview
function getRenderDimensions(sizeKey) {
// 1 inch = 55px fills the 530px preview column correctly for the 9" postcard.
// Real sizes match the picker exactly:
//   XL = 4x5"  -> 220x275px
//   L  = 4x3"  -> 220x165px
//   M  = 3x2"  -> 165x110px
//   S  = 2x2"  -> 110x110px
const PX_PER_INCH = 55;
const sizes = {
XL: { w: 4, h: 5 },
L:  { w: 4, h: 3 },
M:  { w: 3, h: 2 },
S:  { w: 2, h: 2 },
};
const s = sizes[sizeKey] || sizes.L;
return { width: s.w * PX_PER_INCH, height: s.h * PX_PER_INCH };
}

//
//   IMAGE UPLOAD INPUT
//
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
Uploaded<br />
<span style={{ color: "#6b7280", fontWeight: 400 }}>Click to change</span>
</div>
</>
) : (
<>
<span style={{ fontSize: 18 }}></span>
<div style={{ fontSize: 11, color: "#6b7280" }}>Click to upload</div>
</>
)}
</div>
<input ref={ref} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
</div>
);
}

//
//   MAIN COMPONENT – Full UI with form, template picker, preview
//
export default function AdGenerator({ initialSize = "L", onComplete, onClose, isReserving = false, reserveError = null, takenCategories = [] }) {
const [sizeKey, setSizeKey] = useState(initialSize);
const [step, setStep] = useState(1);
const [formData, setFormData] = useState({
businessName: "",
email: "",
industry: "",
tagline: "",
offer: "",
offerFine: "",
address: "",
city: "",
phone: "",
website: "",
logo: null,
photo: null,
menuItems: [],
fontSizes: {},
fieldWidths: {},
});
const [selectedTemplate, setSelectedTemplate] = useState("photo-bold");
const [emailError, setEmailError] = useState(false);
const emailRef = useRef(null);
const { suggestion: emailSuggestion, check: checkEmail, dismiss: dismissEmailSuggestion, clear: clearEmailSuggestion } = useEmailSuggestion();
const [conflictIndustry, setConflictIndustry] = useState(null);

// Grok-generated ad state (populated via postMessage from the Grok popup)
const [generatedImageUrl, setGeneratedImageUrl] = useState(null);
const [originalGrokImageUrl, setOriginalGrokImageUrl] = useState(null);
const [refineInstruction, setRefineInstruction] = useState("");
const [refineError, setRefineError] = useState("");
const { mutateAsync: refineGrokAd, isPending: isRefining } = useRefineGrokAd();

// Listen for Grok popup returning a finished ad via postMessage
useEffect(() => {
  const handleMessage = (event) => {
    if (event.data?.type === "grok-ad-result" && event.data.formData?.finishedAdUrl) {
      const url = event.data.formData.finishedAdUrl;
      setGeneratedImageUrl(url);
      setOriginalGrokImageUrl(url);
      setRefineInstruction("");
      setRefineError("");
    }
  };
  window.addEventListener("message", handleMessage);
  return () => window.removeEventListener("message", handleMessage);
}, []);

const handleRefine = useCallback(async () => {
  if (!generatedImageUrl || !refineInstruction.trim()) {
    setRefineError("Please describe the change you want (e.g. \"Remove the word Shield\").");
    return;
  }
  setRefineError("");
  try {
    const result = await refineGrokAd({
      data: {
        imageDataUrl: generatedImageUrl,
        instruction: refineInstruction.trim(),
        sizeKey: sizeKey || "XL",
        template: selectedTemplate || "parchment-classic",
      },
    });
    setGeneratedImageUrl(result.imageUrl);
    setRefineInstruction("");
  } catch (err) {
    const serverMsg = err?.response?.data?.error ?? err?.message;
    setRefineError(
      serverMsg === "overloaded"
        ? "The image generator is busy right now — please try again in a moment."
        : (serverMsg ?? "Refinement failed — please try again.")
    );
  }
}, [generatedImageUrl, refineInstruction, sizeKey, refineGrokAd]);

// Auto-suggest template + populate menuItems when industry changes
const handleIndustryChange = (e) => {
const industry = e.target.value;
if (industry && takenCategories.includes(industry)) {
  setConflictIndustry(industry);
  return;
}
const defaultMenu = INDUSTRIES[industry]?.menu || [];
// Convert to {text, enabled} objects immediately for consistent format
const normalizedMenu = defaultMenu.map(item =>
typeof item === "object" ? item : { text: item, enabled: true }
);
setFormData(d => ({ ...d, industry, menuItems: normalizedMenu }));
if (industry) setSelectedTemplate(suggestTemplate(industry));
};

// Handler for inline edits made directly in the preview
const handleInlineEdit = useCallback((field, value) => {
setFormData(d => ({ ...d, [field]: value }));
}, []);

const handleFontSizeChange = useCallback((fieldKey, px) => {
setFormData(d => ({
...d,
fontSizes: { ...d.fontSizes, [fieldKey]: px === null ? undefined : px },
}));
}, []);

const handleWidthChange = useCallback((fieldKey, pct) => {
setFormData(d => ({
...d,
fieldWidths: { ...d.fieldWidths, [fieldKey]: pct === null ? undefined : pct },
}));
}, []);

const dims = getRenderDimensions(sizeKey);
const sizeInfo = AD_SIZES[sizeKey];
const Tpl = TEMPLATES[selectedTemplate].Component;
const formValid = formData.businessName.trim() && formData.industry && formData.email.trim();

return (<>
<div style={{
position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
padding: 16, paddingBottom: "max(16px, env(safe-area-inset-bottom))",
}}>
<div className="ad-generator-modal" style={{
background: "#f8fafc", borderRadius: 18, width: "100%", maxWidth: 1280,
overflow: "hidden", display: "flex", flexDirection: "column",
boxShadow: "0 40px 100px rgba(0,0,0,0.4)", fontFamily: "system-ui, sans-serif",
}}>
    {/* Header */}
    <div style={{
      padding: "16px 24px", borderBottom: "1px solid #e5e7eb", background: "#fff",
      display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
    }}>
      <div>
        <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
          Build Your Ad
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#111", fontFamily: "Georgia, serif" }}>
          {sizeInfo.label} Ad &nbsp;<span style={{ color: "#991b1b" }}>${sizeInfo.price}</span>
        </div>
      </div>
      <button onClick={onClose} style={{
        background: "#f3f4f6", border: "none", borderRadius: "50%", width: 36, height: 36,
        cursor: "pointer", fontSize: 20, color: "#374151",
      }}>x</button>
    </div>

    {/* Body -- three columns: form | preview | assistant */}
    <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

      {/* LEFT: form */}
      <div style={{ width: 380, padding: "20px 24px", overflowY: "auto", borderRight: "1px solid #e5e7eb", background: "#fff", flexShrink: 0 }}>

        {/* Form fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>
              Business Name *
            </label>
            <input
              value={formData.businessName}
              onChange={e => setFormData(d => ({ ...d, businessName: e.target.value }))}
              placeholder="e.g. Joe's Pizza"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: emailError ? "#dc2626" : "#374151", display: "block", marginBottom: 3 }}>
              Email Address *{emailError && <span style={{ fontWeight: 400, marginLeft: 6, fontSize: 11 }}>Required to receive your ad proof</span>}
            </label>
            <input
              ref={emailRef}
              type="email"
              value={formData.email}
              onChange={e => { setFormData(d => ({ ...d, email: e.target.value })); if (e.target.value.trim()) setEmailError(false); clearEmailSuggestion(); }}
              onBlur={e => checkEmail(e.target.value)}
              placeholder="you@yourbusiness.com"
              style={{ ...inputStyle, borderColor: emailError ? "#dc2626" : undefined, background: emailError ? "#fef2f2" : undefined, outline: emailError ? "2px solid #fca5a5" : undefined }}
            />
            <EmailSuggestionHint
              suggestion={emailSuggestion}
              onAccept={v => { setFormData(d => ({ ...d, email: v })); dismissEmailSuggestion(); }}
              onDismiss={dismissEmailSuggestion}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>
              Industry *
            </label>
            <select value={formData.industry} onChange={handleIndustryChange} style={inputStyle}>
              <option value="">Select your industry...</option>
              {INDUSTRY_LIST.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>
              Tagline / Slogan
            </label>
            <input
              value={formData.tagline}
              onChange={e => setFormData(d => ({ ...d, tagline: e.target.value }))}
              placeholder={formData.industry ? INDUSTRIES[formData.industry]?.taglines[0] : "Your catchy slogan"}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>
                Special Offer
              </label>
              <input
                value={formData.offer}
                onChange={e => setFormData(d => ({ ...d, offer: e.target.value }))}
                placeholder="$10 OFF"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>
                Offer Fine Print
              </label>
              <input
                value={formData.offerFine}
                onChange={e => setFormData(d => ({ ...d, offerFine: e.target.value }))}
                placeholder="Expires 6/30"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>
              Phone Number
            </label>
            <input
              value={formData.phone}
              onChange={e => setFormData(d => ({ ...d, phone: e.target.value }))}
              placeholder="(555) 123-4567"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>
                Street Address
              </label>
              <input
                value={formData.address}
                onChange={e => setFormData(d => ({ ...d, address: e.target.value }))}
                placeholder="596 W Louise St"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>
                City, State
              </label>
              <input
                value={formData.city}
                onChange={e => setFormData(d => ({ ...d, city: e.target.value }))}
                placeholder="Clarkesville, GA"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>
              Website <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
            </label>
            <input
              value={formData.website}
              onChange={e => setFormData(d => ({ ...d, website: e.target.value }))}
              placeholder="www.yourbusiness.com"
              style={inputStyle}
            />
            {formData.website ? (
              <div style={{ fontSize: 11, color: "#16a34a", marginTop: 4, padding: "5px 8px", background: "#f0fdf4", borderRadius: 6, display: "flex", alignItems: "center", gap: 5 }}>
                <span></span>
                <span>A trackable QR code will be added to your ad automatically!</span>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                Add your website to get a free trackable QR code on your ad
              </div>
            )}
          </div>

          {/* Services / Menu Items */}
          {formData.industry && (
            <div style={{ paddingTop: 12, borderTop: "1px solid #f3f4f6" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
                  Services / Menu Items
                  <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6, fontSize: 11 }}>
                    ({(formData.menuItems||[]).filter(m => typeof m === "string" || m.enabled !== false).length} showing in ad)
                  </span>
                </label>
                <button
                  onClick={() => setFormData(d => ({ ...d, menuItems: [...(d.menuItems||[]), { text: "New Item", enabled: true }] }))}
                  style={{ background: "#991b1b", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                  + Add
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {(formData.menuItems||[]).map((item, i) => {
                  const isObj = typeof item === "object";
                  const text = isObj ? item.text : item;
                  const active = isObj ? item.enabled !== false : true;
                  const update = (patch) => setFormData(d => ({
                    ...d,
                    menuItems: d.menuItems.map((m, j) => {
                      if (j !== i) return m;
                      const base = typeof m === "object" ? m : { text: m, enabled: true };
                      return { ...base, ...patch };
                    })
                  }));
                  const remove = () => setFormData(d => ({ ...d, menuItems: d.menuItems.filter((_, j) => j !== i) }));
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: active ? "#fff" : "#f9fafb", border: "1px solid " + (active ? "#e5e7eb" : "#f3f4f6"), borderRadius: 8, padding: "5px 8px", opacity: active ? 1 : 0.5, transition: "all 0.15s" }}>
                      {/* Toggle switch */}
                      <button onClick={() => update({ enabled: !active })} title={active ? "Hide from ad" : "Show in ad"}
                        style={{ width: 30, height: 17, borderRadius: 9, border: "none", background: active ? "#991b1b" : "#d1d5db", position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.2s", padding: 0 }}>
                        <span style={{ position: "absolute", top: 2.5, left: active ? 15 : 3, width: 12, height: 12, borderRadius: "50%", background: "#fff", transition: "left 0.2s", display: "block" }}/>
                      </button>
                      {/* Editable text */}
                      <input
                        value={text}
                        onChange={e => update({ text: e.target.value })}
                        style={{ flex: 1, border: "none", outline: "none", fontSize: 12, color: "#111", background: "transparent", fontFamily: "sans-serif", textDecoration: active ? "none" : "line-through" }}
                      />
                      {/* Delete button */}
                      <button onClick={remove} title="Remove item"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 14, lineHeight: 1, padding: "0 2px", flexShrink: 0, fontWeight: 700 }}>
                        x
                      </button>
                    </div>
                  );
                })}
              </div>
              {(formData.menuItems||[]).length === 0 && (
                <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", padding: "10px 0", fontStyle: "italic" }}>
                  No items yet. Click + Add to add services or menu items.
                </div>
              )}
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6, lineHeight: 1.5 }}>
                Toggle items on/off to show or hide them in your ad. The number visible depends on your ad size and template style.
              </div>
            </div>
          )}

          {/* Logo upload */}
          <div style={{ paddingTop: 8, borderTop: "1px solid #f3f4f6" }}>
            <ImageUpload label="Your Logo" hint="Optional"
              value={formData.logo} onChange={v => setFormData(d => ({ ...d, logo: v }))} />
          </div>

          {/* Photo upload */}
          <div style={{ paddingTop: 12, borderTop: "1px solid #f3f4f6" }}>
            <ImageUpload label="Ad Photo" hint="Optional — Grok generates one if left blank"
              value={formData.photo} onChange={v => setFormData(d => ({ ...d, photo: v }))} />
          </div>
        </div>

        {/* Template picker */}
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#111", marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>
            Design Style
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {TEMPLATE_STYLES.map(tpl => (
              <button key={tpl} onClick={() => setSelectedTemplate(tpl)}
                style={{
                  padding: "8px 10px", borderRadius: 8,
                  border: `2px solid ${selectedTemplate === tpl ? "#991b1b" : "#e5e7eb"}`,
                  background: selectedTemplate === tpl ? "#fef2f2" : "#fff",
                  cursor: "pointer", textAlign: "left",
                }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: "#111" }}>
                  {TEMPLATES[tpl].name}
                </div>
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1, lineHeight: 1.3 }}>
                  {TEMPLATES[tpl].desc}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CENTER: live preview */}
      <div style={{
        flex: 1, padding: "20px 24px", overflowY: "auto", display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
        background: "linear-gradient(135deg, #1e293b, #0f172a)",
      }}>
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
          Live Preview - {sizeInfo.label} - {sizeInfo.ratio}
        </div>

        {formValid ? (
          <>
            <style>{EDITABLE_CSS}</style>

            {/* Label */}
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginBottom: 10, textAlign: "center", fontFamily: "sans-serif" }}>
              {sizeInfo.label} - {AD_SIZES[sizeKey].width}" x {AD_SIZES[sizeKey].height}" - ${sizeInfo.price}
            </div>

            {/* Ad preview -- natural pixel dimensions matching the actual print sizes */}
            {(() => {
              // Natural template render dimensions (100px/inch, scaled to fit preview panel)
              const naturalDims = { XL: { w: 400, h: 500 }, L: { w: 300, h: 400 }, M: { w: 300, h: 200 }, S: { w: 200, h: 200 } };
              const { w: nw, h: nh } = naturalDims[sizeKey] || { w: 400, h: 500 };
              // Target preview widths — XL/L shrunk so Reserve button stays above the fold;
              // height is always derived from the natural aspect ratio.
              const previewWidths = { XL: 300, L: 225, M: 300, S: 200 };
              const pw = previewWidths[sizeKey] ?? 300;
              const ph = Math.round(pw * (nh / nw));
              const tScale = pw / nw;
              return (
                <div style={{ position: "relative", width: pw, height: ph, borderRadius: 6, overflow: "hidden", boxShadow: "0 12px 48px rgba(0,0,0,0.6)", flexShrink: 0 }}>
                  <div style={{ width: nw, height: nh, transform: `scale(${tScale})`, transformOrigin: "top left" }}>
                    <Tpl data={formData} sizeKey={sizeKey} onEdit={handleInlineEdit} onFontSizeChange={handleFontSizeChange} onWidthChange={handleWidthChange} />
                  </div>
                </div>
              );
            })()}

            <div style={{ color: "#111827", background: "rgba(255,255,255,0.92)", fontSize: 14, fontWeight: 800, marginTop: 10, textAlign: "center", fontStyle: "normal", padding: "8px 12px", borderRadius: 999, boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
               Click any text in the preview to edit it directly
            </div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginTop: 4, textAlign: "center" }}>
              Style: <strong style={{ color: "#fff" }}>{TEMPLATES[selectedTemplate].name}</strong>
              {!formData.photo && <> — AI will generate hero photo</>}
            </div>

            {/* Grok-generated ad + refine panel */}
            {generatedImageUrl && (
              <div style={{
                marginTop: 16, background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.15)",
                borderRadius: 12, overflow: "hidden", width: "100%", maxWidth: 400,
              }}>
                <div style={{
                  padding: "8px 14px", background: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(255,255,255,0.1)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#86efac" }}>
                    ✓ Grok-Generated Ad
                  </span>
                  {generatedImageUrl !== originalGrokImageUrl && (
                    <button
                      onClick={() => { setGeneratedImageUrl(originalGrokImageUrl); setRefineError(""); }}
                      style={{ background: "none", border: "none", color: "#fbbf24", fontSize: 11, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
                      ↩ Revert to original
                    </button>
                  )}
                </div>
                <img
                  src={generatedImageUrl}
                  alt="Grok-generated ad"
                  style={{ display: "block", width: "100%", maxHeight: 360, objectFit: "contain", background: "#000" }}
                />
                <div style={{ padding: "10px 12px", background: "rgba(0,0,0,0.25)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: 7 }}>
                    ✏ Refine this ad
                  </div>
                  <div style={{ display: "flex", gap: 7 }}>
                    <input
                      value={refineInstruction}
                      onChange={e => { setRefineInstruction(e.target.value); setRefineError(""); }}
                      onKeyDown={e => e.key === "Enter" && handleRefine()}
                      placeholder='e.g. "Remove the word Shield"'
                      disabled={isRefining}
                      maxLength={300}
                      style={{
                        flex: 1, padding: "8px 10px", borderRadius: 7,
                        border: "1.5px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)",
                        color: "#fff", fontSize: 13, outline: "none", fontFamily: "system-ui, sans-serif",
                        opacity: isRefining ? 0.6 : 1,
                      }}
                    />
                    <button
                      onClick={handleRefine}
                      disabled={isRefining || !refineInstruction.trim()}
                      style={{
                        padding: "8px 16px", background: isRefining ? "#6b7280" : "#991b1b",
                        color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 700,
                        cursor: isRefining || !refineInstruction.trim() ? "not-allowed" : "pointer",
                        whiteSpace: "nowrap", fontFamily: "system-ui, sans-serif", flexShrink: 0,
                        opacity: !refineInstruction.trim() && !isRefining ? 0.55 : 1,
                      }}>
                      {isRefining ? "Applying…" : "Apply"}
                    </button>
                  </div>
                  {isRefining && (
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
                      ⏳ Grok is applying your change… (20–40 seconds)
                    </div>
                  )}
                  {refineError && (
                    <div style={{ fontSize: 11, color: "#fca5a5", marginTop: 6 }}>{refineError}</div>
                  )}
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 6, lineHeight: 1.4 }}>
                    Type a correction and press Apply. Grok updates only what you describe — everything else stays the same.
                  </div>
                </div>
              </div>
            )}

            {reserveError && (
              <div style={{ marginTop: 14, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 16px", color: "#991b1b", fontSize: 13, fontWeight: 600, textAlign: "center" }}>
                {reserveError}
              </div>
            )}
            <button
              disabled={isReserving}
              onClick={() => {
                if (!formData.email.trim()) {
                  setEmailError(true);
                  emailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                  emailRef.current?.focus();
                  return;
                }
                if (!emailSuggestion) checkEmail(formData.email);
                onComplete?.({ sizeKey, price: sizeInfo.price, template: selectedTemplate, ...formData });
              }}
              style={{
                marginTop: 12, padding: "14px 32px", background: isReserving ? "#6b7280" : "#991b1b",
                color: "#fff", border: "none", borderRadius: 10, fontSize: 15,
                fontWeight: 800, cursor: isReserving ? "not-allowed" : "pointer", letterSpacing: 0.5,
                opacity: isReserving ? 0.75 : 1,
              }}>
              {isReserving ? "Reserving your spot…" : `Approve & Reserve Spot — $${sizeInfo.price}`}
            </button>
          </>
        ) : (
          <div style={{
            width: { XL: 360, L: 270, M: 300, S: 200 }[sizeKey] || 360,
            height: { XL: 450, L: 360, M: 200, S: 200 }[sizeKey] || 450,
            borderRadius: 6, border: "2px dashed rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.04)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", padding: 20,
            flexShrink: 0,
          }}>
            Fill in your business name and<br />industry to see your ad preview
          </div>
        )}
      </div>

      {/* RIGHT: AI Assistant */}
      <div style={{ width: 320, borderLeft: "1px solid #e5e7eb", display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
        <AdAssistant
          formData={formData}
          onUpdate={handleInlineEdit}
          sizeKey={sizeKey}
        />
      </div>

    </div>
  </div>
</div>
{conflictIndustry && (
  <IndustryConflictDialog
    industry={conflictIndustry}
    businessName={formData.businessName}
    onChooseDifferent={() => { setConflictIndustry(null); setFormData(d => ({ ...d, industry: "" })); }}
    onDismiss={() => setConflictIndustry(null)}
  />
)}
</>
);
}

// Reusable styles
const inputStyle = {
width: "100%", padding: "9px 12px", borderRadius: 7,
border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none",
fontFamily: "system-ui, sans-serif", boxSizing: "border-box", background: "#fff",
};

// ── Read-only template renderer for the postcard picker grid ────────────────
// Renders the exact same template the customer designed, at the spot's natural
// pixel dimensions, with all interactive handlers disabled (pointer-events off
// is applied by the caller via a wrapper div).
export function AdTemplatePreview({ templateKey, formData, sizeKey }) {
  const Tpl = (TEMPLATES[templateKey] || TEMPLATES["split-clean"]).Component;
  if (!Tpl) return null;
  return (
    <Tpl
      data={formData}
      sizeKey={sizeKey}
      onEdit={() => {}}
      onFontSizeChange={() => {}}
      onWidthChange={() => {}}
    />
  );
}