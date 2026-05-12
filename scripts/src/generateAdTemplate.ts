/**
 * generateAdTemplate.ts — Dev tool for creating new Ad Generator template styles
 *
 * Feeds a business photo to GPT-5.4 vision along with the full template spec
 * and gets back ready-to-paste React JSX for AdGenerator.jsx and PostcardPickerSection.jsx.
 *
 * ─── Usage ───────────────────────────────────────────────────────────────────
 *
 *   pnpm --filter @workspace/scripts run gen:template -- \
 *     --image    artifacts/localspot/public/mr-biscuits-hero.png \
 *     --style    MenuCard \
 *     --name     "Mr. Biscuit's Cafe" \
 *     --tagline  "From-Scratch Biscuits & Boba!" \
 *     --phone    "(706) 754-0105" \
 *     --address  "596 W Louise St, Clarkesville, GA 30523" \
 *     --menu     "Plain Biscuit $2.99,Bacon Biscuit $4.99,Chicken Tender $5.99,NY Bagels $5.49" \
 *     --offer    "$1 OFF Any Biscuit" \
 *     --offerFine "1 per visit · with this postcard" \
 *     --colors   "#1a0b00,#c8541a,#d4a017" \
 *     --logo     artifacts/localspot/public/mr-biscuits-logo.jpg
 *
 * ─── Output ──────────────────────────────────────────────────────────────────
 *
 *   Prints two delimited code blocks to stdout and saves to scripts/out/<Style>-<ts>.txt
 *
 * ─── Adding the result to the app ────────────────────────────────────────────
 *
 *   TEMPLATE_COMPONENT
 *     → Paste into AdGenerator.jsx immediately before `const TEMPLATES = {`
 *     → Add entry to TEMPLATES:  "my-style": { name: "...", desc: "...", Component: MyStyleTemplate }
 *     → Add "my-style" to TEMPLATE_STYLES array (puts it in the design-style picker)
 *
 *   PICKER_BLOCK
 *     → Paste as a new `if (tmpl === "my-style") { ... }` case inside AdXL / AdL / AdM
 *       in PostcardPickerSection.jsx (before the default return)
 *     → Set tmpl:"my-style" on the relevant spot entry in the FRONT or BACK array
 */

import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Workspace root is two levels up from scripts/src/
const WORKSPACE_ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..");

// Resolve a path that may be relative to the workspace root or absolute
function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(WORKSPACE_ROOT, p);
}

// ── CLI arg parser ────────────────────────────────────────────────────────────
function arg(name: string, required = false): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || !process.argv[idx + 1]) {
    if (required) { console.error(`Missing required arg: --${name}`); process.exit(1); }
    return "";
  }
  return process.argv[idx + 1];
}

const imagePath  = arg("image",  true);   // path to hero photo
const styleName  = arg("style",  true);   // CamelCase, e.g. "MenuCard"
const bizName    = arg("name",   true);   // business name for picker block
const tagline    = arg("tagline");
const phone      = arg("phone");
const address    = arg("address");
const menu       = arg("menu");           // comma-separated, e.g. "Pizza $12,Wings $9"
const offer      = arg("offer");          // coupon headline
const offerFine  = arg("offerFine");      // coupon fine print
const colorsArg  = arg("colors");         // "dark,primary,accent" hex, comma-separated
const logoPath   = arg("logo");           // optional logo image path

const [darkColor, primaryColor, accentColor] = (colorsArg || "#111111,#cc0000,#f59e0b")
  .split(",").map(s => s.trim());
const menuItems = menu ? menu.split(",").map(s => s.trim()) : [];

// Derive keys from the style name
const styleKey = styleName
  .replace(/([A-Z])/g, (m, p1, offset) => (offset > 0 ? "-" : "") + p1.toLowerCase())
  .toLowerCase();
const compName = `${styleName}Template`;

// ── Image → base64 data URL ───────────────────────────────────────────────────
function toDataUrl(filePath: string): string {
  const ext  = path.extname(filePath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : "image/jpeg";
  const buf  = fs.readFileSync(filePath);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

const resolvedImage = resolvePath(imagePath);
const resolvedLogo  = logoPath ? resolvePath(logoPath) : "";

if (!fs.existsSync(resolvedImage)) {
  console.error(`Hero image not found: ${resolvedImage}`); process.exit(1);
}
const heroDataUrl = toDataUrl(resolvedImage);
const logoDataUrl = (resolvedLogo && fs.existsSync(resolvedLogo)) ? toDataUrl(resolvedLogo) : null;

// ── OpenAI client — Replit AI Integrations proxy (no API key needed) ──────────
const client = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey:  process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

// ── System prompt — full template spec ───────────────────────────────────────
const SYSTEM_PROMPT = `
You are an expert React developer generating ad template code for a 9×12 co-op postcard mailer app.
Respond ONLY with the two delimited sections shown below. No explanations, no prose.

════════════════════════════════════════════════════════
AVAILABLE HELPER COMPONENTS (already in scope — do NOT import or redefine)
════════════════════════════════════════════════════════

1. LogoBadge — circular logo or emoji fallback badge
   <LogoBadge logo={data.logo} name={data.businessName} emoji={ind.emoji}
     size={36*fScale} bg={\`\${ind.colors.primary}cc\`} color="#fff" />
   Props: logo(url|null), name(str), emoji(str), size(px), bg(color), color(str), border(str?)

2. EditableText — ALWAYS use for any user-facing text; handles click-to-edit UI
   <EditableText value={data.businessName} onChange={edit("businessName")} {...ef("businessName")}
     style={{ color:"#fff", fontWeight:900, fontSize:16*fScale }} />
   Props: value(str), onChange(fn), fieldKey(str), fontSizes(obj), fieldWidths(obj),
          onFontSizeChange(fn), onWidthChange(fn), style(CSSProperties), multiline(bool?)
   The ef(key) helper wires up the resize toolbar — always spread it.

3. PositionedQR — QR code pinned to bottom-right of nearest position:relative container
   <PositionedQR website={data.website} fScale={fScale} dark />
   Returns null when website is empty. Outer container must have position:"relative".
   Props: website(str), fScale(num), dark(bool)

4. Coupon — dashed coupon with scissors strip; returns null when offer is falsy
   <Coupon offer={data.offer} fine={data.offerFine} accent={ind.colors.primary}
     scale={fScale} dark={true}
     onEditOffer={edit("offer")} onEditFine={edit("offerFine")}
     fontSizes={data.fontSizes||{}} fieldWidths={data.fieldWidths||{}}
     onFontSizeChange={onFontSizeChange} onWidthChange={onWidthChange} />

5. getActiveItems(data.menuItems, ind.menu) → string[]
   Always use this for menu/service items. Use .slice(0, isS ? 2 : 4).

════════════════════════════════════════════════════════
INDUSTRY COLOR SYSTEM  (template receives this automatically)
════════════════════════════════════════════════════════

  const ind = INDUSTRIES[data.industry] || INDUSTRIES["Other Service"];
  ind.colors.dark     — very dark shade  (backgrounds, overlays)
  ind.colors.primary  — main brand color (headers, accents)
  ind.colors.accent   — highlight color  (CTAs, checkmarks, prices)
  ind.colors.light    — very light tint  (light backgrounds)
  ind.emoji           — fallback emoji for LogoBadge
  ind.photos[0]       — first stock photo URL

════════════════════════════════════════════════════════
FSCALE — multiply ALL pixel values by fScale
════════════════════════════════════════════════════════

  const fScale = isXL ? 1.45 : isL ? 1.15 : isM ? 0.75 : 0.65;
  Natural pixel sizes (w × h):
    XL = 400×500   L = 300×400   M = 200×200   S = 200×200

════════════════════════════════════════════════════════
COMPLETE STRUCTURAL REFERENCE — existing PhotoBoldTemplate
════════════════════════════════════════════════════════

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
const ef = (key) => ({
  fieldKey: key, fontSizes: data.fontSizes || {}, fieldWidths: data.fieldWidths || {},
  onFontSizeChange, onWidthChange,
});
return (
<div style={{ width:"100%", height:"100%", position:"relative", overflow:"hidden", fontFamily:"Georgia,serif" }}>
  <img src={photo} alt="" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
  <div style={{ position:"absolute", inset:0, background:\`linear-gradient(180deg,\${ind.colors.dark}99 0%,\${ind.colors.dark}55 40%,\${ind.colors.dark}f0 100%)\` }} />
  <div style={{ position:"absolute", top:0, left:0, right:0, padding:\`\${10*fScale}px \${12*fScale}px\`, display:"flex", alignItems:"center", gap:8*fScale }}>
    <LogoBadge logo={data.logo} name={data.businessName} emoji={ind.emoji} size={36*fScale} bg={\`\${ind.colors.primary}cc\`} color="#fff" />
    <div style={{ flex:1, minWidth:0 }}>
      <EditableText value={data.businessName} onChange={edit("businessName")} {...ef("businessName")}
        style={{ color:"#fff", fontWeight:900, fontSize:16*fScale, lineHeight:1.05, textShadow:"0 2px 8px rgba(0,0,0,0.7)" }} />
    </div>
  </div>
  {!isS && (
    <div style={{ position:"absolute", top:"28%", left:12*fScale, right:12*fScale, textAlign:"center" }}>
      <EditableText value={data.tagline || ind.taglines[0]} onChange={edit("tagline")} {...ef("tagline")}
        style={{ color:"#fff", fontWeight:800, fontSize:(isXL?22:isL?18:14)*fScale, lineHeight:1.1, fontStyle:"italic", textShadow:"0 2px 12px rgba(0,0,0,0.8)", textAlign:"center" }} />
    </div>
  )}
  <div style={{ position:"absolute", top:"44%", left:12*fScale, right:12*fScale, display:"flex", flexDirection:"column", gap:3*fScale }}>
    {getActiveItems(data.menuItems, ind.menu).slice(0, isS ? 2 : 4).map((item, i) => (
      <div key={i} style={{ display:"flex", alignItems:"center", gap:6*fScale }}>
        <div style={{ width:12*fScale, height:12*fScale, borderRadius:"50%", background:ind.colors.primary, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <span style={{ color:"#fff", fontSize:7*fScale, fontWeight:900 }}>✓</span>
        </div>
        <EditableText value={item} onChange={editMenu(i)} {...ef(\`menuItem_\${i}\`)}
          style={{ color:"#fff", fontSize:9*fScale, fontWeight:600, fontFamily:"sans-serif", textShadow:"0 1px 4px rgba(0,0,0,0.8)" }} />
      </div>
    ))}
  </div>
  <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:\`\${8*fScale}px \${12*fScale}px\`, display:"flex", flexDirection:"column", gap:4*fScale }}>
    {data.offer && <Coupon offer={data.offer} fine={data.offerFine} accent="#fff" scale={fScale} dark={true}
      onEditOffer={edit("offer")} onEditFine={edit("offerFine")}
      fontSizes={data.fontSizes||{}} fieldWidths={data.fieldWidths||{}}
      onFontSizeChange={onFontSizeChange} onWidthChange={onWidthChange} />}
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", color:"rgba(255,255,255,0.85)", fontSize:9*fScale, fontFamily:"sans-serif" }}>
      <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
        {data.address && <EditableText value={data.address} onChange={edit("address")} {...ef("address")} style={{ color:"rgba(255,255,255,0.85)", fontSize:9*fScale, fontFamily:"sans-serif", whiteSpace:"normal", wordBreak:"break-word" }} />}
        {data.phone && <EditableText value={data.phone} onChange={edit("phone")} {...ef("phone")} style={{ color:"rgba(255,255,255,0.85)", fontSize:9*fScale, fontWeight:800, fontFamily:"sans-serif", whiteSpace:"normal" }} />}
      </div>
    </div>
  </div>
  {!isS && <PositionedQR website={data.website} fScale={fScale} dark />}
</div>
);
}

════════════════════════════════════════════════════════
PICKER BLOCK DATA SHAPE & HELPERS  (PostcardPickerSection.jsx)
════════════════════════════════════════════════════════

Data object (d):
  d.biz, d.tag, d.photo, d.logo, d.phone, d.addr, d.web
  d.offer, d.fine, d.services (string[])
  d.p (primary), d.a (accent), d.l (light), d.d (dark)  — all hex strings

Picker-specific helpers (already in scope in PostcardPickerSection.jsx):
  <Check color={d.p} sz={14}/>
  <Phone phone={d.phone} color={d.d} size={13}/>
  <Coupon offer={d.offer} fine={d.fine} color={d.a} dark scale={0.9}/>  (not editable)
  <PositionedQR website={d.web} fScale={1.45} dark/>

Example picker block — "clean" case (use this as structural reference):
if(tmpl==="clean"){
  return(<div style={{width:400,height:500,display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:"sans-serif",background:"#fff",position:"relative"}}>
    <div style={{background:d.p,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
      <div style={{width:40,height:40,borderRadius:8,overflow:"hidden",flexShrink:0}}><img src={d.photo} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/></div>
      <div style={{color:"#fff",fontWeight:900,fontSize:20,fontFamily:"Georgia,serif"}}>{d.biz}</div>
    </div>
    <div style={{height:210,flexShrink:0,overflow:"hidden"}}><img src={d.photo} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} alt=""/></div>
    <div style={{flex:1,padding:"10px 14px",display:"flex",flexDirection:"column",justifyContent:"space-between",background:"#fff",overflow:"hidden"}}>
      <div>
        <div style={{fontSize:14,fontWeight:900,color:d.d,fontFamily:"Georgia,serif",marginBottom:7}}>{d.tag}</div>
        {(d.services||[]).slice(0,4).map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><Check color={d.p} sz={12}/><span style={{fontSize:10,color:"#333",fontWeight:500}}>{s}</span></div>))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        <Coupon offer={d.offer} fine={d.fine} color={d.p} scale={0.95}/>
        <Phone phone={d.phone} color={d.p} size={13}/>
        {d.addr&&<div style={{fontSize:8,color:"#666"}}>{d.addr}</div>}
      </div>
    </div>
    <PositionedQR website={d.web} fScale={1.45} />
  </div>);
}

════════════════════════════════════════════════════════
STRICT RULES
════════════════════════════════════════════════════════

1. Inline styles ONLY — no Tailwind, no CSS classes, no <style> tags.
2. No import or export statements — code is inserted into existing files.
3. Do NOT redefine helpers — they are already in scope.
4. All px in TEMPLATE_COMPONENT must be multiplied by fScale.
5. Outer div of TEMPLATE_COMPONENT: position:"relative", overflow:"hidden", width:"100%", height:"100%".
6. TEMPLATE_COMPONENT must work gracefully at all four sizes (XL/L/M/S).
7. PICKER_BLOCK: hardcoded width:400, height:500. No percentages.
8. PICKER_BLOCK wrapper: if(tmpl==="${styleKey}"){ return( ... ); }
9. Valid JSX syntax throughout — no trailing commas in JSX attributes.
10. Design goal: production print-quality. Polished, not generic.
`.trim();

// ── User message content ──────────────────────────────────────────────────────
const userContent: OpenAI.ChatCompletionContentPart[] = [
  { type: "image_url", image_url: { url: heroDataUrl, detail: "high" } },
  ...(logoDataUrl
    ? [{ type: "image_url" as const, image_url: { url: logoDataUrl, detail: "high" as const } }]
    : []),
  {
    type: "text",
    text: `
Analyze the photo(s) above and generate a polished ad template in that visual style.

Style name  : ${styleName}
Component   : ${compName}({ data, sizeKey, onEdit, onFontSizeChange, onWidthChange })
Template key: "${styleKey}"   (used in TEMPLATES registry and TEMPLATE_STYLES array)
Picker key  : "${styleKey}"   (used in the if(tmpl===...) block in PostcardPickerSection.jsx)

── Business details for the PICKER_BLOCK (hardcoded sample ad) ──
  Name       : ${bizName}
  Tagline    : ${tagline || "(none)"}
  Phone      : ${phone || "(none)"}
  Address    : ${address || "(none)"}
  Menu items : ${menuItems.length ? menuItems.join(", ") : "(none)"}
  Offer      : ${offer || "(none)"}
  Fine print : ${offerFine || "(none)"}
  Dark color : ${darkColor}
  Primary    : ${primaryColor}
  Accent     : ${accentColor}
  Hero photo : use d.photo exactly as-is in the picker block
  Logo       : ${logoDataUrl ? "use d.logo exactly as-is (a second image is provided above)" : "not provided — omit logo"}

The TEMPLATE_COMPONENT should be generic and reusable for any business in this style category.
The PICKER_BLOCK is a pixel-perfect, hardcoded sample ad for the specific business above.

Study the photo carefully. Match its mood, color palette, and visual character in the design.

Output format — exactly two sections, nothing else:

### TEMPLATE_COMPONENT
\`\`\`jsx
[full ${compName} function here]
\`\`\`

### PICKER_BLOCK
\`\`\`jsx
[if(tmpl==="${styleKey}"){ return( ... ); } block here]
\`\`\`
`.trim(),
  },
];

// ── API call ──────────────────────────────────────────────────────────────────
console.log(`\n🎨  Calling GPT-5.4 vision to generate ${compName}...\n`);

const response = await client.chat.completions.create({
  model: "gpt-5.4",
  max_completion_tokens: 6000,
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user",   content: userContent },
  ],
});

const raw = response.choices[0]?.message?.content ?? "";

// ── Parse the two code blocks ─────────────────────────────────────────────────
function extractBlock(label: string): string {
  const re = new RegExp(
    `###\\s*${label}\\s*\`\`\`(?:jsx|js)?\\s*([\\s\\S]*?)\`\`\``,
    "i"
  );
  const m = raw.match(re);
  return m ? m[1].trim() : "";
}

const templateComponent = extractBlock("TEMPLATE_COMPONENT");
const pickerBlock       = extractBlock("PICKER_BLOCK");

if (!templateComponent && !pickerBlock) {
  console.error("⚠️  Could not parse code blocks. Full raw response:\n");
  console.log(raw);
  process.exit(1);
}

// ── Print ─────────────────────────────────────────────────────────────────────
const HR = "═".repeat(70);
console.log(HR);
console.log("### TEMPLATE_COMPONENT");
console.log(HR);
console.log(templateComponent || "(empty — check raw output)");
console.log();
console.log(HR);
console.log("### PICKER_BLOCK");
console.log(HR);
console.log(pickerBlock || "(empty — check raw output)");

// ── Save to file ──────────────────────────────────────────────────────────────
const outDir = "scripts/out";
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const ts      = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outFile = path.join(outDir, `${styleName}-${ts}.txt`);

const saved = [
  `// Generated : ${new Date().toISOString()}`,
  `// Style     : ${styleName}  (template key: "${styleKey}")`,
  `// Business  : ${bizName}`,
  `// Image     : ${imagePath}`,
  `// Tokens    : prompt=${response.usage?.prompt_tokens ?? "?"} completion=${response.usage?.completion_tokens ?? "?"}`,
  "",
  "// ── INSTRUCTIONS ────────────────────────────────────────────────────────────",
  "// TEMPLATE_COMPONENT",
  "//   1. Paste into AdGenerator.jsx immediately before `const TEMPLATES = {`",
  `//   2. Add to TEMPLATES: "${styleKey}": { name: "${styleName}", desc: "...", Component: ${compName} }`,
  `//   3. Add "${styleKey}" to TEMPLATE_STYLES array`,
  "//",
  "// PICKER_BLOCK",
  "//   1. Paste as a new if(tmpl===...) case inside AdXL/AdL/AdM in PostcardPickerSection.jsx",
  "//   2. Set tmpl on the relevant spot entry in FRONT or BACK array",
  "",
  "### TEMPLATE_COMPONENT",
  "```jsx",
  templateComponent,
  "```",
  "",
  "### PICKER_BLOCK",
  "```jsx",
  pickerBlock,
  "```",
].join("\n");

fs.writeFileSync(outFile, saved);

console.log(`\n✅  Saved → ${outFile}`);
console.log(`📊  Tokens — prompt: ${response.usage?.prompt_tokens ?? "?"}, completion: ${response.usage?.completion_tokens ?? "?"}\n`);
