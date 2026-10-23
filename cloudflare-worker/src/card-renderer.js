import { Resvg, initWasm } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";

const TEMPLATE_BASE = "https://ryah001.github.io/otaku-card-maker/assets/";
const TEMPLATES = {
  Bleu: "cni-blue-template-BPwUlMZM.png",
  Vert: "cni-green-template-CO3UfUZJ.png",
  Orange: "cni-orange-template-DViafBPF.png",
  Violet: "cni-violet-template-B5ng9Gk2.png",
  Jaune: "cni-yellow-template-CZMzbPIy.png",
  Rouge: "cni-red-template-BxEv182B.png",
};
let wasmReady;

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[ch]);
}
function textLines(value, maxChars = 42) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}
async function toDataUrl(url) {
  const response = await fetch(url, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!response.ok) throw new Error(`Card asset unavailable (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${response.headers.get("content-type") || "image/png"};base64,${btoa(binary)}`;
}

export async function renderCard(profile) {
  if (!wasmReady) wasmReady = initWasm(resvgWasm);
  await wasmReady;
  const template = TEMPLATES[profile.color];
  if (!template) throw new Error("Unknown card color");
  const background = await toDataUrl(`${TEMPLATE_BASE}${template}`);
  let photo = "";
  if (profile.photo_url) {
    try {
      const photoData = await toDataUrl(profile.photo_url);
      photo = `<image xlink:href="${photoData}" x="35" y="148" width="250" height="322" preserveAspectRatio="xMidYMid slice"/>`;
    } catch (error) {
      console.error("Profile photo could not be rendered", error instanceof Error ? error.message : "unknown");
    }
  }
  const label = (x, y, value) => `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="17" fill="#111827">${escapeXml(value)}</text>`;
  const value = (x, y, val, size = 17) => `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="600" fill="#111827">${escapeXml(val || "—")}</text>`;
  const quote = textLines(profile.quote, 64);
  const overlay = [
    label(291, 177, "Pseudo"), value(509, 177, profile.username, 16),
    label(291, 226, "Nom"), value(415, 226, profile.name, 16),
    label(291, 275, "Nationalité"), value(441, 275, profile.nationality, 16),
    label(291, 324, "Statut"), value(379, 324, profile.status, 16),
    label(291, 373, "Genre"), value(470, 373, profile.genre, 16),
    label(291, 422, "Citation"), value(398, 429, quote[0], 14),
    ...(quote[1] ? [value(400, 463, quote[1], 14)] : []),
    photo,
    `<text x="880" y="520" text-anchor="end" font-family="Arial, sans-serif" font-size="10" fill="#374151">HUNTERS • OTaku</text>`,
  ].join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="957" height="536" viewBox="0 0 957 536"><image xlink:href="${background}" x="0" y="0" width="957" height="536"/>${overlay}</svg>`;
  const png = new Resvg(svg, { fitTo: { mode: "original" }, font: { loadSystemFonts: true } }).render().asPng();
  return new Uint8Array(png);
}
