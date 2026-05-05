import { getSampleAd } from "./PostcardSampleAds";
import { GRID_AREAS } from "./postcardCore";

const HERO_AD_MAP = {
  mb:  { key: "mrbiscuits", sizeKey: "XL" },
  dn:  { key: "dental",     sizeKey: "L"  },
  re:  { key: "autorepair", sizeKey: "L"  },
  hv:  { key: "gym",        sizeKey: "M"  },
  ins: { key: "insurance",  sizeKey: "M"  },
  pz:  { key: "pizza",      sizeKey: "S"  },
  hs:  { key: "mexican",    sizeKey: "S"  },
  a1:  { key: "salon",      sizeKey: "S"  },
  lw:  { key: "lawn",       sizeKey: "M"  },
  a2:  { key: "vet",        sizeKey: "M"  },
};

const GRID_SLOTS = ["mb", "dn", "re", "hv", "ins", "pz", "hs", "a1", "lw", "a2"];

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
          Reaching 5,000 Local Homes · Spring 2026
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
          {GRID_SLOTS.map(gridArea => {
            const entry = HERO_AD_MAP[gridArea];
            return (
              <div key={gridArea} style={{ gridArea, overflow: "hidden", borderRadius: 2, minWidth: 0, minHeight: 0 }}>
                {getSampleAd(entry.key, entry.sizeKey)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
