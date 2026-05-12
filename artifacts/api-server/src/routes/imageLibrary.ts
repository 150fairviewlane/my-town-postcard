import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, imageLibraryTable } from "@workspace/db";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "localspot-admin-2025";
const JWT_SECRET = process.env.SESSION_SECRET || "localspot-secret";
const TIMEOUT_MS = 15_000;

function requireAdmin(req: any, res: any, next: any): void {
  const auth = req.headers.authorization as string | undefined;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────
router.post("/admin/image-library/login", (req, res) => {
  const { password } = req.body ?? {};
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  const token = jwt.sign({ admin: true, tool: "image-library" }, JWT_SECRET, { expiresIn: "24h" });
  res.json({ token });
});

// ── Search ────────────────────────────────────────────────────────────────────
router.post("/admin/image-library/search", requireAdmin, async (req, res) => {
  const { query, source } = req.body ?? {};
  if (!query || typeof query !== "string" || !query.trim()) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  const pexelsKey = process.env.PEXELS_API_KEY;

  const doUnsplash = (source === "unsplash" || source === "both") && !!unsplashKey;
  const doPexels = (source === "pexels" || source === "both") && !!pexelsKey;

  if (!doUnsplash && !doPexels) {
    const missing = source === "both" ? "UNSPLASH_ACCESS_KEY and PEXELS_API_KEY are" : `${source === "unsplash" ? "UNSPLASH_ACCESS_KEY" : "PEXELS_API_KEY"} is`;
    res.status(400).json({ error: `${missing} not configured` });
    return;
  }

  type ResultItem = { id: string; thumbUrl: string; imageUrl: string; photographerCredit: string; source: string; pageUrl: string };
  const results: ResultItem[] = [];
  const perPage = source === "both" ? 12 : 24;

  try {
    const fetches: Promise<void>[] = [];

    if (doUnsplash) {
      fetches.push((async () => {
        const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query.trim())}&per_page=${perPage}&client_id=${unsplashKey}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!r.ok) throw new Error(`Unsplash error ${r.status}`);
        const data = await r.json() as { results: { id: string; urls: { small: string; full: string }; user: { name: string }; links: { html: string } }[] };
        for (const p of data.results ?? []) {
          results.push({ id: `u-${p.id}`, thumbUrl: p.urls.small, imageUrl: p.urls.full, photographerCredit: p.user.name, source: "unsplash", pageUrl: p.links.html });
        }
      })());
    }

    if (doPexels) {
      fetches.push((async () => {
        const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query.trim())}&per_page=${perPage}`;
        const r = await fetch(url, { headers: { Authorization: pexelsKey! }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!r.ok) throw new Error(`Pexels error ${r.status}`);
        const data = await r.json() as { photos: { id: number; src: { medium: string; original: string }; photographer: string; url: string }[] };
        for (const p of data.photos ?? []) {
          results.push({ id: `p-${p.id}`, thumbUrl: p.src.medium, imageUrl: p.src.original, photographerCredit: p.photographer, source: "pexels", pageUrl: p.url });
        }
      })());
    }

    await Promise.all(fetches);

    // Shuffle when combining both sources
    if (source === "both") {
      for (let i = results.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [results[i], results[j]] = [results[j], results[i]];
      }
    }

    res.json({ results });
  } catch (err) {
    const e = err as { message?: string };
    req.log.warn({ msg: e.message }, "image-library search error");
    res.status(502).json({ error: e.message ?? "Search failed" });
  }
});

// ── Approve image ─────────────────────────────────────────────────────────────
router.post("/admin/image-library/images", requireAdmin, async (req, res) => {
  const { imageUrl, thumbUrl, industry, mood, textSafeRegion, photographerCredit, source } = req.body ?? {};
  if (!imageUrl || !thumbUrl || !industry || !photographerCredit || !source) {
    res.status(400).json({ error: "imageUrl, thumbUrl, industry, photographerCredit, source are required" });
    return;
  }
  const [row] = await db.insert(imageLibraryTable).values({
    imageUrl, thumbUrl, industry,
    mood: mood || null,
    textSafeRegion: textSafeRegion || "Bottom",
    photographerCredit, source, approved: true,
  }).returning();
  res.json({ image: row });
});

// ── List images ───────────────────────────────────────────────────────────────
router.get("/admin/image-library/images", requireAdmin, async (_req, res) => {
  const rows = await db.select().from(imageLibraryTable).orderBy(imageLibraryTable.createdAt);
  res.json({ images: rows });
});

// ── Update image ──────────────────────────────────────────────────────────────
router.patch("/admin/image-library/images/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { industry, mood, textSafeRegion } = req.body ?? {};
  const update: Record<string, unknown> = {};
  if (industry !== undefined) update.industry = industry;
  if (mood !== undefined) update.mood = mood || null;
  if (textSafeRegion !== undefined) update.textSafeRegion = textSafeRegion;
  const [row] = await db.update(imageLibraryTable).set(update).where(eq(imageLibraryTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ image: row });
});

// ── Remove image ──────────────────────────────────────────────────────────────
router.delete("/admin/image-library/images/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(imageLibraryTable).where(eq(imageLibraryTable.id, id));
  res.json({ ok: true });
});

// ── HTML page: GET /admin/image-library ───────────────────────────────────────
router.get("/admin/image-library", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(IMAGE_LIBRARY_HTML);
});

export default router;

// ── Inline HTML ───────────────────────────────────────────────────────────────
const IMAGE_LIBRARY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Image Library — Admin</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0f172a;--surface:#1e293b;--card:#fff;--border:#334155;--ink:#f1f5f9;--ink-mid:#94a3b8;--red:#ef4444;--yellow:#f59e0b;--green:#22c55e;--accent:#3b82f6}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;font-size:14px}

/* ── LOGIN ── */
.lscreen{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center}
.login-box{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:40px;width:340px;text-align:center}
.lbrand{font-size:22px;font-weight:800;margin-bottom:4px}
.lsub{font-size:12px;color:var(--ink-mid);margin-bottom:24px}
.err{color:var(--red);font-size:12px;margin-top:10px;min-height:18px}

/* ── HEADER ── */
.hdr{background:var(--surface);border-bottom:1px solid var(--border);padding:12px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
.hbrand{font-weight:800;font-size:16px}
.hstats{font-size:12px;color:var(--ink-mid)}

/* ── MAIN ── */
.main{max-width:1400px;margin:0 auto;padding:24px;display:flex;flex-direction:column;gap:24px}
.section{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px}
.section-title{font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-mid);margin-bottom:14px}

/* ── FORM ── */
.search-form{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.sinput{padding:8px 12px;background:#0f172a;border:1px solid var(--border);border-radius:7px;color:var(--ink);font-size:13px;outline:none;min-width:220px}
.sinput:focus{border-color:var(--accent)}
.sinput.full{width:100%;min-width:0}
.sselect{padding:8px 10px;background:#0f172a;border:1px solid var(--border);border-radius:7px;color:var(--ink);font-size:13px;outline:none;cursor:pointer}
.sselect.full{width:100%}
.field{margin-bottom:10px}
.field label{display:block;font-size:11px;font-weight:600;color:var(--ink-mid);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}

/* ── BUTTONS ── */
.btn-primary{padding:8px 18px;background:var(--accent);color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer}
.btn-primary:hover{background:#2563eb}
.btn-primary:disabled{background:#334155;cursor:not-allowed}
.btn-ghost{padding:8px 18px;background:transparent;color:var(--ink-mid);border:1px solid var(--border);border-radius:7px;font-size:13px;cursor:pointer}
.btn-ghost:hover{border-color:var(--ink-mid);color:var(--ink)}
.btn-sm{padding:4px 10px;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;background:transparent;border:1px solid var(--border);color:var(--ink-mid)}
.btn-sm:hover{border-color:var(--ink-mid);color:var(--ink)}
.btn-sm.btn-primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn-sm.btn-danger{border-color:var(--red);color:var(--red)}
.btn-sm.btn-danger:hover{background:var(--red);color:#fff}
.btn-approve{width:100%;padding:6px;background:var(--accent);color:#fff;border:none;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;margin-top:6px}
.btn-approve:hover{background:#2563eb}

/* ── RESULTS GRID ── */
.imgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-top:10px}
.rcard{background:#0f172a;border:1px solid var(--border);border-radius:8px;overflow:hidden}
.rthumb{width:100%;height:120px;object-fit:cover;cursor:pointer;display:block}
.rthumb:hover{opacity:.85}
.rcredit{padding:5px 7px 0;font-size:10px;color:var(--ink-mid);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.loading,.empty,.status{color:var(--ink-mid);font-size:13px;padding:16px 0}

/* ── STATS BAR ── */
.stats-bar{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.pill{padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;cursor:pointer;transition:opacity .15s}
.pill:hover{opacity:.8}
.pill-green{background:rgba(34,197,94,.15);color:#86efac;border:1px solid rgba(34,197,94,.3)}
.pill-yellow{background:rgba(245,158,11,.15);color:#fcd34d;border:1px solid rgba(245,158,11,.3)}
.pill-red{background:rgba(239,68,68,.15);color:#fca5a5;border:1px solid rgba(239,68,68,.3)}

/* ── LIBRARY ── */
.ind-section{margin-bottom:24px}
.ind-hdr{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:7px;margin-bottom:10px;font-weight:700;font-size:13px}
.ind-green{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.2);color:#86efac}
.ind-yellow{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.2);color:#fcd34d}
.ind-red{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#fca5a5}
.ind-cnt{font-size:12px;opacity:.8}
.lgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
.libcard{background:#0f172a;border:1px solid var(--border);border-radius:8px;overflow:hidden}
.lthumb{width:100%;height:130px;object-fit:cover;cursor:pointer;display:block}
.lthumb:hover{opacity:.85}
.lmeta{padding:7px 8px 4px}
.lsource{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mid)}
.lcredit{font-size:11px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ltags{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}
.tag{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-size:10px;color:var(--ink-mid)}
.ledit{padding:8px;border-top:1px solid var(--border);background:#0a1120}
.lactions{display:flex;gap:6px;padding:6px 8px;border-top:1px solid var(--border)}

/* ── MODAL ── */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;width:100%;max-width:400px}
.modal-title{font-size:16px;font-weight:800;margin-bottom:14px}
.approve-thumb{width:100%;height:180px;object-fit:cover;border-radius:8px;margin-bottom:8px}
.modal-credit{font-size:11px;color:var(--ink-mid);margin-bottom:14px}
.modal-actions{display:flex;gap:8px;margin-top:16px}

@media(max-width:600px){.search-form{flex-direction:column}.sinput{min-width:0;width:100%}}
</style>
</head>
<body>

<!-- ── LOGIN SCREEN ── -->
<div class="lscreen" id="lscreen">
  <div class="login-box">
    <div class="lbrand">📷 Image Library</div>
    <div class="lsub">My Town Postcard · Admin Tool</div>
    <input id="pw" type="password" class="sinput full" placeholder="Admin password" onkeydown="if(event.key==='Enter')doLogin()" style="margin-bottom:10px">
    <button onclick="doLogin()" class="btn-primary" style="width:100%">Sign In</button>
    <div id="lerr" class="err"></div>
  </div>
</div>

<!-- ── MAIN APP ── -->
<div id="app" style="display:none">
  <header class="hdr">
    <div class="hbrand">📷 Image Library Admin</div>
    <div style="display:flex;align-items:center;gap:16px">
      <span id="hstats" class="hstats"></span>
      <button onclick="doLogout()" class="btn-ghost" style="padding:6px 14px;font-size:12px">Sign Out</button>
    </div>
  </header>

  <div class="main">

    <!-- Search section -->
    <section class="section">
      <div class="section-title">Search Images</div>
      <div class="search-form">
        <input id="queryInput" class="sinput" placeholder="Keywords — e.g. pizza restaurant kitchen" style="flex:1;min-width:200px">
        <select id="sourceSelect" class="sselect">
          <option value="both">Unsplash + Pexels</option>
          <option value="unsplash">Unsplash only</option>
          <option value="pexels">Pexels only</option>
        </select>
        <select id="sindustry" class="sselect">
          <option value="">No industry pre-fill</option>
        </select>
        <button onclick="doSearch()" class="btn-primary" id="searchBtn">Search</button>
      </div>
      <div id="searchStatus" class="status"></div>
      <div id="resultsGrid" class="imgrid"></div>
    </section>

    <!-- Library section -->
    <section class="section">
      <div class="section-title">Approved Library</div>
      <div id="statsBar" class="stats-bar"></div>
      <div id="libraryContent"></div>
    </section>

  </div>
</div>

<!-- ── APPROVE MODAL ── -->
<div id="approveModal" class="modal-overlay" style="display:none" onclick="if(event.target===this)closeApprove()">
  <div class="modal">
    <div class="modal-title">Approve Image</div>
    <img id="approveThumb" class="approve-thumb">
    <div class="modal-credit" id="approveCredit"></div>
    <div class="field">
      <label>Industry Tag</label>
      <select id="appIndustry" class="sselect full"></select>
    </div>
    <div class="field">
      <label>Mood / Vibe</label>
      <input id="appMood" class="sinput full" placeholder="e.g. warm, rustic, cinematic">
    </div>
    <div class="field">
      <label>Text Safe Region</label>
      <select id="appRegion" class="sselect full">
        <option value="Bottom">Bottom</option>
        <option value="Left">Left</option>
        <option value="Right">Right</option>
        <option value="Center">Center</option>
      </select>
    </div>
    <div class="modal-actions">
      <button onclick="confirmApprove()" class="btn-primary">✓ Approve</button>
      <button onclick="closeApprove()" class="btn-ghost">Cancel</button>
    </div>
  </div>
</div>

<script>
const INDUSTRIES = ["Pizza Restaurant","Mexican Restaurant","Chinese Restaurant","Breakfast & Cafe","Bar & Grill","Italian Restaurant","Bakery","Coffee Shop","Dentist","Medical & Healthcare","Chiropractor","Veterinarian","HVAC","Plumber","Electrician","Lawn & Landscaping","Roofing","Painting","Cleaning Service","Pest Control","Real Estate","Insurance","Auto Repair","Salon & Beauty","Barbershop","Gym & Fitness","Pet Services","Financial Services","Daycare","Photography","Retail Shop","Other Service","Multiple (cross-industry)"];
const GOAL = 8;

let TOKEN = localStorage.getItem('ilToken') || '';
let RESULTS = [];
let PENDING = null;
let IMAGES = [];

// ── Init ──────────────────────────────────────────────────────
function init(){
  const indOpts = INDUSTRIES.map(i => \`<option value="\${i}">\${i}</option>\`).join('');
  document.getElementById('sindustry').innerHTML += indOpts;
  document.getElementById('appIndustry').innerHTML = indOpts;
  if(TOKEN) showApp(); else showLogin();
}

function showLogin(){
  document.getElementById('lscreen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function showApp(){
  document.getElementById('lscreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  loadLibrary();
}

async function doLogin(){
  const pw = document.getElementById('pw').value;
  const r = await fetch('/api/admin/image-library/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})});
  const d = await r.json();
  if(!r.ok){document.getElementById('lerr').textContent = d.error||'Invalid password';return;}
  TOKEN = d.token;
  localStorage.setItem('ilToken',TOKEN);
  document.getElementById('lerr').textContent='';
  showApp();
}

function doLogout(){
  TOKEN='';
  localStorage.removeItem('ilToken');
  showLogin();
}

// ── API helper ────────────────────────────────────────────────
async function api(method,path,body){
  const opts={method,headers:{'Content-Type':'application/json','Authorization':\`Bearer \${TOKEN}\`}};
  if(body) opts.body=JSON.stringify(body);
  const r = await fetch(path,opts);
  if(r.status===401){doLogout();return null;}
  return r.json();
}

// ── Search ────────────────────────────────────────────────────
async function doSearch(){
  const query = document.getElementById('queryInput').value.trim();
  if(!query){alert('Please enter search keywords');return;}
  const source = document.getElementById('sourceSelect').value;
  const btn = document.getElementById('searchBtn');
  btn.disabled=true; btn.textContent='Searching...';
  document.getElementById('searchStatus').textContent='';
  document.getElementById('resultsGrid').innerHTML='<div class="loading">Searching...</div>';
  const data = await api('POST','/api/admin/image-library/search',{query,source});
  btn.disabled=false; btn.textContent='Search';
  if(!data) return;
  if(data.error){
    document.getElementById('searchStatus').textContent=\`Error: \${data.error}\`;
    document.getElementById('resultsGrid').innerHTML='';
    return;
  }
  RESULTS = data.results||[];
  document.getElementById('searchStatus').textContent=\`\${RESULTS.length} result\${RESULTS.length!==1?'s':''}\`;
  renderResults();
}

function renderResults(){
  const grid = document.getElementById('resultsGrid');
  if(!RESULTS.length){grid.innerHTML='<div class="empty">No results found.</div>';return;}
  grid.innerHTML = RESULTS.map((r,i) => \`
    <div class="rcard">
      <img src="\${r.thumbUrl}" class="rthumb" onclick="window.open('\${r.imageUrl}','_blank')" title="Click to open full size">
      <div class="rcredit">\${r.photographerCredit} · \${r.source}</div>
      <button class="btn-approve" onclick="openApprove(\${i})">+ Approve</button>
    </div>
  \`).join('');
}

// ── Approve ───────────────────────────────────────────────────
function openApprove(i){
  PENDING = RESULTS[i];
  document.getElementById('approveThumb').src = PENDING.thumbUrl;
  document.getElementById('approveCredit').textContent = \`\${PENDING.photographerCredit} · \${PENDING.source}\`;
  const preInd = document.getElementById('sindustry').value;
  if(preInd) document.getElementById('appIndustry').value=preInd;
  document.getElementById('appMood').value='';
  document.getElementById('approveModal').style.display='flex';
}

function closeApprove(){
  document.getElementById('approveModal').style.display='none';
  PENDING=null;
}

async function confirmApprove(){
  if(!PENDING) return;
  const industry = document.getElementById('appIndustry').value;
  if(!industry){alert('Please select an industry');return;}
  const mood = document.getElementById('appMood').value.trim();
  const textSafeRegion = document.getElementById('appRegion').value;
  const data = await api('POST','/api/admin/image-library/images',{
    imageUrl:PENDING.imageUrl, thumbUrl:PENDING.thumbUrl,
    industry, mood, textSafeRegion,
    photographerCredit:PENDING.photographerCredit, source:PENDING.source,
  });
  if(!data||data.error){alert(data?.error||'Error approving');return;}
  closeApprove();
  loadLibrary();
}

// ── Library ───────────────────────────────────────────────────
async function loadLibrary(){
  const data = await api('GET','/api/admin/image-library/images');
  if(!data) return;
  IMAGES = data.images||[];
  renderLibrary();
}

function renderLibrary(){
  const byInd={};
  for(const img of IMAGES){
    if(!byInd[img.industry]) byInd[img.industry]=[];
    byInd[img.industry].push(img);
  }

  // Stats pills
  document.getElementById('statsBar').innerHTML = INDUSTRIES.map(ind => {
    const cnt=(byInd[ind]||[]).length;
    const cls=cnt===0?'pill-red':cnt<GOAL?'pill-yellow':'pill-green';
    const slug=ind.replace(/[^a-z0-9]/gi,'-');
    const label=ind.length>18?ind.substring(0,16)+'…':ind;
    return \`<span class="pill \${cls}" title="\${ind}" onclick="scrollToInd('\${slug}')">\${label} (\${cnt})</span>\`;
  }).join('');

  // Header stats
  const total = IMAGES.length;
  const inds = Object.keys(byInd).length;
  const atGoal = INDUSTRIES.filter(i=>(byInd[i]||[]).length>=GOAL).length;
  document.getElementById('hstats').textContent=\`\${total} images · \${inds} industries · \${atGoal}/\${INDUSTRIES.length} at goal\`;

  const content = document.getElementById('libraryContent');
  const populated = INDUSTRIES.filter(ind=>byInd[ind]?.length>0);
  if(!populated.length){content.innerHTML='<div class="empty">No approved images yet. Search and approve some above.</div>';return;}

  content.innerHTML = populated.map(ind => {
    const imgs=byInd[ind];
    const cnt=imgs.length;
    const hcls=cnt>=GOAL?'ind-green':cnt>0?'ind-yellow':'ind-red';
    const slug=ind.replace(/[^a-z0-9]/gi,'-');
    const cards=imgs.map(img => \`
      <div class="libcard" id="img-\${img.id}">
        <img src="\${img.thumbUrl}" class="lthumb" onclick="window.open('\${img.imageUrl}','_blank')" title="Open full size">
        <div class="lmeta">
          <div class="lsource">\${img.source}</div>
          <div class="lcredit" title="\${img.photographerCredit}">\${img.photographerCredit}</div>
          <div class="ltags">
            \${img.mood?'<span class="tag">'+img.mood+'</span>':''}
            \${img.textSafeRegion?'<span class="tag">'+img.textSafeRegion+'</span>':''}
          </div>
        </div>
        <div class="ledit" id="edit-\${img.id}" style="display:none">
          <div class="field" style="margin-bottom:6px"><label>Industry</label>
            <select class="sselect full" id="ei-ind-\${img.id}">\${INDUSTRIES.map(i=>'<option value="'+i+'"'+(i===img.industry?' selected':'')+'>'+i+'</option>').join('')}</select>
          </div>
          <div class="field" style="margin-bottom:6px"><label>Mood</label>
            <input class="sinput full" id="ei-mood-\${img.id}" value="\${img.mood||''}" placeholder="e.g. warm, cinematic">
          </div>
          <div class="field" style="margin-bottom:6px"><label>Text Safe Region</label>
            <select class="sselect full" id="ei-rgn-\${img.id}">\${['Bottom','Left','Right','Center'].map(rv=>'<option'+(rv===img.textSafeRegion?' selected':'')+'>'+rv+'</option>').join('')}</select>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn-sm btn-primary" onclick="saveEdit(\${img.id})">Save</button>
            <button class="btn-sm btn-ghost" onclick="cancelEdit(\${img.id})">Cancel</button>
          </div>
        </div>
        <div class="lactions">
          <button class="btn-sm" onclick="toggleEdit(\${img.id})">Edit</button>
          <button class="btn-sm btn-danger" onclick="removeImage(\${img.id})">Remove</button>
        </div>
      </div>
    \`).join('');
    return \`
      <div class="ind-section" id="ind-\${slug}">
        <div class="ind-hdr \${hcls}"><span>\${ind}</span><span class="ind-cnt">\${cnt} / \${GOAL}</span></div>
        <div class="lgrid">\${cards}</div>
      </div>
    \`;
  }).join('');
}

function scrollToInd(slug){
  document.getElementById('ind-'+slug)?.scrollIntoView({behavior:'smooth',block:'start'});
}

function toggleEdit(id){
  const el=document.getElementById('edit-'+id);
  el.style.display=el.style.display==='none'?'block':'none';
}

function cancelEdit(id){
  document.getElementById('edit-'+id).style.display='none';
}

async function saveEdit(id){
  const industry=document.getElementById('ei-ind-'+id).value;
  const mood=document.getElementById('ei-mood-'+id).value.trim();
  const textSafeRegion=document.getElementById('ei-rgn-'+id).value;
  const data=await api('PATCH','/api/admin/image-library/images/'+id,{industry,mood,textSafeRegion});
  if(!data||data.error){alert(data?.error||'Error saving');return;}
  loadLibrary();
}

async function removeImage(id){
  if(!confirm('Remove this image from the library?')) return;
  const data=await api('DELETE','/api/admin/image-library/images/'+id);
  if(!data||data.error){alert(data?.error||'Error removing');return;}
  loadLibrary();
}

init();
</script>

</body>
</html>`;
