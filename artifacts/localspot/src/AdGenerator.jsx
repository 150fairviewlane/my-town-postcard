import { useState, useRef, useCallback, useEffect } from "react";
import { INDUSTRIES, INDUSTRY_LIST } from "./industryAssets";
import { AdQRCode, InlineQRCode, hasQR, normalizeWebsite, generateSpotCode } from "./qrUtils";
import AdAssistant from "./AdAssistant";

//
//   EDITABLE TEXT – click any text in the preview to edit it inline
//
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
{/* Tiny pencil hint on hover */}
<span style={{
position: "absolute", top: -8, right: -6,
fontSize: 9, opacity: 0, transition: "opacity 0.15s",
pointerEvents: "none", background: "rgba(0,0,0,0.7)",
color: "#fff", borderRadius: 3, padding: "1px 3px",
}} className="edit-hint"></span>
</div>
);
}

// Global CSS for hover hints
const EDITABLE_CSS = `.editable-text:hover { outline: 1.5px dashed rgba(255,255,255,0.5) !important; border-radius: 2px; } .editable-text:hover .edit-hint { opacity: 1 !important; } .editable-text { cursor: text !important; }`;

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
const TEMPLATE_STYLES = ["photo-bold", "split-clean", "magazine", "stamp"];

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
function Coupon({ offer, fine, accent, scale = 1, dark = false, onEditOffer, onEditFine }) {
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
marginTop: 5*scale, // ensures scissors aren't flush with parent edge
}}>
{/* Scissors strip */}
<div style={{ position: "absolute", top: -(1*scale), left: 0, right: 0, display: "flex", alignItems: "center", padding: `0 ${4*scale}px` }}>
<span style={{ fontSize: 10*scale, lineHeight: 1, flexShrink: 0, opacity: 0.8 }}></span>
<div style={{ flex: 1, marginLeft: 3*scale, borderTop: `${1.2*scale}px dashed ${accent}88` }} />
<span style={{ fontSize: 10*scale, lineHeight: 1, flexShrink: 0, opacity: 0.8, transform: "scaleX(-1)", display: "inline-block" }}></span>
</div>
{onEditOffer ? (
<EditableText value={offer} onChange={onEditOffer}
style={{ color: dark ? "#fff" : accent, fontWeight: 900, fontSize: 13*scale, lineHeight: 1.1, letterSpacing: 0.3, overflow: "hidden" }} />
) : (
<div style={{ color: dark ? "#fff" : accent, fontWeight: 900, fontSize: 13*scale, lineHeight: 1.1, letterSpacing: 0.3, overflow: "hidden" }}>{offer}</div>
)}
{fine && onEditFine ? (
<EditableText value={fine} onChange={onEditFine}
style={{ color: dark ? "rgba(255,255,255,0.7)" : "#666", fontSize: 7*scale, marginTop: 2, fontFamily: "sans-serif", overflow: "hidden" }} />
) : fine ? (
<div style={{ color: dark ? "rgba(255,255,255,0.7)" : "#666", fontSize: 7*scale, marginTop: 2, fontFamily: "sans-serif", overflow: "hidden" }}>{fine}</div>
) : null}
</div>
);
}

//
// TEMPLATE 1: PHOTO-BOLD
// Full-bleed photo background with overlay text
// Best for: restaurants, salons, photography
//
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

  {/* Top: logo + name */}
  <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: `${10*fScale}px ${12*fScale}px`, display: "flex", alignItems: "center", gap: 8*fScale }}>
    <LogoBadge logo={data.logo} name={data.businessName} emoji={ind.emoji} size={36*fScale} bg={`${ind.colors.primary}cc`} color="#fff" />
    <div style={{ flex: 1, minWidth: 0 }}>
      <EditableText value={data.businessName} onChange={edit("businessName")}
        style={{ color: "#fff", fontWeight: 900, fontSize: 16*fScale, lineHeight: 1.05, textShadow: "0 2px 8px rgba(0,0,0,0.7)" }} />
      {!isS && (
        <EditableText value={data.industry} onChange={edit("industry")}
          style={{ color: "rgba(255,255,255,0.85)", fontSize: 8*fScale, marginTop: 2, fontFamily: "sans-serif", letterSpacing: 1, textTransform: "uppercase" }} />
      )}
    </div>
  </div>

  {/* Center: tagline — capped so long text can't bleed into the bottom section */}
  {!isS && (
    <div style={{
      position: "absolute", top: "42%", left: 12*fScale, right: 12*fScale, textAlign: "center",
      maxHeight: `${(isXL ? 3 : 4) * (isXL?22:isL?18:14)*fScale * 1.25}px`,
      overflow: "hidden",
    }}>
      <EditableText value={data.tagline || ind.taglines[0]} onChange={edit("tagline")}
        style={{ color: "#fff", fontWeight: 800, fontSize: (isXL?22:isL?18:14)*fScale, lineHeight: 1.1, fontStyle: "italic", textShadow: "0 2px 12px rgba(0,0,0,0.8)", textAlign: "center" }} />
    </div>
  )}

  {/* Bottom: menu items (XL/L) + coupon + contact */}
  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: `${8*fScale}px ${12*fScale}px`, display: "flex", flexDirection: "column", gap: 4*fScale }}>
    {/* Descriptive items — shown on XL and L only */}
    {(isXL || isL) && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: `2px ${10*fScale}px`, marginBottom: 2*fScale }}>
        {(data.menuItems?.length ? data.menuItems : ind.menu).slice(0, isXL ? 3 : 2).map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 8*fScale, lineHeight: 1, fontFamily: "sans-serif" }}>•</span>
            <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 9*fScale, fontFamily: "sans-serif", fontWeight: 500, textShadow: "0 1px 4px rgba(0,0,0,0.6)", lineHeight: 1.3 }}>{item}</span>
          </div>
        ))}
      </div>
    )}
    {data.offer && <Coupon offer={data.offer} fine={data.offerFine} accent="#fff" scale={fScale} dark={true} onEditOffer={edit("offer")} onEditFine={edit("offerFine")} />}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", color: "rgba(255,255,255,0.85)", fontSize: 9*fScale, fontFamily: "sans-serif" }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {data.address && (
          <EditableText value={data.address.split(",")[0]} onChange={edit("address")}
            style={{ color: "rgba(255,255,255,0.85)", fontSize: 9*fScale, fontFamily: "sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} />
        )}
        {data.phone && (
          <EditableText value={data.phone} onChange={edit("phone")}
            style={{ color: "rgba(255,255,255,0.85)", fontSize: 9*fScale, fontWeight: 800, fontFamily: "sans-serif" }} />
        )}
      </div>
      {hasQR(data) && !isS && (
        <AdQRCode
          website={normalizeWebsite(data.website)}
          spotCode={generateSpotCode(data.businessName, "current")}
          size={isXL ? 44 : 36}
          dark={true}
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
function SplitCleanTemplate({ data, sizeKey, onEdit }) {
const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
const photo = data.photo || ind.photos[0];
const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.65;
const isVertical = isXL;
const edit = (field) => (val) => onEdit(field, val);
const editMenu = (i) => (val) => onEdit("menuItems", data.menuItems.map((m, j) => j === i ? val : m)); // XL goes photo-on-top, others side-by-side

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
  <div data-overflow-clip="1" style={{ flex: 1, padding: `${10*fScale}px ${12*fScale}px`, display: "flex", flexDirection: "column", justifyContent: "space-between", background: ind.colors.light, minWidth: 0, overflow: "hidden" }}>
    {/* Top */}
    <div>
      <div style={{ color: ind.colors.accent, fontSize: 8*fScale, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 3 }}>{data.industry}</div>
      <EditableText value={data.businessName} onChange={edit("businessName")}
        style={{ color: ind.colors.dark, fontWeight: 900, fontSize: 20*fScale, fontFamily: "Georgia, serif", lineHeight: 1.0 }} />
      {!isS && (
        <EditableText value={data.tagline || ind.taglines[0]} onChange={edit("tagline")}
          style={{ fontSize: 11*fScale, color: ind.colors.primary, fontWeight: 700, marginTop: 4, fontStyle: "italic" }} />
      )}
    </div>

    {/* Middle: editable services list -- show on L and XL and M */}
    {!isS && (
      <div style={{ display: "flex", flexDirection: "column", gap: 3*fScale, margin: `${5*fScale}px 0` }}>
        {(data.menuItems || ind.menu).slice(0, isXL ? 2 : isL ? 3 : 2).map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ width: 14*fScale, height: 14*fScale, borderRadius: "50%", background: ind.colors.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "#fff", fontSize: 8*fScale, fontWeight: 900 }}></span>
            </div>
            <EditableText value={item} onChange={editMenu(i)}
              style={{ fontSize: 10*fScale, color: "#222", fontWeight: 500, lineHeight: 1.2 }} />
          </div>
        ))}
      </div>
    )}

    {/* Bottom: contact + coupon */}
    <div style={{ flexShrink: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", overflow: "hidden" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {data.address && (
            <EditableText value={data.address.split(",")[0]} onChange={edit("address")}
              style={{ fontSize: 9*fScale, color: "#555", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} />
          )}
          {data.phone && (
            <EditableText value={data.phone} onChange={edit("phone")}
              style={{ fontSize: 14*fScale, color: ind.colors.primary, fontWeight: 900 }} />
          )}
        </div>
        {hasQR(data) && !isS && (
          <InlineQRCode
            website={normalizeWebsite(data.website)}
            spotCode={generateSpotCode(data.businessName, "current")}
            size={isXL ? 44 : 34}
            dark={false}
            scale={fScale * 0.65}
          />
        )}
      </div>
      <Coupon offer={data.offer} fine={data.offerFine} accent={ind.colors.primary} scale={fScale * 0.85}
        onEditOffer={edit("offer")} onEditFine={edit("offerFine")} />
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
{/* Header bar */}
<div style={{
background: ind.colors.primary, padding: `${6 * fScale}px ${10 * fScale}px`,
display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
}}>
<div style={{ display: "flex", alignItems: "center", gap: 7 * fScale, flex: 1, minWidth: 0 }}>
<LogoBadge logo={data.logo} name={data.businessName} emoji={ind.emoji}
size={32 * fScale} bg={ind.colors.accent} color="#fff" />
<div data-overflow-clip="1" style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
<EditableText value={data.businessName} onChange={edit("businessName")}
style={{ color: "#fff", fontWeight: 900, fontSize: 17*fScale, fontFamily: "Georgia, serif", lineHeight: 1.0, overflow: "hidden" }} />
</div>
</div>
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
  <div data-overflow-clip="1" style={{ flex: 1, padding: `${4*fScale}px ${10*fScale}px ${5*fScale}px`, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 0, overflow: "hidden" }}>
    <div>
      <div style={{ color: ind.colors.accent, fontSize: 8*fScale, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{data.industry}</div>
      <EditableText value={data.tagline || ind.taglines[0]} onChange={edit("tagline")}
        style={{ color: ind.colors.dark, fontSize: 16*fScale, fontWeight: 900, fontFamily: "Georgia, serif", lineHeight: 1.1, marginTop: 2 }} />
    </div>

    {!isS && !isM && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: `${3*fScale}px ${10*fScale}px`, margin: `${4*fScale}px 0` }}>
        {(data.menuItems || ind.menu).slice(0, 4).map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ color: ind.colors.primary, fontSize: 8*fScale }}></span>
            <EditableText value={item} onChange={editMenu(i)}
              style={{ fontSize: 10*fScale, color: "#333", fontFamily: "sans-serif", fontWeight: 500 }} />
          </div>
        ))}
      </div>
    )}

    {/* Bottom: address row then coupon row */}
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 3*fScale, overflow: "hidden", paddingBottom: 2*fScale }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", overflow: "hidden" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          {data.address && (
            <EditableText value={data.address.split(",")[0]} onChange={edit("address")}
              style={{ fontSize: 9*fScale, color: "#555", fontFamily: "sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} />
          )}
          {data.phone && (
            <EditableText value={data.phone} onChange={edit("phone")}
              style={{ fontSize: 12*fScale, color: ind.colors.primary, fontWeight: 900, fontFamily: "sans-serif" }} />
          )}
        </div>
        {(isXL || isL) && hasQR(data) && (
          <InlineQRCode
            website={normalizeWebsite(data.website)}
            spotCode={generateSpotCode(data.businessName, "current")}
            size={isXL ? 40 : 32}
            dark={false}
            scale={fScale * 0.65}
          />
        )}
      </div>
      <Coupon offer={data.offer} fine={data.offerFine} accent={ind.colors.primary} scale={isM ? fScale * 0.82 : fScale * 0.9}
        onEditOffer={edit("offer")} onEditFine={edit("offerFine")} />
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
function StampTemplate({ data, sizeKey, onEdit }) {
const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
const photo = data.photo || ind.photos[0];
const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.65;
const edit = (field) => (val) => onEdit(field, val);

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
    <div style={{ overflow: "hidden", maxHeight: `${2 * 13*fScale * 1.2}px` }}>
      <EditableText value={data.businessName} onChange={edit("businessName")}
        style={{ color: "#fff", fontWeight: 900, fontSize: 13*fScale, fontFamily: "Georgia, serif", textShadow: "0 2px 8px rgba(0,0,0,0.6)", lineHeight: 1.1, textAlign: "center" }} />
    </div>
    {!isS && data.phone && (
      <EditableText value={data.phone} onChange={edit("phone")}
        style={{ color: ind.colors.accent, fontWeight: 900, fontSize: (isXL?28:isL?24:18)*fScale, lineHeight: 1, marginTop: 4, letterSpacing: -0.5, textShadow: "0 2px 12px rgba(0,0,0,0.8)", textAlign: "center" }} />
    )}
    {!isS && (
      <EditableText value={data.tagline || ind.taglines[0]} onChange={edit("tagline")}
        style={{ color: "rgba(255,255,255,0.85)", fontSize: 9*fScale, marginTop: 4, fontStyle: "italic", textAlign: "center" }} />
    )}
  </div>

  {/* Bottom */}
  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: `${6*fScale}px ${10*fScale}px ${8*fScale}px`, display: "flex", flexDirection: "column", gap: 4*fScale, zIndex: 3 }}>
    {!isS && !isM && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: `2px ${8*fScale}px`, justifyContent: "center" }}>
        {(data.menuItems || ind.menu).slice(0, 3).map((item, i) => (
          <EditableText key={i} value={` ${item}`} onChange={(v) => edit("menuItems")(data.menuItems.map((m, j) => j === i ? v.replace(" ", "") : m))}
            style={{ color: "rgba(255,255,255,0.85)", fontSize: 8*fScale }} />
        ))}
      </div>
    )}
    {data.offer && (
      <Coupon
        offer={data.offer} fine={data.offerFine}
        accent={ind.colors.accent} scale={fScale * 0.85} dark
        onEditOffer={edit("offer")} onEditFine={edit("offerFine")}
      />
    )}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "sans-serif" }}>
      <div>
        {data.address && <EditableText value={data.address.split(",")[0]} onChange={edit("address")} style={{ color: "rgba(255,255,255,0.7)", fontSize: 7*fScale, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} />}
        {isS && data.phone && <EditableText value={data.phone} onChange={edit("phone")} style={{ color: "rgba(255,255,255,0.85)", fontSize: 8*fScale, fontWeight: 700, display: "block" }} />}
      </div>
      {hasQR(data) && !isS && (
        <InlineQRCode
          website={normalizeWebsite(data.website)}
          spotCode={generateSpotCode(data.businessName, "current")}
          size={isXL ? 36 : 28}
          dark={true}
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
function FadeOutTemplate({ data, sizeKey, onEdit }) {
const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
const photo = data.photo || ind.photos[0];
const isXL = sizeKey === "XL", isL = sizeKey === "L", isM = sizeKey === "M", isS = sizeKey === "S";
const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.65;
const edit = (field) => (val) => onEdit(field, val);

// The left color – use industry primary darkened slightly for richness
const leftBg = ind.colors.dark || ind.colors.primary;

// How wide the left content zone is (photo fills the rest)
// For XL (portrait): content left 55%, photo right 45%
// For L/M/S (landscape): content left 50%, photo right 50%
const contentWidth = isXL ? "55%" : "50%";

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
      background: `linear-gradient(90deg, ${leftBg}ff 0%, ${leftBg}cc 25%, ${leftBg}66 45%, ${leftBg}22 65%, transparent 100%)`,
    }}/>
  </div>

  {/* Left content area -- sits above the photo layer */}
  <div data-overflow-clip="1" style={{
    position: "absolute",
    top: 0, left: 0, bottom: isS ? 0 : `${28*fScale}px`,
    width: contentWidth,
    padding: isXL ? `${14*fScale}px ${14*fScale}px` : `${10*fScale}px ${12*fScale}px`,
    display: "flex", flexDirection: "column",
    justifyContent: "space-between",
    overflow: "hidden",
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
            onChange={edit("businessName")}
            style={{
              color: "#fff", fontWeight: 900,
              fontSize: isXL ? 22*fScale : isL ? 18*fScale : isM ? 13*fScale : 10*fScale,
              lineHeight: 1.0, fontFamily: "Georgia, serif",
              textShadow: "0 1px 6px rgba(0,0,0,0.5)",
            }}
          />
          {!isS && (
            <div style={{
              color: ind.colors.accent, fontSize: 7*fScale, fontWeight: 700,
              letterSpacing: 1.5, textTransform: "uppercase", marginTop: 2,
            }}>
              {data.industry}
            </div>
          )}
        </div>
      </div>

      {/* Tagline */}
      {!isS && (
        <EditableText
          value={data.tagline || ind.taglines[0]}
          onChange={edit("tagline")}
          multiline
          style={{
            color: "#fff", fontWeight: 800,
            fontSize: isXL ? 17*fScale : isL ? 14*fScale : 10*fScale,
            lineHeight: 1.25, fontFamily: "Georgia, serif",
            marginBottom: 6*fScale, display: "block",
          }}
        />
      )}

      {/* Service checklist */}
      {!isS && !isM && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3*fScale }}>
          {(data.menuItems?.length ? data.menuItems : ind.menu).slice(0, isXL ? 5 : 4).map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6*fScale }}>
              <svg width={12*fScale} height={12*fScale} viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
                <circle cx="7" cy="7" r="7" fill={ind.colors.accent}/>
                <path d="M4 7l2 2 4-4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
              <span style={{ color: "rgba(255,255,255,0.92)", fontSize: 10*fScale, fontWeight: 600, lineHeight: 1.3 }}>
                {item}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Coupon -- shows for M/S too */}
      {isM && data.offer && (
        <Coupon
          offer={data.offer} fine={data.offerFine}
          accent={ind.colors.accent} scale={fScale * 0.8} dark
          onEditOffer={edit("offer")} onEditFine={edit("offerFine")}
        />
      )}
    </div>

    {/* BOTTOM: coupon (XL/L) + address */}
    {!isS && !isM && (
      <div style={{ display: "flex", flexDirection: "column", gap: 4*fScale }}>
        {data.offer && (
          <Coupon
            offer={data.offer} fine={data.offerFine}
            accent={ind.colors.accent} scale={fScale * 0.85} dark
            onEditOffer={edit("offer")} onEditFine={edit("offerFine")}
          />
        )}
        {data.address && (
          <EditableText
            value={data.address.split(",")[0]}
            onChange={edit("address")}
            style={{
              color: "rgba(255,255,255,0.75)", fontSize: 7.5*fScale,
              fontFamily: "sans-serif", lineHeight: 1.3,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          />
        )}
      </div>
    )}

    {/* S only: phone inline since no bottom bar */}
    {isS && (
      <div style={{ marginTop: 4*fScale }}>
        <EditableText
          value={data.phone}
          onChange={edit("phone")}
          style={{
            color: ind.colors.accent, fontWeight: 900,
            fontSize: 11*fScale, fontFamily: "sans-serif",
          }}
        />
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
            size={isXL ? 22 : 18}
            dark
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
        ) : data.address ? (
          <EditableText
            value={data.address.split(",")[0]}
            onChange={edit("address")}
            style={{
              color: "rgba(255,255,255,0.88)", fontSize: 8*fScale,
              fontFamily: "sans-serif",
            }}
          />
        ) : null}
      </div>
    </div>
  )}
</div>

);
}

export const TEMPLATES = {
"photo-bold":  { name: "Photo Bold",    desc: "Hero photo, bold overlay text",   Component: PhotoBoldTemplate },
"split-clean": { name: "Split Clean",   desc: "50/50 photo + content split",      Component: SplitCleanTemplate },
"magazine":    { name: "Magazine",      desc: "Editorial multi-photo layout",     Component: MagazineTemplate },
"stamp":       { name: "Service Stamp", desc: "Diagonal cut, oversized phone",    Component: StampTemplate },
"fade-out":    { name: "Fade Out",      desc: "Photo fades right to brand color", Component: FadeOutTemplate },
};

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
export default function AdGenerator({ initialSize = "L", onComplete, onClose, isReserving = false, reserveError = null }) {
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
});
const [selectedTemplate, setSelectedTemplate] = useState("photo-bold");
const [emailError, setEmailError] = useState(false);
const emailRef = useRef(null);

// Auto-suggest template + populate menuItems when industry changes
const handleIndustryChange = (e) => {
const industry = e.target.value;
const defaultMenu = INDUSTRIES[industry]?.menu || [];
setFormData(d => ({ ...d, industry, menuItems: [...defaultMenu] }));
if (industry) setSelectedTemplate(suggestTemplate(industry));
};

// Handler for inline edits made directly in the preview
const handleInlineEdit = useCallback((field, value) => {
setFormData(d => ({ ...d, [field]: value }));
}, []);

const dims = getRenderDimensions(sizeKey);
const sizeInfo = AD_SIZES[sizeKey];
const Tpl = TEMPLATES[selectedTemplate].Component;
const formValid = formData.businessName.trim() && formData.industry && formData.email.trim();

// Prevent the landing page from scrolling while the generator is open.
// On iOS Safari, touch-scroll events pass through position:fixed overlays
// to the page below — locking the body is the reliable cross-browser fix.
useEffect(() => {
  const prev = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  return () => { document.body.style.overflow = prev; };
}, []);

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
      <div style={{ width: 380, padding: "20px 24px", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", borderRight: "1px solid #e5e7eb", background: "#fff", flexShrink: 0 }}>

        {/* Size selector */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#111", marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>
            Ad Size
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {Object.entries(AD_SIZES).map(([k, s]) => (
              <button key={k} onClick={() => setSizeKey(k)}
                style={{
                  padding: "8px 10px", borderRadius: 8, border: `2px solid ${sizeKey === k ? "#991b1b" : "#e5e7eb"}`,
                  background: sizeKey === k ? "#fef2f2" : "#fff", cursor: "pointer", textAlign: "left",
                }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: "#111" }}>{s.label}</div>
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>${s.price} - {s.ratio}</div>
              </button>
            ))}
          </div>
        </div>

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

          {/* Image uploads */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, paddingTop: 8, borderTop: "1px solid #f3f4f6" }}>
            <ImageUpload label="Your Logo" hint="Optional"
              value={formData.logo} onChange={v => setFormData(d => ({ ...d, logo: v }))} />
            <ImageUpload label="Your Photo" hint="Or use stock"
              value={formData.photo} onChange={v => setFormData(d => ({ ...d, photo: v }))} />
          </div>
          {formData.industry && !formData.photo && (
            <div style={{ fontSize: 11, color: "#6b7280", padding: "6px 10px", background: "#f0fdf4", borderRadius: 6 }}>
               We'll use a professional stock photo for {formData.industry} since you didn't upload one.
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
        flex: 1, padding: "20px 24px", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", display: "flex",
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
                    <Tpl data={formData} sizeKey={sizeKey} onEdit={handleInlineEdit} />
                  </div>
                </div>
              );
            })()}

            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, marginTop: 10, textAlign: "center", fontStyle: "italic" }}>
               Click any text in the preview to edit it directly
            </div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginTop: 4, textAlign: "center" }}>
              Style: <strong style={{ color: "#fff" }}>{TEMPLATES[selectedTemplate].name}</strong>
              {!formData.photo && formData.industry && <> - Using stock photo for {formData.industry}</>}
            </div>

            <button
              disabled={isReserving}
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
                marginTop: 20, padding: "14px 32px",
                background: isReserving ? "#7f1d1d" : "#991b1b",
                color: "#fff", border: "none", borderRadius: 10, fontSize: 15,
                fontWeight: 800, cursor: isReserving ? "not-allowed" : "pointer",
                letterSpacing: 0.5, opacity: isReserving ? 0.75 : 1,
                transition: "all 0.15s",
              }}>
              {isReserving ? "Reserving your spot…" : `Approve & Reserve Spot — $${sizeInfo.price}`}
            </button>
            {reserveError && (
              <div style={{ color: "#fca5a5", fontSize: 13, marginTop: 10, textAlign: "center", maxWidth: 340 }}>
                {reserveError}
              </div>
            )}
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
