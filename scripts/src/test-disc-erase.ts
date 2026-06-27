/**
 * test-disc-erase.ts
 * Feeds new "small gold disc" raw Grok images through compositeQrOnto
 * (with the updated 374px erase zone) and saves 500×500 corner crops.
 *
 * Run: pnpm --filter @workspace/scripts run test:disc-erase
 */
import { readFileSync, writeFileSync } from "fs";
import { compositeQrOnto, TEMPLATE_QR_STYLES } from "../../artifacts/api-server/src/lib/compositeQr";
import sharp from "sharp";

const URL = "https://localspot.app/go/test-disc-2026";

const FILES: Array<{ f: string; lbl: string }> = [
  { f: "/tmp/grok-raw-1782589349666-xl.jpg", lbl: "heritage-home-antiques" },
  { f: "/tmp/grok-raw-1782589353777-xl.jpg", lbl: "heritage-home-law" },
  { f: "/tmp/grok-raw-1782589354843-xl.jpg", lbl: "sage-organic-herb" },
  { f: "/tmp/grok-raw-1782589360662-xl.jpg", lbl: "health-wellness-valley" },
  { f: "/tmp/grok-raw-1782589361639-xl.jpg", lbl: "health-wellness-eye" },
  { f: "/tmp/grok-raw-1782589365573-xl.jpg", lbl: "brush-stroke-carpentry" },
  { f: "/tmp/grok-raw-1782589360486-xl.jpg", lbl: "brush-stroke-painting" },
];

async function main() {
  for (const { f, lbl } of FILES) {
    let buf: Buffer;
    try {
      buf = readFileSync(f);
    } catch {
      console.warn(`skip (not found): ${lbl}`);
      continue;
    }

    const style = TEMPLATE_QR_STYLES["purple-sage"];
    const composited = await compositeQrOnto(buf, URL, "xl", style);

    // 500×500 crop from bottom-right — wide enough to show the full erase zone
    const crop = await sharp(composited)
      .extract({ left: 700, top: 1000, width: 500, height: 500 })
      .jpeg({ quality: 92 })
      .toBuffer();

    writeFileSync(`/tmp/disc-composited-${lbl}.jpg`, crop);
    console.log(`done: ${lbl}`);
  }
  console.log("\nAll done. Inspect /tmp/disc-composited-*.jpg");
}

main().catch((err) => { console.error(err); process.exit(1); });
