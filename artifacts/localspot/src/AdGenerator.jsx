import { useState, useRef, useCallback } from "react";
import { INDUSTRIES, INDUSTRY_LIST } from "./industryAssets";
import { AdQRCode, InlineQRCode, hasQR, normalizeWebsite, generateSpotCode } from "./qrUtils";
import AdAssistant from "./AdAssistant";

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
const AD_SIZES = {
XL: { label: "Extra Large", price: 499, ratio: "4:5",  width: 4, height: 5,   desc: "Hero spot - maximum impact" },
L:  { label: "Large",       price: 399, ratio: "4:3",  width: 4, height: 3,   desc: "Premium placement" },
M:  { label: "Medium",      price: 299, ratio: "3:2",  width: 3, height: 2,   desc: "Great visibility" },
S:  { label: "Small",       price: 199, ratio: "2:2",  width: 2, height: 2,   desc: "Affordable local reach" },
};

// 4 visually distinct template styles
const TEMPLATE_STYLES = ["photo-bold", "split-clean", "magazine", "stamp", "fade-out"];

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
<div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${ind.colors.dark}99 0%, ${ind.colors.dark}55 40%, ${ind.colors.dark}f0 100%)` }} />
  {/* Top: logo + name */}
  <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: `${10*fScale}px ${12*fScale}px`, display: "flex", alignItems: "center", gap: 8*fScale }}>
    <LogoBadge logo={data.logo} name={data.businessName} emoji={ind.emoji} size={36*fScale} bg={`${ind.colors.primary}cc`} color="#fff" />
    <div style={{ flex: 1, minWidth: 0 }}>
      <EditableText value={data.businessName} onChange={edit("businessName")} {...ef("businessName")}
        style={{ color: "#fff", fontWeight: 900, fontSize: 16*fScale, lineHeight: 1.05, textShadow: "0 2px 8px rgba(0,0,0,0.7)" }} />
      {!isS && (
        <EditableText value={data.industry} onChange={edit("industry")}
          style={{ color: "rgba(255,255,255,0.85)", fontSize: 8*fScale, marginTop: 2, fontFamily: "sans-serif", letterSpacing: 1, textTransform: "uppercase" }} />
      )}
    </div>
  </div>

  {/* Center: tagline */}
  {!isS && (
    <div style={{ position: "absolute", top: "28%", left: 12*fScale, right: 12*fScale, textAlign: "center" }}>
      <EditableText value={data.tagline || ind.taglines[0]} onChange={edit("tagline")} {...ef("tagline")}
        style={{ color: "#fff", fontWeight: 800, fontSize: (isXL?22:isL?18:14)*fScale, lineHeight: 1.1, fontStyle: "italic", textShadow: "0 2px 12px rgba(0,0,0,0.8)", textAlign: "center" }} />
    </div>
  )}

  {/* Menu / services list — 2 items on S, 4 on all larger sizes */}
  <div style={{ position: "absolute", top: "44%", left: 12*fScale, right: 12*fScale, display: "flex", flexDirection: "column", gap: 3*fScale }}>
    {getActiveItems(data.menuItems, ind.menu).slice(0, isS ? 2 : 4).map((item, i) => (
      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6*fScale }}>
        <div style={{ width: 12*fScale, height: 12*fScale, borderRadius: "50%", background: ind.colors.primary, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
        {data.phone && (
          <EditableText value={data.phone} onChange={edit("phone")} {...ef("phone")}
            style={{ color: "rgba(255,255,255,0.85)", fontSize: 9*fScale, fontWeight: 800, fontFamily: "sans-serif", whiteSpace: "normal" }} />
        )}
      </div>
      {hasQR(data) && !isS && (
        <AdQRCode
          website={normalizeWebsite(data.website)}
          spotCode={generateSpotCode(data.businessName, "current")}
          size={isXL ? 54 : isL ? 46 : 34}
          dark={true}
          showLabel={false}
          scale={fScale * 0.7}
        />
      )}
    </div>
  </div>
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
width: "100%", height: "100%", overflow: "hidden", display: "flex",
flexDirection: isVertical ? "column" : "row",
background: ind.colors.light, fontFamily: "sans-serif",
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
  <div style={{ flex: 1, padding: `${10*fScale}px ${12*fScale}px`, display: "flex", flexDirection: "column", justifyContent: "space-between", background: ind.colors.light, minWidth: 0 }}>
    {/* Top */}
    <div>
      <div style={{ color: ind.colors.accent, fontSize: 8*fScale, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 3 }}>{data.industry}</div>
      <EditableText value={data.businessName} onChange={edit("businessName")} {...ef("businessName")}
        style={{ color: ind.colors.dark, fontWeight: 900, fontSize: 20*fScale, fontFamily: "Georgia, serif", lineHeight: 1.0 }} />
      {!isS && (
        <EditableText value={data.tagline || ind.taglines[0]} onChange={edit("tagline")} {...ef("tagline")}
          style={{ fontSize: 11*fScale, color: ind.colors.primary, fontWeight: 700, marginTop: 4, fontStyle: "italic" }} />
      )}
    </div>

    {/* Middle: editable services list -- show on L and XL and M */}
    <div style={{ display: "flex", flexDirection: "column", gap: 3*fScale, margin: `${5*fScale}px 0` }}>
        {getActiveItems(data.menuItems, ind.menu).slice(0, isS ? 2 : 4).map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ width: 14*fScale, height: 14*fScale, borderRadius: "50%", background: ind.colors.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
            <EditableText value={data.address.split(",")[0]} onChange={edit("address")} {...ef("address")}
              style={{ fontSize: Math.max(11, 10*fScale), color: "#555", whiteSpace: "normal", wordBreak: "break-word" }} />
          )}
          {data.phone && (
            <EditableText value={data.phone} onChange={edit("phone")} {...ef("phone")}
              style={{ fontSize: 14*fScale, color: ind.colors.primary, fontWeight: 900, whiteSpace: "nowrap" }} />
          )}
        </div>
        {hasQR(data) && !isS && (
          <AdQRCode
            website={normalizeWebsite(data.website)}
            spotCode={generateSpotCode(data.businessName, "current")}
            size={isXL ? 56 : isL ? 46 : 34}
            dark={false}
            showLabel={false}
            scale={fScale * 0.65}
          />
        )}
      </div>
    </div>
  </div>
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
width: "100%", height: "100%", overflow: "hidden", display: "flex", flexDirection: "column",
background: "#fff", fontFamily: "Georgia, serif",
border: `${3 * fScale}px solid ${ind.colors.primary}`, boxSizing: "border-box",
}}>
{/* Header bar */}
<div style={{
background: ind.colors.primary, padding: `${6 * fScale}px ${10 * fScale}px`,
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
      {photos.slice(0, 2).map((src, i) => (
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
      <div style={{ color: ind.colors.accent, fontSize: 8*fScale, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{data.industry}</div>
      <EditableText value={data.tagline || ind.taglines[0]} onChange={edit("tagline")} {...ef("tagline")}
        style={{ color: ind.colors.dark, fontSize: 16*fScale, fontWeight: 900, fontFamily: "Georgia, serif", lineHeight: 1.1, marginTop: 2 }} />
    </div>

    <div style={{ display: "flex", flexWrap: "wrap", gap: `${3*fScale}px ${10*fScale}px`, margin: `${4*fScale}px 0` }}>
        {getActiveItems(data.menuItems, ind.menu).slice(0, isS ? 2 : 4).map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ color: ind.colors.primary, fontSize: 9*fScale, fontWeight: 900, marginTop: 1 }}>&#8226;</span>
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
            <EditableText value={data.address.split(",")[0]} onChange={edit("address")} {...ef("address")}
              style={{ fontSize: Math.max(11, 10*fScale), color: "#555", fontFamily: "sans-serif", whiteSpace: "nowrap" }} />
          )}
          {data.phone && (
            <EditableText value={data.phone} onChange={edit("phone")} {...ef("phone")}
              style={{ fontSize: 12*fScale, color: ind.colors.primary, fontWeight: 900, fontFamily: "sans-serif", whiteSpace: "nowrap" }} />
          )}
        </div>
        {hasQR(data) && !isS && (
          <AdQRCode
            website={normalizeWebsite(data.website)}
            spotCode={generateSpotCode(data.businessName, "current")}
            size={isXL ? 54 : isL ? 44 : 34}
            dark={false}
            showLabel={false}
            scale={fScale * 0.65}
          />
        )}
      </div>
    </div>
  </div>
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
background: ind.colors.dark, fontFamily: "sans-serif",
}}>
{/* Diagonal photo on top half */}
<div style={{
position: "absolute", inset: 0,
clipPath: "polygon(0 0, 100% 0, 100% 55%, 0 75%)",
overflow: "hidden",
}}>
<img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
<div style={{
position: "absolute", inset: 0,
background: `linear-gradient(180deg, ${ind.colors.dark}50 0%, ${ind.colors.dark}cc 100%)`
}} />
</div>
  {/* Top: emergency/feature badge */}
  <div style={{
    position: "absolute", top: 8 * fScale, left: 10 * fScale, zIndex: 3,
  }}>
    <div style={{
      background: ind.colors.accent, color: ind.colors.dark, padding: `${3 * fScale}px ${8 * fScale}px`,
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
        style={{ color: ind.colors.accent, fontWeight: 900, fontSize: (isXL?28:isL?24:18)*fScale, lineHeight: 1, marginTop: 4, letterSpacing: -0.5, textShadow: "0 2px 12px rgba(0,0,0,0.8)", textAlign: "center" }} />
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
        {data.address && <EditableText value={data.address.split(",")[0]} onChange={edit("address")} {...ef("address")} style={{ color: "rgba(255,255,255,0.85)", fontSize: Math.max(10, 9*fScale), display: "block", whiteSpace: "nowrap" }} />}
        {isS && data.phone && <EditableText value={data.phone} onChange={edit("phone")} {...ef("phone")} style={{ color: "rgba(255,255,255,0.95)", fontSize: Math.max(11, 10*fScale), fontWeight: 700, display: "block", whiteSpace: "nowrap" }} />}
      </div>
      {hasQR(data) && !isS && (
        <InlineQRCode
          website={normalizeWebsite(data.website)}
          spotCode={generateSpotCode(data.businessName, "current")}
          size={isXL ? 52 : isL ? 44 : 34}
          dark={true}
          showLabel={false}
          scale={fScale * 0.72}
        />
      )}
    </div>
  </div>
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
  {/* Right: photo that fades out to the left */}
  <div style={{
    position: "absolute",
    top: 0, right: 0, bottom: isS ? 0 : `${28*fScale}px`,
    width: "70%",
  }}>
    <img
      src={photo} alt=""
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
    {/* Horizontal fade: transparent on right, full leftBg color on left */}
    <div style={{
      position: "absolute", inset: 0,
      background: `linear-gradient(90deg, ${leftBg}ff 0%, ${leftBg}ee 30%, ${leftBg}88 50%, ${leftBg}22 70%, transparent 100%)`,
    }}/>
  </div>

  {/* Left content area -- sits above the photo layer */}
  <div style={{
    position: "absolute",
    top: 0, left: 0, bottom: isS ? 0 : `${28*fScale}px`,
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
          <div style={{
            color: ind.colors.accent, fontSize: Math.max(8, 7*fScale), fontWeight: 700,
            letterSpacing: 1.5, textTransform: "uppercase", marginTop: 2,
          }}>
            {data.industry}
          </div>
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
      <div style={{ display: "flex", alignItems: "center", gap: 5*fScale }}>
        {hasQR(data) ? (
          <AdQRCode
            website={normalizeWebsite(data.website)}
            spotCode={generateSpotCode(data.businessName, "current")}
            size={isXL ? 36 : isL ? 30 : 24}
            dark
            showLabel={false}
            scale={fScale * 0.7}
          />
        ) : data.website ? (
          <EditableText
            value={data.website}
            onChange={edit("website")}
            style={{
              color: "rgba(255,255,255,0.88)", fontSize: isXL ? 10*fScale : 8*fScale,
              fontFamily: "sans-serif", fontWeight: 600,
            }}
          />
        ) : null}
      </div>
    </div>
  )}
</div>
);
}

const TEMPLATES = {
"photo-bold":  { name: "Photo Bold",    desc: "Hero photo, bold overlay text",   Component: PhotoBoldTemplate },
"split-clean": { name: "Split Clean",   desc: "50/50 photo + content split",      Component: SplitCleanTemplate },
"magazine":    { name: "Magazine",      desc: "Editorial multi-photo layout",     Component: MagazineTemplate },
"stamp":       { name: "Service Stamp", desc: "Diagonal cut, oversized phone",    Component: StampTemplate },
"fade-out":    { name: "Fade Out",      desc: "Photo fades right to brand color", Component: FadeOutTemplate },
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
const serviceTypes = ["HVAC", "Plumber", "Electrician", "Lawn & Landscaping",
"Roofing", "Painting", "Cleaning Service", "Pest Control", "Auto Repair"];

if (restaurantTypes.includes(industry)) return "photo-bold";
if (medicalTypes.includes(industry)) return "split-clean";
if (editorialTypes.includes(industry)) return "magazine";
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
export default function AdGenerator({ initialSize = "L", onComplete, onClose }) {
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

// Auto-suggest template + populate menuItems when industry changes
const handleIndustryChange = (e) => {
const industry = e.target.value;
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

return (
<div style={{
position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
}}>
<div style={{
background: "#f8fafc", borderRadius: 18, width: "100%", maxWidth: 1280, maxHeight: "94vh",
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
              onChange={e => { setFormData(d => ({ ...d, email: e.target.value })); if (e.target.value.trim()) setEmailError(false); }}
              placeholder="you@yourbusiness.com"
              style={{ ...inputStyle, borderColor: emailError ? "#dc2626" : undefined, background: emailError ? "#fef2f2" : undefined, outline: emailError ? "2px solid #fca5a5" : undefined }}
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

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 3 }}>
              Address
            </label>
            <input
              value={formData.address}
              onChange={e => setFormData(d => ({ ...d, address: e.target.value }))}
              placeholder="123 Main St, Your Town"
              style={inputStyle}
            />
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

          {/* Photo selection -- stock thumbnails + own upload */}
          {formData.industry && (() => {
            const ind = INDUSTRIES[formData.industry];
            const stockPhotos = ind?.photos || [];
            // The currently active photo URL (null means use photos[0] as default)
            const activePhoto = formData.photo || stockPhotos[0] || null;
            return (
              <div style={{ paddingTop: 12, borderTop: "1px solid #f3f4f6" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Ad Photo</label>
                  <span style={{ fontSize: 10, color: "#9ca3af" }}>
                    {formData.photo && !stockPhotos.includes(formData.photo) ? "Using your photo" : "Choose a stock photo"}
                  </span>
                </div>

                {/* Stock photo thumbnails -- 4 in a row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 10 }}>
                  {stockPhotos.map((url, i) => {
                    const isSelected = activePhoto === url && (stockPhotos.includes(formData.photo) || !formData.photo);
                    return (
                      <button key={i} onClick={() => setFormData(d => ({ ...d, photo: url }))}
                        style={{ padding: 0, border: "none", background: "none", cursor: "pointer", position: "relative", borderRadius: 8, overflow: "hidden" }}>
                        <img src={url} alt={"Stock photo " + (i+1)}
                          style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block", borderRadius: 8,
                            outline: isSelected ? "3px solid #991b1b" : "2px solid #e5e7eb",
                            outlineOffset: isSelected ? 1 : 0,
                            opacity: isSelected ? 1 : 0.75,
                            transition: "all 0.15s",
                          }}/>
                        {/* Selected checkmark */}
                        {isSelected && (
                          <div style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18,
                            background: "#991b1b", borderRadius: "50%", display: "flex",
                            alignItems: "center", justifyContent: "center" }}>
                            <span style={{ color: "#fff", fontSize: 10, fontWeight: 900, lineHeight: 1 }}>&#10003;</span>
                          </div>
                        )}
                        {/* Photo number badge */}
                        <div style={{ position: "absolute", bottom: 3, left: 4, fontSize: 8,
                          color: "#fff", fontWeight: 700, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
                          {i + 1}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Divider */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, height: 1, background: "#f3f4f6" }}/>
                  <span style={{ fontSize: 10, color: "#9ca3af", whiteSpace: "nowrap" }}>or upload your own</span>
                  <div style={{ flex: 1, height: 1, background: "#f3f4f6" }}/>
                </div>

                {/* Own photo upload */}
                <ImageUpload label="" hint="Upload your photo"
                  value={formData.photo && !stockPhotos.includes(formData.photo) ? formData.photo : null}
                  onChange={v => setFormData(d => ({ ...d, photo: v || stockPhotos[0] || null }))} />

                {/* Clear custom photo back to stock */}
                {formData.photo && !stockPhotos.includes(formData.photo) && (
                  <button onClick={() => setFormData(d => ({ ...d, photo: stockPhotos[0] || null }))}
                    style={{ marginTop: 6, fontSize: 11, color: "#6b7280", background: "none", border: "none",
                      cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                    Use stock photos instead
                  </button>
                )}
              </div>
            );
          })()}

          {!formData.industry && (
            <div style={{ paddingTop: 8, borderTop: "1px solid #f3f4f6" }}>
              <ImageUpload label="Your Photo" hint="Or select industry first for stock photos"
                value={formData.photo} onChange={v => setFormData(d => ({ ...d, photo: v }))} />
            </div>
          )}
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
              // Natural pixel dimensions at 100px/inch, scaled to fit preview panel
              // XL: 4"x5" portrait = 400x500 natural -> 360x450 preview
              // L:  3"x4" portrait = 300x400 natural -> 270x360 preview
              // M:  3"x2" landscape = 300x200 natural -> 300x200 preview
              // S:  2"x2" square   = 200x200 natural -> 200x200 preview
              const previewDims = {
                XL: { w: 360, h: 450 },
                L:  { w: 270, h: 360 },
                M:  { w: 300, h: 200 },
                S:  { w: 200, h: 200 },
              };
              const { w: pw, h: ph } = previewDims[sizeKey] || { w: 360, h: 450 };
              // Natural template render dimensions
              const naturalDims = { XL: { w: 400, h: 500 }, L: { w: 300, h: 400 }, M: { w: 300, h: 200 }, S: { w: 200, h: 200 } };
              const { w: nw, h: nh } = naturalDims[sizeKey] || { w: 400, h: 500 };
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
              {!formData.photo && formData.industry && <> - Using stock photo for {formData.industry}</>}
            </div>

            <button
              onClick={() => {
                if (!formData.email.trim()) {
                  setEmailError(true);
                  emailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                  emailRef.current?.focus();
                  return;
                }
                onComplete?.({ sizeKey, price: sizeInfo.price, template: selectedTemplate, ...formData });
              }}
              style={{
                marginTop: 20, padding: "14px 32px", background: "#991b1b",
                color: "#fff", border: "none", borderRadius: 10, fontSize: 15,
                fontWeight: 800, cursor: "pointer", letterSpacing: 0.5,
              }}>
              Approve &amp; Reserve Spot -- ${sizeInfo.price}
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