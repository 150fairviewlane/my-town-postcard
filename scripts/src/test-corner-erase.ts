/**
 * test-corner-erase.ts
 * Feeds saved raw Grok images through compositeQrOnto and saves corner crops
 * of the composited output for visual inspection.
 *
 * Usage: pnpm --filter @workspace/scripts run test-corner-erase
 */
import { readFileSync, writeFileSync } from "fs";
import { compositeQrOnto, TEMPLATE_QR_STYLES } from "../../artifacts/api-server/src/lib/compositeQr";

const TEST_URL = "https://localspot.app/go/test-qr-code";

const RAW_IMAGES: Array<{ file: string; label: string }> = [
  { file: "/tmp/grok-raw-1782588205499-xl.jpg", label: "purple-sage-1" },
  { file: "/tmp/grok-raw-1782588206776-xl.jpg", label: "home-elegance-medallion" },
  { file: "/tmp/grok-raw-1782588207237-xl.jpg", label: "at-your-service-1" },
  { file: "/tmp/grok-raw-1782588207345-xl.jpg", label: "heritage-home-1" },
  { file: "/tmp/grok-raw-1782588241109-xl.jpg", label: "sage-organic-thin-rays" },
  { file: "/tmp/grok-raw-1782588270790-xl.jpg", label: "home-elegance-flare" },
];

async function main() {
  const sharp = (await import("sharp")).default;

  for (const { file, label } of RAW_IMAGES) {
    let buf: Buffer;
    try {
      buf = readFileSync(file);
    } catch {
      console.warn(`Skipping ${label} — file not found: ${file}`);
      continue;
    }

    // Use purple-sage style for all (has fill + glow that shows contrast well)
    const style = TEMPLATE_QR_STYLES["purple-sage"];
    const composited = await compositeQrOnto(buf, TEST_URL, "xl", style);

    // Save full composited output
    const outFull = `/tmp/composited-${label}.jpg`;
    writeFileSync(outFull, composited);
    console.log(`Saved: ${outFull}`);

    // Extract bottom-right 500×500 corner crop for inspection
    const crop = await sharp(composited)
      .extract({ left: 700, top: 1000, width: 500, height: 500 })
      .jpeg({ quality: 92 })
      .toBuffer();

    const outCrop = `/tmp/crop-composited-${label}.jpg`;
    writeFileSync(outCrop, crop);
    console.log(`Saved corner crop: ${outCrop}`);
  }

  console.log("\nAll done. Inspect /tmp/crop-composited-*.jpg for corner quality.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
