import { browserScrape, closeBrowser } from "../lib/browserScraper.js";

async function main() {
  console.log("Testing Casa Bariachi (JS/Vite SPA)...");
  const r1 = await browserScrape("https://casabariachimexgrill.com/");
  console.log("email:", r1.email);
  console.log("logoUrl:", r1.logoUrl?.slice(0, 100) ?? null);

  console.log("\nTesting Maria's Kitchen...");
  const r2 = await browserScrape("https://mariaskitchenga.com/");
  console.log("email:", r2.email);
  console.log("logoUrl:", r2.logoUrl?.slice(0, 100) ?? null);

  await closeBrowser();
}
main().catch(e => { console.error(e); process.exit(1); });
