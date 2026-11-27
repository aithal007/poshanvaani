// PoshanVaani server: serves the built web app and a tiny API.
// No dependencies. Starts without any secret keys.
//
//   GET  /api/config  which optional engines are configured
//   POST /api/stt     Sarvam speech-to-text proxy   (501 "key not set" without SARVAM_API_KEY)
//   POST /api/tts     Sarvam text-to-speech proxy   (501 "key not set" without SARVAM_API_KEY)
//   POST /api/sync    receives queued readings (demo stand-in for Poshan Tracker upload)
//   GET  /api/health
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 8080);
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? join(fileURLToPath(new URL(".", import.meta.url)), "..", "web", "dist"));
const SARVAM_KEY = process.env.SARVAM_API_KEY?.trim() || "";
const SARVAM_BASE = process.env.SARVAM_BASE_URL ?? "https://api.sarvam.ai";
const STT_MODEL = process.env.SARVAM_STT_MODEL ?? "saaras:v3";
const TTS_MODEL = process.env.SARVAM_TTS_MODEL ?? "bulbul:v2";
const TTS_SPEAKER = process.env.SARVAM_TTS_SPEAKER ?? "anushka";
const MAX_BODY = 8 * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const synced = { batches: 0, readings: 0, last: null };

function send(res, status, body, headers = {}) {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": typeof body === "object" && !Buffer.isBuffer(body) ? "application/json" : "text/plain; charset=utf-8",
    ...headers,
  });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("body too large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const keyNotSet = (res) => send(res, 501, { error: "key not set", detail: "Set SARVAM_API_KEY to enable Sarvam speech. Browser speech works without it." });

async function stt(req, res) {
  if (!SARVAM_KEY) return keyNotSet(res);
  // Re-read the browser's multipart form and forward the audio to Sarvam.
  const body = await readBody(req);
  const incoming = await new Response(body, { headers: { "content-type": req.headers["content-type"] ?? "" } }).formData();
  const file = incoming.get("file");
  if (!(file instanceof Blob)) return send(res, 400, { error: "missing audio file" });
  const form = new FormData();
  form.append("file", file, "speech.webm");
  form.append("model", STT_MODEL);
  form.append("language_code", String(incoming.get("language_code") ?? "unknown"));
  if (STT_MODEL.startsWith("saaras")) form.append("mode", "codemix");
  const r = await fetch(`${SARVAM_BASE}/speech-to-text`, {
    method: "POST",
    headers: { "api-subscription-key": SARVAM_KEY },
    body: form,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) return send(res, r.status, { error: "sarvam stt failed", detail: json });
  send(res, 200, { transcript: json.transcript ?? "", language_code: json.language_code });
}

async function tts(req, res) {
  if (!SARVAM_KEY) return keyNotSet(res);
  const { text, language_code } = JSON.parse((await readBody(req)).toString("utf8") || "{}");
  if (!text) return send(res, 400, { error: "missing text" });
  const r = await fetch(`${SARVAM_BASE}/text-to-speech`, {
    method: "POST",
    headers: { "api-subscription-key": SARVAM_KEY, "content-type": "application/json" },
    body: JSON.stringify({ text: String(text).slice(0, 1500), target_language_code: language_code ?? "hi-IN", model: TTS_MODEL, speaker: TTS_SPEAKER }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json.audios?.[0]) return send(res, r.ok ? 502 : r.status, { error: "sarvam tts failed", detail: json });
  send(res, 200, { audio: json.audios[0] });
}

async function sync(req, res) {
  const rows = JSON.parse((await readBody(req)).toString("utf8") || "[]");
  if (!Array.isArray(rows)) return send(res, 400, { error: "expected an array of readings" });
  synced.batches++;
  synced.readings += rows.length;
  synced.last = new Date().toISOString();
  send(res, 200, { received: rows.length, total: synced.readings });
}

async function serveStatic(req, res) {
  const url = new URL(req.url ?? "/", "http://localhost");
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  let file = resolve(STATIC_DIR, path || "index.html");
  if (!file.startsWith(STATIC_DIR)) return send(res, 403, "forbidden");
  try {
    if (!(await stat(file)).isFile()) throw new Error("dir");
  } catch {
    file = join(STATIC_DIR, "index.html"); // single-page app fallback
    path = "index.html";
  }
  try {
    const data = await readFile(file);
    const immutable = path.startsWith("assets/");
    send(res, 200, data, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    });
  } catch {
    send(res, 404, "Not found. Build the web app first: cd web && npm run build");
  }
}

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname === "/api/health") return send(res, 200, { ok: true });
    if (pathname === "/api/config") return send(res, 200, { sarvam: !!SARVAM_KEY, sttModel: STT_MODEL, ttsModel: TTS_MODEL, synced });
    if (pathname === "/api/stt" && req.method === "POST") return await stt(req, res);
    if (pathname === "/api/tts" && req.method === "POST") return await tts(req, res);
    if (pathname === "/api/sync" && req.method === "POST") return await sync(req, res);
    if (pathname.startsWith("/api/")) return send(res, 404, { error: "unknown endpoint" });
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "method not allowed");
    return await serveStatic(req, res);
  } catch (err) {
    send(res, err.status ?? 500, { error: err.message ?? "server error" });
  }
});

server.listen(PORT, () => {
  console.log(`PoshanVaani on http://localhost:${PORT}  (Sarvam: ${SARVAM_KEY ? "enabled" : "key not set, using browser speech"})`);
});
