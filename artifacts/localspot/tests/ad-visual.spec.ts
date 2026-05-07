import { test, expect, Page } from "@playwright/test";
// Fixtures live in src/ so the React /test/ad page can import them too.
// @ts-expect-error JS module without types
import { FIXTURE_IDS, TEMPLATE_IDS, SIZE_IDS } from "../src/testFixtures.js";

const adUrl = (template: string, size: string, fixture: string) =>
  `/test/ad?template=${encodeURIComponent(template)}&size=${encodeURIComponent(size)}&fixture=${encodeURIComponent(fixture)}`;

/**
 * Walk the rendered ad container and return any layout issues found:
 * - text nodes whose scrollWidth exceeds clientWidth (horizontal overflow)
 * - elements whose bounding rect escapes the container's bounds
 * - <img> elements that failed to load
 */
async function findLayoutIssues(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const container = document.getElementById("ad-container");
    if (!container) return ["#ad-container not found"];
    const cRect = container.getBoundingClientRect();
    const issues: string[] = [];
    const TOL = 1.5; // sub-pixel tolerance

    // 1. Images loaded successfully
    container.querySelectorAll("img").forEach(img => {
      if (!img.complete || img.naturalWidth === 0) {
        issues.push(`image-not-loaded: ${img.src.slice(0, 60)}`);
      }
    });

    // 2. Horizontal text overflow on any element
    container.querySelectorAll("*").forEach(el => {
      const html = el as HTMLElement;
      // Skip elements that explicitly allow scroll/overflow
      const cs = window.getComputedStyle(html);
      if (cs.overflowX === "scroll" || cs.overflowX === "auto") return;
      if (html.scrollWidth > html.clientWidth + TOL) {
        const txt = (html.textContent || "").trim().slice(0, 40);
        if (txt) issues.push(`text-overflow-x ("${txt}"): ${html.scrollWidth} > ${html.clientWidth}`);
      }
    });

    // 3. Elements rendered outside the container's bounds
    container.querySelectorAll("*").forEach(el => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const escapesLeft = r.left < cRect.left - TOL;
      const escapesRight = r.right > cRect.right + TOL;
      const escapesTop = r.top < cRect.top - TOL;
      const escapesBottom = r.bottom > cRect.bottom + TOL;
      if (escapesLeft || escapesRight || escapesTop || escapesBottom) {
        const tag = (el as HTMLElement).tagName.toLowerCase();
        const txt = ((el as HTMLElement).textContent || "").trim().slice(0, 30);
        const sides = [
          escapesLeft && "L",
          escapesRight && "R",
          escapesTop && "T",
          escapesBottom && "B",
        ].filter(Boolean).join("");
        issues.push(`out-of-bounds [${sides}] <${tag}> "${txt}"`);
      }
    });

    return issues;
  });
}

// Generate one test per (fixture, template, size) — 12 × 5 × 4 = 240 cases.
for (const fixture of FIXTURE_IDS as string[]) {
  test.describe(`fixture: ${fixture}`, () => {
    for (const template of TEMPLATE_IDS as string[]) {
      for (const size of SIZE_IDS as string[]) {
        const name = `${fixture}-${template}-${size}`;
        test(name, async ({ page }) => {
          await page.goto(adUrl(template, size, fixture));
          // Wait for the page to signal that fonts + images are loaded.
          await page.waitForSelector("body[data-ready='1']", { timeout: 15_000 });

          const ad = page.locator("#ad-container");
          await expect(ad).toBeVisible();

          // Visual regression — first run creates baseline, later runs compare.
          await expect(ad).toHaveScreenshot(`${name}.png`);

          // Layout assertions — fail fast on overflow / out-of-bounds / broken images.
          const issues = await findLayoutIssues(page);
          expect(issues, `Layout issues for ${name}:\n  - ${issues.join("\n  - ")}`).toEqual([]);
        });
      }
    }
  });
}
