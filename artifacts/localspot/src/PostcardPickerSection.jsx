import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useGetActiveCampaign, useGetCampaignBySlug, useReserveSpot, getGetActiveCampaignQueryKey, getGetCampaignBySlugQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AdTemplatePreview } from "./AdGenerator";
import AdUploadModal from "./AdUploadModal";
import { PositionedQR } from "./qrUtils";

// Natural canvas: 1200x900 = 12"x9" landscape at 100px per inch
const W = 1200, H = 900;

// FRONT: 3 XL (4"x5") top row + 4 Large (3"x4" portrait) bottom row
const FRONT = [
{ id:"xl1", dbGridArea:"mb", size:"XL", price:499, x:0,   y:0,   w:400, h:500, sample:null },
{ id:"xl2", dbGridArea:"dn", size:"XL", price:499, x:400, y:0,   w:400, h:500, sample:null       },
{ id:"xl3", dbGridArea:"re", size:"XL", price:499, x:800, y:0,   w:400, h:500, sample:"dental",   tmpl:"clean" },
{ id:"l1",  dbGridArea:"l1", size:"L",  price:399, x:0,   y:500, w:300, h:400, sample:"hvac",    tmpl:"stamp",  imgSrc:"/retro_game_city.png"  },
{ id:"l2",  dbGridArea:"l2", size:"L",  price:399, x:300, y:500, w:300, h:400, sample:null,                      imgSrc:"/hometown_roofing.jpeg" },
{ id:"l3",  dbGridArea:"l3", size:"L",  price:399, x:600, y:500, w:300, h:400, sample:"lawn",    tmpl:"split"  },
{ id:"l4",  dbGridArea:"l4", size:"L",  price:399, x:900, y:500, w:300, h:400, sample:null       },
];

// BACK: visual layout (3 XL columns + 4 M row + S/house/EDDM bottom row).
// Every sellable cell has a 1:1 DB row via dbGridArea.
// House/EDDM cells have dbGridArea:null — no DB row, rendered statically.
const BACK = [
{ id:"bxl1", dbGridArea:"bxl",  size:"XL", price:499, x:0,   y:0,   w:400, h:500, sample:null },
{ id:"bxl2", dbGridArea:"bxl2", size:"XL", price:499, x:400, y:0,   w:400, h:500, sample:null },
{ id:"bxl3", dbGridArea:"bxl3", size:"XL", price:499, x:800, y:0,   w:400, h:500, sample:null },
{ id:"bm1",  dbGridArea:"bm1",  size:"M",  price:299, x:0,   y:500, w:300, h:200, sample:null },
{ id:"bm2",  dbGridArea:"bm2",  size:"M",  price:299, x:300, y:500, w:300, h:200, sample:null },
{ id:"bm3",  dbGridArea:"bm3",  size:"M",  price:299, x:600, y:500, w:300, h:200, sample:null },
{ id:"bm4",  dbGridArea:"bm4",  size:"M",  price:299, x:900, y:500, w:300, h:200, sample:null },
{ id:"bs1",  dbGridArea:"bs1", size:"S",  price:199, x:0,   y:700, w:200, h:200, sample:null                   },
{ id:"bhs",  dbGridArea:null,  size:"house", price:0, x:200, y:700, w:600, h:200, sample:"house"               },
{ id:"bed",  dbGridArea:null,  size:"eddm",  price:0, x:800, y:700, w:400, h:200, sample:"eddm"                },
];

const ADS = {
// ── Front XL1 ── Mr. Biscuit's (photo-bold with real logo)
biscuits:{
biz:"Mr. Biscuit's Cafe", cat:"BREAKFAST & CAFE",
tag:"From-Scratch Biscuits & Boba!",
services:["Plain Biscuit $2.99","Bacon Biscuit $4.99","Chicken Tender $5.99","NY Bagels $5.49","Sausage Gravy Biscuit $5.99"],
offer:"$1 OFF Any Biscuit", fine:"1 per visit - with this postcard",
phone:"(706) 754-0105", addr:"Northeast Georgia",
web:"mrbiscuitscafe.com",
photo:"/industries/restaurants/mr-biscuits/gen-buttermilk-biscuit-hero.jpg",
logo:"/mr-biscuits-logo.jpg",
p:"#7c3a1e",a:"#f59e0b",l:"#fef3c7",d:"#3b1a0a",
},
// ── Front XL3 ── Northview Dental (clean white)
dental:{
biz:"Northview Dental", cat:"FAMILY DENTISTRY",
tag:"Healthy Smiles. Confident Lives.",
services:["General Dentistry","Cosmetic Dentistry","Dental Implants","Teeth Whitening","Accepting New Patients"],
offer:"New Patient Special", fine:"Exam + X-rays $99 - call to schedule",
phone:"(770) 704-1633", addr:"Northeast Georgia",
web:"northviewdental.com",
photo:"https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=800&q=80",
p:"#1e40af",a:"#3b82f6",l:"#eff6ff",d:"#1e3a5f",
},
// ── Front L3 ── GreenScapes (split)
lawn:{
biz:"GreenScapes Lawn Care", cat:"LAWN & LANDSCAPING",
tag:"A Beautiful Lawn You'll Love Coming Home To!",
services:["Mowing & Edging","Fertilization","Weed Control","Landscaping Design","Mulch Installation"],
offer:"Free Estimate", fine:"Call or scan to schedule - no obligation",
phone:"(706) 257-1186", addr:"Northeast Georgia",
web:"greenscapeslawncare.com",
photo:"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
p:"#166534",a:"#22c55e",l:"#f0fdf4",d:"#052e16",
},
// ── Front L1 ── Climate Comfort HVAC (stamp)
hvac:{
biz:"Climate Comfort HVAC", cat:"HEATING & COOLING",
tag:"Keeping You Comfortable All Year Long",
services:["AC & Heating Installation","Repair & Maintenance","Emergency Service","Free Estimates"],
offer:"$50 OFF Any Service", fine:"Show this ad at time of service - expires 6/30",
phone:"(770) 365-6599", addr:"Northeast Georgia",
web:"climatecomforthvac.com",
photo:"https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=800&q=80",
p:"#0369a1",a:"#38bdf8",l:"#f0f9ff",d:"#0c2a3a",
},
// ── Back XL3 ── Pit Stop Auto (photo-bold)
auto:{
biz:"Pit Stop Auto Repair", cat:"AUTO REPAIR",
tag:"Honest Repairs. Fair Prices. Dependable Service.",
services:["Oil Change from $29.99","Brake Service & Repair","AC Diagnostics & Repair","Tires & Alignment","Free Estimates"],
offer:"Free Diagnostic Check", fine:"With any repair - show this ad",
phone:"(706) 219-6136", addr:"Northeast Georgia",
web:"pitstopautoga.com",
photo:"https://images.unsplash.com/photo-1625047509168-a7026f36de04?w=800&q=80",
p:"#7f1d1d",a:"#fca5a5",l:"#fef2f2",d:"#3b0000",
},
// ── Back XL1 ── Mountain View Realty (clean white — maximally different from photo-bold)
realty:{
biz:"Mountain View Realty Group", cat:"REAL ESTATE",
tag:"Your Local Experts Since 2003.",
services:["Buying & Selling","Land & Farms","Investment Properties","Relocation Services","Free Home Valuations"],
offer:"Free Home Valuation", fine:"No obligation - call or text today",
phone:"(706) 839-0100", addr:"Northeast Georgia",
web:"mountainviewrealtyga.com",
photo:"https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&q=80",
p:"#1a3d5c",a:"#c8a84b",l:"#f5f0e8",d:"#0d1f2d",
},
// ── Back M3 ── Tony's Pizza (slate template)
pizza:{
biz:"Tony's Pizza", cat:"PIZZA & ITALIAN",
tag:"Fresh Dough. Real Cheese. Made With Love.",
services:["Hand-Tossed Pizzas","Pasta & Calzones","Salads & Wings","Dine In or Carry Out"],
offer:"Large Pizza $12.99", fine:"Pick-up only - show this ad",
phone:"(706) 507-1111", addr:"Northeast Georgia",
web:"tonyspizzaga.com",
photo:"https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&q=80",
p:"#9a3412",a:"#fb923c",l:"#fff7ed",d:"#431407",
},
// ── Back M1 ── The Cut Above Salon (banner template)
salon:{
biz:"The Cut Above Salon", cat:"SALON & BEAUTY",
tag:"Where Style Meets Confidence.",
services:["Cuts & Color","Highlights & Balayage","Blowouts & Styling","Waxing & Brows"],
offer:"20% OFF Your First Visit", fine:"New clients only - mention this ad",
phone:"(706) 555-0519", addr:"Northeast Georgia",
web:"thecutabovesalon.com",
photo:"https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&q=80",
p:"#831843",a:"#f472b6",l:"#fdf2f8",d:"#4a0e28",
},
// ── Spare ── Paws & Claws (for future use)
vet:{
biz:"Paws & Claws Vet Clinic", cat:"VETERINARIAN",
tag:"Compassionate Care for Every Pet",
services:["Wellness Exams","Vaccinations","Surgery & Dental","Emergency Care"],
offer:"Free First Exam", fine:"New patients only - call to schedule",
phone:"(770) 592-7387", addr:"Northeast Georgia",
web:"pawsandclawsvet.com",
photo:"https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80",
p:"#065f46",a:"#10b981",l:"#ecfdf5",d:"#022c22",
},
};

function Check({color,sz=14}){return(<svg width={sz} height={sz} viewBox="0 0 14 14" style={{flexShrink:0,marginTop:1}}><circle cx="7" cy="7" r="7" fill={color}/><path d="M4 7l2 2 4-4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>);}
function Phone({phone,color,size}){return(<div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}><svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{flexShrink:0}}><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg><span style={{fontSize:size*1.1,fontWeight:900,color,fontFamily:"sans-serif",letterSpacing:-0.5,lineHeight:1}}>{phone}</span></div>);}

function Coupon({offer,fine,color,dark,scale=1}){
if(!offer)return null;
const bdr=dark?"rgba(255,255,255,0.55)":color;
return(
<div style={{flexShrink:0,width:"fit-content",alignSelf:"center",margin:"0 auto"}}>
<div style={{display:"flex",alignItems:"center",marginBottom:1}}>
<span style={{fontSize:9*scale,lineHeight:1,opacity:0.7,flexShrink:0}}>✄</span>
<div style={{flex:1,borderTop:"1px dashed "+bdr+"88",marginLeft:2}}/>
<span style={{fontSize:9*scale,lineHeight:1,opacity:0.7,flexShrink:0,transform:"scaleX(-1)",display:"inline-block"}}>✄</span>
</div>
<div style={{border:"1.5px dashed "+bdr,borderRadius:4,padding:"4px 10px",textAlign:"center",background:dark?"rgba(0,0,0,0.3)":color+"15"}}>
<div style={{fontSize:13*scale,fontWeight:900,color:dark?"#fff":color,lineHeight:1.1}}>{offer}</div>
{fine&&<div style={{fontSize:8*scale,color:dark?"rgba(255,255,255,0.55)":"#777",marginTop:2}}>{fine}</div>}
</div>
</div>
);
}

// Compact inline coupon for tight spaces — no scissors strip
function CouponCompact({offer,fine,color,dark}){
if(!offer)return null;
return(
<div style={{border:"1.5px dashed "+(dark?"rgba(255,255,255,0.6)":color),borderRadius:3,padding:"3px 7px",textAlign:"center",background:dark?"rgba(0,0,0,0.35)":color+"18",flexShrink:0,width:"fit-content",alignSelf:"center",margin:"0 auto"}}>
<div style={{fontSize:9,fontWeight:900,color:dark?"#fff":color,lineHeight:1.1}}>{offer}</div>
{fine&&<div style={{fontSize:7,color:dark?"rgba(255,255,255,0.5)":"#888",marginTop:1}}>{fine}</div>}
</div>
);
}


// ── XL (400x500) ────────────────────────────────────────────────────────────
function AdXL({d,tmpl}){
if(tmpl==="clean"){
// Clean white — logo thumbnail + large photo + structured content + QR
return(<div style={{width:400,height:500,display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:"sans-serif",background:"#fff",position:"relative"}}>
<div style={{background:d.p,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
<div style={{width:40,height:40,borderRadius:8,overflow:"hidden",flexShrink:0,border:"2px solid rgba(255,255,255,0.4)"}}><img src={d.photo} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/></div>
<div style={{flex:1,minWidth:0}}><div style={{color:"#fff",fontWeight:900,fontSize:20,lineHeight:1.0,fontFamily:"Georgia,serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.biz}</div></div>
</div>
<div style={{height:210,flexShrink:0,position:"relative",overflow:"hidden"}}><img src={d.photo} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} alt=""/></div>
<div style={{flex:1,padding:"10px 14px",display:"flex",flexDirection:"column",justifyContent:"space-between",background:"#fff",overflow:"hidden"}}>
<div><div style={{fontSize:14,fontWeight:900,color:d.d,fontFamily:"Georgia,serif",lineHeight:1.2,marginBottom:7}}>{d.tag}</div>{(d.services||[]).slice(0,4).map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><Check color={d.p} sz={12}/><span style={{fontSize:10,color:"#333",fontWeight:500}}>{s}</span></div>))}</div>
<div style={{display:"flex",flexDirection:"column",gap:5}}>
<Coupon offer={d.offer} fine={d.fine} color={d.p} scale={0.95}/>
<Phone phone={d.phone} color={d.p} size={13}/>
{d.addr&&<div style={{fontSize:8,color:"#666"}}>{d.addr}</div>}
</div>
</div>
<PositionedQR website={d.web} fScale={1.45} />
</div>);
}
// Default photo-bold — full-bleed photo + gradient overlay, with logo if available
return(<div style={{width:400,height:500,position:"relative",overflow:"hidden",fontFamily:"sans-serif"}}>
<img src={d.photo} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
<div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,"+d.d+"ee 0%,"+d.d+"22 40%,"+d.d+"dd 75%,"+d.d+"f5 100%)"}}/>
<div style={{position:"absolute",top:14,left:14,right:14}}>
<div style={{display:"flex",alignItems:"flex-start",gap:10}}>
{d.logo&&<img src={d.logo} style={{width:54,height:54,borderRadius:8,objectFit:"cover",border:"2px solid rgba(255,255,255,0.55)",flexShrink:0,boxShadow:"0 2px 8px rgba(0,0,0,0.4)"}} alt="logo"/>}
<div>
<div style={{color:"#fff",fontWeight:900,fontSize:d.logo?22:26,lineHeight:1.0,marginTop:3,fontFamily:"Georgia,serif",textShadow:"0 2px 8px rgba(0,0,0,0.8)"}}>{d.biz}</div>
</div>
</div>
</div>
<div style={{position:"absolute",top:"38%",left:14,right:14,textAlign:"center"}}>
<div style={{color:"#fff",fontWeight:800,fontSize:20,lineHeight:1.2,fontStyle:"italic",textShadow:"0 2px 12px rgba(0,0,0,0.9)"}}>{d.tag}</div>
</div>
<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"12px 14px",display:"flex",flexDirection:"column",gap:6}}>
<div style={{display:"flex",flexDirection:"column",gap:3}}>{(d.services||[]).slice(0,4).map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:6}}><Check color={d.a} sz={11}/><span style={{fontSize:10,color:"rgba(255,255,255,0.92)",fontWeight:600}}>{s}</span></div>))}</div>
<Coupon offer={d.offer} fine={d.fine} color={d.a} dark scale={0.9}/>
<Phone phone={d.phone} color="#fff" size={13}/>
{d.addr&&<div style={{fontSize:8,color:"rgba(255,255,255,0.6)"}}>{d.addr}</div>}
</div>
<PositionedQR website={d.web} fScale={1.45} dark />
</div>);
}

// ── L (300x400 portrait) ────────────────────────────────────────────────────
function AdL({d,tmpl}){
if(tmpl==="stamp"){
return(<div style={{width:300,height:400,position:"relative",overflow:"hidden",fontFamily:"sans-serif"}}>
<img src={d.photo} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
<div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,"+d.d+"dd 0%,"+d.d+"55 45%,"+d.d+"ee 100%)"}}/>
<div style={{position:"absolute",top:10,left:10,right:10}}>
<div style={{color:"#fff",fontWeight:900,fontSize:20,lineHeight:1.0,marginTop:6,fontFamily:"Georgia,serif",textShadow:"0 2px 8px rgba(0,0,0,0.9)"}}>{d.biz}</div>
<div style={{color:d.a,fontWeight:700,fontSize:12,marginTop:4,fontStyle:"italic"}}>{d.tag}</div>
</div>
<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"10px 12px",display:"flex",flexDirection:"column",gap:6}}>
<div style={{display:"flex",flexDirection:"column",gap:2}}>{(d.services||[]).slice(0,3).map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:5}}><Check color={d.a} sz={10}/><span style={{fontSize:9,color:"rgba(255,255,255,0.9)",fontWeight:600}}>{s}</span></div>))}</div>
<Coupon offer={d.offer} fine={d.fine} color={d.a} dark/>
<Phone phone={d.phone} color="#fff" size={12}/>
</div>
<PositionedQR website={d.web} fScale={1.15} dark />
</div>);
}
// Default split — photo top, content bottom
return(<div style={{width:300,height:400,display:"flex",flexDirection:"column",overflow:"hidden",background:"#fff",fontFamily:"sans-serif",position:"relative"}}>
<div style={{height:150,flexShrink:0,position:"relative",overflow:"hidden"}}>
<img src={d.photo} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} alt=""/>
<div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,transparent 50%,"+d.l+" 100%)"}}/>
</div>
<div style={{flex:1,background:d.l,display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"10px 12px",overflow:"hidden"}}>
<div>
<div style={{fontSize:18,fontWeight:900,color:d.d,fontFamily:"Georgia,serif",lineHeight:1.0,marginBottom:3}}>{d.biz}</div>
<div style={{fontSize:11,fontWeight:700,color:d.p,fontStyle:"italic",marginBottom:7}}>{d.tag}</div>
{(d.services||[]).slice(0,4).map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}><Check color={d.p} sz={12}/><span style={{fontSize:10,color:"#333",fontWeight:500}}>{s}</span></div>))}
</div>
<div style={{display:"flex",flexDirection:"column",gap:4}}>
<Coupon offer={d.offer} fine={d.fine} color={d.p} scale={0.85}/>
<Phone phone={d.phone} color={d.p} size={11}/>
{d.addr&&<div style={{fontSize:7,color:"#555"}}>{d.addr}</div>}
</div>
</div>
<PositionedQR website={d.web} fScale={1.15} />
</div>);
}

// ── M (variable w×h, defaults 200x200) ─────────────────────────────────────
// "photo"  — color header bar + photo strip + content + compact coupon (default)
// "banner" — full-photo cinematic with gradient overlay + bottom info strip
// "slate"  — clean horizontal split: content left | photo right

function AdM({d,w=200,h=200,tmpl="photo"}){

if(tmpl==="banner"){
// Full-photo background, dark gradient, badge top + name center + coupon/phone strip bottom
return(<div style={{width:w,height:h,position:"relative",overflow:"hidden",fontFamily:"sans-serif"}}>
<img src={d.photo} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
<div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,"+d.d+"55 0%,"+d.d+"11 30%,"+d.d+"cc 62%,"+d.d+"ff 100%)"}}/>
{/* business name + tagline */}
<div style={{position:"absolute",bottom:44,left:10,right:10}}>
<div style={{color:"#fff",fontWeight:900,fontSize:16,fontFamily:"Georgia,serif",lineHeight:1.1,textShadow:"0 2px 8px rgba(0,0,0,0.9)"}}>{d.biz}</div>
<div style={{color:d.a,fontSize:9,fontWeight:700,marginTop:2,fontStyle:"italic",lineHeight:1.2}}>{d.tag}</div>
</div>
{/* bottom info strip */}
<div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.72)",padding:"5px 10px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:6}}>
<CouponCompact offer={d.offer} fine={d.fine} color={d.a} dark/>
<Phone phone={d.phone} color="#fff" size={9}/>
</div>
<PositionedQR website={d.web} fScale={0.75} dark />
</div>);
}

if(tmpl==="slate"){
// Clean horizontal: content column (left) + full-height photo (right)
const pw=Math.round(w*0.36);
const cw=w-pw;
return(<div style={{width:w,height:h,display:"flex",overflow:"hidden",fontFamily:"sans-serif",background:d.l,position:"relative"}}>
{/* content column */}
<div style={{width:cw,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
<div style={{background:d.p,padding:"5px 8px",flexShrink:0}}>
<div style={{color:"#fff",fontWeight:900,fontSize:11,fontFamily:"Georgia,serif",lineHeight:1.05,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.biz}</div>
</div>
<div style={{flex:1,padding:"5px 8px",display:"flex",flexDirection:"column",justifyContent:"space-between",overflow:"hidden"}}>
<div>
<div style={{fontSize:10,fontWeight:700,color:d.d,fontFamily:"Georgia,serif",lineHeight:1.2,marginBottom:5}}>{d.tag}</div>
{(d.services||[]).slice(0,2).map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:3,marginBottom:3}}><Check color={d.p} sz={9}/><span style={{fontSize:8,color:"#333",fontWeight:500,lineHeight:1.2}}>{s}</span></div>))}
</div>
<div>
<CouponCompact offer={d.offer} fine={d.fine} color={d.p}/>
<Phone phone={d.phone} color={d.p} size={8}/>
</div>
</div>
</div>
{/* photo column - slate */}
<div style={{flex:1,position:"relative",overflow:"hidden"}}>
<img src={d.photo} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
<div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,"+d.l+"99 0%,transparent 35%)"}}/>
</div>
<PositionedQR website={d.web} fScale={0.75} dark />
</div>);
}

// Default "photo" — color header + photo strip + content + compact coupon
const photoH=Math.round(h*0.22);
return(<div style={{width:w,height:h,display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:"sans-serif",background:"#fff",position:"relative"}}>
{/* header bar */}
<div style={{background:d.p,padding:"5px 8px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
<div style={{color:"#fff",fontWeight:900,fontSize:11,lineHeight:1,fontFamily:"Georgia,serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{d.biz}</div>
<div style={{color:"#fff",fontSize:8,fontWeight:700,background:"rgba(0,0,0,0.25)",padding:"1px 5px",borderRadius:3,whiteSpace:"nowrap",flexShrink:0,marginLeft:4}}>{d.phone}</div>
</div>
{/* photo strip */}
<div style={{height:photoH,flexShrink:0,position:"relative",overflow:"hidden"}}>
<img src={d.photo} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} alt=""/>
<div style={{position:"absolute",inset:0,background:`linear-gradient(transparent 20%,${d.l}ff 100%)`}}/>
</div>
{/* content */}
<div style={{flex:1,padding:"4px 8px 5px",background:d.l,display:"flex",flexDirection:"column",justifyContent:"space-between",overflow:"hidden"}}>
<div style={{overflow:"hidden"}}>
<div style={{fontSize:10,fontWeight:900,color:d.d,fontFamily:"Georgia,serif",lineHeight:1.15,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{d.tag}</div>
{(d.services||[]).length>0&&(<div style={{display:"flex",flexWrap:"wrap",gap:"1px 6px",marginTop:2}}>{(d.services||[]).slice(0,2).map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:2,flexShrink:0}}><span style={{color:d.p,fontSize:6}}>●</span><span style={{fontSize:7,color:"#333",fontWeight:500,whiteSpace:"nowrap"}}>{s}</span></div>))}</div>)}
</div>
{d.offer&&<CouponCompact offer={d.offer} color={d.p}/>}
</div>
<PositionedQR website={d.web} fScale={0.75} />
</div>);
}

// ── S (200x200) ─────────────────────────────────────────────────────────────
function AdS({d}){return(<div style={{width:200,height:200,overflow:"hidden",position:"relative",fontFamily:"sans-serif"}}><img src={d.photo} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} alt=""/><div style={{position:"absolute",inset:0,background:`linear-gradient(180deg,${d.d}aa 0%,${d.d}f5 100%)`}}/><div style={{position:"absolute",inset:0,padding:"12px 10px",display:"flex",flexDirection:"column",justifyContent:"space-between",alignItems:"center",textAlign:"center"}}><div><div style={{color:"#fff",fontSize:16,fontWeight:900,fontFamily:"Georgia,serif",lineHeight:1.0,marginTop:3}}>{d.biz}</div><div style={{color:"rgba(255,255,255,0.85)",fontSize:10,fontStyle:"italic",marginTop:4,lineHeight:1.3}}>{d.tag}</div></div>{d.offer&&(<div style={{background:d.a,padding:"6px 10px",borderRadius:4,width:"100%",boxSizing:"border-box"}}><div style={{color:"#fff",fontWeight:900,fontSize:12,lineHeight:1.1}}>{d.offer}</div></div>)}<div style={{color:"#fff",fontSize:13,fontWeight:900,lineHeight:1}}>{d.phone}</div></div><PositionedQR website={d.web} fScale={0.65} dark /></div>);}

function AdHouse({w,h}){
  const s=h/200;
  const topH=Math.round(h*0.44);
  const botH=h-topH;
  const qrSz=Math.round(68*s);
  const circSz=Math.round(36*s);
  const iconSz=Math.round(20*s);
  const px=Math.round(10*s);
  const divH=Math.round(botH*0.72);
  const qrUrl="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data="+encodeURIComponent("https://mytownpostcard.com");
  const HouseIco=()=><svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>;
  const EnvIco=()=><svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,8 12,14 22,8"/></svg>;
  const PinIco=()=><svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>;
  const Ico=({icon,label})=>(<div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:Math.round(3*s),minWidth:0}}><div style={{width:circSz,height:circSz,borderRadius:"50%",background:"#c41c1c",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{icon}</div><div style={{color:"#fff",fontSize:Math.round(10*s),textAlign:"center",lineHeight:1.25,fontFamily:"sans-serif",fontWeight:500}}>{label}</div></div>);
  const Divider=()=><div style={{width:1,height:divH,background:"rgba(255,255,255,0.35)",flexShrink:0}}/>;
  return(
    <div style={{width:w,height:h,display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:"sans-serif"}}>
      <div style={{height:topH,background:"#f4f3ef",display:"flex",alignItems:"center",padding:`0 ${px}px`,gap:Math.round(10*s),flexShrink:0}}>
        <img src="/mailbox-logo.png" alt="My Town Postcard" style={{height:topH-Math.round(8*s),width:"auto",flexShrink:0}}/>
        <div style={{width:2,height:Math.round(58*s),background:"#991b1b",flexShrink:0}}/>
        <div style={{display:"flex",flexDirection:"column",justifyContent:"center",gap:Math.round(3*s)}}>
          <div style={{fontSize:Math.round(23*s),fontFamily:"Georgia,serif",fontWeight:700,lineHeight:1.05,whiteSpace:"nowrap"}}>
            <span style={{color:"#0d1d36"}}>My Town </span><span style={{color:"#991b1b"}}>Postcard</span>
          </div>
          <div style={{fontSize:Math.round(10.5*s),color:"#0d1d36",letterSpacing:Math.round(2*s),fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>
            Local Reach.&nbsp; Real Results.
          </div>
        </div>
      </div>
      <div style={{height:botH,background:"#0d1d36",display:"flex",alignItems:"center",padding:`0 ${px}px`,gap:Math.round(8*s),boxSizing:"border-box",overflow:"hidden"}}>
        <div style={{color:"#fff",fontFamily:"Impact,'Arial Black',sans-serif",fontSize:Math.round(34*s),fontWeight:900,flexShrink:0,lineHeight:1,textTransform:"uppercase",letterSpacing:0.5}}>
          ADVERTISE<br/>HERE!
        </div>
        <Divider/>
        <Ico icon={<HouseIco/>} label={<>Reach 5,000<br/>Homes In<br/>Your Town</>}/>
        <Divider/>
        <Ico icon={<EnvIco/>} label={<>USPS Every<br/>Door Direct<br/>Mail</>}/>
        <Divider/>
        <Ico icon={<PinIco/>} label={<>Targeted.<br/>Local.<br/>Effective.</>}/>
        <Divider/>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:Math.round(3*s),flexShrink:0}}>
          <div style={{background:"#fff",borderRadius:3,padding:Math.round(4*s)}}>
            <img src={qrUrl} style={{width:qrSz,height:qrSz,display:"block"}} alt="QR"/>
          </div>
          <div style={{color:"rgba(255,255,255,0.65)",fontSize:Math.round(9.5*s),textAlign:"center"}}>Scan to advertise</div>
        </div>
      </div>
    </div>
  );
}

function AdEDDM({w,h,eddmCity,eddmZip}){return(<div style={{width:w,height:h,background:"#f8f8f8",border:"2px solid #aaa",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,boxSizing:"border-box",padding:16}}><div style={{width:44,height:44,borderRadius:"50%",border:"3px solid #555",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:26,height:26,borderRadius:"50%",border:"2px dashed #555"}}/></div><div style={{textAlign:"center",lineHeight:1.8,fontFamily:"sans-serif",color:"#333"}}><div style={{fontSize:9,letterSpacing:1,fontWeight:600}}>PRESORTED STD</div><div style={{fontSize:9,letterSpacing:1,fontWeight:600}}>U.S. POSTAGE PAID</div><div style={{fontSize:9,letterSpacing:1,fontWeight:600}}>{eddmCity||"CLEVELAND"}, GA {eddmZip||"30528"}</div><div style={{marginTop:6,paddingTop:6,borderTop:"1px solid #ccc",fontSize:9,letterSpacing:2,fontWeight:600}}>LOCAL POSTAL CUSTOMER</div><div style={{fontWeight:900,fontSize:15,letterSpacing:3,marginTop:2}}>EDDM</div></div></div>);}

const SZ={
XL:{label:"Extra Large Ad", dims:'4" x 5"', price:"$499"},
L: {label:"Large Ad",       dims:'3" x 4"', price:"$399"},
M: {label:"Medium Ad",      dims:'3" x 2"', price:"$299"},
S: {label:"Small Ad",       dims:'2" x 2"', price:"$199"},
};

function AvailableSpot({spot,hovered,onClick,onEnter,onLeave,soldOnSide=0}){
const info=SZ[spot.size]||{};
const isXL=spot.size==="XL",isL=spot.size==="L",isM=spot.size==="M";
const csz=isXL?80:isL?60:isM?44:28;
const lsz=isXL?20:isL?16:isM?13:11;
const psz=isXL?34:isL?26:isM?20:15;
const dsz=isXL?14:isL?11:isM?10:9;
const showBtn=true;
const bh=isXL?44:isL?34:26;
const bf=isXL?13:isL?11:10;
return(
<div onClick={onClick} onMouseEnter={onEnter} onMouseLeave={onLeave} style={{width:spot.w,height:spot.h,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",boxSizing:"border-box",position:"relative",overflow:"hidden",background:hovered?"linear-gradient(135deg,#ecfdf5,#d1fae5)":"linear-gradient(135deg,#f8fffe,#f0fdf4)",border:`3px solid ${hovered?"#16a34a":"#4ade80"}`,transition:"all 0.18s ease",gap:spot.size==="S"?3:6,fontFamily:"sans-serif"}}>
<div style={{position:"absolute",top:0,right:0,width:0,height:0,borderStyle:"solid",borderWidth:`0 ${isXL?40:isL?30:22}px ${isXL?40:isL?30:22}px 0`,borderColor:`transparent ${hovered?"#16a34a":"#22c55e"} transparent transparent`,opacity:hovered?1:0.5,transition:"opacity 0.18s"}}/>
<div style={{width:csz,height:csz,borderRadius:"50%",background:hovered?"#16a34a":"#22c55e",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:hovered?"0 4px 16px rgba(22,163,74,0.45)":"0 2px 8px rgba(34,197,94,0.3)",transition:"all 0.18s",flexShrink:0}}>
<span style={{color:"#fff",fontSize:csz*0.45,fontWeight:200,lineHeight:1}}>+</span>
</div>
<div style={{color:hovered?"#15803d":"#166534",fontSize:lsz,fontWeight:800,letterSpacing:0.3,textAlign:"center",lineHeight:1}}>{info.label}</div>
<div style={{color:"#111",fontSize:psz,fontWeight:900,fontFamily:"Georgia,serif",lineHeight:1,letterSpacing:-0.5}}>${spot.price}</div>
<div style={{color:"#666",fontSize:dsz,fontWeight:600,letterSpacing:0.5}}>{info.dims}</div>
{showBtn&&(<div style={{marginTop:2,height:bh,paddingLeft:isXL?24:16,paddingRight:isXL?24:16,background:hovered?"#15803d":"#16a34a",borderRadius:bh/2,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:bf,letterSpacing:0.5,textTransform:"uppercase",boxShadow:hovered?"0 4px 14px rgba(21,128,61,0.55)":"0 2px 6px rgba(22,163,74,0.35)",transition:"all 0.18s"}}>Reserve This Spot</div>)}
{spot.size!=="S"&&<div style={{fontSize:isXL?10:isL?8:7,color:"#9ca3af",fontStyle:"italic",textAlign:"center"}}>Reaches 5,000 local homes</div>}
{spot.size!=="S"&&<div style={{fontSize:isXL?9:isL?7:6,color:soldOnSide===0?"#b8860b":"#6b7280",fontWeight:soldOnSide===0?700:400,fontStyle:"italic",textAlign:"center",lineHeight:1.3,paddingLeft:4,paddingRight:4}}>{soldOnSide===0?"Be the first in your category":"One per category — no competitor once claimed"}</div>}
</div>
);
}

function ScaledCell({spot,scale,children}){
const cw=spot.w*scale-7,ch=spot.h*scale-7;
return(<div style={{position:"absolute",left:spot.x*scale+3.5,top:spot.y*scale+3.5,width:cw,height:ch,overflow:"hidden",borderRadius:3}}><div style={{width:spot.w,height:spot.h,transform:`scale(${cw/spot.w},${ch/spot.h})`,transformOrigin:"top left"}}>{children}</div></div>);
}

function SpotCell({spot,scale,hov,onHov,onOut,onSel,liveSpot,isHighlighted,territory,eddmCity,eddmZip,soldOnSide=0}){
const k=spot.sample;
const t=spot.tmpl||"photo";
if(k==="house")return<ScaledCell spot={spot} scale={scale}><AdHouse w={spot.w} h={spot.h} territory={territory}/></ScaledCell>;
if(k==="eddm") return<ScaledCell spot={spot} scale={scale}><AdEDDM w={spot.w} h={spot.h} eddmCity={eddmCity} eddmZip={eddmZip}/></ScaledCell>;
// Paid spot with saved template data → render the real customer ad (pointer-events off so it's display only)
if(liveSpot&&liveSpot.status==="paid"&&liveSpot.templateData){
  const{template,sizeKey,finishedAdUrl,...adData}=liveSpot.templateData;
  const sk=sizeKey||(spot.size==="XL"?"XL":spot.size==="L"?"L":spot.size==="M"?"M":"S");
  return(<ScaledCell spot={spot} scale={scale}>
    <div style={{width:spot.w,height:spot.h,pointerEvents:"none",position:"relative"}}>
      {finishedAdUrl
        ?<img src={finishedAdUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
        :<AdTemplatePreview templateKey={template||"split-clean"} formData={adData} sizeKey={sk}/>
      }
      {isHighlighted&&<>
        <style>{`@keyframes lsPulse{0%,100%{box-shadow:0 0 0 0 rgba(22,163,74,0.85),inset 0 0 0 4px #16a34a}50%{box-shadow:0 0 0 10px rgba(22,163,74,0),inset 0 0 0 4px #15803d}}`}</style>
        <div style={{position:"absolute",inset:0,borderRadius:2,border:"4px solid #16a34a",animation:"lsPulse 0.8s ease-in-out 3",pointerEvents:"none",boxSizing:"border-box"}}/>
      </>}
    </div>
  </ScaledCell>);
}
// Paid spot without template data → show adFileUrl image or business-name placeholder.
// Never fall back to a hardcoded demo ad for a real paid spot.
if(liveSpot&&liveSpot.status==="paid"){
  if(liveSpot.adFileUrl){return(<ScaledCell spot={spot} scale={scale}><div style={{width:spot.w,height:spot.h,pointerEvents:"none",background:"#000",overflow:"hidden"}}><img src={liveSpot.adFileUrl} alt={liveSpot.businessName||""} style={{width:"100%",height:"100%",objectFit:"contain",display:"block"}}/></div></ScaledCell>);}
  const biz=liveSpot.businessName||"Local Business";
  const fz=spot.size==="XL"?22:spot.size==="L"?18:13;
  return(<ScaledCell spot={spot} scale={scale}><div style={{width:spot.w,height:spot.h,background:"linear-gradient(135deg,#1a2744,#0f1729)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",pointerEvents:"none",padding:12,boxSizing:"border-box",gap:8}}><div style={{color:"rgba(255,255,255,0.35)",fontSize:7,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Community Ad</div><div style={{color:"#fff",fontWeight:900,fontSize:fz,fontFamily:"Georgia,serif",textAlign:"center",lineHeight:1.2}}>{biz}</div><div style={{width:32,height:2,background:"rgba(255,255,255,0.2)",borderRadius:1}}/><div style={{color:"rgba(255,255,255,0.4)",fontSize:8,fontFamily:"sans-serif"}}>mytownpostcard.com</div></div></ScaledCell>);
}
// Reserved spot → show as green/available; the 30-min hold is transient.
// If the spot is still held when someone tries to reserve it, the reserve API will
// return an error and the picker will show "Sorry, that spot was just taken."
if(liveSpot&&liveSpot.status==="reserved"){
  return<ScaledCell spot={spot} scale={scale}><AvailableSpot spot={spot} hovered={hov===spot.id} onClick={()=>onSel(spot)} onEnter={()=>onHov(spot.id)} onLeave={onOut} soldOnSide={soldOnSide}/></ScaledCell>;
}
// Live available slot → always show reservation UI (overrides any demo sample)
if(liveSpot&&liveSpot.status==="available"){
  return<ScaledCell spot={spot} scale={scale}><AvailableSpot spot={spot} hovered={hov===spot.id} onClick={()=>onSel(spot)} onEnter={()=>onHov(spot.id)} onLeave={onOut} soldOnSide={soldOnSide}/></ScaledCell>;
}
if(spot.imgSrc)return(<ScaledCell spot={spot} scale={scale}><div style={{width:spot.w,height:spot.h,pointerEvents:"none",overflow:"hidden"}}><img src={spot.imgSrc} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/></div></ScaledCell>);
if(k===null)   return<ScaledCell spot={spot} scale={scale}><AvailableSpot spot={spot} hovered={hov===spot.id} onClick={()=>onSel(spot)} onEnter={()=>onHov(spot.id)} onLeave={onOut} soldOnSide={soldOnSide}/></ScaledCell>;
const d=ADS[k]; if(!d)return null;
return(<ScaledCell spot={spot} scale={scale}>{spot.size==="XL"&&<AdXL d={d} tmpl={t}/>}{spot.size==="L"&&<AdL d={d} tmpl={t}/>}{spot.size==="M"&&<AdM d={d} w={spot.w} h={spot.h} tmpl={t}/>}{spot.size==="S"&&<AdS d={d}/>}</ScaledCell>);
}

// Maps each picker spot id to its exact DB grid_area.
// Front: every visual cell has a 1:1 DB row.
// Back: only some visual cells have a dedicated DB row (dbGridArea set); the rest
// are visual-only filler that fall back to size-priority reservation.
const FRONT_GRID_MAP = { xl1:"mb", xl2:"dn", xl3:"re", l1:"l1", l2:"l2", l3:"l3", l4:"l4" };
const BACK_GRID_MAP  = { bxl1:"bxl", bxl2:"bxl2", bxl3:"bxl3", bm1:"bm1", bm2:"bm2", bm3:"bm3", bm4:"bm4", bs1:"bs1" };

export default function PostcardPicker({slug}={}){
const search=useSearch();
const params=new URLSearchParams(search);
const initialSide=params.get("side")==="back"?"back":"front";
const highlightArea=params.get("highlight")||null;
const [side,setSide]=useState(initialSide);
const [scale,setScale]=useState(0.5);
const [hov,setHov]=useState(null);
const [sel,setSel]=useState(null);
const [adMethod,setAdMethod]=useState(null);
const [reserving,setReserving]=useState(false);
const [reserveError,setReserveError]=useState(null);
const PENDING_AD_KEY='localspot:grok:pendingAd';
const [pendingGrokAd,setPendingGrokAd]=useState(null);

const handleSpotSelect=(spot)=>{setSel(spot);setAdMethod(null);setReserveError(null);};
const [highlighted,setHighlighted]=useState(highlightArea);
const ref=useRef(null);
const [,navigate]=useLocation();
// Scroll to the picker and auto-clear the highlight after 3 seconds
useEffect(()=>{
  if(!highlighted)return;
  // Small delay to let the page finish rendering before scrolling
  const scrollT=setTimeout(()=>{
    document.getElementById("book")?.scrollIntoView({behavior:"smooth"});
  },100);
  const clearT=setTimeout(()=>setHighlighted(null),3000);
  return()=>{clearTimeout(scrollT);clearTimeout(clearT);};
},[highlighted]);

// On mount: check for a Grok ad the user finished before the page reloaded.
// The popup writes this key to localStorage right before sending postMessage,
// so even if the parent page reloaded and the listener was gone, we can
// recover and offer to complete the reservation.
useEffect(()=>{
  try{
    const raw=localStorage.getItem(PENDING_AD_KEY);
    if(!raw)return;
    const pending=JSON.parse(raw);
    if(Date.now()-(pending.savedAt||0)>30*60*1000){
      localStorage.removeItem(PENDING_AD_KEY);
      return;
    }
    setPendingGrokAd(pending);
  }catch(e){}
},[]);
const queryClient=useQueryClient();
// Home page (no slug) loads the single active campaign; a territory/dealer
// landing page passes its slug and loads that published campaign instead.
// Both queries are always mounted but only the relevant one is enabled.
const activeQ=useGetActiveCampaign({query:{enabled:!slug,refetchInterval:60_000}});
const slugQ=useGetCampaignBySlug(slug||"",{query:{enabled:!!slug,refetchInterval:60_000}});
const campaign=slug?slugQ.data:activeQ.data;
const campaignFetching=slug?slugQ.isFetching:activeQ.isFetching;
// Query key used when we need to force-refresh campaign data mid-flow (e.g.
// right before reserving so we don't grab a spot that was just taken).
const campaignQueryKey=slug?getGetCampaignBySlugQueryKey(slug):getGetActiveCampaignQueryKey();
const reserveMutation=useReserveSpot();
// Build gridArea → live spot lookup so each picker cell can check the DB status
const spotByGridArea=useMemo(()=>{
  const m={};
  (campaign?.spots||[]).forEach(s=>{m[s.gridArea]=s;});
  return m;
},[campaign]);

const takenCategories=useMemo(()=>{
  return(campaign?.spots||[])
    .filter(s=>s.status==="paid"&&s.businessCategory)
    .map(s=>s.businessCategory);
},[campaign]);

// selOverride / sideOverride let the Grok popup handler pass the spot that
// was selected at popup-open time, avoiding stale-closure bugs when the
// component has re-rendered many times (e.g. due to campaign polling) while
// the user was working inside the popup.
const handleComplete=async(formData,selOverride,sideOverride)=>{
  const currentSel=selOverride!==undefined?selOverride:sel;
  const currentSide=sideOverride!==undefined?sideOverride:side;
  if(!campaign){
    console.error('[handleComplete] campaign is null');
    setReserveError("Campaign not found. Please refresh and try again.");
    return;
  }
  setReserving(true);
  setReserveError(null);
  try{
    // Refresh campaign data so we don't pick a spot that was just taken
    const fresh=await queryClient.fetchQuery({queryKey:campaignQueryKey,staleTime:0});
    const spots=fresh?.spots||[];
    const sizeMap={XL:"xl",L:"large",M:"medium",S:"small"};
    const dbSize=sizeMap[currentSel?.size];

    let realSpot=null;
    if(currentSide==="front"){
      // Use direct positional mapping — each demo spot corresponds to an exact DB grid_area
      const gridArea=FRONT_GRID_MAP[currentSel?.id];
      if(!gridArea){
        console.error('[handleComplete] unknown front gridArea for sel.id:',currentSel?.id);
        setReserveError("Unknown spot position. Please close and try again.");
        setReserving(false);return;
      }
      realSpot=spots.find(s=>s.gridArea===gridArea);
      // If the preferred spot is taken, fall back to any available front spot of the same size
      if(!realSpot||realSpot.status!=="available"){
        console.error('[handleComplete] front spot not available:',gridArea,realSpot?.status,'— trying same-size fallback');
        realSpot=spots.find(s=>s.size===dbSize&&s.side==="front"&&s.status==="available");
      }
      if(!realSpot){
        setReserveError("Sorry, that spot was just taken and no similar spots are available. Please choose another.");
        setReserving(false);return;
      }
    }else{
      // Back: prefer exact DB match for cells that have one; fall back to
      // size-priority for the visual-only filler cells (dbGridArea:null).
      const gridArea=BACK_GRID_MAP[currentSel?.id];
      if(gridArea){
        realSpot=spots.find(s=>s.gridArea===gridArea);
        // If the preferred spot is taken, fall back to any available back spot of the same size
        if(!realSpot||realSpot.status!=="available"){
          console.error('[handleComplete] back spot not available:',gridArea,realSpot?.status,'— trying same-size fallback');
          realSpot=spots.find(s=>s.size===dbSize&&s.side==="back"&&s.status==="available");
        }
        if(!realSpot){
          setReserveError("Sorry, that spot was just taken and no similar spots are available. Please choose another.");
          setReserving(false);return;
        }
      }else{
        // Visual filler cell — claim any available back spot of the same size
        // that isn't already covered by a mapped visual cell.
        const mappedAreas=new Set(Object.values(BACK_GRID_MAP));
        realSpot=spots.find(s=>s.size===dbSize&&s.side==="back"&&s.status==="available"&&!mappedAreas.has(s.gridArea));
        if(!realSpot){
          // All unmapped spots of this size taken — claim any available of this size
          realSpot=spots.find(s=>s.size===dbSize&&s.side==="back"&&s.status==="available");
        }
        if(!realSpot){
          console.error('[handleComplete] no back spot available for size:',dbSize);
          setReserveError("Sorry, no spots of that size are currently available.");
          setReserving(false);return;
        }
      }
    }

    const result=await reserveMutation.mutateAsync({
      id:realSpot.id,
      data:{
        businessName:formData.businessName,
        businessCategory:formData.industry,
        contactEmail:formData.email,
        contactPhone:formData.phone||undefined,
        website:formData.website||undefined,
        // Save the full design state so the picker renders the real ad
        templateData:{
          template:formData.template,
          sizeKey:formData.sizeKey,
          finishedAdUrl:formData.finishedAdUrl||undefined,
          businessName:formData.businessName,
          industry:formData.industry,
          tagline:formData.tagline,
          offer:formData.offer,
          offerFine:formData.offerFine,
          phone:formData.phone,
          address:formData.address,
          website:formData.website,
          logo:formData.logo,
          photo:formData.photo,
          menuItems:formData.menuItems,
          fontSizes:formData.fontSizes,
          fieldWidths:formData.fieldWidths,
        },
      },
    });
    setSel(null);
    localStorage.removeItem(PENDING_AD_KEY);
    if(slug){
      // Territory/dealer landing pages use hosted Stripe Checkout: create a
      // session for the reserved spot and hand off to Stripe. On success the
      // customer lands on /spot-confirmation which finalizes the sale.
      const res=await fetch(`${import.meta.env.BASE_URL}api/checkout/create-spot-session`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({spotId:result.id,slug}),
      });
      const data=await res.json();
      if(!res.ok||!data?.url){
        throw new Error(data?.error||"Could not start checkout. Please try again.");
      }
      window.location.href=data.url;
      return;
    }
    navigate(`/checkout/${result.id}`);
  }catch(err){
    console.error('[handleComplete] caught error:',err);
    setReserveError(err?.data?.error||err?.message||"Something went wrong. Please try again.");
  }finally{
    setReserving(false);
  }
};

// Resume a pending Grok ad after the parent page reloaded.
const handleResumePendingAd=()=>{
  if(!pendingGrokAd)return;
  const{formData,pickerSpotId,spotSize}=pendingGrokAd;
  // Infer side from picker ID convention: back-side spots start with 'b'.
  const inferredSide=pickerSpotId.startsWith('b')?'back':'front';
  const sideSpots=inferredSide==='front'?FRONT:BACK;
  // Prefer the exact spot; fall back to any available spot of the same size.
  const pickerSpot=sideSpots.find(s=>s.id===pickerSpotId)||sideSpots.find(s=>s.size===spotSize);
  // Always clear the stored entry before doing anything so the banner
  // doesn't reappear if the user navigates back after a success.
  localStorage.removeItem(PENDING_AD_KEY);
  setPendingGrokAd(null);
  if(!pickerSpot)return;
  setSide(inferredSide);
  setSel(pickerSpot);
  setAdMethod('grok');
  savedGrokContextRef.current={formData,sel:pickerSpot,side:inferredSide};
  handleComplete(formData,pickerSpot,inferredSide);
};

const grokListenerRef=useRef(null);
const grokPopupRef=useRef(null);
// Saved Grok context lets the user retry after a reserve failure without
// re-opening the popup and recreating their ad from scratch.
const savedGrokContextRef=useRef(null);
const openGrokGenerator=()=>{
  if(!sel){console.error('[openGrokGenerator] called with null sel — aborting');return;}
  // Capture sel and side at popup-open time so the message handler always
  // uses the correct spot, regardless of how many re-renders (e.g. campaign
  // polling) happen while the user is working in the popup.
  const capturedSel=sel;
  const capturedSide=side;
  const dbSpotId=spotByGridArea[sel.dbGridArea]?.id??'';
  const dbCampaignId=campaign?.id??'';
  const url=`/api/grok-ad-generator?spotSize=${encodeURIComponent(sel.size||'')}&spotId=${encodeURIComponent(dbSpotId)}&bizName=&industry=&taken=${encodeURIComponent(takenCategories.join(','))}&campaignId=${encodeURIComponent(dbCampaignId)}&side=${encodeURIComponent(side||'front')}`;
  const popup=window.open(url,'mytown_ad_generator','width=1120,height=800,left=80,top=60');
  if(popup)popup.focus();
  grokPopupRef.current=popup;
  setAdMethod("grok");
  const handler=(e)=>{
    if(!e.data||e.data.type!=='grok-ad-result')return;
    // Guard only on message type — origin checks are unreliable in Replit's
    // proxied iframe environment where the popup and the parent window can
    // resolve to different effective origins even though they share a domain.
    window.removeEventListener('message',handler);
    grokListenerRef.current=null;
    grokPopupRef.current=null;
    // Save the complete context so the user can retry if the reserve fails,
    // without losing the ad they just created.
    savedGrokContextRef.current={formData:e.data.formData,sel:capturedSel,side:capturedSide};
    // Re-assert sel/side/adMethod state — the component may have re-rendered
    // many times while the popup was open.  Without this the error modal
    // condition (sel && adMethod==="grok") can silently fail to render.
    setSel(capturedSel);
    setSide(capturedSide);
    setAdMethod("grok");
    // Pass the captured spot so handleComplete never uses a stale closure value
    handleComplete(e.data.formData,capturedSel,capturedSide);
  };
  if(grokListenerRef.current)window.removeEventListener('message',grokListenerRef.current);
  grokListenerRef.current=handler;
  window.addEventListener('message',handler);
};
useEffect(()=>()=>{if(grokListenerRef.current)window.removeEventListener('message',grokListenerRef.current);},[]);

useEffect(()=>{
function upd(){if(ref.current){setScale(ref.current.offsetWidth/W);}}
upd();
const ro=new ResizeObserver(upd);
if(ref.current)ro.observe(ref.current);
return()=>ro.disconnect();
},[]);

const spots=side==="front"?FRONT:BACK;
// Count sold spots directly from campaign API data (by side) so all DB rows
// are included — not just the subset that have a visual grid cell mapped.
const allSpots=campaign?.spots||[];
const soldF=allSpots.filter(s=>s.side==="front"&&s.status==="paid").length;
const soldB=allSpots.filter(s=>s.side==="back"&&s.status==="paid").length;
// Totals: front has 7 sellable cells; back visual grid has 8 sellable cells
// (3 XL + 4 M + 1 S, excluding the house-ad and EDDM blocks).
const totF=7;
const totB=8;

return(<div style={{fontFamily:"sans-serif"}}>
<style>{`@media (max-width: 768px) and (orientation: portrait) { .rotate-prompt { display: flex !important; } .postcard-section { display: none !important; } } @media (min-width: 769px), (orientation: landscape) { .rotate-prompt { display: none !important; } .postcard-section { display: flex !important; } }`}</style>

<div className="rotate-prompt" style={{display:"none",position:"fixed",inset:0,background:"#0f172a",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:999,gap:24,padding:32}}>
  <div style={{fontSize:64,animation:"spin 2s linear infinite"}}>
    <style>{`@keyframes spin{0%{transform:rotate(0deg)}50%{transform:rotate(90deg)}100%{transform:rotate(90deg)}}`}</style>
    🔄
  </div>
  <div style={{color:"#fff",fontWeight:900,fontSize:22,fontFamily:"Georgia,serif",textAlign:"center"}}>Please rotate your device</div>
  <div style={{color:"rgba(255,255,255,0.6)",fontSize:14,textAlign:"center",maxWidth:280,lineHeight:1.6}}>The postcard picker is designed for landscape view. Rotate your phone sideways for the best experience.</div>
  <div style={{color:"rgba(255,255,255,0.3)",fontSize:40,marginTop:8}}>🔄</div>
</div>

<div className="postcard-section" style={{display:"flex",width:"100%",fontFamily:"sans-serif",background:"transparent",flexDirection:"column",boxSizing:"border-box",height:"100dvh",padding:"8px 20px 8px",overflow:"hidden"}}>
  {pendingGrokAd&&(
    <div style={{background:"#1a2744",color:"#fff",borderRadius:8,padding:"8px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,gap:12,marginBottom:6}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:20}}>⚡</span>
        <div>
          <div style={{fontWeight:700,fontSize:13,lineHeight:1.3}}>Your AI ad for {pendingGrokAd.formData?.businessName||'your business'} is ready</div>
          <div style={{fontSize:11,opacity:0.7}}>Page reloaded before your reservation completed — pick up right where you left off</div>
        </div>
      </div>
      <div style={{display:"flex",gap:8,flexShrink:0}}>
        <button onClick={handleResumePendingAd} style={{background:"#991b1b",color:"#fff",border:"none",borderRadius:6,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:12,whiteSpace:"nowrap"}}>Continue →</button>
        <button onClick={()=>{localStorage.removeItem(PENDING_AD_KEY);setPendingGrokAd(null);}} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"none",borderRadius:6,padding:"6px 10px",cursor:"pointer",fontSize:13,lineHeight:1}}>✕</button>
      </div>
    </div>
  )}
  {(()=>{
    const avail=side==="front"?Math.max(0,totF-soldF):Math.max(0,totB-soldB);
    if(!avail)return null;
    return(
      <div style={{background:"#C9A84C",color:"#7B1418",borderRadius:8,padding:"6px 16px",display:"flex",alignItems:"center",justifyContent:"center",gap:8,flexShrink:0,marginBottom:6,fontFamily:"sans-serif",fontWeight:700,fontSize:13,textAlign:"center"}}>
        <span style={{fontSize:15}}>⚡</span>
        <span>Only <strong>{avail}</strong> spot{avail===1?"":"s"} open on the {side} side — one business per category. No competitor once you claim it.</span>
      </div>
    );
  })()}
  <div style={{textAlign:"center",marginBottom:2,flexShrink:0}}>
    <div style={{fontSize:22,fontWeight:900,color:"#111",fontFamily:"Georgia,serif",letterSpacing:-0.3}}>Reserve Your Spot on {(campaign?.cityList?.split(",")[0]?.trim() || campaign?.territory || "Clarkesville").replace(/Counties\b/g, "County")}'s Postcard</div>
    <div style={{fontSize:16,color:"#64748b",marginTop:1}}>Click any <span style={{color:"#16a34a",fontWeight:700}}>green spot</span> below to claim yours</div>
  </div>
  <div style={{display:"flex",justifyContent:"center",marginBottom:2,flexShrink:0}}>
    <div style={{background:"#fff",borderRadius:12,padding:4,display:"flex",gap:3,boxShadow:"0 1px 8px rgba(0,0,0,0.1)"}}>
      {[{id:"front",l:"Front Side",sold:soldF,tot:totF},{id:"back",l:"Back Side",sold:soldB,tot:totB}].map(s=>(
        <button key={s.id} onClick={()=>setSide(s.id)} style={{padding:"7px 22px",borderRadius:9,border:"none",cursor:"pointer",background:side===s.id?"linear-gradient(135deg,#991b1b,#7f1d1d)":"transparent",color:side===s.id?"#fff":"#64748b",fontWeight:700,fontSize:15,transition:"all 0.18s",lineHeight:1.3}}>
          {s.l}<br/>
          <span style={{fontSize:12,fontWeight:400,opacity:0.8}}>{s.sold} of {s.tot} sold</span>
        </button>
      ))}
    </div>
  </div>
  <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",minHeight:0,padding:"4px 20px 8px"}}>
    <div ref={ref} style={{width:"100%",maxWidth:"calc((100dvh - 160px) * 12 / 9)",marginTop:24}}>
      <div style={{position:"relative",width:"100%",paddingBottom:"75%",background:"#c8c8c8",borderRadius:6,boxShadow:"0 0 0 7px #c8c8c8, 0 0 0 8.5px #a8a8a8, 0 16px 48px rgba(0,0,0,0.28), 0 4px 12px rgba(0,0,0,0.14)"}}>
        <div style={{position:"absolute",inset:0,overflow:"hidden",borderRadius:5,background:"#c8c8c8"}}>
          {spots.map(spot=>{
            const liveSpot=spot.dbGridArea?spotByGridArea[spot.dbGridArea]:null;
            const isHighlighted=highlighted&&spot.dbGridArea===highlighted;
            return<SpotCell key={spot.id} spot={spot} scale={scale} hov={hov} onHov={setHov} onOut={()=>setHov(null)} onSel={handleSpotSelect} liveSpot={liveSpot} isHighlighted={isHighlighted} territory={campaign?.territory} eddmCity={(campaign?.cityList||"").split(",")[0].trim().toUpperCase()||undefined} eddmZip={campaign?.zipCode||undefined} soldOnSide={side==="front"?soldF:soldB}/>;
          })}
          {campaignFetching&&!reserving&&(
            <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:10,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <style>{`@keyframes lsShimmer{0%{opacity:0.55}50%{opacity:0.85}100%{opacity:0.55}}@keyframes lsSpin{to{transform:rotate(360deg)}}`}</style>
              <div style={{position:"absolute",inset:0,background:"rgba(15,23,42,0.45)",animation:"lsShimmer 1.6s ease-in-out infinite"}}/>
              <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
                <div style={{width:36,height:36,border:"4px solid rgba(255,255,255,0.25)",borderTopColor:"#fff",borderRadius:"50%",animation:"lsSpin 0.85s linear infinite"}}/>
                <div style={{color:"#fff",fontWeight:700,fontSize:13,letterSpacing:0.3,textShadow:"0 1px 4px rgba(0,0,0,0.5)"}}>Updating postcard…</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
</div>

<div style={{display:"flex",justifyContent:"center",gap:20,marginTop:2,flexWrap:"wrap",flexShrink:0}}>
  
</div>

{/* Choice modal — shown when a spot is selected but method not yet chosen */}
{sel&&!adMethod&&(
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}>
    <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:440,padding:"36px 32px",boxShadow:"0 24px 64px rgba(0,0,0,0.4)"}}>
      <div style={{textAlign:"center",marginBottom:10}}>
        <span style={{display:"inline-block",background:"#991b1b",color:"#fff",borderRadius:99,padding:"5px 18px",fontSize:13,fontWeight:800}}>
          {sel.size} Spot — ${sel.price}
        </span>
      </div>
      <h2 style={{textAlign:"center",fontWeight:900,fontSize:21,color:"#111",margin:"0 0 6px"}}>How would you like to create your ad?</h2>
      <p style={{textAlign:"center",color:"#6b7280",fontSize:13,margin:"0 0 28px",lineHeight:1.5}}>Choose a path — you can always go back.</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        <button
          onClick={()=>setAdMethod("upload")}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="#991b1b";e.currentTarget.style.background="#fef2f2";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="#e5e7eb";e.currentTarget.style.background="#fff";}}
          style={{padding:"24px 16px",border:"2px solid #e5e7eb",borderRadius:12,background:"#fff",cursor:"pointer",textAlign:"left",transition:"border-color 0.15s, background 0.15s"}}>
          <div style={{fontSize:32,marginBottom:10}}>📎</div>
          <div style={{fontWeight:800,fontSize:14,color:"#111",marginBottom:5}}>Upload Finished Ad</div>
          <div style={{fontSize:12,color:"#6b7280",lineHeight:1.5}}>I already have a completed ad. Upload it and we'll print it exactly as-is.</div>
        </button>
        <button
          onClick={()=>openGrokGenerator()}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="#1a1a2e";e.currentTarget.style.background="#f5f0ff";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="#e5e7eb";e.currentTarget.style.background="#fff";}}
          style={{padding:"24px 16px",border:"2px solid #e5e7eb",borderRadius:12,background:"#fff",cursor:"pointer",textAlign:"left",transition:"border-color 0.15s, background 0.15s",position:"relative"}}>
          <div style={{position:"absolute",top:8,right:8,background:"linear-gradient(135deg,#1a1a2e,#3D1A6B)",color:"#fff",fontSize:8,fontWeight:800,letterSpacing:"0.08em",padding:"2px 8px",borderRadius:99,textTransform:"uppercase"}}>AI</div>
          <div style={{fontSize:32,marginBottom:10}}>⚡</div>
          <div style={{fontWeight:800,fontSize:14,color:"#111",marginBottom:5}}>Design with Grok AI</div>
          <div style={{fontSize:12,color:"#6b7280",lineHeight:1.5}}>Fill in your business details and let Grok AI generate a premium postcard ad in seconds.</div>
        </button>
      </div>
      <div style={{textAlign:"center"}}>
        <button onClick={()=>{setSel(null);setAdMethod(null);setReserveError(null);}} style={{background:"none",border:"none",color:"#9ca3af",fontSize:13,cursor:"pointer",padding:"4px 8px"}}>Cancel</button>
      </div>
    </div>
  </div>
)}

{/* Upload finished ad */}
{sel&&adMethod==="upload"&&(
  <AdUploadModal
    initialSize={sel.size}
    onComplete={handleComplete}
    onBack={()=>setAdMethod(null)}
    isReserving={reserving}
    reserveError={reserveError}
    takenCategories={takenCategories}
  />
)}

{/* Grok flow — reserving spinner */}
{sel&&adMethod==="grok"&&reserving&&!reserveError&&(
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1999}}>
    <style>{`@keyframes lsSpinModal{to{transform:rotate(360deg)}}@keyframes lsDotPulse{0%,80%,100%{opacity:0.25;transform:scale(0.7)}40%{opacity:1;transform:scale(1)}}`}</style>
    <div style={{background:"#fff",borderRadius:16,padding:"40px 52px",textAlign:"center",boxShadow:"0 24px 64px rgba(0,0,0,0.4)",minWidth:260}}>
      <div style={{display:"flex",justifyContent:"center",marginBottom:20}}>
        <div style={{position:"relative",width:56,height:56}}>
          <div style={{position:"absolute",inset:0,borderRadius:"50%",border:"5px solid #f1f5f9"}}/>
          <div style={{position:"absolute",inset:0,borderRadius:"50%",border:"5px solid transparent",borderTopColor:"#991b1b",animation:"lsSpinModal 0.9s linear infinite"}}/>
          <div style={{position:"absolute",inset:"14px",borderRadius:"50%",background:"#fef2f2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📬</div>
        </div>
      </div>
      <div style={{fontWeight:900,fontSize:18,color:"#111",marginBottom:6}}>Reserving your spot…</div>
      <div style={{color:"#6b7280",fontSize:13,lineHeight:1.5}}>Locking in your ad placement.<br/>Just a moment.</div>
      <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:18}}>
        {[0,150,300].map(d=>(
          <div key={d} style={{width:7,height:7,borderRadius:"50%",background:"#991b1b",animation:`lsDotPulse 1.2s ${d}ms ease-in-out infinite`}}/>
        ))}
      </div>
    </div>
  </div>
)}

{/* Grok flow — reserve error */}
{sel&&adMethod==="grok"&&!reserving&&reserveError&&(
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1999,padding:16}}>
    <div style={{background:"#fff",borderRadius:14,padding:"36px 32px",textAlign:"center",boxShadow:"0 24px 64px rgba(0,0,0,0.35)",maxWidth:420,width:"100%"}}>
      <div style={{fontSize:36,marginBottom:14}}>⚠️</div>
      <div style={{fontWeight:800,fontSize:17,color:"#991b1b",marginBottom:8}}>Reservation failed</div>
      <div style={{color:"#374151",fontSize:14,marginBottom:24,lineHeight:1.6}}>{reserveError}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {savedGrokContextRef.current&&(
          <button
            onClick={()=>{
              setReserveError(null);
              const ctx=savedGrokContextRef.current;
              handleComplete(ctx.formData,ctx.sel,ctx.side);
            }}
            style={{background:"#991b1b",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontWeight:700,fontSize:14,width:"100%"}}>
            Try again with my ad
          </button>
        )}
        <button
          onClick={()=>{
            // Keep the ad in localStorage and restore the banner — the user
            // wants to pick a different spot, not throw away their ad.
            try{
              const raw=localStorage.getItem(PENDING_AD_KEY);
              if(raw){const p=JSON.parse(raw);setPendingGrokAd(p);}
            }catch(_){}
            setAdMethod(null);setReserveError(null);setSel(null);
          }}
          style={{background:"#fff",color:"#374151",border:"1.5px solid #d1d5db",borderRadius:8,padding:"11px 0",cursor:"pointer",fontWeight:600,fontSize:14,width:"100%"}}>
          Choose a different spot
        </button>
        {savedGrokContextRef.current?.formData?.finishedAdUrl&&(
          <a
            href={savedGrokContextRef.current.formData.finishedAdUrl}
            download={`my-town-ad-${(savedGrokContextRef.current.formData.businessName||'ad').replace(/\s+/g,'-')}.png`}
            style={{display:"block",textAlign:"center",color:"#6b7280",fontSize:12,padding:"6px 0",textDecoration:"underline",cursor:"pointer"}}>
            ↓ Download your ad image to save it
          </a>
        )}
      </div>
    </div>
  </div>
)}
</div>
);
}
