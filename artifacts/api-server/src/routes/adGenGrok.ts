import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { z } from "zod/v4";
import fs from "fs";
import path from "path";

function findWorkspaceRoot(): string {
  let dir = process.cwd();
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const WORKSPACE_ROOT = findWorkspaceRoot();

const router: IRouter = Router();

function getXAI(): OpenAI | null {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1" });
}

const GenerateSchema = z.object({
  bizName:   z.string().min(1, "bizName is required"),
  tagline:   z.string().optional().default(""),
  phone:     z.string().optional().default(""),
  city:      z.string().optional().default(""),
  address:   z.string().optional().default(""),
  website:   z.string().optional().default(""),
  industry:  z.string().optional().default("Local Business"),
  menu:      z.array(z.string()).optional().default([]),
  offer:     z.string().optional().default(""),
  offerFine: z.string().optional().default(""),
  photoUrl:  z.string().optional().default(""),
  logoData:  z.string().optional().default(""),
});

// ── POST /api/grok-ad-generator/generate ─────────────────────────────────────
router.post("/grok-ad-generator/generate", async (req, res): Promise<void> => {
  const parsed = GenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const xai = getXAI();
  if (!xai) {
    res.status(503).json({ error: "XAI_API_KEY is not configured on this server." });
    return;
  }

  const d = parsed.data;

  const tmplPath = path.join(
    WORKSPACE_ROOT,
    "attached_assets",
    "mr_biscuits_template_no_logo_1778806527327.png"
  );
  if (!fs.existsSync(tmplPath)) {
    res.status(500).json({ error: "Template file not found on server." });
    return;
  }
  const tmplB64     = fs.readFileSync(tmplPath).toString("base64");
  const tmplDataUrl = `data:image/png;base64,${tmplB64}`;

  const menuStr = d.menu.filter(Boolean).map((m, i) => `  ${i + 1}. ${m}`).join("\n") || "  (none)";
  const fullAddress = [d.address, d.city].filter(Boolean).join(", ") || "(none)";

  const businessBlock = [
    `Business Name : ${d.bizName}`,
    `Tagline       : ${d.tagline  || "(none)"}`,
    `Phone         : ${d.phone    || "(none)"}`,
    `Address       : ${fullAddress}`,
    `Website       : ${d.website  || "(none)"}`,
    `Industry      : ${d.industry}`,
    `Menu/Services :\n${menuStr}`,
    `Special Offer : ${d.offer    || "(none)"}`,
    `Fine Print    : ${d.offerFine || "(none)"}`,
  ].join("\n");

  const hasPhoto = !!d.photoUrl;
  const hasLogo  = !!d.logoData;

  const visionSystemPrompt =
    "You are a master print advertising art director with 20 years of experience creating " +
    "direct-mail postcard campaigns. Your output is ONLY a precise image generation prompt " +
    "— no preamble, no explanation, no markdown, no labels.";

  const visionUserText =
    "I am attaching " +
    (hasLogo ? "three" : hasPhoto ? "two" : "one") +
    " images:\n" +
    "  IMAGE 1: The postcard template — a complete ad layout with parchment texture, brush-stroke band, " +
    "pennant banner, circular checkmark badges, dashed coupon box, and dark footer strip.\n" +
    (hasPhoto ? "  IMAGE 2: A food/hero photo to composite into the right-center of the ad.\n" : "") +
    (hasLogo  ? `  IMAGE ${hasPhoto ? "3" : "2"}: The business logo to place in the upper-left corner.\n` : "") +
    "\nUsing these images as reference, write a 180–220 word image generation prompt that instructs " +
    "an AI image generator to produce a FINISHED, PRINT-READY postcard ad by:\n" +
    "  • Using Image 1 as the exact base layer — do NOT redraw or reinterpret ANY design element\n" +
    (hasPhoto
      ? "  • Compositing the food photo into the right-center hero area with soft shadow blending — it must look fully integrated, not placed on top\n"
      : "  • Generating a photorealistic food/product image appropriate for the industry and compositing it into the right-center hero area\n") +
    (hasLogo
      ? "  • Placing the logo in the upper-left corner exactly as provided — no stylization, no recoloring\n"
      : "  • Leaving the upper-left logo zone clean with a subtle decorative element consistent with the template\n") +
    "  • Placing ALL business text verbatim in the correct template zones (name, tagline, menu, offer, phone, address)\n\n" +
    "CRITICAL TEXT ACCURACY — include this verbatim in your prompt:\n" +
    "  The phone number must appear EXACTLY as provided — every digit, no reformatting.\n" +
    "  Business name must match EXACTLY — exact spelling and punctuation.\n" +
    "  All prices must match EXACTLY — no rounding.\n\n" +
    "BUSINESS DETAILS TO EMBED IN THE PROMPT:\n" + businessBlock;

  const imageContent: OpenAI.ChatCompletionContentPart[] = [
    { type: "image_url", image_url: { url: tmplDataUrl } } as OpenAI.ChatCompletionContentPartImage,
  ];
  if (hasPhoto) {
    imageContent.push({ type: "image_url", image_url: { url: d.photoUrl } } as OpenAI.ChatCompletionContentPartImage);
  }
  if (hasLogo) {
    imageContent.push({ type: "image_url", image_url: { url: d.logoData } } as OpenAI.ChatCompletionContentPartImage);
  }
  imageContent.push({ type: "text", text: visionUserText });

  let artPrompt: string;
  try {
    const visionRes = await xai.chat.completions.create({
      model: "grok-2-vision-1212",
      max_tokens: 700,
      messages: [
        { role: "system", content: visionSystemPrompt },
        { role: "user",   content: imageContent },
      ],
    });
    artPrompt = visionRes.choices[0]?.message?.content?.trim() ?? "";
    if (!artPrompt) throw new Error("Grok vision returned an empty response.");
    req.log.info({ bizName: d.bizName, promptLen: artPrompt.length }, "grok vision → art prompt");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Grok vision call failed";
    req.log.error({ err: msg }, "grok vision error");
    res.status(502).json({ error: `Vision step failed: ${msg}` });
    return;
  }

  // Step 2 — Aurora image generation
  type ImageData = { url?: string; b64_json?: string };
  let imageUrl: string;
  try {
    const genRes = await xai.images.generate({
      model: "aurora",
      prompt: artPrompt,
      n: 1,
    });
    const item = (genRes.data?.[0] ?? {}) as ImageData;
    if (item.url) {
      imageUrl = item.url;
    } else if (item.b64_json) {
      imageUrl = `data:image/png;base64,${item.b64_json}`;
    } else {
      throw new Error("Aurora returned no image data.");
    }
    req.log.info({ bizName: d.bizName }, "grok aurora image generated");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Aurora image generation failed";
    req.log.error({ err: msg }, "aurora error");
    res.status(502).json({ error: `Image generation step failed: ${msg}` });
    return;
  }

  res.json({ imageUrl, artPrompt });
});

// ── GET /api/grok-ad-generator — serve the HTML tool ─────────────────────────
router.get("/grok-ad-generator", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(GROK_HTML);
});

export default router;

// ── Inline HTML ───────────────────────────────────────────────────────────────
const GROK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Town Postcard &mdash; Grok Ad Generator</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700&family=Crimson+Pro:ital@0;1&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
:root{
  --burg:#7C1C2E;--burg-dark:#5a1220;--burg-pale:#f9eaed;
  --ink:#0f1117;--ink-mid:#374151;--ink-light:#6B7280;
  --surface:#F4F1ED;--card:#fff;--border:#E2DDD6;
  --gold:#C8952A;--green:#1a5c3a;--xai:#1a1a2e;
}
body{font-family:'DM Sans',sans-serif;background:var(--surface);color:var(--ink);display:flex;flex-direction:column}

/* HEADER */
.hdr{background:var(--xai);padding:0 28px;display:flex;align-items:center;justify-content:space-between;height:54px;border-bottom:3px solid var(--burg);flex-shrink:0}
.brand{font-family:'Bebas Neue',sans-serif;font-size:21px;color:#fff;letter-spacing:.08em}
.brand span{color:#C8A882}
.hdr-badge{background:var(--burg);color:#fff;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:4px 12px;border-radius:20px;display:flex;align-items:center;gap:6px}

/* LAYOUT */
.layout{display:grid;grid-template-columns:400px 1fr;flex:1;min-height:0;overflow:hidden}

/* LEFT PANEL */
.fpanel{background:var(--card);border-right:1.5px solid var(--border);padding:18px 18px 60px;overflow-y:auto;display:flex;flex-direction:column;gap:14px}
.ptitle{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:.06em;margin-bottom:2px}
.psub{font-family:'Crimson Pro',serif;font-style:italic;font-size:14px;color:var(--ink-light);line-height:1.4;margin-bottom:4px}
.sec-label{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--burg);padding-bottom:8px;border-bottom:1.5px solid var(--burg-pale);margin-bottom:8px}
.field{margin-bottom:8px}
.field:last-child{margin-bottom:0}
.field label{display:block;font-size:10.5px;font-weight:600;color:var(--ink-mid);margin-bottom:3px;letter-spacing:.05em;text-transform:uppercase}
.field input,.field select,.field textarea{width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:7px;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.field input:focus,.field select:focus,.field textarea:focus{border-color:var(--burg);background:#fff}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.menu-list{display:flex;flex-direction:column;gap:5px;margin-bottom:7px}
.mrow{display:flex;gap:6px;align-items:center}
.mrow input{flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:'DM Sans',sans-serif;font-size:12px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.mrow input:focus{border-color:var(--burg);background:#fff}
.rm-btn{width:24px;height:24px;border-radius:5px;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-light);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;line-height:1}
.rm-btn:hover{border-color:#c0392b;color:#c0392b;background:#fef2f2}
.add-btn{font-size:11px;font-weight:600;color:var(--burg);background:none;border:1.5px dashed var(--burg);border-radius:6px;padding:5px 12px;cursor:pointer;width:100%;transition:all .2s;font-family:'DM Sans',sans-serif}
.add-btn:hover{background:var(--burg-pale)}

/* RIGHT PANEL */
.rpanel{background:#ECEAE6;padding:18px 22px 22px;overflow-y:auto;display:flex;flex-direction:column;gap:14px}

/* CARDS */
.card{background:var(--card);border:1.5px solid var(--border);border-radius:11px;overflow:hidden}
.card-hdr{padding:11px 16px;border-bottom:1px solid var(--border);background:#FAFAF8;display:flex;align-items:center;justify-content:space-between}
.card-title{font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--burg)}
.card-body{padding:14px 16px}

/* TEMPLATE PREVIEW */
.tmpl-preview{display:flex;align-items:center;gap:12px}
.tmpl-img{width:64px;height:80px;object-fit:cover;border-radius:6px;border:1.5px solid var(--border)}
.tmpl-info{flex:1}
.tmpl-name{font-size:13px;font-weight:700;color:var(--ink)}
.tmpl-sub{font-size:11px;color:var(--ink-light);margin-top:2px}
.tmpl-badge{display:inline-flex;align-items:center;gap:4px;background:#f0fdf4;border:1px solid var(--green);color:var(--green);font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;margin-top:5px}

/* TAB UI */
.tabs{display:flex;border-bottom:1.5px solid var(--border);margin-bottom:12px}
.tab{flex:1;padding:8px;font-size:11px;font-weight:700;color:var(--ink-light);background:none;border:none;cursor:pointer;letter-spacing:.06em;text-transform:uppercase;border-bottom:2.5px solid transparent;margin-bottom:-1.5px;transition:all .2s;font-family:'DM Sans',sans-serif}
.tab.active{color:var(--burg);border-bottom-color:var(--burg)}
.tab-panel{display:none}
.tab-panel.active{display:block}

/* IMAGE GRID */
.img-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.img-thumb{position:relative;aspect-ratio:4/3;border-radius:6px;overflow:hidden;cursor:pointer;border:2.5px solid transparent;transition:all .2s;flex-shrink:0}
.img-thumb:hover{transform:scale(1.04)}
.img-thumb.selected{border-color:var(--burg);box-shadow:0 0 0 1.5px var(--burg)}
.img-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.img-thumb .chk{display:none;position:absolute;top:3px;right:3px;background:var(--burg);color:#fff;border-radius:50%;width:16px;height:16px;font-size:9px;font-weight:900;align-items:center;justify-content:center}
.img-thumb.selected .chk{display:flex}
.img-empty{grid-column:1/-1;padding:18px;text-align:center;font-size:12px;color:var(--ink-light);line-height:1.5}
.img-loading{grid-column:1/-1;padding:18px;text-align:center;font-size:12px;color:var(--ink-light)}
.fnote{font-size:10px;color:var(--ink-light);margin-top:5px;line-height:1.4}

/* UPLOAD ZONE */
.upload-zone{border:2px dashed var(--border);border-radius:8px;padding:14px;text-align:center;cursor:pointer;transition:all .2s;background:var(--surface);position:relative;overflow:hidden}
.upload-zone:hover{border-color:var(--burg);background:var(--burg-pale)}
.upload-zone.has-file{border-color:var(--green);background:#f0fdf4}
.upload-zone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.upload-icon{font-size:20px;opacity:.5;margin-bottom:3px}
.upload-label{font-size:12px;font-weight:600;color:var(--ink-mid)}
.upload-sub{font-size:10px;color:var(--ink-light);margin-top:2px}
.upload-preview{width:100%;max-height:80px;object-fit:cover;border-radius:5px;margin-top:8px;display:none}

/* GENERATE BUTTON */
.gen-btn{width:100%;padding:14px;background:linear-gradient(135deg,#1a1a2e,#3D1A6B);color:#fff;border:none;border-radius:10px;font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:.14em;cursor:pointer;transition:all .25s;display:flex;align-items:center;justify-content:center;gap:10px}
.gen-btn:hover:not(:disabled){background:linear-gradient(135deg,#2a2a4e,#5a2490);transform:translateY(-1px);box-shadow:0 6px 24px rgba(80,30,180,.35)}
.gen-btn:disabled{background:#888;cursor:not-allowed;transform:none;box-shadow:none}
.gen-spark{font-size:17px;animation:sp 2s ease-in-out infinite}
@keyframes sp{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}

/* LOADING OVERLAY */
.loading-panel{background:var(--card);border:1.5px solid var(--border);border-radius:11px;padding:32px;text-align:center;display:none}
.loading-panel.visible{display:block}
.spinner{width:44px;height:44px;border:4px solid var(--border);border-top-color:var(--burg);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px}
@keyframes spin{to{transform:rotate(360deg)}}
.loading-title{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:.08em;color:var(--ink);margin-bottom:6px}
.loading-sub{font-size:12px;color:var(--ink-light);line-height:1.5}
.loading-steps{display:flex;flex-direction:column;gap:8px;margin-top:18px;text-align:left;max-width:320px;margin-left:auto;margin-right:auto}
.lstep{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--ink-light);padding:8px 12px;border-radius:7px;background:var(--surface)}
.lstep.done{color:var(--green);background:#f0fdf4}
.lstep.active{color:var(--ink);background:var(--burg-pale)}
.lstep-dot{width:8px;height:8px;border-radius:50%;background:var(--border);flex-shrink:0}
.lstep.done .lstep-dot{background:var(--green)}
.lstep.active .lstep-dot{background:var(--burg);animation:pulse 1s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

/* RESULT PANEL */
.result-panel{background:var(--card);border:1.5px solid var(--border);border-radius:11px;overflow:hidden;display:none}
.result-panel.visible{display:block}
.result-hdr{padding:12px 16px;border-bottom:1px solid var(--border);background:#FAFAF8;display:flex;align-items:center;justify-content:space-between}
.result-title{font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--green)}
.result-img{width:100%;display:block;border-radius:0}
.result-actions{padding:14px 16px;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border)}
.act-btn{padding:9px 18px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-mid);transition:all .2s;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:6px}
.act-btn:hover:not(:disabled){border-color:var(--burg);color:var(--burg)}
.act-btn.primary{background:var(--green);border-color:var(--green);color:#fff}
.act-btn.primary:hover:not(:disabled){background:#144d30}

/* ERROR */
.err-box{padding:14px 16px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;font-size:12.5px;color:#991b1b;line-height:1.5;display:none}
.err-box.visible{display:block}

/* PROMPT DEBUG */
.prompt-debug{background:#0f1117;border-radius:8px;padding:12px;font-size:10px;line-height:1.7;color:rgba(255,255,255,.5);max-height:140px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;margin-top:10px;display:none}
.prompt-debug.visible{display:block}

/* TOAST */
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:var(--ink);color:#fff;padding:10px 22px;border-radius:30px;font-size:13px;font-weight:600;box-shadow:0 8px 32px rgba(0,0,0,.3);transition:transform .3s cubic-bezier(.34,1.56,.64,1);z-index:999;pointer-events:none}
.toast.show{transform:translateX(-50%) translateY(0)}

@media(max-width:860px){.layout{grid-template-columns:1fr;overflow:auto}html,body{height:auto;overflow:auto}.fpanel,.rpanel{overflow:visible}}
</style>
</head>
<body>

<header class="hdr">
  <div class="brand">My Town <span>Postcard</span></div>
  <div class="hdr-badge">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
    Grok Ad Generator
  </div>
</header>

<div class="toast" id="toast"></div>

<div class="layout">

  <!-- ── LEFT: FORM ── -->
  <div class="fpanel">
    <div>
      <div class="ptitle">Grok Ad Generator</div>
      <div class="psub">Fill in your details, pick a photo, and let Grok create your postcard ad via API &mdash; no console, no file attachments.</div>
    </div>

    <div>
      <div class="sec-label">Business Info</div>
      <div class="field"><label>Business Name *</label><input type="text" id="bizName" placeholder="Mr. Biscuit's Cafe" oninput="onFormChange()"></div>
      <div class="field"><label>Tagline / Slogan</label><input type="text" id="tagline" placeholder="From-Scratch Biscuits &amp; Boba!"></div>
      <div class="frow">
        <div class="field"><label>Phone *</label><input type="text" id="phone" placeholder="(706) 754-0105"></div>
        <div class="field"><label>City, State</label><input type="text" id="city" placeholder="Clarkesville, GA"></div>
      </div>
      <div class="field"><label>Street Address</label><input type="text" id="address" placeholder="596 W Louise St"></div>
      <div class="field"><label>Website / URL</label><input type="text" id="website" placeholder="mrbiscuitscafe.com"></div>
      <div class="field"><label>Industry</label>
        <select id="industry" onchange="onIndustryChange()">
          <option value="">&mdash; Select &mdash;</option>
          <option>Pizza Restaurant</option><option>Mexican Restaurant</option><option>Chinese Restaurant</option>
          <option>Breakfast &amp; Cafe</option><option>Bar &amp; Grill</option><option>Italian Restaurant</option>
          <option>Bakery</option><option>Coffee Shop</option><option>Dentist</option>
          <option>Medical &amp; Healthcare</option><option>Chiropractor</option><option>Veterinarian</option>
          <option>HVAC</option><option>Plumber</option><option>Electrician</option>
          <option>Lawn &amp; Landscaping</option><option>Roofing</option><option>Painting</option>
          <option>Cleaning Service</option><option>Pest Control</option><option>Real Estate</option>
          <option>Insurance</option><option>Auto Repair</option><option>Salon &amp; Beauty</option>
          <option>Barbershop</option><option>Gym &amp; Fitness</option><option>Pet Services</option>
          <option>Financial Services</option><option>Daycare</option><option>Photography</option>
          <option>Retail Shop</option><option>Other Service</option>
        </select>
      </div>
    </div>

    <div>
      <div class="sec-label">Menu Items / Services (up to 4)</div>
      <div class="menu-list" id="menuList"></div>
      <button class="add-btn" onclick="addMenuItem()">+ Add Item</button>
    </div>

    <div>
      <div class="sec-label">Special Offer / Coupon</div>
      <div class="field"><label>Offer</label><input type="text" id="offer" placeholder="$1 OFF Any Biscuit"></div>
      <div class="field"><label>Fine Print</label><input type="text" id="offerFine" placeholder="1 per visit &middot; with this postcard"></div>
    </div>
  </div>

  <!-- ── RIGHT: TEMPLATE + IMAGES + GENERATE ── -->
  <div class="rpanel">

    <!-- Template -->
    <div class="card">
      <div class="card-hdr"><div class="card-title">Template</div></div>
      <div class="card-body">
        <div class="tmpl-preview">
          <img class="tmpl-img" src="/api/ai-ad-creator/templates/mr-biscuits?view=1" alt="Mr. Biscuit's Style" onerror="this.style.background='#e8e3dc'">
          <div class="tmpl-info">
            <div class="tmpl-name">Mr. Biscuit&rsquo;s Style</div>
            <div class="tmpl-sub">Parchment &middot; Brush stroke &middot; Rustic-modern</div>
            <div class="tmpl-badge">&#10003; Selected</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Food Photo -->
    <div class="card">
      <div class="card-hdr">
        <div class="card-title">Food / Hero Photo</div>
        <span style="font-size:10px;color:var(--ink-light)" id="photoStatus">None selected</span>
      </div>
      <div class="card-body">
        <div class="tabs">
          <button class="tab active" onclick="switchTab('lib')">&#128247; From Library</button>
          <button class="tab" onclick="switchTab('upload')">&#8679; Upload Your Own</button>
        </div>
        <div class="tab-panel active" id="tabLib">
          <div id="libGrid" class="img-grid">
            <div class="img-empty">Select an industry above to load photos from the library.</div>
          </div>
          <div class="fnote" id="libNote" style="display:none">Photos from your approved library. Select one to use it.</div>
        </div>
        <div class="tab-panel" id="tabUpload">
          <div class="upload-zone" id="photoZone">
            <input type="file" accept="image/*" onchange="handlePhotoUpload(this)">
            <div class="upload-icon">&#128248;</div>
            <div class="upload-label">Upload a photo</div>
            <div class="upload-sub">Food, product, or storefront &mdash; JPG, PNG, WebP</div>
            <img class="upload-preview" id="photoPreview">
          </div>
          <div class="fnote">Grok will composite this into the hero area of the template.</div>
        </div>
      </div>
    </div>

    <!-- Logo -->
    <div class="card">
      <div class="card-hdr">
        <div class="card-title">Company Logo <span style="color:var(--ink-light);font-weight:400;letter-spacing:0;text-transform:none;font-size:10px">(optional)</span></div>
        <span style="font-size:10px;color:var(--ink-light)" id="logoStatus">Not provided</span>
      </div>
      <div class="card-body">
        <div class="upload-zone" id="logoZone">
          <input type="file" accept="image/*" onchange="handleLogoUpload(this)">
          <div class="upload-icon">&#127991;&#65039;</div>
          <div class="upload-label">Upload logo</div>
          <div class="upload-sub">PNG with transparency preferred</div>
          <img class="upload-preview" id="logoPreview">
        </div>
        <div class="fnote">Placed in the upper-left corner exactly as provided &mdash; not redrawn.</div>
      </div>
    </div>

    <!-- Generate -->
    <button class="gen-btn" id="genBtn" onclick="generate()" disabled>
      <span class="gen-spark">&#9889;</span>
      <span id="genLabel">Generate My Ad with Grok</span>
    </button>

    <!-- Loading -->
    <div class="loading-panel" id="loadingPanel">
      <div class="spinner"></div>
      <div class="loading-title">Grok is designing your ad&hellip;</div>
      <div class="loading-sub">This takes 20&ndash;45 seconds. Two things are happening:</div>
      <div class="loading-steps">
        <div class="lstep" id="lstep1"><div class="lstep-dot"></div>Grok Vision analyzes your template &amp; images</div>
        <div class="lstep" id="lstep2"><div class="lstep-dot"></div>Aurora generates the finished ad</div>
      </div>
    </div>

    <!-- Error -->
    <div class="err-box" id="errBox"></div>

    <!-- Result -->
    <div class="result-panel" id="resultPanel">
      <div class="result-hdr">
        <div class="result-title">&#10003; Your Grok-Generated Ad</div>
        <button class="act-btn" onclick="resetResult()" style="padding:5px 12px;font-size:11px">&#8634; Start Over</button>
      </div>
      <img class="result-img" id="resultImg" alt="Generated ad">
      <div class="result-actions">
        <button class="act-btn" onclick="downloadAd()">&#8595; Download</button>
        <button class="act-btn" onclick="generate()">&#8634; Regenerate</button>
        <button class="act-btn" id="debugBtn" onclick="toggleDebug()" style="margin-left:auto">&#128270; View Prompt</button>
      </div>
      <div class="prompt-debug" id="promptDebug"></div>
    </div>

  </div>
</div>

<script>
var _selectedPhotoUrl = '';
var _logoData = '';
var _artPrompt = '';
var _resultUrl = '';
var _activeTab = 'lib';

// ── FORM CHANGE ───────────────────────────────────────────────
function onFormChange(){
  var biz = document.getElementById('bizName').value.trim();
  document.getElementById('genBtn').disabled = !biz;
}

function onIndustryChange(){
  if(_activeTab === 'lib') loadLibrary();
}

// ── TABS ──────────────────────────────────────────────────────
function switchTab(tab){
  _activeTab = tab;
  document.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
  document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
  if(tab === 'lib'){
    document.querySelectorAll('.tab')[0].classList.add('active');
    document.getElementById('tabLib').classList.add('active');
    loadLibrary();
  } else {
    document.querySelectorAll('.tab')[1].classList.add('active');
    document.getElementById('tabUpload').classList.add('active');
  }
}

// ── MENU ──────────────────────────────────────────────────────
function addMenuItem(val){
  val = val||'';
  var list=document.getElementById('menuList');
  if(list.children.length>=4) return;
  var row=document.createElement('div');row.className='mrow';
  var inp=document.createElement('input');inp.type='text';inp.placeholder='Item Name $Price';inp.value=val;
  var rm=document.createElement('button');rm.className='rm-btn';rm.title='Remove';rm.textContent='\\u00d7';
  rm.onclick=function(){this.parentElement.remove();};
  row.appendChild(inp);row.appendChild(rm);
  list.appendChild(row);
}

function getMenu(){
  return Array.from(document.querySelectorAll('.mrow input'))
    .map(function(i){return i.value.trim();}).filter(Boolean).slice(0,4);
}

// ── IMAGE LIBRARY ─────────────────────────────────────────────
async function loadLibrary(){
  var industry = document.getElementById('industry').value;
  var grid = document.getElementById('libGrid');
  var note = document.getElementById('libNote');
  if(!industry){
    grid.innerHTML='<div class="img-empty">Select an industry above to load photos from the library.</div>';
    note.style.display='none';
    return;
  }
  grid.innerHTML='<div class="img-loading">Loading library photos&hellip;</div>';
  note.style.display='none';
  try{
    var r = await fetch('/api/image-library?industry='+encodeURIComponent(industry));
    var data = await r.json();
    var imgs = data.images||[];
    if(!imgs.length){
      grid.innerHTML='<div class="img-empty">No approved photos for this industry yet.<br>Switch to the &ldquo;Upload&rdquo; tab to use your own photo.</div>';
      return;
    }
    grid.innerHTML = imgs.map(function(img,i){
      return '<div class="img-thumb" id="lthumb-'+i+'" onclick="selectLibPhoto('+i+',this)" title="Photo by '+img.photographer_credit+'">'
        +'<img src="'+img.thumb_url+'" loading="lazy" alt="">'
        +'<div class="chk">\\u2713</div>'
        +'<input type="hidden" id="lurl-'+i+'" value="'+img.image_url+'">'
        +'</div>';
    }).join('');
    note.style.display='block';
  }catch(e){
    grid.innerHTML='<div class="img-empty">Error loading library: '+e.message+'</div>';
  }
}

function selectLibPhoto(i, el){
  document.querySelectorAll('.img-thumb').forEach(function(t){t.classList.remove('selected');});
  el.classList.add('selected');
  _selectedPhotoUrl = document.getElementById('lurl-'+i).value;
  document.getElementById('photoStatus').textContent='\\u2713 Photo selected';
  document.getElementById('photoStatus').style.color='var(--green)';
}

// ── PHOTO UPLOAD ──────────────────────────────────────────────
function handlePhotoUpload(input){
  var file = input.files[0]; if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e){
    _selectedPhotoUrl = e.target.result;
    var prev = document.getElementById('photoPreview');
    prev.src = e.target.result; prev.style.display='block';
    document.getElementById('photoZone').classList.add('has-file');
    document.getElementById('photoZone').querySelector('.upload-label').textContent='\\u2713 Photo ready';
    document.getElementById('photoStatus').textContent='\\u2713 Photo uploaded';
    document.getElementById('photoStatus').style.color='var(--green)';
  };
  reader.readAsDataURL(file);
}

// ── LOGO UPLOAD ───────────────────────────────────────────────
function handleLogoUpload(input){
  var file = input.files[0]; if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e){
    _logoData = e.target.result;
    var prev = document.getElementById('logoPreview');
    prev.src = e.target.result; prev.style.display='block';
    document.getElementById('logoZone').classList.add('has-file');
    document.getElementById('logoZone').querySelector('.upload-label').textContent='\\u2713 Logo ready';
    document.getElementById('logoStatus').textContent='\\u2713 Logo uploaded';
    document.getElementById('logoStatus').style.color='var(--green)';
  };
  reader.readAsDataURL(file);
}

// ── GENERATE ──────────────────────────────────────────────────
async function generate(){
  var biz = document.getElementById('bizName').value.trim();
  if(!biz){ alert('Please enter a business name.'); return; }

  hideResult();
  hideErr();

  document.getElementById('genBtn').disabled = true;
  document.getElementById('genLabel').textContent = 'Generating\\u2026';

  var loading = document.getElementById('loadingPanel');
  loading.classList.add('visible');
  setLoadStep(1);

  var body = {
    bizName:   biz,
    tagline:   document.getElementById('tagline').value.trim(),
    phone:     document.getElementById('phone').value.trim(),
    city:      document.getElementById('city').value.trim(),
    address:   document.getElementById('address').value.trim(),
    website:   document.getElementById('website').value.trim(),
    industry:  document.getElementById('industry').value || 'Local Business',
    menu:      getMenu(),
    offer:     document.getElementById('offer').value.trim(),
    offerFine: document.getElementById('offerFine').value.trim(),
    photoUrl:  _selectedPhotoUrl,
    logoData:  _logoData,
  };

  try {
    var stepTimer = setTimeout(function(){ setLoadStep(2); }, 12000);

    var resp = await fetch('/api/grok-ad-generator/generate', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    clearTimeout(stepTimer);
    setLoadStep(2);

    var data = await resp.json();
    loading.classList.remove('visible');

    if(!resp.ok || data.error){
      showErr(data.error || 'Generation failed — please try again.');
    } else {
      _resultUrl = data.imageUrl;
      _artPrompt = data.artPrompt || '';
      showResult(data.imageUrl);
      showToast('Ad generated! Download or use it below.');
    }
  } catch(err){
    document.getElementById('loadingPanel').classList.remove('visible');
    showErr('Network error: ' + (err instanceof Error ? err.message : String(err)));
  }

  document.getElementById('genBtn').disabled = false;
  document.getElementById('genLabel').textContent = 'Generate My Ad with Grok';
}

function setLoadStep(n){
  ['lstep1','lstep2'].forEach(function(id,i){
    var el = document.getElementById(id);
    el.className = 'lstep' + (i+1 < n ? ' done' : i+1 === n ? ' active' : '');
  });
}

function showResult(url){
  var panel = document.getElementById('resultPanel');
  document.getElementById('resultImg').src = url;
  panel.classList.add('visible');
  panel.scrollIntoView({behavior:'smooth',block:'start'});
  document.getElementById('promptDebug').textContent = _artPrompt;
}

function hideResult(){
  document.getElementById('resultPanel').classList.remove('visible');
  document.getElementById('promptDebug').classList.remove('visible');
}

function resetResult(){
  hideResult();
  _resultUrl=''; _artPrompt='';
}

function showErr(msg){
  var box = document.getElementById('errBox');
  box.textContent = '\\u26a0 ' + msg;
  box.classList.add('visible');
  box.scrollIntoView({behavior:'smooth',block:'start'});
}

function hideErr(){
  document.getElementById('errBox').classList.remove('visible');
}

function downloadAd(){
  if(!_resultUrl) return;
  var a=document.createElement('a');
  a.href=_resultUrl;
  a.download='grok-ad-'+document.getElementById('bizName').value.trim().replace(/\\s+/g,'-')+'-'+Date.now()+'.png';
  a.click();
}

function toggleDebug(){
  var el=document.getElementById('promptDebug');
  el.classList.toggle('visible');
  document.getElementById('debugBtn').textContent = el.classList.contains('visible') ? '\\ud83d\\udd0e Hide Prompt' : '\\ud83d\\udd0e View Prompt';
}

function showToast(msg){
  var t=document.getElementById('toast');
  t.textContent=msg;
  t.classList.add('show');
  setTimeout(function(){t.classList.remove('show');},3000);
}

// ── PREFILL ───────────────────────────────────────────────────
(function prefill(){
  var f={
    bizName:"Mr. Biscuit's Cafe",tagline:"From-Scratch Biscuits & Boba!",
    phone:"(706) 754-0105",city:"Clarkesville, GA",address:"596 W Louise St",
    website:"mrbiscuitscafe.com",offer:"$1 OFF Any Biscuit",
    offerFine:"1 per visit \\u00b7 with this postcard"
  };
  Object.keys(f).forEach(function(id){
    var el=document.getElementById(id); if(el) el.value=f[id];
  });
  var sel=document.getElementById('industry');
  for(var i=0;i<sel.options.length;i++){
    if(sel.options[i].text==='Breakfast & Cafe'){sel.selectedIndex=i;break;}
  }
  ['Bacon Egg & Cheese Biscuit $5.99','Boba Tea (any flavor) $4.50','Gravy Biscuit $3.99','Breakfast Plate $7.99']
    .forEach(function(v){addMenuItem(v);});
  onFormChange();
  loadLibrary();
})();
</script>
</body>
</html>`;
