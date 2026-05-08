import { useState, useRef, useEffect } from "react";
import AdGenerator from "./AdGenerator";

// Natural canvas: 1200x900 = 12"x9" landscape at 100px per inch
// Scale = containerWidth / 1200, height = containerWidth * 0.75
const W = 1200, H = 900;

// FRONT: 3 XL (4"x5") top row + 4 Large (3"x4" portrait) bottom row
// Top:    3 x XL  = 3*400 = 1200 wide, 500 tall OK
// Bottom: 4 x L   = 4*300 = 1200 wide, 400 tall OK
// Total:  1200 x 900 = perfect 12x9 – NO house ad, 100% paid coverage
// Pricing: XL=$499, L=$399
const FRONT = [
{ id:"xl1", size:"XL", price:499, x:0,   y:0,   w:400, h:500, sample:"biscuits", tmpl:"photo" },
{ id:"xl2", size:"XL", price:499, x:400, y:0,   w:400, h:500, sample:null       },
{ id:"xl3", size:"XL", price:499, x:800, y:0,   w:400, h:500, sample:"dental",   tmpl:"clean" },
{ id:"l1",  size:"L",  price:399, x:0,   y:500, w:300, h:400, sample:"hvac",    tmpl:"stamp"  },
{ id:"l2",  size:"L",  price:399, x:300, y:500, w:300, h:400, sample:null       },
{ id:"l3",  size:"L",  price:399, x:600, y:500, w:300, h:400, sample:"lawn",    tmpl:"split"  },
{ id:"l4",  size:"L",  price:399, x:900, y:500, w:300, h:400, sample:null       },
];

// BACK: 1 XL + 2 L + 2 M + 2 S + house + EDDM
const BACK = [
{ id:"bxl", size:"XL",    price:499, x:0,    y:0,   w:400, h:500, sample:null   },
{ id:"bl1", size:"L",     price:399, x:400,  y:0,   w:400, h:300, sample:"auto" },
{ id:"bl2", size:"L",     price:399, x:800,  y:0,   w:400, h:300, sample:null   },
{ id:"bm1", size:"M",     price:299, x:400,  y:300, w:200, h:200, sample:"vet"  },
{ id:"bs1", size:"S",     price:199, x:600,  y:300, w:200, h:200, sample:"salon"},
{ id:"bm2", size:"M",     price:299, x:800,  y:300, w:200, h:200, sample:null   },
{ id:"bs2", size:"S",     price:199, x:1000, y:300, w:200, h:200, sample:null   },
{ id:"bhs", size:"house", price:0,   x:0,    y:500, w:800, h:400, sample:"house"},
{ id:"bed", size:"eddm",  price:0,   x:800,  y:500, w:400, h:400, sample:"eddm" },
];

// Mr. Biscuit's uses the same single-photo template as the AdGenerator (PhotoBold style)
// One hero photo, business name, tagline, coupon, phone – no multi-photo grid
const ADS = {
biscuits:{biz:"Mr. Biscuit's Cafe",cat:"BREAKFAST & CAFE",tag:"From-Scratch Biscuits & Boba!",services:["Plain Biscuit $2.99","Bacon Biscuit $4.99","Chicken Tender $5.99","NY Bagels $5.49"],offer:"$1 OFF Any Biscuit",fine:"1 per visit - with this postcard",phone:"(706) 754-0105",addr:"596 W Louise St, Clarkesville, GA 30523",web:"mrBiscuitsCafe.com",photo:"https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=800&q=80",p:"#7c3a1e",a:"#f59e0b",l:"#fef3c7",d:"#3b1a0a"},
dental:{biz:"Northview Dental",cat:"FAMILY DENTISTRY",tag:"Healthy Smiles. Confident Lives.",services:["General Dentistry","Cosmetic Dentistry","Dental Implants","Teeth Whitening"],offer:"New Patients Always Welcome",fine:"Call today to schedule",phone:"(770) 704-1633",addr:"Clarkesville, GA",web:"northviewdental.com",photo:"https://images.unsplash.com/photo-1609840114035-3c981b782dfe?w=800&q=80",p:"#1e40af",a:"#3b82f6",l:"#eff6ff",d:"#1e3a5f"},
lawn:{biz:"GreenScapes Lawn Care",cat:"LAWN & LANDSCAPING",tag:"A Beautiful Lawn You'll Love Coming Home To!",services:["Mowing","Fertilization","Weed Control","Landscaping","Mulch Installation"],offer:"Free Estimate",fine:"Call today to schedule",phone:"(706) 257-1186",addr:"Clarkesville, GA",web:"greenscapeslawncare.com",photo:"https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80",p:"#166534",a:"#22c55e",l:"#f0fdf4",d:"#052e16"},
hvac:{biz:"Climate Comfort HVAC",cat:"HEATING & COOLING",tag:"Keeping You Comfortable All Year Long",services:["Installation","Repair","Maintenance"],offer:"$50 OFF Any Service",fine:"Show this ad - expires 6/30",phone:"(770) 365-6599",addr:"Clarkesville, GA",web:"climatecomforthvac.com",photo:"https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=800&q=80",p:"#0369a1",a:"#0ea5e9",l:"#f0f9ff",d:"#0c2a3a"},
auto:{biz:"Pit Stop Auto Repair",cat:"AUTO REPAIR",tag:"Honest Repairs. Fair Prices. Dependable Service.",services:["Oil Change $29.99","Brake Service","AC Repair","Free Estimates"],offer:"Free Diagnostic Check",fine:"With any repair - show this ad",phone:"(706) 219-6136",addr:"Clarkesville, GA",web:"",photo:"https://images.unsplash.com/photo-1530046339160-ce3e530c7d2f?w=800&q=80",p:"#7f1d1d",a:"#ef4444",l:"#fef2f2",d:"#450a0a"},
vet:{biz:"Paws & Claws Vet Clinic",cat:"VETERINARIAN",tag:"Compassionate Care For Your Pets",services:["Wellness Exams","Vaccinations","Surgery & Dental","Emergency Care"],offer:"Free First Exam",fine:"New patients only - call to schedule",phone:"(770) 592-7387",addr:"Clarkesville, GA",web:"pawsandclawsvet.com",photo:"https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=800&q=80",p:"#065f46",a:"#10b981",l:"#ecfdf5",d:"#022c22"},
pizza:{biz:"Tony's Pizza",cat:"PIZZA & ITALIAN",tag:"Fresh Ingredients. Great Taste.",services:[],offer:"Large Pizza $12.99",fine:"Pick-up only - show this ad",phone:"(706) 507-1111",addr:"Clarkesville, GA",web:"tonyspizza.com",photo:"https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80",p:"#9a3412",a:"#f97316",l:"#fff7ed",d:"#431407"},
salon:{biz:"The Cut Above Salon",cat:"SALON & BEAUTY",tag:"Look Your Best.",services:[],offer:"20% OFF First Visit",fine:"New clients - show this ad",phone:"(706) 555-0519",addr:"Clarkesville, GA",web:"",photo:"https://images.unsplash.com/photo-1560066984-138daaa4e4e1?w=800&q=80",p:"#831843",a:"#ec4899",l:"#fdf2f8",d:"#4a0e28"},
};

function Check({color,sz=14}){return(<svg width={sz} height={sz} viewBox="0 0 14 14" style={{flexShrink:0,marginTop:1}}><circle cx="7" cy="7" r="7" fill={color}/><path d="M4 7l2 2 4-4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>);}
function Phone({phone,color,size}){return(<div style={{display:"flex",alignItems:"center",gap:5}}><svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{flexShrink:0}}><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg><span style={{fontSize:size*1.1,fontWeight:900,color,fontFamily:"sans-serif",letterSpacing:-0.5,lineHeight:1}}>{phone}</span></div>);}
function Coupon({offer,fine,color,dark}){if(!offer)return null;return(<div style={{border:`1.5px dashed ${dark?"rgba(255,255,255,0.65)":color}`,borderRadius:4,padding:"6px 10px",textAlign:"center",background:dark?"rgba(0,0,0,0.3)":`${color}15`,flexShrink:0}}><div style={{fontSize:14,fontWeight:900,color:dark?"#fff":color,lineHeight:1.1}}>{offer}</div>{fine&&<div style={{fontSize:9,color:dark?"rgba(255,255,255,0.55)":"#777",marginTop:2}}>{fine}</div>}</div>);}

// XL (400x500) – header bar + hero photo + content + coupon + phone
function AdXL({d,tmpl}){
if(tmpl==="clean"){
// Clean white XL – bold business name, large photo strip, clean content area
return(<div style={{width:400,height:500,display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:"sans-serif",background:"#fff"}}>
<div style={{background:d.p,padding:"10px 14px",display:"flex",alignItems:"center",gap:9,flexShrink:0}}>
<div style={{width:38,height:38,borderRadius:8,overflow:"hidden",flexShrink:0,border:"2px solid rgba(255,255,255,0.4)"}}><img src={d.photo} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/></div>
<div><div style={{color:"rgba(255,255,255,0.75)",fontSize:8,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>{d.cat}</div><div style={{color:"#fff",fontWeight:900,fontSize:20,lineHeight:1.0,fontFamily:"Georgia,serif"}}>{d.biz}</div></div>
</div>
<div style={{height:210,flexShrink:0,position:"relative",overflow:"hidden"}}><img src={d.photo} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} alt=""/></div>
<div style={{flex:1,padding:"10px 14px",display:"flex",flexDirection:"column",justifyContent:"space-between",background:"#fff"}}>
<div><div style={{fontSize:14,fontWeight:900,color:d.d,fontFamily:"Georgia,serif",lineHeight:1.2,marginBottom:8}}>{d.tag}</div>{(d.services||[]).slice(0,4).map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}><Check color={d.p} sz={13}/><span style={{fontSize:11,color:"#333",fontWeight:500}}>{s}</span></div>))}</div>
<div style={{display:"flex",flexDirection:"column",gap:5}}><Coupon offer={d.offer} fine={d.fine} color={d.p}/><Phone phone={d.phone} color={d.p} size={14}/>{d.addr&&<div style={{fontSize:9,color:"#666"}}>{d.addr}{d.web?" - "+d.web:""}</div>}</div>
</div>
</div>);
}
// Default photo-bold XL – full bleed photo with dark gradient overlay
return(<div style={{width:400,height:500,position:"relative",overflow:"hidden",fontFamily:"sans-serif"}}>
<img src={d.photo} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
<div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,"+d.d+"cc 0%,"+d.d+"44 35%,"+d.d+"ee 100%)"}}/>
<div style={{position:"absolute",top:14,left:14,right:14}}>
<div style={{color:d.a,fontSize:9,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>{d.cat}</div>
<div style={{color:"#fff",fontWeight:900,fontSize:26,lineHeight:1.0,marginTop:3,fontFamily:"Georgia,serif",textShadow:"0 2px 8px rgba(0,0,0,0.8)"}}>{d.biz}</div>
</div>
<div style={{position:"absolute",top:"38%",left:14,right:14,textAlign:"center"}}>
<div style={{color:"#fff",fontWeight:800,fontSize:20,lineHeight:1.2,fontStyle:"italic",textShadow:"0 2px 12px rgba(0,0,0,0.9)"}}>{d.tag}</div>
</div>
<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"12px 14px",display:"flex",flexDirection:"column",gap:7}}>
<div style={{display:"flex",flexDirection:"column",gap:3}}>{(d.services||[]).slice(0,3).map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:6}}><Check color={d.a} sz={11}/><span style={{fontSize:10,color:"rgba(255,255,255,0.92)",fontWeight:600}}>{s}</span></div>))}</div>
<Coupon offer={d.offer} fine={d.fine} color="#fff" dark/>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><Phone phone={d.phone} color="#fff" size={14}/>{d.addr&&<div style={{fontSize:9,color:"rgba(255,255,255,0.7)",textAlign:"right"}}>{d.addr}</div>}</div>
</div>
</div>);
}

// L (300x400 portrait) – two visual styles based on tmpl prop
function AdL({d,tmpl}){
if(tmpl==="stamp"){
// Dark stamp style – full photo background, bold overlay text
return(<div style={{width:300,height:400,position:"relative",overflow:"hidden",fontFamily:"sans-serif"}}>
<img src={d.photo} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
<div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,"+d.d+"dd 0%,"+d.d+"55 45%,"+d.d+"ee 100%)"}}/>
{/* Top badge */}
<div style={{position:"absolute",top:10,left:10,right:10}}>
<div style={{display:"inline-block",background:d.a,color:"#fff",fontSize:7,fontWeight:800,letterSpacing:2,textTransform:"uppercase",padding:"3px 8px",borderRadius:3}}>{d.cat}</div>
<div style={{color:"#fff",fontWeight:900,fontSize:20,lineHeight:1.0,marginTop:6,fontFamily:"Georgia,serif",textShadow:"0 2px 8px rgba(0,0,0,0.9)"}}>{d.biz}</div>
<div style={{color:d.a,fontWeight:700,fontSize:12,marginTop:4,fontStyle:"italic"}}>{d.tag}</div>
</div>
{/* Bottom content */}
<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"10px 12px",display:"flex",flexDirection:"column",gap:6}}>
<div style={{display:"flex",flexDirection:"column",gap:2}}>{(d.services||[]).slice(0,3).map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:5}}><Check color={d.a} sz={10}/><span style={{fontSize:9,color:"rgba(255,255,255,0.9)",fontWeight:600}}>{s}</span></div>))}</div>
<Coupon offer={d.offer} fine={d.fine} color={d.a} dark/>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
<Phone phone={d.phone} color="#fff" size={12}/>
{d.web&&<div style={{fontSize:8,color:"rgba(255,255,255,0.65)"}}>{d.web}</div>}
</div>
</div>
</div>);
}
// Default split style – photo top, content bottom
return(<div style={{width:300,height:400,display:"flex",flexDirection:"column",overflow:"hidden",background:"#fff",fontFamily:"sans-serif"}}>
<div style={{height:150,flexShrink:0,position:"relative",overflow:"hidden"}}>
<img src={d.photo} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} alt=""/>
<div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,transparent 50%,"+d.l+" 100%)"}}/>
</div>
<div style={{flex:1,background:d.l,display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"10px 12px"}}>
<div>
<div style={{fontSize:7,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:d.a,marginBottom:2}}>{d.cat}</div>
<div style={{fontSize:18,fontWeight:900,color:d.d,fontFamily:"Georgia,serif",lineHeight:1.0,marginBottom:3}}>{d.biz}</div>
<div style={{fontSize:11,fontWeight:700,color:d.p,fontStyle:"italic",marginBottom:7}}>{d.tag}</div>
{(d.services||[]).slice(0,4).map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}><Check color={d.p} sz={12}/><span style={{fontSize:10,color:"#333",fontWeight:500}}>{s}</span></div>))}
</div>
<div style={{display:"flex",flexDirection:"column",gap:4}}>
<Coupon offer={d.offer} fine={d.fine} color={d.p}/>
<Phone phone={d.phone} color={d.p} size={12}/>
{d.addr&&<div style={{fontSize:8,color:"#555"}}>{d.addr}</div>}
{d.web&&<div style={{fontSize:8,color:d.p,fontWeight:600}}>{d.web}</div>}
</div>
</div>
</div>);
}

function AdM({d}){return(<div style={{width:200,height:200,display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:"sans-serif",border:"none",boxSizing:"border-box",background:"#fff"}}><div style={{background:d.p,padding:"5px 8px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}><div style={{color:"#fff",fontWeight:900,fontSize:11,lineHeight:1,fontFamily:"Georgia,serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"55%"}}>{d.biz}</div><div style={{color:"#fff",fontSize:8,fontWeight:700,background:"rgba(0,0,0,0.25)",padding:"1px 5px",borderRadius:3,whiteSpace:"nowrap",flexShrink:0}}>{d.phone}</div></div><div style={{height:42,flexShrink:0,position:"relative",overflow:"hidden"}}><img src={d.photo} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} alt=""/><div style={{position:"absolute",inset:0,background:`linear-gradient(transparent 20%,${d.l}ff 100%)`}}/></div><div style={{flex:1,padding:"4px 8px 6px",background:d.l,display:"flex",flexDirection:"column",justifyContent:"space-between"}}><div><div style={{fontSize:6,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:d.a}}>{d.cat}</div><div style={{fontSize:11,fontWeight:900,color:d.d,fontFamily:"Georgia,serif",lineHeight:1.15}}>{d.tag}</div>{(d.services||[]).length>0&&(<div style={{display:"flex",flexWrap:"wrap",gap:"0px 6px",marginTop:2}}>{(d.services||[]).slice(0,3).map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:2}}><span style={{color:d.p,fontSize:5}}>●</span><span style={{fontSize:7,color:"#333",fontWeight:500}}>{s}</span></div>))}</div>)}</div><Coupon offer={d.offer} fine="" color={d.p}/></div></div>);}

// S (200x200) – photo background, condensed info square
function AdS({d}){return(<div style={{width:200,height:200,overflow:"hidden",position:"relative",fontFamily:"sans-serif"}}><img src={d.photo} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} alt=""/><div style={{position:"absolute",inset:0,background:`linear-gradient(180deg,${d.d}aa 0%,${d.d}f5 100%)`}}/><div style={{position:"absolute",inset:0,padding:"12px 10px",display:"flex",flexDirection:"column",justifyContent:"space-between",alignItems:"center",textAlign:"center"}}><div><div style={{color:d.a,fontSize:7,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>{d.cat}</div><div style={{color:"#fff",fontSize:16,fontWeight:900,fontFamily:"Georgia,serif",lineHeight:1.0,marginTop:3}}>{d.biz}</div><div style={{color:"rgba(255,255,255,0.85)",fontSize:10,fontStyle:"italic",marginTop:4,lineHeight:1.3}}>{d.tag}</div></div>{d.offer&&(<div style={{background:d.a,padding:"6px 10px",borderRadius:4,width:"100%",boxSizing:"border-box"}}><div style={{color:"#fff",fontWeight:900,fontSize:12,lineHeight:1.1}}>{d.offer}</div></div>)}<div style={{color:"#fff",fontSize:13,fontWeight:900,lineHeight:1}}>{d.phone}</div></div></div>);}

function AdHouse({w,h}){return(<div style={{width:w,height:h,background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center",gap:20,padding:"0 24px",boxSizing:"border-box"}}><div style={{width:2,height:36,background:"#991b1b",flexShrink:0}}/><div style={{textAlign:"center"}}><div style={{color:"#f1f5f9",fontWeight:900,fontSize:15,fontFamily:"Georgia,serif",letterSpacing:0.5}}>Shop, Dine & Buy Local</div><div style={{color:"rgba(255,255,255,0.4)",fontSize:9,fontFamily:"sans-serif",marginTop:2,letterSpacing:1,textTransform:"uppercase"}}>Your Ad Here · Reach 5,000 Habersham County Homes</div><div style={{color:"#991b1b",fontWeight:800,fontSize:11,fontFamily:"sans-serif",marginTop:3}}>mytownpostcard.com</div></div><div style={{width:2,height:36,background:"#991b1b",flexShrink:0}}/></div>);}

function AdEDDM({w,h}){return(<div style={{width:w,height:h,background:"#f8f8f8",border:"2px solid #aaa",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,boxSizing:"border-box",padding:16}}><div style={{width:44,height:44,borderRadius:"50%",border:"3px solid #555",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:26,height:26,borderRadius:"50%",border:"2px dashed #555"}}/></div><div style={{textAlign:"center",lineHeight:1.8,fontFamily:"sans-serif",color:"#333"}}><div style={{fontSize:9,letterSpacing:1,fontWeight:600}}>PRESORTED STD</div><div style={{fontSize:9,letterSpacing:1,fontWeight:600}}>U.S. POSTAGE PAID</div><div style={{fontSize:9,letterSpacing:1,fontWeight:600}}>CLARKESVILLE, GA 30523</div><div style={{marginTop:6,paddingTop:6,borderTop:"1px solid #ccc",fontSize:9,letterSpacing:2,fontWeight:600}}>LOCAL POSTAL CUSTOMER</div><div style={{fontWeight:900,fontSize:15,letterSpacing:3,marginTop:2}}>EDDM</div></div></div>);}

const SZ={
XL:{label:"Extra Large Ad", dims:'4" x 5"', price:"$499"},
L: {label:"Large Ad",       dims:'3" x 4"', price:"$399"},
M: {label:"Medium Ad",      dims:'3" x 2"', price:"$299"},
S: {label:"Small Ad",       dims:'2" x 2"', price:"$199"},
};

function AvailableSpot({spot,hovered,onClick,onEnter,onLeave}){
const info=SZ[spot.size]||{};
const isXL=spot.size==="XL",isL=spot.size==="L",isM=spot.size==="M";
const csz=isXL?80:isL?60:isM?44:28;
const lsz=isXL?20:isL?16:isM?13:9;
const psz=isXL?34:isL?26:isM?20:12;
const dsz=isXL?14:isL?11:isM?10:7;
const showBtn=isXL||isL||isM;
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
</div>
);
}

function ScaledCell({spot,scale,children}){return(<div style={{position:"absolute",left:spot.x*scale+3.5,top:spot.y*scale+3.5,width:spot.w*scale-7,height:spot.h*scale-7,overflow:"hidden"}}><div style={{width:spot.w,height:spot.h,transform:"scale("+scale+")",transformOrigin:"top left"}}>{children}</div></div>);}

function SpotCell({spot,scale,hov,onHov,onOut,onSel}){
const k=spot.sample;
const t=spot.tmpl||"photo";
if(k==="house")return<ScaledCell spot={spot} scale={scale}><AdHouse w={spot.w} h={spot.h}/></ScaledCell>;
if(k==="eddm") return<ScaledCell spot={spot} scale={scale}><AdEDDM w={spot.w} h={spot.h}/></ScaledCell>;
if(k===null)   return<ScaledCell spot={spot} scale={scale}><AvailableSpot spot={spot} hovered={hov===spot.id} onClick={()=>onSel(spot)} onEnter={()=>onHov(spot.id)} onLeave={onOut}/></ScaledCell>;
const d=ADS[k]; if(!d)return null;
return(<ScaledCell spot={spot} scale={scale}>{spot.size==="XL"&&<AdXL d={d} tmpl={t}/>}{spot.size==="L"&&<AdL d={d} tmpl={t}/>}{spot.size==="M"&&<AdM d={d}/>}{spot.size==="S"&&<AdS d={d}/>}</ScaledCell>);
}

export default function PostcardPicker(){
const [side,setSide]=useState("front");
const [scale,setScale]=useState(0.5);
const [hov,setHov]=useState(null);
const [sel,setSel]=useState(null);
const ref=useRef(null);

useEffect(()=>{
function upd(){
if(ref.current){
setScale(ref.current.offsetWidth / W);
}
}
upd();
const ro=new ResizeObserver(upd);
if(ref.current)ro.observe(ref.current);
return()=>ro.disconnect();
},[]);

const spots=side==="front"?FRONT:BACK;
const soldF=FRONT.filter(s=>s.price>0&&s.sample!==null).length;
const soldB=BACK.filter(s=>s.price>0&&s.sample!==null).length;

return(<div style={{fontFamily:"sans-serif"}}>
{/* Mobile portrait: show rotate prompt */}
<style>{`@media (max-width: 768px) and (orientation: portrait) { .rotate-prompt { display: flex !important; } .postcard-section { display: none !important; } } @media (min-width: 769px), (orientation: landscape) { .rotate-prompt { display: none !important; } .postcard-section { display: flex !important; } }`}</style>

{/* Rotate prompt for mobile portrait */}
<div className="rotate-prompt" style={{display:"none",position:"fixed",inset:0,background:"#0f172a",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:999,gap:24,padding:32}}>
  <div style={{fontSize:64,animation:"spin 2s linear infinite"}}>
    <style>{`@keyframes spin{0%{transform:rotate(0deg)}50%{transform:rotate(90deg)}100%{transform:rotate(90deg)}}`}</style>
    🔄
  </div>
  <div style={{color:"#fff",fontWeight:900,fontSize:22,fontFamily:"Georgia,serif",textAlign:"center"}}>Please rotate your device</div>
  <div style={{color:"rgba(255,255,255,0.6)",fontSize:14,textAlign:"center",maxWidth:280,lineHeight:1.6}}>The postcard picker is designed for landscape view. Rotate your phone sideways for the best experience.</div>
  <div style={{color:"rgba(255,255,255,0.3)",fontSize:40,marginTop:8}}>🔄</div>
</div>

{/* Main postcard section */}
<div className="postcard-section" style={{display:"flex",width:"100%",fontFamily:"sans-serif",background:"#f1f5f9",flexDirection:"column",boxSizing:"border-box",height:"100vh",padding:"12px 20px 8px",overflow:"hidden"}}>

  {/* Header -- centered, compact */}
  <div style={{textAlign:"center",marginBottom:6,flexShrink:0}}>
    <div style={{fontSize:22,fontWeight:900,color:"#111",fontFamily:"Georgia,serif",letterSpacing:-0.3}}>Reserve Your Spot on the Postcard</div>
    <div style={{fontSize:12,color:"#64748b",marginTop:2}}>Click any <span style={{color:"#16a34a",fontWeight:700}}>green spot</span> below to claim yours</div>
  </div>
  {/* Side toggle -- centered */}
  <div style={{display:"flex",justifyContent:"center",marginBottom:6,flexShrink:0}}>
    <div style={{background:"#fff",borderRadius:12,padding:4,display:"flex",gap:3,boxShadow:"0 1px 8px rgba(0,0,0,0.1)"}}>
      {[{id:"front",l:"Front Side",sold:soldF,tot:7},{id:"back",l:"Back Side",sold:soldB,tot:7}].map(s=>(
        <button key={s.id} onClick={()=>setSide(s.id)} style={{padding:"7px 22px",borderRadius:9,border:"none",cursor:"pointer",background:side===s.id?"linear-gradient(135deg,#991b1b,#7f1d1d)":"transparent",color:side===s.id?"#fff":"#64748b",fontWeight:700,fontSize:13,transition:"all 0.18s",lineHeight:1.3}}>
          {s.l}<br/>
          <span style={{fontSize:10,fontWeight:400,opacity:0.8}}>{s.sold} of {s.tot} sold</span>
        </button>
      ))}
    </div>
  </div>

  {/* Postcard container -- fills remaining height at correct 12:9 ratio */}
  {/* Shadow is 8px spread so we give 20px horizontal margin to prevent clipping */}
  <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",minHeight:0,padding:"8px 20px"}}>
    <div ref={ref} style={{
      width:"100%",
      maxWidth:"calc((100vh - 160px) * 12 / 9)",
    }}>
      <div style={{
        position:"relative",
        width:"100%",
        paddingBottom:"75%",
        background:"#c8c8c8",
        borderRadius:6,
        boxShadow:"0 0 0 7px #c8c8c8, 0 0 0 8.5px #a8a8a8, 0 16px 48px rgba(0,0,0,0.28), 0 4px 12px rgba(0,0,0,0.14)",
      }}>
        <div style={{position:"absolute",inset:0,overflow:"hidden",borderRadius:5,background:"#c8c8c8"}}>
          {spots.map(spot=><SpotCell key={spot.id} spot={spot} scale={scale} hov={hov} onHov={setHov} onOut={()=>setHov(null)} onSel={setSel}/>)}
        </div>
      </div>
    </div>
  </div>

  {/* Legend -- compact, inside viewport */}
  <div style={{display:"flex",justifyContent:"center",gap:20,marginTop:8,flexWrap:"wrap",flexShrink:0}}>
    {[{bg:"linear-gradient(135deg,#f8fffe,#f0fdf4)",border:"2px solid #4ade80",l:"Available -- click to reserve"},{bg:"#fefce8",border:"2px dashed #fbbf24",l:"Reserved"},{bg:"#f1f5f9",border:"2px solid #cbd5e1",l:"Spot taken"}].map(x=>(
      <div key={x.l} style={{display:"flex",alignItems:"center",gap:7}}>
        <div style={{width:20,height:20,background:x.bg,border:x.border,borderRadius:4,flexShrink:0}}/>
        <span style={{fontSize:12,color:"#64748b",fontWeight:500}}>{x.l}</span>
      </div>
    ))}
  </div>

  {sel&&<AdGenerator initialSize={sel.size} onComplete={()=>setSel(null)} onClose={()=>setSel(null)}/>}
</div>
</div>
);
}
