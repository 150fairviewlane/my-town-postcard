import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, outreachLeadsTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/ad-generator-v5/save", async (req, res): Promise<void> => {
  const { leadId, adHtml, photoUrl } = req.body ?? {};
  if (!adHtml) {
    res.status(400).json({ error: "adHtml is required" });
    return;
  }
  if (leadId) {
    const id = Number(leadId);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid leadId" }); return; }
    const [row] = await db.select().from(outreachLeadsTable).where(eq(outreachLeadsTable.id, id));
    if (!row) { res.status(404).json({ error: "Lead not found" }); return; }
    await db.update(outreachLeadsTable)
      .set({ notes: `[Ad v5 · ${new Date().toLocaleDateString()}] photo: ${photoUrl ?? ""}` })
      .where(eq(outreachLeadsTable.id, id));
  }
  res.json({ ok: true });
});

router.get("/ad-generator-v5", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(AD_GENERATOR_V5_HTML);
});

const AD_GENERATOR_V5_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Town Postcard — Ad Generator v5</title>
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
body{font-family:'DM Sans',sans-serif;background:var(--surface);color:var(--ink)}

/* HEADER */
.hdr{background:var(--ink);padding:14px 32px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid var(--burg)}
.brand{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#fff;letter-spacing:.08em}
.brand span{color:#C8A882}
.hdr-badge{background:var(--burg);color:#fff;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:4px 12px;border-radius:20px}

/* LAYOUT */
.layout{display:grid;grid-template-columns:440px 1fr;height:calc(100vh - 55px)}

/* FORM PANEL */
.fpanel{background:var(--card);border-right:1px solid var(--border);padding:22px 20px;overflow-y:auto;min-height:0}
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

/* UPLOAD ZONE */
.upload-zone{border:2px dashed var(--border);border-radius:9px;padding:12px;text-align:center;cursor:pointer;transition:all .2s;background:var(--surface);position:relative;overflow:hidden}
.upload-zone:hover{border-color:var(--burg);background:var(--burg-pale)}
.upload-zone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.upload-icon{font-size:20px;margin-bottom:3px}
.upload-txt{font-size:11px;font-weight:600;color:var(--ink-mid)}
.upload-sub{font-size:9.5px;color:var(--ink-light);margin-top:1px}
.upload-preview{width:100%;height:60px;object-fit:cover;border-radius:5px;margin-top:6px;display:none}

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

/* GEN BUTTON */
.gen-btn{width:100%;padding:13px;background:var(--burg);color:#fff;border:none;border-radius:9px;font-family:'Bebas Neue',sans-serif;font-size:19px;letter-spacing:.12em;cursor:pointer;transition:background .2s,transform .15s;margin-top:6px;display:flex;align-items:center;justify-content:center;gap:9px}
.gen-btn:hover:not(:disabled){background:var(--burg-dark)}
.gen-btn:active:not(:disabled){transform:scale(.98)}
.gen-btn:disabled{background:#bbb;cursor:not-allowed}

/* AI UPGRADE BUTTON */
.ai-btn{width:100%;padding:13px;background:linear-gradient(135deg,#1a1a2e,#2d1b4e);color:#fff;border:none;border-radius:9px;font-family:'Bebas Neue',sans-serif;font-size:19px;letter-spacing:.12em;cursor:pointer;transition:all .25s;margin-top:8px;display:flex;align-items:center;justify-content:center;gap:10px;position:relative;overflow:hidden}
.ai-btn:hover:not(:disabled){background:linear-gradient(135deg,#2a2a4e,#4a2b7e);transform:translateY(-1px);box-shadow:0 6px 24px rgba(100,60,255,.3)}
.ai-btn:disabled{background:#888;cursor:not-allowed;transform:none;box-shadow:none}
.ai-spark{font-size:16px}

/* PREVIEW PANEL */
.ppanel{background:#E8E4DE;padding:28px 32px;display:flex;flex-direction:column;align-items:center;gap:16px;overflow-y:auto}
.ptoolbar{width:100%;max-width:500px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.plabel{font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:.1em;color:var(--ink-mid)}
.tactions{display:flex;gap:7px;flex-wrap:wrap}
.tbtn{padding:6px 13px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid var(--border);background:var(--card);color:var(--ink-mid);transition:all .2s;font-family:'DM Sans',sans-serif}
.tbtn:hover:not(:disabled){border-color:var(--burg);color:var(--burg)}
.tbtn.primary{background:var(--green);border-color:var(--green);color:#fff}
.tbtn.primary:hover:not(:disabled){background:#144d30}
.tbtn:disabled{opacity:.4;cursor:not-allowed}

/* SECTION DIVIDER */
.sec-divider{width:100%;max-width:500px;display:flex;align-items:center;gap:10px}
.sec-divider-line{flex:1;height:1px;background:rgba(0,0,0,.15)}
.sec-divider-txt{font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-light);white-space:nowrap}

/* AD CANVAS */
.ad-wrap{width:100%;max-width:500px;aspect-ratio:4/5;position:relative;border-radius:10px;overflow:hidden;box-shadow:0 12px 50px rgba(0,0,0,.22);background:#1a1a1a;display:none}
.ad-wrap.visible{display:block}

/* Background layers */
.ad-bg-photo{position:absolute;inset:0;background-size:cover;background-position:center;z-index:1}
.ad-bg-ai{position:absolute;inset:0;background-size:cover;background-position:center;z-index:2;opacity:0;transition:opacity 1s ease}
.ad-bg-ai.loaded{opacity:1}

/* RUSTIC */
.style-rustic .ad-bg-photo{filter:brightness(.72) saturate(1.1)}
.style-rustic .ad-overlay{position:absolute;inset:0;z-index:3;
background:linear-gradient(175deg,rgba(25,10,2,.45) 0%,rgba(10,4,1,.1) 35%,rgba(8,3,1,.0) 55%,rgba(8,3,1,.96) 100%)}
.style-rustic .ad-brush{position:absolute;bottom:0;left:0;right:0;height:50%;z-index:4;
background:linear-gradient(to top,rgba(12,6,2,1) 0%,rgba(12,6,2,.96) 35%,transparent 100%)}
.style-rustic .ad-ornament{position:absolute;top:14px;left:0;right:0;z-index:10;text-align:center;
font-size:13px;letter-spacing:.3em;color:rgba(255,190,80,.55)}

/* DARK */
.style-dark .ad-bg-photo{filter:brightness(.42) saturate(.8)}
.style-dark .ad-overlay{position:absolute;inset:0;z-index:3;
background:radial-gradient(ellipse at 60% 25%,rgba(140,20,30,.5) 0%,transparent 65%),
linear-gradient(to bottom,rgba(0,0,0,.4) 0%,rgba(0,0,0,.0) 40%,rgba(0,0,0,.97) 100%)}

/* EDITORIAL */
.style-bold .ad-bg-photo{filter:brightness(.78) saturate(1.1)}
.style-bold .ad-overlay{position:absolute;inset:0;z-index:3;
background:linear-gradient(to bottom,rgba(255,255,255,.0) 0%,rgba(255,255,255,.0) 50%,rgba(255,255,255,.96) 56%,rgba(255,255,255,.98) 100%)}
.style-bold .ad-white-panel{position:absolute;bottom:0;left:0;right:0;height:50%;z-index:4;background:#fff;clip-path:polygon(0 12%,100% 0,100% 100%,0 100%)}
.style-bold .ad-stripe{position:absolute;top:0;left:0;width:5px;height:100%;z-index:10;background:var(--accent-color,#E63946)}

/* LUXURY */
.style-luxury .ad-bg-photo{filter:brightness(.3) saturate(.55)}
.style-luxury .ad-overlay{position:absolute;inset:0;z-index:3;background:linear-gradient(to bottom,rgba(5,4,2,.25) 0%,rgba(5,4,2,.7) 100%)}
.style-luxury .ad-frame{position:absolute;inset:10px;z-index:4;border:1px solid rgba(212,175,55,.4);pointer-events:none}
.style-luxury .ad-frame2{position:absolute;inset:16px;z-index:4;border:0.5px solid rgba(212,175,55,.18);pointer-events:none}
.style-luxury .ad-corner{position:absolute;z-index:5;width:16px;height:16px;pointer-events:none}
.style-luxury .ad-corner.tl{top:8px;left:8px;border-top:2px solid rgba(212,175,55,.65);border-left:2px solid rgba(212,175,55,.65)}
.style-luxury .ad-corner.tr{top:8px;right:8px;border-top:2px solid rgba(212,175,55,.65);border-right:2px solid rgba(212,175,55,.65)}
.style-luxury .ad-corner.bl{bottom:8px;left:8px;border-bottom:2px solid rgba(212,175,55,.65);border-left:2px solid rgba(212,175,55,.65)}
.style-luxury .ad-corner.br{bottom:8px;right:8px;border-bottom:2px solid rgba(212,175,55,.65);border-right:2px solid rgba(212,175,55,.65)}

/* RETRO POSTER */
.style-bright .ad-bg-photo{filter:brightness(.58) saturate(1.25)}
.style-bright .ad-overlay{position:absolute;inset:0;z-index:3;
background:linear-gradient(to bottom,rgba(0,0,0,.1) 0%,rgba(0,0,0,.0) 25%,rgba(0,0,0,.82) 100%)}
.style-bright .ad-banner{position:absolute;top:0;left:0;right:0;height:75px;z-index:4;
background:var(--accent-color,#FF6B35);clip-path:polygon(0 0,100% 0,100% 78%,0 100%)}

/* NEON */
.style-clean .ad-bg-photo{filter:brightness(.25) saturate(.4)}
.style-clean .ad-overlay{position:absolute;inset:0;z-index:3;
background:linear-gradient(135deg,rgba(0,100,200,.2) 0%,transparent 60%)}
.style-clean .ad-neon-bar{position:absolute;left:0;top:0;bottom:0;width:4px;z-index:5;
background:var(--accent-color,#0088FF);
box-shadow:0 0 14px 4px var(--accent-color,#0088FF),0 0 32px 8px var(--accent-color,#0088FF)}

/* CONTENT LAYER */
.ad-content{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column}

/* RUSTIC CONTENT */
.style-rustic .ad-content{justify-content:space-between;padding:0}
.style-rustic .name-block{padding:18px 18px 0;text-align:right}
.style-rustic .name-line1{font-family:'Bebas Neue',sans-serif;font-size:clamp(28px,6vw,48px);letter-spacing:.04em;color:#fff;line-height:.92;text-shadow:2px 2px 8px rgba(0,0,0,.6)}
.style-rustic .name-script{font-family:'Dancing Script',cursive;font-size:clamp(36px,7.5vw,58px);color:var(--accent-color,#D4540A);line-height:.88;text-shadow:2px 3px 10px rgba(0,0,0,.5);display:block;transform:rotate(-2deg);transform-origin:right center}
.style-rustic .tagline-txt{font-family:'Dancing Script',cursive;font-size:clamp(13px,2.8vw,18px);color:rgba(255,220,150,.88);margin-top:6px;transform:rotate(-1deg);display:block;text-shadow:1px 1px 4px rgba(0,0,0,.5)}
.style-rustic .bottom-block{padding:0 16px 0}
.style-rustic .menu-section{margin-bottom:10px}
.style-rustic .menu-item{display:flex;align-items:center;gap:8px;margin-bottom:5px}
.style-rustic .menu-check{width:18px;height:18px;border-radius:50%;border:2px solid var(--accent-color,#D4540A);display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--accent-color,#D4540A);flex-shrink:0;font-weight:700}
.style-rustic .menu-txt{font-family:'Oswald',sans-serif;font-size:clamp(11px,2.3vw,14px);font-weight:400;letter-spacing:.04em;text-transform:uppercase;color:rgba(255,255,255,.9)}
.style-rustic .coupon-box{border:2.5px dashed rgba(255,180,60,.55);border-radius:5px;padding:7px 12px;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.style-rustic .coupon-left .coupon-amount{font-family:'Bebas Neue',sans-serif;font-size:clamp(24px,5vw,36px);color:#fff;line-height:1;letter-spacing:.02em}
.style-rustic .coupon-left .coupon-item{font-family:'Dancing Script',cursive;font-size:clamp(14px,3vw,20px);color:var(--accent-color,#D4540A);line-height:1}
.style-rustic .coupon-fine{font-size:9px;color:rgba(255,255,255,.45);margin-top:2px;font-family:'DM Sans',sans-serif}
.style-rustic .footer-bar{background:rgba(8,4,1,.9);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid rgba(255,180,60,.15)}
.style-rustic .footer-left{}
.style-rustic .phone-row{display:flex;align-items:center;gap:8px}
.style-rustic .phone-icon{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--accent-color,#D4540A);display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0}
.style-rustic .phone-num{font-family:'Bebas Neue',sans-serif;font-size:clamp(18px,3.8vw,26px);letter-spacing:.06em;color:#fff;line-height:1}
.style-rustic .addr-txt{font-size:clamp(8px,1.6vw,10px);color:rgba(255,255,255,.42);margin-top:1px;margin-left:30px}
.style-rustic .qr-wrap{display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0}
.style-rustic .qr-box{width:42px;height:42px;background:#fff;border-radius:3px;padding:3px}
.style-rustic .qr-scan{font-size:8px;color:rgba(255,255,255,.3);letter-spacing:.1em;text-transform:uppercase;font-family:'DM Sans',sans-serif}

/* DARK CONTENT */
.style-dark .ad-content{justify-content:space-between;padding:0}
.style-dark .name-block{padding:20px 18px 0}
.style-dark .name-line1{font-family:'Bebas Neue',sans-serif;font-size:clamp(38px,8vw,62px);letter-spacing:.02em;color:#fff;line-height:.88;text-shadow:0 4px 20px rgba(0,0,0,.5)}
.style-dark .name-line2{font-family:'Bebas Neue',sans-serif;font-size:clamp(26px,5.5vw,44px);letter-spacing:.08em;color:var(--accent-color,#CC2222);display:block;line-height:.9}
.style-dark .tagline-txt{font-family:'DM Sans',sans-serif;font-size:clamp(8px,1.6vw,11px);font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.45);margin-top:8px}
.style-dark .bottom-block{padding:0 18px 0}
.style-dark .menu-section{margin-bottom:10px}
.style-dark .menu-item{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.style-dark .menu-dot{width:4px;height:4px;border-radius:50%;background:var(--accent-color,#CC2222);flex-shrink:0}
.style-dark .menu-txt{font-family:'DM Sans',sans-serif;font-size:clamp(11px,2.3vw,13px);color:rgba(255,255,255,.75);font-weight:300}
.style-dark .coupon-box{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);border-radius:5px;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.style-dark .coupon-amount{font-family:'Bebas Neue',sans-serif;font-size:clamp(22px,4.5vw,34px);color:#fff;line-height:1;letter-spacing:.02em}
.style-dark .coupon-item{font-family:'Crimson Pro',serif;font-style:italic;font-size:clamp(12px,2.5vw,16px);color:var(--accent-color,#CC2222)}
.style-dark .coupon-fine{font-size:8.5px;color:rgba(255,255,255,.35);margin-top:2px}
.style-dark .footer-bar{background:rgba(0,0,0,.88);border-top:2px solid var(--accent-color,#CC2222);padding:10px 16px;display:flex;align-items:center;justify-content:space-between}
.style-dark .phone-num{font-family:'Bebas Neue',sans-serif;font-size:clamp(18px,3.8vw,28px);letter-spacing:.06em;color:#fff;line-height:1}
.style-dark .addr-txt{font-size:clamp(8px,1.6vw,10px);color:rgba(255,255,255,.35);margin-top:1px}
.style-dark .qr-wrap{display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0}
.style-dark .qr-box{width:42px;height:42px;background:#fff;border-radius:3px;padding:3px}
.style-dark .qr-scan{font-size:8px;color:rgba(255,255,255,.3);letter-spacing:.1em;text-transform:uppercase}

/* EDITORIAL CONTENT */
.style-bold .ad-content{justify-content:flex-end;padding:0}
.style-bold .name-block{position:absolute;top:0;left:22px;right:18px;padding-top:18px}
.style-bold .name-line1{font-family:'Playfair Display',serif;font-weight:900;font-style:italic;font-size:clamp(24px,5vw,40px);color:#fff;line-height:.92;text-shadow:1px 2px 8px rgba(0,0,0,.5)}
.style-bold .name-line2{font-family:'Playfair Display',serif;font-weight:700;font-size:clamp(17px,3.5vw,28px);color:var(--accent-color,#E63946);display:block;line-height:1}
.style-bold .tagline-txt{font-family:'DM Sans',sans-serif;font-size:clamp(8px,1.6vw,10px);font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-top:6px}
.style-bold .bottom-block{padding:0 22px 0;position:relative;z-index:6}
.style-bold .menu-section{margin-bottom:8px;display:grid;grid-template-columns:1fr 1fr;gap:3px 10px}
.style-bold .menu-item{border-bottom:1px solid rgba(0,0,0,.1);padding-bottom:3px;display:flex;justify-content:space-between;gap:4px}
.style-bold .menu-txt{font-family:'DM Sans',sans-serif;font-size:clamp(10px,2vw,12px);color:#222;font-weight:500}
.style-bold .coupon-box{background:var(--accent-color,#E63946);padding:7px 14px;display:inline-block;margin-bottom:10px}
.style-bold .coupon-amount{font-family:'Bebas Neue',sans-serif;font-size:clamp(16px,3.2vw,22px);letter-spacing:.06em;color:#fff}
.style-bold .coupon-fine{font-size:8.5px;color:rgba(255,255,255,.75);margin-top:1px}
.style-bold .footer-bar{background:#0f0f0f;padding:9px 18px;display:flex;align-items:center;justify-content:space-between}
.style-bold .phone-num{font-family:'Bebas Neue',sans-serif;font-size:clamp(18px,3.8vw,26px);letter-spacing:.06em;color:#fff;line-height:1}
.style-bold .addr-txt{font-size:clamp(8px,1.6vw,10px);color:rgba(255,255,255,.38);margin-top:1px}
.style-bold .qr-wrap{display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0}
.style-bold .qr-box{width:38px;height:38px;background:#fff;border-radius:2px;padding:3px}
.style-bold .qr-scan{font-size:8px;color:rgba(255,255,255,.32);letter-spacing:.1em;text-transform:uppercase}

/* LUXURY CONTENT */
.style-luxury .ad-content{align-items:center;justify-content:center;text-align:center;padding:24px 26px}
.style-luxury .name-block{text-align:center;margin-bottom:8px}
.style-luxury .ornament-txt{font-size:11px;letter-spacing:.5em;color:rgba(212,175,55,.65);margin-bottom:8px;display:block}
.style-luxury .name-line1{font-family:'Playfair Display',serif;font-weight:700;font-size:clamp(22px,4.8vw,38px);color:#fff;letter-spacing:.05em;line-height:1.05;text-shadow:0 2px 14px rgba(0,0,0,.5)}
.style-luxury .tagline-txt{font-family:'Crimson Pro',serif;font-style:italic;font-size:clamp(12px,2.5vw,17px);color:rgba(212,175,55,.85);margin-top:5px;display:block}
.style-luxury .gold-rule{width:80px;height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,.7),transparent);margin:10px auto}
.style-luxury .menu-section{width:100%;margin-bottom:8px}
.style-luxury .menu-item{font-family:'Crimson Pro',serif;font-size:clamp(11px,2.2vw,14px);color:rgba(255,255,255,.65);border-bottom:1px solid rgba(212,175,55,.1);padding-bottom:4px;margin-bottom:4px;letter-spacing:.04em}
.style-luxury .coupon-box{border:1px solid rgba(212,175,55,.45);border-radius:2px;padding:7px 18px;background:rgba(212,175,55,.06);display:inline-block;margin-top:4px}
.style-luxury .coupon-amount{font-family:'Playfair Display',serif;font-size:clamp(14px,2.8vw,20px);color:#fff;letter-spacing:.06em}
.style-luxury .coupon-fine{font-size:9px;color:rgba(255,255,255,.38);margin-top:2px}
.style-luxury .footer-bar{position:absolute;bottom:14px;left:26px;right:26px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(212,175,55,.2);padding-top:8px}
.style-luxury .phone-num{font-family:'Playfair Display',serif;font-size:clamp(14px,3vw,22px);color:rgba(212,175,55,.9);line-height:1;letter-spacing:.04em}
.style-luxury .addr-txt{font-size:clamp(8px,1.6vw,10px);color:rgba(255,255,255,.35);margin-top:2px}
.style-luxury .qr-wrap{display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0}
.style-luxury .qr-box{width:40px;height:40px;background:#fff;border-radius:2px;padding:3px}
.style-luxury .qr-scan{font-size:8px;color:rgba(212,175,55,.4);letter-spacing:.1em;text-transform:uppercase}

/* RETRO POSTER CONTENT */
.style-bright .ad-content{justify-content:space-between;padding:0}
.style-bright .name-block{position:absolute;top:8px;left:16px;right:16px;z-index:10}
.style-bright .name-line1{font-family:'Oswald',sans-serif;font-weight:700;font-size:clamp(20px,4.2vw,32px);letter-spacing:.06em;text-transform:uppercase;color:#fff;text-shadow:1px 2px 6px rgba(0,0,0,.35);line-height:1}
.style-bright .tagline-txt{font-family:'Dancing Script',cursive;font-size:clamp(13px,2.8vw,18px);color:rgba(255,255,255,.85);display:block;margin-top:2px}
.style-bright .bottom-block{padding:0 16px 0}
.style-bright .coupon-strip{background:rgba(0,0,0,.82);padding:9px 16px;clip-path:polygon(0 5px,16px 0,100% 3px,100% calc(100% - 3px),calc(100% - 16px) 100%,0 calc(100% - 5px));display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.style-bright .coupon-left{}
.style-bright .coupon-amount{font-family:'Bebas Neue',sans-serif;font-size:clamp(24px,5vw,36px);color:#fff;line-height:1;letter-spacing:.02em}
.style-bright .coupon-item{font-family:'Dancing Script',cursive;font-size:clamp(14px,3vw,19px);color:var(--accent-color,#FF6B35);line-height:1}
.style-bright .coupon-fine{font-size:8.5px;color:rgba(255,255,255,.4);margin-top:1px}
.style-bright .coupon-badge{background:var(--accent-color,#FF6B35);color:#fff;font-family:'Oswald',sans-serif;font-size:clamp(9px,1.8vw,11px);font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:4px 10px;border-radius:20px}
.style-bright .menu-section{display:flex;flex-direction:column;align-items:flex-end;gap:5px;margin-bottom:10px}
.style-bright .menu-item{background:rgba(0,0,0,.7);color:#fff;font-family:'DM Sans',sans-serif;font-size:clamp(10px,2vw,12px);font-weight:600;padding:4px 12px;border-radius:20px;border-left:3px solid var(--accent-color,#FF6B35)}
.style-bright .footer-bar{background:rgba(0,0,0,.88);padding:9px 16px;display:flex;align-items:center;justify-content:space-between}
.style-bright .phone-num{font-family:'Bebas Neue',sans-serif;font-size:clamp(18px,3.8vw,26px);letter-spacing:.06em;color:#fff;line-height:1}
.style-bright .addr-txt{font-size:clamp(8px,1.6vw,10px);color:rgba(255,255,255,.4);margin-top:1px}
.style-bright .qr-wrap{display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0}
.style-bright .qr-box{width:40px;height:40px;background:#fff;border-radius:3px;padding:3px}
.style-bright .qr-scan{font-size:8px;color:rgba(255,255,255,.3);letter-spacing:.1em;text-transform:uppercase}

/* NEON CONTENT */
.style-clean .ad-content{justify-content:space-between;padding:0}
.style-clean .name-block{padding:22px 20px 0}
.style-clean .name-line1{font-family:'Playfair Display',serif;font-weight:900;font-style:italic;font-size:clamp(28px,6vw,48px);color:#fff;line-height:.92;text-shadow:0 0 20px var(--accent-color,#0088FF),0 0 40px rgba(0,100,200,.4)}
.style-clean .name-line2{font-family:'Playfair Display',serif;font-weight:700;font-size:clamp(20px,4.2vw,34px);color:var(--accent-color,#0088FF);display:block;line-height:.95;text-shadow:0 0 16px var(--accent-color,#0088FF)}
.style-clean .tagline-txt{font-family:'DM Sans',sans-serif;font-size:clamp(8px,1.6vw,10px);font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:rgba(255,255,255,.4);margin-top:8px}
.style-clean .bottom-block{padding:0 18px 0}
.style-clean .menu-section{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px}
.style-clean .menu-item{font-family:'DM Sans',sans-serif;font-size:clamp(9px,1.8vw,11px);font-weight:600;color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:20px;padding:3px 10px;background:rgba(255,255,255,.05)}
.style-clean .coupon-box{border:1.5px solid var(--accent-color,#0088FF);border-radius:4px;padding:9px 14px;background:rgba(0,0,0,.5);box-shadow:0 0 12px rgba(0,100,200,.2);display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.style-clean .coupon-amount{font-family:'Bebas Neue',sans-serif;font-size:clamp(22px,4.5vw,32px);letter-spacing:.04em;color:#fff;text-shadow:0 0 10px var(--accent-color,#0088FF)}
.style-clean .coupon-item{font-family:'Crimson Pro',serif;font-style:italic;font-size:clamp(12px,2.5vw,16px);color:var(--accent-color,#0088FF)}
.style-clean .coupon-fine{font-size:8.5px;color:rgba(255,255,255,.3);margin-top:2px}
.style-clean .footer-bar{background:rgba(0,0,0,.9);border-top:1px solid var(--accent-color,#0088FF);padding:9px 16px;display:flex;align-items:center;justify-content:space-between}
.style-clean .phone-num{font-family:'Bebas Neue',sans-serif;font-size:clamp(18px,3.8vw,26px);letter-spacing:.06em;color:#fff;line-height:1;text-shadow:0 0 10px var(--accent-color,#0088FF)}
.style-clean .addr-txt{font-size:clamp(8px,1.6vw,10px);color:rgba(255,255,255,.35);margin-top:1px}
.style-clean .qr-wrap{display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0}
.style-clean .qr-box{width:40px;height:40px;background:#fff;border-radius:3px;padding:3px}
.style-clean .qr-scan{font-size:8px;color:rgba(255,255,255,.3);letter-spacing:.1em;text-transform:uppercase}

/* EMPTY STATE */
.empty-state{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:36px;background:#1a1a1a}
.empty-state.hidden{display:none}
.ei{font-size:44px;opacity:.28}
.et{font-family:'Crimson Pro',serif;font-size:19px;font-style:italic;color:rgba(255,255,255,.4)}
.es{font-size:11.5px;color:rgba(255,255,255,.28);line-height:1.6}

/* AI BADGE */
.ai-badge{position:absolute;top:10px;right:10px;z-index:30;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);border-radius:20px;padding:5px 10px;display:none;align-items:center;gap:6px;font-size:10px;color:rgba(255,255,255,.7);font-family:'DM Sans',sans-serif}
.ai-badge.visible{display:flex}
.ai-badge-dot{width:6px;height:6px;border-radius:50%;background:#a78bfa;animation:pulse-dot 2s infinite}
@keyframes pulse-dot{0%,100%{opacity:1}50%{opacity:.4}}

/* LOADING OVERLAY */
.loading-overlay{position:absolute;inset:0;z-index:50;background:rgba(15,10,5,.85);display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px}
.loading-overlay.active{display:flex}
.load-spinner{width:44px;height:44px;border:3px solid rgba(255,255,255,.1);border-top-color:#a78bfa;border-radius:50%;animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.load-txt{font-family:'Crimson Pro',serif;font-size:17px;font-style:italic;color:rgba(255,255,255,.65)}
.load-step{font-size:11px;color:rgba(255,255,255,.3);text-align:center;max-width:260px;line-height:1.5}
.load-progress{width:200px;height:3px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden}
.load-progress-bar{height:100%;background:linear-gradient(90deg,#a78bfa,#60a5fa);border-radius:2px;width:0%;transition:width .5s ease}

/* COST STRIP */
.cost-strip{width:100%;max-width:500px;background:rgba(0,0,0,.06);border-radius:7px;padding:8px 13px;display:none;align-items:center;justify-content:space-between;font-size:11px;color:var(--ink-mid)}
.cost-strip.visible{display:flex}
.cost-model{font-weight:600;color:var(--ink)}
.cost-amt{color:var(--ink-light)}

@media(max-width:900px){.layout{grid-template-columns:1fr}.ppanel{padding:20px 14px}}
</style>
</head>
<body>

<header class="hdr">
  <div class="brand">My Town <span>Postcard</span></div>
  <div class="hdr-badge">✦ Ad Generator v5 — Hybrid AI</div>
</header>

<div class="layout">

  <!-- ══ FORM PANEL ══ -->
  <div class="fpanel">
    <div class="ptitle">Build Your Ad</div>
    <div class="psub">Step 1: Preview instantly. Step 2: AI enhances the background atmosphere — all text stays crisp and accurate.</div>

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
      <div class="field"><label>Business Name *</label><input type="text" id="bizName" placeholder="e.g. El Campesino" oninput="renderAd()"></div>
      <div class="field"><label>Tagline / Slogan</label><input type="text" id="tagline" placeholder="e.g. Auténtico Mexican Cuisine" oninput="renderAd()"></div>
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
          <div class="upload-sub">Your food, storefront, product</div>
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
      <div class="field"><label>Offer Text</label><input type="text" id="offer" placeholder="e.g. $1 OFF Any Item · 1 per visit" oninput="renderAd()"></div>
    </div>

    <!-- Design Style -->
    <div class="fsec">
      <div class="slbl">Design Style</div>
      <div class="style-grid">
        <div class="scard">
          <input type="radio" name="style" id="s-rustic" value="rustic" checked onchange="renderAd()">
          <label for="s-rustic"><div class="swatch" style="background:linear-gradient(135deg,#e8dcc8,#8B4513)"></div><div class="sinfo"><div class="sname">Rustic Layered</div><div class="sdesc">Brush strokes, cursive, ribbon</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-dark" value="dark" onchange="renderAd()">
          <label for="s-dark"><div class="swatch" style="background:linear-gradient(135deg,#0a0a0f,#3D0A0A)"></div><div class="sinfo"><div class="sname">Dark Cinematic</div><div class="sdesc">Dramatic, bold, high contrast</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-bold" value="bold" onchange="renderAd()">
          <label for="s-bold"><div class="swatch" style="background:linear-gradient(135deg,#f5f5f5,#1a1a1a 60%)"></div><div class="sinfo"><div class="sname">Editorial Magazine</div><div class="sdesc">White panel, Playfair italic</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-luxury" value="luxury" onchange="renderAd()">
          <label for="s-luxury"><div class="swatch" style="background:linear-gradient(135deg,#1a1410,#C8952A)"></div><div class="sinfo"><div class="sname">Luxury Centered</div><div class="sdesc">Gold frame, corner ornaments</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-bright" value="bright" onchange="renderAd()">
          <label for="s-bright"><div class="swatch" style="background:linear-gradient(135deg,#FF6B35,#FFF0F3)"></div><div class="sinfo"><div class="sname">Retro Poster</div><div class="sdesc">Torn coupon strip, pill badges</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-clean" value="clean" onchange="renderAd()">
          <label for="s-clean"><div class="swatch" style="background:linear-gradient(135deg,#001233,#0088FF)"></div><div class="sinfo"><div class="sname">Neon Night</div><div class="sdesc">Glowing name, electric accents</div></div></label>
          <div class="selbadge">✓</div>
        </div>
      </div>
    </div>

    <!-- Accent Color -->
    <div class="fsec">
      <div class="slbl">Accent Color</div>
      <div class="crow">
        <div class="chip"><input type="radio" name="color" id="c-red" value="#E63946" checked onchange="renderAd()"><label for="c-red" style="background:#E63946"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-burg" value="#7C1C2E" onchange="renderAd()"><label for="c-burg" style="background:#7C1C2E"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-navy" value="#1B3A6B" onchange="renderAd()"><label for="c-navy" style="background:#1B3A6B"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-green" value="#1E5128" onchange="renderAd()"><label for="c-green" style="background:#1E5128"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-orange" value="#C85A11" onchange="renderAd()"><label for="c-orange" style="background:#C85A11"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-gold" value="#C8952A" onchange="renderAd()"><label for="c-gold" style="background:#C8952A"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-teal" value="#0D7377" onchange="renderAd()"><label for="c-teal" style="background:#0D7377"></label></div>
        <div class="chip"><input type="radio" name="color" id="c-bright" value="#FF6B35" onchange="renderAd()"><label for="c-bright" style="background:#FF6B35"></label></div>
      </div>
    </div>

    <div style="margin-top:6px;padding-top:16px;border-top:1px solid var(--border)">
      <div class="slbl" style="margin-bottom:8px">AI Background Enhancement</div>
      <div style="font-size:11.5px;color:var(--ink-light);line-height:1.6;margin-bottom:10px">
        AI analyzes your photo and generates a custom atmospheric background — textures, lighting, decorative elements. All text stays as crisp HTML. ~$0.04 per use, ~20 seconds.
      </div>
      <button class="ai-btn" id="aiBtn" onclick="aiEnhance()" disabled>
        <span class="ai-spark">✨</span> Generate Ad with AI
      </button>
    </div>
  </div>

  <!-- ══ PREVIEW PANEL ══ -->
  <div class="ppanel">
    <div class="ptoolbar">
      <div class="plabel">Ad Preview</div>
      <div class="tactions">
        <button class="tbtn" id="shuffleBtn" onclick="shufflePhoto()" disabled>⟳ New Photo</button>
        <button class="tbtn" id="regenAiBtn" onclick="aiEnhance()" disabled style="display:none">↺ Re-enhance</button>
        <button class="tbtn primary" id="useBtn" onclick="useAd()" disabled>✓ Use This Ad</button>
      </div>
    </div>

    <div style="width:100%;max-width:500px;position:relative">
      <div class="ad-wrap" id="adWrap">
        <div class="empty-state" id="emptyState">
          <div class="ei">✦</div>
          <div class="et">Your ad will appear here</div>
          <div class="es">Select your industry, enter your business name, choose a photo and style. Renders instantly — no waiting.</div>
        </div>

        <div class="ad-bg-photo" id="adBgPhoto"></div>
        <div class="ad-bg-ai" id="adBgAi"></div>
        <div id="adOverlays"></div>
        <div class="ad-content" id="adContent"></div>

        <div class="ai-badge" id="aiBadge">
          <div class="ai-badge-dot"></div>
          AI Enhanced
        </div>

        <div class="loading-overlay" id="loadingOverlay">
          <div class="load-spinner"></div>
          <div class="load-txt">Enhancing your ad...</div>
          <div class="load-step" id="loadStep">Analyzing your photo</div>
          <div class="load-progress"><div class="load-progress-bar" id="progressBar"></div></div>
        </div>
      </div>
    </div>

    <div class="cost-strip" id="costStrip">
      <span>Background by <span class="cost-model">GPT-4o Vision + DALL·E 3</span></span>
      <span class="cost-amt">~$0.04</span>
    </div>

    <div style="max-width:500px;width:100%;font-size:11px;color:var(--ink-light);line-height:1.6;text-align:center;padding:0 8px">
      Typography, menu items, coupon, phone &amp; QR are always crisp HTML — only the background atmosphere is AI-generated.
    </div>
  </div>
</div>

<script>
const INDUSTRIES = {
"Pizza Restaurant":{photos:["https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80","https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80","https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=800&q=80"],colors:{accent:"#c0392b"},taglines:["Hand-Tossed. Oven Fresh.","The Best Slice in Town!"],menu:["Large Pizza $14.99","Family Special $24.99","Wings & Pizza Combo","Free Delivery"]},
"Mexican Restaurant":{photos:["https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&q=80","https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=800&q=80","https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?w=800&q=80"],colors:{accent:"#e67e22"},taglines:["Auténtico Mexican Cuisine","Family Recipes Since 1992"],menu:["Taco Tuesday $1 Each","Margarita Happy Hour","Family Fajita Platter","Free Chips & Salsa"]},
"Chinese Restaurant":{photos:["https://images.unsplash.com/photo-1525755662778-989d0524087e?w=800&q=80","https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=80"],colors:{accent:"#c0392b"},taglines:["Authentic Asian Flavors","Wok-Fired Perfection"],menu:["Lunch Special $8.99","Family Dinner $29.99","Free Egg Roll w/ Order","Catering Available"]},
"Breakfast & Cafe":{photos:["https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=800&q=80","https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80","https://images.unsplash.com/photo-1541167760496-1628856ab772?w=800&q=80"],colors:{accent:"#c8541a"},taglines:["Made From Scratch Daily","Coffee · Biscuits · Smiles"],menu:["Breakfast Plate $8.99","Specialty Coffee $4.49","Bagel & Cream Cheese","Drive-Thru Available"]},
"Bar & Grill":{photos:["https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80","https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80"],colors:{accent:"#dc2626"},taglines:["Where Locals Gather","Burgers · Beer · Good Times"],menu:["Half-Price Wings","Happy Hour 4-6pm","Burger & Beer Combo","Live Music Weekends"]},
"Italian Restaurant":{photos:["https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80","https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80"],colors:{accent:"#dc2626"},taglines:["Authentic Italian Cuisine","Buon Appetito!"],menu:["Pasta Special $12.99","Wine & Dine for 2","Wood-Fired Pizza","Tiramisu Made Daily"]},
"Bakery":{photos:["https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&q=80","https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&q=80"],colors:{accent:"#92400e"},taglines:["Fresh Baked Daily","Artisan Breads & Pastries"],menu:["Custom Cakes","Fresh Bread Daily","Birthday Specials","Wedding Cakes"]},
"Coffee Shop":{photos:["https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80","https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80"],colors:{accent:"#5d4037"},taglines:["Locally Roasted, Locally Loved","Your Daily Ritual"],menu:["Specialty Lattes","Cold Brew on Tap","Pastries Daily","Free WiFi"]},
"Dentist":{photos:["https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=800&q=80","https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800&q=80"],colors:{accent:"#1e3a5f"},taglines:["Accepting New Patients!","Your Smile is Our Priority"],menu:["Cleanings & Exams","Cosmetic Dentistry","Emergency Care","Insurance Accepted"]},
"HVAC":{photos:["https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=800&q=80","https://images.unsplash.com/photo-1566917064245-1c6bff30dbf1?w=800&q=80"],colors:{accent:"#003f6b"},taglines:["24/7 Emergency Service","Heating & Cooling Experts"],menu:["A/C Tune-Up Special","Free Estimates","Emergency Service 24/7","Financing Available"]},
"Real Estate":{photos:["https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80","https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80"],colors:{accent:"#2d6a4f"},taglines:["Your Local Real Estate Expert","Buying or Selling? Call Me!"],menu:["Free Home Valuation","Buyer Representation","Listing Services","Investment Properties"]},
"Auto Repair":{photos:["https://images.unsplash.com/photo-1486006920555-c77dcf18193c?w=800&q=80","https://images.unsplash.com/photo-1593142927747-8c1b758967a6?w=800&q=80"],colors:{accent:"#dc2626"},taglines:["Honest Auto Repair","ASE Certified Mechanics"],menu:["Oil Change Special","Brake Service","AC Repair","Free Estimates"]},
"Salon & Beauty":{photos:["https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&q=80","https://images.unsplash.com/photo-1562322140-8baeececf3df?w=800&q=80"],colors:{accent:"#9d174d"},taglines:["Look Beautiful. Feel Confident.","Cuts · Color · Style"],menu:["Cut & Color Special","Wedding Hair","Bridal Packages","Walk-Ins Welcome"]},
"Gym & Fitness":{photos:["https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80","https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80"],colors:{accent:"#dc2626"},taglines:["Stronger Every Day","Get Fit. Feel Great."],menu:["Free 7-Day Trial","Personal Training","Group Classes","24/7 Access"]},
"Other Service":{photos:["https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80","https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=800&q=80"],colors:{accent:"#374151"},taglines:["Quality Service You Can Trust","Locally Owned & Operated"],menu:["Free Consultation","Quality Service","Satisfaction Guaranteed","Local & Trusted"]},
};

let selectedPhotoUrl = null;
let uploadedPhotoUrl = null;
let currentIndustryPhotos = [];
let currentPhotoIndex = 0;
let aiEnhanced = false;

const QR_SVG = \`<svg width="36" height="36" viewBox="0 0 44 44" fill="none">
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
  loadPhotos(ind, data.photos);
  renderAd();
}

async function loadPhotos(industry, fallback){
  const grid = document.getElementById('imgGrid');
  grid.innerHTML = '<div class="img-loading">Loading photos...</div>';
  let photos = fallback || [];
  try {
    const res = await fetch(\`/api/image-library?industry=\${encodeURIComponent(industry)}\`);
    const data = await res.json();
    if(data.images && data.images.length){
      photos = data.images.map(i => ({ url: i.image_url, thumb: i.thumb_url, credit: i.photographer_credit }));
    }
  } catch(e) { /* use fallback */ }

  currentIndustryPhotos = photos;
  if(!photos.length){
    grid.innerHTML = '<div class="img-none">No photos yet — upload your own above.</div>';
    return;
  }
  grid.innerHTML = '';
  photos.forEach((p,i) => {
    const url = typeof p==='string' ? p : p.url;
    const thumb = typeof p==='string' ? p : (p.thumb || p.url);
    const div = document.createElement('div');
    div.className = 'img-thumb' + (i===0?' selected':'');
    div.onclick = () => selectPhoto(url, div);
    div.innerHTML = \`<img src="\${thumb}" loading="lazy"><div class="sel-check">✓</div>\`;
    grid.appendChild(div);
  });
  selectedPhotoUrl = typeof photos[0]==='string' ? photos[0] : photos[0].url;
  currentPhotoIndex = 0;
  document.getElementById('shuffleBtn').disabled = false;
  renderAd();
}

function selectPhoto(url, el){
  selectedPhotoUrl = url; uploadedPhotoUrl = null;
  document.getElementById('uploadPreview').style.display = 'none';
  document.querySelectorAll('.img-thumb').forEach(t => t.classList.remove('selected'));
  el.classList.add('selected');
  resetAiEnhancement();
  renderAd();
}

function shufflePhoto(){
  if(!currentIndustryPhotos.length) return;
  currentPhotoIndex = (currentPhotoIndex+1) % currentIndustryPhotos.length;
  const p = currentIndustryPhotos[currentPhotoIndex];
  selectedPhotoUrl = typeof p==='string' ? p : p.url;
  document.querySelectorAll('.img-thumb').forEach((t,i) => t.classList.toggle('selected', i===currentPhotoIndex));
  resetAiEnhancement();
  renderAd();
}

function handlePhotoUpload(input){
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    uploadedPhotoUrl = e.target.result; selectedPhotoUrl = uploadedPhotoUrl;
    const prev = document.getElementById('uploadPreview');
    prev.src = uploadedPhotoUrl; prev.style.display = 'block';
    document.querySelectorAll('.img-thumb').forEach(t => t.classList.remove('selected'));
    resetAiEnhancement();
    renderAd();
  };
  reader.readAsDataURL(file);
}

function resetAiEnhancement(){
  aiEnhanced = false;
  const bg = document.getElementById('adBgAi');
  bg.classList.remove('loaded'); bg.style.backgroundImage = '';
  document.getElementById('aiBadge').classList.remove('visible');
  document.getElementById('costStrip').classList.remove('visible');
  document.getElementById('regenAiBtn').style.display = 'none';
}

function buildMenu(items){ const l = document.getElementById('menuList'); l.innerHTML = ''; items.forEach(i => addMenuItem(i)); }
function addMenuItem(val=''){
  const l = document.getElementById('menuList');
  const r = document.createElement('div'); r.className = 'mrow';
  r.innerHTML = \`<input type="text" placeholder="e.g. Tacos $1 Each" value="\${val}" oninput="renderAd()"><button class="rm-btn" onclick="this.parentElement.remove();renderAd()">×</button>\`;
  l.appendChild(r);
}
function getMenu(){ return Array.from(document.querySelectorAll('.mrow input')).map(i => i.value.trim()).filter(Boolean); }

function getFormData(){
  return {
    bizName:  document.getElementById('bizName').value.trim() || 'Business Name',
    tagline:  document.getElementById('tagline').value.trim(),
    phone:    document.getElementById('phone').value.trim(),
    city:     document.getElementById('city').value.trim(),
    address:  document.getElementById('address').value.trim(),
    website:  document.getElementById('website').value.trim(),
    menu:     getMenu(),
    offer:    document.getElementById('offer').value.trim(),
    style:    document.querySelector('input[name="style"]:checked')?.value || 'rustic',
    color:    document.querySelector('input[name="color"]:checked')?.value || '#E63946',
    photo:    selectedPhotoUrl || '',
    industry: document.getElementById('industry').value || 'Other Service',
  };
}

function parseCoupon(offer){
  if(!offer) return null;
  const parts = offer.split('·');
  const main = parts[0].trim();
  const fine = parts[1]?.trim() || '1 per visit · with this postcard';
  const m = main.match(/^(\\$[\\d.]+\\s+OFF)\\s+(.+)$/i);
  return m ? {amount:m[1],item:m[2],fine} : {amount:main,item:'',fine};
}

function footerHTML(d, style){
  const addr = [d.address, d.city].filter(Boolean).join(', ');
  return \`<div class="footer-bar">
    <div class="footer-left">
      <div class="phone-row">
        \${style==='rustic'?\`<div class="phone-icon">☎</div>\`:''}
        <div class="phone-num">\${d.phone||'—'}</div>
      </div>
      <div class="addr-txt">\${addr}</div>
    </div>
    <div class="qr-wrap"><div class="qr-box">\${QR_SVG}</div><div class="qr-scan">Scan</div></div>
  </div>\`;
}

function renderAd(){
  const d = getFormData();
  const wrap = document.getElementById('adWrap');
  const empty = document.getElementById('emptyState');
  const bgPhoto = document.getElementById('adBgPhoto');
  const overlays = document.getElementById('adOverlays');
  const content = document.getElementById('adContent');
  const ac = d.color;

  wrap.classList.add('visible');
  empty.classList.add('hidden');
  wrap.className = \`ad-wrap visible style-\${d.style}\`;
  wrap.style.setProperty('--accent-color', ac);

  if(d.photo) bgPhoto.style.backgroundImage = \`url('\${d.photo}')\`;
  else bgPhoto.style.backgroundImage = 'none';

  let overlayHTML = '';
  if(d.style==='rustic'){
    overlayHTML = \`<div class="ad-overlay"></div><div class="ad-brush"></div><div class="ad-ornament">— ✦ —</div>\`;
  } else if(d.style==='dark'){
    overlayHTML = \`<div class="ad-overlay"></div>\`;
  } else if(d.style==='bold'){
    overlayHTML = \`<div class="ad-overlay"></div><div class="ad-white-panel"></div><div class="ad-stripe"></div>\`;
  } else if(d.style==='luxury'){
    overlayHTML = \`<div class="ad-overlay"></div><div class="ad-frame"></div><div class="ad-frame2"></div>
      <div class="ad-corner tl"></div><div class="ad-corner tr"></div><div class="ad-corner bl"></div><div class="ad-corner br"></div>\`;
  } else if(d.style==='bright'){
    overlayHTML = \`<div class="ad-overlay"></div><div class="ad-banner"></div>\`;
  } else if(d.style==='clean'){
    overlayHTML = \`<div class="ad-overlay"></div><div class="ad-neon-bar"></div>\`;
  }
  overlays.innerHTML = overlayHTML;

  const words = d.bizName.trim().split(/\\s+/);
  const n1 = words.length > 1 ? words.slice(0,-1).join(' ') : d.bizName;
  const n2 = words.length > 1 ? words[words.length-1] : '';
  const cp = parseCoupon(d.offer);
  const menuItems = d.menu.slice(0,4);

  let contentHTML = '';

  if(d.style==='rustic'){
    const menuHTML = menuItems.map(item => \`
      <div class="menu-item"><div class="menu-check">✓</div><div class="menu-txt">\${item}</div></div>\`).join('');
    const couponHTML = cp ? \`
      <div class="coupon-box">
        <div class="coupon-left">
          <div class="coupon-amount">\${cp.amount}</div>
          <div class="coupon-item">\${cp.item||'Any Item'}</div>
          <div class="coupon-fine">\${cp.fine}</div>
        </div>
        <div style="text-align:center;padding-left:8px">
          <div style="font-size:9px;color:rgba(255,255,255,.4);letter-spacing:.08em;text-transform:uppercase;font-family:'DM Sans',sans-serif">With<br>Postcard</div>
        </div>
      </div>\` : '';
    contentHTML = \`
      <div class="name-block">
        <div class="name-line1">\${n1}</div>
        <span class="name-script">\${n2||d.bizName}</span>
        \${d.tagline?\`<span class="tagline-txt">\${d.tagline}</span>\`:''}
      </div>
      <div class="bottom-block">
        \${menuItems.length?\`<div class="menu-section">\${menuHTML}</div>\`:''}
        \${couponHTML}
        \${footerHTML(d,'rustic')}
      </div>\`;

  } else if(d.style==='dark'){
    const menuHTML = menuItems.map(item => \`
      <div class="menu-item"><div class="menu-dot"></div><div class="menu-txt">\${item}</div></div>\`).join('');
    const couponHTML = cp ? \`
      <div class="coupon-box">
        <div><div class="coupon-amount">\${cp.amount}\${cp.item?' '+cp.item:''}</div><div class="coupon-fine">\${cp.fine}</div></div>
      </div>\` : '';
    contentHTML = \`
      <div class="name-block">
        <div class="name-line1">\${n1}</div>
        \${n2?\`<span class="name-line2">\${n2}</span>\`:''}
        \${d.tagline?\`<div class="tagline-txt">\${d.tagline}</div>\`:''}
      </div>
      <div class="bottom-block">
        \${menuItems.length?\`<div class="menu-section">\${menuHTML}</div>\`:''}
        \${couponHTML}
        \${footerHTML(d,'dark')}
      </div>\`;

  } else if(d.style==='bold'){
    const menuHTML = menuItems.map(item => {
      const m = item.match(/^(.+?)\\s+(\\$[\\d.]+.*)$/);
      return m ? \`<div class="menu-item"><span class="menu-txt">\${m[1]}</span><span class="menu-txt" style="color:var(--accent-color,#E63946);font-weight:700">\${m[2]}</span></div>\`
               : \`<div class="menu-item"><span class="menu-txt">\${item}</span></div>\`;
    }).join('');
    const couponHTML = cp ? \`<div class="coupon-box"><div class="coupon-amount">\${cp.amount}\${cp.item?' '+cp.item:''}</div><div class="coupon-fine">\${cp.fine}</div></div>\` : '';
    contentHTML = \`
      <div class="name-block">
        <div class="name-line1">\${n1}</div>
        \${n2?\`<span class="name-line2">\${n2}</span>\`:''}
        \${d.tagline?\`<div class="tagline-txt">\${d.tagline}</div>\`:''}
      </div>
      <div class="bottom-block">
        \${menuItems.length?\`<div class="menu-section">\${menuHTML}</div>\`:''}
        \${couponHTML}
        \${footerHTML(d,'bold')}
      </div>\`;

  } else if(d.style==='luxury'){
    const menuHTML = menuItems.map(item => \`<div class="menu-item">\${item}</div>\`).join('');
    const couponHTML = cp ? \`<div class="coupon-box"><div class="coupon-amount">\${cp.amount}\${cp.item?' '+cp.item:''}</div><div class="coupon-fine">\${cp.fine}</div></div>\` : '';
    contentHTML = \`
      <div class="name-block">
        <span class="ornament-txt">— ✦ —</span>
        <div class="name-line1">\${d.bizName}</div>
        \${d.tagline?\`<span class="tagline-txt">\${d.tagline}</span>\`:''}
      </div>
      <div class="gold-rule"></div>
      \${menuItems.length?\`<div class="menu-section">\${menuHTML}</div>\`:''}
      \${couponHTML}
      \${footerHTML(d,'luxury')}\`;

  } else if(d.style==='bright'){
    const menuHTML = menuItems.map(item => \`<div class="menu-item">\${item}</div>\`).join('');
    const couponHTML = cp ? \`
      <div class="coupon-strip">
        <div class="coupon-left">
          <div class="coupon-amount">\${cp.amount}</div>
          <div class="coupon-item">\${cp.item||'Any Item'}</div>
          <div class="coupon-fine">\${cp.fine}</div>
        </div>
        <div class="coupon-badge">With Card</div>
      </div>\` : '';
    contentHTML = \`
      <div class="name-block">
        <div class="name-line1">\${d.bizName}</div>
        \${d.tagline?\`<span class="tagline-txt">\${d.tagline}</span>\`:''}
      </div>
      <div class="bottom-block">
        \${couponHTML}
        \${menuItems.length?\`<div class="menu-section">\${menuHTML}</div>\`:''}
        \${footerHTML(d,'bright')}
      </div>\`;

  } else if(d.style==='clean'){
    const menuHTML = menuItems.map(item => \`<div class="menu-item">\${item}</div>\`).join('');
    const couponHTML = cp ? \`
      <div class="coupon-box">
        <div class="coupon-amount">\${cp.amount}</div>
        <div style="text-align:right"><div class="coupon-item">\${cp.item||'Any Item'}</div><div class="coupon-fine">\${cp.fine}</div></div>
      </div>\` : '';
    contentHTML = \`
      <div class="name-block">
        <div class="name-line1">\${n1}</div>
        \${n2?\`<span class="name-line2">\${n2}</span>\`:''}
        \${d.tagline?\`<div class="tagline-txt">\${d.tagline}</div>\`:''}
      </div>
      <div class="bottom-block">
        \${menuItems.length?\`<div class="menu-section">\${menuHTML}</div>\`:''}
        \${couponHTML}
        \${footerHTML(d,'clean')}
      </div>\`;
  }

  content.innerHTML = contentHTML;
  document.getElementById('useBtn').disabled = false;
  document.getElementById('aiBtn').disabled = false;
}

async function aiEnhance(){
  if(!selectedPhotoUrl){ alert('Please select a hero photo first.'); return; }
  const d = getFormData();
  if(!d.bizName || d.bizName==='Business Name'){ alert('Please enter your business name first.'); return; }

  const overlay = document.getElementById('loadingOverlay');
  const progressBar = document.getElementById('progressBar');
  const loadStep = document.getElementById('loadStep');
  overlay.classList.add('active');
  document.getElementById('aiBtn').disabled = true;

  const steps = [
    {txt:'Analyzing your photo with GPT-4o Vision...', pct:15},
    {txt:'Reading lighting, composition, and mood...', pct:30},
    {txt:'Crafting background generation prompt...', pct:45},
    {txt:'DALL·E 3 generating atmosphere layer...', pct:60},
    {txt:'Adding textures, lighting, decorative elements...', pct:80},
    {txt:'Finalizing your enhanced background...', pct:92},
  ];
  let si = 0;
  const iv = setInterval(() => {
    if(si < steps.length){ loadStep.textContent = steps[si].txt; progressBar.style.width = steps[si].pct+'%'; si++; }
  }, 3200);

  try {
    const res = await fetch('/api/ai-enhance', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        photoUrl: selectedPhotoUrl,
        bizName:  d.bizName,
        industry: d.industry,
        style:    d.style,
        color:    d.color,
        tagline:  d.tagline,
      })
    });

    clearInterval(iv);
    progressBar.style.width = '100%';

    if(!res.ok){
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || \`Server error \${res.status}\`);
    }

    const data = await res.json();
    if(data.error) throw new Error(data.error);
    const bgUrl = data.backgroundUrl;
    if(!bgUrl) throw new Error('No background image returned. Please try again.');

    const aiBg = document.getElementById('adBgAi');
    aiBg.style.backgroundImage = \`url('\${bgUrl}')\`;
    setTimeout(() => aiBg.classList.add('loaded'), 100);

    aiEnhanced = true;
    window.lastAiBgUrl = bgUrl;

    document.getElementById('aiBadge').classList.add('visible');
    document.getElementById('costStrip').classList.add('visible');
    document.getElementById('regenAiBtn').style.display = 'inline-flex';
    document.getElementById('useBtn').disabled = false;

  } catch(err){
    clearInterval(iv);
    alert('AI Enhancement failed: ' + err.message);
  } finally {
    overlay.classList.remove('active');
    progressBar.style.width = '0%';
    document.getElementById('aiBtn').disabled = false;
  }
}

async function useAd(){
  const d = getFormData();
  const params = new URLSearchParams(location.search);
  const leadId = params.get('leadId');
  const btn = document.getElementById('useBtn');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    const r = await fetch('/api/ad-generator-v5/save', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        leadId,
        adHtml: document.getElementById('adContent').innerHTML,
        photoUrl: window.lastAiBgUrl || d.photo,
      }),
    });
    const data = await r.json();
    if(data.ok){
      btn.textContent = '✓ Ad Saved!';
      btn.style.background = '#1a5c3a'; btn.style.borderColor = '#1a5c3a';
    } else {
      btn.disabled = false; btn.textContent = '✓ Use This Ad';
      alert(data.error || 'Error saving ad');
    }
  } catch(e){
    btn.disabled = false; btn.textContent = '✓ Use This Ad';
    alert('Error saving ad. Please try again.');
  }
}

addMenuItem(''); addMenuItem(''); addMenuItem('');
</script>

</body>
</html>`;

export default router;
