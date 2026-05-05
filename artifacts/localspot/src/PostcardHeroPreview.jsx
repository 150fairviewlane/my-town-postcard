import { GRID_AREAS } from "./postcardCore";
import { FamilyDentalAd, BlueRidgeAd, TannerAd, RomasPizzaAd, GreenAcresAd } from "./postcardCore";
import { MrBiscuitsLarge } from "./MrBiscuitsReferenceAd.jsx";
import { getSampleAd } from "./PostcardSampleAds";

// ─────────────────────────────────────────────────────────────────────────────
// HERO AD MAP — 9 distinct businesses, no duplicates, varied ad styles.
//
// Grid layout (12 cols × 9 rows):
//   mb  (4×5 XL)  : Mr. Biscuit's Café              — photo-forward café ad
//   dn  (4×5 L)   : Clarkesville Family Dental       — navy/gold professional
//   re  (4×5 L)   : Blue Ridge Air & Heat            — diagonal split HVAC
//   hv  (3×4 M)   : Tanner Insurance Agency          — dark navy, gold shield
//   ins (3×4 M)   : Roma's Pizza & Subs              — bold red, BOGO offer
//   pz  (2×2 S)   : Green Acres Lawn Care            — green gradient
//   hs  (2×2 S)   : The Cut Above Salon              — photo-bold style
//   a1  (2×2 S)   : Shadetree Auto Repair            — stamp style
//   lw  (3×2 M)   : Clarkesville Animal Clinic       — split-clean style
//   a2  (3×2 M)   : Peak Performance Gym             — photo-bold style
// ─────────────────────────────────────────────────────────────────────────────
function renderHeroAd(area) {
  switch (area) {
    case "mb":  return <MrBiscuitsLarge />;
    case "dn":  return <FamilyDentalAd size="large" />;
    case "re":  return <BlueRidgeAd size="large" />;
    case "hv":  return <TannerAd size="medium" />;
    case "ins": return <RomasPizzaAd size="large" />;
    case "pz":  return getSampleAd("lawn", "S");
    case "hs":  return getSampleAd("salon", "S");
    case "a1":  return getSampleAd("autorepair", "S");
    case "lw":  return getSampleAd("vet", "M");
    case "a2":  return getSampleAd("gym", "M");
    default:    return null;
  }
}

const HERO_SLOTS = ["mb", "dn", "re", "hv", "ins", "pz", "hs", "a1", "lw", "a2"];

export default function PostcardHeroPreview() {
  return (
    <div style={{
      width: "100%",
      borderRadius: 10,
      overflow: "hidden",
      boxShadow: "0 24px 60px rgba(0,0,0,0.22)",
      background: "#0f1923",
    }}>
      {/* Header bar */}
      <div style={{
        background: "#991b1b",
        padding: "5px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 11, fontFamily: "Georgia,serif" }}>
          📮 Clarkesville Community Mailer
        </div>
        <div style={{ color: "#fca5a5", fontSize: 8, fontFamily: "sans-serif" }}>
          Reaching 5,000 Local Homes · Summer 2026
        </div>
      </div>

      {/* 12:9 aspect ratio grid using padding-bottom trick */}
      <div style={{ position: "relative", width: "100%", paddingBottom: "75%" }}>
        <div style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gridTemplateRows: "repeat(9, 1fr)",
          gridTemplateAreas: GRID_AREAS,
          gap: "5px",
          background: "#000",
          padding: "5px",
          boxSizing: "border-box",
        }}>
          {HERO_SLOTS.map(area => (
            <div key={area} style={{ gridArea: area, overflow: "hidden", borderRadius: 2, minWidth: 0, minHeight: 0 }}>
              {renderHeroAd(area)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
