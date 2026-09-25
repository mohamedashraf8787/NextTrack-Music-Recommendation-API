import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  detectSessionMood,
  generateJourney,
  recommendNextTracks,
} from "./server/recommendationEngine.js";
import { loadEmbeddedCover, loadLibraryTracks } from "./server/musicLibrary.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, "public");
const musicDir = join(publicDir, "music");
const metadataPath = join(musicDir, "metadata.json");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function serveStatic(requestPath, response) {
  const safePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const normalized = resolve(publicDir, safePath);

  if (!normalized.startsWith(publicDir)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const file = await readFile(normalized);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(normalized)] || "text/plain; charset=utf-8",
    });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

function collectJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Body too large"));
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");

  if (request.method === "GET" && url.pathname === "/api/library") {
    const library = await loadLibraryTracks(publicDir);
    sendJson(response, 200, library);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/cover") {
    try {
      const fileName = url.searchParams.get("file");
      if (!fileName) {
        throw new Error("Missing file parameter");
      }

      const safeFilePath = resolve(musicDir, fileName);
      if (!safeFilePath.startsWith(musicDir)) {
        throw new Error("Invalid file path");
      }

      const cover = await loadEmbeddedCover(publicDir, fileName);
      if (!cover) {
        sendJson(response, 404, { error: "Cover art not found" });
        return;
      }

      response.writeHead(200, {
        "Content-Type": cover.mimeType,
        "Cache-Control": "public, max-age=86400",
      });
      response.end(cover.bytes);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/recommend") {
    try {
      const payload = await collectJsonBody(request);
      const library = await loadLibraryTracks(publicDir);
      const result = recommendNextTracks({
        ...payload,
        catalogue: library.tracks,
      });
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/detect-mood") {
    try {
      const payload = await collectJsonBody(request);
      const library = await loadLibraryTracks(publicDir);
      const result = detectSessionMood({
        ...payload,
        catalogue: library.tracks,
      });
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/journey") {
    try {
      const payload = await collectJsonBody(request);
      const library = await loadLibraryTracks(publicDir);
      const result = generateJourney({
        ...payload,
        catalogue: library.tracks,
      });
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/metadata") {
    try {
      const payload = await collectJsonBody(request);
      const tracks = payload?.tracks;

      if (!tracks || typeof tracks !== "object" || Array.isArray(tracks)) {
        throw new Error("Expected a tracks object keyed by file name");
      }

      const document = {
        generatedAt: new Date().toISOString(),
        generator: "NextTrack local metadata analyzer",
        tracks,
      };

      await writeFile(metadataPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
      sendJson(response, 200, {
        ok: true,
        savedTracks: Object.keys(tracks).length,
        metadataFile: "public/music/metadata.json",
      });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    await serveStatic(url.pathname, response);
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
});

const port = Number(process.env.PORT || 4173);

server.listen(port, () => {
  console.log(`NextTrack prototype running on http://localhost:${port}`);
});
