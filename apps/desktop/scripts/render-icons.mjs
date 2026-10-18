// Renders build/icon.svg into the app's icon files: build/icon.png (512 px), build/icon.ico
// (16 to 256 px, for the installer, the executable and the shortcuts), resources/icon.png (512 px,
// the window and tray) and src/renderer/src/assets/logo.png (128 px, the screens' header).
// Run with Electron, which draws the SVG offscreen: pnpm --filter desktop icons
import { Buffer } from "node:buffer";
import console from "node:console";
import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow } from "electron";

const root = path.join(import.meta.dirname, "..");
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** Packs PNG images into one .ico file; every Windows since Vista reads PNG entries. */
function icoOf(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, png } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...pngs.map(({ png }) => png)]);
}

void app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(root, "build", "icon.svg"), "utf8");
  const window = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  window.webContents.setFrameRate(1);
  const painted = new Promise((resolve) =>
    window.webContents.once("paint", (_event, _dirty, image) => resolve(image)),
  );
  await window.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(
        `<html><body style="margin:0;background:transparent">${svg}</body></html>`,
      ),
  );
  const full = await painted;
  const sized = (size) =>
    full.resize({ width: size, height: size, quality: "best" }).toPNG();

  fs.writeFileSync(path.join(root, "build", "icon.png"), sized(512));
  fs.writeFileSync(path.join(root, "resources", "icon.png"), sized(512));
  fs.writeFileSync(
    path.join(root, "src", "renderer", "src", "assets", "logo.png"),
    sized(128),
  );
  fs.writeFileSync(
    path.join(root, "build", "icon.ico"),
    icoOf(ICO_SIZES.map((size) => ({ size, png: sized(size) }))),
  );
  console.log(
    `rendered ${full.getSize().width} px into icon.png, icon.ico and logo.png`,
  );
  app.exit(0);
});
