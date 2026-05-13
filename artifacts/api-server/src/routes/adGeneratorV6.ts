import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, outreachLeadsTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/ad-generator-v6/save", async (req, res): Promise<void> => {
  const { leadId, adVersion, templateStyle, photoUrl, bizName, tagline, phone, address, city, menu, offer, accentColor } = req.body ?? {};
  if (leadId) {
    const id = Number(leadId);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid leadId" }); return; }
    const [row] = await db.select().from(outreachLeadsTable).where(eq(outreachLeadsTable.id, id));
    if (!row) { res.status(404).json({ error: "Lead not found" }); return; }
    await db.update(outreachLeadsTable)
      .set({ notes: `[Ad ${adVersion ?? "v6"} · ${templateStyle ?? "mr-biscuits-rustic"} · ${new Date().toLocaleDateString()}] biz: ${bizName ?? ""} photo: ${photoUrl ?? ""}` })
      .where(eq(outreachLeadsTable.id, id));
  }
  res.json({ ok: true, adVersion, templateStyle, bizName, tagline, phone, address, city, menu, offer, accentColor });
});

router.get("/ad-generator-v6", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(AD_GENERATOR_V6_HTML);
});

const AD_GENERATOR_V6_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Town Postcard &mdash; Ad Generator v6</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Pacifico&family=Great+Vibes&family=Montserrat:wght@400;500;600;700;800&family=Dancing+Script:wght@600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --burg:#7C1C2E;--burg-dark:#5a1220;--burg-pale:#f9eaed;
  --ink:#111827;--ink-mid:#374151;--ink-light:#6B7280;
  --surface:#F7F5F2;--card:#fff;--border:#E5E0D8;--green:#1a5c3a;
}
body{font-family:'Montserrat',sans-serif;background:var(--surface);min-height:100vh;color:var(--ink)}

/* HEADER */
.hdr{background:var(--ink);padding:14px 32px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid var(--burg)}
.brand{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#fff;letter-spacing:.08em}
.brand span{color:#C8A882}
.hdr-badge{background:var(--burg);color:#fff;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:4px 12px;border-radius:20px}

/* LAYOUT */
.layout{display:grid;grid-template-columns:420px 1fr;min-height:calc(100vh - 55px)}

/* FORM PANEL */
.fpanel{background:var(--card);border-right:1px solid var(--border);padding:22px 20px;overflow-y:auto}
.ptitle{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:.06em;margin-bottom:2px}
.psub{font-size:11.5px;color:var(--ink-light);margin-bottom:18px;line-height:1.5}
.fsec{margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid var(--border)}
.fsec:last-of-type{border-bottom:none;margin-bottom:0}
.slbl{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--burg);margin-bottom:10px;display:flex;align-items:center;gap:8px}
.slbl::after{content:'';flex:1;height:1px;background:var(--burg-pale)}
.field{margin-bottom:9px}
.field:last-child{margin-bottom:0}
.field>label{display:block;font-size:11px;font-weight:600;color:var(--ink-mid);margin-bottom:3px;letter-spacing:.04em;text-transform:uppercase}
.field input,.field select,.field textarea{width:100%;padding:8px 11px;border:1.5px solid var(--border);border-radius:7px;font-family:'Montserrat',sans-serif;font-size:13px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.field input:focus,.field select:focus,.field textarea:focus{border-color:var(--burg);background:#fff}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:9px}

/* Menu builder */
.menu-list{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}
.mrow{display:flex;gap:6px;align-items:center}
.mrow input{flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:'Montserrat',sans-serif;font-size:12.5px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.mrow input:focus{border-color:var(--burg);background:#fff}
.rm-btn{width:26px;height:26px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-light);cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;line-height:1}
.rm-btn:hover{border-color:#c0392b;color:#c0392b;background:#fef2f2}
.add-btn{font-size:11px;font-weight:600;color:var(--burg);background:none;border:1.5px dashed var(--burg);border-radius:6px;padding:6px 12px;cursor:pointer;width:100%;transition:all .2s;font-family:'Montserrat',sans-serif}
.add-btn:hover{background:var(--burg-pale)}

/* Image picker */
.img-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px}
.img-thumb{position:relative;aspect-ratio:4/3;border-radius:6px;overflow:hidden;cursor:pointer;border:2.5px solid transparent;transition:all .2s}
.img-thumb:hover{transform:scale(1.03)}
.img-thumb.selected{border-color:var(--burg);box-shadow:0 0 0 2px var(--burg)}
.img-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.img-thumb .sel-check{display:none;position:absolute;top:4px;right:4px;background:var(--burg);color:#fff;border-radius:50%;width:18px;height:18px;font-size:10px;font-weight:700;align-items:center;justify-content:center}
.img-thumb.selected .sel-check{display:flex}
.img-loading{grid-column:1/-1;text-align:center;padding:20px;font-size:12px;color:var(--ink-light)}

/* Upload */
.upload-zone{border:2px dashed var(--border);border-radius:9px;padding:12px;text-align:center;cursor:pointer;transition:all .2s;background:var(--surface);position:relative;overflow:hidden}
.upload-zone:hover{border-color:var(--burg);background:var(--burg-pale)}
.upload-zone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.upload-preview{width:100%;height:60px;object-fit:cover;border-radius:5px;margin-top:6px;display:none}

/* Color chips */
.crow{display:flex;gap:7px;flex-wrap:wrap;margin-top:2px}
.chip{position:relative}
.chip input[type=radio]{position:absolute;opacity:0;width:0;height:0}
.chip label{width:28px;height:28px;border-radius:50%;display:block;cursor:pointer;border:3px solid transparent;transition:transform .2s,border-color .2s;text-transform:none}
.chip input:checked+label{border-color:var(--ink);transform:scale(1.15)}
.chip label:hover{transform:scale(1.1)}

/* Buttons */
.gen-btn{width:100%;padding:13px;background:var(--burg);color:#fff;border:none;border-radius:9px;font-family:'Bebas Neue',sans-serif;font-size:19px;letter-spacing:.12em;cursor:pointer;transition:all .2s;margin-top:6px;display:flex;align-items:center;justify-content:center;gap:9px}
.gen-btn:hover:not(:disabled){background:var(--burg-dark)}
.gen-btn:disabled{background:#bbb;cursor:not-allowed}

/* PREVIEW PANEL */
.ppanel{background:#E8E4DE;padding:28px 32px;display:flex;flex-direction:column;align-items:center;gap:16px;overflow-y:auto}
.ptoolbar{width:100%;max-width:500px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.plabel{font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:.1em;color:var(--ink-mid)}
.tactions{display:flex;gap:7px}
.tbtn{padding:6px 13px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid var(--border);background:var(--card);color:var(--ink-mid);transition:all .2s;font-family:'Montserrat',sans-serif}
.tbtn:hover:not(:disabled){border-color:var(--burg);color:var(--burg)}
.tbtn.primary{background:var(--green);border-color:var(--green);color:#fff}
.tbtn.primary:hover:not(:disabled){background:#144d30}
.tbtn:disabled{opacity:.4;cursor:not-allowed}

/* AD CANVAS  4:5 ratio */
.ad-outer{width:100%;max-width:500px}
.ad-canvas{width:100%;aspect-ratio:4/5;position:relative;overflow:hidden;border-radius:24px;background:#2A160B;box-shadow:0 16px 60px rgba(0,0,0,.28);display:none;font-family:'Montserrat',sans-serif}
.ad-canvas.visible{display:block}
.ad-hero{position:absolute;inset:0;background-size:cover;background-position:center;filter:brightness(.78);z-index:1}
.ad-gradient{position:absolute;inset:0;z-index:2;background:linear-gradient(to top,rgba(0,0,0,.78) 0%,rgba(0,0,0,.35) 45%,rgba(0,0,0,.08) 100%)}
.ad-wash{position:absolute;inset:0;z-index:3;background:linear-gradient(135deg,rgba(42,22,11,.72) 0%,rgba(0,0,0,0) 55%)}
.ad-content{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;justify-content:space-between;padding:5% 6%;color:#FFF8F0}

/* Header section */
.ad-header{display:flex;align-items:flex-start;gap:4%}
.ad-logo-wrap{width:14%;aspect-ratio:1;border-radius:14%;overflow:hidden;flex-shrink:0;border:2px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;font-size:1.8vw}
.ad-logo-wrap img{width:100%;height:100%;object-fit:cover}
.ad-title-block{flex:1}
.ad-biz-name{font-family:'Bebas Neue',sans-serif;font-size:clamp(22px,5.5vw,56px);line-height:.9;letter-spacing:.03em;color:#fff;text-shadow:2px 2px 12px rgba(0,0,0,.5)}
.ad-tagline-script{font-family:'Pacifico',cursive;font-size:clamp(11px,2.4vw,24px);color:#D39A42;display:block;margin-top:2%;line-height:1}
.ad-tagline-script::before,.ad-tagline-script::after{content:' \u2014 ';color:#C8882E;font-family:'Montserrat',sans-serif;font-style:normal;font-size:.85em}

/* Middle spacer */
.ad-middle{flex:1}

/* Bottom section */
.ad-menu{background:rgba(0,0,0,.38);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-radius:clamp(8px,2vw,20px);padding:3% 4%;margin-bottom:3%}
.ad-menu-item{display:flex;align-items:center;justify-content:space-between;padding:1.2% 0;border-bottom:1px solid rgba(255,255,255,.08);gap:8px}
.ad-menu-item:last-child{border-bottom:none;padding-bottom:0}
.ad-menu-item:first-child{padding-top:0}
.ad-menu-left{display:flex;align-items:center;gap:3%}
.ad-check-badge{width:clamp(14px,2.5vw,22px);height:clamp(14px,2.5vw,22px);border-radius:50%;border:2px solid #D39A42;display:flex;align-items:center;justify-content:center;font-size:clamp(7px,1.3vw,11px);color:#D39A42;flex-shrink:0;font-weight:700}
.ad-item-name{font-family:'Montserrat',sans-serif;font-size:clamp(9px,1.8vw,16px);font-weight:600;color:#FFF8F0;letter-spacing:.02em}
.ad-item-dots{flex:1;border-bottom:1px dotted rgba(255,255,255,.2);margin:0 2%;position:relative;top:-1px;min-width:10px}
.ad-item-price{font-family:'Montserrat',sans-serif;font-size:clamp(9px,1.8vw,16px);font-weight:700;color:#D39A42;white-space:nowrap}

/* Coupon box */
.ad-coupon{border:2px dashed rgba(255,255,255,.4);border-radius:clamp(6px,1.5vw,14px);padding:2.5% 4%;margin-bottom:3%;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:space-between;gap:4%}
.ad-coupon-amount{font-family:'Bebas Neue',sans-serif;font-size:clamp(20px,4.5vw,44px);color:#fff;line-height:1;letter-spacing:.02em}
.ad-coupon-item-name{font-family:'Pacifico',cursive;font-size:clamp(12px,2.5vw,24px);color:#D39A42;line-height:1;display:block;margin-top:1%}
.ad-coupon-fine{font-size:clamp(7px,1.3vw,11px);color:rgba(255,255,255,.5);margin-top:2%;font-family:'Montserrat',sans-serif}
.ad-coupon-right{text-align:center;flex-shrink:0}
.ad-coupon-badge{background:rgba(211,154,66,.15);border:1px solid rgba(211,154,66,.4);border-radius:clamp(4px,1vw,8px);padding:3% 6%;font-family:'Montserrat',sans-serif;font-size:clamp(7px,1.3vw,11px);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(211,154,66,.85);line-height:1.3}

/* Footer */
.ad-footer{display:flex;align-items:center;justify-content:space-between;gap:4%;border-top:1px solid rgba(255,255,255,.12);padding-top:2.5%}
.ad-footer-left{display:flex;align-items:center;gap:3%}
.ad-phone-icon{width:clamp(18px,3.2vw,30px);height:clamp(18px,3.2vw,30px);border-radius:50%;border:1.5px solid #D39A42;display:flex;align-items:center;justify-content:center;font-size:clamp(8px,1.5vw,13px);flex-shrink:0;color:#D39A42}
.ad-phone-num{font-family:'Bebas Neue',sans-serif;font-size:clamp(16px,3.5vw,34px);letter-spacing:.06em;color:#fff;line-height:1;text-shadow:0 2px 8px rgba(0,0,0,.5)}
.ad-address-txt{font-size:clamp(7px,1.3vw,11px);color:rgba(255,255,255,.5);margin-top:1%;font-family:'Montserrat',sans-serif;font-weight:400}
.ad-qr-wrap{display:flex;flex-direction:column;align-items:center;gap:2%;flex-shrink:0}
.ad-qr-box{width:clamp(32px,6vw,56px);height:clamp(32px,6vw,56px);background:#fff;border-radius:clamp(4px,1vw,8px);padding:3px}
.ad-qr-scan{font-size:clamp(6px,1.1vw,9px);color:rgba(255,255,255,.4);letter-spacing:.1em;text-transform:uppercase;font-family:'Montserrat',sans-serif;font-weight:600}

/* Empty state */
.ad-empty{width:100%;aspect-ratio:4/5;max-width:500px;background:#1a1a1a;border-radius:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:36px;box-shadow:0 16px 60px rgba(0,0,0,.28)}
.ad-empty.hidden{display:none}
.ei{font-size:44px;opacity:.25}
.et{font-family:'Pacifico',cursive;font-size:18px;color:rgba(255,255,255,.35)}
.es{font-size:11px;color:rgba(255,255,255,.22);line-height:1.6}

@media(max-width:900px){.layout{grid-template-columns:1fr}.ppanel{padding:20px 14px}}
</style>
</head>
<body>

<header class="hdr">
  <div class="brand">My Town <span>Postcard</span></div>
  <div class="hdr-badge">&#10022; Ad Generator v6</div>
</header>

<div class="layout">

  <!-- FORM -->
  <div class="fpanel">
    <div class="ptitle">Build Your Ad</div>
    <div class="psub">Template built from the Mr. Biscuit's ad design system. Real photo + crisp HTML = print-ready every time.</div>

    <!-- Industry -->
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

    <!-- Business Info -->
    <div class="fsec">
      <div class="slbl">Business Info</div>
      <div class="field"><label>Business Name *</label><input type="text" id="bizName" placeholder="e.g. Mr. Biscuit's Cafe" oninput="renderAd()"></div>
      <div class="field"><label>Tagline / Slogan</label><input type="text" id="tagline" placeholder="e.g. From-Scratch Biscuits &amp; Boba!" oninput="renderAd()"></div>
      <div class="frow">
        <div class="field"><label>Phone *</label><input type="text" id="phone" placeholder="(706) 754-0105" oninput="renderAd()"></div>
        <div class="field"><label>City, State</label><input type="text" id="city" placeholder="Clarkesville, GA" oninput="renderAd()"></div>
      </div>
      <div class="field"><label>Address</label><input type="text" id="address" placeholder="596 W Louise St" oninput="renderAd()"></div>
      <div class="field"><label>Website</label><input type="text" id="website" placeholder="www.example.com" oninput="renderAd()"></div>
    </div>

    <!-- Photo -->
    <div class="fsec">
      <div class="slbl">Hero Photo</div>
      <div class="img-grid" id="imgGrid">
        <div class="img-loading">Select an industry to load photos</div>
      </div>
      <div style="margin-top:10px">
        <div style="font-size:11px;font-weight:600;color:var(--ink-mid);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Or upload your own</div>
        <div class="upload-zone">
          <input type="file" accept="image/*" onchange="handleUpload(this)">
          <div style="font-size:20px;margin-bottom:3px">&#128248;</div>
          <div style="font-size:11px;font-weight:600;color:var(--ink-mid)">Upload Photo</div>
          <div style="font-size:9.5px;color:var(--ink-light);margin-top:1px">Your food, storefront, or product</div>
          <img class="upload-preview" id="uploadPreview">
        </div>
      </div>
    </div>

    <!-- Menu -->
    <div class="fsec">
      <div class="slbl">Menu Items / Services</div>
      <div class="menu-list" id="menuList"></div>
      <button class="add-btn" onclick="addMenuItem()">+ Add Item</button>
    </div>

    <!-- Offer -->
    <div class="fsec">
      <div class="slbl">Special Offer / Coupon</div>
      <div class="field"><label>Offer Text</label><input type="text" id="offer" placeholder="e.g. \$1 OFF Any Biscuit &middot; 1 per visit" oninput="renderAd()"></div>
    </div>

    <!-- Colors -->
    <div class="fsec">
      <div class="slbl">Accent Color</div>
      <div class="crow">
        <div class="chip"><input type="radio" name="color" id="c-gold" value="#D39A42" checked onchange="renderAd()"><label for="c-gold" style="background:#D39A42" title="Warm Gold"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-orange" value="#D66A28" onchange="renderAd()"><label for="c-orange" style="background:#D66A28" title="Accent Orange"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-red" value="#C0392B" onchange="renderAd()"><label for="c-red" style="background:#C0392B" title="Deep Red"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-burg" value="#7C1C2E" onchange="renderAd()"><label for="c-burg" style="background:#7C1C2E" title="Burgundy"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-green" value="#2d6a4f" onchange="renderAd()"><label for="c-green" style="background:#2d6a4f" title="Forest Green"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-navy" value="#1B3A6B" onchange="renderAd()"><label for="c-navy" style="background:#1B3A6B" title="Navy"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-teal" value="#0D7377" onchange="renderAd()"><label for="c-teal" style="background:#0D7377" title="Teal"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-purple" value="#5B2D8E" onchange="renderAd()"><label for="c-purple" style="background:#5B2D8E" title="Purple"></label></div>
      </div>
    </div>

  </div>

  <!-- PREVIEW -->
  <div class="ppanel">
    <div class="ptoolbar">
      <div class="plabel">Ad Preview</div>
      <div class="tactions">
        <button class="tbtn" id="shuffleBtn" onclick="shufflePhoto()" disabled>&#10227; New Photo</button>
        <button class="tbtn primary" id="useBtn" onclick="useAd()" disabled>&#10003; Use This Ad</button>
      </div>
    </div>

    <div class="ad-outer">
      <div class="ad-empty" id="adEmpty">
        <div class="ei">&#10022;</div>
        <div class="et">Your ad appears here</div>
        <div class="es">Select your industry, enter your business name, choose a photo &mdash; renders instantly.</div>
      </div>

      <div class="ad-canvas" id="adCanvas">
        <div class="ad-hero" id="adHero"></div>
        <div class="ad-gradient"></div>
        <div class="ad-wash"></div>
        <div class="ad-content" id="adContent"></div>
      </div>
    </div>

    <div style="max-width:500px;width:100%;font-size:11px;color:var(--ink-light);line-height:1.6;text-align:center;padding:0 8px">
      Built from the Mr. Biscuit's design system &mdash; Bebas Neue headlines, Pacifico script accents, dotted menu list, dashed coupon box, gold color palette.
    </div>
  </div>
</div>

<script>
const INDUSTRIES = {
"Pizza Restaurant":{photos:["https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80","https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80","https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=800&q=80"],taglines:["Hand-Tossed. Oven Fresh.","The Best Slice in Town!"],menu:["Large Pizza $14.99","Family Special $24.99","Wings & Pizza Combo","Free Delivery"]},
"Mexican Restaurant":{photos:["https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&q=80","https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=800&q=80","https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?w=800&q=80"],taglines:["Aut\\u00e9ntico Mexican Cuisine","Family Recipes Since 1992"],menu:["Taco Tuesday $1 Each","Margarita Happy Hour","Family Fajita Platter","Free Chips & Salsa"]},
"Breakfast & Cafe":{photos:["https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=800&q=80","https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80","https://images.unsplash.com/photo-1541167760496-1628856ab772?w=800&q=80"],taglines:["Made From Scratch Daily","Coffee \\u00b7 Biscuits \\u00b7 Smiles"],menu:["Breakfast Plate $8.99","Specialty Coffee $4.49","Bacon Biscuit $4.99","Chicken Tender $5.99"]},
"Bar & Grill":{photos:["https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80","https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80"],taglines:["Where Locals Gather","Burgers \\u00b7 Beer \\u00b7 Good Times"],menu:["Half-Price Wings Tues","Happy Hour 4-6pm","Burger & Beer Combo","Live Music Weekends"]},
"Italian Restaurant":{photos:["https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80","https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80"],taglines:["Authentic Italian Cuisine","Buon Appetito!"],menu:["Pasta Special $12.99","Wine & Dine for 2","Wood-Fired Pizza","Tiramisu Made Daily"]},
"Bakery":{photos:["https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&q=80","https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&q=80"],taglines:["Fresh Baked Daily","Artisan Breads & Pastries"],menu:["Custom Cakes","Fresh Bread Daily","Birthday Specials","Wedding Cakes"]},
"Coffee Shop":{photos:["https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80","https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80"],taglines:["Locally Roasted, Locally Loved","Your Daily Ritual"],menu:["Specialty Lattes","Cold Brew on Tap","Pastries Daily","Free WiFi"]},
"Real Estate":{photos:["https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80","https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80"],taglines:["Your Local Real Estate Expert","Buying or Selling? Call Me!"],menu:["Free Home Valuation","Buyer Representation","Listing Services","Investment Properties"]},
"HVAC":{photos:["https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=800&q=80","https://images.unsplash.com/photo-1566917064245-1c6bff30dbf1?w=800&q=80"],taglines:["24/7 Emergency Service","Heating & Cooling Experts"],menu:["A/C Tune-Up Special","Free Estimates","Emergency Service 24/7","Financing Available"]},
"Auto Repair":{photos:["https://images.unsplash.com/photo-1486006920555-c77dcf18193c?w=800&q=80","https://images.unsplash.com/photo-1593142927747-8c1b758967a6?w=800&q=80"],taglines:["Honest Auto Repair","ASE Certified Mechanics"],menu:["Oil Change Special","Brake Service","AC Repair","Free Estimates"]},
"Dentist":{photos:["https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=800&q=80","https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800&q=80"],taglines:["Accepting New Patients!","Your Smile is Our Priority"],menu:["Cleanings & Exams","Cosmetic Dentistry","Emergency Care","Insurance Accepted"]},
"Gym & Fitness":{photos:["https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80","https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80"],taglines:["Stronger Every Day","Get Fit. Feel Great."],menu:["Free 7-Day Trial","Personal Training","Group Classes","24/7 Access"]},
"Salon & Beauty":{photos:["https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&q=80","https://images.unsplash.com/photo-1562322140-8baeececf3df?w=800&q=80"],taglines:["Look Beautiful. Feel Confident.","Cuts \\u00b7 Color \\u00b7 Style"],menu:["Cut & Color Special","Wedding Hair","Bridal Packages","Walk-Ins Welcome"]},
"Other Service":{photos:["https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80","https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=800&q=80"],taglines:["Quality Service You Can Trust","Locally Owned & Operated"],menu:["Free Consultation","Quality Service","Satisfaction Guaranteed","Local & Trusted"]},
};

let selectedPhotoUrl = null;
let currentIndustryPhotos = [];
let currentPhotoIndex = 0;

const QR_SVG = '<svg width="100%" height="100%" viewBox="0 0 44 44" fill="none"><rect width="44" height="44" fill="white"/><rect x="3" y="3" width="14" height="14" rx="1" fill="#1C1B1A"/><rect x="5" y="5" width="10" height="10" rx=".5" fill="white"/><rect x="7" y="7" width="6" height="6" fill="#1C1B1A"/><rect x="27" y="3" width="14" height="14" rx="1" fill="#1C1B1A"/><rect x="29" y="5" width="10" height="10" rx=".5" fill="white"/><rect x="31" y="7" width="6" height="6" fill="#1C1B1A"/><rect x="3" y="27" width="14" height="14" rx="1" fill="#1C1B1A"/><rect x="5" y="29" width="10" height="10" rx=".5" fill="white"/><rect x="7" y="31" width="6" height="6" fill="#1C1B1A"/><rect x="21" y="21" width="4" height="4" fill="#1C1B1A"/><rect x="27" y="21" width="4" height="4" fill="#1C1B1A"/><rect x="33" y="21" width="4" height="4" fill="#1C1B1A"/><rect x="21" y="27" width="4" height="4" fill="#1C1B1A"/><rect x="33" y="27" width="4" height="4" fill="#1C1B1A"/><rect x="27" y="33" width="4" height="4" fill="#1C1B1A"/><rect x="21" y="39" width="4" height="4" fill="#1C1B1A"/></svg>';

async function onIndustryChange(){
  const ind = document.getElementById('industry').value;
  if(!ind) return;
  const data = INDUSTRIES[ind] || INDUSTRIES['Other Service'];
  const tg = document.getElementById('tagline');
  if(!tg.value) tg.value = data.taglines[0];
  buildMenu(data.menu);
  await loadPhotos(ind, data.photos);
  renderAd();
}

async function loadPhotos(industry, fallback){
  const grid = document.getElementById('imgGrid');
  grid.innerHTML = '<div class="img-loading">Loading photos...</div>';
  let photos = fallback ? [...fallback] : [];
  try {
    const res = await fetch('/api/image-library?industry=' + encodeURIComponent(industry));
    const data = await res.json();
    if(data.images && data.images.length > 0){
      photos = data.images.map(img => img.image_url);
    }
  } catch(e) {
    // use fallback photos
  }
  currentIndustryPhotos = photos;
  if(!photos.length){ grid.innerHTML='<div class="img-loading">No photos yet &mdash; upload your own.</div>'; return; }
  grid.innerHTML='';
  photos.forEach((p,i)=>{
    const url = typeof p==='string' ? p : p.url;
    const div = document.createElement('div');
    div.className = 'img-thumb' + (i===0 ? ' selected' : '');
    div.onclick = ()=>{
      selectedPhotoUrl = url;
      document.querySelectorAll('.img-thumb').forEach(t=>t.classList.remove('selected'));
      div.classList.add('selected');
      renderAd();
    };
    div.innerHTML = '<img src="' + url + '" loading="lazy"><div class="sel-check">&#10003;</div>';
    grid.appendChild(div);
  });
  selectedPhotoUrl = typeof photos[0]==='string' ? photos[0] : photos[0].url;
  currentPhotoIndex = 0;
  document.getElementById('shuffleBtn').disabled = false;
  renderAd();
}

function shufflePhoto(){
  if(!currentIndustryPhotos.length) return;
  currentPhotoIndex = (currentPhotoIndex+1) % currentIndustryPhotos.length;
  const p = currentIndustryPhotos[currentPhotoIndex];
  selectedPhotoUrl = typeof p==='string' ? p : p.url;
  document.querySelectorAll('.img-thumb').forEach((t,i)=>t.classList.toggle('selected', i===currentPhotoIndex));
  renderAd();
}

function handleUpload(input){
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    selectedPhotoUrl = e.target.result;
    const prev = document.getElementById('uploadPreview');
    prev.src = selectedPhotoUrl; prev.style.display = 'block';
    document.querySelectorAll('.img-thumb').forEach(t=>t.classList.remove('selected'));
    renderAd();
  };
  reader.readAsDataURL(file);
}

function buildMenu(items){ const l=document.getElementById('menuList'); l.innerHTML=''; items.forEach(i=>addMenuItem(i)); }
function addMenuItem(val=''){
  const l = document.getElementById('menuList');
  const r = document.createElement('div'); r.className = 'mrow';
  r.innerHTML = '<input type="text" placeholder="e.g. Chicken Biscuit $5.99" value="' + val + '" oninput="renderAd()"><button class="rm-btn" onclick="this.parentElement.remove();renderAd()">&times;</button>';
  l.appendChild(r);
}
function getMenu(){ return Array.from(document.querySelectorAll('.mrow input')).map(i=>i.value.trim()).filter(Boolean); }

function getFormData(){
  return {
    bizName: document.getElementById('bizName').value.trim() || 'Business Name',
    tagline: document.getElementById('tagline').value.trim(),
    phone:   document.getElementById('phone').value.trim(),
    city:    document.getElementById('city').value.trim(),
    address: document.getElementById('address').value.trim(),
    website: document.getElementById('website').value.trim(),
    menu:    getMenu(),
    offer:   document.getElementById('offer').value.trim(),
    color:   document.querySelector('input[name="color"]:checked')?.value || '#D39A42',
    photo:   selectedPhotoUrl || '',
    industry: document.getElementById('industry').value,
  };
}

function parseCoupon(offer){
  if(!offer) return null;
  const parts = offer.split('\\u00b7');
  const main  = parts[0].trim();
  const fine  = parts[1]?.trim() || '1 per visit \\u00b7 with this postcard';
  const m = main.match(/^(\\$[\\d.]+\\s+OFF)\\s+(.+)$/i);
  return m ? {amount:m[1], item:m[2], fine} : {amount:main, item:'', fine};
}

function renderAd(){
  const d = getFormData();
  const canvas  = document.getElementById('adCanvas');
  const empty   = document.getElementById('adEmpty');
  const hero    = document.getElementById('adHero');
  const content = document.getElementById('adContent');
  const ac = d.color;

  canvas.classList.add('visible');
  empty.classList.add('hidden');
  canvas.style.setProperty('--ac', ac);
  hero.style.backgroundImage = d.photo ? "url('" + d.photo + "')" : 'none';

  const menuHTML = d.menu.slice(0,4).map(item => {
    const m = item.match(/^(.+?)\\s{0,2}(\\.{2,}|\\u2014|--)\\s{0,2}(\\$[\\d.]+.*)$/);
    const nm = item.match(/^(.+?)\\s+(\\$[\\d.].*)$/);
    const name  = m ? m[1].trim() : (nm ? nm[1].trim() : item);
    const price = m ? m[3].trim() : (nm ? nm[2].trim() : '');
    return '<div class="ad-menu-item">' +
      '<div class="ad-menu-left">' +
        '<div class="ad-check-badge" style="border-color:' + ac + ';color:' + ac + '">&#10003;</div>' +
        '<div class="ad-item-name">' + name + '</div>' +
      '</div>' +
      (price ? '<div class="ad-item-dots"></div><div class="ad-item-price" style="color:' + ac + '">' + price + '</div>' : '') +
    '</div>';
  }).join('');

  const cp = parseCoupon(d.offer);
  const couponHTML = cp ? (
    '<div class="ad-coupon">' +
      '<div class="ad-coupon-main">' +
        '<div class="ad-coupon-amount">' + cp.amount + '</div>' +
        '<span class="ad-coupon-item-name" style="color:' + ac + '">' + (cp.item || 'Any Item') + '</span>' +
        '<div class="ad-coupon-fine">' + cp.fine + '</div>' +
      '</div>' +
      '<div class="ad-coupon-right"><div class="ad-coupon-badge">WITH<br>POSTCARD</div></div>' +
    '</div>'
  ) : '';

  const addr = [d.address, d.city].filter(Boolean).join(', ');

  content.innerHTML =
    '<div class="ad-header">' +
      '<div class="ad-logo-wrap">&#10022;</div>' +
      '<div class="ad-title-block">' +
        '<div class="ad-biz-name">' + d.bizName + '</div>' +
        (d.tagline ? '<span class="ad-tagline-script">' + d.tagline + '</span>' : '') +
      '</div>' +
    '</div>' +
    '<div class="ad-middle"></div>' +
    '<div class="ad-bottom">' +
      (d.menu.length ? '<div class="ad-menu">' + menuHTML + '</div>' : '') +
      couponHTML +
      '<div class="ad-footer">' +
        '<div class="ad-footer-left">' +
          '<div class="ad-phone-icon">&#9742;</div>' +
          '<div>' +
            '<div class="ad-phone-num">' + (d.phone || '&mdash;') + '</div>' +
            '<div class="ad-address-txt">' + addr + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ad-qr-wrap">' +
          '<div class="ad-qr-box">' + QR_SVG + '</div>' +
          '<div class="ad-qr-scan">Scan</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.getElementById('useBtn').disabled = false;
}

async function useAd(){
  const d = getFormData();
  const btn = document.getElementById('useBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    await fetch('/api/ad-generator-v6/save', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        adVersion: 'v6',
        templateStyle: 'mr-biscuits-rustic',
        photoUrl:    d.photo,
        bizName:     d.bizName,
        tagline:     d.tagline,
        phone:       d.phone,
        address:     d.address,
        city:        d.city,
        menu:        d.menu,
        offer:       d.offer,
        accentColor: d.color,
      }),
    });
    btn.textContent = '\\u2713 Ad Saved!';
    btn.style.background = '#1a5c3a';
    btn.style.borderColor = '#1a5c3a';
    setTimeout(()=>{ btn.disabled=false; btn.textContent='\\u2713 Use This Ad'; btn.style.background=''; btn.style.borderColor=''; }, 2500);
  } catch(e) {
    btn.disabled = false;
    btn.textContent = '\\u2713 Use This Ad';
    alert('Save failed. Please try again.');
  }
}

// Init
addMenuItem(''); addMenuItem(''); addMenuItem('');
</script>
</body>
</html>`;

export default router;
