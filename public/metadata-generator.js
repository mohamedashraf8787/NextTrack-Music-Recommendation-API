const analyzeButton = document.querySelector("#analyze-button");
const downloadButton = document.querySelector("#download-button");
const resultCopy = document.querySelector("#result-copy");
const statusLog = document.querySelector("#status-log");
const summary = document.querySelector("#summary");
const preview = document.querySelector("#preview");

let latestDocument = null;

function logStatus(message) {
  const line = document.createElement("div");
  line.className = "status-line";
  line.textContent = message;
  statusLog.prepend(line);
}

function setSummary(cards) {
  summary.replaceChildren(
    ...cards.map(({ label, value }) => {
      const card = document.createElement("div");
      card.className = "summary-card";
      card.innerHTML = `<strong>${label}</strong><div>${value}</div>`;
      return card;
    })
  );
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanFileStem(fileName) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/\(mp3\.pm\)/gi, "")
    .replace(/\(\d+\)$/g, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function parseFileName(fileName) {
  const stem = cleanFileStem(fileName);
  const byDash = stem.split(/\s+-\s+/);

  if (byDash.length >= 2) {
    return {
      artist: titleCase(byDash[0].trim()),
      title: titleCase(byDash.slice(1).join(" - ").trim()),
    };
  }

  const byMarker = stem.split(/\s{0,2}-_\s{0,2}|_\-_/);
  if (byMarker.length >= 2) {
    return {
      artist: titleCase(byMarker[0].trim()),
      title: titleCase(byMarker.slice(1).join(" - ").trim()),
    };
  }

  return {
    artist: "Unknown Artist",
    title: titleCase(stem),
  };
}

function readSynchsafe(bytes, offset) {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function readUInt32(bytes, offset) {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function decodeTextFrame(frameData) {
  if (!frameData || !frameData.length) {
    return "";
  }

  const encoding = frameData[0];
  const body = frameData.slice(1);

  if (!body.length) {
    return "";
  }

  try {
    if (encoding === 0) {
      return new TextDecoder("latin1").decode(body).replace(/\0/g, "").trim();
    }

    if (encoding === 3) {
      return new TextDecoder("utf-8").decode(body).replace(/\0/g, "").trim();
    }

    if (encoding === 1 || encoding === 2) {
      let view = body;
      let decoder = "utf-16";

      if (encoding === 1 && body.length >= 2) {
        if (body[0] === 0xff && body[1] === 0xfe) {
          decoder = "utf-16le";
          view = body.slice(2);
        } else if (body[0] === 0xfe && body[1] === 0xff) {
          decoder = "utf-16be";
          view = body.slice(2);
        }
      }

      return new TextDecoder(decoder).decode(view).replace(/\0/g, "").trim();
    }
  } catch {
    return "";
  }

  return "";
}

function parseId3v2(bytes) {
  if (bytes.length < 10 || String.fromCharCode(...bytes.slice(0, 3)) !== "ID3") {
    return {};
  }

  const version = bytes[3];
  const tagSize = readSynchsafe(bytes, 6);
  const tags = {};
  let offset = 10;

  while (offset + 10 <= bytes.length && offset < tagSize + 10) {
    const frameId = String.fromCharCode(...bytes.slice(offset, offset + 4));
    if (!/^[A-Z0-9]{4}$/.test(frameId)) {
      break;
    }

    const frameSize = version === 4 ? readSynchsafe(bytes, offset + 4) : readUInt32(bytes, offset + 4);
    if (!frameSize || offset + 10 + frameSize > bytes.length) {
      break;
    }

    const frameData = bytes.slice(offset + 10, offset + 10 + frameSize);
    const textValue = decodeTextFrame(frameData);

    if (frameId === "TIT2" && textValue) tags.title = textValue;
    if (frameId === "TPE1" && textValue) tags.artist = textValue;
    if (frameId === "TALB" && textValue) tags.album = textValue;
    if (frameId === "TCON" && textValue) tags.genre = textValue;
    if ((frameId === "TYER" || frameId === "TDRC") && textValue) tags.year = textValue.slice(0, 4);

    offset += 10 + frameSize;
  }

  return tags;
}

function parseId3v1(bytes) {
  if (bytes.length < 128) {
    return {};
  }

  const tagStart = bytes.length - 128;
  if (String.fromCharCode(...bytes.slice(tagStart, tagStart + 3)) !== "TAG") {
    return {};
  }

  const decode = (start, length) =>
    new TextDecoder("latin1")
      .decode(bytes.slice(start, start + length))
      .replace(/\0/g, "")
      .trim();

  return {
    title: decode(tagStart + 3, 30),
    artist: decode(tagStart + 33, 30),
    album: decode(tagStart + 63, 30),
    year: decode(tagStart + 93, 4),
  };
}

function inferGenre(text, bpm, energy) {
  const lower = text.toLowerCase();

  if (/(symphony|beethoven|schubert|serenade|isaac stern|allegretto|op\.)/.test(lower)) {
    return { genres: ["classical"], genreSource: "filename heuristic" };
  }

  if (/(remix|dj|zhu|duke dumont|ocean drive|sound like who)/.test(lower)) {
    return { genres: ["electronic"], genreSource: "filename heuristic" };
  }

  if (/(sinatra|tom jones|bang bang|my way|ain t no sunshine)/.test(lower)) {
    return { genres: ["vocal", "classic pop"], genreSource: "filename heuristic" };
  }

  if (/(architects|deep purple|imagine dragons|coldplay|three days grace)/.test(lower)) {
    return { genres: ["rock"], genreSource: "filename heuristic" };
  }

  if (bpm > 118 && energy > 65) {
    return { genres: ["pop"], genreSource: "audio heuristic" };
  }

  return { genres: ["mixed"], genreSource: "fallback" };
}

function extractTrackInfo(fileName, bytes) {
  const fileInfo = parseFileName(fileName);
  const v2 = parseId3v2(bytes);
  const v1 = parseId3v1(bytes);

  return {
    title: v2.title || v1.title || fileInfo.title,
    artist: v2.artist || v1.artist || fileInfo.artist,
    album: v2.album || v1.album || "",
    genre: v2.genre || "",
    year: v2.year || v1.year || "",
  };
}

function toMono(audioBuffer) {
  const channelCount = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const mono = new Float32Array(length);

  for (let channel = 0; channel < channelCount; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      mono[index] += data[index] / channelCount;
    }
  }

  return mono;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function buildRmsEnvelope(samples, frameSize = 2048, hopSize = 512) {
  const envelope = [];

  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    let sumSquares = 0;
    let zeroCrossings = 0;
    let absDiffSum = 0;

    for (let index = 0; index < frameSize; index += 1) {
      const current = samples[start + index];
      sumSquares += current * current;

      if (index > 0) {
        const previous = samples[start + index - 1];
        if ((previous >= 0 && current < 0) || (previous < 0 && current >= 0)) {
          zeroCrossings += 1;
        }
        absDiffSum += Math.abs(current - previous);
      }
    }

    envelope.push({
      rms: Math.sqrt(sumSquares / frameSize),
      zcr: zeroCrossings / frameSize,
      diff: absDiffSum / frameSize,
    });
  }

  return envelope;
}

function smoothSeries(values, radius = 4) {
  return values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length, index + radius + 1);
    return average(values.slice(start, end));
  });
}

function estimateTempo(onset, frameRate) {
  if (!onset.length) {
    return 100;
  }

  const minBpm = 60;
  const maxBpm = 180;
  const minLag = Math.max(1, Math.round((frameRate * 60) / maxBpm));
  const maxLag = Math.max(minLag + 1, Math.round((frameRate * 60) / minBpm));

  let bestLag = minLag;
  let bestScore = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let score = 0;
    for (let index = lag; index < onset.length; index += 1) {
      score += onset[index] * onset[index - lag];
    }

    const weight = 1 - Math.abs(120 - (60 * frameRate) / lag) / 120;
    score *= 0.7 + clamp(weight, 0, 1) * 0.3;

    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  return clamp(Math.round((60 * frameRate) / bestLag), minBpm, maxBpm);
}

function inferMoods(energy, valence) {
  const moods = [];

  if (energy < 34 && valence < 42) {
    moods.push("melancholic");
  } else if (energy < 40) {
    moods.push("calm");
  }

  if (energy >= 38 && energy <= 68 && valence <= 58) {
    moods.push("focused");
  }

  if (valence >= 62 && energy >= 52) {
    moods.push("uplifting");
  }

  if (energy >= 72) {
    moods.push("energetic");
  }

  if (valence >= 55 && valence < 72 && energy < 70) {
    moods.push("warm");
  }

  if (!moods.length) {
    moods.push(energy >= 55 ? "focused" : "calm");
  }

  return [...new Set(moods)].slice(0, 2);
}

async function analyzeAudioFeatures(arrayBuffer) {
  const context = new AudioContext();

  try {
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    const mono = toMono(decoded);
    const frameSize = 2048;
    const hopSize = 512;
    const envelope = buildRmsEnvelope(mono, frameSize, hopSize);
    const rmsValues = envelope.map((frame) => frame.rms);
    const smoothRms = smoothSeries(rmsValues, 5);
    const onset = smoothRms.map((value, index) => Math.max(0, value - (smoothRms[index - 1] || value)));
    const frameRate = decoded.sampleRate / hopSize;
    let tempo = estimateTempo(onset, frameRate);

    const avgRms = average(rmsValues);
    const avgZcr = average(envelope.map((frame) => frame.zcr));
    const avgDiff = average(envelope.map((frame) => frame.diff));
    let energyNorm = clamp(((avgRms - 0.015) / 0.18) * 100, 1, 100);

    if (tempo < 80 && energyNorm > 52) {
      tempo = clamp(tempo * 2, 40, 180);
    }

    if (tempo > 145 && energyNorm < 42) {
      tempo = Math.round(tempo / 2);
    }

    const brightnessNorm = clamp(((avgZcr * 3.2 + avgDiff * 5.5) / 1.4) * 100, 1, 100);
    const tempoNorm = clamp(((tempo - 60) / 120) * 100, 1, 100);
    energyNorm = clamp(Math.round(energyNorm), 1, 100);
    const valence = clamp(Math.round(0.42 * energyNorm + 0.28 * brightnessNorm + 0.3 * tempoNorm), 1, 100);
    const loudness = clamp(20 * Math.log10(avgRms || 0.0001), -60, 0);

    return {
      duration: Math.round(decoded.duration),
      tempo,
      energy: energyNorm,
      valence,
      loudness: Number(loudness.toFixed(2)),
      brightness: Math.round(brightnessNorm),
      moods: inferMoods(energyNorm, valence),
    };
  } finally {
    await context.close();
  }
}

function baseProfileForGenres(genres) {
  const primary = genres[0] || "mixed";

  if (primary === "classical") {
    return { tempo: 74, energy: 24, valence: 38, brightness: 32, loudness: -22 };
  }

  if (primary === "electronic") {
    return { tempo: 124, energy: 78, valence: 66, brightness: 74, loudness: -9 };
  }

  if (primary === "rock") {
    return { tempo: 118, energy: 72, valence: 57, brightness: 69, loudness: -8 };
  }

  if (primary === "vocal") {
    return { tempo: 92, energy: 42, valence: 56, brightness: 46, loudness: -16 };
  }

  return { tempo: 100, energy: 50, valence: 50, brightness: 50, loudness: -14 };
}

function fallbackAudioFeatures(fileName, genres, duration = 0) {
  const profile = baseProfileForGenres(genres);
  const titleText = fileName.toLowerCase();

  if (/remix|night|ocean drive|faded/.test(titleText)) {
    profile.tempo += 6;
    profile.energy += 6;
  }

  if (/symphony|serenade|my way|bang bang/.test(titleText)) {
    profile.tempo -= 10;
    profile.energy -= 8;
  }

  const energy = clamp(Math.round(profile.energy), 1, 100);
  const valence = clamp(Math.round(profile.valence), 1, 100);

  return {
    duration: Math.round(duration || 0),
    tempo: clamp(Math.round(profile.tempo), 40, 220),
    energy,
    valence,
    loudness: profile.loudness,
    brightness: clamp(Math.round(profile.brightness), 1, 100),
    moods: inferMoods(energy, valence),
  };
}

function loadDurationFromElement(audioUrl) {
  return new Promise((resolve) => {
    const element = document.createElement("audio");
    element.preload = "metadata";
    element.src = audioUrl;

    const finish = (duration) => {
      element.removeAttribute("src");
      element.load();
      resolve(Number.isFinite(duration) ? Math.round(duration) : 0);
    };

    element.addEventListener("loadedmetadata", () => finish(element.duration), { once: true });
    element.addEventListener("error", () => finish(0), { once: true });
  });
}

function normalizeGenreValue(value) {
  if (!value) {
    return [];
  }

  return value
    .replace(/\(\d+\)/g, "")
    .split(/[;/,]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 2);
}

async function analyzeTrack(track) {
  logStatus(`Analyzing ${track.sourceFile}`);
  const response = await fetch(track.audioUrl);
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const tagInfo = extractTrackInfo(track.sourceFile, bytes);
  const durationFromElement = await loadDurationFromElement(track.audioUrl);
  const genreTags = normalizeGenreValue(tagInfo.genre);
  const seedGenreInfo = genreTags.length
    ? { genres: genreTags, genreSource: "embedded tag" }
    : inferGenre(`${track.sourceFile} ${tagInfo.artist} ${tagInfo.title}`, 100, 50);

  let audioInfo;
  let analysisSource;

  try {
    audioInfo = await analyzeAudioFeatures(arrayBuffer);
    analysisSource = "Web Audio API + custom JavaScript heuristics";
  } catch (error) {
    logStatus(`Decode fallback used for ${track.sourceFile}`);
    audioInfo = fallbackAudioFeatures(track.sourceFile, seedGenreInfo.genres, durationFromElement);
    analysisSource = "Filename/tag heuristic fallback";
  }

  if (!audioInfo.duration && durationFromElement) {
    audioInfo.duration = durationFromElement;
  }

  const genreInfo = genreTags.length
    ? { genres: genreTags, genreSource: "embedded tag" }
    : inferGenre(`${track.sourceFile} ${tagInfo.artist} ${tagInfo.title}`, audioInfo.tempo, audioInfo.energy);

  return {
    [track.sourceFile]: {
      id: slugify(`${tagInfo.artist}-${tagInfo.title}`),
      title: tagInfo.title,
      artist: tagInfo.artist,
      album: tagInfo.album,
      year: tagInfo.year,
      genres: genreInfo.genres,
      genreSource: genreInfo.genreSource,
      moods: audioInfo.moods,
      energy: audioInfo.energy,
      valence: audioInfo.valence,
      tempo: audioInfo.tempo,
      duration: audioInfo.duration,
      key: "Unknown",
      loudness: audioInfo.loudness,
      brightness: audioInfo.brightness,
      analysisSource,
    },
  };
}

async function saveMetadata(document) {
  return fetchJson("/api/metadata", {
    method: "POST",
    body: JSON.stringify(document),
  });
}

async function analyzeLibrary() {
  analyzeButton.disabled = true;
  downloadButton.disabled = true;
  resultCopy.textContent = "Analyzing songs...";
  statusLog.replaceChildren();

  try {
    const library = await fetchJson("/api/library");
    if (!library.tracks.length) {
      throw new Error("No audio files were found in public/music.");
    }

    logStatus(`Found ${library.tracks.length} songs.`);

    const tracks = {};
    for (const track of library.tracks) {
      const result = await analyzeTrack(track);
      Object.assign(tracks, result);
    }

    const document = { tracks };
    const saveResult = await saveMetadata(document);
    latestDocument = {
      generatedAt: new Date().toISOString(),
      tracks,
    };

    preview.textContent = JSON.stringify(latestDocument, null, 2);
    resultCopy.textContent = `Saved ${saveResult.savedTracks} tracks to ${saveResult.metadataFile}.`;
    downloadButton.disabled = false;

    const tempos = Object.values(tracks).map((track) => track.tempo);
    const energies = Object.values(tracks).map((track) => track.energy);
    const valences = Object.values(tracks).map((track) => track.valence);

    setSummary([
      { label: "Songs analyzed", value: String(Object.keys(tracks).length) },
      { label: "Average BPM", value: String(Math.round(average(tempos))) },
      { label: "Average energy", value: `${Math.round(average(energies))}/100` },
      { label: "Average valence", value: `${Math.round(average(valences))}/100` },
    ]);

    logStatus(`Saved metadata to ${saveResult.metadataFile}`);
  } catch (error) {
    console.error(error);
    resultCopy.textContent = "Analysis failed.";
    logStatus(`Error: ${error.message}`);
  } finally {
    analyzeButton.disabled = false;
  }
}

function downloadPreview() {
  if (!latestDocument) {
    return;
  }

  const blob = new Blob([JSON.stringify(latestDocument, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "metadata-preview.json";
  link.click();
  URL.revokeObjectURL(url);
}

analyzeButton.addEventListener("click", analyzeLibrary);
downloadButton.addEventListener("click", downloadPreview);
