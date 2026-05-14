import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, outreachLeadsTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/ad-studio/save", async (req, res): Promise<void> => {
  const { leadId, adVersion, template, industry, bizLine1, bizLine2, tagline, phone, address, city, qrUrl, menu, offerAmount, offerItem, offerFine, accentColor, photoUrl } = req.body ?? {};
  if (leadId) {
    const id = Number(leadId);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid leadId" }); return; }
    const [row] = await db.select().from(outreachLeadsTable).where(eq(outreachLeadsTable.id, id));
    if (!row) { res.status(404).json({ error: "Lead not found" }); return; }
    await db.update(outreachLeadsTable)
      .set({ notes: `[Ad Studio · ${template ?? "rustic"} · ${new Date().toLocaleDateString()}] biz: ${bizLine1 ?? ""} photo: ${photoUrl ?? ""}` })
      .where(eq(outreachLeadsTable.id, id));
  }
  res.json({ ok: true, adVersion, template, industry, bizLine1, bizLine2, tagline, phone, address, city, qrUrl, menu, offerAmount, offerItem, offerFine, accentColor, photoUrl });
});

router.get("/ad-studio", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(AD_STUDIO_HTML);
});

const AD_STUDIO_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Town Postcard &mdash; Ad Studio</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Pacifico&family=Dancing+Script:wght@600;700&family=Montserrat:wght@400;500;600;700;800;900&family=Oswald:wght@500;600;700&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --burg:#7C1C2E;--burg-dark:#5a1220;--burg-pale:#f9eaed;
  --ink:#111827;--ink-mid:#374151;--ink-light:#6B7280;
  --surface:#F7F5F2;--card:#fff;--border:#E5E0D8;--green:#1a5c3a;
  --gold:#D39A42;--orange:#C8541A;
}
body{font-family:'DM Sans',sans-serif;background:var(--surface);min-height:100vh;color:var(--ink)}

.hdr{background:#111827;padding:14px 32px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid var(--burg)}
.brand{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#fff;letter-spacing:.08em}
.brand span{color:#C8A882}
.hdr-badge{background:var(--burg);color:#fff;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:4px 12px;border-radius:20px}

.layout{display:grid;grid-template-columns:430px 1fr;min-height:calc(100vh - 55px)}

.fpanel{background:#fff;border-right:1px solid var(--border);padding:22px 20px;overflow-y:auto}
.ptitle{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:.06em;margin-bottom:2px}
.psub{font-size:11.5px;color:var(--ink-light);margin-bottom:18px;line-height:1.5}
.fsec{margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid var(--border)}
.fsec:last-of-type{border-bottom:none;margin-bottom:0}
.slbl{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--burg);margin-bottom:10px;display:flex;align-items:center;gap:8px}
.slbl::after{content:'';flex:1;height:1px;background:var(--burg-pale)}
.field{margin-bottom:9px}
.field:last-child{margin-bottom:0}
.field>label{display:block;font-size:11px;font-weight:600;color:var(--ink-mid);margin-bottom:3px;letter-spacing:.04em;text-transform:uppercase}
.field input,.field select,.field textarea{width:100%;padding:8px 11px;border:1.5px solid var(--border);border-radius:7px;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.field input:focus,.field select:focus{border-color:var(--burg);background:#fff}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.field-note{font-size:10px;color:var(--ink-light);margin-top:3px;line-height:1.4}

.img-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px}
.img-thumb{position:relative;aspect-ratio:4/3;border-radius:6px;overflow:hidden;cursor:pointer;border:2.5px solid transparent;transition:all .2s}
.img-thumb:hover{transform:scale(1.04)}
.img-thumb.selected{border-color:var(--burg);box-shadow:0 0 0 2px var(--burg)}
.img-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.img-thumb .sel-check{display:none;position:absolute;top:4px;right:4px;background:var(--burg);color:#fff;border-radius:50%;width:18px;height:18px;font-size:10px;font-weight:700;align-items:center;justify-content:center}
.img-thumb.selected .sel-check{display:flex}
.img-msg{grid-column:1/-1;text-align:center;padding:16px;font-size:12px;color:var(--ink-light);font-style:italic}

.upload-zone{border:2px dashed var(--border);border-radius:9px;padding:10px;text-align:center;cursor:pointer;transition:all .2s;background:var(--surface);position:relative;overflow:hidden;margin-top:8px}
.upload-zone:hover{border-color:var(--burg);background:var(--burg-pale)}
.upload-zone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.upload-preview{width:100%;height:55px;object-fit:cover;border-radius:5px;margin-top:6px;display:none}

.tpl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.tcard{position:relative}
.tcard input[type=radio]{position:absolute;opacity:0;width:0;height:0}
.tcard label{display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 6px;border:2px solid var(--border);border-radius:8px;cursor:pointer;background:var(--surface);transition:all .2s;text-align:center}
.tcard label:hover{border-color:#bbb;background:#f0ece6}
.tcard input:checked+label{border-color:var(--burg);background:var(--burg-pale);box-shadow:0 0 0 1px var(--burg)}
.tcard-thumb{width:100%;aspect-ratio:4/5;border-radius:5px;background:#ddd;overflow:hidden;position:relative}
.tcard-thumb img{width:100%;height:100%;object-fit:cover}
.tcard-thumb .tcard-soon{position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.7)}
.tcard-name{font-size:10px;font-weight:700;color:var(--ink);line-height:1.2}
.tcard-desc{font-size:9px;color:var(--ink-light);line-height:1.2}
.selbadge{display:none;position:absolute;top:4px;right:4px;background:var(--burg);color:#fff;font-size:9px;font-weight:700;width:14px;height:14px;border-radius:50%;align-items:center;justify-content:center;pointer-events:none}
.tcard input:checked~.selbadge{display:flex}

.menu-list{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}
.mrow{display:flex;gap:6px;align-items:center}
.mrow input{flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:'DM Sans',sans-serif;font-size:12px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.mrow input:focus{border-color:var(--burg);background:#fff}
.rm-btn{width:26px;height:26px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-light);cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;line-height:1}
.rm-btn:hover{border-color:#c0392b;color:#c0392b;background:#fef2f2}
.add-btn{font-size:11px;font-weight:600;color:var(--burg);background:none;border:1.5px dashed var(--burg);border-radius:6px;padding:6px 12px;cursor:pointer;width:100%;transition:all .2s;font-family:'DM Sans',sans-serif}
.add-btn:hover{background:var(--burg-pale)}

.crow{display:flex;gap:7px;flex-wrap:wrap;margin-top:2px}
.chip{position:relative}
.chip input[type=radio]{position:absolute;opacity:0;width:0;height:0}
.chip label{width:28px;height:28px;border-radius:50%;display:block;cursor:pointer;border:3px solid transparent;transition:transform .2s,border-color .2s}
.chip input:checked+label{border-color:var(--ink);transform:scale(1.15)}
.chip label:hover{transform:scale(1.1)}

.gen-btn{width:100%;padding:13px;background:var(--burg);color:#fff;border:none;border-radius:9px;font-family:'Bebas Neue',sans-serif;font-size:19px;letter-spacing:.12em;cursor:pointer;transition:all .2s;margin-top:6px;display:flex;align-items:center;justify-content:center;gap:9px}
.gen-btn:hover{background:var(--burg-dark)}

.ppanel{background:#E8E4DE;padding:28px 32px;display:flex;flex-direction:column;align-items:center;gap:16px;overflow-y:auto}
.ptoolbar{width:100%;max-width:520px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.plabel{font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:.1em;color:var(--ink-mid)}
.tactions{display:flex;gap:7px}
.tbtn{padding:6px 13px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid var(--border);background:#fff;color:var(--ink-mid);transition:all .2s;font-family:'DM Sans',sans-serif}
.tbtn:hover:not(:disabled){border-color:var(--burg);color:var(--burg)}
.tbtn.primary{background:var(--green);border-color:var(--green);color:#fff}
.tbtn.primary:hover{background:#144d30}
.tbtn:disabled{opacity:.4;cursor:not-allowed}

/* AD CANVAS */
.ad-outer{width:100%;max-width:520px}
.ad-wrap{width:100%;position:relative;border-radius:12px;overflow:hidden;box-shadow:0 16px 60px rgba(0,0,0,.28);display:none}
.ad-wrap.visible{display:block}
.ad-template-img{width:100%;display:block}

/* FOOD PHOTO — prominent foreground, right side, z-index 2 */
.ad-photo-wrap{
  position:absolute;
  top:0;left:27%;right:0;bottom:20%;
  overflow:hidden;z-index:2;
}
.ad-photo-wrap img{
  width:100%;height:100%;
  object-fit:cover;object-position:center top;display:block;
}
.ad-photo-wrap::after{
  content:'';position:absolute;inset:0;
  background:
    linear-gradient(to right,rgba(236,220,188,.55) 0%,transparent 22%),
    linear-gradient(to bottom,transparent 52%,rgba(0,0,0,.78) 100%),
    linear-gradient(to top,transparent 85%,rgba(236,220,188,.25) 100%);
}

/* BUSINESS NAME */
.ov-bizname{
  position:absolute;
  top:1%;left:25%;right:1%;
  z-index:10;line-height:.85;
}
.biz-l1{
  font-family:'Bebas Neue',sans-serif;
  font-size:clamp(20px,7.8vw,76px);
  color:#1C1B1A;letter-spacing:.015em;display:block;
  transform:rotate(-1.5deg);transform-origin:left top;
  text-shadow:2px 2px 0 rgba(255,255,255,.4);
  position:relative;z-index:2;
}
.biz-l2{
  font-family:'Pacifico',cursive;
  font-size:clamp(24px,9.5vw,92px);
  color:var(--ac,#C8541A);display:block;
  line-height:.82;margin-top:-6%;
  transform:rotate(-3deg);transform-origin:left center;
  text-shadow:2px 3px 10px rgba(0,0,0,.22);
  position:relative;z-index:3;
}
.biz-ticks{position:absolute;top:10%;right:2%;z-index:4}
.tick{display:block;background:#1C1B1A;height:2px;opacity:.5;border-radius:1px;margin-bottom:4px}

/* TAGLINE */
.ov-tagline{
  position:absolute;
  top:21%;left:1.5%;width:26%;z-index:10;
}
.tagline-txt{
  font-family:'Dancing Script',cursive;
  font-size:clamp(10px,3.9vw,38px);
  font-weight:700;color:#1C1B1A;
  line-height:1.15;display:block;transform:rotate(-1deg);
}
.tagline-rule{
  display:block;width:60%;height:2.5px;
  background:linear-gradient(90deg,var(--ac,#C8541A),transparent);
  margin-top:4%;border-radius:1px;
}

/* MENU ROWS — circles pixel-scanned at y=727,832,932,1037px */
.ov-menu{
  position:absolute;
  top:50%;left:10.5%;right:43%;z-index:10;
}
.menu-row{height:7.7%;display:flex;align-items:center;gap:3%}
.mi-name{
  font-family:'Montserrat',sans-serif;
  font-size:clamp(7px,2.1vw,20px);
  font-weight:800;color:#1C1B1A;
  text-transform:uppercase;letter-spacing:.05em;
  white-space:nowrap;flex-shrink:0;line-height:1;
}
.mi-dots{flex:1;border-bottom:2px dotted rgba(28,27,26,.28);margin-bottom:1px;min-width:4px}
.mi-price{
  font-family:'Montserrat',sans-serif;
  font-size:clamp(7px,2.1vw,20px);
  font-weight:800;color:var(--ac,#C8541A);
  white-space:nowrap;flex-shrink:0;line-height:1;
}

/* COUPON BOX — pixel-scanned boundaries */
.ov-coupon{
  position:absolute;
  top:55.5%;left:40.5%;right:2.5%;bottom:21%;
  z-index:10;
  display:flex;flex-direction:column;align-items:center;
  justify-content:center;text-align:center;padding:1% 3%;
}
.coupon-amount{
  font-family:'Bebas Neue',sans-serif;
  font-size:clamp(14px,5.8vw,56px);
  color:#fff;line-height:.88;letter-spacing:.02em;display:block;
}
.coupon-item{
  font-family:'Pacifico',cursive;
  font-size:clamp(11px,4vw,38px);
  color:var(--ac,#C8541A);display:block;
  line-height:1;margin-top:1.5%;transform:rotate(-1.5deg);
}
.coupon-fine{
  font-family:'DM Sans',sans-serif;
  font-size:clamp(5px,1.2vw,12px);
  color:rgba(255,255,255,.55);
  display:block;margin-top:3%;letter-spacing:.04em;
}

/* FOOTER — dark bar starts at y=1132 (82.57%) */
.ov-phone{
  position:absolute;
  top:83%;left:12%;right:20%;z-index:10;
}
.phone-num{
  font-family:'Bebas Neue',sans-serif;
  font-size:clamp(13px,5vw,48px);
  color:#fff;letter-spacing:.04em;line-height:1;display:block;
}
.phone-addr{
  font-family:'DM Sans',sans-serif;
  font-size:clamp(5px,1.3vw,13px);
  color:rgba(255,255,255,.62);
  display:block;margin-top:1%;font-weight:500;letter-spacing:.03em;
}

.ov-qr-label{
  position:absolute;bottom:2%;right:1.5%;
  text-align:center;width:11%;z-index:10;
}
.qr-url-txt{
  font-family:'DM Sans',sans-serif;
  font-size:clamp(4px,1vw,9px);
  color:rgba(255,255,255,.45);
  display:block;word-break:break-all;line-height:1.2;
}

.ad-empty{
  width:100%;max-width:520px;aspect-ratio:0.8373;
  background:#1a1a1a;border-radius:12px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:14px;text-align:center;padding:36px;
  box-shadow:0 16px 60px rgba(0,0,0,.28);
}
.ad-empty.hidden{display:none}
.ei{font-size:44px;opacity:.25}
.et{font-family:'Pacifico',cursive;font-size:18px;color:rgba(255,255,255,.35)}
.es{font-size:11px;color:rgba(255,255,255,.22);line-height:1.6}

@media(max-width:960px){.layout{grid-template-columns:1fr}.ppanel{padding:20px 14px}}
</style>
</head>
<body>

<header class="hdr">
  <div class="brand">My Town <span>Postcard</span></div>
  <div class="hdr-badge">&#10022; Ad Studio</div>
</header>

<div class="layout">

  <!-- FORM PANEL -->
  <div class="fpanel">
    <div class="ptitle">Build Your Ad</div>
    <div class="psub">Choose your industry, fill in your details, pick a photo and template style. Your ad updates live.</div>

    <!-- INDUSTRY -->
    <div class="fsec">
      <div class="slbl">Industry</div>
      <div class="field">
        <label>Business Category *</label>
        <select id="industry" onchange="onIndustryChange()">
          <option value="">&#8212; Select your industry &#8212;</option>
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

    <!-- HERO PHOTO -->
    <div class="fsec">
      <div class="slbl">Hero Photo</div>
      <div class="img-grid" id="imgGrid">
        <div class="img-msg">Select an industry above to load photos</div>
      </div>
      <div class="upload-zone" style="margin-top:10px">
        <input type="file" accept="image/*" onchange="handleUpload(this)">
        <div style="font-size:18px;margin-bottom:2px">&#128248;</div>
        <div style="font-size:11px;font-weight:600;color:var(--ink-mid)">Or upload your own photo</div>
        <div style="font-size:9.5px;color:var(--ink-light);margin-top:1px">Food, storefront, product, team</div>
        <img class="upload-preview" id="uploadPreview">
      </div>
    </div>

    <!-- TEMPLATE STYLE -->
    <div class="fsec">
      <div class="slbl">Template Style</div>
      <div class="tpl-grid">
        <div class="tcard">
          <input type="radio" name="template" id="t1" value="rustic" checked onchange="onTemplateChange()">
          <label for="t1">
            <div class="tcard-thumb" style="background:#e8dcc8">
              <div style="width:100%;height:100%;background:linear-gradient(135deg,#e8dcc8 0%,#c8a87a 60%,#2a1608 100%)"></div>
            </div>
            <div class="tcard-name">Rustic Parchment</div>
            <div class="tcard-desc">Warm, artisan, brush strokes</div>
          </label>
          <div class="selbadge">&#10003;</div>
        </div>
        <div class="tcard">
          <input type="radio" name="template" id="t2" value="dark" disabled>
          <label for="t2" style="opacity:.5;cursor:not-allowed">
            <div class="tcard-thumb" style="background:#0a0a14"><div class="tcard-soon">Coming Soon</div></div>
            <div class="tcard-name">Dark Cinematic</div>
            <div class="tcard-desc">Bold, dramatic, moody</div>
          </label>
        </div>
        <div class="tcard">
          <input type="radio" name="template" id="t3" value="luxury" disabled>
          <label for="t3" style="opacity:.5;cursor:not-allowed">
            <div class="tcard-thumb" style="background:#1a1410"><div class="tcard-soon">Coming Soon</div></div>
            <div class="tcard-name">Luxury Gold</div>
            <div class="tcard-desc">Elegant, refined, upscale</div>
          </label>
        </div>
        <div class="tcard">
          <input type="radio" name="template" id="t4" value="retro" disabled>
          <label for="t4" style="opacity:.5;cursor:not-allowed">
            <div class="tcard-thumb" style="background:#ff6b35"><div class="tcard-soon">Coming Soon</div></div>
            <div class="tcard-name">Retro Poster</div>
            <div class="tcard-desc">Bold, colorful, fun</div>
          </label>
        </div>
        <div class="tcard">
          <input type="radio" name="template" id="t5" value="editorial" disabled>
          <label for="t5" style="opacity:.5;cursor:not-allowed">
            <div class="tcard-thumb" style="background:#f5f5f5"><div class="tcard-soon">Coming Soon</div></div>
            <div class="tcard-name">Editorial</div>
            <div class="tcard-desc">Clean, magazine, modern</div>
          </label>
        </div>
        <div class="tcard">
          <input type="radio" name="template" id="t6" value="neon" disabled>
          <label for="t6" style="opacity:.5;cursor:not-allowed">
            <div class="tcard-thumb" style="background:#001233"><div class="tcard-soon">Coming Soon</div></div>
            <div class="tcard-name">Neon Night</div>
            <div class="tcard-desc">Electric, glowing, vibrant</div>
          </label>
        </div>
      </div>
      <div style="font-size:10.5px;color:var(--ink-light);margin-top:8px;line-height:1.5">5 additional template styles coming soon.</div>
    </div>

    <!-- BUSINESS INFO -->
    <div class="fsec">
      <div class="slbl">Business Info</div>
      <div class="field">
        <label>Business Name &#8212; Main Line *</label>
        <input type="text" id="bizLine1" placeholder="e.g. TONY'S PIZZA" oninput="renderAd()">
        <div class="field-note">Large bold headline font &#8212; works best in ALL CAPS</div>
      </div>
      <div class="field">
        <label>Business Name &#8212; Script Word</label>
        <input type="text" id="bizLine2" placeholder="e.g. Kitchen" oninput="renderAd()">
        <div class="field-note">Appears below in large cursive &#8212; the standout accent word</div>
      </div>
      <div class="field">
        <label>Tagline / Slogan</label>
        <input type="text" id="tagline" placeholder="e.g. Hand-Tossed. Oven Fresh." oninput="renderAd()">
        <div class="field-note">Appears in cursive script on the left side</div>
      </div>
      <div class="frow">
        <div class="field">
          <label>Phone *</label>
          <input type="text" id="phone" placeholder="(706) 555-0100" oninput="renderAd()">
        </div>
        <div class="field">
          <label>City, State</label>
          <input type="text" id="city" placeholder="Clarkesville, GA" oninput="renderAd()">
        </div>
      </div>
      <div class="field">
        <label>Street Address</label>
        <input type="text" id="address" placeholder="596 W Louise St" oninput="renderAd()">
      </div>
    </div>

    <!-- QR CODE -->
    <div class="fsec">
      <div class="slbl">QR Code</div>
      <div class="field">
        <label>Website or URL for QR Code</label>
        <input type="text" id="qrUrl" placeholder="e.g. www.tonysitaliankitchen.com" oninput="renderAd()">
        <div class="field-note">The QR code on the template will link to this URL.</div>
      </div>
    </div>

    <!-- MENU ITEMS -->
    <div class="fsec">
      <div class="slbl">Menu Items / Services (up to 4)</div>
      <div style="font-size:10.5px;color:var(--ink-light);margin-bottom:8px;line-height:1.5">Format: Item Name $Price &#8212; e.g. &ldquo;Large Pizza $14.99&rdquo;</div>
      <div class="menu-list" id="menuList"></div>
      <button class="add-btn" onclick="addMenuItem()">+ Add Item</button>
    </div>

    <!-- COUPON -->
    <div class="fsec">
      <div class="slbl">Special Offer / Coupon</div>
      <div class="field">
        <label>Offer Amount</label>
        <input type="text" id="offerAmount" placeholder="e.g. $5 OFF" oninput="renderAd()">
        <div class="field-note">Large bold text &#8212; e.g. &ldquo;$5 OFF&rdquo;, &ldquo;FREE&rdquo;, &ldquo;BUY 1 GET 1&rdquo;</div>
      </div>
      <div class="field">
        <label>Offer Description</label>
        <input type="text" id="offerItem" placeholder="e.g. Any Large Pizza" oninput="renderAd()">
        <div class="field-note">Appears in cursive below the offer amount</div>
      </div>
      <div class="field">
        <label>Fine Print</label>
        <input type="text" id="offerFine" placeholder="1 per visit &bull; with this postcard" oninput="renderAd()">
      </div>
    </div>

    <!-- ACCENT COLOR -->
    <div class="fsec">
      <div class="slbl">Accent Color</div>
      <div class="crow">
        <div class="chip"><input type="radio" name="color" id="c-orange" value="#C8541A" checked onchange="renderAd()"><label for="c-orange" style="background:#C8541A" title="Rustic Orange"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-gold" value="#D39A42" onchange="renderAd()"><label for="c-gold" style="background:#D39A42" title="Warm Gold"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-red" value="#C0392B" onchange="renderAd()"><label for="c-red" style="background:#C0392B" title="Deep Red"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-burg" value="#7C1C2E" onchange="renderAd()"><label for="c-burg" style="background:#7C1C2E" title="Burgundy"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-green" value="#2d6a4f" onchange="renderAd()"><label for="c-green" style="background:#2d6a4f" title="Forest Green"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-navy" value="#1B3A6B" onchange="renderAd()"><label for="c-navy" style="background:#1B3A6B" title="Navy Blue"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-teal" value="#0D7377" onchange="renderAd()"><label for="c-teal" style="background:#0D7377" title="Teal"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-purple" value="#5B2D8E" onchange="renderAd()"><label for="c-purple" style="background:#5B2D8E" title="Purple"></label></div>
      </div>
    </div>

    <button class="gen-btn" onclick="renderAd()">&#10022; Preview My Ad</button>
  </div>

  <!-- PREVIEW PANEL -->
  <div class="ppanel">
    <div class="ptoolbar">
      <div class="plabel">Ad Preview</div>
      <div class="tactions">
        <button class="tbtn" id="shuffleBtn" onclick="shufflePhoto()" disabled>&#8635; New Photo</button>
        <button class="tbtn primary" id="useBtn" onclick="useAd()" disabled>&#10003; Use This Ad</button>
      </div>
    </div>

    <div class="ad-outer">
      <div class="ad-empty" id="adEmpty">
        <div class="ei">&#10022;</div>
        <div class="et">Your ad appears here</div>
        <div class="es">Select your industry and fill in your business details &#8212; your ad renders instantly with no waiting.</div>
      </div>

      <div class="ad-wrap" id="adWrap">
        <img class="ad-template-img" id="adTemplateImg"
          src="/assets/template-rustic-parchment.png"
          alt="Ad template background">

        <!-- Hero food photo — prominent foreground -->
        <div class="ad-photo-wrap" id="photoWrap" style="display:none">
          <img id="photoImg" src="" alt="Hero photo">
        </div>

        <!-- TEXT OVERLAYS -->
        <div class="ov-bizname" id="ovBizname">
          <span class="biz-l1" id="ovL1"></span>
          <span class="biz-l2" id="ovL2"></span>
          <div class="biz-ticks" id="ovTicks">
            <span class="tick" style="width:28px"></span>
            <span class="tick" style="width:20px"></span>
            <span class="tick" style="width:14px"></span>
          </div>
        </div>

        <div class="ov-tagline" id="ovTagline">
          <span class="tagline-txt" id="ovTgTxt"></span>
          <span class="tagline-rule" id="ovTgRule"></span>
        </div>

        <div class="ov-menu" id="ovMenu"></div>

        <div class="ov-coupon" id="ovCoupon" style="display:none">
          <span class="coupon-amount" id="ovCpAmt"></span>
          <span class="coupon-item" id="ovCpItem"></span>
          <span class="coupon-fine" id="ovCpFine"></span>
        </div>

        <div class="ov-phone" id="ovPhone">
          <span class="phone-num" id="ovPhNum"></span>
          <span class="phone-addr" id="ovPhAddr"></span>
        </div>

        <div class="ov-qr-label" id="ovQrLabel">
          <span class="qr-url-txt" id="ovQrTxt"></span>
        </div>
      </div>
    </div>

    <div style="max-width:520px;width:100%;font-size:11px;color:var(--ink-light);line-height:1.6;text-align:center;padding:0 8px">
      All text is rendered as crisp HTML overlays &#8212; phone numbers, prices, and addresses are always perfectly accurate.
    </div>
  </div>
</div>

<script>
const INDUSTRIES = {
"Pizza Restaurant":{photos:["https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80","https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80","https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=800&q=80"],tagline:"Hand-Tossed. Oven Fresh.",menu:["Large Pizza $14.99","Family Special $24.99","Wings & Pizza Combo","Free Delivery"],offer:{amount:"$5 OFF",item:"Any Large Pizza",fine:"1 per visit · with this postcard"}},
"Mexican Restaurant":{photos:["https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&q=80","https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=800&q=80","https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?w=800&q=80"],tagline:"Aut\u00e9ntico Mexican Cuisine",menu:["Taco Tuesday $1 Each","Margarita Happy Hour","Family Fajita Platter","Free Chips & Salsa"],offer:{amount:"FREE",item:"Chips & Salsa",fine:"With any entr\u00e9e \u00b7 1 per visit"}},
"Chinese Restaurant":{photos:["https://images.unsplash.com/photo-1525755662778-989d0524087e?w=800&q=80","https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=80"],tagline:"Authentic Asian Flavors",menu:["Lunch Special $8.99","Family Dinner $29.99","Free Egg Roll w/ Order","Catering Available"],offer:{amount:"10% OFF",item:"Any Order",fine:"1 per visit \u00b7 with this postcard"}},
"Breakfast & Cafe":{photos:["https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=800&q=80","https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80","https://images.unsplash.com/photo-1541167760496-1628856ab772?w=800&q=80"],tagline:"Made From Scratch Daily",menu:["Breakfast Plate $8.99","Specialty Coffee $4.49","Bacon Biscuit $4.99","Chicken Tender $5.99"],offer:{amount:"$1 OFF",item:"Any Breakfast Item",fine:"1 per visit \u00b7 with this postcard"}},
"Bar & Grill":{photos:["https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80","https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80"],tagline:"Where Locals Gather",menu:["Half-Price Wings Tues","Happy Hour 4-6pm","Burger & Beer Combo","Live Music Weekends"],offer:{amount:"FREE",item:"Appetizer",fine:"With entr\u00e9e purchase \u00b7 1 per visit"}},
"Italian Restaurant":{photos:["https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80","https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80"],tagline:"Authentic Italian Cuisine",menu:["Pasta Special $12.99","Wine & Dine for 2","Wood-Fired Pizza","Tiramisu Made Daily"],offer:{amount:"$5 OFF",item:"Dinner for Two",fine:"1 per visit \u00b7 with this postcard"}},
"Bakery":{photos:["https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&q=80","https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&q=80"],tagline:"Fresh Baked Daily",menu:["Custom Cakes","Fresh Bread Daily","Birthday Specials","Wedding Cakes"],offer:{amount:"FREE",item:"Cookie with Purchase",fine:"1 per visit \u00b7 with this postcard"}},
"Coffee Shop":{photos:["https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80","https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80"],tagline:"Locally Roasted, Locally Loved",menu:["Specialty Lattes","Cold Brew on Tap","Pastries Daily","Free WiFi"],offer:{amount:"$1 OFF",item:"Any Specialty Drink",fine:"1 per visit \u00b7 with this postcard"}},
"Dentist":{photos:["https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=800&q=80","https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800&q=80"],tagline:"Accepting New Patients!",menu:["Cleanings & Exams","Cosmetic Dentistry","Emergency Care","Insurance Accepted"],offer:{amount:"FREE",item:"New Patient Exam",fine:"New patients only \u00b7 call to schedule"}},
"Medical & Healthcare":{photos:["https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&q=80","https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=800&q=80"],tagline:"Caring for Our Community",menu:["Same-Day Appointments","Most Insurance Accepted","Telehealth Available","Wellness Checkups"],offer:{amount:"FREE",item:"New Patient Consultation",fine:"New patients only \u00b7 call to schedule"}},
"Chiropractor":{photos:["https://images.unsplash.com/photo-1519824145371-296894a0daa9?w=800&q=80","https://images.unsplash.com/photo-1612531386530-97286d97c2d2?w=800&q=80"],tagline:"Get Back to Pain-Free Living",menu:["New Patient Special","Spinal Adjustments","Sports Injury Care","Massage Therapy"],offer:{amount:"$29",item:"New Patient Special",fine:"Includes exam & adjustment \u00b7 1 per visit"}},
"Veterinarian":{photos:["https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=800&q=80","https://images.unsplash.com/photo-1551717743-49959800b1f6?w=800&q=80"],tagline:"Compassionate Care for Pets",menu:["Wellness Exams","Vaccinations","Surgery & Dental","Emergency Care"],offer:{amount:"FREE",item:"First Wellness Exam",fine:"New patients only \u00b7 call to schedule"}},
"HVAC":{photos:["https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=800&q=80","https://images.unsplash.com/photo-1566917064245-1c6bff30dbf1?w=800&q=80"],tagline:"24/7 Emergency Service",menu:["A/C Tune-Up Special","Free Estimates","Emergency Service 24/7","Financing Available"],offer:{amount:"$25 OFF",item:"Any Service Call",fine:"With this postcard \u00b7 expires 12/31"}},
"Plumber":{photos:["https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=800&q=80","https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80"],tagline:"Licensed & Insured Plumbers",menu:["Drain Cleaning","Water Heater Repair","Emergency Service","Senior Discounts"],offer:{amount:"$30 OFF",item:"Any Plumbing Service",fine:"With this postcard \u00b7 new customers only"}},
"Electrician":{photos:["https://images.unsplash.com/photo-1562034037-ba96b6312a80?w=800&q=80","https://images.unsplash.com/photo-1601998539036-006e7fbddb0c?w=800&q=80"],tagline:"Licensed \u00b7 Bonded \u00b7 Insured",menu:["Free Estimates","Panel Upgrades","Emergency Service","EV Charger Installation"],offer:{amount:"FREE",item:"Safety Inspection",fine:"With any service \u00b7 with this postcard"}},
"Lawn & Landscaping":{photos:["https://images.unsplash.com/photo-1558904541-efa843a96f01?w=800&q=80","https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80"],tagline:"Your Yard. Our Pride.",menu:["Weekly Mowing","Spring Cleanup","Mulch Installation","Free Estimates"],offer:{amount:"FREE",item:"First Mowing",fine:"New customers only \u00b7 with this postcard"}},
"Roofing":{photos:["https://images.unsplash.com/photo-1686227829172-608dde465459?w=800&q=80","https://images.unsplash.com/photo-1534237886190-ced735ca4b73?w=800&q=80"],tagline:"Quality Roofing You Can Trust",menu:["Free Inspections","Insurance Claims Help","Storm Damage Repair","Lifetime Warranty"],offer:{amount:"FREE",item:"Roof Inspection",fine:"No obligation \u00b7 with this postcard"}},
"Painting":{photos:["https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=800&q=80","https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=800&q=80"],tagline:"Transform Your Home",menu:["Free Color Consultation","Interior Painting","Exterior Painting","Cabinet Refinishing"],offer:{amount:"10% OFF",item:"Any Paint Job",fine:"New customers \u00b7 with this postcard"}},
"Cleaning Service":{photos:["https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&q=80","https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?w=800&q=80"],tagline:"Sparkling Clean, Every Time",menu:["Weekly Service","Deep Cleaning","Move In/Out","Eco-Friendly Products"],offer:{amount:"$20 OFF",item:"First Cleaning",fine:"New customers only \u00b7 with this postcard"}},
"Pest Control":{photos:["https://images.unsplash.com/photo-1560519894-90d2f1ccae4a?w=800&q=80","https://images.unsplash.com/photo-1582510337531-26936ce438e5?w=800&q=80"],tagline:"Bug-Free Living Guaranteed",menu:["Free Inspections","Termite Treatment","Mosquito Control","Quarterly Plans"],offer:{amount:"FREE",item:"Pest Inspection",fine:"No obligation \u00b7 with this postcard"}},
"Real Estate":{photos:["https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80","https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80"],tagline:"Your Local Real Estate Expert",menu:["Free Home Valuation","Buyer Representation","Listing Services","Investment Properties"],offer:{amount:"FREE",item:"Home Valuation",fine:"No obligation \u00b7 call today"}},
"Insurance":{photos:["https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&q=80","https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80"],tagline:"Local Agent. Real Savings.",menu:["Free Quote","Bundle & Save","24/7 Claims Service","Local Agent"],offer:{amount:"FREE",item:"Insurance Review",fine:"No obligation \u00b7 call today"}},
"Auto Repair":{photos:["https://images.unsplash.com/photo-1486006920555-c77dcf18193c?w=800&q=80","https://images.unsplash.com/photo-1593142927747-8c1b758967a6?w=800&q=80"],tagline:"Honest Auto Repair",menu:["Oil Change Special","Brake Service","AC Repair","Free Estimates"],offer:{amount:"$10 OFF",item:"Any Service $75+",fine:"With this postcard \u00b7 1 per visit"}},
"Salon & Beauty":{photos:["https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&q=80","https://images.unsplash.com/photo-1562322140-8baeececf3df?w=800&q=80"],tagline:"Look Beautiful. Feel Confident.",menu:["Cut & Color Special","Wedding Hair","Bridal Packages","Walk-Ins Welcome"],offer:{amount:"$10 OFF",item:"First Visit",fine:"New clients only \u00b7 with this postcard"}},
"Barbershop":{photos:["https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&q=80","https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800&q=80"],tagline:"Classic Cuts. Modern Style.",menu:["Haircuts $25","Beard Trim","Hot Towel Shaves","Father-Son Combo"],offer:{amount:"$5 OFF",item:"First Haircut",fine:"New clients only \u00b7 with this postcard"}},
"Gym & Fitness":{photos:["https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80","https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80"],tagline:"Stronger Every Day",menu:["Free 7-Day Trial","Personal Training","Group Classes","24/7 Access"],offer:{amount:"FREE",item:"7-Day Trial Pass",fine:"New members only \u00b7 with this postcard"}},
"Pet Services":{photos:["https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=800&q=80","https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&q=80"],tagline:"Pampered Pets, Happy Owners",menu:["Full Grooming","Boarding & Daycare","Self-Wash Stations","First-Time Discounts"],offer:{amount:"$10 OFF",item:"First Grooming",fine:"New clients only \u00b7 with this postcard"}},
"Financial Services":{photos:["https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80","https://images.unsplash.com/photo-1579621970795-87facc2f976d?w=800&q=80"],tagline:"Secure Your Financial Future",menu:["Free Consultation","Retirement Planning","Tax Services","Investment Management"],offer:{amount:"FREE",item:"Financial Consultation",fine:"No obligation \u00b7 call today"}},
"Daycare":{photos:["https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=800&q=80","https://images.unsplash.com/photo-1602052793312-b99c2a9ee797?w=800&q=80"],tagline:"Where Learning Begins",menu:["Now Enrolling","Ages 6 weeks - 5 years","Educational Programs","Licensed & Insured"],offer:{amount:"FREE",item:"First Week",fine:"New enrollments only \u00b7 limited spots"}},
"Photography":{photos:["https://images.unsplash.com/photo-1554080353-a576cf803bda?w=800&q=80","https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=800&q=80"],tagline:"Capturing Life's Moments",menu:["Wedding Packages","Family Sessions","Senior Portraits","Events & Corporate"],offer:{amount:"$50 OFF",item:"Any Session",fine:"With this postcard \u00b7 book today"}},
"Retail Shop":{photos:["https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80","https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=800&q=80"],tagline:"Shop Local. Shop Better.",menu:["New Arrivals Weekly","Members Save 15%","Free Gift Wrapping","Special Orders"],offer:{amount:"15% OFF",item:"Your First Purchase",fine:"With this postcard \u00b7 1 per customer"}},
"Other Service":{photos:["https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80","https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=800&q=80"],tagline:"Quality Service You Can Trust",menu:["Free Consultation","Quality Service","Satisfaction Guaranteed","Local & Trusted"],offer:{amount:"10% OFF",item:"First Service",fine:"New customers \u00b7 with this postcard"}},
};

const TEMPLATES = {
  rustic: '/assets/template-rustic-parchment.png',
  dark:   '/assets/template-dark-cinematic.png',
  luxury: '/assets/template-luxury-gold.png',
  retro:  '/assets/template-retro-poster.png',
  editorial: '/assets/template-editorial.png',
  neon:   '/assets/template-neon-night.png',
};

var selectedPhotoUrl = null;
var currentPhotos = [];
var currentPhotoIndex = 0;

function onIndustryChange(){
  var ind = document.getElementById('industry').value;
  if(!ind) return;
  var data = INDUSTRIES[ind] || INDUSTRIES['Other Service'];
  document.getElementById('tagline').value = data.tagline;
  buildMenu(data.menu);
  document.getElementById('offerAmount').value = data.offer.amount;
  document.getElementById('offerItem').value   = data.offer.item;
  document.getElementById('offerFine').value   = data.offer.fine;
  loadPhotos(ind, data.photos);
  renderAd();
}

async function loadPhotos(industry, fallback){
  var grid = document.getElementById('imgGrid');
  grid.innerHTML = '<div class="img-msg">Loading photos...</div>';
  var photos = fallback || [];
  try {
    var res = await fetch('/api/image-library?industry=' + encodeURIComponent(industry));
    var data = await res.json();
    if(data.images && data.images.length)
      photos = data.images.map(function(i){ return i.image_url; });
  } catch(e){ /* use fallback */ }
  currentPhotos = photos;
  if(!photos.length){
    grid.innerHTML = '<div class="img-msg">No photos yet for this industry &mdash; upload your own below.</div>';
    return;
  }
  grid.innerHTML = '';
  photos.slice(0,8).forEach(function(url,i){
    var div = document.createElement('div');
    div.className = 'img-thumb' + (i===0?' selected':'');
    div.onclick = (function(u,d){ return function(){
      selectPhoto(u);
      document.querySelectorAll('.img-thumb').forEach(function(t){ t.classList.remove('selected'); });
      d.classList.add('selected');
    }; })(url,div);
    div.innerHTML = '<img src="' + url + '" loading="lazy" alt="photo ' + (i+1) + '"><div class="sel-check">&#10003;</div>';
    grid.appendChild(div);
  });
  selectedPhotoUrl = photos[0];
  currentPhotoIndex = 0;
  document.getElementById('shuffleBtn').disabled = false;
  setHeroPhoto(selectedPhotoUrl);
  renderAd();
}

function selectPhoto(url){
  selectedPhotoUrl = url;
  setHeroPhoto(url);
  renderAd();
}

function shufflePhoto(){
  if(!currentPhotos.length) return;
  currentPhotoIndex = (currentPhotoIndex+1) % currentPhotos.length;
  var url = currentPhotos[currentPhotoIndex];
  selectedPhotoUrl = url;
  document.querySelectorAll('.img-thumb').forEach(function(t,i){ t.classList.toggle('selected', i===currentPhotoIndex); });
  setHeroPhoto(url);
  renderAd();
}

function setHeroPhoto(url){
  var wrap = document.getElementById('photoWrap');
  var img  = document.getElementById('photoImg');
  if(url){
    img.src = url;
    wrap.style.display = 'block';
  } else {
    wrap.style.display = 'none';
  }
}

function handleUpload(input){
  var file = input.files[0]; if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e){
    var url = e.target.result;
    document.getElementById('uploadPreview').src = url;
    document.getElementById('uploadPreview').style.display = 'block';
    document.querySelectorAll('.img-thumb').forEach(function(t){ t.classList.remove('selected'); });
    selectedPhotoUrl = url;
    setHeroPhoto(url);
    renderAd();
  };
  reader.readAsDataURL(file);
}

function onTemplateChange(){
  var tplEl = document.querySelector('input[name="template"]:checked');
  var tpl = tplEl ? tplEl.value : 'rustic';
  var img = document.getElementById('adTemplateImg');
  if(TEMPLATES[tpl]) img.src = TEMPLATES[tpl];
  renderAd();
}

function buildMenu(items){
  var list = document.getElementById('menuList');
  list.innerHTML = '';
  items.slice(0,4).forEach(function(i){ addMenuItem(i); });
}
function addMenuItem(val){
  val = val || '';
  var list = document.getElementById('menuList');
  if(list.children.length >= 4) return;
  var row = document.createElement('div');
  row.className = 'mrow';
  row.innerHTML = '<input type="text" placeholder="Item Name $Price" value="' + val + '" oninput="renderAd()">'
    + '<button class="rm-btn" onclick="this.parentElement.remove();renderAd()" title="Remove">&times;</button>';
  list.appendChild(row);
  renderAd();
}
function getMenu(){
  return Array.from(document.querySelectorAll('.mrow input')).map(function(i){ return i.value.trim(); }).filter(Boolean).slice(0,4);
}
function parseMenuItem(str){
  var m = str.match(/^(.+?)\\s*(\\$[\\d.]+.*)$/);
  return m ? {name:m[1].trim(), price:m[2].trim()} : {name:str, price:''};
}

function renderAd(){
  var acEl = document.querySelector('input[name="color"]:checked');
  var ac = acEl ? acEl.value : '#C8541A';
  document.getElementById('adWrap').classList.add('visible');
  document.getElementById('adEmpty').classList.add('hidden');
  document.getElementById('adWrap').style.setProperty('--ac', ac);

  document.getElementById('ovL1').textContent = document.getElementById('bizLine1').value.trim();
  var l2 = document.getElementById('ovL2');
  l2.textContent = document.getElementById('bizLine2').value.trim();
  l2.style.color = ac;

  document.getElementById('ovTgTxt').textContent = document.getElementById('tagline').value.trim();
  document.getElementById('ovTgRule').style.background = 'linear-gradient(90deg,' + ac + ',transparent)';

  var menuEl = document.getElementById('ovMenu');
  menuEl.innerHTML = getMenu().map(function(item){
    var p = parseMenuItem(item);
    return '<div class="menu-row">'
      + '<span class="mi-name">' + p.name + '</span>'
      + (p.price ? '<span class="mi-dots"></span><span class="mi-price" style="color:' + ac + '">' + p.price + '</span>' : '')
      + '</div>';
  }).join('');

  var amt  = document.getElementById('offerAmount').value.trim();
  var item = document.getElementById('offerItem').value.trim();
  var fine = document.getElementById('offerFine').value.trim();
  var couponEl = document.getElementById('ovCoupon');
  if(amt || item){
    couponEl.style.display = 'flex';
    document.getElementById('ovCpAmt').textContent = amt;
    var cpItem = document.getElementById('ovCpItem');
    cpItem.textContent = item;
    cpItem.style.color = ac;
    document.getElementById('ovCpFine').textContent = fine;
  } else {
    couponEl.style.display = 'none';
  }

  var phone = document.getElementById('phone').value.trim();
  var addr  = document.getElementById('address').value.trim();
  var city  = document.getElementById('city').value.trim();
  document.getElementById('ovPhNum').textContent = phone;
  document.getElementById('ovPhAddr').textContent = [addr, city].filter(Boolean).join(', ');

  var qrUrl = document.getElementById('qrUrl').value.trim();
  document.getElementById('ovQrTxt').textContent = qrUrl || (phone ? 'Tap to call' : '');

  document.getElementById('useBtn').disabled = false;
}

async function useAd(){
  var acEl = document.querySelector('input[name="color"]:checked');
  var ac = acEl ? acEl.value : '#C8541A';
  var tplEl = document.querySelector('input[name="template"]:checked');
  var payload = {
    adVersion: 'ad-studio-v2',
    template: tplEl ? tplEl.value : 'rustic',
    industry: document.getElementById('industry').value,
    bizLine1: document.getElementById('bizLine1').value.trim(),
    bizLine2: document.getElementById('bizLine2').value.trim(),
    tagline:  document.getElementById('tagline').value.trim(),
    phone:    document.getElementById('phone').value.trim(),
    address:  document.getElementById('address').value.trim(),
    city:     document.getElementById('city').value.trim(),
    qrUrl:    document.getElementById('qrUrl').value.trim(),
    menu:     getMenu(),
    offerAmount: document.getElementById('offerAmount').value.trim(),
    offerItem:   document.getElementById('offerItem').value.trim(),
    offerFine:   document.getElementById('offerFine').value.trim(),
    accentColor: ac,
    photoUrl: selectedPhotoUrl || '',
  };
  var btn = document.getElementById('useBtn');
  btn.textContent = 'Saving\u2026';
  btn.disabled = true;
  try {
    var res = await fetch('/api/ad-studio/save', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });
    if(res.ok){
      btn.textContent = '\u2713 Saved!';
      btn.style.background = '#1a5c3a';
      setTimeout(function(){
        btn.textContent = '\u2713 Use This Ad';
        btn.style.background = '';
        btn.disabled = false;
      }, 2500);
    } else {
      btn.textContent = '\u2713 Use This Ad';
      btn.disabled = false;
    }
  } catch(e){
    btn.textContent = '\u2713 Use This Ad';
    btn.disabled = false;
  }
}

document.getElementById('adWrap').classList.add('visible');
document.getElementById('adEmpty').classList.remove('hidden');
</script>

</body>
</html>`;

export default router;
