import { Router, type IRouter } from "express";
import { z } from "zod/v4";

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

/* UPLOAD */
.upload-zone{border:2px dashed var(--border);border-radius:8px;padding:14px;text-align:center;cursor:pointer;transition:all .2s;background:var(--surface);position:relative;overflow:hidden}
.upload-zone:hover{border-color:var(--burg);background:var(--burg-pale)}
.upload-zone.has-file{border-color:var(--green);background:#f0fdf4}
.upload-zone input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.upload-preview{width:100%;max-height:80px;object-fit:cover;border-radius:5px;margin-top:6px;display:none}
.upload-label{font-size:11px;font-weight:600;color:var(--ink-mid);margin-top:4px}
.upload-sub{font-size:10px;color:var(--ink-light)}

/* MENU */
.menu-list{display:flex;flex-direction:column;gap:5px;margin-bottom:7px}
.mrow{display:flex;gap:6px;align-items:center}
.mrow input{flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:'DM Sans',sans-serif;font-size:12px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.mrow input:focus{border-color:var(--burg);background:#fff}
.rm-btn{width:26px;height:26px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-light);cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;line-height:1}
.rm-btn:hover{border-color:#c0392b;color:#c0392b;background:#fef2f2}
.add-btn{font-size:11px;font-weight:600;color:var(--burg);background:none;border:1.5px dashed var(--burg);border-radius:6px;padding:5px 12px;cursor:pointer;width:100%;transition:all .2s;font-family:'DM Sans',sans-serif}
.add-btn:hover{background:var(--burg-pale)}

/* AI SELECTOR */
.ai-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ai-opt{position:relative}
.ai-opt input{position:absolute;opacity:0;width:0;height:0}
.ai-opt label{display:flex;align-items:center;gap:12px;padding:13px 14px;border:2px solid var(--border);border-radius:9px;cursor:pointer;transition:all .2s;background:var(--surface)}
.ai-opt label:hover{border-color:#bbb}
.ai-opt input:checked+label{border-color:var(--burg);background:var(--burg-pale);box-shadow:0 0 0 1px var(--burg)}
.ai-logo{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.ai-name{font-size:13px;font-weight:700;color:var(--ink)}
.ai-desc{font-size:10px;color:var(--ink-light);margin-top:1px}

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

/* INSTRUCTION CALLOUT */
.callout{background:linear-gradient(135deg,#1C1B4B,#2d1b4e);border-radius:10px;padding:16px 18px;margin-top:14px;color:rgba(255,255,255,.85);font-size:12px;line-height:1.7;border:1px solid rgba(255,255,255,.08)}
.callout strong{color:#C8A882}
.callout ol{padding-left:18px;margin-top:6px}
.callout li{margin-bottom:4px}

/* TOAST */
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:var(--ink);color:#fff;padding:10px 22px;border-radius:30px;font-size:13px;font-weight:600;box-shadow:0 8px 32px rgba(0,0,0,.3);transition:transform .3s cubic-bezier(.34,1.56,.64,1);z-index:999;pointer-events:none;display:flex;align-items:center;gap:8px}
.toast.show{transform:translateX(-50%) translateY(0)}

@media(max-width:760px){.grid,.result-body{grid-template-columns:1fr}.steps{flex-direction:column}.drop-zone{width:100%}}
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
  <div class="page-sub">Fill in your details, launch your AI console — the prompt is delivered automatically.</div>

  <div class="steps">
    <div class="step active" id="step1"><div class="step-num">1</div><div class="step-label">Your Details</div></div>
    <div class="step" id="step2"><div class="step-num">2</div><div class="step-label">Launch AI</div></div>
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

    <!-- ── RIGHT: IMAGES + AI + PROMPT ── -->
    <div>
      <div class="card" style="margin-bottom:18px">
        <div class="card-hdr"><div class="card-title">Your Images</div></div>
        <div class="card-body">
          <div class="frow">
            <div class="field">
              <label>Logo (optional)</label>
              <div class="upload-zone" id="logoZone">
                <input type="file" accept="image/*" onchange="handleUpload(this,'logoPreview','logoZone','logoB64')">
                <div style="font-size:22px">&#127991;&#65039;</div>
                <div class="upload-label">Upload Logo</div>
                <div class="upload-sub">PNG, JPG, SVG</div>
                <img class="upload-preview" id="logoPreview">
              </div>
            </div>
            <div class="field">
              <label>Hero Photo (optional)</label>
              <div class="upload-zone" id="photoZone">
                <input type="file" accept="image/*" onchange="handleUpload(this,'photoPreview','photoZone','photoB64')">
                <div style="font-size:22px">&#128248;</div>
                <div class="upload-label">Upload Photo</div>
                <div class="upload-sub">Food, store, product</div>
                <img class="upload-preview" id="photoPreview">
              </div>
            </div>
          </div>
          <div class="fnote" style="margin-top:8px">If you have a logo or food photo, upload it here &mdash; attach it to the AI conversation alongside the generated prompt.</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-hdr"><div class="card-title">Choose Your AI</div></div>
        <div class="card-body">
          <div class="ai-grid">
            <div class="ai-opt">
              <input type="radio" name="ai" id="ai-claude" value="claude" checked onchange="buildPrompt()">
              <label for="ai-claude">
                <div class="ai-logo" style="background:#D97757">&#129302;</div>
                <div>
                  <div class="ai-name">Claude</div>
                  <div class="ai-desc">claude.ai &middot; Prompt sent automatically via URL</div>
                </div>
              </label>
            </div>
            <div class="ai-opt">
              <input type="radio" name="ai" id="ai-gpt" value="gpt" onchange="buildPrompt()">
              <label for="ai-gpt">
                <div class="ai-logo" style="background:#10a37f">&#128172;</div>
                <div>
                  <div class="ai-name">ChatGPT</div>
                  <div class="ai-desc">chatgpt.com &middot; Prompt auto-copied, press Ctrl+V</div>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-hdr">
          <div class="card-title">Generated Prompt</div>
          <button class="copy-btn" id="copyBtn" onclick="copyPrompt()">&#128203; Copy Prompt</button>
        </div>
        <div class="card-body">
          <div class="prompt-box" id="promptBox">Fill in your business details on the left to generate your prompt...</div>

          <div class="callout" id="callout" style="display:none">
            <strong>How this works:</strong>
            <ol>
              <li id="callout-step1">Click <strong>Launch AI Console</strong> &mdash; Claude opens with your prompt pre-loaded automatically</li>
              <li>Attach your <strong>logo and/or food photo</strong> to the message if you uploaded them</li>
              <li>Hit send and wait ~30 seconds for your professional ad image</li>
              <li>Right-click the result &rarr; <strong>Save image</strong>, then drag or paste it below</li>
            </ol>
          </div>

          <button class="launch-btn" id="launchBtn" onclick="launchAI()" disabled>
            <span class="spark">&#10024;</span> <span id="launchLabel">Launch AI Console</span>
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
          <div class="drop-sub">After the AI generates your ad image:<br>Right-click &rarr; Save Image<br>Then drag it here, click to upload, or press Ctrl+V</div>
          <img class="drop-result" id="dropResult" alt="Your generated ad">
        </div>
        <div class="ad-info" id="adInfo">
          <div class="info-title" id="infoName"></div>
          <div class="info-row"><span class="info-label">Phone</span><span class="info-val" id="infoPhone"></span></div>
          <div class="info-row"><span class="info-label">Address</span><span class="info-val" id="infoAddr"></span></div>
          <div class="info-row"><span class="info-label">Offer</span><span class="info-val" id="infoOffer"></span></div>
          <div class="info-row"><span class="info-label">AI Used</span><span class="info-val" id="infoAI"></span></div>
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
let logoB64 = null;
let photoB64 = null;
let resultImageUrl = null;

// ── MENU ──────────────────────────────────────────────────────
function addMenuItem(val){
  val = val || '';
  const list = document.getElementById('menuList');
  if(list.children.length >= 4) return;
  const row = document.createElement('div');
  row.className = 'mrow';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = 'Item Name $Price';
  inp.value = val;
  inp.oninput = buildPrompt;
  const rmBtn = document.createElement('button');
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

// ── UPLOAD ────────────────────────────────────────────────────
function handleUpload(input, previewId, zoneId, varName){
  var file = input.files[0]; if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e){
    if(varName==='logoB64') logoB64 = e.target.result;
    if(varName==='photoB64') photoB64 = e.target.result;
    var prev = document.getElementById(previewId);
    prev.src = e.target.result; prev.style.display='block';
    document.getElementById(zoneId).classList.add('has-file');
    document.getElementById(zoneId).querySelector('.upload-label').textContent = '\\u2713 Uploaded';
    buildPrompt();
  };
  reader.readAsDataURL(file);
}

// ── BUILD PROMPT ──────────────────────────────────────────────
function buildPrompt(){
  var d = getData();
  if(!d.bizName){
    document.getElementById('promptBox').textContent = 'Fill in your business name to generate your prompt...';
    document.getElementById('launchBtn').disabled = true;
    document.getElementById('callout').style.display = 'none';
    return;
  }

  var menuStr = d.menu.length
    ? d.menu.map(function(item,i){ return '  Item ' + (i+1) + ': ' + item; }).join('\\n')
    : '  (none provided)';

  var hasLogo  = !!logoB64;
  var hasPhoto = !!photoB64;

  var prompt = 'You are a professional print advertisement designer specializing in direct-mail postcards for local businesses. I need you to create a stunning, print-ready 4\\u00d75 inch postcard advertisement.\\n\\n'
    + '\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\n'
    + 'BUSINESS INFORMATION \\u2014 USE EXACTLY AS PROVIDED\\n'
    + '\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\n\\n'
    + 'Business Name: ' + d.bizName + '\\n'
    + 'Tagline: ' + (d.tagline || '(none)') + '\\n'
    + 'Phone: ' + (d.phone || '(none)') + '\\n'
    + 'Address: ' + (d.address ? d.address + (d.city ? ', ' + d.city : '') : (d.city || '(none)')) + '\\n'
    + 'Website: ' + (d.website || '(none)') + '\\n'
    + 'Industry: ' + (d.industry || 'Local Business') + '\\n\\n'
    + 'Menu Items / Services:\\n' + menuStr + '\\n\\n'
    + 'Special Offer: ' + (d.offer || '(none)') + '\\n'
    + 'Offer Fine Print: ' + (d.offerFine || '1 per visit \\u00b7 with this postcard') + '\\n\\n'
    + '\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\n'
    + '\\u26a0 CRITICAL TEXT ACCURACY RULES \\u2014 READ CAREFULLY\\n'
    + '\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\n\\n'
    + 'These rules are ABSOLUTE. Violating any of them makes the ad unusable.\\n\\n'
    + 'RULE 1 \\u2014 PHONE NUMBER: The phone number in the ad must be EXACTLY "' + (d.phone || '(none)') + '".\\n'
    + '  - Do not change any digit\\n  - Do not add or remove digits\\n  - Do not reformat it differently\\n\\n'
    + 'RULE 2 \\u2014 BUSINESS NAME: The business name must be EXACTLY "' + d.bizName + '"\\n'
    + '  - Do not add words, remove words, or change spelling\\n\\n'
    + 'RULE 3 \\u2014 PRICES: Every price must match exactly as provided:\\n'
    + (d.menu.length ? d.menu.map(function(m){ return '  "' + m + '"'; }).join('\\n') : '  (none)') + '\\n'
    + '  - Do not round, change, or approximate any price\\n\\n'
    + 'RULE 4 \\u2014 ADDRESS: The address must be EXACTLY "' + (d.address || '') + (d.city ? ', ' + d.city : '') + '"\\n\\n'
    + 'RULE 5 \\u2014 OFFER: The special offer must be EXACTLY "' + (d.offer || '') + '"\\n\\n'
    + 'RULE 6 \\u2014 NO INVENTED TEXT: Do not add any phone numbers, prices, addresses, URLs, or business names that were not provided above.\\n\\n'
    + 'RULE 7 \\u2014 VERIFICATION: Before finalizing, re-read every piece of text and verify it matches the information provided above character by character.\\n\\n'
    + '\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\n'
    + 'DESIGN REQUIREMENTS\\n'
    + '\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\n\\n'
    + 'Style: Premium local direct-mail postcard \\u2014 warm, professional, eye-catching.\\n'
    + 'Look: Professionally art-directed. NOT a template. NOT a generic AI graphic.\\n'
    + 'Feel: The kind of ad a business would proudly display and customers would keep.\\n\\n'
    + 'Visual approach:\\n'
    + '- Warm, rich color palette appropriate for a ' + (d.industry || 'local business') + '\\n'
    + '- Layered typography with dynamic composition \\u2014 mix of bold display fonts and elegant script\\n'
    + '- The business name should have visual weight and personality\\n'
    + '- Hero food/product photography should be the dominant visual element\\n'
    + '- Brush stroke textures, warm vignettes, and decorative elements add artisan quality\\n'
    + '- A dashed-border coupon box in the lower right for the special offer\\n'
    + '- Circular checkmark badges next to each menu item\\n'
    + '- A dark footer strip with the phone number prominently displayed in large type\\n'
    + '- A QR code placeholder in the bottom right corner\\n\\n'
    + 'Typography hierarchy (largest to smallest):\\n'
    + '1. Business name \\u2014 largest, most prominent\\n'
    + '2. Special offer amount \\u2014 second largest, inside coupon box\\n'
    + '3. Tagline \\u2014 elegant script style, left side\\n'
    + '4. Menu items \\u2014 clean, readable, uppercase\\n'
    + '5. Phone number \\u2014 large Bebas Neue style in footer\\n'
    + '6. Address and fine print \\u2014 smallest, footer area\\n\\n'
    + (hasLogo ? 'LOGO: I am attaching my logo image. Please incorporate it prominently in the top left area.' : 'LOGO AREA: Leave a clean space in the top left for a logo (add a decorative ribbon or badge element there instead).') + '\\n'
    + (hasPhoto ? 'HERO PHOTO: I am attaching my hero photo. Use this as the primary background/hero image \\u2014 make it large, cinematic, and dominant.' : 'HERO IMAGE: Generate a photorealistic, cinematic, professionally lit hero image appropriate for a ' + (d.industry || 'local business') + '. Make it look like a professional commercial photograph, not an illustration.') + '\\n\\n'
    + 'Canvas: Portrait orientation, 4:5 ratio (suitable for a 4\\u00d75 inch postcard at 300 DPI)\\n\\n'
    + '\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\n'
    + 'FINAL VERIFICATION CHECKLIST\\n'
    + '\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\n\\n'
    + 'Before you generate the image, confirm:\\n'
    + '\\u2610 Phone number matches "' + (d.phone || 'N/A') + '" exactly\\n'
    + '\\u2610 Business name matches "' + d.bizName + '" exactly\\n'
    + '\\u2610 All prices match the provided menu items exactly\\n'
    + '\\u2610 Address matches "' + (d.address || '') + (d.city ? ', ' + d.city : '') + '" exactly\\n'
    + '\\u2610 Special offer matches "' + (d.offer || 'N/A') + '" exactly\\n'
    + '\\u2610 No text has been invented or hallucinated\\n'
    + '\\u2610 The design looks premium, print-ready, and commercially professional\\n\\n'
    + 'Generate the ad now.';

  document.getElementById('promptBox').textContent = prompt;
  window._rawPrompt = prompt;
  document.getElementById('launchBtn').disabled = false;
  document.getElementById('callout').style.display = 'block';

  // Update callout step 1 based on selected AI
  var isClaudeSelected = (d.ai === 'claude');
  var calloutStep1 = document.getElementById('callout-step1');
  if(calloutStep1){
    calloutStep1.innerHTML = isClaudeSelected
      ? 'Click <strong>Launch AI Console</strong> &mdash; Claude opens with your prompt pre-loaded automatically'
      : 'Click <strong>Launch AI Console</strong> &mdash; ChatGPT opens and your prompt is copied, just press <strong>Ctrl+V</strong> (or &#8984;V) to paste';
  }

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
    ai:       (document.querySelector('input[name="ai"]:checked') || {}).value || 'claude',
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
async function launchAI(){
  var d = getData();
  if(!d.bizName){ alert('Please enter your business name first.'); return; }

  // Always copy prompt to clipboard
  await copyPrompt();

  var aiUrl, toastMsg;
  if(d.ai === 'claude'){
    // Claude supports ?q= to pre-fill and send the prompt automatically (full length, no truncation)
    aiUrl = 'https://claude.ai/new?q=' + encodeURIComponent(window._rawPrompt);
    toastMsg = 'Claude opened \\u2014 prompt pre-loaded automatically!';
  } else {
    // ChatGPT has no URL param \\u2014 prompt is in the clipboard
    aiUrl = 'https://chatgpt.com/';
    toastMsg = 'Prompt copied \\u2014 press Ctrl+V to paste in ChatGPT';
  }

  var pw = Math.min(820, screen.width * 0.55);
  var ph = Math.min(900, screen.height * 0.9);
  var pl = window.screen.width - pw - 20;
  var pt = Math.max(0, (screen.height - ph) / 2);

  var popup = window.open(
    aiUrl,
    'ai_console',
    'width=' + pw + ',height=' + ph + ',left=' + pl + ',top=' + pt + ',resizable=yes,scrollbars=yes'
  );

  if(!popup){
    alert('Popup blocked! Please allow popups for this site, then click Launch again.\\n\\nYour prompt has been copied to the clipboard.');
    return;
  }

  showResultPanel();
  setStep(3);
  showToast(toastMsg);
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
  document.getElementById('infoAI').textContent = d.ai === 'claude' ? 'Claude (claude.ai)' : 'ChatGPT (chatgpt.com)';
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

// Support paste anywhere on the page
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
  a.download = 'ad-' + document.getElementById('bizName').value.trim().replace(/\\s+/g,'-') + '-' + Date.now() + '.png';
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
        source: d.ai === 'claude' ? 'claude' : 'chatgpt',
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
    document.getElementById('infoStatus').textContent = 'Save failed: ' + err.message;
    document.getElementById('infoStatus').style.color = '#c0392b';
  }
}

// ── STEP TRACKER ─────────────────────────────────────────────
function setStep(n){
  for(var i=1;i<=4;i++){
    var el = document.getElementById('step'+i);
    el.className = 'step' + (i<n?' done':i===n?' active':'');
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

// ── INIT ──────────────────────────────────────────────────────
addMenuItem(''); addMenuItem(''); addMenuItem(''); addMenuItem('');
</script>

</body>
</html>`;

export default router;
