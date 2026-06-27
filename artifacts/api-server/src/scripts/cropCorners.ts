import sharp from "sharp";
const jobs: Array<[string, string]> = [
  ["/tmp/qr_fixed_heritage_home.jpg", "/tmp/qr_corner_heritage.jpg"],
  ["/tmp/qr_default_style.jpg",       "/tmp/qr_corner_default.jpg"],
];
for (const [src, dst] of jobs) {
  await sharp(src).extract({ left: 990, top: 1290, width: 210, height: 210 }).jpeg({ quality: 92 }).toFile(dst);
  console.log("saved", dst);
}
