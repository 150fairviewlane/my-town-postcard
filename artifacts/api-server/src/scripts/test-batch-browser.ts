import { browserScrape, warmBrowser, closeBrowser } from "../lib/browserScraper.js";

// From DB: businesses with websites — id, name, url, has_real_email, logo_status
const BUSINESSES = [
  { id: 3,  name: "Bigg Daddys",          url: "http://biggdaddys.com/",               email: null,                    logo: "unusable" },
  { id: 7,  name: "Maria's Kitchen",       url: "https://mariaskitchenga.com/",          email: null,                    logo: "usable" },
  { id: 8,  name: "Casa Bariachi",         url: "https://casabariachimexgrill.com/",     email: null,                    logo: "usable" },
  { id: 9,  name: "LongHorn Steakhouse",  url: "https://www.longhornsteakhouse.com/",   email: null,                    logo: "unusable" },
  { id: 12, name: "Fenders Diner",         url: "http://www.fendersrestaurant.com/",     email: null,                    logo: "unusable" },
  { id: 13, name: "Midtown Grill",         url: "http://www.1midtowngrill.com/",         email: "user@domain.com",       logo: "usable" },
  { id: 15, name: "El Patron",             url: "http://elpatronmexicanrestaurants.com/",email: null,                    logo: "unusable" },
  { id: 16, name: "Knuckies Hoagies",     url: "https://knuckieshoagies.com/",          email: "user@domain.com",       logo: "usable" },
  { id: 19, name: "FarmHouse PoundCakes", url: "http://www.farmhousepoundcakes.com/",   email: "sentry@wixpress.com",   logo: "unusable" },
];

async function main() {
  console.log("Running browser scraper on 9 target businesses...\n");
  await warmBrowser();
  let newEmails = 0, newLogos = 0;
  try {
    for (const biz of BUSINESSES) {
      const result = await browserScrape(biz.url);
      const hadGoodEmail = biz.email && !biz.email.includes("domain.com") && !biz.email.includes("wixpress");
      const gainedEmail = !hadGoodEmail && !!result.email;
      const gainedLogo = biz.logo !== "usable" && !!result.logoUrl;
      if (gainedEmail) newEmails++;
      if (gainedLogo) newLogos++;
      console.log(`#${biz.id} ${biz.name}`);
      console.log(`  email:  ${result.email ?? "(none found)"} ${gainedEmail ? "← NEW" : ""}`);
      console.log(`  logo:   ${result.logoUrl ? result.logoUrl.slice(0, 75) + (result.logoUrl.length > 75 ? "…" : "") : "(none found)"} ${gainedLogo ? "← NEW" : ""}`);
      console.log();
    }
  } finally {
    await closeBrowser();
  }
  console.log(`── Results ──`);
  console.log(`New real emails recovered: ${newEmails}`);
  console.log(`New logo URLs recovered:   ${newLogos}`);
}

main().catch(e => { console.error(e); process.exit(1); });
