import { useState } from "react";
import { RestaurantA } from "./AdCreator.jsx";

const BASE = import.meta.env.BASE_URL;
const MR_BISCUITS_LOGO = `${BASE}mr-biscuits-logo.jpg`;
const MR_BISCUITS_HERO = `${BASE}industries/restaurants/mr-biscuits/menu-chicken-biscuit.jpg`;

export const SIZES = {
  large:  { label: "Large",  price: 399, dim: '4" × 5"',  desc: "Prime placement, maximum impact" },
  medium: { label: "Medium", price: 299, dim: '3" × 4"',  desc: "Great visibility, popular choice" },
  small:  { label: "Small",  price: 199, dim: '3" × 2"',  desc: "Affordable local reach" },
};

export const GRID_AREAS = [
  "mb mb mb mb dn dn dn dn re re re re",
  "mb mb mb mb dn dn dn dn re re re re",
  "mb mb mb mb dn dn dn dn re re re re",
  "mb mb mb mb dn dn dn dn re re re re",
  "mb mb mb mb dn dn dn dn re re re re",
  "hv hv hv ins ins ins pz pz pz a1 a1 a1",
  "hv hv hv ins ins ins pz pz pz a1 a1 a1",
  "hv hv hv ins ins ins lw lw lw a2 a2 a2",
  "hv hv hv ins ins ins lw lw lw a2 a2 a2",
].map(r => `"${r}"`).join(" ");

// ─── 1. MR. BISCUIT'S CAFÉ — Showcase ad rendered with the RestaurantA template
// This is the on-postcard sample so it stays in sync with the template a real
// customer would pick. Uses real Mr. Biscuit's Café data + an in-library hero
// photo (cropped from their menu) so the visual matches the live product.
function MrBiscuitsAd({ size }) {
  return (
    <RestaurantA
      size={size}
      industry="Breakfast and Cafe"
      businessName="Mr. Biscuit's Café"
      tagline="From-scratch biscuits & fresh boba"
      offer="$1 OFF"
      offerFinePrint="Bacon Biscuit · 1 per visit"
      offer2="FREE COFFEE"
      offer2FinePrint="with any breakfast plate"
      address="596 W Louise St Ste D, Clarkesville GA"
      phone="(706) 754-0105"
      hours="Tue–Fri 7a–12p · Sat 8a–12p"
      logo={MR_BISCUITS_LOGO}
      photos={[MR_BISCUITS_HERO]}
      accentColor="#6a1f00"
    />
  );
}

// ─── 2. CLARKESVILLE FAMILY DENTAL — White + Navy/Gold, Badge Logo ─────────
// Layout: White background, navy header band, badge logomark, navy coupon strip bottom
function FamilyDentalAd({ size }) {
  const L = size === "large";
  const M = size === "medium";

  return (
    <div style={{
      width: "100%", height: "100%", overflow: "hidden", position: "relative",
      background: "#ffffff", fontFamily: "sans-serif",
      display: "flex", flexDirection: "column",
    }}>
      {/* Navy header band */}
      <div style={{
        background: "linear-gradient(135deg, #0a2a5e 0%, #0d3575 100%)",
        padding: L ? "12px 14px" : "8px 10px", flexShrink: 0,
        display: "flex", alignItems: "center", gap: L ? 12 : 8,
      }}>
        {/* Badge logo */}
        <div style={{
          width: L ? 54 : M ? 40 : 30, height: L ? 54 : M ? 40 : 30,
          borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, #d4a017 0%, #f0c840 100%)",
          border: "2px solid rgba(255,255,255,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
        }}>
          <span style={{ fontSize: L ? 22 : M ? 16 : 12 }}>🦷</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            color: "#fff", fontWeight: 900,
            fontSize: L ? 14 : M ? 11 : 9,
            fontFamily: "Georgia, serif", lineHeight: 1.15,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>Clarkesville Family Dental</div>
          <div style={{
            color: "#d4a017", fontSize: L ? 9 : 7.5,
            fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginTop: 1,
          }}>General Dentistry · Clarkesville, GA</div>
        </div>
      </div>

      {/* White body */}
      <div style={{ flex: 1, padding: L ? "12px 14px" : "8px 10px", minHeight: 0, overflow: "hidden" }}>
        {/* Headline */}
        <div style={{
          color: "#0a2a5e", fontWeight: 900,
          fontSize: L ? 19 : M ? 14 : 11,
          fontFamily: "Georgia, serif", lineHeight: 1.2, marginBottom: L ? 6 : 4,
        }}>Accepting New Patients!</div>

        <div style={{
          color: "#555", fontSize: L ? 11 : M ? 9 : 8,
          lineHeight: 1.4, marginBottom: L ? 10 : 6,
        }}>Gentle, compassionate care for the whole family — from first visits to full smiles.</div>

        {/* Services list with gold checkmarks */}
        {L && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
            {[
              "Preventive Care & Cleanings",
              "Cosmetic & Whitening Treatments",
              "Family &amp; Children's Dentistry",
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: "50%",
                  background: "#d4a017", display: "flex", alignItems: "center",
                  justifyContent: "center", flexShrink: 0,
                }}>
                  <span style={{ color: "#fff", fontSize: 8, fontWeight: 900 }}>✓</span>
                </div>
                <span style={{ color: "#333", fontSize: 10.5, lineHeight: 1.2 }}
                  dangerouslySetInnerHTML={{ __html: s }} />
              </div>
            ))}
          </div>
        )}

        {/* Hours + address */}
        {(L || M) && (
          <div style={{
            fontSize: L ? 9.5 : 8, color: "#666",
            borderTop: "1px solid #e5e7eb", paddingTop: L ? 8 : 5,
          }}>
            <div>⏰ Mon–Fri 8am–5pm · Sat by appt</div>
            {L && <div style={{ marginTop: 2 }}>📍 142 Commerce St, Clarkesville, GA</div>}
            <div style={{ marginTop: 2, color: "#0a2a5e", fontWeight: 800 }}>☎ (706) 555-0142</div>
          </div>
        )}
      </div>

      {/* Navy coupon strip at bottom */}
      <div style={{
        background: "#0a2a5e", padding: L ? "8px 14px" : "6px 10px",
        flexShrink: 0, borderTop: "3px solid #d4a017",
      }}>
        <div style={{
          border: "2px dashed rgba(212,160,23,0.75)",
          borderRadius: 6, padding: L ? "5px 10px" : "4px 8px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          background: "rgba(0,0,0,0.2)",
        }}>
          <div>
            <div style={{ color: "#d4a017", fontSize: L ? 7.5 : 7,
              fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>New Patient Special</div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: L ? 12 : 10, lineHeight: 1.1 }}>
              FREE Whitening Kit
            </div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 7, marginTop: 1 }}>
              w/ exam &amp; cleaning · show this ad
            </div>
          </div>
          <div style={{
            width: L ? 40 : 32, height: L ? 40 : 32, borderRadius: "50%",
            border: "2px solid #d4a017",
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", flexShrink: 0,
          }}>
            <div style={{ color: "#d4a017", fontWeight: 900, fontSize: L ? 11 : 9, lineHeight: 1 }}>$99</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 6, lineHeight: 1 }}>value</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 3. BLUE RIDGE AIR & HEAT — Diagonal Split, Ice Blue + White ─────────────
// Layout: Diagonal split design — dark steel blue left, ice white right, snowflake center
function BlueRidgeAd({ size }) {
  const L = size === "large";
  const M = size === "medium";

  return (
    <div style={{
      width: "100%", height: "100%", overflow: "hidden", position: "relative",
      fontFamily: "sans-serif",
    }}>
      {/* Dark steel blue left triangle */}
      <div style={{
        position: "absolute", inset: 0,
        background: "#003f6b",
        clipPath: "polygon(0 0, 62% 0, 38% 100%, 0 100%)",
      }} />
      {/* Ice blue right triangle */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to bottom right, #e8f4fd, #cce8f8)",
        clipPath: "polygon(62% 0, 100% 0, 100% 100%, 38% 100%)",
      }} />

      {/* Giant snowflake decoration — centered over split */}
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        fontSize: L ? 56 : M ? 44 : 34,
        opacity: 0.22, userSelect: "none", pointerEvents: "none",
        filter: "blur(0.5px)",
      }}>❄</div>

      {/* Emergency service badge — top left */}
      <div style={{
        position: "absolute", top: L ? 10 : 7, left: L ? 10 : 7,
        background: "#c0392b", borderRadius: 4,
        padding: L ? "3px 8px" : "2px 6px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
      }}>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: L ? 8 : 7,
          letterSpacing: 1, textTransform: "uppercase" }}>24/7 Emergency</div>
      </div>

      {/* Left dark area content */}
      <div style={{
        position: "absolute", top: L ? 38 : 28, left: 0, width: "54%",
        padding: L ? "0 0 0 12px" : "0 0 0 8px",
      }}>
        <div style={{
          color: "#fff", fontWeight: 900,
          fontSize: L ? 28 : M ? 21 : 16,
          lineHeight: 1, textShadow: "0 2px 6px rgba(0,0,0,0.5)",
        }}>24/7</div>
        <div style={{
          color: "#00bcd4", fontWeight: 800,
          fontSize: L ? 11 : M ? 9 : 7.5,
          lineHeight: 1.2, marginTop: 2,
        }}>Emergency{"\n"}Service</div>

        {L && (
          <div style={{ marginTop: 8 }}>
            <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 8.5, lineHeight: 1.6 }}>
              Heating &amp; Cooling<br />Experts Since 2001
            </div>
          </div>
        )}

        {/* Phone — bottom left */}
        <div style={{
          marginTop: L ? 10 : 6,
          color: "#fff", fontWeight: 900, fontSize: L ? 10.5 : M ? 9 : 8,
        }}>(706) 555-0188</div>
      </div>

      {/* Right light area content */}
      <div style={{
        position: "absolute", top: L ? 12 : 8, right: 0, width: "44%",
        padding: L ? "0 10px 0 0" : "0 7px 0 0",
        display: "flex", flexDirection: "column", alignItems: "flex-end",
      }}>
        <div style={{
          color: "#003f6b", fontWeight: 900,
          fontSize: L ? 12 : M ? 10 : 8.5,
          textAlign: "right", lineHeight: 1.2,
          fontFamily: "Georgia, serif",
        }}>Blue Ridge{"\n"}Air &amp; Heat</div>

        {(L || M) && (
          <div style={{
            color: "#555", fontSize: L ? 9 : 8, textAlign: "right", marginTop: 4, lineHeight: 1.4,
          }}>Clarkesville, GA<br />{L ? "Licensed & Insured" : ""}</div>
        )}
      </div>

      {/* Offer box — bottom right area */}
      <div style={{
        position: "absolute", bottom: L ? 10 : 7, right: L ? 8 : 6,
        width: L ? "46%" : "43%",
        border: "2px dashed #003f6b",
        borderRadius: 6, padding: L ? "6px 8px" : "4px 6px",
        background: "rgba(255,255,255,0.88)", textAlign: "center",
      }}>
        <div style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
          color: "#003f6b", fontSize: 12 }}>✂</div>
        <div style={{ color: "#003f6b", fontWeight: 900, fontSize: L ? 16 : M ? 13 : 10, lineHeight: 1 }}>
          $89
        </div>
        <div style={{ color: "#333", fontWeight: 700, fontSize: L ? 9 : 8, lineHeight: 1.2 }}>A/C Tune-Up</div>
        {(L || M) && (
          <div style={{ color: "#777", fontSize: 6.5, marginTop: 2 }}>Show this ad · exp. 6/30</div>
        )}
      </div>

      {/* Address — bottom left */}
      {L && (
        <div style={{
          position: "absolute", bottom: 10, left: 10,
          color: "rgba(255,255,255,0.65)", fontSize: 7.5, lineHeight: 1.4,
        }}>
          📍 88 Industrial Blvd<br />Gainesville, GA
        </div>
      )}
    </div>
  );
}

// ─── 4. TANNER INSURANCE AGENCY — Dark Navy Full-Bleed, Gold Shield ───────────
// Layout: Logo on left with text stacked on right + full dark bleed
function TannerAd({ size }) {
  const L = size === "large";
  const M = size === "medium";

  return (
    <div style={{
      width: "100%", height: "100%", overflow: "hidden", position: "relative",
      background: "linear-gradient(160deg, #1a1a2e 0%, #12122a 100%)",
      fontFamily: "sans-serif",
      display: "flex", flexDirection: "column",
    }}>
      {/* Subtle hex pattern overlay */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.06,
        backgroundImage: "repeating-linear-gradient(60deg, #e2b714 0, #e2b714 1px, transparent 0, transparent 50%)",
        backgroundSize: "18px 18px",
        pointerEvents: "none",
      }} />

      {/* Header: shield badge left + agency name right */}
      <div style={{
        padding: L ? "14px 14px 10px" : "9px 10px 7px",
        display: "flex", alignItems: "center", gap: L ? 12 : 8,
        flexShrink: 0, position: "relative", zIndex: 1,
      }}>
        {/* Shield badge */}
        <div style={{
          width: L ? 58 : M ? 44 : 34, height: L ? 68 : M ? 52 : 40,
          flexShrink: 0, position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {/* Shield shape using clip-path */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to bottom, #e2b714 0%, #c89a0c 100%)",
            clipPath: "polygon(50% 0%, 100% 18%, 100% 55%, 50% 100%, 0% 55%, 0% 18%)",
          }} />
          <span style={{ position: "relative", zIndex: 1, fontSize: L ? 22 : M ? 17 : 13 }}>🛡️</span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#e2b714", fontSize: L ? 8.5 : 7.5,
            fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
            Your Local Agent
          </div>
          <div style={{
            color: "#fff", fontWeight: 900, fontSize: L ? 14 : M ? 11 : 9,
            fontFamily: "Georgia, serif", lineHeight: 1.15, marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>Tanner Insurance</div>
          <div style={{
            color: "rgba(255,255,255,0.6)", fontSize: L ? 9 : 8, marginTop: 2,
          }}>Agency</div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "linear-gradient(to right, #e2b714, transparent)",
        margin: "0 14px", flexShrink: 0, position: "relative", zIndex: 1 }} />

      {/* Body */}
      <div style={{ flex: 1, padding: L ? "10px 14px" : "7px 10px",
        minHeight: 0, position: "relative", zIndex: 1 }}>

        {/* Coverage types */}
        <div style={{
          color: "#e2b714", fontWeight: 700,
          fontSize: L ? 11 : M ? 9.5 : 8.5,
          letterSpacing: 1, marginBottom: L ? 8 : 5,
        }}>AUTO · HOME · LIFE</div>

        {L && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
            {[
              "We shop dozens of carriers for you",
              "Free quotes — no obligation",
              "Local agent you can count on",
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                <span style={{ color: "#e2b714", fontSize: 9, marginTop: 1 }}>★</span>
                <span style={{ color: "rgba(255,255,255,0.78)", fontSize: 10 }}>{s}</span>
              </div>
            ))}
          </div>
        )}

        {/* Big savings call-out */}
        <div style={{
          background: "rgba(226,183,20,0.12)", border: "1px solid rgba(226,183,20,0.35)",
          borderRadius: 7, padding: L ? "7px 10px" : "5px 8px",
          textAlign: "center",
        }}>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: L ? 7.5 : 7,
            textTransform: "uppercase", letterSpacing: 1 }}>Save up to</div>
          <div style={{ color: "#e2b714", fontWeight: 900, fontSize: L ? 22 : M ? 17 : 14, lineHeight: 1 }}>
            $500/yr
          </div>
          {(L || M) && (
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 7.5 }}>Free quote · no obligation</div>
          )}
        </div>
      </div>

      {/* Footer strip */}
      <div style={{
        background: "rgba(226,183,20,0.12)", borderTop: "1px solid rgba(226,183,20,0.25)",
        padding: L ? "6px 14px" : "4px 10px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexShrink: 0, position: "relative", zIndex: 1,
      }}>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: L ? 8 : 7 }}>
          📍 55 S Main St, Cornelia, GA
        </div>
        <div style={{ color: "#e2b714", fontWeight: 800, fontSize: L ? 9.5 : 8.5 }}>
          (706) 555-0055
        </div>
      </div>
    </div>
  );
}

// ─── 5. ROMA'S PIZZA & SUBS — Bold Single Color, White Text, Coupon Strip ────
// Layout: Bold dark red bg, BOGO hero headline, white coupon strip at bottom
function RomasPizzaAd({ size }) {
  const L = size === "large";

  return (
    <div style={{
      width: "100%", height: "100%", overflow: "hidden", position: "relative",
      background: "#7f0c0c", fontFamily: "sans-serif",
      display: "flex", flexDirection: "column",
    }}>
      {/* Checkered accent stripe at top */}
      <div style={{
        height: L ? 8 : 5, flexShrink: 0,
        backgroundImage: "repeating-linear-gradient(90deg, #fff 0px, #fff 6px, transparent 6px, transparent 12px)",
        opacity: 0.25,
      }} />

      {/* Header */}
      <div style={{
        background: "rgba(0,0,0,0.25)", padding: L ? "6px 10px" : "4px 8px",
        display: "flex", alignItems: "center", gap: L ? 10 : 7, flexShrink: 0,
      }}>
        {/* Circular logo badge */}
        <div style={{
          width: L ? 42 : 32, height: L ? 42 : 32, borderRadius: "50%",
          background: "linear-gradient(135deg, #c0392b, #922b21)",
          border: "2px solid rgba(255,255,255,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <span style={{ fontSize: L ? 20 : 15 }}>🍕</span>
        </div>
        <div>
          <div style={{ color: "#fff", fontWeight: 900, fontSize: L ? 13 : 10.5,
            fontFamily: "Georgia, serif" }}>Roma's Pizza &amp; Subs</div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: L ? 8.5 : 7.5 }}>
            Italian Restaurant · Clarkesville
          </div>
        </div>
      </div>

      {/* Hero offer — BOGO */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: L ? "8px 12px" : "5px 8px", minHeight: 0,
      }}>
        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: L ? 10 : 8,
          letterSpacing: 3, textTransform: "uppercase", marginBottom: 2 }}>
          This Week Only
        </div>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: L ? 38 : 29,
          lineHeight: 1, letterSpacing: -1, textShadow: "0 3px 10px rgba(0,0,0,0.5)" }}>
          BOGO
        </div>
        <div style={{ color: "rgba(255,255,255,0.88)", fontWeight: 800,
          fontSize: L ? 13 : 10, lineHeight: 1.2, textAlign: "center", marginTop: 3 }}>
          Medium Pizza
        </div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: L ? 9 : 7.5,
          marginTop: 4, textAlign: "center" }}>
          Hand-tossed · Oven fresh · Dine-in, carry-out &amp; delivery
        </div>
      </div>

      {/* White coupon strip at bottom */}
      <div style={{
        background: "#fff", padding: L ? "7px 10px" : "5px 8px",
        flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: "3px solid rgba(0,0,0,0.15)",
      }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", top: -14, left: 0, color: "#c0392b", fontSize: 12 }}>✂</div>
          <div style={{ color: "#c0392b", fontWeight: 900, fontSize: L ? 9 : 8,
            textTransform: "uppercase", letterSpacing: 0.5 }}>
            Tues &amp; Wed only · Dine-in
          </div>
          <div style={{ color: "#555", fontSize: L ? 8.5 : 7.5 }}>Show this ad · 1 per table</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#c0392b", fontWeight: 900, fontSize: L ? 10.5 : 9 }}>
            (706) 555-0712
          </div>
          <div style={{ color: "#888", fontSize: 7 }}>Daily 11am–9pm</div>
        </div>
      </div>
    </div>
  );
}

// ─── 6. GREEN ACRES LAWN CARE — Fresh Green Gradient, Logo Left / Text Right ──
// Layout: Left strip with leaf badge, right = white with offer and phone
function GreenAcresAd({ size }) {
  const L = size === "large";

  return (
    <div style={{
      width: "100%", height: "100%", overflow: "hidden", position: "relative",
      background: "#f0fdf4", fontFamily: "sans-serif",
      display: "flex",
    }}>
      {/* Left green strip */}
      <div style={{
        width: L ? "38%" : "36%", flexShrink: 0,
        background: "linear-gradient(to bottom, #16a34a 0%, #14532d 100%)",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: L ? 6 : 4, padding: L ? "8px 0" : "5px 0",
        position: "relative", overflow: "hidden",
      }}>
        {/* Decorative circle bg */}
        <div style={{
          position: "absolute", bottom: "-20%", left: "-20%",
          width: "140%", height: "70%",
          background: "radial-gradient(ellipse, rgba(255,255,255,0.08) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />
        {/* Leaf badge */}
        <div style={{
          width: L ? 46 : 34, height: L ? 46 : 34, borderRadius: "50%",
          background: "rgba(255,255,255,0.18)",
          border: "2px solid rgba(255,255,255,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", zIndex: 1,
        }}>
          <span style={{ fontSize: L ? 22 : 16 }}>🌿</span>
        </div>
        {/* Vertical business name */}
        <div style={{
          color: "rgba(255,255,255,0.75)", fontSize: L ? 7.5 : 6.5,
          fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
          writingMode: "vertical-rl", textOrientation: "mixed",
          transform: "rotate(180deg)", position: "relative", zIndex: 1,
        }}>Green Acres</div>

        {/* Sun decorative */}
        <div style={{
          position: "absolute", top: L ? 6 : 4, right: L ? 6 : 4,
          color: "rgba(255,255,255,0.3)", fontSize: L ? 14 : 10,
        }}>☀</div>
      </div>

      {/* Right white content area */}
      <div style={{
        flex: 1, padding: L ? "10px 10px" : "7px 8px",
        display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0,
      }}>
        <div>
          <div style={{ color: "#14532d", fontWeight: 900, fontSize: L ? 12 : 10,
            lineHeight: 1.2, fontFamily: "Georgia, serif" }}>Green Acres{"\n"}Lawn Care</div>
          <div style={{ color: "#555", fontSize: L ? 9 : 7.5, marginTop: 3 }}>
            Mowing · Mulching · Clean-ups
          </div>
        </div>

        {/* Offer */}
        <div style={{
          border: "2px dashed #16a34a", borderRadius: 6,
          padding: L ? "5px 7px" : "4px 6px", textAlign: "center",
          background: "#f0fdf4", position: "relative",
        }}>
          <div style={{ position: "absolute", top: -8, left: "50%",
            transform: "translateX(-50%)", color: "#16a34a", fontSize: 12 }}>✂</div>
          <div style={{ color: "#14532d", fontWeight: 900, fontSize: L ? 16 : 13, lineHeight: 1 }}>
            $25 OFF
          </div>
          <div style={{ color: "#15803d", fontSize: L ? 9 : 8, fontWeight: 700 }}>
            First Service
          </div>
          <div style={{ color: "#888", fontSize: L ? 7 : 6.5, marginTop: 1 }}>
            New customers · show this ad
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ color: "#14532d", fontWeight: 800, fontSize: L ? 10 : 8.5 }}>
            (706) 555-0399
          </div>
          <div style={{ color: "#888", fontSize: L ? 7.5 : 7, textAlign: "right" }}>
            Mon–Sat{"\n"}7am–6pm
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Fallback Ad ──────────────────────────────────────────────────────────────
function DefaultAd({ spot }) {
  return (
    <div style={{ width: "100%", height: "100%", background: "#f9fafb",
      border: "1px solid #e5e7eb", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 4, fontFamily: "sans-serif" }}>
      <span style={{ fontSize: 22 }}>📌</span>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#374151",
        textAlign: "center", padding: "0 6px" }}>{spot.businessName}</div>
      <div style={{ fontSize: 9, color: "#9ca3af" }}>Reserved</div>
    </div>
  );
}

// ─── Public: PaidAd Dispatcher ────────────────────────────────────────────────
export function PaidAd({ spot }) {
  const s = { size: spot.size };
  switch (spot.businessName) {
    case "Mr. Biscuit's Café":          return <MrBiscuitsAd    {...s} />;
    case "Clarkesville Family Dental":  return <FamilyDentalAd  {...s} />;
    case "Blue Ridge Air & Heat":       return <BlueRidgeAd     {...s} />;
    case "Tanner Insurance Agency":     return <TannerAd        {...s} />;
    case "Roma's Pizza & Subs":         return <RomasPizzaAd    {...s} />;
    case "Green Acres Lawn Care":       return <GreenAcresAd    {...s} />;
    default:                            return <DefaultAd spot={spot} />;
  }
}

// ─── Public: AvailableSpot ────────────────────────────────────────────────────
export function AvailableSpot({ spot, isSelected, onClick }) {
  const sz = SIZES[spot.size];
  const isSmall = spot.size === "small";

  return (
    <div onClick={onClick} style={{
      width: "100%", height: "100%", borderRadius: 3, cursor: "pointer",
      background: isSelected ? "#fef9c3" : "#f0fdf4",
      border: isSelected ? "2.5px solid #ca8a04" : "2px dashed #22c55e",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: isSmall ? 3 : 6, padding: isSmall ? "6px 4px" : "10px 8px",
      textAlign: "center", transition: "all 0.15s", boxSizing: "border-box",
    }}>
      <div style={{ fontSize: isSmall ? 18 : 26 }}>{isSelected ? "✅" : "➕"}</div>
      <div style={{ fontWeight: 800, fontSize: isSmall ? 9 : 11,
        color: isSelected ? "#92400e" : "#15803d", fontFamily: "sans-serif", lineHeight: 1.2 }}>
        {isSelected ? "SELECTED" : sz.label + " Spot"}
      </div>
      <div style={{ fontSize: isSmall ? 10 : 14, color: isSelected ? "#b45309" : "#166534",
        fontWeight: 900, fontFamily: "sans-serif" }}>${sz.price}</div>
      {!isSmall && (
        <div style={{ fontSize: 9, color: "#6b7280", fontFamily: "sans-serif" }}>{sz.dim}</div>
      )}
    </div>
  );
}

// ─── Public: Modal ─────────────────────────────────────────────────────────────
export function Modal({ spot, onClose, onSubmit, isLoading, error }) {
  const sz = SIZES[spot.size];
  const [f, setF] = useState({ biz: "", cat: "", email: "", phone: "" });
  const ok = f.biz.trim() && f.cat.trim() && f.email.includes("@");
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: 28,
        maxWidth: 430, width: "100%", boxShadow: "0 30px 80px rgba(0,0,0,0.35)", fontFamily: "sans-serif" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10, color: "#9ca3af", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
              {sz.label} Ad · {sz.dim}
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#111", fontFamily: "Georgia,serif", lineHeight: 1 }}>
              ${sz.price}
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              Reaches 5,000 Clarkesville-area homes
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#f3f4f6", border: "none", borderRadius: "50%",
            width: 34, height: 34, cursor: "pointer", fontSize: 18, color: "#374151" }}>×</button>
        </div>

        <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 16px", marginBottom: 18,
          lineHeight: 2.0, fontSize: 12.5, color: "#374151" }}>
          ✅ &nbsp;One business per category — zero competition<br />
          ✅ &nbsp;Professional ad design included<br />
          ✅ &nbsp;Printed &amp; mailed via USPS EDDM<br />
          ✅ &nbsp;Under 10¢ per home reached
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
            padding: "10px 14px", marginBottom: 14, color: "#991b1b", fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          {[["biz", "Business Name *"], ["cat", "Business Category (e.g. Pizza Restaurant) *"],
            ["email", "Email Address *"], ["phone", "Phone Number"]].map(([k, ph]) => (
            <input key={k} placeholder={ph} value={f[k]} onChange={set(k)}
              style={{ padding: "10px 13px", borderRadius: 9, border: "1.5px solid #d1d5db",
                fontSize: 13.5, outline: "none", fontFamily: "sans-serif" }} />
          ))}
        </div>

        <button disabled={!ok || isLoading} onClick={() => onSubmit(f)} style={{
          width: "100%", padding: 14, borderRadius: 11, border: "none",
          background: ok && !isLoading ? "#991b1b" : "#d1d5db",
          color: "#fff", fontSize: 15, fontWeight: 800,
          cursor: ok && !isLoading ? "pointer" : "not-allowed", fontFamily: "sans-serif",
        }}>
          {isLoading ? "Reserving..." : `Reserve This Spot — $${sz.price}`}
        </button>
        <p style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", margin: "10px 0 0" }}>
          No charge now. You'll pay on the next screen.
        </p>
      </div>
    </div>
  );
}
