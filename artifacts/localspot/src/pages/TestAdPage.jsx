// Hidden test render route used by the Playwright visual regression suite.
// URL: /test/ad?template=photo-bold&size=L&fixture=baseline
//
// Renders ONE template at its natural pixel dimensions inside a labeled container
// (#ad-container). Sets data-ready="1" on <body> once all images have loaded so
// the test runner can wait deterministically before screenshotting.
import { useEffect, useState } from "react";
import { TEMPLATES, AD_SIZES } from "../AdGenerator";
import { FIXTURES, NATURAL_DIMS } from "../testFixtures";

function getParam(name, fallback) {
  const v = new URLSearchParams(window.location.search).get(name);
  return v || fallback;
}

export default function TestAdPage() {
  const templateId = getParam("template", "photo-bold");
  const sizeKey = getParam("size", "L");
  const fixtureId = getParam("fixture", "baseline");

  const tplEntry = TEMPLATES[templateId];
  const fixture = FIXTURES[fixtureId];
  const dims = NATURAL_DIMS[sizeKey];
  const sizeOk = AD_SIZES[sizeKey];

  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.body.removeAttribute("data-ready");
    document.body.style.background = "#ffffff";
    document.body.style.margin = "0";
    let cancelled = false;
    // Wait for fonts + every <img> inside the ad container.
    const check = async () => {
      try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
      } catch {}
      const root = document.getElementById("ad-container");
      const imgs = root ? Array.from(root.querySelectorAll("img")) : [];
      await Promise.all(imgs.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(res => {
          img.addEventListener("load", res, { once: true });
          img.addEventListener("error", res, { once: true });
        });
      }));
      if (!cancelled) {
        setReady(true);
        document.body.setAttribute("data-ready", "1");
      }
    };
    // Slight microtask delay so the template has mounted.
    const t = setTimeout(check, 50);
    return () => { cancelled = true; clearTimeout(t); };
  }, [templateId, sizeKey, fixtureId]);

  if (!tplEntry || !fixture || !dims || !sizeOk) {
    return (
      <div data-error="1" style={{ padding: 20, fontFamily: "monospace", color: "#b91c1c" }}>
        Bad params: template={templateId} size={sizeKey} fixture={fixtureId}
      </div>
    );
  }

  const Tpl = tplEntry.Component;
  const onEdit = () => {}; // no-op in test mode

  return (
    <div style={{ padding: 20, background: "#fff", minHeight: "100vh" }}>
      {/* In test mode, hide the click-to-edit pencil hint span. It's positioned
          absolutely with right:-6/top:-8, which inflates every parent's
          scrollWidth by 6px and produces false-positive overflow reports. */}
      <style>{`#ad-container .edit-hint { display: none !important; } #ad-container .editable-text { cursor: default !important; outline: none !important; }`}</style>
      {/* Meta line — useful when debugging in the browser, ignored by screenshot crop */}
      <div data-meta="1" style={{ fontFamily: "monospace", fontSize: 11, color: "#64748b", marginBottom: 12 }}>
        {templateId} / {sizeKey} / {fixtureId} ({dims.w}x{dims.h}) — ready={String(ready)}
      </div>
      <div
        id="ad-container"
        data-template={templateId}
        data-size={sizeKey}
        data-fixture={fixtureId}
        style={{
          width: dims.w,
          height: dims.h,
          position: "relative",
          overflow: "hidden",
          background: "#fff",
          boxShadow: "0 0 0 1px #e5e7eb",
        }}
      >
        <Tpl data={fixture} sizeKey={sizeKey} onEdit={onEdit} />
      </div>
    </div>
  );
}
