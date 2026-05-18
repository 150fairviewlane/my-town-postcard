import { Router, type IRouter } from "express";

const router: IRouter = Router();

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 60_000;
const RETRY_DELAYS_MS = [800, 2400];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Proxy: POST /api/ai/v2/generate ──────────────────────────────────────────
// Accepts the native Anthropic messages format from the v2 HTML page and
// forwards it with the server-side API key. Returns the Anthropic response
// body unchanged so the browser-side JS doesn't need any adaptation.
router.post("/ai/v2/generate", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    req.log.error("ANTHROPIC_API_KEY is not set");
    res.status(500).json({ error: { message: "AI service is not configured on this server." } });
    return;
  }

  const { model, max_tokens, messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: { message: "messages array is required" } });
    return;
  }

  const upstreamBody = JSON.stringify({
    model: model ?? "claude-sonnet-4-20250514",
    max_tokens: typeof max_tokens === "number" ? max_tokens : 4000,
    messages,
  });

  const totalAttempts = 1 + RETRY_DELAYS_MS.length;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    try {
      const upstream = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: upstreamBody,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      const text = await upstream.text();
      let data: unknown = null;
      try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }

      if (upstream.ok) {
        res.json(data);
        return;
      }

      const isRetryable = upstream.status === 429 || upstream.status >= 500;
      req.log.warn({ attempt: attempt + 1, status: upstream.status }, "ai/v2/generate upstream error");
      if (isRetryable && attempt < totalAttempts - 1) continue;

      res.status(upstream.status >= 500 || upstream.status === 404 ? 502 : upstream.status).json(data ?? { error: { message: `Upstream ${upstream.status}` } });
      return;
    } catch (err) {
      const e = err as { name?: string; message?: string };
      const isAbort = e?.name === "AbortError" || e?.name === "TimeoutError";
      req.log.warn({ attempt: attempt + 1, name: e?.name }, "ai/v2/generate fetch failed");
      if (attempt < totalAttempts - 1) continue;
      res.status(503).json({ error: { message: isAbort ? "AI service timed out — please try again." : (e?.message ?? "Network error") } });
      return;
    }
  }

  if (!res.headersSent) res.status(503).json({ error: { message: "AI service is temporarily unavailable." } });
});

// ── Page: GET /api/ad-generator-v2 ───────────────────────────────────────────
// Serves the standalone AI Ad Generator v2 HTML page. The API call inside
// is routed to /api/ai/v2/generate above so the Anthropic key stays server-side.
router.get("/ad-generator-v2", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(AD_GENERATOR_V2_HTML);
});

export default router;

// ── Inline HTML ──────────────────────────────────────────────────────────────
// Kept here so it's a single self-contained file. The only change from the
// source the user provided is:
//   1. CSS en-dashes (–) in var() references fixed to double hyphens (--)
//   2. API URL changed to /api/ai/v2/generate (backend proxy, no key in browser)
//   3. Code-fence markers removed (they were markdown paste artifacts)
const AD_GENERATOR_V2_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Town Postcard — AI Ad Generator</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--ink:#0F0F0F;--ink-mid:#3D3D3D;--ink-light:#888;--surface:#F4F1EC;--card:#fff;--gold:#7C1C2E;--gold-pale:#F5E8EB;--border:#E2DDD6;--green:#2A7A4B;--red:#C0392B}
body{font-family:'DM Sans',sans-serif;background:var(--surface);min-height:100vh;color:var(--ink)}
.site-header{background:var(--ink);padding:16px 36px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid var(--gold)}
.brand{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#fff;letter-spacing:.08em}
.brand span{color:var(--gold)}
.badge{background:var(--gold);color:#fff;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:4px 11px;border-radius:20px}
.layout{display:grid;grid-template-columns:430px 1fr;min-height:calc(100vh - 58px)}
.form-panel{background:var(--card);border-right:1px solid var(--border);padding:24px 22px;overflow-y:auto}
.panel-title{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:.06em;margin-bottom:2px}
.panel-sub{font-size:12px;color:var(--ink-light);margin-bottom:20px;line-height:1.5}
.fsec{margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid var(--border)}
.fsec:last-of-type{border-bottom:none;margin-bottom:0}
.slabel{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:10px;display:flex;align-items:center;gap:8px}
.slabel::after{content:'';flex:1;height:1px;background:var(--gold-pale)}
.field{margin-bottom:10px}
.field:last-child{margin-bottom:0}
.field label{display:block;font-size:11px;font-weight:600;color:var(--ink-mid);margin-bottom:3px;letter-spacing:.04em;text-transform:uppercase}
.field input,.field select,.field textarea{width:100%;padding:8px 11px;border:1.5px solid var(--border);border-radius:7px;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.field input:focus,.field select:focus,.field textarea:focus{border-color:var(--gold);background:#fff}
.field textarea{resize:vertical;min-height:64px;line-height:1.5}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.sgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.scard{position:relative}
.scard input[type=radio]{position:absolute;opacity:0;width:0;height:0}
.scard label{display:flex;align-items:center;gap:12px;padding:12px 14px;border:2px solid var(--border);border-radius:10px;cursor:pointer;transition:all .2s;background:var(--surface);text-transform:none;letter-spacing:normal}
.scard label:hover{border-color:#bbb;background:#f0ece6}
.scard input:checked+label{border-color:var(--gold);background:var(--gold-pale);box-shadow:0 0 0 1px var(--gold)}
.swatch{width:36px;height:36px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px}
.sw-dark{background:linear-gradient(135deg,#0a0a0f 40%,#3D0A0A)}
.sw-rustic{background:linear-gradient(135deg,#e8dcc8,#8B4513)}
.sw-bold{background:linear-gradient(135deg,#1a1a2e 50%,#E63946 50%)}
.sw-luxury{background:linear-gradient(135deg,#1a1410,#7C1C2E)}
.sw-playful{background:linear-gradient(135deg,#FFF0F3,#06D6A0 70%)}
.sw-clean{background:#fff;border:1.5px solid #ddd}
.sinfo{display:flex;flex-direction:column;gap:2px}
.sname{font-size:12px;font-weight:700;color:var(--ink)}
.sdesc{font-size:10.5px;color:var(--ink-light);line-height:1.4}
.scard input:checked+label .sname{color:var(--ink)}
.scard input:checked+label .sdesc{color:var(--ink-mid)}
.selbadge{display:none;position:absolute;top:6px;right:6px;background:var(--gold);color:#fff;font-size:9px;font-weight:700;width:16px;height:16px;border-radius:50%;align-items:center;justify-content:center;pointer-events:none}
.scard input:checked~.selbadge{display:flex}
.crow{display:flex;gap:7px;flex-wrap:wrap;margin-top:4px}
.chip{position:relative}
.chip input[type=radio]{position:absolute;opacity:0;width:0;height:0}
.chip label{width:28px;height:28px;border-radius:50%;display:block;cursor:pointer;border:3px solid transparent;transition:transform .2s,border-color .2s;text-transform:none}
.chip input:checked+label{border-color:var(--ink);transform:scale(1.15)}
.chip label:hover{transform:scale(1.1)}
.gen-btn{width:100%;padding:13px;background:var(--ink);color:#fff;border:none;border-radius:9px;font-family:'Bebas Neue',sans-serif;font-size:19px;letter-spacing:.12em;cursor:pointer;transition:background .2s,transform .15s;margin-top:6px;display:flex;align-items:center;justify-content:center;gap:9px}
.gen-btn:hover:not(:disabled){background:var(--gold);color:#fff}
.gen-btn:active:not(:disabled){transform:scale(.98)}
.gen-btn:disabled{background:#bbb;cursor:not-allowed}
.prev-panel{background:#E8E4DE;padding:32px;display:flex;flex-direction:column;align-items:center;gap:18px;overflow-y:auto}
.prev-toolbar{width:100%;max-width:500px;display:flex;align-items:center;justify-content:space-between}
.prev-label{font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:.1em;color:var(--ink-mid)}
.tactions{display:flex;gap:7px}
.tbtn{padding:6px 13px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid var(--border);background:var(--card);color:var(--ink-mid);transition:all .2s;font-family:'DM Sans',sans-serif}
.tbtn:hover:not(:disabled){border-color:var(--gold);color:var(--gold)}
.tbtn.primary{background:var(--green);border-color:var(--green);color:#fff}
.tbtn.primary:hover:not(:disabled){background:#1d6040}
.tbtn:disabled{opacity:.4;cursor:not-allowed}
.ad-frame{width:100%;max-width:500px;min-height:400px;background:var(--card);border-radius:11px;box-shadow:0 8px 40px rgba(0,0,0,.15);overflow:hidden}
.estate{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;gap:13px;text-align:center;padding:36px}
.ei{font-size:42px;opacity:.28}
.et{font-family:'Crimson Pro',serif;font-size:19px;font-style:italic;color:var(--ink-mid);opacity:.55}
.es{font-size:12px;color:var(--ink-light);line-height:1.6}
.estate.hidden{display:none}
.lstate{display:none;flex-direction:column;align-items:center;justify-content:center;min-height:400px;gap:15px}
.lstate.active{display:flex}
.spinner{width:42px;height:42px;border:3px solid var(--border);border-top-color:var(--gold);border-radius:50%;animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.ltxt{font-family:'Crimson Pro',serif;font-size:17px;font-style:italic;color:var(--ink-mid)}
.lstep{font-size:12px;color:var(--ink-light)}
.errstate{display:none;flex-direction:column;align-items:center;justify-content:center;min-height:400px;gap:10px;padding:36px;text-align:center}
.errstate.active{display:flex}
.erri{font-size:34px}
.errm{font-size:13px;color:var(--red);line-height:1.6}
#ad-iframe{width:100%;border:none;display:none;min-height:400px}
#ad-iframe.visible{display:block}
.mstrip{width:100%;max-width:500px;background:rgba(0,0,0,.06);border-radius:7px;padding:8px 13px;display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--ink-mid)}
.mname{font-weight:600;color:var(--ink)}
.tcount{color:var(--ink-light)}
</style>
</head>
<body>

<header class="site-header">
  <div class="brand">My Town <span>Postcard</span></div>
  <div class="badge">✦ AI Ad Generator v2</div>
</header>

<div class="layout">
  <div class="form-panel">
    <div class="panel-title">Build Your Ad</div>
    <div class="panel-sub">Fill in your business details, choose a style, and let AI design a unique print-quality ad.</div>

    <div class="fsec">
      <div class="slabel">Business Info</div>
      <div class="field"><label>Business Name *</label><input type="text" id="bizName" placeholder="e.g. Mr. Biscuit's Cafe"></div>
      <div class="field"><label>Tagline / Slogan</label><input type="text" id="tagline" placeholder="e.g. From-Scratch Biscuits &amp; Boba!"></div>
      <div class="field"><label>Business Category *</label>
        <select id="category">
          <option value="">— Select category —</option>
          <option>Restaurant / Cafe</option><option>Auto Services</option><option>Real Estate</option>
          <option>Home Services / HVAC</option><option>Medical / Dental</option><option>Retail / Boutique</option>
          <option>Fitness / Wellness</option><option>Legal / Financial</option><option>Tourism / Entertainment</option>
          <option>Beauty / Salon</option><option>Pet Services</option><option>Other</option>
        </select>
      </div>
      <div class="frow">
        <div class="field"><label>Phone Number</label><input type="text" id="phone" placeholder="(706) 555-0100"></div>
        <div class="field"><label>City, State</label><input type="text" id="city" placeholder="Clarkesville, GA"></div>
      </div>
      <div class="field"><label>Address (optional)</label><input type="text" id="address" placeholder="596 W Louise St"></div>
      <div class="field"><label>Website (optional)</label><input type="text" id="website" placeholder="www.example.com"></div>
    </div>

    <div class="fsec">
      <div class="slabel">Ad Content</div>
      <div class="field"><label>Services / Menu Items</label><textarea id="services" placeholder="3–5 items with prices&#10;e.g. Plain Biscuit $2.99, Bacon Biscuit $4.99"></textarea></div>
      <div class="field"><label>Special Offer / Coupon</label><input type="text" id="offer" placeholder="e.g. $1 OFF Any Biscuit · 1 per visit"></div>
      <div class="field"><label>Key Selling Points</label><textarea id="selling" placeholder="What makes you stand out?&#10;e.g. Family owned, Free estimates, 24/7 service"></textarea></div>
    </div>

    <div class="fsec">
      <div class="slabel">Design Style</div>
      <div class="sgrid">
        <div class="scard">
          <input type="radio" name="style" id="s-dark" value="dark moody cinematic with full dark background, dramatic color gradients, bold large white typography" checked>
          <label for="s-dark"><div class="swatch sw-dark"></div><div class="sinfo"><div class="sname">Dark &amp; Cinematic</div><div class="sdesc">Bold, dramatic, high contrast</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-rustic" value="rustic vintage warm parchment background, brush stroke decorative elements, earthy brown and cream tones, hand-crafted feel">
          <label for="s-rustic"><div class="swatch sw-rustic"></div><div class="sinfo"><div class="sname">Rustic &amp; Vintage</div><div class="sdesc">Warm, earthy, handcrafted</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-bold" value="bold modern graphic design with geometric split layout, skewed shapes, bright accent colors, high contrast, powerful typography">
          <label for="s-bold"><div class="swatch sw-bold"></div><div class="sinfo"><div class="sname">Bold &amp; Modern</div><div class="sdesc">Geometric, energetic, sharp</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-luxury" value="luxury elegant premium with double CSS border frame, gold gradient accent lines, centered serif typography, refined upscale feel">
          <label for="s-luxury"><div class="swatch sw-luxury"></div><div class="sinfo"><div class="sname">Luxury &amp; Refined</div><div class="sdesc">Elegant, gold accents, upscale</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-playful" value="playful fun colorful with bright overlapping circle decorations, pill-shaped badge elements, friendly rounded typography, energetic layout">
          <label for="s-playful"><div class="swatch sw-playful"></div><div class="sinfo"><div class="sname">Playful &amp; Fun</div><div class="sdesc">Bright, friendly, colorful</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-health" value="health and wellness design, calming teal and sage green tones, clean modern medical aesthetic, trustworthy professional healthcare advertisement">
          <label for="s-health"><div class="swatch" style="background:linear-gradient(135deg,#e8f5f5,#3d8b9c)"></div><div class="sinfo"><div class="sname">Health &amp; Wellness</div><div class="sdesc">Calming, clean, medical</div></div></label>
          <div class="selbadge">✓</div>
        </div>
      </div>
    </div>

    <div class="fsec">
      <div class="slabel">Brand Color Direction</div>
      <div class="crow">
        <div class="chip"><input type="radio" name="color" id="c-red" value="deep red and dark tones" checked><label for="c-red" style="background:#8B2635" title="Deep Red"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-navy" value="navy blue and gold tones"><label for="c-navy" style="background:#1B3A6B" title="Navy Blue"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-green" value="forest green and cream tones"><label for="c-green" style="background:#1E5128" title="Forest Green"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-orange" value="warm orange and brown tones"><label for="c-orange" style="background:#C85A11" title="Warm Orange"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-purple" value="rich purple and silver tones"><label for="c-purple" style="background:#5B2D8E" title="Rich Purple"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-gold" value="gold and black tones"><label for="c-gold" style="background:#C8952A" title="Gold"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-teal" value="teal and white tones"><label for="c-teal" style="background:#0D7377" title="Teal"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-slate" value="charcoal slate and warm grey tones"><label for="c-slate" style="background:#3D4451" title="Slate"></label></div>
      </div>
    </div>

    <div class="fsec">
      <div class="slabel">Ad Size</div>
      <div class="field">
        <select id="adSize">
          <option value="extra large 4 inches wide by 5 inches tall, biggest ad on the card, bold hero layout with large text">Extra Large — $499 (4" × 5")</option>
          <option value="medium 3 inches wide by 2 inches tall, compact horizontal layout">Medium — $299 (3" × 2")</option>
          <option value="small 2 inches wide by 2 inches tall, very compact square, essentials only">Small — $199 (2" × 2")</option>
        </select>
      </div>
    </div>

    <button class="gen-btn" id="generateBtn" onclick="generateAd()">✦ Generate My Ad</button>
  </div>

  <div class="prev-panel">
    <div class="prev-toolbar">
      <div class="prev-label">Ad Preview</div>
      <div class="tactions">
        <button class="tbtn" id="regenBtn" onclick="generateAd()" disabled>↺ Regenerate</button>
        <button class="tbtn" id="copyBtn" onclick="copyHTML()" disabled>⎘ Copy HTML</button>
      </div>
    </div>
    <div class="ad-frame">
      <div class="estate" id="emptyState">
        <div class="ei">✦</div>
        <div class="et">Your ad will appear here</div>
        <div class="es">Fill in your business details on the left, choose a style, then click Generate. Every ad is uniquely designed — no two are alike.</div>
      </div>
      <div class="lstate" id="loadingState">
        <div class="spinner"></div>
        <div class="ltxt">Designing your ad...</div>
        <div class="lstep" id="loadingStep">Analyzing business details</div>
      </div>
      <div class="errstate" id="errorState">
        <div class="erri">⚠</div>
        <div class="errm" id="errorMsg">Something went wrong. Please try again.</div>
      </div>
      <iframe id="ad-iframe" scrolling="no"></iframe>
    </div>
    <div class="mstrip" id="modelStrip" style="display:none">
      <span>Generated by <span class="mname">Claude Sonnet 4</span></span>
      <span class="tcount" id="tokenInfo">—</span>
    </div>
  </div>
</div>

<script>
let lastHTML='';

function fd(){
  return{
    bizName:document.getElementById('bizName').value.trim(),
    tagline:document.getElementById('tagline').value.trim(),
    category:document.getElementById('category').value,
    phone:document.getElementById('phone').value.trim(),
    city:document.getElementById('city').value.trim(),
    address:document.getElementById('address').value.trim(),
    website:document.getElementById('website').value.trim(),
    services:document.getElementById('services').value.trim(),
    offer:document.getElementById('offer').value.trim(),
    selling:document.getElementById('selling').value.trim(),
    style:document.querySelector('input[name="style"]:checked')?.value||'',
    color:document.querySelector('input[name="color"]:checked')?.value||'deep red and dark tones',
    adSize:document.getElementById('adSize').value,
  };
}

function buildPrompt(d){
  return \`You are an expert print ad designer. Generate a COMPLETE self-contained HTML advertisement with all CSS embedded.

BUSINESS:
Name: \${d.bizName||'Sample Business'}
Category: \${d.category||'Local Business'}
Tagline: \${d.tagline||''}
Phone: \${d.phone||'(555) 000-0000'}
Location: \${d.city||'Your Town, GA'}\${d.address?' · '+d.address:''}
Website: \${d.website||''}
Services/Items: \${d.services||'Service 1 $XX, Service 2 $XX, Service 3 $XX'}
Offer/Coupon: \${d.offer||''}
Selling Points: \${d.selling||''}

STYLE: \${d.style}
COLORS: \${d.color}
SIZE: \${d.adSize}

RULES:
1. Import Google Fonts matching the style. NO Arial, Inter, Roboto.
2. body{margin:0;padding:0} — background fills 100% width and height, zero white borders.
3. No external images. Use CSS gradients, shapes, clip-path, ::before/::after only.
4. Dark/cinematic: full dark bg, dramatic radial gradient glow, bold white knockout text.
5. Rustic: repeating-linear-gradient paper texture, warm browns, decorative CSS dividers.
6. Bold/modern: geometric split layout, skewed divider via clip-path, strong contrast.
7. Luxury: dark bg, double CSS border frame (inset), gold linear-gradient horizontal rule.
8. Playful: bright bg, colorful ::before circle decorations, pill-shaped colored badges.
9. Clean/minimal: white bg, 4px black top border, generous padding, thin grey dividers.
10. Phone number: large and prominent. Coupon/offer: dashed-border box.
11. Use clip-path, skew, overlapping layers, text-shadow, box-shadow for depth and polish.
12. The design must look like a professionally printed advertisement, not a webpage.

Return ONLY raw HTML starting with <!DOCTYPE html>. No markdown, no code fences, no explanation.\`;
}

async function generateAd(){
  const d=fd();
  if(!d.bizName){alert('Please enter a business name.');return;}
  setUI('loading');
  const steps=['Analyzing business details...','Selecting fonts & colors...','Composing layout...','Adding depth & texture...','Finalizing...'];
  let si=0;
  const el=document.getElementById('loadingStep');
  const iv=setInterval(()=>{si=(si+1)%steps.length;if(el)el.textContent=steps[si];},1600);
  try{
    const res=await fetch('/api/ai/v2/generate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:4000,messages:[{role:'user',content:buildPrompt(d)}]})
    });
    clearInterval(iv);
    if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error?.message||'API error '+res.status);}
    const data=await res.json();
    let html=data.content.map(b=>b.text||'').join('');
    html=html.replace(/^\`\`\`html?\\s*/i,'').replace(/\\s*\`\`\`$/i,'').trim();
    if(!html.includes('<html')&&!html.includes('<!DOCTYPE'))throw new Error('Invalid response — please try again.');
    lastHTML=html;
    const iframe=document.getElementById('ad-iframe');
    iframe.srcdoc=html;
    iframe.onload=()=>{try{const b=iframe.contentDocument?.body;if(b)iframe.style.height=Math.max(b.scrollHeight,400)+'px';}catch(e){}};
    if(data.usage)document.getElementById('tokenInfo').textContent=\`\${(data.usage.input_tokens+data.usage.output_tokens).toLocaleString()} tokens\`;
    setUI('success');
  }catch(err){
    clearInterval(iv);
    document.getElementById('errorMsg').textContent=err.message;
    setUI('error');
  }
}

function setUI(state){
  const empty=document.getElementById('emptyState');
  const load=document.getElementById('loadingState');
  const err=document.getElementById('errorState');
  const iframe=document.getElementById('ad-iframe');
  const strip=document.getElementById('modelStrip');
  const regen=document.getElementById('regenBtn');
  const copy=document.getElementById('copyBtn');
  const gen=document.getElementById('generateBtn');
  empty.classList.remove('hidden');load.classList.remove('active');err.classList.remove('active');
  iframe.classList.remove('visible');strip.style.display='none';
  regen.disabled=copy.disabled=true;gen.disabled=false;
  if(state==='loading'){empty.classList.add('hidden');load.classList.add('active');gen.disabled=true;}
  else if(state==='success'){empty.classList.add('hidden');iframe.classList.add('visible');strip.style.display='flex';regen.disabled=copy.disabled=false;}
  else if(state==='error'){empty.classList.add('hidden');err.classList.add('active');}
}

function copyHTML(){
  if(!lastHTML)return;
  navigator.clipboard.writeText(lastHTML).then(()=>{
    const b=document.getElementById('copyBtn');const o=b.textContent;
    b.textContent='✓ Copied!';setTimeout(()=>b.textContent=o,2000);
  });
}
</script>

</body>
</html>`;
