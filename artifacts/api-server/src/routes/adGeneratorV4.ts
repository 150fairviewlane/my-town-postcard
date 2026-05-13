import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, outreachLeadsTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/ad-generator-v4/save", async (req, res): Promise<void> => {
  const { leadId, adHtml, photoUrl } = req.body ?? {};
  if (!adHtml) {
    res.status(400).json({ error: "adHtml is required" });
    return;
  }
  if (leadId) {
    const id = Number(leadId);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid leadId" });
      return;
    }
    const [row] = await db.select().from(outreachLeadsTable).where(eq(outreachLeadsTable.id, id));
    if (!row) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    const noteVal = `[Ad v4 · ${new Date().toLocaleDateString()}] photo: ${photoUrl ?? ""}`;
    await db
      .update(outreachLeadsTable)
      .set({ notes: noteVal })
      .where(eq(outreachLeadsTable.id, id));
  }
  res.json({ ok: true });
});

router.get("/ad-generator-v4", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(AD_GENERATOR_V4_HTML);
});

const AD_GENERATOR_V4_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Town Postcard — Ad Generator v4</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Oswald:wght@400;500;600;700&family=Dancing+Script:wght@600;700&family=DM+Sans:wght@300;400;500;600;700&family=Crimson+Pro:ital,wght@0,400;0,600;1,400;1,600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
:root{
  --burg:#7C1C2E;--burg-dark:#5a1220;--burg-pale:#f9eaed;
  --ink:#111827;--ink-mid:#374151;--ink-light:#6B7280;
  --surface:#F7F5F2;--card:#fff;--border:#E5E0D8;
  --green:#1a5c3a;--red:#c0392b;
}
body{font-family:'DM Sans',sans-serif;background:var(--surface);min-height:100vh;color:var(--ink)}

/* HEADER */
.hdr{background:var(--ink);padding:14px 32px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid var(--burg)}
.brand{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#fff;letter-spacing:.08em}
.brand span{color:#C8A882}
.hdr-badge{background:var(--burg);color:#fff;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:4px 12px;border-radius:20px}

/* LAYOUT */
.layout{display:grid;grid-template-columns:440px 1fr;height:calc(100vh - 55px)}

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
.field input,.field select,.field textarea{width:100%;padding:8px 11px;border:1.5px solid var(--border);border-radius:7px;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.field input:focus,.field select:focus,.field textarea:focus{border-color:var(--burg);background:#fff}
.field textarea{resize:vertical;min-height:60px;line-height:1.5}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:9px}

/* MENU BUILDER */
.menu-list{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}
.mrow{display:flex;gap:6px;align-items:center}
.mrow input{flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:'DM Sans',sans-serif;font-size:12.5px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.mrow input:focus{border-color:var(--burg);background:#fff}
.rm-btn{width:26px;height:26px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-light);cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;line-height:1}
.rm-btn:hover{border-color:var(--red);color:var(--red);background:#fef2f2}
.add-btn{font-size:11px;font-weight:600;color:var(--burg);background:none;border:1.5px dashed var(--burg);border-radius:6px;padding:6px 12px;cursor:pointer;width:100%;transition:all .2s;font-family:'DM Sans',sans-serif}
.add-btn:hover{background:var(--burg-pale)}

/* IMAGE PICKER */
.img-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px}
.img-thumb{position:relative;aspect-ratio:4/3;border-radius:6px;overflow:hidden;cursor:pointer;border:2.5px solid transparent;transition:all .2s}
.img-thumb:hover{transform:scale(1.03)}
.img-thumb.selected{border-color:var(--burg);box-shadow:0 0 0 2px var(--burg)}
.img-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.img-thumb .sel-check{display:none;position:absolute;top:4px;right:4px;background:var(--burg);color:#fff;border-radius:50%;width:18px;height:18px;font-size:10px;font-weight:700;align-items:center;justify-content:center}
.img-thumb.selected .sel-check{display:flex}
.img-loading{grid-column:1/-1;text-align:center;padding:20px;font-size:12px;color:var(--ink-light)}
.img-none{grid-column:1/-1;text-align:center;padding:20px;font-size:12px;color:var(--ink-light);font-style:italic}

/* STYLE PICKER */
.style-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.scard{position:relative}
.scard input[type=radio]{position:absolute;opacity:0;width:0;height:0}
.scard label{display:flex;align-items:center;gap:10px;padding:10px 12px;border:2px solid var(--border);border-radius:9px;cursor:pointer;background:var(--surface);transition:all .2s;text-transform:none;letter-spacing:normal}
.scard label:hover{border-color:#bbb;background:#f0ece6}
.scard input:checked+label{border-color:var(--burg);background:var(--burg-pale);box-shadow:0 0 0 1px var(--burg)}
.swatch{width:34px;height:34px;border-radius:7px;flex-shrink:0}
.sinfo .sname{font-size:12px;font-weight:700;color:var(--ink)}
.sinfo .sdesc{font-size:10px;color:var(--ink-light);line-height:1.3;margin-top:1px}
.selbadge{display:none;position:absolute;top:5px;right:5px;background:var(--burg);color:#fff;font-size:9px;font-weight:700;width:15px;height:15px;border-radius:50%;align-items:center;justify-content:center;pointer-events:none}
.scard input:checked~.selbadge{display:flex}

/* COLOR CHIPS */
.crow{display:flex;gap:7px;flex-wrap:wrap;margin-top:2px}
.chip{position:relative}
.chip input[type=radio]{position:absolute;opacity:0;width:0;height:0}
.chip label{width:28px;height:28px;border-radius:50%;display:block;cursor:pointer;border:3px solid transparent;transition:transform .2s,border-color .2s;text-transform:none}
.chip input:checked+label{border-color:var(--ink);transform:scale(1.15)}
.chip label:hover{transform:scale(1.1)}

/* UPLOAD ZONE */
.upload-zone{border:2px dashed var(--border);border-radius:9px;padding:12px;text-align:center;cursor:pointer;transition:all .2s;background:var(--surface);position:relative;overflow:hidden}
.upload-zone:hover{border-color:var(--burg);background:var(--burg-pale)}
.upload-zone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.upload-icon{font-size:20px;margin-bottom:3px}
.upload-txt{font-size:11px;font-weight:600;color:var(--ink-mid)}
.upload-sub{font-size:9.5px;color:var(--ink-light);margin-top:1px}
.upload-preview{width:100%;height:60px;object-fit:cover;border-radius:5px;margin-top:6px;display:none}

/* GEN BUTTON */
.gen-btn{width:100%;padding:13px;background:var(--burg);color:#fff;border:none;border-radius:9px;font-family:'Bebas Neue',sans-serif;font-size:19px;letter-spacing:.12em;cursor:pointer;transition:background .2s,transform .15s;margin-top:6px;display:flex;align-items:center;justify-content:center;gap:9px}
.gen-btn:hover:not(:disabled){background:var(--burg-dark)}
.gen-btn:active:not(:disabled){transform:scale(.98)}
.gen-btn:disabled{background:#bbb;cursor:not-allowed}

/* PREVIEW PANEL */
.ppanel{background:#E8E4DE;padding:32px;display:flex;flex-direction:column;align-items:center;gap:18px;overflow-y:auto}
.ptoolbar{width:100%;max-width:500px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.plabel{font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:.1em;color:var(--ink-mid)}
.tactions{display:flex;gap:7px;flex-wrap:wrap}
.tbtn{padding:6px 13px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid var(--border);background:var(--card);color:var(--ink-mid);transition:all .2s;font-family:'DM Sans',sans-serif}
.tbtn:hover:not(:disabled){border-color:var(--burg);color:var(--burg)}
.tbtn.primary{background:var(--green);border-color:var(--green);color:#fff}
.tbtn.primary:hover:not(:disabled){background:#144d30}
.tbtn:disabled{opacity:.4;cursor:not-allowed}

/* AD CANVAS — 4:5 ratio */
.ad-canvas-wrap{width:100%;max-width:500px;position:relative}
#adCanvas{
width:100%;
aspect-ratio:4/5;
position:relative;
border-radius:10px;
overflow:hidden;
box-shadow:0 12px 50px rgba(0,0,0,.22);
display:none;
background:#111;
}
#adCanvas.visible{display:block}

.empty-state{
width:100%;max-width:500px;
aspect-ratio:4/5;
background:#1a1a1a;
border-radius:10px;
display:flex;flex-direction:column;align-items:center;justify-content:center;
gap:14px;text-align:center;padding:36px;
box-shadow:0 12px 50px rgba(0,0,0,.22);
}
.empty-state.hidden{display:none}
.ei{font-size:44px;opacity:.28}
.et{font-family:'Crimson Pro',serif;font-size:19px;font-style:italic;color:rgba(255,255,255,.4)}
.es{font-size:11.5px;color:rgba(255,255,255,.28);line-height:1.6}

/* THE 6 AD TEMPLATES */
.ad-bg{position:absolute;inset:0;background-size:cover;background-position:center;z-index:0}

/* TEMPLATE 1: RUSTIC LAYERED */
.tpl-rustic{position:relative;width:100%;height:100%;overflow:hidden}
.tpl-rustic .ad-bg{filter:brightness(.75) saturate(1.15)}
.tpl-rustic .ad-wash{position:absolute;inset:0;z-index:1;
background:linear-gradient(170deg,rgba(232,210,168,.38) 0%,rgba(180,120,40,.12) 50%,rgba(20,10,2,.0) 100%)}
.tpl-rustic .brush-top{position:absolute;top:-30px;left:-40px;width:280px;height:160px;z-index:2;
background:rgba(120,55,10,.72);border-radius:40% 60% 55% 45% / 45% 55% 65% 35%;
transform:rotate(-8deg);filter:blur(2px)}
.tpl-rustic .brush-bot{position:absolute;bottom:-20px;left:-10px;right:-10px;height:54%;z-index:2;
background:rgba(15,8,2,.93);clip-path:polygon(0 18%,100% 0%,100% 100%,0 100%)}
.tpl-rustic .starburst{position:absolute;top:18px;left:16px;z-index:3;width:60px;height:60px;overflow:visible}
.tpl-rustic .starburst::before,.tpl-rustic .starburst::after{
content:'';position:absolute;top:50%;left:50%;width:120px;height:1px;
background:rgba(255,190,60,.35);transform-origin:left center}
.tpl-rustic .starburst::before{transform:rotate(15deg) translateX(-60px)}
.tpl-rustic .starburst::after{transform:rotate(-15deg) translateX(-60px)}
.tpl-rustic .ad-ribbon{position:absolute;top:0;left:20px;z-index:10;
width:56px;background:linear-gradient(to bottom,#B8590A,#8B3A05);
padding:10px 8px 14px;text-align:center;
clip-path:polygon(0 0,100% 0,100% 85%,50% 100%,0 85%)}
.tpl-rustic .ad-ribbon-txt{font-family:'Bebas Neue',sans-serif;font-size:9px;letter-spacing:.12em;color:rgba(255,220,150,.9)}
.tpl-rustic .ad-ribbon-emoji{font-size:18px;display:block;margin-bottom:2px}
.tpl-rustic .ad-name-block{position:absolute;top:14px;right:14px;z-index:10;text-align:right;max-width:62%}
.tpl-rustic .ad-name-line1{font-family:'Bebas Neue',sans-serif;font-size:clamp(26px,5.5vw,44px);
letter-spacing:.05em;color:#fff;line-height:1;
text-shadow:2px 2px 0 rgba(0,0,0,.5),0 0 20px rgba(0,0,0,.4)}
.tpl-rustic .ad-name-script{font-family:'Dancing Script',cursive;font-size:clamp(38px,8vw,64px);
color:var(--accent-color,#D4540A);line-height:.85;
text-shadow:2px 3px 8px rgba(0,0,0,.5);display:block;
transform:rotate(-2deg);transform-origin:right center}
.tpl-rustic .ad-sparks{display:inline-block;font-size:11px;letter-spacing:2px;
color:rgba(255,180,60,.7);vertical-align:middle;margin-right:4px}
.tpl-rustic .ad-tagline{position:absolute;left:18px;top:42%;z-index:10;
font-family:'Dancing Script',cursive;font-size:clamp(13px,2.8vw,19px);
color:rgba(255,225,160,.92);transform:rotate(-1.5deg);
text-shadow:1px 1px 4px rgba(0,0,0,.6);max-width:55%}
.tpl-rustic .ad-menu{position:absolute;left:18px;bottom:110px;z-index:10;
display:flex;flex-direction:column;gap:5px}
.tpl-rustic .ad-menu-item{display:flex;align-items:center;gap:8px;
font-family:'Oswald',sans-serif;font-size:clamp(11px,2.2vw,14px);font-weight:400;
letter-spacing:.04em;text-transform:uppercase;color:rgba(255,255,255,.9)}
.tpl-rustic .ad-check-circle{width:18px;height:18px;border-radius:50%;
border:2px solid var(--accent-color,#D4540A);
display:flex;align-items:center;justify-content:center;
font-size:9px;color:var(--accent-color,#D4540A);flex-shrink:0;font-weight:700}
.tpl-rustic .ad-coupon{position:absolute;bottom:58px;right:14px;z-index:10;
border:2.5px dashed rgba(255,180,60,.6);border-radius:5px;
padding:8px 12px;background:rgba(0,0,0,.55);text-align:center;min-width:110px}
.tpl-rustic .ad-coupon-amount{font-family:'Bebas Neue',sans-serif;font-size:clamp(22px,4.5vw,34px);
letter-spacing:.02em;color:#fff;line-height:1}
.tpl-rustic .ad-coupon-item{font-family:'Dancing Script',cursive;font-size:clamp(13px,2.8vw,18px);
color:var(--accent-color,#D4540A);line-height:1}
.tpl-rustic .ad-coupon-fine{font-size:9px;color:rgba(255,255,255,.45);margin-top:3px;font-family:'DM Sans',sans-serif}
.tpl-rustic .ad-footer{position:absolute;bottom:0;left:0;right:0;z-index:10;
background:rgba(10,5,2,.88);padding:10px 16px;
display:flex;align-items:center;justify-content:space-between;gap:8px}
.tpl-rustic .ad-phone-wrap{display:flex;align-items:center;gap:8px}
.tpl-rustic .ad-phone-icon{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--accent-color,#D4540A);display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0}
.tpl-rustic .ad-phone{font-family:'Bebas Neue',sans-serif;font-size:clamp(18px,3.8vw,26px);letter-spacing:.06em;color:#fff;line-height:1}
.tpl-rustic .ad-address{font-size:clamp(8px,1.6vw,10px);color:rgba(255,255,255,.45);margin-top:1px}
.tpl-rustic .ad-qr{display:flex;flex-direction:column;align-items:center;gap:2px}
.tpl-rustic .ad-qr-box{width:40px;height:40px;background:#fff;border-radius:3px;padding:3px}
.tpl-rustic .ad-qr-label{font-size:8px;color:rgba(255,255,255,.3);letter-spacing:.1em;text-transform:uppercase}

/* TEMPLATE 2: DARK CINEMATIC */
.tpl-dark{position:relative;width:100%;height:100%;overflow:hidden}
.tpl-dark .ad-bg{filter:brightness(.45) saturate(.85)}
.tpl-dark .ad-vignette{position:absolute;inset:0;z-index:1;
background:radial-gradient(ellipse at 50% 40%,transparent 20%,rgba(0,0,0,.65) 100%),
linear-gradient(to bottom,rgba(0,0,0,.5) 0%,rgba(0,0,0,.0) 35%,rgba(0,0,0,.0) 55%,rgba(0,0,0,.96) 100%)}
.tpl-dark .ad-glow{position:absolute;top:-60px;right:-40px;width:280px;height:280px;z-index:2;
background:radial-gradient(circle,rgba(180,20,30,.45) 0%,transparent 70%)}
.tpl-dark .ad-name-block{position:absolute;top:20px;left:18px;z-index:10}
.tpl-dark .ad-name-line1{font-family:'Bebas Neue',sans-serif;font-size:clamp(40px,8.5vw,68px);
letter-spacing:.02em;color:#fff;line-height:.88;
text-shadow:0 4px 24px rgba(0,0,0,.6)}
.tpl-dark .ad-name-line2{font-family:'Bebas Neue',sans-serif;font-size:clamp(28px,6vw,50px);
letter-spacing:.08em;color:var(--accent-color,#CC2222);line-height:.9;display:block}
.tpl-dark .ad-vline{position:absolute;top:0;right:110px;width:1px;height:65%;z-index:10;
background:linear-gradient(to bottom,transparent,rgba(255,255,255,.2),transparent)}
.tpl-dark .ad-coupon{position:absolute;top:22px;right:14px;z-index:10;
width:90px;text-align:center;padding:10px 8px;
background:rgba(255,255,255,.07);
border:1px solid rgba(255,255,255,.18);border-radius:4px}
.tpl-dark .ad-coupon-amount{font-family:'Bebas Neue',sans-serif;font-size:clamp(26px,5.5vw,40px);
color:#fff;line-height:1;letter-spacing:.02em}
.tpl-dark .ad-coupon-off{font-family:'Bebas Neue',sans-serif;font-size:clamp(14px,3vw,22px);
color:var(--accent-color,#CC2222);display:block;letter-spacing:.06em}
.tpl-dark .ad-coupon-item{font-family:'Crimson Pro',serif;font-style:italic;
font-size:clamp(10px,2vw,13px);color:rgba(255,255,255,.7);margin-top:3px;line-height:1.2}
.tpl-dark .ad-coupon-fine{font-size:8px;color:rgba(255,255,255,.3);margin-top:4px;line-height:1.3}
.tpl-dark .ad-tagline{position:absolute;left:18px;top:46%;z-index:10;
font-family:'DM Sans',sans-serif;font-size:clamp(8px,1.6vw,11px);font-weight:600;
letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.45)}
.tpl-dark .ad-menu{position:absolute;left:18px;bottom:80px;z-index:10;display:flex;flex-direction:column;gap:4px}
.tpl-dark .ad-menu-item{display:flex;align-items:center;gap:8px;
font-family:'DM Sans',sans-serif;font-size:clamp(11px,2.2vw,13px);
color:rgba(255,255,255,.75);font-weight:300;letter-spacing:.02em}
.tpl-dark .ad-menu-dot{width:3px;height:3px;border-radius:50%;background:var(--accent-color,#CC2222);flex-shrink:0}
.tpl-dark .ad-footer{position:absolute;bottom:0;left:0;right:0;z-index:10;
background:rgba(0,0,0,.85);border-top:2px solid var(--accent-color,#CC2222);
padding:10px 16px;display:flex;align-items:center;justify-content:space-between}
.tpl-dark .ad-phone{font-family:'Bebas Neue',sans-serif;font-size:clamp(20px,4.2vw,32px);letter-spacing:.06em;color:#fff;line-height:1}
.tpl-dark .ad-address{font-size:clamp(8px,1.6vw,10px);color:rgba(255,255,255,.35);margin-top:1px}
.tpl-dark .ad-qr{display:flex;flex-direction:column;align-items:center;gap:2px}
.tpl-dark .ad-qr-box{width:40px;height:40px;background:#fff;border-radius:3px;padding:3px}
.tpl-dark .ad-qr-label{font-size:8px;color:rgba(255,255,255,.3);letter-spacing:.1em;text-transform:uppercase}

/* TEMPLATE 3: EDITORIAL MAGAZINE */
.tpl-bold{position:relative;width:100%;height:100%;overflow:hidden;background:#fff}
.tpl-bold .ad-bg{height:62%;bottom:auto;filter:brightness(.8) saturate(1.1)}
.tpl-bold .ad-panel{position:absolute;bottom:0;left:0;right:0;height:50%;z-index:5;
background:#fff;clip-path:polygon(0 18%,100% 0,100% 100%,0 100%)}
.tpl-bold .ad-stripe{position:absolute;top:0;left:0;width:5px;height:100%;z-index:20;
background:var(--accent-color,#E63946)}
.tpl-bold .ad-name-block{position:absolute;bottom:185px;left:22px;right:18px;z-index:10}
.tpl-bold .ad-name-line1{font-family:'Playfair Display',serif;font-weight:900;font-style:italic;
font-size:clamp(26px,5.5vw,44px);color:#0f0f0f;line-height:.92;letter-spacing:-.02em}
.tpl-bold .ad-name-line2{font-family:'Playfair Display',serif;font-weight:700;
font-size:clamp(18px,3.8vw,30px);color:var(--accent-color,#E63946);display:block;line-height:1}
.tpl-bold .ad-tagline{font-family:'DM Sans',sans-serif;font-size:clamp(8px,1.6vw,10px);
font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#888;margin-top:5px}
.tpl-bold .ad-menu{position:absolute;bottom:110px;left:22px;right:18px;z-index:10;
display:grid;grid-template-columns:1fr 1fr;gap:3px 12px}
.tpl-bold .ad-menu-item{font-family:'DM Sans',sans-serif;font-size:clamp(10px,2vw,12px);
color:#333;font-weight:500;border-bottom:1px solid #eee;padding-bottom:3px;
display:flex;justify-content:space-between;gap:4px}
.tpl-bold .ad-coupon{position:absolute;bottom:56px;left:22px;z-index:10;
background:var(--accent-color,#E63946);padding:6px 14px;display:inline-block}
.tpl-bold .ad-coupon-text{font-family:'Bebas Neue',sans-serif;
font-size:clamp(14px,3vw,22px);letter-spacing:.06em;color:#fff}
.tpl-bold .ad-coupon-fine{font-size:8.5px;color:rgba(255,255,255,.7);margin-top:1px}
.tpl-bold .ad-footer{position:absolute;bottom:0;left:0;right:0;z-index:10;
background:#0f0f0f;padding:9px 16px;display:flex;align-items:center;justify-content:space-between}
.tpl-bold .ad-phone{font-family:'Bebas Neue',sans-serif;font-size:clamp(18px,3.8vw,28px);letter-spacing:.06em;color:#fff;line-height:1}
.tpl-bold .ad-address{font-size:clamp(8px,1.6vw,10px);color:rgba(255,255,255,.4);margin-top:1px}
.tpl-bold .ad-qr{display:flex;flex-direction:column;align-items:center;gap:2px}
.tpl-bold .ad-qr-box{width:38px;height:38px;background:#fff;border-radius:2px;padding:3px}
.tpl-bold .ad-qr-label{font-size:8px;color:rgba(255,255,255,.35);letter-spacing:.1em;text-transform:uppercase}

/* TEMPLATE 4: LUXURY CENTERED */
.tpl-luxury{position:relative;width:100%;height:100%;overflow:hidden}
.tpl-luxury .ad-bg{filter:brightness(.32) saturate(.6)}
.tpl-luxury .ad-overlay{position:absolute;inset:0;z-index:1;
background:linear-gradient(to bottom,rgba(5,4,2,.2) 0%,rgba(5,4,2,.6) 100%)}
.tpl-luxury .ad-frame{position:absolute;inset:10px;z-index:2;
border:1px solid rgba(212,175,55,.4);pointer-events:none}
.tpl-luxury .ad-frame-inner{position:absolute;inset:16px;z-index:2;
border:0.5px solid rgba(212,175,55,.18);pointer-events:none}
.tpl-luxury .ad-corner{position:absolute;z-index:3;width:16px;height:16px;pointer-events:none}
.tpl-luxury .ad-corner-tl{top:8px;left:8px;border-top:2px solid rgba(212,175,55,.6);border-left:2px solid rgba(212,175,55,.6)}
.tpl-luxury .ad-corner-tr{top:8px;right:8px;border-top:2px solid rgba(212,175,55,.6);border-right:2px solid rgba(212,175,55,.6)}
.tpl-luxury .ad-corner-bl{bottom:8px;left:8px;border-bottom:2px solid rgba(212,175,55,.6);border-left:2px solid rgba(212,175,55,.6)}
.tpl-luxury .ad-corner-br{bottom:8px;right:8px;border-bottom:2px solid rgba(212,175,55,.6);border-right:2px solid rgba(212,175,55,.6)}
.tpl-luxury .ad-content{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px 28px 24px;text-align:center;gap:0}
.tpl-luxury .ad-ornament{font-size:11px;letter-spacing:.5em;color:rgba(212,175,55,.65);margin-bottom:10px}
.tpl-luxury .ad-name{font-family:'Playfair Display',serif;font-weight:700;
font-size:clamp(22px,4.8vw,38px);color:#fff;letter-spacing:.06em;line-height:1.05;
text-shadow:0 2px 16px rgba(0,0,0,.6)}
.tpl-luxury .ad-tagline{font-family:'Crimson Pro',serif;font-style:italic;
font-size:clamp(12px,2.5vw,17px);color:rgba(212,175,55,.85);margin-top:6px;margin-bottom:10px}
.tpl-luxury .ad-rule{width:80px;height:1px;
background:linear-gradient(90deg,transparent,rgba(212,175,55,.7),transparent);margin:0 auto 12px}
.tpl-luxury .ad-menu{display:flex;flex-direction:column;gap:5px;margin-bottom:10px;width:100%;max-width:240px}
.tpl-luxury .ad-menu-item{font-family:'Crimson Pro',serif;font-size:clamp(11px,2.2vw,14px);
color:rgba(255,255,255,.65);letter-spacing:.05em;text-align:center;
border-bottom:1px solid rgba(212,175,55,.12);padding-bottom:4px}
.tpl-luxury .ad-coupon{border:1px solid rgba(212,175,55,.45);border-radius:2px;
padding:7px 18px;margin-bottom:12px;background:rgba(212,175,55,.06);display:inline-block}
.tpl-luxury .ad-coupon-text{font-family:'Playfair Display',serif;
font-size:clamp(14px,2.8vw,20px);color:#fff;letter-spacing:.06em}
.tpl-luxury .ad-coupon-fine{font-size:9px;color:rgba(255,255,255,.38);margin-top:2px}
.tpl-luxury .ad-footer{position:absolute;bottom:14px;left:28px;right:28px;z-index:10;
display:flex;align-items:center;justify-content:space-between;
border-top:1px solid rgba(212,175,55,.2);padding-top:8px}
.tpl-luxury .ad-phone{font-family:'Playfair Display',serif;
font-size:clamp(14px,3vw,22px);color:rgba(212,175,55,.9);line-height:1;letter-spacing:.04em}
.tpl-luxury .ad-address{font-size:clamp(8px,1.6vw,10px);color:rgba(255,255,255,.35);margin-top:2px}
.tpl-luxury .ad-qr{display:flex;flex-direction:column;align-items:center;gap:2px}
.tpl-luxury .ad-qr-box{width:40px;height:40px;background:#fff;border-radius:2px;padding:3px}
.tpl-luxury .ad-qr-label{font-size:8px;color:rgba(212,175,55,.4);letter-spacing:.1em;text-transform:uppercase}

/* TEMPLATE 5: RETRO POSTER */
.tpl-bright{position:relative;width:100%;height:100%;overflow:hidden}
.tpl-bright .ad-bg{filter:brightness(.6) saturate(1.25)}
.tpl-bright .ad-overlay{position:absolute;inset:0;z-index:1;
background:linear-gradient(to bottom,rgba(0,0,0,.15) 0%,rgba(0,0,0,.0) 30%,rgba(0,0,0,.8) 100%)}
.tpl-bright .ad-banner{position:absolute;top:0;left:0;right:0;height:72px;z-index:5;
background:var(--accent-color,#FF6B35);
clip-path:polygon(0 0,100% 0,100% 78%,0 100%)}
.tpl-bright .ad-banner-name{position:absolute;top:8px;left:16px;z-index:10;
font-family:'Oswald',sans-serif;font-weight:700;font-size:clamp(20px,4.2vw,32px);
letter-spacing:.06em;text-transform:uppercase;color:#fff;
text-shadow:1px 2px 6px rgba(0,0,0,.35);line-height:1}
.tpl-bright .ad-banner-tag{position:absolute;top:36px;left:18px;z-index:10;
font-family:'Dancing Script',cursive;font-size:clamp(13px,2.8vw,18px);
color:rgba(255,255,255,.85)}
.tpl-bright .ad-coupon{position:absolute;top:44%;left:0;right:0;z-index:8;
background:rgba(0,0,0,.82);padding:10px 18px;
clip-path:polygon(0 6px,20px 0,100% 4px,100% calc(100% - 4px),calc(100% - 20px) 100%,0 calc(100% - 6px));
display:flex;align-items:center;justify-content:space-between}
.tpl-bright .ad-coupon-left{}
.tpl-bright .ad-coupon-amount{font-family:'Bebas Neue',sans-serif;
font-size:clamp(28px,5.8vw,44px);color:#fff;line-height:1;letter-spacing:.02em}
.tpl-bright .ad-coupon-item{font-family:'Dancing Script',cursive;
font-size:clamp(14px,2.8vw,19px);color:var(--accent-color,#FF6B35);line-height:1}
.tpl-bright .ad-coupon-fine{font-size:8.5px;color:rgba(255,255,255,.4);margin-top:2px}
.tpl-bright .ad-coupon-right{text-align:right}
.tpl-bright .ad-coupon-badge{background:var(--accent-color,#FF6B35);color:#fff;
font-family:'Oswald',sans-serif;font-size:clamp(9px,1.8vw,12px);font-weight:600;
letter-spacing:.1em;text-transform:uppercase;padding:4px 10px;border-radius:20px;display:inline-block}
.tpl-bright .ad-menu{position:absolute;right:14px;bottom:80px;z-index:10;
display:flex;flex-direction:column;align-items:flex-end;gap:5px}
.tpl-bright .ad-menu-item{background:rgba(0,0,0,.7);color:#fff;
font-family:'DM Sans',sans-serif;font-size:clamp(10px,2vw,12px);font-weight:600;
padding:4px 12px;border-radius:20px;border-left:3px solid var(--accent-color,#FF6B35);
white-space:nowrap}
.tpl-bright .ad-footer{position:absolute;bottom:0;left:0;right:0;z-index:10;
background:rgba(0,0,0,.85);padding:9px 16px;
display:flex;align-items:center;justify-content:space-between}
.tpl-bright .ad-phone{font-family:'Bebas Neue',sans-serif;font-size:clamp(18px,3.8vw,28px);letter-spacing:.06em;color:#fff;line-height:1}
.tpl-bright .ad-address{font-size:clamp(8px,1.6vw,10px);color:rgba(255,255,255,.4);margin-top:1px}
.tpl-bright .ad-qr{display:flex;flex-direction:column;align-items:center;gap:2px}
.tpl-bright .ad-qr-box{width:40px;height:40px;background:#fff;border-radius:3px;padding:3px}
.tpl-bright .ad-qr-label{font-size:8px;color:rgba(255,255,255,.3);letter-spacing:.1em;text-transform:uppercase}

/* TEMPLATE 6: NEON NIGHT */
.tpl-clean{position:relative;width:100%;height:100%;overflow:hidden}
.tpl-clean .ad-bg{filter:brightness(.28) saturate(.5)}
.tpl-clean .ad-overlay{position:absolute;inset:0;z-index:1;
background:linear-gradient(135deg,rgba(0,120,200,.18) 0%,transparent 60%)}
.tpl-clean .ad-neon-bar{position:absolute;left:0;top:0;bottom:0;width:4px;z-index:5;
background:var(--accent-color,#0088FF);
box-shadow:0 0 12px 3px var(--accent-color,#0088FF),0 0 30px 6px var(--accent-color,#0088FF)}
.tpl-clean .ad-name-block{position:absolute;top:22px;left:20px;right:16px;z-index:10}
.tpl-clean .ad-name-line1{font-family:'Playfair Display',serif;font-weight:900;font-style:italic;
font-size:clamp(30px,6.5vw,52px);color:#fff;line-height:.92;letter-spacing:-.01em;
text-shadow:0 0 20px var(--accent-color,#0088FF),0 0 40px rgba(0,120,200,.4)}
.tpl-clean .ad-name-line2{font-family:'Playfair Display',serif;font-weight:700;
font-size:clamp(20px,4.5vw,36px);color:var(--accent-color,#0088FF);display:block;line-height:.95;
text-shadow:0 0 16px var(--accent-color,#0088FF)}
.tpl-clean .ad-tagline{font-family:'DM Sans',sans-serif;font-size:clamp(8px,1.6vw,10px);
font-weight:600;letter-spacing:.24em;text-transform:uppercase;
color:rgba(255,255,255,.4);margin-top:8px}
.tpl-clean .ad-menu{position:absolute;top:46%;left:18px;right:16px;z-index:10;
display:flex;flex-wrap:wrap;gap:5px}
.tpl-clean .ad-menu-item{font-family:'DM Sans',sans-serif;font-size:clamp(9px,1.8vw,11px);
font-weight:600;color:#fff;
border:1px solid rgba(255,255,255,.18);border-radius:20px;
padding:3px 10px;background:rgba(255,255,255,.05)}
.tpl-clean .ad-coupon{position:absolute;bottom:72px;left:18px;right:18px;z-index:10;
border:1.5px solid var(--accent-color,#0088FF);border-radius:4px;
padding:9px 16px;
background:rgba(0,0,0,.5);
box-shadow:0 0 12px rgba(0,120,200,.25),inset 0 0 12px rgba(0,120,200,.08);
display:flex;align-items:center;justify-content:space-between;gap:8px}
.tpl-clean .ad-coupon-text{font-family:'Bebas Neue',sans-serif;
font-size:clamp(20px,4.2vw,32px);letter-spacing:.04em;
color:#fff;text-shadow:0 0 10px var(--accent-color,#0088FF)}
.tpl-clean .ad-coupon-detail{text-align:right}
.tpl-clean .ad-coupon-item{font-family:'Crimson Pro',serif;font-style:italic;
font-size:clamp(12px,2.5vw,16px);color:var(--accent-color,#0088FF)}
.tpl-clean .ad-coupon-fine{font-size:8.5px;color:rgba(255,255,255,.3);margin-top:2px}
.tpl-clean .ad-footer{position:absolute;bottom:0;left:0;right:0;z-index:10;
background:rgba(0,0,0,.9);border-top:1px solid var(--accent-color,#0088FF);
padding:9px 16px;display:flex;align-items:center;justify-content:space-between}
.tpl-clean .ad-phone{font-family:'Bebas Neue',sans-serif;font-size:clamp(18px,3.8vw,28px);
letter-spacing:.06em;color:#fff;line-height:1;
text-shadow:0 0 10px var(--accent-color,#0088FF)}
.tpl-clean .ad-address{font-size:clamp(8px,1.6vw,10px);color:rgba(255,255,255,.35);margin-top:1px}
.tpl-clean .ad-qr{display:flex;flex-direction:column;align-items:center;gap:2px}
.tpl-clean .ad-qr-box{width:38px;height:38px;background:#fff;border-radius:3px;padding:3px}
.tpl-clean .ad-qr-label{font-size:8px;color:rgba(255,255,255,.3);letter-spacing:.1em;text-transform:uppercase}

/* AI UPGRADE BUTTON */
.ai-btn{width:100%;padding:14px;background:linear-gradient(135deg,#1a1a2e,#2d1b4e);color:#fff;border:none;border-radius:9px;font-family:'Bebas Neue',sans-serif;font-size:19px;letter-spacing:.12em;cursor:pointer;transition:all .2s;margin-top:8px;display:flex;align-items:center;justify-content:center;gap:10px;position:relative;overflow:hidden}
.ai-btn::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(120,80,255,.3),rgba(0,200,255,.2));opacity:0;transition:opacity .3s}
.ai-btn:hover:not(:disabled)::before{opacity:1}
.ai-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 24px rgba(100,60,255,.35)}
.ai-btn:disabled{background:#888;cursor:not-allowed;transform:none;box-shadow:none}
.ai-btn .ai-spark{font-size:16px;animation:pulse 2s ease infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.7;transform:scale(1.2)}}
@keyframes spin{to{transform:rotate(360deg)}}

/* AI RESULT OVERLAY */
.ai-result-wrap{width:100%;max-width:500px;position:relative;display:none}
.ai-result-wrap.visible{display:block}
.ai-result-img{width:100%;border-radius:10px;display:block;box-shadow:0 12px 50px rgba(0,0,0,.22)}
.ai-overlay-bar{position:absolute;bottom:0;left:0;right:0;
background:linear-gradient(to top,rgba(0,0,0,.92) 0%,rgba(0,0,0,.7) 60%,transparent 100%);
border-radius:0 0 10px 10px;
padding:14px 18px 12px;
display:flex;align-items:flex-end;justify-content:space-between;gap:12px}
.ai-overlay-phone{font-family:'Bebas Neue',sans-serif;font-size:clamp(20px,4vw,30px);letter-spacing:.06em;color:#fff;line-height:1}
.ai-overlay-addr{font-size:10px;color:rgba(255,255,255,.5);margin-top:2px}
.ai-overlay-qr{display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0}
.ai-overlay-qr-box{width:46px;height:46px;background:#fff;border-radius:4px;padding:3px}
.ai-overlay-scan{font-size:8px;color:rgba(255,255,255,.35);letter-spacing:.1em;text-transform:uppercase}

/* AI loading / error states */
.ai-loading{width:100%;max-width:500px;background:#1a1a2e;border-radius:10px;
aspect-ratio:4/5;display:none;flex-direction:column;align-items:center;justify-content:center;
gap:18px;box-shadow:0 12px 50px rgba(0,0,0,.22)}
.ai-loading.active{display:flex}
.ai-spin{width:48px;height:48px;border:3px solid rgba(255,255,255,.1);border-top-color:#a78bfa;border-radius:50%;animation:spin .9s linear infinite}
.ai-load-txt{font-family:'Crimson Pro',serif;font-size:18px;font-style:italic;color:rgba(255,255,255,.6)}
.ai-load-step{font-size:11px;color:rgba(255,255,255,.3)}
.ai-error{width:100%;max-width:500px;background:#1a0a0a;border-radius:10px;
padding:28px;display:none;flex-direction:column;align-items:center;justify-content:center;
gap:10px;text-align:center;box-shadow:0 12px 50px rgba(0,0,0,.22)}
.ai-error.active{display:flex}
.ai-error-icon{font-size:32px}
.ai-error-msg{font-size:12px;color:#f87171;line-height:1.6}

/* Dividers & cost strip */
.ai-divider{width:100%;max-width:500px;display:flex;align-items:center;gap:12px;margin:4px 0}
.ai-divider-line{flex:1;height:1px;background:rgba(0,0,0,.12)}
.ai-divider-txt{font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-light);white-space:nowrap}
.ai-cost{width:100%;max-width:500px;background:rgba(0,0,0,.05);border-radius:7px;padding:8px 13px;display:none;align-items:center;justify-content:space-between;font-size:11px;color:var(--ink-mid)}
.ai-cost.visible{display:flex}
.ai-cost-model{font-weight:600;color:var(--ink)}
.ai-cost-amt{color:var(--ink-light)}

@media(max-width:900px){.layout{grid-template-columns:1fr}.ppanel{padding:20px 14px}}
</style>
</head>
<body>

<header class="hdr">
  <div class="brand">My Town <span>Postcard</span></div>
  <div class="hdr-badge">✦ Ad Generator v4</div>
</header>

<div class="layout">

  <!-- ══ FORM ══ -->
  <div class="fpanel">
    <div class="ptitle">Build Your Ad</div>
    <div class="psub">Choose your industry, fill in details, pick a photo and style. Your ad updates live as you make changes.</div>

    <!-- Industry -->
    <div class="fsec">
      <div class="slbl">Industry</div>
      <div class="field">
        <label>Business Category *</label>
        <select id="industry" onchange="onIndustryChange()">
          <option value="">— Select your industry —</option>
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
      <div class="field"><label>Business Name *</label><input type="text" id="bizName" placeholder="e.g. Tony's Pizza" oninput="renderAd()"></div>
      <div class="field"><label>Tagline / Slogan</label><input type="text" id="tagline" placeholder="e.g. Hand-Tossed. Oven Fresh." oninput="renderAd()"></div>
      <div class="frow">
        <div class="field"><label>Phone *</label><input type="text" id="phone" placeholder="(706) 555-0100" oninput="renderAd()"></div>
        <div class="field"><label>City, State</label><input type="text" id="city" placeholder="Clarkesville, GA" oninput="renderAd()"></div>
      </div>
      <div class="field"><label>Address</label><input type="text" id="address" placeholder="596 W Louise St" oninput="renderAd()"></div>
      <div class="field"><label>Website</label><input type="text" id="website" placeholder="www.example.com" oninput="renderAd()"></div>
    </div>

    <!-- Photo Picker -->
    <div class="fsec">
      <div class="slbl">Hero Photo</div>
      <div class="img-grid" id="imgGrid">
        <div class="img-loading">Select an industry to load photos</div>
      </div>
      <div style="margin-top:10px">
        <div style="font-size:11px;font-weight:600;color:var(--ink-mid);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Or upload your own</div>
        <div class="upload-zone">
          <input type="file" accept="image/*" onchange="handlePhotoUpload(this)">
          <div class="upload-icon">📸</div>
          <div class="upload-txt">Upload Photo</div>
          <div class="upload-sub">Your storefront, product, team</div>
          <img class="upload-preview" id="uploadPreview">
        </div>
      </div>
    </div>

    <!-- Menu Items -->
    <div class="fsec">
      <div class="slbl">Services / Menu Items</div>
      <div class="menu-list" id="menuList"></div>
      <button class="add-btn" onclick="addMenuItem()">+ Add Item</button>
    </div>

    <!-- Offer -->
    <div class="fsec">
      <div class="slbl">Special Offer / Coupon</div>
      <div class="field"><label>Offer Text</label><input type="text" id="offer" placeholder="e.g. $1 OFF Any Pizza · 1 per visit" oninput="renderAd()"></div>
    </div>

    <!-- Design Style -->
    <div class="fsec">
      <div class="slbl">Design Style</div>
      <div class="style-grid">
        <div class="scard">
          <input type="radio" name="style" id="s-rustic" value="rustic" checked onchange="renderAd()">
          <label for="s-rustic"><div class="swatch" style="background:linear-gradient(135deg,#e8dcc8,#8B4513)"></div><div class="sinfo"><div class="sname">Rustic Layered</div><div class="sdesc">Brush strokes, cursive, ribbon badge</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-dark" value="dark" onchange="renderAd()">
          <label for="s-dark"><div class="swatch" style="background:linear-gradient(135deg,#0a0a0f,#3D0A0A)"></div><div class="sinfo"><div class="sname">Dark Cinematic</div><div class="sdesc">Huge stacked name, floating coupon badge</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-bold" value="bold" onchange="renderAd()">
          <label for="s-bold"><div class="swatch" style="background:linear-gradient(135deg,#f5f5f5,#1a1a1a 60%)"></div><div class="sinfo"><div class="sname">Editorial Magazine</div><div class="sdesc">White panel, diagonal cut, Playfair italic</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-luxury" value="luxury" onchange="renderAd()">
          <label for="s-luxury"><div class="swatch" style="background:linear-gradient(135deg,#1a1410,#C8952A)"></div><div class="sinfo"><div class="sname">Luxury Centered</div><div class="sdesc">Double gold frame, corner ornaments</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-bright" value="bright" onchange="renderAd()">
          <label for="s-bright"><div class="swatch" style="background:linear-gradient(135deg,#FF6B35,#FFF0F3)"></div><div class="sinfo"><div class="sname">Retro Poster</div><div class="sdesc">Skewed banner, torn-strip coupon, pill badges</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-clean" value="clean" onchange="renderAd()">
          <label for="s-clean"><div class="swatch" style="background:linear-gradient(135deg,#001233,#0088FF)"></div><div class="sinfo"><div class="sname">Neon Night</div><div class="sdesc">Dark photo, glowing name, neon bar</div></div></label>
          <div class="selbadge">✓</div>
        </div>
      </div>
    </div>

    <!-- Accent Color -->
    <div class="fsec">
      <div class="slbl">Accent Color</div>
      <div class="crow" id="colorPicker">
        <div class="chip"><input type="radio" name="color" id="c-red" value="#E63946" checked onchange="renderAd()"><label for="c-red" style="background:#E63946" title="Red"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-burg" value="#7C1C2E" onchange="renderAd()"><label for="c-burg" style="background:#7C1C2E" title="Burgundy"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-navy" value="#1B3A6B" onchange="renderAd()"><label for="c-navy" style="background:#1B3A6B" title="Navy"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-green" value="#1E5128" onchange="renderAd()"><label for="c-green" style="background:#1E5128" title="Forest Green"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-orange" value="#C85A11" onchange="renderAd()"><label for="c-orange" style="background:#C85A11" title="Orange"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-gold" value="#C8952A" onchange="renderAd()"><label for="c-gold" style="background:#C8952A" title="Gold"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-teal" value="#0D7377" onchange="renderAd()"><label for="c-teal" style="background:#0D7377" title="Teal"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-bright" value="#FF6B35" onchange="renderAd()"><label for="c-bright" style="background:#FF6B35" title="Bright Orange"></label></div>
      </div>
    </div>

    <button class="gen-btn" id="generateBtn" onclick="renderAd()">✦ Preview My Ad</button>

    <!-- AI UPGRADE SECTION -->
    <div style="margin-top:18px;padding-top:18px;border-top:1px solid var(--border)">
      <div class="slbl" style="margin-bottom:10px">Step 2 — AI Upgrade (Optional)</div>
      <div style="font-size:11.5px;color:var(--ink-light);line-height:1.6;margin-bottom:12px">
        Preview your ad above first, then click below to send it to GPT-4o for a professional redesign — dynamic typography, layered textures, and stunning visual composition.
      </div>
      <button class="ai-btn" id="aiUpgradeBtn" onclick="aiUpgrade()" disabled>
        <span class="ai-spark">✨</span> Make It Stunning with AI
      </button>
    </div>
  </div>

  <!-- ══ PREVIEW ══ -->
  <div class="ppanel">
    <div class="ptoolbar">
      <div class="plabel">Ad Preview</div>
      <div class="tactions">
        <button class="tbtn" id="shuffleBtn" onclick="shufflePhoto()" disabled>⟳ Shuffle Photo</button>
        <button class="tbtn primary" id="useBtn" onclick="useAd()" disabled>✓ Use This Ad</button>
      </div>
    </div>

    <div class="ai-divider"><div class="ai-divider-line"></div><div class="ai-divider-txt">Step 1 — Template Preview</div><div class="ai-divider-line"></div></div>

    <div class="ad-canvas-wrap">
      <div class="empty-state" id="emptyState">
        <div class="ei">✦</div>
        <div class="et">Your ad will appear here</div>
        <div class="es">Select an industry, fill in your business name, choose a photo and style — your ad renders instantly.</div>
      </div>
      <div id="adCanvas"></div>
    </div>

    <div class="ai-divider" id="aiDivider" style="display:none"><div class="ai-divider-line"></div><div class="ai-divider-txt">Step 2 — AI Upgraded Version</div><div class="ai-divider-line"></div></div>

    <div class="ai-loading" id="aiLoading">
      <div class="ai-spin"></div>
      <div class="ai-load-txt">GPT-4o is designing your ad...</div>
      <div class="ai-load-step" id="aiLoadStep">Analyzing your business details</div>
    </div>

    <div class="ai-error" id="aiError">
      <div class="ai-error-icon">⚠</div>
      <div class="ai-error-msg" id="aiErrorMsg">Something went wrong. Please try again.</div>
    </div>

    <div class="ai-result-wrap" id="aiResultWrap">
      <img id="aiResultImg" class="ai-result-img" alt="AI-designed ad">
      <div class="ai-overlay-bar">
        <div>
          <div class="ai-overlay-phone" id="aiOverlayPhone"></div>
          <div class="ai-overlay-addr" id="aiOverlayAddr"></div>
        </div>
        <div class="ai-overlay-qr">
          <div class="ai-overlay-qr-box">
            <svg width="40" height="40" viewBox="0 0 44 44" fill="none">
              <rect width="44" height="44" fill="white"/>
              <rect x="3" y="3" width="14" height="14" rx="1" fill="#111"/>
              <rect x="5" y="5" width="10" height="10" rx=".5" fill="white"/>
              <rect x="7" y="7" width="6" height="6" fill="#111"/>
              <rect x="27" y="3" width="14" height="14" rx="1" fill="#111"/>
              <rect x="29" y="5" width="10" height="10" rx=".5" fill="white"/>
              <rect x="31" y="7" width="6" height="6" fill="#111"/>
              <rect x="3" y="27" width="14" height="14" rx="1" fill="#111"/>
              <rect x="5" y="29" width="10" height="10" rx=".5" fill="white"/>
              <rect x="7" y="31" width="6" height="6" fill="#111"/>
              <rect x="21" y="21" width="4" height="4" fill="#111"/>
              <rect x="27" y="21" width="4" height="4" fill="#111"/>
              <rect x="33" y="21" width="4" height="4" fill="#111"/>
              <rect x="21" y="27" width="4" height="4" fill="#111"/>
              <rect x="33" y="27" width="4" height="4" fill="#111"/>
              <rect x="27" y="33" width="4" height="4" fill="#111"/>
              <rect x="21" y="39" width="4" height="4" fill="#111"/>
            </svg>
          </div>
          <div class="ai-overlay-scan">Scan</div>
        </div>
      </div>
    </div>

    <div class="ai-cost" id="aiCostStrip">
      <span>Designed by <span class="ai-cost-model">GPT-4o + DALL·E 3</span></span>
      <span class="ai-cost-amt" id="aiCostAmt">~$0.04</span>
    </div>

    <div style="max-width:500px;width:100%;font-size:11px;color:var(--ink-light);line-height:1.6;text-align:center;padding:0 8px">
      Phone, address &amp; QR are always rendered as accurate HTML overlays — never left to the AI.
    </div>
  </div>
</div>

<script>
const INDUSTRIES = {
"Pizza Restaurant":{photos:["https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80","https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80","https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=800&q=80","https://images.pexels.com/photos/9685273/pexels-photo-9685273.jpeg?auto=compress&cs=tinysrgb&w=800"],colors:{primary:"#c0392b",accent:"#f4d03f"},taglines:["Hand-Tossed. Oven Fresh.","The Best Slice in Town!","Authentic Italian Since 1985"],menu:["Large Pizza $14.99","Family Special $24.99","Wings & Pizza Combo","Free Delivery"]},
"Mexican Restaurant":{photos:["https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&q=80","https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=800&q=80","https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?w=800&q=80","https://images.unsplash.com/photo-1588013273468-315fd88ea34c?w=800&q=80"],colors:{primary:"#e67e22",accent:"#27ae60"},taglines:["Auténtico Mexican Cuisine","Family Recipes Since 1992","¡Tacos Fresca Todos los Días!"],menu:["Taco Tuesday $1 Each","Margarita Happy Hour","Family Fajita Platter","Free Chips & Salsa"]},
"Chinese Restaurant":{photos:["https://images.unsplash.com/photo-1525755662778-989d0524087e?w=800&q=80","https://images.unsplash.com/photo-1582450871972-ab5ca641643d?w=800&q=80","https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=80","https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=800&q=80"],colors:{primary:"#c0392b",accent:"#d4af37"},taglines:["Authentic Asian Flavors","Wok-Fired Perfection","Family Owned & Operated"],menu:["Lunch Special $8.99","Family Dinner $29.99","Free Egg Roll w/ Order","Catering Available"]},
"Breakfast & Cafe":{photos:["https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=800&q=80","https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80","https://images.unsplash.com/photo-1541167760496-1628856ab772?w=800&q=80","https://images.unsplash.com/photo-1644561146633-34f3f9c5c58e?w=800&q=80"],colors:{primary:"#c8541a",accent:"#f39c12"},taglines:["Made From Scratch Daily","Your Morning Made Better","Coffee · Biscuits · Smiles"],menu:["Breakfast Plate $8.99","Specialty Coffee $4.49","Bagel & Cream Cheese","Drive-Thru Available"]},
"Bar & Grill":{photos:["https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80","https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=800&q=80","https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80","https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800&q=80"],colors:{primary:"#1c1917",accent:"#dc2626"},taglines:["Where Locals Gather","Burgers · Beer · Good Times","Sports · Drinks · Great Food"],menu:["Half-Price Wings","Happy Hour 4-6pm","Burger & Beer Combo","Live Music Weekends"]},
"Italian Restaurant":{photos:["https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80","https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=800&q=80","https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80","https://images.unsplash.com/photo-1481931098730-318b6f776db0?w=800&q=80"],colors:{primary:"#166534",accent:"#dc2626"},taglines:["Authentic Italian Cuisine","Family Recipes Since 1978","Buon Appetito!"],menu:["Pasta Special $12.99","Wine & Dine for 2","Wood-Fired Pizza","Tiramisu Made Daily"]},
"Bakery":{photos:["https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&q=80","https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&q=80","https://images.unsplash.com/photo-1486427944299-d1955d23e34d?w=800&q=80","https://images.unsplash.com/photo-1517686469429-8bdb88b9f907?w=800&q=80"],colors:{primary:"#92400e",accent:"#f59e0b"},taglines:["Fresh Baked Daily","From Our Oven to Your Table","Artisan Breads & Pastries"],menu:["Custom Cakes","Fresh Bread Daily","Birthday Specials","Wedding Cakes"]},
"Coffee Shop":{photos:["https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80","https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=800&q=80","https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80","https://images.unsplash.com/photo-1541167760496-1628856ab772?w=800&q=80"],colors:{primary:"#5d4037",accent:"#d4a574"},taglines:["Locally Roasted, Locally Loved","Your Daily Ritual","Specialty Coffee & More"],menu:["Specialty Lattes","Cold Brew on Tap","Pastries Daily","Free WiFi"]},
"Dentist":{photos:["https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=800&q=80","https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=800&q=80","https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800&q=80","https://images.unsplash.com/photo-1609840114035-3c981b782dfe?w=800&q=80"],colors:{primary:"#1e3a5f",accent:"#c8a44a"},taglines:["Accepting New Patients!","Gentle Care for the Whole Family","Your Smile is Our Priority"],menu:["Cleanings & Exams","Cosmetic Dentistry","Emergency Care","Insurance Accepted"]},
"HVAC":{photos:["https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=800&q=80","https://images.unsplash.com/photo-1566917064245-1c6bff30dbf1?w=800&q=80","https://images.pexels.com/photos/5463587/pexels-photo-5463587.jpeg?auto=compress&cs=tinysrgb&w=800","https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=800&q=80"],colors:{primary:"#003f6b",accent:"#dc2626"},taglines:["24/7 Emergency Service","Heating & Cooling Experts","Fast · Reliable · Affordable"],menu:["A/C Tune-Up Special","Free Estimates","Emergency Service 24/7","Financing Available"]},
"Real Estate":{photos:["https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80","https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&q=80","https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80"],colors:{primary:"#2d6a4f",accent:"#b8962e"},taglines:["Your Local Real Estate Expert","Buying or Selling? Call Me!","Trusted in Your Neighborhood"],menu:["Free Home Valuation","Buyer Representation","Listing Services","Investment Properties"]},
"Auto Repair":{photos:["https://images.unsplash.com/photo-1486006920555-c77dcf18193c?w=800&q=80","https://images.unsplash.com/photo-1593142927747-8c1b758967a6?w=800&q=80","https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&q=80","https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80"],colors:{primary:"#1c1917",accent:"#dc2626"},taglines:["Honest Auto Repair","ASE Certified Mechanics","Family Owned Since 1992"],menu:["Oil Change Special","Brake Service","AC Repair","Free Estimates"]},
"Salon & Beauty":{photos:["https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&q=80","https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&q=80","https://images.unsplash.com/photo-1562322140-8baeececf3df?w=800&q=80","https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800&q=80"],colors:{primary:"#9d174d",accent:"#d4af37"},taglines:["Look Beautiful. Feel Confident.","Your Best Self Awaits","Cuts · Color · Style"],menu:["Cut & Color Special","Wedding Hair","Bridal Packages","Walk-Ins Welcome"]},
"Gym & Fitness":{photos:["https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80","https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80","https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&q=80","https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=800&q=80"],colors:{primary:"#dc2626",accent:"#fbbf24"},taglines:["Stronger Every Day","Get Fit. Feel Great.","Your Fitness Journey Starts Here"],menu:["Free 7-Day Trial","Personal Training","Group Classes","24/7 Access"]},
"Other Service":{photos:["https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80","https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=800&q=80","https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80","https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80"],colors:{primary:"#374151",accent:"#f59e0b"},taglines:["Quality Service You Can Trust","Locally Owned & Operated","Serving Our Community"],menu:["Free Consultation","Quality Service","Satisfaction Guaranteed","Local & Trusted"]},
};

let selectedPhotoUrl = null;
let uploadedPhotoUrl = null;
let currentIndustryPhotos = [];
let currentPhotoIndex = 0;

const QR_SVG = \`<svg width="38" height="38" viewBox="0 0 44 44" fill="none">
  <rect width="44" height="44" fill="white"/>
  <rect x="3" y="3" width="14" height="14" rx="1" fill="#111"/>
  <rect x="5" y="5" width="10" height="10" rx=".5" fill="white"/>
  <rect x="7" y="7" width="6" height="6" fill="#111"/>
  <rect x="27" y="3" width="14" height="14" rx="1" fill="#111"/>
  <rect x="29" y="5" width="10" height="10" rx=".5" fill="white"/>
  <rect x="31" y="7" width="6" height="6" fill="#111"/>
  <rect x="3" y="27" width="14" height="14" rx="1" fill="#111"/>
  <rect x="5" y="29" width="10" height="10" rx=".5" fill="white"/>
  <rect x="7" y="31" width="6" height="6" fill="#111"/>
  <rect x="21" y="21" width="4" height="4" fill="#111"/>
  <rect x="27" y="21" width="4" height="4" fill="#111"/>
  <rect x="33" y="21" width="4" height="4" fill="#111"/>
  <rect x="21" y="27" width="4" height="4" fill="#111"/>
  <rect x="33" y="27" width="4" height="4" fill="#111"/>
  <rect x="27" y="33" width="4" height="4" fill="#111"/>
  <rect x="21" y="39" width="4" height="4" fill="#111"/>
</svg>\`;

function onIndustryChange(){
  const ind = document.getElementById('industry').value;
  if(!ind) return;
  const data = INDUSTRIES[ind] || INDUSTRIES['Other Service'];
  const tg = document.getElementById('tagline');
  if(!tg.value) tg.value = data.taglines[0];
  buildMenu(data.menu);
  loadIndustryPhotos(ind, data.photos);
  renderAd();
}

async function loadIndustryPhotos(industry, fallbackPhotos){
  const grid = document.getElementById('imgGrid');
  grid.innerHTML = '<div class="img-loading">Loading photos...</div>';
  let photos = fallbackPhotos || [];
  try {
    const res = await fetch(\`/api/image-library?industry=\${encodeURIComponent(industry)}\`);
    const data = await res.json();
    if(data.images && data.images.length) photos = data.images.map(i=>({url:i.image_url,thumb:i.thumb_url,credit:i.photographer_credit}));
  } catch(e) { /* use fallback */ }

  currentIndustryPhotos = photos;

  if(!photos.length){
    grid.innerHTML = '<div class="img-none">No photos found for this industry yet. Upload your own above, or add photos in the admin image library.</div>';
    return;
  }

  grid.innerHTML = '';
  photos.forEach((p, i) => {
    const url = typeof p === 'string' ? p : p.url;
    const thumb = typeof p === 'string' ? p : (p.thumb || p.url);
    const div = document.createElement('div');
    div.className = 'img-thumb' + (i===0?' selected':'');
    div.onclick = () => selectPhoto(url, div);
    div.innerHTML = \`<img src="\${thumb}" loading="lazy" alt="photo \${i+1}"><div class="sel-check">✓</div>\`;
    grid.appendChild(div);
  });

  if(photos.length){
    selectedPhotoUrl = typeof photos[0]==='string'?photos[0]:photos[0].url;
    currentPhotoIndex = 0;
    document.getElementById('shuffleBtn').disabled = false;
  }
  renderAd();
}

function selectPhoto(url, el){
  selectedPhotoUrl = url;
  uploadedPhotoUrl = null;
  document.getElementById('uploadPreview').style.display='none';
  document.querySelectorAll('.img-thumb').forEach(t=>t.classList.remove('selected'));
  el.classList.add('selected');
  renderAd();
}

function shufflePhoto(){
  if(!currentIndustryPhotos.length) return;
  currentPhotoIndex = (currentPhotoIndex+1) % currentIndustryPhotos.length;
  const p = currentIndustryPhotos[currentPhotoIndex];
  const url = typeof p==='string'?p:p.url;
  selectedPhotoUrl = url;
  document.querySelectorAll('.img-thumb').forEach((t,i)=>{
    t.classList.toggle('selected', i===currentPhotoIndex);
  });
  renderAd();
}

function handlePhotoUpload(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    uploadedPhotoUrl = e.target.result;
    selectedPhotoUrl = uploadedPhotoUrl;
    const preview = document.getElementById('uploadPreview');
    preview.src = uploadedPhotoUrl;
    preview.style.display = 'block';
    document.querySelectorAll('.img-thumb').forEach(t=>t.classList.remove('selected'));
    renderAd();
  };
  reader.readAsDataURL(file);
}

function buildMenu(items){
  const list = document.getElementById('menuList');
  list.innerHTML = '';
  items.forEach(item=>addMenuItem(item));
}

function addMenuItem(val=''){
  const list = document.getElementById('menuList');
  const row = document.createElement('div');
  row.className = 'mrow';
  row.innerHTML = \`<input type="text" placeholder="e.g. Large Pizza $14.99" value="\${val}" oninput="renderAd()"><button class="rm-btn" onclick="this.parentElement.remove();renderAd()">×</button>\`;
  list.appendChild(row);
}

function getMenu(){
  return Array.from(document.querySelectorAll('.mrow input')).map(i=>i.value.trim()).filter(Boolean);
}

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
    style:   document.querySelector('input[name="style"]:checked')?.value || 'rustic',
    color:   document.querySelector('input[name="color"]:checked')?.value || '#E63946',
    photo:   selectedPhotoUrl || '',
  };
}

function qrHTML(){
  return \`<div class="ad-qr"><div class="ad-qr-box">\${QR_SVG}</div><div class="ad-qr-label">Scan</div></div>\`;
}

function renderAd(){
  const d = getFormData();
  if(!d.photo && !d.bizName) return;

  const canvas = document.getElementById('adCanvas');
  const empty  = document.getElementById('emptyState');
  const tpl    = d.style;
  const bgStyle = d.photo ? \`background-image:url('\${d.photo}')\` : 'background:#333';
  const ac = d.color;

  const words = d.bizName.trim().split(/\\s+/);
  const nameLine1 = words.length > 1 ? words.slice(0, -1).join(' ') : d.bizName;
  const nameLine2 = words.length > 1 ? words[words.length - 1] : '';

  function parseCoupon(offer){
    if(!offer) return null;
    const parts = offer.split('·');
    const main = parts[0].trim();
    const fine = parts[1]?.trim() || '1 per visit · with this postcard';
    const m = main.match(/^(\\$[\\d.]+\\s+OFF)\\s+(.+)$/i);
    return m ? {amount: m[1], item: m[2], fine} : {amount: main, item:'', fine};
  }
  const cp = parseCoupon(d.offer);

  let html = '';

  if(tpl === 'rustic'){
    const menuRows = d.menu.slice(0,4).map(item=>
      \`<div class="ad-menu-item"><div class="ad-check-circle">✓</div>\${item}</div>\`).join('');
    html = \`<div class="tpl-rustic" style="--accent-color:\${ac}">
      <div class="ad-bg" style="\${bgStyle}"></div>
      <div class="ad-wash"></div>
      <div class="brush-top"></div>
      <div class="brush-bot"></div>
      <div class="ad-ribbon"><span class="ad-ribbon-emoji">✦</span><div class="ad-ribbon-txt">EST.<br>LOCAL</div></div>
      <div class="ad-name-block">
        <div class="ad-name-line1">\${nameLine1}</div>
        <span class="ad-name-script"><span class="ad-sparks">— </span>\${nameLine2||d.bizName}</span>
      </div>
      \${d.tagline?\`<div class="ad-tagline">\${d.tagline}</div>\`:''}
      \${menuRows?\`<div class="ad-menu">\${menuRows}</div>\`:''}
      \${cp?\`<div class="ad-coupon"><div class="ad-coupon-amount">\${cp.amount}</div>\${cp.item?\`<div class="ad-coupon-item">\${cp.item}</div>\`:''}<div class="ad-coupon-fine">\${cp.fine}</div></div>\`:''}
      <div class="ad-footer">
        <div class="ad-phone-wrap"><div class="ad-phone-icon">☎</div>
          <div><div class="ad-phone">\${d.phone||'—'}</div><div class="ad-address">\${[d.address,d.city].filter(Boolean).join(', ')}</div></div>
        </div>
        \${qrHTML()}
      </div>
    </div>\`;

  } else if(tpl === 'dark'){
    const menuRows = d.menu.slice(0,4).map(item=>
      \`<div class="ad-menu-item"><div class="ad-menu-dot"></div>\${item}</div>\`).join('');
    html = \`<div class="tpl-dark" style="--accent-color:\${ac}">
      <div class="ad-bg" style="\${bgStyle}"></div>
      <div class="ad-vignette"></div><div class="ad-glow"></div>
      <div class="ad-name-block">
        <div class="ad-name-line1">\${nameLine1}</div>
        \${nameLine2?\`<span class="ad-name-line2">\${nameLine2}</span>\`:''}
      </div>
      <div class="ad-vline"></div>
      \${cp?\`<div class="ad-coupon"><div class="ad-coupon-amount">\${cp.amount}</div><div class="ad-coupon-off">OFF</div><div class="ad-coupon-item">\${cp.item||'Any Item'}</div><div class="ad-coupon-fine">\${cp.fine}</div></div>\`:''}
      \${d.tagline?\`<div class="ad-tagline">\${d.tagline}</div>\`:''}
      \${menuRows?\`<div class="ad-menu">\${menuRows}</div>\`:''}
      <div class="ad-footer">
        <div><div class="ad-phone">\${d.phone||'—'}</div><div class="ad-address">\${[d.address,d.city].filter(Boolean).join(', ')}</div></div>
        \${qrHTML()}
      </div>
    </div>\`;

  } else if(tpl === 'bold'){
    const menuRows = d.menu.slice(0,4).map(item=>{
      const m = item.match(/^(.+?)\\s+(\\$[\\d.]+.*)$/);
      return m ? \`<div class="ad-menu-item"><span>\${m[1]}</span><span>\${m[2]}</span></div>\`
               : \`<div class="ad-menu-item"><span>\${item}</span></div>\`;
    }).join('');
    html = \`<div class="tpl-bold" style="--accent-color:\${ac}">
      <div class="ad-bg" style="\${bgStyle}"></div>
      <div class="ad-panel"></div><div class="ad-stripe"></div>
      <div class="ad-name-block">
        <div class="ad-name-line1">\${nameLine1}</div>
        \${nameLine2?\`<span class="ad-name-line2">\${nameLine2}</span>\`:''}
        \${d.tagline?\`<div class="ad-tagline">\${d.tagline}</div>\`:''}
      </div>
      \${menuRows?\`<div class="ad-menu">\${menuRows}</div>\`:''}
      \${cp?\`<div class="ad-coupon"><div class="ad-coupon-text">\${cp.amount}\${cp.item?' '+cp.item:''}</div><div class="ad-coupon-fine">\${cp.fine}</div></div>\`:''}
      <div class="ad-footer">
        <div><div class="ad-phone">\${d.phone||'—'}</div><div class="ad-address">\${[d.address,d.city].filter(Boolean).join(', ')}</div></div>
        \${qrHTML()}
      </div>
    </div>\`;

  } else if(tpl === 'luxury'){
    const menuRows = d.menu.slice(0,4).map(item=>\`<div class="ad-menu-item">\${item}</div>\`).join('');
    html = \`<div class="tpl-luxury">
      <div class="ad-bg" style="\${bgStyle}"></div>
      <div class="ad-overlay"></div>
      <div class="ad-frame"></div><div class="ad-frame-inner"></div>
      <div class="ad-corner ad-corner-tl"></div><div class="ad-corner ad-corner-tr"></div>
      <div class="ad-corner ad-corner-bl"></div><div class="ad-corner ad-corner-br"></div>
      <div class="ad-content">
        <div class="ad-ornament">— ✦ —</div>
        <div class="ad-name">\${d.bizName}</div>
        \${d.tagline?\`<div class="ad-tagline">\${d.tagline}</div>\`:''}
        <div class="ad-rule"></div>
        \${menuRows?\`<div class="ad-menu">\${menuRows}</div>\`:''}
        \${cp?\`<div class="ad-coupon"><div class="ad-coupon-text">\${cp.amount}\${cp.item?' '+cp.item:''}</div><div class="ad-coupon-fine">\${cp.fine}</div></div>\`:''}
      </div>
      <div class="ad-footer">
        <div><div class="ad-phone">\${d.phone||'—'}</div><div class="ad-address">\${[d.address,d.city].filter(Boolean).join(', ')}</div></div>
        \${qrHTML()}
      </div>
    </div>\`;

  } else if(tpl === 'bright'){
    const menuBadges = d.menu.slice(0,4).map(item=>\`<div class="ad-menu-item">\${item}</div>\`).join('');
    html = \`<div class="tpl-bright" style="--accent-color:\${ac}">
      <div class="ad-bg" style="\${bgStyle}"></div>
      <div class="ad-overlay"></div><div class="ad-banner"></div>
      <div class="ad-banner-name">\${nameLine1}\${nameLine2?' '+nameLine2:''}</div>
      \${d.tagline?\`<div class="ad-banner-tag">\${d.tagline}</div>\`:''}
      \${cp?\`<div class="ad-coupon"><div class="ad-coupon-left"><div class="ad-coupon-amount">\${cp.amount}</div><div class="ad-coupon-item">\${cp.item||'Any Item'}</div><div class="ad-coupon-fine">\${cp.fine}</div></div><div class="ad-coupon-right"><div class="ad-coupon-badge">With This Card</div></div></div>\`:''}
      \${menuBadges?\`<div class="ad-menu">\${menuBadges}</div>\`:''}
      <div class="ad-footer">
        <div><div class="ad-phone">\${d.phone||'—'}</div><div class="ad-address">\${[d.address,d.city].filter(Boolean).join(', ')}</div></div>
        \${qrHTML()}
      </div>
    </div>\`;

  } else if(tpl === 'clean'){
    const menuChips = d.menu.slice(0,6).map(item=>\`<div class="ad-menu-item">\${item}</div>\`).join('');
    html = \`<div class="tpl-clean" style="--accent-color:\${ac}">
      <div class="ad-bg" style="\${bgStyle}"></div>
      <div class="ad-overlay"></div><div class="ad-neon-bar"></div>
      <div class="ad-name-block">
        <div class="ad-name-line1">\${nameLine1}</div>
        \${nameLine2?\`<span class="ad-name-line2">\${nameLine2}</span>\`:''}
        \${d.tagline?\`<div class="ad-tagline">\${d.tagline}</div>\`:''}
      </div>
      \${menuChips?\`<div class="ad-menu">\${menuChips}</div>\`:''}
      \${cp?\`<div class="ad-coupon"><div class="ad-coupon-text">\${cp.amount}</div><div class="ad-coupon-detail"><div class="ad-coupon-item">\${cp.item||'Any Item'}</div><div class="ad-coupon-fine">\${cp.fine}</div></div></div>\`:''}
      <div class="ad-footer">
        <div><div class="ad-phone">\${d.phone||'—'}</div><div class="ad-address">\${[d.address,d.city].filter(Boolean).join(', ')}</div></div>
        \${qrHTML()}
      </div>
    </div>\`;
  }

  canvas.innerHTML = html;
  canvas.classList.add('visible');
  empty.classList.add('hidden');
  document.getElementById('useBtn').disabled = false;
  document.getElementById('aiUpgradeBtn').disabled = false;
}

async function aiUpgrade(){
  if(!selectedPhotoUrl){ alert('Please select a hero photo first.'); return; }
  const d = getFormData();
  if(!d.bizName || d.bizName === 'Business Name'){ alert('Please enter a business name first.'); return; }

  setAIState('loading');

  const steps = [
    'Analyzing your business details...',
    'Studying your hero photo...',
    'Composing the visual layout...',
    'Adding dynamic typography...',
    'Applying textures and depth...',
    'Finishing touches...',
  ];
  let si = 0;
  const stepEl = document.getElementById('aiLoadStep');
  const iv = setInterval(()=>{ si=(si+1)%steps.length; if(stepEl) stepEl.textContent=steps[si]; }, 3500);

  try {
    const res = await fetch('/api/ai-upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photoUrl: selectedPhotoUrl,
        bizName: d.bizName,
        industry: document.getElementById('industry').value,
        tagline: d.tagline,
        menu: d.menu,
        offer: d.offer,
        style: d.style,
        phone: d.phone,
        city: d.city,
        address: d.address,
      })
    });

    const data = await res.json();
    if(data.error) throw new Error(data.error);
    const imgUrl = data.imageUrl;

    clearInterval(iv);
    if(stepEl) stepEl.textContent = 'Generating your ad image...';

    document.getElementById('aiOverlayPhone').textContent = d.phone || '';
    document.getElementById('aiOverlayAddr').textContent = [d.address, d.city].filter(Boolean).join(', ');

    const img = document.getElementById('aiResultImg');
    img.onload = () => setAIState('success');
    img.onerror = () => { throw new Error('Failed to load generated image.'); };
    img.src = imgUrl;

    window.lastAiImageUrl = imgUrl;

  } catch(err){
    clearInterval(iv);
    document.getElementById('aiErrorMsg').textContent = err.message;
    setAIState('error');
  }
}

function setAIState(state){
  const loading    = document.getElementById('aiLoading');
  const error      = document.getElementById('aiError');
  const result     = document.getElementById('aiResultWrap');
  const cost       = document.getElementById('aiCostStrip');
  const divider    = document.getElementById('aiDivider');
  const upgradeBtn = document.getElementById('aiUpgradeBtn');

  loading.classList.remove('active');
  error.classList.remove('active');
  result.classList.remove('visible');
  cost.classList.remove('visible');
  upgradeBtn.disabled = false;
  divider.style.display = 'flex';

  if(state==='loading'){
    loading.classList.add('active');
    upgradeBtn.disabled = true;
    document.querySelector('.ppanel').scrollTo({top:9999,behavior:'smooth'});
  } else if(state==='success'){
    result.classList.add('visible');
    cost.classList.add('visible');
    document.getElementById('useBtn').disabled = false;
    setTimeout(()=>document.querySelector('.ppanel').scrollTo({top:9999,behavior:'smooth'}),100);
  } else if(state==='error'){
    error.classList.add('active');
  }
}

async function useAd(){
  const canvas = document.getElementById('adCanvas');
  const adHtml = canvas.innerHTML;
  const d = getFormData();
  const params = new URLSearchParams(location.search);
  const leadId = params.get('leadId');

  const btn = document.getElementById('useBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const r = await fetch('/api/ad-generator-v4/save', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ leadId, adHtml, photoUrl: window.lastAiImageUrl || d.photo }),
    });
    const data = await r.json();
    if(data.ok){
      btn.textContent = '✓ Ad Saved!';
      btn.style.background = '#1a5c3a';
      btn.style.borderColor = '#1a5c3a';
    } else {
      btn.disabled = false;
      btn.textContent = '✓ Use This Ad';
      alert(data.error || 'Error saving ad');
    }
  } catch(e) {
    btn.disabled = false;
    btn.textContent = '✓ Use This Ad';
    alert('Error saving ad. Please try again.');
  }
}

addMenuItem('');
addMenuItem('');
addMenuItem('');
</script>

</body>
</html>`;

export default router;
