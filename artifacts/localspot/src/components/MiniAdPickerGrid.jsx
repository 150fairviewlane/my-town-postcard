import { useState } from "react";
import { HouseAdVertical, EDDMBox } from "../postcardBack";

const RED = "#7B1418";
const AVAIL_BG = "linear-gradient(135deg,#f8fffe,#f0fdf4)";
const AVAIL_BORDER = "3px solid #4ade80";

// Copied from postcardCore.jsx — do not import (avoids pulling in all ad-gen code).
const FRONT_GRID_AREAS = [
  "mb  mb  mb  mb  dn  dn  dn  dn  re  re  re  re",
  "mb  mb  mb  mb  dn  dn  dn  dn  re  re  re  re",
  "mb  mb  mb  mb  dn  dn  dn  dn  re  re  re  re",
  "mb  mb  mb  mb  dn  dn  dn  dn  re  re  re  re",
  "mb  mb  mb  mb  dn  dn  dn  dn  re  re  re  re",
  "l1  l1  l1  l2  l2  l2  l3  l3  l3  l4  l4  l4",
  "l1  l1  l1  l2  l2  l2  l3  l3  l3  l4  l4  l4",
  "l1  l1  l1  l2  l2  l2  l3  l3  l3  l4  l4  l4",
  "l1  l1  l1  l2  l2  l2  l3  l3  l3  l4  l4  l4",
].map((r) => `"${r}"`).join(" ");

// Copied from postcardBack.jsx — do not import.
const BACK_GRID_AREAS = [
  "bxl bxl bxl bxl bxl2 bxl2 bxl2 bxl2 bxl3 bxl3 bxl3 bxl3",
  "bxl bxl bxl bxl bxl2 bxl2 bxl2 bxl2 bxl3 bxl3 bxl3 bxl3",
  "bxl bxl bxl bxl bxl2 bxl2 bxl2 bxl2 bxl3 bxl3 bxl3 bxl3",
  "bxl bxl bxl bxl bxl2 bxl2 bxl2 bxl2 bxl3 bxl3 bxl3 bxl3",
  "bxl bxl bxl bxl bxl2 bxl2 bxl2 bxl2 bxl3 bxl3 bxl3 bxl3",
  "bm1 bm1 bm1 bm2 bm2 bm2 bm3 bm3 bm3 bm4 bm4 bm4",
  "bm1 bm1 bm1 bm2 bm2 bm2 bm3 bm3 bm3 bm4 bm4 bm4",
  "bs1 bs1 bhs bhs bhs bhs bhs bhs bed bed bed bed",
  "bs1 bs1 bhs bhs bhs bhs bhs bhs bed bed bed bed",
].map((r) => `"${r}"`).join(" ");

const FRONT_SELLABLE = ["mb", "dn", "re", "l1", "l2", "l3", "l4"];
const BACK_SELLABLE = ["bxl", "bxl2", "bxl3", "bm1", "bm2", "bm3", "bm4", "bs1"];
const BACK_STATIC = ["bhs", "bed"];

function MiniCell({ area, spot }) {
  const isPaid = spot?.status === "paid";

  const imgSrc = spot?.adFileUrl || spot?.templateData?.finishedAdUrl || null;

  if (isPaid && imgSrc) {
    return (
      <div style={{ gridArea: area, overflow: "hidden", position: "relative" }}>
        <img
          src={imgSrc}
          loading="lazy"
          alt={spot.businessName || "ad"}
          style={{
            width: "100%", height: "100%",
            objectFit: "cover",
            display: "block",
            position: "absolute", inset: 0,
          }}
        />
      </div>
    );
  }

  if (isPaid) {
    return (
      <div style={{
        gridArea: area,
        background: RED,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 2,
        boxSizing: "border-box",
      }}>
        {spot.businessName && (
          <span style={{
            color: "#fff",
            fontSize: 7,
            fontWeight: 700,
            textAlign: "center",
            lineHeight: 1.2,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            wordBreak: "break-word",
          }}>
            {spot.businessName}
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{
      gridArea: area,
      background: AVAIL_BG,
      border: AVAIL_BORDER,
      boxSizing: "border-box",
      overflow: "hidden",
    }} />
  );
}

export default function MiniAdPickerGrid({ spots = [], defaultSide = "front" }) {
  const [side, setSide] = useState(defaultSide);

  const gridAreas = side === "front" ? FRONT_GRID_AREAS : BACK_GRID_AREAS;
  const sellable = side === "front" ? FRONT_SELLABLE : BACK_SELLABLE;
  const staticAreas = side === "front" ? [] : BACK_STATIC;

  const spotMap = {};
  spots.filter((s) => s.side === side).forEach((s) => {
    spotMap[s.gridArea] = s;
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 6, justifyContent: "center" }}>
        {["front", "back"].map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            style={{
              padding: "3px 10px",
              borderRadius: 999,
              border: "1.5px solid",
              borderColor: side === s ? RED : "#e5e7eb",
              background: side === s ? RED : "#f9fafb",
              color: side === s ? "#fff" : "#374151",
              fontSize: 10.5,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div style={{ width: "100%", position: "relative", paddingBottom: "75%", overflow: "hidden", borderRadius: 4 }}>
        <div style={{
          position: "absolute", inset: 0,
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gridTemplateRows: "repeat(9, 1fr)",
          gridTemplateAreas: gridAreas,
          gap: 1,
          background: "#d1d5db",
          overflow: "hidden",
          borderRadius: 4,
        }}>
          {sellable.map((area) => (
            <MiniCell key={area} area={area} spot={spotMap[area]} />
          ))}
          {side === "back" && (
            <>
              <div style={{ gridArea: "bhs", overflow: "hidden" }}>
                <HouseAdVertical />
              </div>
              <div style={{ gridArea: "bed", overflow: "hidden" }}>
                <EDDMBox />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
