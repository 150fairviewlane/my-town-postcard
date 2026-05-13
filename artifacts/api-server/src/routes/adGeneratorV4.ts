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
    await db.update(outreachLeadsTable).set({ notes: noteVal }).where(eq(outreachLeadsTable.id, id));
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
body{font-family:'DM Sans',sans-serif;background:var(--surface);color:var(--ink)}
.hdr{background:var(--ink);padding:14px 32px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid var(--burg)}
.brand{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#fff;letter-spacing:.08em}
.brand span{color:#C8A882}
.hdr-badge{background:var(--burg);color:#fff;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:4px 12px;border-radius:20px}
.layout{display:grid;grid-template-columns:440px 1fr;height:calc(100vh - 55px)}
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
.frow{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.menu-list{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}
.mrow{display:flex;gap:6px;align-items:center}
.mrow input{flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:'DM Sans',sans-serif;font-size:12.5px;color:var(--ink);background:var(--surface);outline:none;transition:border-color .2s}
.mrow input:focus{border-color:var(--burg);background:#fff}
.rm-btn{width:26px;height:26px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-light);cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1}
.rm-btn:hover{border-color:var(--red);color:var(--red);background:#fef2f2}
.add-btn{font-size:11px;font-weight:600;color:var(--burg);background:none;border:1.5px dashed var(--burg);border-radius:6px;padding:6px 12px;cursor:pointer;width:100%;transition:all .2s;font-family:'DM Sans',sans-serif}
.add-btn:hover{background:var(--burg-pale)}
.img-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px}
.img-thumb{position:relative;aspect-ratio:4/3;border-radius:6px;overflow:hidden;cursor:pointer;border:2.5px solid transparent;transition:all .2s}
.img-thumb:hover{transform:scale(1.03)}
.img-thumb.selected{border-color:var(--burg);box-shadow:0 0 0 2px var(--burg)}
.img-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.img-thumb .sel-check{display:none;position:absolute;top:4px;right:4px;background:var(--burg);color:#fff;border-radius:50%;width:18px;height:18px;font-size:10px;font-weight:700;align-items:center;justify-content:center}
.img-thumb.selected .sel-check{display:flex}
.img-loading{grid-column:1/-1;text-align:center;padding:20px;font-size:12px;color:var(--ink-light)}
.img-none{grid-column:1/-1;text-align:center;padding:20px;font-size:12px;color:var(--ink-light);font-style:italic}
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
.crow{display:flex;gap:7px;flex-wrap:wrap;margin-top:2px}
.chip{position:relative}
.chip input[type=radio]{position:absolute;opacity:0;width:0;height:0}
.chip label{width:28px;height:28px;border-radius:50%;display:block;cursor:pointer;border:3px solid transparent;transition:transform .2s,border-color .2s}
.chip input:checked+label{border-color:var(--ink);transform:scale(1.15)}
.chip label:hover{transform:scale(1.1)}
.upload-zone{border:2px dashed var(--border);border-radius:9px;padding:12px;text-align:center;cursor:pointer;transition:all .2s;background:var(--surface);position:relative;overflow:hidden}
.upload-zone:hover{border-color:var(--burg);background:var(--burg-pale)}
.upload-zone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.upload-icon{font-size:20px;margin-bottom:3px}
.upload-txt{font-size:11px;font-weight:600;color:var(--ink-mid)}
.upload-sub{font-size:9.5px;color:var(--ink-light);margin-top:1px}
.upload-preview{width:100%;height:60px;object-fit:cover;border-radius:5px;margin-top:6px;display:none}
.gen-btn{width:100%;padding:13px;background:var(--burg);color:#fff;border:none;border-radius:9px;font-family:'Bebas Neue',sans-serif;font-size:19px;letter-spacing:.12em;cursor:pointer;transition:background .2s,transform .15s;margin-top:6px;display:flex;align-items:center;justify-content:center;gap:9px}
.gen-btn:hover:not(:disabled){background:var(--burg-dark)}
.gen-btn:active:not(:disabled){transform:scale(.98)}
.gen-btn:disabled{background:#bbb;cursor:not-allowed}
.ppanel{background:#E8E4DE;padding:32px;display:flex;flex-direction:column;align-items:center;gap:18px;overflow-y:auto}
.ptoolbar{width:100%;max-width:500px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.plabel{font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:.1em;color:var(--ink-mid)}
.tactions{display:flex;gap:7px;flex-wrap:wrap}
.tbtn{padding:6px 13px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid var(--border);background:var(--card);color:var(--ink-mid);transition:all .2s;font-family:'DM Sans',sans-serif}
.tbtn:hover:not(:disabled){border-color:var(--burg);color:var(--burg)}
.tbtn.primary{background:var(--green);border-color:var(--green);color:#fff}
.tbtn.primary:hover:not(:disabled){background:#144d30}
.tbtn:disabled{opacity:.4;cursor:not-allowed}
.ad-canvas-wrap{width:100%;max-width:500px;position:relative}
#adCanvas{width:100%;aspect-ratio:4/5;position:relative;border-radius:10px;overflow:hidden;box-shadow:0 12px 50px rgba(0,0,0,.22);display:none;background:#111}
#adCanvas.visible{display:block}
.empty-state{width:100%;max-width:500px;aspect-ratio:4/5;background:#1a1a1a;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:36px;box-shadow:0 12px 50px rgba(0,0,0,.22)}
.empty-state.hidden{display:none}
.ei{font-size:44px;opacity:.28}
.et{font-family:'Crimson Pro',serif;font-size:19px;font-style:italic;color:rgba(255,255,255,.4)}
.es{font-size:11.5px;color:rgba(255,255,255,.28);line-height:1.6}

/* ═══════════════════════════════════════════════════════════════
   TEMPLATE 1 — KRAFT & BRUSH  (value: rustic)
   Parchment background · photo shifted right · pennant badge
   Mixed-scale typography: Bebas + giant Dancing Script
   Brush-stroke smear · filled-circle checkmarks · dotted leaders
   Stitched white-dashed coupon on dark background
═══════════════════════════════════════════════════════════════ */
.tpl-kraft{position:relative;width:100%;height:100%;overflow:hidden;
  background:radial-gradient(ellipse at 20% 45%,rgba(200,155,75,.3) 0%,transparent 55%),
             radial-gradient(ellipse at 70% 15%,rgba(180,125,55,.2) 0%,transparent 45%),
             radial-gradient(ellipse at 55% 90%,rgba(155,105,35,.15) 0%,transparent 40%),#E6D2A6}
.tpl-kraft .ad-bg{position:absolute;inset:0;background-size:cover;background-position:65% center;z-index:0;filter:brightness(.88) saturate(1.05)}
.tpl-kraft .ad-photo-wash{position:absolute;inset:0;z-index:1;
  background:linear-gradient(to right,#E6D2A6 28%,rgba(230,210,166,.92) 42%,rgba(230,210,166,.55) 58%,rgba(230,210,166,.05) 78%,transparent 90%)}
/* pennant ribbon badge top-left */
.tpl-kraft .ad-pennant{position:absolute;top:0;left:16px;z-index:10;width:50px;
  background:linear-gradient(to bottom,#C4530A,#7A2E04);
  padding:9px 7px 17px;text-align:center;
  clip-path:polygon(0 0,100% 0,100% 87%,50% 100%,0 87%);
  box-shadow:2px 0 10px rgba(0,0,0,.28)}
.tpl-kraft .ad-pennant-star{font-size:16px;display:block;margin-bottom:3px;color:rgba(255,210,100,.95)}
.tpl-kraft .ad-pennant-txt{font-family:'Bebas Neue',sans-serif;font-size:8px;letter-spacing:.14em;color:rgba(255,220,140,.9);line-height:1.4}
/* starburst speed-lines (positioned SVG via CSS bg) */
.tpl-kraft .ad-starburst{position:absolute;top:6px;right:10px;width:55%;height:44%;z-index:2;pointer-events:none}
/* name block: huge Bebas + massive Dancing Script offset */
.tpl-kraft .ad-name-block{position:absolute;top:10px;left:74px;right:12px;z-index:10}
.tpl-kraft .ad-name-main{font-family:'Bebas Neue',sans-serif;font-size:clamp(30px,6.5vw,54px);letter-spacing:.05em;color:#1a0c04;line-height:1;text-shadow:1px 1px 0 rgba(255,255,255,.25)}
.tpl-kraft .ad-name-script{font-family:'Dancing Script',cursive;font-size:clamp(52px,11vw,90px);color:var(--accent-color,#C4530A);line-height:.8;display:block;transform:rotate(-3deg);text-shadow:2px 3px 8px rgba(0,0,0,.12);transform-origin:left center;margin-top:-4px}
/* tagline - cursive, slightly rotated, mid-left */
.tpl-kraft .ad-tagline{position:absolute;top:50%;left:14px;z-index:10;font-family:'Dancing Script',cursive;font-size:clamp(15px,3.1vw,22px);color:#6B2C0A;transform:rotate(-1.5deg);text-shadow:0 1px 3px rgba(255,255,255,.4);max-width:52%}
/* dark diagonal brush-stroke smear */
.tpl-kraft .ad-brush{position:absolute;left:-10px;right:-10px;top:47%;bottom:60px;z-index:4;background:#140903;
  clip-path:polygon(0 20%,10% 8%,42% 14%,76% 6%,100% 16%,100% 78%,88% 90%,55% 86%,20% 92%,0 82%)}
/* menu - sits over the brush area */
.tpl-kraft .ad-menu{position:absolute;left:14px;right:130px;z-index:10;bottom:72px;display:flex;flex-direction:column;gap:5px}
.tpl-kraft .ad-menu-row{display:flex;align-items:center;gap:6px}
.tpl-kraft .ad-chk{width:22px;height:22px;border-radius:50%;flex-shrink:0;background:var(--accent-color,#C4530A);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}
.tpl-kraft .ad-item-name{font-family:'Oswald',sans-serif;font-weight:600;font-size:clamp(11px,2.2vw,14px);letter-spacing:.06em;text-transform:uppercase;color:#fff;white-space:nowrap}
.tpl-kraft .ad-item-dots{flex:1;border-bottom:2px dotted rgba(255,255,255,.32);margin-bottom:3px;min-width:10px}
.tpl-kraft .ad-item-price{font-family:'Oswald',sans-serif;font-weight:700;font-size:clamp(12px,2.4vw,15px);color:var(--accent-color,#C4530A);white-space:nowrap}
/* stitched coupon: dark container with white dashed inner border */
.tpl-kraft .ad-coupon-wrap{position:absolute;bottom:66px;right:12px;z-index:11;background:#100703;border-radius:5px;padding:4px}
.tpl-kraft .ad-coupon{border:2.5px dashed rgba(255,255,255,.68);border-radius:3px;padding:8px 12px;text-align:center;min-width:112px}
.tpl-kraft .ad-coupon-dollar{font-family:'Bebas Neue',sans-serif;font-size:clamp(30px,6.5vw,52px);color:#fff;letter-spacing:.04em;line-height:.95}
.tpl-kraft .ad-coupon-item{font-family:'Bebas Neue',sans-serif;font-size:clamp(14px,3vw,22px);letter-spacing:.06em;color:var(--accent-color,#C4530A);line-height:1}
.tpl-kraft .ad-coupon-fine{font-size:8.5px;color:rgba(255,255,255,.38);margin-top:3px;font-family:'DM Sans',sans-serif}
/* footer */
.tpl-kraft .ad-footer{position:absolute;bottom:0;left:0;right:0;z-index:12;background:#0e0703;padding:9px 14px;display:flex;align-items:center;justify-content:space-between}
.tpl-kraft .ad-phone-wrap{display:flex;align-items:center;gap:8px}
.tpl-kraft .ad-phone-icon{width:26px;height:26px;border-radius:50%;border:1.5px solid var(--accent-color,#C4530A);color:var(--accent-color,#C4530A);display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
.tpl-kraft .ad-phone{font-family:'Bebas Neue',sans-serif;font-size:clamp(20px,4.2vw,32px);letter-spacing:.06em;color:#fff;line-height:1}
.tpl-kraft .ad-address{font-size:clamp(7.5px,1.5vw,10px);color:rgba(255,255,255,.4);margin-top:1px}
.tpl-kraft .ad-qr-box{width:42px;height:42px;background:#fff;border-radius:2px;padding:3px}
.tpl-kraft .ad-qr-scan{font-family:'Dancing Script',cursive;font-size:12px;color:rgba(255,255,255,.5);text-align:center;margin-top:1px}

/* ═══════════════════════════════════════════════════════════════
   TEMPLATE 2 — DARK WALNUT  (value: dark)
   Very dark brown base · CSS wood-grain · photo fades top→dark
   Logo badge top-left · Playfair Display name · Dancing Script tagline
   Filled-circle checkmarks · dotted menu leaders · stitched coupon
═══════════════════════════════════════════════════════════════ */
.tpl-walnut{position:relative;width:100%;height:100%;overflow:hidden;background:#1a0f08}
.tpl-walnut::before{content:'';position:absolute;inset:0;z-index:0;
  background:repeating-linear-gradient(91deg,transparent 0,transparent 5px,rgba(255,190,100,.009) 5px,rgba(255,190,100,.009) 6px),
             repeating-linear-gradient(88deg,transparent 0,transparent 9px,rgba(255,255,255,.006) 9px,rgba(255,255,255,.006) 10px)}
.tpl-walnut .ad-bg{position:absolute;inset:0;background-size:cover;background-position:center 15%;z-index:1;filter:brightness(.62) saturate(.95)}
.tpl-walnut .ad-photo-fade{position:absolute;inset:0;z-index:2;
  background:linear-gradient(to bottom,rgba(26,15,8,.22) 0%,transparent 20%,transparent 36%,rgba(26,15,8,.65) 55%,#1a0f08 72%,#1a0f08 100%)}
/* initials logo badge */
.tpl-walnut .ad-logo-badge{position:absolute;top:14px;left:14px;z-index:10;
  width:46px;height:46px;border-radius:9px;border:2px solid rgba(255,255,255,.72);
  background:rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center;
  font-family:'Bebas Neue',sans-serif;font-size:18px;color:#fff;letter-spacing:.04em;text-shadow:0 1px 6px rgba(0,0,0,.7)}
/* name + tagline header */
.tpl-walnut .ad-header{position:absolute;top:12px;left:68px;right:14px;z-index:10}
.tpl-walnut .ad-name{font-family:'Playfair Display',serif;font-size:clamp(20px,4.4vw,36px);font-weight:700;color:#fff;line-height:1.05;text-shadow:0 2px 14px rgba(0,0,0,.5)}
.tpl-walnut .ad-tagline{font-family:'Dancing Script',cursive;font-size:clamp(14px,2.9vw,21px);color:var(--accent-color,#C8952A);margin-top:4px;line-height:1.2}
/* menu positioned in dark lower section */
.tpl-walnut .ad-menu{position:absolute;left:14px;right:14px;bottom:68px;z-index:10;display:flex;flex-direction:column;gap:5px}
.tpl-walnut .ad-menu-row{display:flex;align-items:center;gap:7px}
.tpl-walnut .ad-chk{width:21px;height:21px;border-radius:50%;flex-shrink:0;background:var(--accent-color,#C8952A);color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700}
.tpl-walnut .ad-item-name{font-family:'Playfair Display',serif;font-size:clamp(11px,2.2vw,14px);font-weight:600;color:#fff;white-space:nowrap}
.tpl-walnut .ad-item-dots{flex:1;border-bottom:1.5px dotted rgba(255,255,255,.28);margin-bottom:2px;min-width:12px}
.tpl-walnut .ad-item-price{font-family:'Oswald',sans-serif;font-weight:700;font-size:clamp(12px,2.4vw,15px);color:var(--accent-color,#C8952A);white-space:nowrap}
/* stitched coupon bottom-right */
.tpl-walnut .ad-coupon-wrap{position:absolute;bottom:70px;right:14px;z-index:11;background:#0d0704;border-radius:5px;padding:4px}
.tpl-walnut .ad-coupon{border:2.5px dashed rgba(255,255,255,.62);border-radius:3px;padding:8px 12px;text-align:center;min-width:108px}
.tpl-walnut .ad-coupon-dollar{font-family:'Bebas Neue',sans-serif;font-size:clamp(28px,5.8vw,46px);color:#fff;line-height:.95;letter-spacing:.04em}
.tpl-walnut .ad-coupon-item{font-family:'Dancing Script',cursive;font-size:clamp(15px,3vw,22px);color:var(--accent-color,#C8952A);line-height:1}
.tpl-walnut .ad-coupon-fine{font-size:8px;color:rgba(255,255,255,.35);margin-top:3px;font-family:'DM Sans',sans-serif}
.tpl-walnut .ad-footer{position:absolute;bottom:0;left:0;right:0;z-index:12;background:rgba(10,5,2,.9);padding:9px 14px;display:flex;align-items:center;justify-content:space-between}
.tpl-walnut .ad-phone-wrap{display:flex;align-items:center;gap:8px}
.tpl-walnut .ad-phone-icon{width:26px;height:26px;border-radius:50%;border:1.5px solid var(--accent-color,#C8952A);color:var(--accent-color,#C8952A);display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0}
.tpl-walnut .ad-phone{font-family:'Bebas Neue',sans-serif;font-size:clamp(20px,4.2vw,32px);letter-spacing:.06em;color:#fff;line-height:1}
.tpl-walnut .ad-address{font-size:clamp(7.5px,1.5vw,10px);color:rgba(255,255,255,.38);margin-top:1px}
.tpl-walnut .ad-qr-box{width:42px;height:42px;background:#fff;border-radius:2px;padding:3px}
.tpl-walnut .ad-qr-scan{font-family:'Dancing Script',cursive;font-size:12px;color:rgba(255,255,255,.45);text-align:center;margin-top:1px}

/* ═══════════════════════════════════════════════════════════════
   TEMPLATE 3 — BOLD RETRO BLOCK  (value: bold)
   Full-bleed photo background · skewed diagonal accent banner top
   Giant Oswald name in banner · Dancing Script tagline
   Left-side vertical accent stripe with rotated menu items
   Full-width torn-paper coupon strip across center (jagged clip-path)
   Dark footer strip
═══════════════════════════════════════════════════════════════ */
.tpl-retro{position:relative;width:100%;height:100%;overflow:hidden}
.tpl-retro .ad-bg{position:absolute;inset:0;background-size:cover;background-position:center;z-index:0;filter:brightness(.42) saturate(1.1)}
.tpl-retro .ad-dark-overlay{position:absolute;inset:0;z-index:1;
  background:linear-gradient(to bottom,rgba(0,0,0,.05) 0%,rgba(0,0,0,.55) 40%,rgba(0,0,0,.7) 100%)}
/* full-width diagonal accent banner — top ~40% */
.tpl-retro .ad-top-banner{position:absolute;top:0;left:0;right:0;z-index:5;
  background:var(--accent-color,#E63946);
  padding:16px 18px 46px;
  clip-path:polygon(0 0,100% 0,100% 78%,0 100%)}
.tpl-retro .ad-banner-sub{font-family:'DM Sans',sans-serif;font-size:8.5px;font-weight:700;
  letter-spacing:.28em;text-transform:uppercase;color:rgba(255,255,255,.58);margin-bottom:4px}
.tpl-retro .ad-banner-name{font-family:'Oswald',sans-serif;font-weight:700;text-transform:uppercase;
  font-size:clamp(36px,7.5vw,62px);letter-spacing:.02em;
  color:#fff;line-height:.9;text-shadow:3px 4px 0 rgba(0,0,0,.18)}
.tpl-retro .ad-banner-tagline{font-family:'Dancing Script',cursive;font-size:clamp(16px,3.3vw,24px);
  color:rgba(255,255,255,.88);margin-top:5px;line-height:1.2}
/* left accent-color menu stripe — runs from below banner to footer */
.tpl-retro .ad-menu-stripe{position:absolute;left:0;top:40%;bottom:50px;
  width:19%;z-index:7;background:var(--accent-color,#E63946);
  display:flex;flex-direction:column;align-items:center;
  justify-content:flex-start;padding:12px 3px 8px;gap:6px;overflow:hidden}
.tpl-retro .ad-stripe-item{font-family:'Oswald',sans-serif;font-weight:600;
  writing-mode:vertical-rl;transform:rotate(180deg);
  font-size:clamp(9px,1.9vw,12px);text-transform:uppercase;letter-spacing:.1em;
  color:rgba(255,255,255,.92);white-space:nowrap;
  overflow:hidden;max-height:85px;text-overflow:ellipsis}
/* full-width torn-paper coupon strip — center-card, jagged clip-path */
.tpl-retro .ad-torn-coupon{position:absolute;left:-2px;right:-2px;
  top:55%;height:82px;z-index:8;
  background:#F5F0E6;
  clip-path:polygon(
    0% 16%,2.5% 0%,5% 18%,7.5% 2%,10% 20%,12.5% 4%,15% 22%,17.5% 6%,
    20% 24%,22.5% 8%,25% 26%,27.5% 10%,30% 28%,32.5% 12%,35% 30%,37.5% 14%,
    40% 32%,42.5% 16%,45% 34%,47.5% 18%,50% 36%,52.5% 20%,55% 38%,57.5% 22%,
    60% 36%,62.5% 18%,65% 34%,67.5% 16%,70% 32%,72.5% 14%,75% 30%,77.5% 12%,
    80% 28%,82.5% 10%,85% 26%,87.5% 8%,90% 24%,92.5% 6%,95% 22%,97.5% 4%,100% 18%,
    100% 84%,
    97.5% 100%,95% 78%,92.5% 96%,90% 74%,87.5% 92%,85% 70%,82.5% 88%,80% 66%,
    77.5% 84%,75% 62%,72.5% 80%,70% 58%,67.5% 76%,65% 54%,62.5% 72%,60% 50%,
    57.5% 68%,55% 46%,52.5% 64%,50% 42%,47.5% 60%,45% 38%,42.5% 56%,40% 34%,
    37.5% 52%,35% 30%,32.5% 48%,30% 26%,27.5% 44%,25% 22%,22.5% 40%,20% 18%,
    17.5% 36%,15% 14%,12.5% 32%,10% 10%,7.5% 28%,5% 6%,2.5% 24%,0% 8%
  );
  display:flex;align-items:center;justify-content:center;text-align:center}
.tpl-retro .ad-torn-inner{padding:4px 20px}
.tpl-retro .ad-torn-amount{font-family:'Bebas Neue',sans-serif;
  font-size:clamp(22px,4.6vw,36px);color:#111;line-height:1;letter-spacing:.04em}
.tpl-retro .ad-torn-item{font-family:'Oswald',sans-serif;font-size:clamp(10px,2vw,13px);
  letter-spacing:.08em;text-transform:uppercase;color:var(--accent-color,#E63946);margin-top:1px}
.tpl-retro .ad-torn-fine{font-size:7.5px;color:#777;margin-top:2px;font-family:'DM Sans',sans-serif}
/* footer */
.tpl-retro .ad-footer{position:absolute;bottom:0;left:0;right:0;z-index:10;
  background:rgba(0,0,0,.88);padding:9px 14px;
  display:flex;align-items:center;justify-content:space-between}
.tpl-retro .ad-phone{font-family:'Bebas Neue',sans-serif;font-size:clamp(18px,3.8vw,28px);
  letter-spacing:.06em;color:#fff;line-height:1}
.tpl-retro .ad-address{font-size:clamp(7.5px,1.5vw,10px);color:rgba(255,255,255,.38);margin-top:1px}
.tpl-retro .ad-qr-box{width:40px;height:40px;background:#fff;border-radius:2px;padding:3px}
.tpl-retro .ad-qr-label{font-size:8px;color:rgba(255,255,255,.3);letter-spacing:.1em;text-transform:uppercase;margin-top:2px;text-align:center}

/* ═══════════════════════════════════════════════════════════════
   TEMPLATE 4 — LUXURY GOLD  (value: luxury)
   Very dark photo 25% brightness · double inset gold frame
   Corner flourishes · ALL content centered
   Playfair italic name in gold · Crimson Pro menu with gold underlines
   Thin gold-border centered coupon
═══════════════════════════════════════════════════════════════ */
.tpl-gold{position:relative;width:100%;height:100%;overflow:hidden}
.tpl-gold .ad-bg{position:absolute;inset:0;background-size:cover;background-position:center;z-index:0;filter:brightness(.22) saturate(.55)}
.tpl-gold .ad-overlay{position:absolute;inset:0;z-index:1;background:linear-gradient(to bottom,rgba(3,2,1,.3) 0%,rgba(3,2,1,.6) 100%)}
.tpl-gold .ad-frame{position:absolute;inset:10px;z-index:2;border:1px solid rgba(212,175,55,.5)}
.tpl-gold .ad-frame-inner{position:absolute;inset:17px;z-index:2;border:0.5px solid rgba(212,175,55,.22)}
.tpl-gold .ad-corner{position:absolute;z-index:4;width:18px;height:18px}
.tpl-gold .ad-ctleft {top:8px;left:8px;border-top:2.5px solid rgba(212,175,55,.75);border-left:2.5px solid rgba(212,175,55,.75)}
.tpl-gold .ad-ctright{top:8px;right:8px;border-top:2.5px solid rgba(212,175,55,.75);border-right:2.5px solid rgba(212,175,55,.75)}
.tpl-gold .ad-cbleft {bottom:8px;left:8px;border-bottom:2.5px solid rgba(212,175,55,.75);border-left:2.5px solid rgba(212,175,55,.75)}
.tpl-gold .ad-cbright{bottom:8px;right:8px;border-bottom:2.5px solid rgba(212,175,55,.75);border-right:2.5px solid rgba(212,175,55,.75)}
.tpl-gold .ad-content{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 24px;text-align:center;gap:0}
.tpl-gold .ad-ornament{font-size:10px;letter-spacing:.55em;color:rgba(212,175,55,.7);margin-bottom:10px}
.tpl-gold .ad-name{font-family:'Playfair Display',serif;font-style:italic;font-weight:700;font-size:clamp(22px,4.8vw,40px);color:#f0d880;letter-spacing:.04em;line-height:1.05;text-shadow:0 2px 18px rgba(0,0,0,.7)}
.tpl-gold .ad-tagline{font-family:'Crimson Pro',serif;font-style:italic;font-size:clamp(12px,2.5vw,17px);color:rgba(212,175,55,.8);margin-top:6px;margin-bottom:10px;line-height:1.3}
.tpl-gold .ad-rule{width:90px;height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,.75),transparent);margin:0 auto 12px}
.tpl-gold .ad-menu{display:flex;flex-direction:column;gap:6px;margin-bottom:10px;width:100%;max-width:250px}
.tpl-gold .ad-menu-item{font-family:'Crimson Pro',serif;font-style:italic;font-size:clamp(11px,2.2vw,14.5px);color:rgba(255,255,255,.65);letter-spacing:.04em;text-align:center;border-bottom:1px solid rgba(212,175,55,.14);padding-bottom:5px}
.tpl-gold .ad-coupon{border:1px solid rgba(212,175,55,.55);padding:8px 22px;margin-bottom:14px;background:rgba(212,175,55,.06);display:inline-block}
.tpl-gold .ad-coupon-text{font-family:'Playfair Display',serif;font-size:clamp(14px,3vw,22px);color:#f0d880;letter-spacing:.06em;font-style:italic}
.tpl-gold .ad-coupon-fine{font-size:8.5px;color:rgba(255,255,255,.32);margin-top:3px}
.tpl-gold .ad-footer{position:absolute;bottom:18px;left:28px;right:28px;z-index:10;display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(212,175,55,.22);padding-top:8px}
.tpl-gold .ad-phone{font-family:'Playfair Display',serif;font-size:clamp(13px,2.8vw,20px);color:rgba(212,175,55,.9);line-height:1;letter-spacing:.04em}
.tpl-gold .ad-address{font-size:clamp(7.5px,1.5vw,10px);color:rgba(255,255,255,.32);margin-top:2px}
.tpl-gold .ad-qr-box{width:40px;height:40px;background:#fff;border-radius:2px;padding:3px}
.tpl-gold .ad-qr-label{font-size:8px;color:rgba(212,175,55,.45);letter-spacing:.1em;text-transform:uppercase;margin-top:2px;text-align:center}

/* ═══════════════════════════════════════════════════════════════
   TEMPLATE 5 — NEON DINER  (value: bright)
   Near-black photo · electric neon-glow on name · left neon bar
   Pill chip menu items · glowing outlined coupon · neon footer line
═══════════════════════════════════════════════════════════════ */
.tpl-neon{position:relative;width:100%;height:100%;overflow:hidden}
.tpl-neon .ad-bg{position:absolute;inset:0;background-size:cover;background-position:center;z-index:0;filter:brightness(.2) saturate(.4)}
.tpl-neon .ad-overlay{position:absolute;inset:0;z-index:1;background:linear-gradient(135deg,rgba(0,0,0,.6) 0%,rgba(0,0,0,.2) 60%,rgba(0,0,0,.7) 100%)}
/* left vertical neon bar */
.tpl-neon .ad-neon-bar{position:absolute;left:0;top:0;bottom:0;width:5px;z-index:5;
  background:var(--accent-color,#00AAFF);
  box-shadow:0 0 14px 4px var(--accent-color,#00AAFF),0 0 35px 8px var(--accent-color,#00AAFF)}
/* name block - glowing */
.tpl-neon .ad-name-block{position:absolute;top:22px;left:22px;right:16px;z-index:10}
.tpl-neon .ad-name-line1{font-family:'Playfair Display',serif;font-weight:900;font-style:italic;font-size:clamp(32px,7vw,56px);color:#fff;line-height:.9;letter-spacing:-.01em;
  text-shadow:0 0 18px var(--accent-color,#00AAFF),0 0 40px rgba(0,150,255,.35),0 0 2px #fff}
.tpl-neon .ad-name-line2{font-family:'Playfair Display',serif;font-weight:700;font-size:clamp(22px,4.8vw,38px);display:block;color:var(--accent-color,#00AAFF);line-height:.92;
  text-shadow:0 0 14px var(--accent-color,#00AAFF),0 0 28px var(--accent-color,#00AAFF)}
.tpl-neon .ad-tagline{font-family:'DM Sans',sans-serif;font-size:clamp(7.5px,1.6vw,10.5px);font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:rgba(255,255,255,.38);margin-top:9px}
/* menu as glowing pill chips */
.tpl-neon .ad-menu{position:absolute;top:49%;left:20px;right:16px;z-index:10;display:flex;flex-wrap:wrap;gap:5px}
.tpl-neon .ad-chip{font-family:'DM Sans',sans-serif;font-size:clamp(9px,1.8vw,11.5px);font-weight:600;color:#fff;
  border:1.5px solid var(--accent-color,#00AAFF);border-radius:20px;padding:3px 10px;
  background:rgba(0,0,0,.5);
  box-shadow:0 0 6px rgba(0,150,255,.2),inset 0 0 6px rgba(0,150,255,.06)}
/* glowing outlined coupon */
.tpl-neon .ad-coupon{position:absolute;bottom:72px;left:18px;right:18px;z-index:10;
  border:2px solid var(--accent-color,#00AAFF);border-radius:5px;padding:10px 16px;
  background:rgba(0,0,0,.55);
  box-shadow:0 0 14px rgba(0,150,255,.28),inset 0 0 14px rgba(0,150,255,.08);
  display:flex;align-items:center;justify-content:space-between;gap:8px}
.tpl-neon .ad-coupon-amount{font-family:'Bebas Neue',sans-serif;font-size:clamp(22px,4.6vw,36px);letter-spacing:.04em;color:#fff;text-shadow:0 0 12px var(--accent-color,#00AAFF)}
.tpl-neon .ad-coupon-detail{text-align:right}
.tpl-neon .ad-coupon-item{font-family:'Crimson Pro',serif;font-style:italic;font-size:clamp(13px,2.6vw,18px);color:var(--accent-color,#00AAFF);text-shadow:0 0 8px var(--accent-color,#00AAFF)}
.tpl-neon .ad-coupon-fine{font-size:8.5px;color:rgba(255,255,255,.3);margin-top:2px}
.tpl-neon .ad-footer{position:absolute;bottom:0;left:0;right:0;z-index:10;background:rgba(0,0,0,.92);border-top:2px solid var(--accent-color,#00AAFF);box-shadow:0 -4px 14px var(--accent-color,#00AAFF);padding:9px 16px;display:flex;align-items:center;justify-content:space-between}
.tpl-neon .ad-phone{font-family:'Bebas Neue',sans-serif;font-size:clamp(20px,4.2vw,32px);letter-spacing:.06em;color:#fff;line-height:1;text-shadow:0 0 8px var(--accent-color,#00AAFF)}
.tpl-neon .ad-address{font-size:clamp(7.5px,1.5vw,10px);color:rgba(255,255,255,.32);margin-top:1px}
.tpl-neon .ad-qr-box{width:40px;height:40px;background:#fff;border-radius:2px;padding:3px}
.tpl-neon .ad-qr-label{font-size:8px;color:rgba(255,255,255,.28);letter-spacing:.1em;text-transform:uppercase;margin-top:2px;text-align:center}

/* ═══════════════════════════════════════════════════════════════
   TEMPLATE 6 — SUNDAY CIRCULAR  (value: clean)
   Warm cream background · photo constrained to left 42% column
   Right panel: type-dominant, Bebas Neue at radically different sizes
   Accent-color pill tagline badge · newspaper two-column menu
   Ink-stamp oval coupon (rotated) · thin ruled footer
═══════════════════════════════════════════════════════════════ */
.tpl-circ{position:relative;width:100%;height:100%;overflow:hidden;display:flex;background:#F4EDD5}
/* photo column */
.tpl-circ .ad-photo-col{width:41%;height:100%;position:relative;overflow:hidden;flex-shrink:0}
.tpl-circ .ad-photo-col::after{content:'';position:absolute;inset:0;
  background:linear-gradient(to right,transparent 70%,#F4EDD5 100%)}
/* accent vertical divider line */
.tpl-circ .ad-divider{width:4px;height:100%;background:var(--accent-color,#E63946);flex-shrink:0;z-index:5;position:relative}
/* text panel */
.tpl-circ .ad-text-col{flex:1;padding:16px 14px 10px;display:flex;flex-direction:column;overflow:hidden;position:relative}
/* stacked huge Bebas Neue name */
.tpl-circ .ad-name-stack{margin-bottom:8px}
.tpl-circ .ad-n1{font-family:'Bebas Neue',sans-serif;font-size:clamp(18px,4vw,32px);letter-spacing:.06em;color:var(--ink,#111827);line-height:.95;display:block}
.tpl-circ .ad-n2{font-family:'Bebas Neue',sans-serif;font-size:clamp(44px,9.2vw,76px);letter-spacing:.03em;color:var(--ink,#111827);line-height:.88;display:block}
.tpl-circ .ad-n3{font-family:'Bebas Neue',sans-serif;font-size:clamp(28px,6vw,50px);letter-spacing:.05em;color:var(--accent-color,#E63946);line-height:.92;display:block}
/* tagline pill badge */
.tpl-circ .ad-tagline-pill{display:inline-flex;align-items:center;background:var(--accent-color,#E63946);color:#fff;border-radius:20px;padding:4px 12px;font-family:'DM Sans',sans-serif;font-size:clamp(9px,1.8vw,11.5px);font-weight:700;letter-spacing:.04em;margin-bottom:8px;max-width:100%}
/* thin horizontal rule */
.tpl-circ .ad-rule{height:1.5px;background:rgba(0,0,0,.12);margin:0 0 8px;flex-shrink:0}
/* two-column newspaper price list */
.tpl-circ .ad-menu{display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;margin-bottom:8px;flex-shrink:0}
.tpl-circ .ad-menu-row{display:flex;align-items:baseline;gap:3px;border-bottom:1px solid rgba(0,0,0,.1);padding-bottom:3px}
.tpl-circ .ad-item-name{font-family:'DM Sans',sans-serif;font-size:clamp(9px,1.8vw,11px);font-weight:600;color:#333;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tpl-circ .ad-item-price{font-family:'Oswald',sans-serif;font-weight:700;font-size:clamp(9.5px,2vw,12px);color:var(--accent-color,#E63946);white-space:nowrap}
/* ink-stamp oval coupon */
.tpl-circ .ad-coupon-stamp{display:inline-block;border:3px solid var(--accent-color,#E63946);border-radius:50%;padding:8px 14px;transform:rotate(-6deg);text-align:center;box-shadow:0 0 0 1.5px var(--accent-color,#E63946);flex-shrink:0;align-self:flex-start;margin-top:auto}
.tpl-circ .ad-coupon-text{font-family:'Bebas Neue',sans-serif;font-size:clamp(18px,3.8vw,28px);letter-spacing:.05em;color:var(--accent-color,#E63946);line-height:1}
.tpl-circ .ad-coupon-item{font-family:'Oswald',sans-serif;font-size:clamp(9px,1.9vw,12px);letter-spacing:.08em;text-transform:uppercase;color:var(--accent-color,#E63946);margin-top:1px}
.tpl-circ .ad-coupon-fine{font-size:7.5px;color:#888;margin-top:2px}
/* thin ruled footer */
.tpl-circ .ad-footer{position:absolute;bottom:0;left:0;right:0;z-index:10;background:#F4EDD5;border-top:2px solid var(--ink,#111827);padding:7px 14px;display:flex;align-items:center;justify-content:space-between}
.tpl-circ .ad-footer-left{display:flex;align-items:center;gap:8px}
.tpl-circ .ad-phone-icon{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--ink,#111827);display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0}
.tpl-circ .ad-phone{font-family:'Bebas Neue',sans-serif;font-size:clamp(18px,3.8vw,28px);letter-spacing:.06em;color:var(--ink,#111827);line-height:1}
.tpl-circ .ad-address{font-size:clamp(7.5px,1.5vw,9.5px);color:#555;margin-top:1px}
.tpl-circ .ad-qr-box{width:38px;height:38px;background:#fff;border-radius:2px;padding:3px;border:1px solid rgba(0,0,0,.1)}
.tpl-circ .ad-qr-label{font-size:7.5px;color:#888;letter-spacing:.1em;text-transform:uppercase;margin-top:2px;text-align:center}

@media(max-width:900px){.layout{grid-template-columns:1fr}.ppanel{padding:20px 14px}}
</style>
</head>
<body>

<header class="hdr">
  <div class="brand">My Town <span>Postcard</span></div>
  <div class="hdr-badge">✦ Ad Generator v4</div>
</header>

<div class="layout">
  <div class="fpanel">
    <div class="ptitle">Build Your Ad</div>
    <div class="psub">Fill in your details, pick a photo and style — your ad previews instantly.</div>

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

    <div class="fsec">
      <div class="slbl">Services / Menu Items</div>
      <div class="menu-list" id="menuList"></div>
      <button class="add-btn" onclick="addMenuItem()">+ Add Item</button>
    </div>

    <div class="fsec">
      <div class="slbl">Special Offer / Coupon</div>
      <div class="field"><label>Offer Text</label><input type="text" id="offer" placeholder="e.g. $1 OFF Any Pizza · 1 per visit" oninput="renderAd()"></div>
    </div>

    <div class="fsec">
      <div class="slbl">Design Style</div>
      <div class="style-grid">
        <div class="scard">
          <input type="radio" name="style" id="s-rustic" value="rustic" checked onchange="renderAd()">
          <label for="s-rustic"><div class="swatch" style="background:linear-gradient(135deg,#E6D2A6 40%,#C4530A)"></div><div class="sinfo"><div class="sname">Kraft &amp; Brush</div><div class="sdesc">Parchment bg, brush stroke, script + bold mixed type, stitched coupon</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-dark" value="dark" onchange="renderAd()">
          <label for="s-dark"><div class="swatch" style="background:linear-gradient(135deg,#1a0f08 50%,#C8952A)"></div><div class="sinfo"><div class="sname">Dark Walnut</div><div class="sdesc">Dark wood bg, hero photo top, Playfair serif, dotted price leaders</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-bold" value="bold" onchange="renderAd()">
          <label for="s-bold"><div class="swatch" style="background:linear-gradient(135deg,#E63946 50%,#888 50%)"></div><div class="sinfo"><div class="sname">Bold Retro Block</div><div class="sdesc">Split-screen: solid color left, photo right, giant Oswald name</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-luxury" value="luxury" onchange="renderAd()">
          <label for="s-luxury"><div class="swatch" style="background:linear-gradient(135deg,#0a0804,#D4AF37)"></div><div class="sinfo"><div class="sname">Luxury Gold</div><div class="sdesc">Very dark photo, double gold frame, Playfair italic centered</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-bright" value="bright" onchange="renderAd()">
          <label for="s-bright"><div class="swatch" style="background:linear-gradient(135deg,#050508,#00AAFF)"></div><div class="sinfo"><div class="sname">Neon Diner</div><div class="sdesc">Near-black photo, electric neon glow, pill menu chips</div></div></label>
          <div class="selbadge">✓</div>
        </div>
        <div class="scard">
          <input type="radio" name="style" id="s-clean" value="clean" onchange="renderAd()">
          <label for="s-clean"><div class="swatch" style="background:linear-gradient(135deg,#F4EDD5 45%,#E63946 45%)"></div><div class="sinfo"><div class="sname">Sunday Circular</div><div class="sdesc">Cream bg, photo left column, huge stacked type, ink-stamp coupon</div></div></label>
          <div class="selbadge">✓</div>
        </div>
      </div>
    </div>

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
        <div class="chip"><input type="radio" name="color" id="c-neon" value="#00AAFF" onchange="renderAd()"><label for="c-neon" style="background:#00AAFF" title="Neon Blue"></label></div>
      </div>
    </div>

    <button class="gen-btn" id="generateBtn" onclick="renderAd()">✦ Preview My Ad</button>
  </div>

  <div class="ppanel">
    <div class="ptoolbar">
      <div class="plabel">Ad Preview</div>
      <div class="tactions">
        <button class="tbtn" id="shuffleBtn" onclick="shufflePhoto()" disabled>⟳ Shuffle Photo</button>
        <button class="tbtn primary" id="useBtn" onclick="useAd()" disabled>✓ Use This Ad</button>
      </div>
    </div>
    <div class="ad-canvas-wrap">
      <div class="empty-state" id="emptyState">
        <div class="ei">✦</div>
        <div class="et">Your ad will appear here</div>
        <div class="es">Select an industry, fill in your business name, choose a photo and style — your ad renders instantly.</div>
      </div>
      <div id="adCanvas"></div>
    </div>
    <div style="max-width:500px;width:100%;font-size:11px;color:var(--ink-light);line-height:1.6;text-align:center;padding:0 8px">
      All text is rendered as crisp HTML — no AI image generation means no spelling errors, instant previews, and zero per-ad cost.
    </div>
  </div>
</div>

<script>
const INDUSTRIES = {
"Pizza Restaurant":{photos:["https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80","https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80","https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=800&q=80","https://images.pexels.com/photos/9685273/pexels-photo-9685273.jpeg?auto=compress&cs=tinysrgb&w=800"],colors:{primary:"#c0392b",accent:"#f4d03f"},taglines:["Hand-Tossed. Oven Fresh.","The Best Slice in Town!","Authentic Italian Since 1985"],menu:["Large Pizza $14.99","Family Special $24.99","Wings & Pizza Combo $18.99","Free Delivery Available"]},
"Mexican Restaurant":{photos:["https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&q=80","https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=800&q=80","https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?w=800&q=80","https://images.unsplash.com/photo-1588013273468-315fd88ea34c?w=800&q=80"],colors:{primary:"#e67e22",accent:"#27ae60"},taglines:["Auténtico Mexican Cuisine","Family Recipes Since 1992","¡Tacos Fresca Todos los Días!"],menu:["Taco Tuesday $1 Each","Margarita Happy Hour","Family Fajita Platter $22.99","Free Chips & Salsa"]},
"Chinese Restaurant":{photos:["https://images.unsplash.com/photo-1525755662778-989d0524087e?w=800&q=80","https://images.unsplash.com/photo-1582450871972-ab5ca641643d?w=800&q=80","https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&q=80","https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=800&q=80"],colors:{primary:"#c0392b",accent:"#d4af37"},taglines:["Authentic Asian Flavors","Wok-Fired Perfection","Family Owned & Operated"],menu:["Lunch Special $8.99","Family Dinner $29.99","Free Egg Roll w/ Order","Catering Available"]},
"Breakfast & Cafe":{photos:["https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=800&q=80","https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80","https://images.unsplash.com/photo-1541167760496-1628856ab772?w=800&q=80","https://images.unsplash.com/photo-1644561146633-34f3f9c5c58e?w=800&q=80"],colors:{primary:"#c8541a",accent:"#f39c12"},taglines:["Made From Scratch Daily","Your Morning Made Better","Coffee · Biscuits · Smiles"],menu:["Breakfast Plate $8.99","Specialty Coffee $4.49","Bagel & Cream Cheese $3.99","Drive-Thru Available"]},
"Bar & Grill":{photos:["https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80","https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=800&q=80","https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80","https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800&q=80"],colors:{primary:"#1c1917",accent:"#dc2626"},taglines:["Where Locals Gather","Burgers · Beer · Good Times","Sports · Drinks · Great Food"],menu:["Half-Price Wings Tuesdays","Happy Hour 4–6pm Daily","Burger & Beer Combo $14.99","Live Music Weekends"]},
"Italian Restaurant":{photos:["https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80","https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=800&q=80","https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80","https://images.unsplash.com/photo-1481931098730-318b6f776db0?w=800&q=80"],colors:{primary:"#166534",accent:"#dc2626"},taglines:["Authentic Italian Cuisine","Family Recipes Since 1978","Buon Appetito!"],menu:["Pasta Special $12.99","Wine & Dine for Two $38","Wood-Fired Pizza $15.99","Tiramisu Made Daily $6.99"]},
"Bakery":{photos:["https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&q=80","https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&q=80","https://images.unsplash.com/photo-1486427944299-d1955d23e34d?w=800&q=80","https://images.unsplash.com/photo-1517686469429-8bdb88b9f907?w=800&q=80"],colors:{primary:"#92400e",accent:"#f59e0b"},taglines:["Fresh Baked Daily","From Our Oven to Your Table","Artisan Breads & Pastries"],menu:["Custom Cakes — Call Us!","Fresh Sourdough $8.99","Birthday Specials","Wedding Cakes Available"]},
"Coffee Shop":{photos:["https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80","https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=800&q=80","https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80","https://images.unsplash.com/photo-1541167760496-1628856ab772?w=800&q=80"],colors:{primary:"#5d4037",accent:"#d4a574"},taglines:["Locally Roasted, Locally Loved","Your Daily Ritual","Specialty Coffee & More"],menu:["Specialty Lattes $5.49","Cold Brew on Tap $4.99","Fresh Pastries Daily","Free WiFi Always"]},
"Dentist":{photos:["https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=800&q=80","https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=800&q=80","https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800&q=80","https://images.unsplash.com/photo-1609840114035-3c981b782dfe?w=800&q=80"],colors:{primary:"#1e3a5f",accent:"#c8a44a"},taglines:["Accepting New Patients!","Gentle Care for the Whole Family","Your Smile is Our Priority"],menu:["Cleanings & Exams","Cosmetic Dentistry","Emergency Same-Day Care","Most Insurance Accepted"]},
"HVAC":{photos:["https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=800&q=80","https://images.unsplash.com/photo-1566917064245-1c6bff30dbf1?w=800&q=80","https://images.pexels.com/photos/5463587/pexels-photo-5463587.jpeg?auto=compress&cs=tinysrgb&w=800","https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=800&q=80"],colors:{primary:"#003f6b",accent:"#dc2626"},taglines:["24/7 Emergency Service","Heating & Cooling Experts","Fast · Reliable · Affordable"],menu:["A/C Tune-Up Special $79","Free Estimates Always","Emergency Service 24/7","Financing Available OAC"]},
"Real Estate":{photos:["https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80","https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&q=80","https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80"],colors:{primary:"#2d6a4f",accent:"#b8962e"},taglines:["Your Local Real Estate Expert","Buying or Selling? Call Me!","Trusted in Your Neighborhood"],menu:["Free Home Valuation","Buyer Representation","Full Listing Services","Investment Properties"]},
"Auto Repair":{photos:["https://images.unsplash.com/photo-1486006920555-c77dcf18193c?w=800&q=80","https://images.unsplash.com/photo-1593142927747-8c1b758967a6?w=800&q=80","https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&q=80","https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80"],colors:{primary:"#1c1917",accent:"#dc2626"},taglines:["Honest Auto Repair","ASE Certified Mechanics","Family Owned Since 1992"],menu:["Oil Change Special $29.99","Brake Service & Inspection","A/C Repair — All Makes","Free Estimates Always"]},
"Salon & Beauty":{photos:["https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&q=80","https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&q=80","https://images.unsplash.com/photo-1562322140-8baeececf3df?w=800&q=80","https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800&q=80"],colors:{primary:"#9d174d",accent:"#d4af37"},taglines:["Look Beautiful. Feel Confident.","Your Best Self Awaits","Cuts · Color · Style"],menu:["Cut & Color Special $65","Wedding Party Hair","Bridal Package Available","Walk-Ins Welcome"]},
"Gym & Fitness":{photos:["https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80","https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80","https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&q=80","https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=800&q=80"],colors:{primary:"#dc2626",accent:"#fbbf24"},taglines:["Stronger Every Day","Get Fit. Feel Great.","Your Fitness Journey Starts Here"],menu:["Free 7-Day Trial Pass","Personal Training $45/hr","Group Classes Daily","24/7 Member Access"]},
"Other Service":{photos:["https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80","https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=800&q=80","https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80","https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80"],colors:{primary:"#374151",accent:"#f59e0b"},taglines:["Quality Service You Can Trust","Locally Owned & Operated","Serving Our Community"],menu:["Free Consultation","Quality Guaranteed","Satisfaction Promise","Local & Trusted"]},
};

let selectedPhotoUrl = null;
let uploadedPhotoUrl = null;
let currentIndustryPhotos = [];
let currentPhotoIndex = 0;

const QR_SVG = '<svg width="36" height="36" viewBox="0 0 44 44" fill="none"><rect width="44" height="44" fill="white"/><rect x="3" y="3" width="14" height="14" rx="1" fill="#111"/><rect x="5" y="5" width="10" height="10" rx=".5" fill="white"/><rect x="7" y="7" width="6" height="6" fill="#111"/><rect x="27" y="3" width="14" height="14" rx="1" fill="#111"/><rect x="29" y="5" width="10" height="10" rx=".5" fill="white"/><rect x="31" y="7" width="6" height="6" fill="#111"/><rect x="3" y="27" width="14" height="14" rx="1" fill="#111"/><rect x="5" y="29" width="10" height="10" rx=".5" fill="white"/><rect x="7" y="31" width="6" height="6" fill="#111"/><rect x="21" y="21" width="4" height="4" fill="#111"/><rect x="27" y="21" width="4" height="4" fill="#111"/><rect x="33" y="21" width="4" height="4" fill="#111"/><rect x="21" y="27" width="4" height="4" fill="#111"/><rect x="33" y="27" width="4" height="4" fill="#111"/><rect x="27" y="33" width="4" height="4" fill="#111"/><rect x="21" y="39" width="4" height="4" fill="#111"/></svg>';

const STARBURST_SVG = '<svg style="position:absolute;top:0;right:0;width:100%;height:100%;pointer-events:none" viewBox="0 0 170 120" xmlns="http://www.w3.org/2000/svg"><line x1="40" y1="60" x2="170" y2="0" stroke="rgba(140,70,10,.42)" stroke-width="1.5"/><line x1="40" y1="60" x2="170" y2="25" stroke="rgba(140,70,10,.35)" stroke-width="1.5"/><line x1="40" y1="60" x2="170" y2="50" stroke="rgba(140,70,10,.32)" stroke-width="1"/><line x1="40" y1="60" x2="170" y2="75" stroke="rgba(140,70,10,.3)" stroke-width="1"/><line x1="40" y1="60" x2="170" y2="100" stroke="rgba(140,70,10,.28)" stroke-width="1"/><line x1="40" y1="60" x2="170" y2="120" stroke="rgba(140,70,10,.25)" stroke-width="1"/><line x1="40" y1="60" x2="120" y2="0" stroke="rgba(140,70,10,.22)" stroke-width="1"/><line x1="40" y1="60" x2="150" y2="0" stroke="rgba(140,70,10,.18)" stroke-width="1"/></svg>';

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
  } catch(e) { /* use fallback photos */ }
  currentIndustryPhotos = photos;
  if(!photos.length){
    grid.innerHTML = '<div class="img-none">No photos yet — upload your own above, or add photos in the admin image library.</div>';
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
  selectedPhotoUrl = typeof p==='string'?p:p.url;
  document.querySelectorAll('.img-thumb').forEach((t,i)=>t.classList.toggle('selected',i===currentPhotoIndex));
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

function buildMenu(items){ const list=document.getElementById('menuList'); list.innerHTML=''; items.forEach(item=>addMenuItem(item)); }

function addMenuItem(val=''){
  const list = document.getElementById('menuList');
  const row = document.createElement('div');
  row.className = 'mrow';
  row.innerHTML = \`<input type="text" placeholder="e.g. Large Pizza $14.99" value="\${val}" oninput="renderAd()"><button class="rm-btn" onclick="this.parentElement.remove();renderAd()">×</button>\`;
  list.appendChild(row);
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
    style:   document.querySelector('input[name="style"]:checked')?.value || 'rustic',
    color:   document.querySelector('input[name="color"]:checked')?.value || '#E63946',
    photo:   selectedPhotoUrl || '',
  };
}

function parseItem(item){
  const m = item.match(/^(.+?)\\s+(\\$[\\d.]+.*)$/);
  return m ? {name:m[1].trim(), price:m[2].trim()} : {name:item.trim(), price:''};
}

function parseCoupon(offer){
  if(!offer) return null;
  const pts = offer.split('·');
  const main = pts[0].trim();
  const fine = pts[1]?.trim() || '1 per visit · with this postcard';
  const m = main.match(/^(\\$[\\d.]+\\s+OFF)\\s+(.+)$/i);
  return m ? {amt:m[1], item:m[2], fine} : {amt:main, item:'', fine};
}

function renderAd(){
  const d = getFormData();
  if(!d.photo && d.bizName === 'Business Name') return;

  const canvas = document.getElementById('adCanvas');
  const empty  = document.getElementById('emptyState');
  const tpl    = d.style;
  const bg     = d.photo ? \`background-image:url('\${d.photo}')\` : 'background:#444';
  const ac     = d.color;
  const cp     = parseCoupon(d.offer);

  // Name split: all-but-last word vs last word
  const words = d.bizName.trim().split(/\\s+/);
  const nm1   = words.slice(0, words.length > 1 ? -1 : 1).join(' ');
  const nm2   = words.length > 1 ? words[words.length-1] : '';

  // initials for logo badge (walnut template)
  const initials = words.slice(0,2).map(w=>w[0].toUpperCase()).join('');

  let html = '';

  /* ─────────────────────────────────────────────────────────────
     TEMPLATE 1: KRAFT & BRUSH
  ───────────────────────────────────────────────────────────── */
  if(tpl === 'rustic'){
    const menuRows = d.menu.slice(0,4).map(item => {
      const p = parseItem(item);
      return \`<div class="ad-menu-row"><div class="ad-chk">✓</div><span class="ad-item-name">\${p.name}</span><span class="ad-item-dots"></span><span class="ad-item-price">\${p.price}</span></div>\`;
    }).join('');

    html = \`<div class="tpl-kraft" style="--accent-color:\${ac}">
      <div class="ad-bg" style="\${bg}"></div>
      <div class="ad-photo-wash"></div>
      <div class="ad-pennant">
        <span class="ad-pennant-star">✦</span>
        <div class="ad-pennant-txt">EST<br>LOCAL</div>
      </div>
      <div class="ad-starburst">\${STARBURST_SVG}</div>
      <div class="ad-name-block">
        <div class="ad-name-main">\${nm1}</div>
        <span class="ad-name-script">\${nm2 || d.bizName}</span>
      </div>
      \${d.tagline ? \`<div class="ad-tagline">\${d.tagline}</div>\` : ''}
      <div class="ad-brush"></div>
      \${menuRows ? \`<div class="ad-menu">\${menuRows}</div>\` : ''}
      \${cp ? \`<div class="ad-coupon-wrap"><div class="ad-coupon"><div class="ad-coupon-dollar">\${cp.amt}</div>\${cp.item ? \`<div class="ad-coupon-item">\${cp.item}</div>\` : ''}<div class="ad-coupon-fine">\${cp.fine}</div></div></div>\` : ''}
      <div class="ad-footer">
        <div class="ad-phone-wrap">
          <div class="ad-phone-icon">☎</div>
          <div><div class="ad-phone">\${d.phone || '—'}</div><div class="ad-address">\${[d.address, d.city].filter(Boolean).join(', ')}</div></div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center">
          <div class="ad-qr-box">\${QR_SVG}</div>
          <div class="ad-qr-scan">Scan</div>
        </div>
      </div>
    </div>\`;

  /* ─────────────────────────────────────────────────────────────
     TEMPLATE 2: DARK WALNUT
  ───────────────────────────────────────────────────────────── */
  } else if(tpl === 'dark'){
    const menuRows = d.menu.slice(0,4).map(item => {
      const p = parseItem(item);
      return \`<div class="ad-menu-row"><div class="ad-chk">✓</div><span class="ad-item-name">\${p.name}</span><span class="ad-item-dots"></span><span class="ad-item-price">\${p.price}</span></div>\`;
    }).join('');

    html = \`<div class="tpl-walnut" style="--accent-color:\${ac}">
      <div class="ad-bg" style="\${bg}"></div>
      <div class="ad-photo-fade"></div>
      <div class="ad-logo-badge">\${initials}</div>
      <div class="ad-header">
        <div class="ad-name">\${d.bizName}</div>
        \${d.tagline ? \`<div class="ad-tagline">— \${d.tagline} —</div>\` : ''}
      </div>
      \${menuRows ? \`<div class="ad-menu">\${menuRows}</div>\` : ''}
      \${cp ? \`<div class="ad-coupon-wrap"><div class="ad-coupon"><div class="ad-coupon-dollar">\${cp.amt}</div><div class="ad-coupon-item">\${cp.item || 'Any Item'}</div><div class="ad-coupon-fine">\${cp.fine}</div></div></div>\` : ''}
      <div class="ad-footer">
        <div class="ad-phone-wrap">
          <div class="ad-phone-icon">☎</div>
          <div><div class="ad-phone">\${d.phone || '—'}</div><div class="ad-address">\${[d.address, d.city].filter(Boolean).join(', ')}</div></div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center">
          <div class="ad-qr-box">\${QR_SVG}</div>
          <div class="ad-qr-scan">Scan</div>
        </div>
      </div>
    </div>\`;

  /* ─────────────────────────────────────────────────────────────
     TEMPLATE 3: BOLD RETRO BLOCK
  ───────────────────────────────────────────────────────────── */
  } else if(tpl === 'bold'){
    const stripeItems = d.menu.slice(0,5).map(item => {
      const p = parseItem(item);
      return \`<span class="ad-stripe-item">\${p.name}\${p.price ? ' · '+p.price : ''}</span>\`;
    }).join('');

    html = \`<div class="tpl-retro" style="--accent-color:\${ac}">
      <div class="ad-bg" style="\${bg}"></div>
      <div class="ad-dark-overlay"></div>
      <div class="ad-top-banner">
        <div class="ad-banner-sub">★ Serving You Locally ★</div>
        <div class="ad-banner-name">\${d.bizName}</div>
        \${d.tagline ? \`<div class="ad-banner-tagline">\${d.tagline}</div>\` : ''}
      </div>
      \${stripeItems ? \`<div class="ad-menu-stripe">\${stripeItems}</div>\` : ''}
      \${cp ? \`<div class="ad-torn-coupon"><div class="ad-torn-inner"><div class="ad-torn-amount">\${cp.amt}</div>\${cp.item ? \`<div class="ad-torn-item">\${cp.item}</div>\` : ''}<div class="ad-torn-fine">\${cp.fine}</div></div></div>\` : ''}
      <div class="ad-footer">
        <div>
          <div class="ad-phone">\${d.phone || '—'}</div>
          <div class="ad-address">\${[d.address, d.city].filter(Boolean).join(', ')}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center">
          <div class="ad-qr-box">\${QR_SVG}</div>
          <div class="ad-qr-label">Scan</div>
        </div>
      </div>
    </div>\`;

  /* ─────────────────────────────────────────────────────────────
     TEMPLATE 4: LUXURY GOLD
  ───────────────────────────────────────────────────────────── */
  } else if(tpl === 'luxury'){
    const menuItems = d.menu.slice(0,4).map(item => \`<div class="ad-menu-item">\${item}</div>\`).join('');

    html = \`<div class="tpl-gold">
      <div class="ad-bg" style="\${bg}"></div>
      <div class="ad-overlay"></div>
      <div class="ad-frame"></div>
      <div class="ad-frame-inner"></div>
      <div class="ad-corner ad-ctleft"></div><div class="ad-corner ad-ctright"></div>
      <div class="ad-corner ad-cbleft"></div><div class="ad-corner ad-cbright"></div>
      <div class="ad-content">
        <div class="ad-ornament">— ✦ —</div>
        <div class="ad-name">\${d.bizName}</div>
        \${d.tagline ? \`<div class="ad-tagline">\${d.tagline}</div>\` : ''}
        <div class="ad-rule"></div>
        \${menuItems ? \`<div class="ad-menu">\${menuItems}</div>\` : ''}
        \${cp ? \`<div class="ad-coupon"><div class="ad-coupon-text">\${cp.amt}\${cp.item ? ' ' + cp.item : ''}</div><div class="ad-coupon-fine">\${cp.fine}</div></div>\` : ''}
      </div>
      <div class="ad-footer">
        <div><div class="ad-phone">\${d.phone || '—'}</div><div class="ad-address">\${[d.address, d.city].filter(Boolean).join(', ')}</div></div>
        <div style="display:flex;flex-direction:column;align-items:center"><div class="ad-qr-box">\${QR_SVG}</div><div class="ad-qr-label">Scan</div></div>
      </div>
    </div>\`;

  /* ─────────────────────────────────────────────────────────────
     TEMPLATE 5: NEON DINER
  ───────────────────────────────────────────────────────────── */
  } else if(tpl === 'bright'){
    const chips = d.menu.slice(0,6).map(item => \`<div class="ad-chip">\${item}</div>\`).join('');

    html = \`<div class="tpl-neon" style="--accent-color:\${ac}">
      <div class="ad-bg" style="\${bg}"></div>
      <div class="ad-overlay"></div>
      <div class="ad-neon-bar"></div>
      <div class="ad-name-block">
        <div class="ad-name-line1">\${nm1}</div>
        \${nm2 ? \`<span class="ad-name-line2">\${nm2}</span>\` : ''}
        \${d.tagline ? \`<div class="ad-tagline">\${d.tagline}</div>\` : ''}
      </div>
      \${chips ? \`<div class="ad-menu">\${chips}</div>\` : ''}
      \${cp ? \`<div class="ad-coupon"><div class="ad-coupon-amount">\${cp.amt}</div><div class="ad-coupon-detail"><div class="ad-coupon-item">\${cp.item || 'Any Item'}</div><div class="ad-coupon-fine">\${cp.fine}</div></div></div>\` : ''}
      <div class="ad-footer">
        <div><div class="ad-phone">\${d.phone || '—'}</div><div class="ad-address">\${[d.address, d.city].filter(Boolean).join(', ')}</div></div>
        <div style="display:flex;flex-direction:column;align-items:center"><div class="ad-qr-box">\${QR_SVG}</div><div class="ad-qr-label">Scan</div></div>
      </div>
    </div>\`;

  /* ─────────────────────────────────────────────────────────────
     TEMPLATE 6: SUNDAY CIRCULAR
  ───────────────────────────────────────────────────────────── */
  } else if(tpl === 'clean'){
    // Split name into up to 3 display lines for dramatic stacking
    const n1 = words.length >= 3 ? words.slice(0, words.length - 2).join(' ') : (words.length === 1 ? d.bizName.slice(0, Math.ceil(d.bizName.length/3)) : '');
    const n2 = words.length >= 2 ? words[words.length - (words.length >= 3 ? 2 : 2)].toUpperCase() : nm1.toUpperCase();
    const n3 = words.length >= 2 ? words[words.length - 1] : '';

    const menuRows = d.menu.slice(0,4).map(item => {
      const p = parseItem(item);
      return \`<div class="ad-menu-row"><span class="ad-item-name">\${p.name}</span><span class="ad-item-price">\${p.price}</span></div>\`;
    }).join('');

    const photoStyle = d.photo ? \`background-image:url('\${d.photo}');background-size:cover;background-position:center\` : 'background:#888';

    html = \`<div class="tpl-circ" style="--accent-color:\${ac}">
      <div class="ad-photo-col" style="\${photoStyle}"></div>
      <div class="ad-divider"></div>
      <div class="ad-text-col">
        <div class="ad-name-stack">
          \${n1 ? \`<span class="ad-n1">\${n1}</span>\` : ''}
          <span class="ad-n2">\${n2}</span>
          \${n3 ? \`<span class="ad-n3">\${n3}</span>\` : ''}
        </div>
        \${d.tagline ? \`<div class="ad-tagline-pill">\${d.tagline}</div>\` : ''}
        <div class="ad-rule"></div>
        \${menuRows ? \`<div class="ad-menu">\${menuRows}</div>\` : ''}
        \${cp ? \`<div class="ad-coupon-stamp"><div class="ad-coupon-text">\${cp.amt}</div>\${cp.item ? \`<div class="ad-coupon-item">\${cp.item}</div>\` : ''}<div class="ad-coupon-fine">\${cp.fine}</div></div>\` : ''}
      </div>
      <div class="ad-footer">
        <div class="ad-footer-left">
          <div class="ad-phone-icon">☎</div>
          <div><div class="ad-phone">\${d.phone || '—'}</div><div class="ad-address">\${[d.address, d.city].filter(Boolean).join(', ')}</div></div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center"><div class="ad-qr-box">\${QR_SVG}</div><div class="ad-qr-label">Scan</div></div>
      </div>
    </div>\`;
  }

  canvas.innerHTML = html;
  canvas.classList.add('visible');
  empty.classList.add('hidden');
  document.getElementById('useBtn').disabled = false;
}

async function useAd(){
  const d = getFormData();
  const canvas = document.getElementById('adCanvas');
  const adHtml = canvas.innerHTML;
  const params = new URLSearchParams(location.search);
  const leadId = params.get('leadId');
  const btn = document.getElementById('useBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const r = await fetch('/api/ad-generator-v4/save', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ leadId, adHtml, photoUrl: d.photo }),
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
