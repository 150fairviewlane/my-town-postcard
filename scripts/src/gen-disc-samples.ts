/**
 * gen-disc-samples.ts
 * Generates 15 test ads via the running server (new "small gold disc" prompt)
 * and saves 400×400 bottom-right corner crops for visual measurement.
 *
 * Run: pnpm --filter @workspace/scripts run gen:disc-samples
 *
 * Prerequisite: api-server workflow must be running.
 */
import { writeFileSync, readdirSync } from "fs";

const API = "http://localhost:80/api/grok-ad-generator/generate";

// Templates that had the worst starburst bleed — sample each multiple times
const RENDERS: Array<{ template: string; bizName: string; industry: string }> = [
  { template: "purple-sage",    bizName: "Mountain Roofing Co",  industry: "Roofing" },
  { template: "purple-sage",    bizName: "Serenity Day Spa",     industry: "Spa & Wellness" },
  { template: "purple-sage",    bizName: "Blue Ridge Dentistry", industry: "Dentistry" },
  { template: "home-elegance",  bizName: "Gold Leaf Finance",    industry: "Financial Services" },
  { template: "home-elegance",  bizName: "Elite Home Staging",   industry: "Real Estate" },
  { template: "at-your-service",bizName: "A+ Landscaping",       industry: "Landscaping" },
  { template: "at-your-service",bizName: "ProClean Services",    industry: "Cleaning" },
  { template: "heritage-home",  bizName: "Clarkesville Antiques",industry: "Antiques" },
  { template: "heritage-home",  bizName: "Blue Ridge Law Group", industry: "Legal Services" },
  { template: "sage-organic",   bizName: "Harvest Herb Farm",    industry: "Organic Farming" },
  { template: "sage-organic",   bizName: "Green Path Wellness",  industry: "Holistic Health" },
  { template: "health-wellness",bizName: "Valley Physical Therapy",industry: "Physical Therapy" },
  { template: "health-wellness",bizName: "Clear Vision Eye Care",industry: "Optometry" },
  { template: "brush-stroke",   bizName: "Habersham Carpentry",  industry: "Carpentry" },
  { template: "brush-stroke",   bizName: "Summit Painting Co",   industry: "Painting" },
];

async function main() {
  const sharp = (await import("sharp")).default;

  // Record timestamps of raw files already on disk before we start
  const existingRaws = new Set<string>(
    readdirSync("/tmp")
      .filter(f => f.startsWith("grok-raw-"))
      .map(f => `/tmp/${f}`),
  );
  console.log(`Pre-existing raw files: ${existingRaws.size}`);

  let renderCount = 0;
  for (const r of RENDERS) {
    renderCount++;
    console.log(`\n[${renderCount}/${RENDERS.length}] ${r.template} — ${r.bizName}`);

    const before = Date.now();
    let resp: Response;
    try {
      resp = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bizName:   r.bizName,
          industry:  r.industry,
          phone:     "(706) 555-0100",
          address:   "123 Main St, Clarkesville, GA 30523",
          city:      "Clarkesville",
          website:   "https://example.com",
          menu:      ["Service A", "Service B", "Service C"],
          template:  r.template,
          sizeKey:   "xl",
        }),
        signal: AbortSignal.timeout(180_000), // 3-minute timeout per render
      });
    } catch (err) {
      console.error(`  FETCH ERROR: ${err}`);
      continue;
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`  HTTP ${resp.status}: ${body.slice(0, 200)}`);
      continue;
    }

    const elapsed = Math.round((Date.now() - before) / 1000);
    console.log(`  Completed in ${elapsed}s — HTTP ${resp.status}`);

    // Find the new raw file written by the dev-mode saver during this render
    await new Promise(r => setTimeout(r, 300)); // brief settle
    const newRaws = readdirSync("/tmp")
      .filter(f => f.startsWith("grok-raw-") && !existingRaws.has(`/tmp/${f}`))
      .map(f => `/tmp/${f}`)
      .sort();

    if (newRaws.length === 0) {
      console.warn("  No new raw file found — server may not have the dev-mode saver active");
      continue;
    }

    // Take the most recent new raw file
    const rawFile = newRaws[newRaws.length - 1]!;
    existingRaws.add(rawFile); // mark as seen so next render doesn't re-use it
    console.log(`  Raw saved: ${rawFile}`);

    // Extract bottom-right 400×400 corner crop
    try {
      const rawBuf = await sharp(rawFile)
        .extract({ left: 800, top: 1100, width: 400, height: 400 })
        .jpeg({ quality: 92 })
        .toBuffer();

      const label = `${r.template}-${r.bizName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
      const cropOut = `/tmp/disc-corner-${label}.jpg`;
      writeFileSync(cropOut, rawBuf);
      console.log(`  Corner crop: ${cropOut}`);
    } catch (cropErr) {
      console.error(`  Crop failed: ${cropErr}`);
    }
  }

  console.log("\n✓ Done. Inspect /tmp/disc-corner-*.jpg for corner extent.");
}

main().catch(err => { console.error(err); process.exit(1); });
