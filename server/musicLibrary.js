import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const audioExtensions = new Set([".mp3", ".wav", ".m4a", ".ogg"]);

function readSynchsafe(buffer, offset) {
  return (
    ((buffer[offset] & 0x7f) << 21) |
    ((buffer[offset + 1] & 0x7f) << 14) |
    ((buffer[offset + 2] & 0x7f) << 7) |
    (buffer[offset + 3] & 0x7f)
  );
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function findUtf16Terminator(buffer, start) {
  for (let index = start; index + 1 < buffer.length; index += 2) {
    if (buffer[index] === 0x00 && buffer[index + 1] === 0x00) {
      return index;
    }
  }
  return -1;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleFromFileName(fileName) {
  return fileName
    .replace(extname(fileName), "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeList(value, fallback) {
  if (Array.isArray(value) && value.length) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return fallback;
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

function normalizeTrackMetadata(fileName, metadata = {}) {
  const title = metadata.title?.trim() || titleFromFileName(fileName);
  const artist = metadata.artist?.trim() || "Unknown Artist";

  return {
    id: metadata.id?.trim() || slugify(`${artist}-${title}`),
    title,
    artist,
    genres: normalizeList(metadata.genres, ["mixed"]),
    moods: normalizeList(metadata.moods, ["calm"]),
    energy: clampNumber(metadata.energy, 50, 1, 100),
    valence: clampNumber(metadata.valence, 50, 1, 100),
    tempo: clampNumber(metadata.tempo, 100, 40, 220),
    key: metadata.key?.trim() || "Unknown",
    duration: clampNumber(metadata.duration, 0, 0, 7200),
    album: metadata.album?.trim() || "",
    year: metadata.year?.trim() || "",
    genreSource: metadata.genreSource?.trim() || "",
    analysisSource: metadata.analysisSource?.trim() || "",
    loudness: clampNumber(metadata.loudness, 0, -60, 0),
    brightness: clampNumber(metadata.brightness, 50, 1, 100),
  };
}

async function loadMetadataMap(musicDir) {
  const metadataPath = join(musicDir, "metadata.json");

  try {
    const raw = await readFile(metadataPath, "utf8");
    const parsed = JSON.parse(raw);
    const source =
      parsed && typeof parsed === "object" && parsed.tracks && typeof parsed.tracks === "object"
        ? parsed.tracks
        : parsed;

    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return new Map();
    }

    const metadataMap = new Map();
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === "object") {
        metadataMap.set(key, value);
        metadataMap.set(slugify(key.replace(extname(key), "")), value);
      }
    }
    return metadataMap;
  } catch {
    return new Map();
  }
}

export async function loadEmbeddedCover(publicDir, fileName) {
  const filePath = join(publicDir, "music", fileName);
  const bytes = await readFile(filePath);

  if (bytes.length < 10 || bytes.toString("latin1", 0, 3) !== "ID3") {
    return null;
  }

  const version = bytes[3];
  const tagSize = readSynchsafe(bytes, 6);
  let offset = 10;

  while (offset + 10 <= bytes.length && offset < tagSize + 10) {
    const frameId = bytes.toString("latin1", offset, offset + 4);
    if (!/^[A-Z0-9]{4}$/.test(frameId)) {
      break;
    }

    const frameSize = version === 4 ? readSynchsafe(bytes, offset + 4) : readUInt32(bytes, offset + 4);
    if (!frameSize || offset + 10 + frameSize > bytes.length) {
      break;
    }

    if (frameId === "APIC") {
      const frame = bytes.subarray(offset + 10, offset + 10 + frameSize);
      const encoding = frame[0];
      const mimeEnd = frame.indexOf(0x00, 1);
      if (mimeEnd === -1) {
        return null;
      }

      const mimeType = frame.toString("latin1", 1, mimeEnd).trim() || "image/jpeg";
      let cursor = mimeEnd + 1;
      cursor += 1;

      if (encoding === 0 || encoding === 3) {
        const descriptionEnd = frame.indexOf(0x00, cursor);
        cursor = descriptionEnd === -1 ? cursor : descriptionEnd + 1;
      } else {
        const descriptionEnd = findUtf16Terminator(frame, cursor);
        cursor = descriptionEnd === -1 ? cursor : descriptionEnd + 2;
      }

      const imageBytes = frame.subarray(cursor);
      if (!imageBytes.length || !mimeType.startsWith("image/")) {
        return null;
      }

      return {
        mimeType,
        bytes: Buffer.from(imageBytes),
      };
    }

    offset += 10 + frameSize;
  }

  return null;
}

export async function loadLibraryTracks(publicDir) {
  const musicDir = join(publicDir, "music");

  let fileEntries = [];
  try {
    fileEntries = await readdir(musicDir, { withFileTypes: true });
  } catch {
    fileEntries = [];
  }

  const audioFiles = fileEntries
    .filter((entry) => entry.isFile() && audioExtensions.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const metadataMap = await loadMetadataMap(musicDir);

  const tracks = audioFiles.map((fileName) => {
    const key = slugify(fileName.replace(extname(fileName), ""));
    const metadata = metadataMap.get(fileName) || metadataMap.get(key) || {};
    const normalized = normalizeTrackMetadata(fileName, metadata);

    return {
      ...normalized,
      audioUrl: `/music/${encodeURIComponent(fileName)}`,
      coverArtUrl: `/api/cover?file=${encodeURIComponent(fileName)}`,
      available: true,
      sourceFile: fileName,
    };
  });

  return {
    tracks,
    hasAudioFiles: tracks.length > 0,
    musicFolder: "public/music",
    metadataFile: "public/music/metadata.json",
  };
}
