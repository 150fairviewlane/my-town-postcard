import fs from "node:fs";
import path from "node:path";
import OpenAI, { toFile } from "openai";

async function main() {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) throw new Error("OpenAI env vars not set");
  const openai = new OpenAI({ apiKey, baseURL });

  const root    = path.resolve(import.meta.dirname ?? __dirname, "../..");
  const refPath = path.join(root, "attached_assets/image_1782006594638.jpeg");

  // Resize the reference photo down to a manageable size before upload
  const sharp = (await import("sharp")).default;
  const tmpJpeg = "/tmp/reference-resized.jpg";
  await sharp(refPath)
    .resize({ width: 1024, withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toFile(tmpJpeg);

  const { size } = fs.statSync(tmpJpeg);
  console.log(`Reference photo resized → ${(size / 1024).toFixed(0)} KB`);

  const file = await toFile(fs.readFileSync(tmpJpeg), "reference.jpg", { type: "image/jpeg" });

  const prompt = [
    "This is a photo of two printed postcards resting on a dark granite countertop.",
    "Replace ONLY the dark granite surface with stark white granite that has subtle light-grey veining.",
    "The white granite should be bright, clean, and slightly reflective.",
    "The postcards must remain completely identical — same position, same angle, same printed artwork, same drop shadows.",
    "Keep everything about the postcards exactly as they appear in the original photo.",
    "Professional product photography: even studio lighting.",
  ].join(" ");

  console.log("Calling gpt-image-1 edit…");
  const result = await (openai.images as any).edit({
    model:  "gpt-image-1",
    image:  file,
    prompt,
    size:   "1536x1024",
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned from gpt-image-1");

  const timestamp = Date.now();
  const outDir  = path.join(root, "artifacts/localspot/public");
  const outPath = path.join(outDir, `postcard-white-granite-${timestamp}.png`);
  fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
  console.log("✓ Saved:", outPath);

  fs.unlinkSync(tmpJpeg);
}

main().catch((e) => { console.error(e); process.exit(1); });
