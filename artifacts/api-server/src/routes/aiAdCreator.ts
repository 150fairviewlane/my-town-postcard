import { Router, type IRouter } from "express";
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

const SaveRequestSchema = z.object({
  adVersion: z.string().optional().default("ai-creator-v1"),
  source: z.enum(["claude", "chatgpt"]).optional().default("claude"),
  imageData: z.string().min(1, "imageData is required"),
  bizName: z.string().min(1, "bizName is required"),
  tagline: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  address: z.string().optional().default(""),
  city: z.string().optional().default(""),
  website: z.string().optional().default(""),
  industry: z.string().optional().default(""),
  menu: z.array(z.string()).optional().default([]),
  offer: z.string().optional().default(""),
  offerFine: z.string().optional().default(""),
});

router.post("/ai-ad-creator/save", async (req, res): Promise<void> => {
  const parsed = SaveRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const { bizName, source, adVersion } = parsed.data;
  req.log.info({ bizName, source, adVersion }, "ai-ad-creator save");
  res.json({ ok: true, message: "Ad saved" });
});

router.get("/ai-ad-creator/templates/mr-biscuits", (req, res): void => {
  const filePath = path.join(
    WORKSPACE_ROOT,
    "attached_assets",
    "mr_biscuits_template_no_logo_1778806527327.png"
  );
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Template file not found" });
    return;
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", 'attachment; filename="mr-biscuits-template.png"');
  fs.createReadStream(filePath).pipe(res);
});

router.get("/ai-ad-creator", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(AI_AD_CREATOR_HTML);
});

const AI_AD_CREATOR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Town Postcard &mdash; AI Ad Creator</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300&family=Crimson+Pro:ital,wght@0,400;0,600;1,400;1,600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --burg:#7C1C2E;--burg-dark:#5a1220;--burg-pale:#f9eaed;
  --ink:#0f1117;--ink-mid:#374151;--ink-light:#6B7280;
  --surface:#F4F1ED;--card:#fff;--border:#E2DDD6;
  --gold:#C8952A;--green:#1a5c3a;
}
body{font-family:'DM Sans',sans-serif;background:var(--surface);min-height:100vh;color:var(--ink)}

.hdr{background:var(--ink);padding:0 32px;display:flex;align-items:center;justify-content:space-between;height:56px;border-bottom:3px solid var(--burg);position:sticky;top:0;z-index:100}
.brand{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#fff;letter-spacing:.08em}
.brand span{color:#C8A882}
.hdr-tag{background:var(--burg);color:#fff;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:4px 12px;border-radius:20px}

.page{max-width:1060px;margin:0 auto;padding:32px 24px}
.page-title{font-family:'Bebas Neue',sans-serif;font-size:34px;letter-spacing:.06em;color:var(--ink);margin-bottom:4px}
.page-sub{font-family:'Crimson Pro',serif;font-style:italic;font-size:17px;color:var(--ink-light);margin-bottom:28px}

/* PROGRESS */
.steps{display:flex;gap:0;margin-bottom:32px}
.step{flex:1;display:flex;align-items:center;gap:9px;padding:11px 14px;background:var(--card);border:1.5px solid var(--border);position:relative}
.step:not(:last-child)::after{content:'&#x203A;';position:absolute;right:-10px;font-size:18px;color:var(--border);z-index:2;font-weight:300}
.step:first-child{border-radius:10px 0 0 10px}
.step:last-child{border-radius:0 10px 10px 0}
.step.active{border-color:var(--burg);background:var(--burg-pale)}
.step.done{border-color:var(--green);background:#f0fdf4}
.step-num{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;background:#ccc;color:#fff;transition:background .3s}
.step.active .step-num{background:var(--burg)}
.step.done .step-num{background:var(--green)}
.step-label{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-light)}
.step.active .step-label{color:var(--burg)}
.step.done .step-label{color:var(--green)}

/* GRID */
.grid{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:start}

/* CARDS */
.card{background:var(--card);border:1.5px solid var(--border);border-radius:12px;overflow:hidden}
.card-hdr{padding:13px 18px;border-bottom:1px solid var(--border);background:#FAFAF8;display:flex;align-items:center;justify-content:space-between}
.card-title{font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--burg)}
.card-body{padding:18px}

/* FIELDS */
.field{margin-bottom:12px}
.field:last-child{margin-bottom:0}
.field label{display:block;font-size:11px;font-weight:600;color:var(--ink-mid);margin-bottom:3px;letter-spacing:.06em;text-transform:uppercase}
.field input,.field select,.field textarea{width:100%;padding:8px 11px;border:1.5px solid var(--border);border-radius:7px;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.field input:focus,.field select:focus,.field textarea:focus{border-color:var(--burg);background:#fff}
.field textarea{resize:vertical;min-height:65px;line-height:1.5}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.fnote{font-size:10px;color:var(--ink-light);margin-top:3px;line-height:1.4}

/* MENU */
.menu-list{display:flex;flex-direction:column;gap:5px;margin-bottom:7px}
.mrow{display:flex;gap:6px;align-items:center}
.mrow input{flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:'DM Sans',sans-serif;font-size:12px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.mrow input:focus{border-color:var(--burg);background:#fff}
.rm-btn{width:26px;height:26px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-light);cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;line-height:1}
.rm-btn:hover{border-color:#c0392b;color:#c0392b;background:#fef2f2}
.add-btn{font-size:11px;font-weight:600;color:var(--burg);background:none;border:1.5px dashed var(--burg);border-radius:6px;padding:5px 12px;cursor:pointer;width:100%;transition:all .2s;font-family:'DM Sans',sans-serif}
.add-btn:hover{background:var(--burg-pale)}

/* TEMPLATE SELECTOR */
.tmpl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.tmpl-opt{position:relative}
.tmpl-opt input{position:absolute;opacity:0;width:0;height:0}
.tmpl-card{border:2px solid var(--border);border-radius:9px;overflow:hidden;cursor:pointer;transition:all .2s;background:var(--surface);display:block}
.tmpl-opt input:checked+.tmpl-card{border-color:var(--burg);box-shadow:0 0 0 2px var(--burg)}
.tmpl-thumb{width:100%;aspect-ratio:4/5;object-fit:cover;display:block}
.tmpl-thumb-ph{width:100%;aspect-ratio:4/5;background:#e8e3dc;display:flex;align-items:center;justify-content:center;font-size:22px;color:#bbb}
.tmpl-label{padding:6px 8px;font-size:10px;font-weight:700;text-align:center;color:var(--ink-mid);letter-spacing:.05em;text-transform:uppercase;border-top:1px solid var(--border)}
.tmpl-soon .tmpl-card{opacity:.48;cursor:not-allowed}
.tmpl-soon .tmpl-label{color:var(--ink-light)}

/* IMAGE CHECKLIST */
.img-check-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid var(--border);border-radius:9px;cursor:pointer;transition:all .2s;margin-bottom:8px;background:var(--surface)}
.img-check-row:last-of-type{margin-bottom:0}
.img-check-row:hover{border-color:#bbb;background:#fafaf8}
.img-check-row input[type=checkbox]{width:18px;height:18px;accent-color:var(--burg);flex-shrink:0;cursor:pointer}
.img-check-row input[type=checkbox]:checked~.img-check-info .img-check-label{color:var(--burg)}
.img-check-icon{font-size:22px;flex-shrink:0;width:32px;text-align:center}
.img-check-info{flex:1}
.img-check-label{font-size:13px;font-weight:600;color:var(--ink);line-height:1.2}
.img-check-sub{font-size:10.5px;color:var(--ink-light);margin-top:2px}
.img-check-note{font-size:11px;color:#7a6220;background:#fffbf0;border:1px solid #e8d99a;border-radius:7px;padding:9px 12px;margin-top:12px;line-height:1.5}

/* PROMPT PREVIEW */
.prompt-box{background:#0f1117;border-radius:10px;padding:16px;font-size:11px;line-height:1.7;color:rgba(255,255,255,.6);max-height:220px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;border:1px solid rgba(255,255,255,.07);font-family:'DM Sans',sans-serif}

/* LAUNCH BUTTON */
.launch-btn{width:100%;padding:15px;margin-top:14px;background:linear-gradient(135deg,#1C1B4B,#3D1A6B);color:#fff;border:none;border-radius:10px;font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:.12em;cursor:pointer;transition:all .25s;display:flex;align-items:center;justify-content:center;gap:10px}
.launch-btn:hover:not(:disabled){background:linear-gradient(135deg,#2a2870,#5a2490);transform:translateY(-1px);box-shadow:0 6px 24px rgba(80,30,180,.35)}
.launch-btn:disabled{background:#555;cursor:not-allowed;transform:none}
.spark{font-size:18px;animation:sp 2s ease-in-out infinite}
@keyframes sp{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}

/* COPY BTN */
.copy-btn{padding:8px 16px;background:var(--surface);border:1.5px solid var(--border);border-radius:7px;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;color:var(--ink-mid);cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:6px}
.copy-btn:hover{border-color:var(--burg);color:var(--burg);background:var(--burg-pale)}
.copy-btn.copied{border-color:var(--green);color:var(--green);background:#f0fdf4}

/* ATTACH GUIDE */
.attach-guide{background:linear-gradient(135deg,#1C1B4B,#2d1b4e);border-radius:12px;padding:20px 22px;margin-top:16px;color:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.08);display:none}
.attach-guide.visible{display:block}
.guide-title{font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:.1em;color:#C8A882;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.guide-steps{display:flex;flex-direction:column;gap:14px}
.guide-step{display:flex;gap:14px;align-items:flex-start}
.guide-step-num{width:28px;height:28px;border-radius:50%;background:var(--burg);color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.guide-step-body{flex:1}
.guide-step-head{font-size:13px;font-weight:700;color:#fff;margin-bottom:4px}
.guide-step-sub{font-size:11.5px;color:rgba(255,255,255,.6);line-height:1.55}
.guide-files{margin-top:6px;display:flex;flex-direction:column;gap:4px}
.guide-file{display:flex;align-items:center;gap:7px;font-size:12px;color:rgba(255,255,255,.8);background:rgba(255,255,255,.07);border-radius:6px;padding:5px 10px}
.guide-file svg{flex-shrink:0;opacity:.7}
.guide-file strong{color:#fff}
.guide-clip-hint{display:flex;align-items:center;gap:8px;margin-top:8px;padding:8px 12px;background:rgba(200,168,130,.12);border:1px solid rgba(200,168,130,.25);border-radius:8px;font-size:11.5px;color:rgba(255,255,255,.7)}

/* RESULT PANEL */
.result-panel{grid-column:1/-1;background:var(--card);border:1.5px solid var(--border);border-radius:12px;overflow:hidden;display:none}
.result-panel.visible{display:block}
.result-hdr{padding:14px 20px;border-bottom:1px solid var(--border);background:#FAFAF8;display:flex;align-items:center;justify-content:space-between}
.result-title{font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--green)}
.result-body{padding:24px;display:grid;grid-template-columns:auto 1fr;gap:28px;align-items:start}

/* DROP ZONE */
.drop-zone{width:320px;min-height:380px;border:3px dashed var(--border);border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:24px;cursor:pointer;transition:all .3s;background:var(--surface);position:relative}
.drop-zone.dragover{border-color:var(--burg);background:var(--burg-pale);transform:scale(1.01)}
.drop-zone.has-img{border-color:var(--green);background:#f0fdf4;padding:8px;justify-content:flex-start}
.drop-zone input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.drop-icon{font-size:40px;opacity:.3}
.drop-title{font-size:14px;font-weight:700;color:var(--ink-mid)}
.drop-sub{font-size:11.5px;color:var(--ink-light);line-height:1.5}
.drop-result{width:100%;border-radius:8px;display:none}
.drop-result.visible{display:block}

/* AD INFO */
.ad-info{flex:1}
.info-title{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:.06em;color:var(--ink);margin-bottom:12px}
.info-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:12.5px}
.info-row:last-child{border-bottom:none}
.info-label{color:var(--ink-light);font-weight:500}
.info-val{color:var(--ink);font-weight:600;text-align:right;max-width:58%;word-break:break-word}
.info-actions{display:flex;gap:8px;margin-top:18px;flex-wrap:wrap}
.act-btn{padding:9px 18px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-mid);transition:all .2s;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:6px}
.act-btn:hover:not(:disabled){border-color:var(--burg);color:var(--burg)}
.act-btn:disabled{opacity:.5;cursor:not-allowed}
.act-btn.primary{background:var(--green);border-color:var(--green);color:#fff}
.act-btn.primary:hover:not(:disabled){background:#144d30}

/* TOAST */
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:var(--ink);color:#fff;padding:10px 22px;border-radius:30px;font-size:13px;font-weight:600;box-shadow:0 8px 32px rgba(0,0,0,.3);transition:transform .3s cubic-bezier(.34,1.56,.64,1);z-index:999;pointer-events:none;display:flex;align-items:center;gap:8px}
.toast.show{transform:translateX(-50%) translateY(0)}

@media(max-width:760px){.grid,.result-body{grid-template-columns:1fr}.steps{flex-direction:column}.drop-zone{width:100%}.tmpl-grid{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>

<header class="hdr">
  <div class="brand">My Town <span>Postcard</span></div>
  <div class="hdr-tag">&#10022; AI Ad Creator</div>
</header>

<div class="toast" id="toast"></div>

<div class="page">
  <div class="page-title">AI Ad Creator</div>
  <div class="page-sub">Fill in your business details, pick a template, and click the button &mdash; Claude creates your ad in about 60 seconds.</div>

  <div class="steps">
    <div class="step active" id="step1"><div class="step-num">1</div><div class="step-label">Your Details</div></div>
    <div class="step" id="step2"><div class="step-num">2</div><div class="step-label">Launch Claude</div></div>
    <div class="step" id="step3"><div class="step-num">3</div><div class="step-label">Drop Result</div></div>
    <div class="step" id="step4"><div class="step-num">4</div><div class="step-label">Use Your Ad</div></div>
  </div>

  <div class="grid">

    <!-- ── LEFT: BUSINESS INFO ── -->
    <div>
      <div class="card" style="margin-bottom:18px">
        <div class="card-hdr"><div class="card-title">Business Info</div></div>
        <div class="card-body">
          <div class="field"><label>Business Name *</label><input type="text" id="bizName" placeholder="e.g. Mr. Biscuit's Cafe" oninput="buildPrompt()"></div>
          <div class="field"><label>Tagline / Slogan</label><input type="text" id="tagline" placeholder="e.g. From-Scratch Biscuits &amp; Boba!" oninput="buildPrompt()"></div>
          <div class="frow">
            <div class="field"><label>Phone *</label><input type="text" id="phone" placeholder="(706) 754-0105" oninput="buildPrompt()"></div>
            <div class="field"><label>City, State</label><input type="text" id="city" placeholder="Clarkesville, GA" oninput="buildPrompt()"></div>
          </div>
          <div class="field"><label>Street Address</label><input type="text" id="address" placeholder="596 W Louise St" oninput="buildPrompt()"></div>
          <div class="field"><label>Website / URL for QR Code</label><input type="text" id="website" placeholder="www.example.com" oninput="buildPrompt()"></div>
          <div class="field"><label>Industry</label>
            <select id="industry" onchange="buildPrompt()">
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
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-hdr"><div class="card-title">Menu Items / Services (up to 4)</div></div>
        <div class="card-body">
          <div class="fnote" style="margin-bottom:10px">Format: Item Name $Price &mdash; e.g. &ldquo;Bacon Biscuit $4.99&rdquo;</div>
          <div class="menu-list" id="menuList"></div>
          <button class="add-btn" onclick="addMenuItem()">+ Add Item</button>
        </div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">Special Offer / Coupon</div></div>
        <div class="card-body">
          <div class="field"><label>Offer (e.g. &ldquo;$1 OFF Any Biscuit&rdquo;)</label><input type="text" id="offer" placeholder="$1 OFF Any Biscuit" oninput="buildPrompt()"></div>
          <div class="field"><label>Fine Print</label><input type="text" id="offerFine" placeholder="1 per visit &middot; with this postcard" oninput="buildPrompt()"></div>
        </div>
      </div>
    </div>

    <!-- ── RIGHT: TEMPLATE + IMAGES + PROMPT ── -->
    <div>

      <!-- TEMPLATE SELECTOR -->
      <div class="card" style="margin-bottom:18px">
        <div class="card-hdr">
          <div class="card-title">Choose Background Template</div>
          <span style="font-size:10px;color:var(--ink-light)">Select one to continue</span>
        </div>
        <div class="card-body">
          <div class="tmpl-grid">
            <div class="tmpl-opt">
              <input type="radio" name="template" id="tmpl-mr-biscuits" value="mr-biscuits" onchange="onTemplateSelect()">
              <label class="tmpl-card" for="tmpl-mr-biscuits">
                <img class="tmpl-thumb" src="/api/ai-ad-creator/templates/mr-biscuits?view=1" alt="Mr. Biscuit&apos;s Style template">
                <div class="tmpl-label">Mr. Biscuit&apos;s Style</div>
              </label>
            </div>
            <div class="tmpl-opt tmpl-soon">
              <div class="tmpl-card" style="pointer-events:none">
                <div class="tmpl-thumb-ph">+</div>
                <div class="tmpl-label">Coming Soon</div>
              </div>
            </div>
            <div class="tmpl-opt tmpl-soon">
              <div class="tmpl-card" style="pointer-events:none">
                <div class="tmpl-thumb-ph">+</div>
                <div class="tmpl-label">Coming Soon</div>
              </div>
            </div>
            <div class="tmpl-opt tmpl-soon">
              <div class="tmpl-card" style="pointer-events:none">
                <div class="tmpl-thumb-ph">+</div>
                <div class="tmpl-label">Coming Soon</div>
              </div>
            </div>
            <div class="tmpl-opt tmpl-soon">
              <div class="tmpl-card" style="pointer-events:none">
                <div class="tmpl-thumb-ph">+</div>
                <div class="tmpl-label">Coming Soon</div>
              </div>
            </div>
            <div class="tmpl-opt tmpl-soon">
              <div class="tmpl-card" style="pointer-events:none">
                <div class="tmpl-thumb-ph">+</div>
                <div class="tmpl-label">Coming Soon</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- YOUR IMAGES (ready-check, no upload) -->
      <div class="card" style="margin-bottom:18px">
        <div class="card-hdr">
          <div class="card-title">Your Images</div>
          <span style="font-size:10px;color:var(--ink-light)">Have these ready to attach in Claude</span>
        </div>
        <div class="card-body">
          <label class="img-check-row">
            <input type="checkbox" id="chkPhoto" onchange="buildPrompt()">
            <div class="img-check-icon">&#128248;</div>
            <div class="img-check-info">
              <div class="img-check-label">Food / Hero Photo</div>
              <div class="img-check-sub">Your product, food, or storefront photo &mdash; check this if you have one</div>
            </div>
          </label>
          <label class="img-check-row">
            <input type="checkbox" id="chkLogo" onchange="buildPrompt()">
            <div class="img-check-icon">&#127991;&#65039;</div>
            <div class="img-check-info">
              <div class="img-check-label">Company Logo <span style="color:var(--ink-light);font-weight:400">(optional)</span></div>
              <div class="img-check-sub">Placed in the upper-left corner exactly as provided</div>
            </div>
          </label>
          <div class="img-check-note">
            You&rsquo;ll attach these files <strong>directly in Claude</strong> &mdash; no upload needed here. When you click the button below, the template downloads automatically and Claude opens ready for your images.
          </div>
        </div>
      </div>

      <!-- GENERATED PROMPT -->
      <div class="card">
        <div class="card-hdr">
          <div class="card-title">Generated Prompt</div>
          <button class="copy-btn" id="copyBtn" onclick="copyPrompt()">&#128203; Copy Prompt</button>
        </div>
        <div class="card-body">
          <div class="prompt-box" id="promptBox">Select a background template and fill in your business name to generate your prompt...</div>

          <!-- ATTACH GUIDE — shown after launch -->
          <div class="attach-guide" id="attachGuide">
            <div class="guide-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C8A882" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              Now attach your files in Claude
            </div>
            <div class="guide-steps">
              <div class="guide-step">
                <div class="guide-step-num">1</div>
                <div class="guide-step-body">
                  <div class="guide-step-head">Click the paperclip icon in Claude</div>
                  <div class="guide-step-sub">It&rsquo;s at the bottom-left of the message box &mdash; the same area where you type your message.</div>
                  <div class="guide-clip-hint">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    You can also drag files directly onto the Claude window
                  </div>
                </div>
              </div>
              <div class="guide-step">
                <div class="guide-step-num">2</div>
                <div class="guide-step-body">
                  <div class="guide-step-head">Attach your files</div>
                  <div class="guide-files" id="guideFileList"></div>
                </div>
              </div>
              <div class="guide-step">
                <div class="guide-step-num">3</div>
                <div class="guide-step-body">
                  <div class="guide-step-head">Hit Send &mdash; your ad appears in ~60 seconds</div>
                  <div class="guide-step-sub">Right-click the ad image Claude generates &rarr; <strong style="color:#fff">Save image</strong> &rarr; drag or paste it into the panel below.</div>
                </div>
              </div>
            </div>
          </div>

          <button class="launch-btn" id="launchBtn" onclick="launchAI()" disabled>
            <span class="spark">&#10024;</span> <span id="launchLabel">Generate My Ad in Claude</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ── RESULT PANEL ── -->
    <div class="result-panel" id="resultPanel">
      <div class="result-hdr">
        <div class="result-title">&#10003; Your AI-Generated Ad</div>
        <button class="act-btn" onclick="resetResult()">&#8634; Start Over</button>
      </div>
      <div class="result-body">
        <div class="drop-zone" id="dropZone">
          <input type="file" accept="image/*" onchange="handleResultDrop(this)">
          <div class="drop-icon">&#8681;</div>
          <div class="drop-title">Paste or Drop Your Ad Here</div>
          <div class="drop-sub">After Claude generates your ad image:<br>Right-click &rarr; Save Image<br>Then drag it here, click to upload, or press Ctrl+V</div>
          <img class="drop-result" id="dropResult" alt="Your generated ad">
        </div>
        <div class="ad-info" id="adInfo">
          <div class="info-title" id="infoName"></div>
          <div class="info-row"><span class="info-label">Phone</span><span class="info-val" id="infoPhone"></span></div>
          <div class="info-row"><span class="info-label">Address</span><span class="info-val" id="infoAddr"></span></div>
          <div class="info-row"><span class="info-label">Offer</span><span class="info-val" id="infoOffer"></span></div>
          <div class="info-row"><span class="info-label">Status</span><span class="info-val" id="infoStatus" style="color:var(--ink-light)">Waiting for image...</span></div>
          <div class="info-actions" id="infoActions" style="display:none">
            <button class="act-btn" onclick="downloadAd()">&#8595; Download</button>
            <button class="act-btn" onclick="regenerate()">&#8634; Try Again</button>
            <button class="act-btn primary" id="useAdBtn" onclick="useAd()">&#10003; Use This Ad</button>
          </div>
        </div>
      </div>
    </div>

  </div>
</div>

<script>
// ── STATE ──────────────────────────────────────────────────────
var resultImageUrl = null;
window._selectedTemplate = null;

// ── TEMPLATE SELECTION ────────────────────────────────────────
function onTemplateSelect(){
  var checked = document.querySelector('input[name="template"]:checked');
  window._selectedTemplate = checked ? checked.value : null;
  buildPrompt();
}

// ── MENU ──────────────────────────────────────────────────────
function addMenuItem(val){
  val = val || '';
  var list = document.getElementById('menuList');
  if(list.children.length >= 4) return;
  var row = document.createElement('div');
  row.className = 'mrow';
  var inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = 'Item Name $Price';
  inp.value = val;
  inp.oninput = buildPrompt;
  var rmBtn = document.createElement('button');
  rmBtn.className = 'rm-btn';
  rmBtn.title = 'Remove';
  rmBtn.textContent = '\\u00d7';
  rmBtn.onclick = function(){ this.parentElement.remove(); buildPrompt(); };
  row.appendChild(inp);
  row.appendChild(rmBtn);
  list.appendChild(row);
  buildPrompt();
}

function getMenu(){
  return Array.from(document.querySelectorAll('.mrow input'))
    .map(function(i){ return i.value.trim(); }).filter(Boolean).slice(0,4);
}

// ── BUILD PROMPT ──────────────────────────────────────────────
function buildPrompt(){
  var d = getData();

  if(!window._selectedTemplate || !d.bizName){
    var msg = !window._selectedTemplate
      ? 'Select a background template above to get started...'
      : 'Fill in your business name to generate your prompt...';
    document.getElementById('promptBox').textContent = msg;
    document.getElementById('launchBtn').disabled = true;
    return;
  }

  var menuStr = d.menu.length
    ? d.menu.map(function(m,i){ return '  Item '+(i+1)+': '+m; }).join('\\n')
    : '  (none provided)';

  var hasLogo  = !!document.getElementById('chkLogo').checked;
  var hasPhoto = !!document.getElementById('chkPhoto').checked;
  var sep = '\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550';

  var prompt =
    'You are a professional print advertisement designer. Your job is to produce a\\n'
  + 'finished, print-ready ad by compositing the images I am attaching below.\\n\\n'
  + sep+'\\n'
  + 'BUSINESS INFORMATION \\u2014 COPY ALL TEXT VERBATIM, EXACTLY AS WRITTEN\\n'
  + sep+'\\n\\n'
  + 'Business Name: '+d.bizName+'\\n'
  + 'Tagline: '+(d.tagline||'(none)')+'\\n'
  + 'Phone: '+(d.phone||'(none)')+'\\n'
  + 'Address: '+(d.address ? d.address+(d.city ? ', '+d.city : '') : (d.city||'(none)'))+'\\n'
  + 'Website: '+(d.website||'(none)')+'\\n'
  + 'Industry: '+(d.industry||'Local Business')+'\\n\\n'
  + 'Menu Items / Services:\\n'+menuStr+'\\n\\n'
  + 'Special Offer: '+(d.offer||'(none)')+'\\n'
  + 'Offer Fine Print: '+(d.offerFine||'1 per visit \\u00b7 with this postcard')+'\\n\\n'
  + '\\u2500\\u2500 CRITICAL: TEXT ACCURACY \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\n'
  + 'Copy every word, name, price, phone number, and address VERBATIM\\n'
  + 'from the information provided above. Do not correct spelling, do\\n'
  + 'not paraphrase, do not round prices, do not guess missing digits.\\n'
  + 'If you are uncertain about any character, reproduce it exactly as\\n'
  + 'written. A single wrong digit in a phone number or price ruins the\\n'
  + 'ad and it cannot be mailed.\\n'
  + '\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\n\\n'
  + 'Per-field verification:\\n'
  + '  Phone: "'+( d.phone||'(none)')+'" \\u2014 every digit must match; no reformatting\\n'
  + '  Business name: "'+d.bizName+'" \\u2014 exact spelling and punctuation\\n'
  + '  Prices: '+(d.menu.length ? d.menu.map(function(m){ return '"'+m+'"'; }).join(', ') : '(none)')+' \\u2014 no rounding\\n'
  + '  Address: "'+(d.address||'')+(d.city ? ', '+d.city : '')+'"\\n'
  + '  Offer: "'+(d.offer||'(none)')+'"\\n\\n'
  + sep+'\\n'
  + 'IMAGE ATTACHMENTS \\u2014 HOW TO COMPOSITE THIS AD\\n'
  + sep+'\\n\\n'
  + 'I am attaching the following images to this conversation. You must use all of them.\\n\\n'
  + 'IMAGE 1 \\u2014 BACKGROUND TEMPLATE\\n'
  + 'This is the complete ad template. It already contains all design elements:\\n'
  + 'parchment texture, decorative brush stroke, pennant banner, circular checkmark\\n'
  + 'badges, dashed coupon box, and dark footer strip. DO NOT redraw, reinterpret,\\n'
  + 'or replace any of these elements. Use the template exactly as your base layer\\n'
  + 'and build everything else on top of it.\\n\\n'
  + 'IMAGE 2 \\u2014 '+(hasPhoto ? 'FOOD / HERO PHOTO' : 'HERO IMAGE (generate this)')+'\\n'
  + (hasPhoto
      ? 'This is my food photo. Composite it into the right-center hero area of the\\n'
      + 'template so it emerges naturally from the brush stroke \\u2014 soft natural shadows,\\n'
      + 'smooth edge blending into the background. It must look fully integrated into\\n'
      + 'the composition, NOT dropped on top like a placed object or sticker.\\n'
      : 'I did not attach a hero photo. Generate a photorealistic, professionally lit\\n'
      + 'food/product image appropriate for a '+(d.industry||'local business')+'. Composite\\n'
      + 'it into the right-center hero area as described above.\\n')
  + '\\n'
  + (hasLogo
      ? 'IMAGE 3 \\u2014 COMPANY LOGO\\n'
      + 'Place the logo in the upper-left corner of the template exactly as provided.\\n'
      + 'Do not redraw it, stylize it, recolor it, or alter it in any way. Scale only\\n'
      + 'as needed to fit the designated upper-left area. Preserve all details exactly.\\n\\n'
      : 'UPPER-LEFT CORNER: No logo provided. Leave that zone clean, or place a simple\\n'
      + 'decorative element consistent with the existing template style.\\n\\n')
  + 'TEXT PLACEMENT:\\n'
  + 'Using the template layout as your guide, place all text in the zones the template\\n'
  + 'clearly indicates:\\n'
  + '  \\u2022 Business name \\u2014 large, dominant; the most prominent typographic element\\n'
  + '  \\u2022 Tagline \\u2014 script accent style, positioned as the template indicates\\n'
  + '  \\u2022 Menu items + prices \\u2014 next to the checkmark badges, one item per badge\\n'
  + '  \\u2022 Special offer \\u2014 inside the dashed coupon box\\n'
  + '  \\u2022 Phone number \\u2014 in the footer strip, large and prominent\\n'
  + '  \\u2022 Address / website \\u2014 in the footer strip, smaller\\n\\n'
  + sep+'\\n'
  + 'FINAL CHECKLIST \\u2014 VERIFY BEFORE GENERATING\\n'
  + sep+'\\n\\n'
  + '\\u2610 Phone number in the ad is EXACTLY "'+(d.phone||'N/A')+'"\\n'
  + '\\u2610 Business name in the ad is EXACTLY "'+d.bizName+'"\\n'
  + '\\u2610 All menu item prices match the provided list exactly\\n'
  + '\\u2610 Address matches "'+(d.address||'')+(d.city ? ', '+d.city : '')+'" exactly\\n'
  + '\\u2610 Special offer matches "'+(d.offer||'N/A')+'" exactly\\n'
  + '\\u2610 No text was invented, hallucinated, or paraphrased\\n'
  + '\\u2610 The food photo is integrated into the composition, not placed on top\\n'
  + '\\u2610 The template background is used exactly as provided, unchanged\\n'
  + (hasLogo ? '\\u2610 The logo appears in the upper-left corner exactly as provided\\n' : '')
  + '\\u2610 The result looks like a professionally produced print ad, not a mock-up\\n\\n'
  + 'Generate the ad now.';

  document.getElementById('promptBox').textContent = prompt;
  window._rawPrompt = prompt;
  window._hasLogo = hasLogo;
  window._hasPhoto = hasPhoto;
  document.getElementById('launchBtn').disabled = false;
  setStep(2);
}

function getData(){
  return {
    bizName:  document.getElementById('bizName').value.trim(),
    tagline:  document.getElementById('tagline').value.trim(),
    phone:    document.getElementById('phone').value.trim(),
    city:     document.getElementById('city').value.trim(),
    address:  document.getElementById('address').value.trim(),
    website:  document.getElementById('website').value.trim(),
    industry: document.getElementById('industry').value,
    menu:     getMenu(),
    offer:    document.getElementById('offer').value.trim(),
    offerFine:document.getElementById('offerFine').value.trim(),
  };
}

// ── COPY PROMPT ───────────────────────────────────────────────
async function copyPrompt(){
  if(!window._rawPrompt) return;
  try {
    await navigator.clipboard.writeText(window._rawPrompt);
    var btn = document.getElementById('copyBtn');
    btn.textContent = '\\u2713 Copied!';
    btn.classList.add('copied');
    showToast('Prompt copied to clipboard!');
    setTimeout(function(){ btn.textContent='\\ud83d\\udccb Copy Prompt'; btn.classList.remove('copied'); }, 2500);
  } catch(e){
    var ta = document.createElement('textarea');
    ta.value = window._rawPrompt;
    ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Prompt copied!');
  }
}

// ── LAUNCH AI ─────────────────────────────────────────────────
function launchAI(){
  var d = getData();
  if(!d.bizName){ alert('Please enter your business name first.'); return; }
  if(!window._selectedTemplate){ alert('Please select a background template first.'); return; }

  // Auto-download the template so it lands in Downloads before Claude opens
  var dl = document.createElement('a');
  dl.href = '/api/ai-ad-creator/templates/mr-biscuits';
  dl.download = 'mr-biscuits-template.png';
  dl.style.display = 'none';
  document.body.appendChild(dl);
  dl.click();
  setTimeout(function(){ document.body.removeChild(dl); }, 1500);

  var aiUrl = 'https://claude.ai/new?q=' + encodeURIComponent(window._rawPrompt);
  var pw = Math.min(820, screen.width * 0.55);
  var ph = Math.min(900, screen.height * 0.9);
  var pl = window.screen.width - pw - 20;
  var pt = Math.max(0, (screen.height - ph) / 2);

  var popup = window.open(
    aiUrl,
    'ai_console',
    'width='+pw+',height='+ph+',left='+pl+',top='+pt+',resizable=yes,scrollbars=yes'
  );

  if(!popup){
    copyPrompt();
    alert('Popup blocked! Please allow popups for this site, then click Launch again.\\n\\nYour prompt has been copied to the clipboard — paste it in Claude manually.');
    return;
  }

  showAttachGuide();
  showResultPanel();
  setStep(3);
  showToast('Claude opened \\u2014 attach your images then send!');
}

// ── ATTACH GUIDE ──────────────────────────────────────────────
function showAttachGuide(){
  var guide = document.getElementById('attachGuide');
  guide.classList.add('visible');

  var hasLogo  = !!window._hasLogo;
  var hasPhoto = !!window._hasPhoto;

  var icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  var files = [];
  files.push(icon + ' <strong>mr-biscuits-template.png</strong> &mdash; just downloaded to your Downloads folder');
  if(hasPhoto) files.push(icon + ' <strong>Your food / hero photo</strong>');
  if(hasLogo)  files.push(icon + ' <strong>Your company logo</strong>');

  var list = document.getElementById('guideFileList');
  list.innerHTML = files.map(function(f){
    return '<div class="guide-file">'+f+'</div>';
  }).join('');
}

// ── RESULT HANDLING ───────────────────────────────────────────
function showResultPanel(){
  var panel = document.getElementById('resultPanel');
  panel.classList.add('visible');
  panel.scrollIntoView({behavior:'smooth', block:'start'});
  var d = getData();
  document.getElementById('infoName').textContent = d.bizName;
  document.getElementById('infoPhone').textContent = d.phone || '\\u2014';
  document.getElementById('infoAddr').textContent = [d.address,d.city].filter(Boolean).join(', ') || '\\u2014';
  document.getElementById('infoOffer').textContent = d.offer || '\\u2014';
}

function handleResultDrop(input){
  var file = input.files[0]; if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e){
    resultImageUrl = e.target.result;
    var img = document.getElementById('dropResult');
    var zone = document.getElementById('dropZone');
    img.src = resultImageUrl;
    img.classList.add('visible');
    zone.classList.add('has-img');
    zone.querySelector('.drop-icon').style.display='none';
    zone.querySelector('.drop-title').style.display='none';
    zone.querySelector('.drop-sub').style.display='none';
    document.getElementById('infoStatus').textContent = '\\u2713 Ad image received';
    document.getElementById('infoStatus').style.color = 'var(--green)';
    document.getElementById('infoActions').style.display='flex';
    setStep(4);
  };
  reader.readAsDataURL(file);
}

document.addEventListener('paste', function(e){
  var items = e.clipboardData && e.clipboardData.items;
  if(!items) return;
  for(var i=0;i<items.length;i++){
    if(items[i].type.startsWith('image/')){
      handleResultDrop({ files: [items[i].getAsFile()] });
      break;
    }
  }
});

function downloadAd(){
  if(!resultImageUrl) return;
  var a = document.createElement('a');
  a.href = resultImageUrl;
  a.download = 'ad-'+document.getElementById('bizName').value.trim().replace(/\\s+/g,'-')+'-'+Date.now()+'.png';
  a.click();
}

function regenerate(){
  document.getElementById('dropResult').classList.remove('visible');
  var zone = document.getElementById('dropZone');
  zone.classList.remove('has-img');
  zone.querySelector('.drop-icon').style.display='';
  zone.querySelector('.drop-title').style.display='';
  zone.querySelector('.drop-sub').style.display='';
  document.getElementById('infoActions').style.display='none';
  document.getElementById('infoStatus').textContent='Waiting for image...';
  document.getElementById('infoStatus').style.color='var(--ink-light)';
  resultImageUrl = null;
  launchAI();
}

function resetResult(){
  document.getElementById('resultPanel').classList.remove('visible');
  document.getElementById('attachGuide').classList.remove('visible');
  resultImageUrl = null;
  setStep(1);
}

async function useAd(){
  if(!resultImageUrl){
    document.getElementById('infoStatus').textContent = 'Please drop or paste your ad image first.';
    document.getElementById('infoStatus').style.color = '#c0392b';
    return;
  }
  var d = getData();
  var useBtn = document.getElementById('useAdBtn');
  useBtn.disabled = true;
  useBtn.textContent = 'Saving...';
  try {
    var resp = await fetch('/api/ai-ad-creator/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adVersion: 'ai-creator-v1',
        source: 'claude',
        imageData: resultImageUrl,
        bizName: d.bizName,
        tagline: d.tagline,
        phone: d.phone,
        address: d.address,
        city: d.city,
        website: d.website,
        industry: d.industry,
        menu: d.menu,
        offer: d.offer,
        offerFine: d.offerFine,
      }),
    });
    var data = await resp.json();
    if(!resp.ok) throw new Error(data.error || 'Save failed');
    document.getElementById('infoStatus').textContent = '\\u2713 Ad saved successfully!';
    document.getElementById('infoStatus').style.color = 'var(--green)';
    useBtn.textContent = '\\u2713 Saved';
    showToast('Ad saved!');
  } catch(err){
    useBtn.disabled = false;
    useBtn.textContent = '\\u2713 Use This Ad';
    document.getElementById('infoStatus').textContent = 'Save failed: ' + (err instanceof Error ? err.message : String(err));
    document.getElementById('infoStatus').style.color = '#c0392b';
  }
}

// ── STEP TRACKER ─────────────────────────────────────────────
function setStep(n){
  for(var i=1;i<=4;i++){
    var el = document.getElementById('step'+i);
    el.className = 'step'+(i<n?' done':i===n?' active':'');
  }
}

// ── TOAST ─────────────────────────────────────────────────────
function showToast(msg){
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 3200);
}

// ── DRAG AND DROP ─────────────────────────────────────────────
var dropZoneEl = document.getElementById('dropZone');
dropZoneEl.addEventListener('dragover', function(e){ e.preventDefault(); dropZoneEl.classList.add('dragover'); });
dropZoneEl.addEventListener('dragleave', function(){ dropZoneEl.classList.remove('dragover'); });
dropZoneEl.addEventListener('drop', function(e){
  e.preventDefault();
  dropZoneEl.classList.remove('dragover');
  var file = e.dataTransfer.files[0];
  if(file && file.type.startsWith('image/')){
    handleResultDrop({ files: [file] });
  }
});

// ── INIT / TEST PREFILL ───────────────────────────────────────
(function prefill(){
  var f = {
    bizName:   "Mr. Biscuit's Cafe",
    tagline:   "From-Scratch Biscuits & Boba!",
    phone:     "(706) 754-0105",
    city:      "Clarkesville, GA",
    address:   "596 W Louise St",
    website:   "mrbiscuitscafe.com",
    offer:     "$1 OFF Any Biscuit",
    offerFine: "1 per visit \\u00b7 with this postcard"
  };
  Object.keys(f).forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.value = f[id];
  });
  var sel = document.getElementById('industry');
  if(sel){
    for(var i=0;i<sel.options.length;i++){
      if(sel.options[i].text === 'Breakfast & Cafe'){ sel.selectedIndex = i; break; }
    }
  }
  document.getElementById('chkPhoto').checked = true;
  document.getElementById('chkLogo').checked = true;
  var items = [
    "Bacon Egg & Cheese Biscuit $5.99",
    "Boba Tea (any flavor) $4.50",
    "Gravy Biscuit $3.99",
    "Breakfast Plate $7.99"
  ];
  items.forEach(function(v){ addMenuItem(v); });
  var radio = document.getElementById('tmpl-mr-biscuits');
  if(radio){ radio.checked = true; onTemplateSelect(); }
})();
</script>

</body>
</html>`;

export default router;
