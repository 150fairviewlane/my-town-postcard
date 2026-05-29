import { useState } from "react";
import { MrBiscuitsLarge, MrBiscuitsMedium, MrBiscuitsSmall } from "./MrBiscuitsReferenceAd.jsx";

export const SIZES = {
  xl:     { label: "Extra-Large", dim: '4" × 5"', desc: "Prime placement, maximum impact" },
  large:  { label: "Large",       dim: '3" × 4"', desc: "Great visibility, popular choice" },
  medium: { label: "Medium",      dim: '2" × 2"', desc: "Growing reach, great value" },
  small:  { label: "Small",       dim: '2" × 2"', desc: "Affordable local reach" },
};

// Front-side grid: 12 cols × 9 rows (1 col = 1 inch = 100 natural px).
// Top row (rows 1-5): 3 XL spots — 4 cols × 5 rows each (4"×5").
// Bottom row (rows 6-9): 4 Large portrait spots — 3 cols × 4 rows each (3"×4").
// No house ad. 100% of the front is paid advertising.
// Layout tiles all 108 cells (12×9) with no gaps or overlaps.
export const GRID_AREAS = [
  "mb  mb  mb  mb  dn  dn  dn  dn  re  re  re  re",
  "mb  mb  mb  mb  dn  dn  dn  dn  re  re  re  re",
  "mb  mb  mb  mb  dn  dn  dn  dn  re  re  re  re",
  "mb  mb  mb  mb  dn  dn  dn  dn  re  re  re  re",
  "mb  mb  mb  mb  dn  dn  dn  dn  re  re  re  re",
  "l1  l1  l1  l2  l2  l2  l3  l3  l3  l4  l4  l4",
  "l1  l1  l1  l2  l2  l2  l3  l3  l3  l4  l4  l4",
  "l1  l1  l1  l2  l2  l2  l3  l3  l3  l4  l4  l4",
  "l1  l1  l1  l2  l2  l2  l3  l3  l3  l4  l4  l4",
].map(r => `"${r}"`).join(" ");


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
      <div style={{ flex: 1, padding: L ? "9px 14px" : "7px 10px", minHeight: 0, overflow: "hidden" }}>
        {/* Headline */}
        <div style={{
          color: "#0a2a5e", fontWeight: 900,
          fontSize: L ? 19 : M ? 14 : 11,
          fontFamily: "Georgia, serif", lineHeight: 1.2, marginBottom: L ? 5 : 4,
        }}>Accepting New Patients!</div>

        <div style={{
          color: "#555", fontSize: L ? 11 : M ? 9 : 8,
          lineHeight: 1.4, marginBottom: L ? 8 : 5,
        }}>Gentle, compassionate care for the whole family — from first visits to full smiles.</div>

        {/* Services list with gold checkmarks */}
        {L && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
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
  if (spot.adFileUrl) {
    return (
      <div style={{ width: "100%", height: "100%", background: "#000", overflow: "hidden" }}>
        <img src={spot.adFileUrl} alt={spot.businessName}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      </div>
    );
  }
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
// "xl" maps to the large visual variant in all ad templates.
export function PaidAd({ spot }) {
  const renderSize = spot.size === "xl" ? "large" : spot.size;
  const s = { size: renderSize };
  switch (spot.businessName) {
    case "Mr. Biscuit's Café":
      if (renderSize === "large")  return <MrBiscuitsLarge />;
      if (renderSize === "medium") return <MrBiscuitsMedium />;
      return <MrBiscuitsSmall />;
    case "Clarkesville Family Dental":  return <FamilyDentalAd  {...s} />;
    case "Blue Ridge Air & Heat":       return <BlueRidgeAd     {...s} />;
    case "Tanner Insurance Agency":     return <TannerAd        {...s} />;
    case "Roma's Pizza & Subs":         return <RomasPizzaAd    {...s} />;
    case "Green Acres Lawn Care":       return <GreenAcresAd    {...s} />;
    default:                            return <DefaultAd spot={spot} />;
  }
}

// Size info for AvailableSpot — labels and dimensions shown inside each cell.
// Sizes are at *natural* pixel scale (100 px per grid unit) so they scale
// uniformly with the postcard via ScaledCell's transform: scale().
const SZ_INFO = {
  xl:     { label: "Extra Large Ad", dims: '4" × 5"' },
  large:  { label: "Large Ad",       dims: '3" × 4"' },
  medium: { label: "Medium Ad",      dims: '2" × 2"' },
  small:  { label: "Small Ad",       dims: '2" × 2"' },
};

// ─── Public: AvailableSpot ────────────────────────────────────────────────────
// Reference visual: circular green + button, corner-fold triangle top-right,
// green gradient background, "Reserve This Spot" pill CTA, "Reaches 5,000…"
// footer. Hover state managed locally — no transforms (those get clipped by
// ScaledCell's overflow: hidden). All sizes are natural pixels so ScaledCell's
// uniform scale keeps them proportional at any viewport width.
export function AvailableSpot({ spot, isSelected, onClick }) {
  const info = SZ_INFO[spot.size] || SZ_INFO.small;
  const displayPrice = Math.round((spot.price ?? 0) / 100);
  const [hover, setHover] = useState(false);

  const isXL = spot.size === "xl";
  const isL  = spot.size === "large";
  const isM  = spot.size === "medium";
  const isS  = spot.size === "small";

  // Natural-pixel sizes — scaled uniformly by ScaledCell.
  const csz     = isXL ? 80  : isL ? 60  : isM ? 44  : 28;   // circle diameter
  const lsz     = isXL ? 20  : isL ? 16  : isM ? 13  : 9;    // label font
  const psz     = isXL ? 34  : isL ? 26  : isM ? 20  : 12;   // price font
  const dsz     = isXL ? 14  : isL ? 11  : isM ? 10  : 7;    // dims font
  const tw      = isXL ? 40  : isL ? 30  : 22;                // triangle wing
  const showBtn = !isS;
  const bh      = isXL ? 44  : isL ? 34  : 26;                // pill height
  const bf      = isXL ? 13  : isL ? 11  : 10;                // pill font
  const gap     = isXL ? 12  : isL ? 9   : isM ? 6   : 4;
  const pad     = isXL ? 20  : isL ? 14  : isM ? 10  : 6;

  // Selected state overrides hover with amber tones.
  const h = hover && !isSelected;
  const bg          = isSelected ? "#fefce8" : h ? "linear-gradient(135deg,#ecfdf5,#d1fae5)" : "linear-gradient(135deg,#f8fffe,#f0fdf4)";
  const borderColor = isSelected ? "#f59e0b" : h ? "#16a34a" : "#4ade80";
  const borderStyle = isSelected ? "2px solid" : `3px solid`;
  const circleColor = isSelected ? "#f59e0b" : h ? "#16a34a" : "#22c55e";
  const labelColor  = isSelected ? "#92400e" : h ? "#15803d" : "#166534";
  const priceColor  = isSelected ? "#b45309" : "#111";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%", height: "100%",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        cursor: "pointer", boxSizing: "border-box",
        position: "relative", overflow: "hidden",
        background: bg,
        border: `${borderStyle} ${borderColor}`,
        gap, padding: pad,
        transition: "all 0.18s ease",
      }}
    >
      {/* Corner-fold triangle — top-right visual cue the cell is claimable */}
      {!isSelected && (
        <div style={{
          position: "absolute", top: 0, right: 0,
          width: 0, height: 0, borderStyle: "solid",
          borderWidth: `0 ${tw}px ${tw}px 0`,
          borderColor: `transparent ${h ? "#16a34a" : "#22c55e"} transparent transparent`,
          opacity: h ? 1 : 0.55,
          transition: "opacity 0.18s",
        }} />
      )}

      {/* Circular + button */}
      <div style={{
        width: csz, height: csz, borderRadius: "50%",
        background: circleColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: h ? "0 4px 16px rgba(22,163,74,0.45)" : "0 2px 8px rgba(34,197,94,0.30)",
        transition: "all 0.18s", flexShrink: 0,
      }}>
        <span style={{ color: "#fff", fontSize: csz * 0.45, fontWeight: 200, lineHeight: 1 }}>
          {isSelected ? "✓" : "+"}
        </span>
      </div>

      {/* Label */}
      <div style={{
        color: labelColor, fontSize: lsz, fontWeight: 800,
        letterSpacing: 0.3, textAlign: "center", lineHeight: 1,
        fontFamily: "sans-serif",
      }}>
        {isSelected ? "Selected" : info.label}
      </div>

      {/* Price */}
      <div style={{
        color: priceColor, fontSize: psz, fontWeight: 900,
        fontFamily: "Georgia,serif", lineHeight: 1, letterSpacing: -0.5,
      }}>
        ${displayPrice}
      </div>

      {/* Dimensions */}
      <div style={{
        color: "#666", fontSize: dsz, fontWeight: 600, letterSpacing: 0.5,
        fontFamily: "sans-serif",
      }}>
        {info.dims}
      </div>

      {/* "Reserve This Spot" pill — shown for all sizes except Small */}
      {showBtn && !isSelected && (
        <div style={{
          height: bh, paddingLeft: isXL ? 24 : 16, paddingRight: isXL ? 24 : 16,
          background: h ? "#15803d" : "#16a34a",
          borderRadius: bh / 2,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 800, fontSize: bf,
          letterSpacing: 0.5, textTransform: "uppercase",
          boxShadow: h ? "0 4px 14px rgba(21,128,61,0.55)" : "0 2px 6px rgba(22,163,74,0.35)",
          transition: "all 0.18s",
          fontFamily: "sans-serif",
        }}>
          Reserve This Spot
        </div>
      )}

      {/* Social proof footer — not shown for Small (no room) */}
      {!isS && !isSelected && (
        <div style={{
          fontSize: isXL ? 10 : isL ? 8 : 7,
          color: "#9ca3af", fontStyle: "italic",
          textAlign: "center", fontFamily: "sans-serif",
        }}>
          Reaches 5,000 local homes
        </div>
      )}
    </div>
  );
}

// ─── Public: ReservedSpot ─────────────────────────────────────────────────────
// Spot is held by another business but not yet paid. Distinct amber/yellow
// look so it doesn't pretend to be a finished paid ad — the customer can see
// it's taken without thinking it's a sample for them to copy. Renders inside
// the same ScaledCell wrapper as AvailableSpot so sizes match exactly.
export function ReservedSpot({ spot }) {
  const f = AVAIL_FONTS[spot.size] || AVAIL_FONTS.small;
  return (
    <div style={{
      width: "100%", height: "100%", borderRadius: 6,
      background: "#fefce8",
      border: `${Math.max(2, f.border - 1)}px dashed #fbbf24`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: f.gap, padding: f.pad,
      textAlign: "center", boxSizing: "border-box", overflow: "hidden",
      cursor: "not-allowed",
    }}>
      <div style={{ fontSize: Math.round(f.plus * 0.62), lineHeight: 1 }}>📌</div>
      <div style={{
        fontWeight: 800, fontSize: f.name, color: "#92400e",
        fontFamily: "sans-serif", lineHeight: 1.15,
      }}>
        Reserved
      </div>
      {spot.size !== "small" && (
        <div style={{
          fontSize: f.badge, color: "#a16207",
          fontFamily: "sans-serif", lineHeight: 1.2, fontWeight: 600,
        }}>
          Held by another business
        </div>
      )}
    </div>
  );
}

// ─── Public: Modal ─────────────────────────────────────────────────────────────
export function Modal({ spot, onClose, onSubmit, isLoading, error, territory }) {
  const sz = SIZES[spot.size] ?? SIZES.small;
  const displayPrice = Math.round((spot.price ?? 0) / 100);
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
              ${displayPrice}
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              Reaches 5,000 {territory || "Habersham County"} homes
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
          {isLoading ? "Reserving..." : `Reserve This Spot — $${displayPrice}`}
        </button>
        <p style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", margin: "10px 0 0" }}>
          No charge now. You'll pay on the next screen.
        </p>
      </div>
    </div>
  );
}
