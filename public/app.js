const state = {
  tracks: [],
  hasAudioFiles: false,
  searchQuery: "",
  sessionIds: [],
  currentTrackId: null,
  currentMood: "calm",
  targetMood: "uplifting",
  transitionIntensity: "medium",
  recommendations: [],
  passiveSuggestion: null,
  isPlaying: false,
};

const moodOptions = ["calm", "focused", "uplifting", "energetic", "melancholic", "warm"];
const intensityToSteps = {
  low: 3,
  medium: 4,
  high: 6,
};

const audio = document.querySelector("#audio-player");
const queueSummary = document.querySelector("#queue-summary");
const sessionList = document.querySelector("#session-list");
const recommendationCopy = document.querySelector("#recommendation-copy");
const nowPlaying = document.querySelector("#now-playing");
const recommendations = document.querySelector("#recommendations");
const library = document.querySelector("#library");
const miniPlayer = document.querySelector("#mini-player");
const passiveSuggestion = document.querySelector("#passive-suggestion");
const suggestionTitle = document.querySelector("#suggestion-title");
const suggestionMessage = document.querySelector("#suggestion-message");
const libraryCaption = document.querySelector("#library-caption");
const queueCaption = document.querySelector("#queue-caption");
const searchInput = document.querySelector("#library-search");
const journeyDialog = document.querySelector("#journey-dialog");
const journeyCurrent = document.querySelector("#journey-current");
const journeyTarget = document.querySelector("#journey-target");
const journeyIntensity = document.querySelector("#journey-intensity");

function trackById(id) {
  return state.tracks.find((track) => track.id === id);
}

function queueTracks() {
  return state.sessionIds.map(trackById).filter(Boolean);
}

function currentTrack() {
  return trackById(state.currentTrackId) || null;
}

function isTrackQueued(trackId) {
  return state.sessionIds.includes(trackId);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function trackLength(track) {
  if (track?.duration) {
    return track.duration;
  }
  return Math.round((track.tempo + track.energy + track.valence) * 1.55);
}

function artStyle(track) {
  const warm = Math.min(255, 120 + (track?.valence || 50));
  const cool = Math.min(255, 90 + (track?.energy || 50));
  const dark = Math.max(30, 90 - Math.floor((track?.energy || 50) / 2));
  return `background:
    radial-gradient(circle at 26% 24%, rgba(${warm}, 208, 119, 0.62), transparent 22%),
    radial-gradient(circle at 72% 30%, rgba(177, 160, ${cool}, 0.45), transparent 22%),
    linear-gradient(180deg, rgba(58, 29, 54, 1), rgba(${dark}, 19, 26, 1));`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function coverMarkup(track, className = "cover") {
  const image = track?.coverArtUrl
    ? `<img src="${track.coverArtUrl}" alt="" loading="lazy" onerror="this.remove()" />`
    : "";

  return `<div class="${className}" style="${artStyle(track)}">${image}</div>`;
}

function buildPathPoints(tracks) {
  return tracks.map((track) => {
    const x = 18 + ((track.valence || 50) / 100) * 264;
    const y = 142 - ((track.energy || 50) / 100) * 114;
    return {
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
      title: track.title,
      energy: track.energy || 0,
      valence: track.valence || 0,
    };
  });
}

function pointsToPath(points) {
  if (!points.length) {
    return "";
  }
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function renderJourneyChart() {
  const sessionTracks = queueTracks();
  const sessionPoints = buildPathPoints(sessionTracks);
  const journeyTracks = state.transitionIntensity && state.targetMood && state.recommendations.length
    ? state.recommendations
    : [];
  const journeyPoints = buildPathPoints(journeyTracks);
  const showJourney = journeyTracks.length > 0 && recommendationCopy.textContent.toLowerCase().includes("journey");
  const currentPath = pointsToPath(sessionPoints);
  const journeyPath = showJourney ? pointsToPath(journeyPoints) : "";

  if (!sessionPoints.length) {
    return "";
  }

  return `
    <section class="journey-plot">
      <div class="plot-head">
        <div>
          <h3>Energy / valence path</h3>
          <p>${showJourney ? "Current session and generated mood journey." : "Current session path based on the queued songs."}</p>
        </div>
        <div class="plot-legend">
          <span><i class="legend-dot current"></i>Session</span>
          ${showJourney ? '<span><i class="legend-dot target"></i>Journey</span>' : ""}
        </div>
      </div>
      <svg class="plot-canvas" viewBox="0 0 300 160" aria-label="Energy and valence path chart" role="img">
        <defs>
          <linearGradient id="session-line" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#ffcf73"></stop>
            <stop offset="100%" stop-color="#ff9f1f"></stop>
          </linearGradient>
          <linearGradient id="journey-line" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#73e6b6"></stop>
            <stop offset="100%" stop-color="#4db0ff"></stop>
          </linearGradient>
        </defs>
        <rect x="18" y="18" width="264" height="124" rx="16" class="plot-frame"></rect>
        <line x1="18" y1="80" x2="282" y2="80" class="plot-grid"></line>
        <line x1="150" y1="18" x2="150" y2="142" class="plot-grid"></line>
        <text x="20" y="14" class="plot-axis-label">high energy</text>
        <text x="20" y="156" class="plot-axis-label">calm</text>
        <text x="18" y="154" class="plot-corner-label">low valence</text>
        <text x="224" y="154" class="plot-corner-label">uplifting</text>
        ${currentPath ? `<path d="${currentPath}" class="plot-line current-line"></path>` : ""}
        ${showJourney && journeyPath ? `<path d="${journeyPath}" class="plot-line journey-line"></path>` : ""}
        ${sessionPoints
          .map(
            (point, index) => `
              <g>
                <circle cx="${point.x}" cy="${point.y}" r="${index === sessionPoints.length - 1 ? 6 : 4.5}" class="plot-point current-point"></circle>
                <title>${escapeHtml(point.title)} | energy ${point.energy} | valence ${point.valence}</title>
              </g>
            `
          )
          .join("")}
        ${showJourney
          ? journeyPoints
              .map(
                (point) => `
                  <g>
                    <circle cx="${point.x}" cy="${point.y}" r="4" class="plot-point journey-point"></circle>
                    <title>${escapeHtml(point.title)} | energy ${point.energy} | valence ${point.valence}</title>
                  </g>
                `
              )
              .join("")
          : ""}
      </svg>
    </section>
  `;
}

function playerSnapshot() {
  const track = currentTrack();
  if (!track) {
    return {
      track: null,
      duration: 0,
      currentTime: 0,
      progress: 0,
    };
  }

  const duration = audio.duration && Number.isFinite(audio.duration) ? audio.duration : trackLength(track);
  const currentTime = Math.min(audio.currentTime || 0, duration);
  const progress = duration ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

  return {
    track,
    duration,
    currentTime,
    progress,
  };
}

function renderQueueSummary() {
  const tracks = queueTracks();
  const totalTime = tracks.reduce((sum, track) => sum + trackLength(track), 0);
  queueSummary.innerHTML = tracks.length
    ? `
      <span class="summary-pill strong">${tracks.length} tracks</span>
      <span class="summary-pill">${formatTime(totalTime)}</span>
      <span class="summary-pill">${
        tracks.length >= 3 ? state.passiveSuggestion?.detectedMood || state.currentMood : `${tracks.length}/3 for mood detection`
      }</span>
    `
    : "";
}

function renderQueue() {
  const tracks = queueTracks();
  if (!tracks.length) {
    sessionList.className = "queue-list empty-state";
    sessionList.textContent = "Add songs from your library to build your listening queue.";
    return;
  }

  sessionList.className = "queue-list";
  sessionList.replaceChildren(
    ...tracks.map((track) => {
      const item = document.createElement("article");
      item.className = `queue-item${track.id === state.currentTrackId ? " active" : ""}`;
      item.innerHTML = `
        ${coverMarkup(track)}
        <div class="queue-main">
          <div class="song-title">${track.title}</div>
          <div class="song-meta">
            <span>${track.artist}</span>
            <span>${formatTime(trackLength(track))}</span>
          </div>
        </div>
        <button class="queue-remove" type="button" data-remove="${track.id}">Remove</button>
      `;

      item.addEventListener("click", (event) => {
        if (event.target.closest("[data-remove]")) {
          return;
        }
        setCurrentTrack(track.id, false);
      });

      item.querySelector("[data-remove]").addEventListener("click", async () => {
        state.sessionIds = state.sessionIds.filter((value) => value !== track.id);
        if (state.currentTrackId === track.id) {
          state.currentTrackId = state.sessionIds.at(-1) || state.tracks[0]?.id || null;
        }
        await refreshDerivedState();
      });

      return item;
    })
  );
}

function clearAudioSource() {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  state.isPlaying = false;
}

function setCurrentTrack(trackId, autoplay = false) {
  state.currentTrackId = trackId;
  const track = currentTrack();

  if (!track?.audioUrl) {
    clearAudioSource();
    renderNowPlaying();
    renderMiniPlayer();
    renderQueue();
    return;
  }

  const nextUrl = new URL(track.audioUrl, window.location.origin).href;
  const sourceChanged = audio.src !== nextUrl;

  if (sourceChanged) {
    audio.src = track.audioUrl;
    audio.currentTime = 0;
  }

  if (autoplay) {
    audio.play().catch(() => {});
  } else {
    audio.pause();
    state.isPlaying = false;
  }

  renderNowPlaying();
  renderMiniPlayer();
  renderQueue();
}

function renderNowPlaying() {
  const { track, duration, currentTime, progress } = playerSnapshot();

  if (!track) {
    nowPlaying.innerHTML = `
      <div class="hero-empty">
        Pick a song from your library to start listening.
      </div>
    `;
    return;
  }

  const queueState = isTrackQueued(track.id);
  const badgeText = state.isPlaying ? "Playing now" : queueState ? "Queued up" : "Ready to play";

  nowPlaying.innerHTML = `
    ${coverMarkup(track, "art-cover")}
    <div class="player-copy">
      <div class="badge">${badgeText}</div>
      <div class="hero-copy">
        <h2 class="player-title">${track.title}</h2>
        <p class="player-artist">${track.artist}</p>
      </div>
      <div class="tag-row">
        ${(track.moods || []).map((mood) => `<span class="tag">${mood}</span>`).join("")}
        ${(track.genres || []).slice(0, 2).map((genre) => `<span class="tag">${genre}</span>`).join("")}
      </div>
      <div class="progress-block">
        <div class="progress-line">
          <div class="progress-fill" style="width:${progress}%"></div>
        </div>
        <div class="time-row">
          <span>${formatTime(currentTime)}</span>
          <span>${formatTime(duration)}</span>
        </div>
      </div>
      <div class="hero-actions">
        <button id="hero-play-toggle" class="primary-button${track.audioUrl ? "" : " disabled"}" type="button">
          ${state.isPlaying ? "Pause" : "Play"}
        </button>
        <button id="hero-add-track" class="secondary-button${queueState ? " disabled" : ""}" type="button">
          ${queueState ? "In queue" : "Add to queue"}
        </button>
        <button id="open-journey-player" class="ghost-button" type="button">Mood journey</button>
      </div>
      <p class="helper-copy">
        ${track.audioUrl
          ? "Keep listening normally, then use Mood journey when you want the music to move somewhere new."
          : "Add an audio file for this track to start playback."}
      </p>
      ${renderJourneyChart()}
    </div>
  `;

  const heroToggle = nowPlaying.querySelector("#hero-play-toggle");
  if (heroToggle && track.audioUrl) {
    heroToggle.addEventListener("click", togglePlayback);
  }

  const addButton = nowPlaying.querySelector("#hero-add-track");
  if (addButton && !queueState) {
    addButton.addEventListener("click", async () => {
      addTrackToQueue(track.id, false);
    });
  }

  nowPlaying.querySelector("#open-journey-player").addEventListener("click", openJourneyDialog);
}

function renderMiniPlayer() {
  const { track, duration, currentTime, progress } = playerSnapshot();

  if (!track) {
    miniPlayer.className = "mini-player panel empty";
    miniPlayer.innerHTML = `<div class="status-line">Pick a song from your library to start listening.</div>`;
    return;
  }

  miniPlayer.className = "mini-player panel";
  miniPlayer.innerHTML = `
    <div class="mini-track">
      ${coverMarkup(track, "cover mini-cover")}
      <div class="mini-track-copy">
        <div class="mini-title">${track.title}</div>
        <div class="mini-artist">${track.artist}</div>
      </div>
    </div>
    <div class="mini-controls">
      <button id="prev-track" class="transport${state.sessionIds.indexOf(track.id) <= 0 ? " disabled" : ""}" type="button" aria-label="Previous">
        <svg viewBox="0 0 24 24">
          <rect x="5" y="6" width="2.2" height="12" rx="1.1"></rect>
          <path d="M18 6.6V17.4C18 18.1 17.2 18.5 16.6 18.1L9.4 13.2C8.9 12.8 8.9 12.1 9.4 11.8L16.6 5.9C17.2 5.5 18 5.9 18 6.6Z"></path>
        </svg>
      </button>
      <button id="play-toggle" class="transport${track.audioUrl ? "" : " disabled"}" type="button" aria-label="Play or pause">
        <svg viewBox="0 0 24 24">
          ${
            state.isPlaying
              ? '<rect x="7.2" y="6" width="3.2" height="12" rx="1"></rect><rect x="13.6" y="6" width="3.2" height="12" rx="1"></rect>'
              : '<path d="M8 6.8V17.2C8 17.9 8.8 18.3 9.4 17.9L17 12.9C17.6 12.5 17.6 11.5 17 11.1L9.4 6.1C8.8 5.7 8 6.1 8 6.8Z"></path>'
          }
        </svg>
      </button>
      <button id="next-track" class="transport" type="button" aria-label="Next">
        <svg viewBox="0 0 24 24">
          <rect x="16.8" y="6" width="2.2" height="12" rx="1.1"></rect>
          <path d="M6 6.6V17.4C6 18.1 6.8 18.5 7.4 18.1L14.6 13.2C15.1 12.8 15.1 12.1 14.6 11.8L7.4 5.9C6.8 5.5 6 5.9 6 6.6Z"></path>
        </svg>
      </button>
    </div>
    <div class="mini-progress">
      <div class="progress-line">
        <div class="progress-fill" style="width:${progress}%"></div>
      </div>
      <div class="mini-status">
        <span>${state.isPlaying ? "Playing" : "Paused"}</span>
        <span>${formatTime(currentTime)} / ${formatTime(duration)}</span>
      </div>
    </div>
  `;

  const previousButton = miniPlayer.querySelector("#prev-track");
  if (!previousButton.classList.contains("disabled")) {
    previousButton.addEventListener("click", playPrevious);
  }

  const playButton = miniPlayer.querySelector("#play-toggle");
  if (track.audioUrl) {
    playButton.addEventListener("click", togglePlayback);
  }

  miniPlayer.querySelector("#next-track").addEventListener("click", playNext);
}

function playPrevious() {
  const index = state.sessionIds.indexOf(state.currentTrackId);
  if (index > 0) {
    setCurrentTrack(state.sessionIds[index - 1], true);
  }
}

function playNext() {
  const index = state.sessionIds.indexOf(state.currentTrackId);
  if (index >= 0 && index < state.sessionIds.length - 1) {
    setCurrentTrack(state.sessionIds[index + 1], true);
    return;
  }

  if (state.recommendations[0]) {
    addTrackToQueue(state.recommendations[0].id, true);
  }
}

function togglePlayback() {
  const track = currentTrack();
  if (!track?.audioUrl) {
    return;
  }

  if (audio.paused) {
    audio.play().catch(() => {});
  } else {
    audio.pause();
  }
}

function renderPassiveSuggestion() {
  const suggestion = state.passiveSuggestion?.recommendation;
  if (!state.passiveSuggestion?.ready || !suggestion || suggestion.suggestedTargetMood !== "uplifting") {
    passiveSuggestion.classList.add("hidden");
    return;
  }

  passiveSuggestion.classList.remove("hidden");
  suggestionTitle.textContent = suggestion.title;
  suggestionMessage.textContent = suggestion.message;
}

function openJourneyDialog(prefillTarget = null) {
  journeyCurrent.value = state.currentMood;
  journeyTarget.value = prefillTarget || state.targetMood;
  journeyIntensity.value = state.transitionIntensity;
  journeyDialog.showModal();
}

function recommendationCard(track) {
  const item = document.createElement("article");
  item.className = "recommendation-item";
  item.innerHTML = `
    ${coverMarkup(track)}
    <div class="recommend-main">
      <div class="song-title">${track.title}</div>
      <div class="song-meta">
        <span>${track.artist}</span>
        <span>${track.moods?.[0] || "balanced"}</span>
      </div>
    </div>
    <div class="song-actions">
      <button class="song-action" type="button" data-play="${track.id}">Play</button>
      <button class="song-action" type="button" data-add="${track.id}">Queue</button>
    </div>
  `;

  item.querySelector("[data-play]").addEventListener("click", () => addTrackToQueue(track.id, true));
  item.querySelector("[data-add]").addEventListener("click", () => addTrackToQueue(track.id, false));
  return item;
}

function renderRecommendations() {
  if (!state.recommendations.length) {
    recommendations.className = "recommendation-list empty-state";
    recommendations.textContent = state.sessionIds.length
      ? "Press Keep the vibe going to get your next recommendation."
      : "Add songs to your queue to see the next recommendations here.";
    return;
  }

  recommendations.className = "recommendation-list";
  recommendations.replaceChildren(...state.recommendations.map(recommendationCard));
}

function filteredLibraryTracks() {
  if (!state.searchQuery.trim()) {
    return state.tracks;
  }

  const query = state.searchQuery.trim().toLowerCase();
  return state.tracks.filter((track) => {
    const haystack = [track.title, track.artist, ...(track.genres || []), ...(track.moods || [])]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function libraryCard(track) {
  const item = document.createElement("article");
  item.className = "library-item";
  item.innerHTML = `
    ${coverMarkup(track)}
    <div class="library-main">
      <div class="song-title">${track.title}</div>
      <div class="song-meta">
        <span>${track.artist}</span>
        <span>${(track.moods || []).slice(0, 2).join(" / ") || "calm"}</span>
      </div>
    </div>
    <div class="song-actions">
      <button class="song-action" type="button" data-play="${track.id}">Play</button>
      <button class="song-action${isTrackQueued(track.id) ? " disabled" : ""}" type="button" data-add="${track.id}">
        ${isTrackQueued(track.id) ? "Queued" : "Queue"}
      </button>
    </div>
  `;

  item.querySelector("[data-play]").addEventListener("click", () => addTrackToQueue(track.id, true));

  const addButton = item.querySelector("[data-add]");
  if (!addButton.classList.contains("disabled")) {
    addButton.addEventListener("click", () => addTrackToQueue(track.id, false));
  }

  item.addEventListener("click", (event) => {
    if (event.target.closest("button")) {
      return;
    }
    setCurrentTrack(track.id, false);
  });

  return item;
}

function renderLibrary() {
  const visibleTracks = filteredLibraryTracks();

  if (!state.tracks.length) {
    library.className = "library-list empty-state";
    library.textContent = "No audio files found yet. Drop mp3, wav, m4a, or ogg files into public/music.";
    return;
  }

  if (!visibleTracks.length) {
    library.className = "library-list empty-state";
    library.textContent = "No songs matched your search.";
    return;
  }

  library.className = "library-list";
  library.replaceChildren(...visibleTracks.map(libraryCard));
}

function addTrackToQueue(trackId, playNow = false) {
  const track = trackById(trackId);
  if (!track) {
    return;
  }

  state.sessionIds = [...state.sessionIds, track.id].slice(-12);

  if (playNow) {
    setCurrentTrack(track.id, true);
  } else if (!state.currentTrackId) {
    setCurrentTrack(track.id, false);
  }

  refreshDerivedState();
}

async function runRecommendation() {
  if (!state.sessionIds.length) {
    return;
  }

  const result = await fetchJson("/api/recommend", {
    method: "POST",
    body: JSON.stringify({
      historyIds: state.sessionIds,
      preferredGenres: [],
      primaryMood: state.currentMood,
      targetMood: null,
    }),
  });

  state.recommendations = result.candidates.slice(0, 4);
  recommendationCopy.textContent = "These songs fit naturally after what you are already listening to.";
  renderRecommendations();
}

async function runJourney() {
  if (!state.sessionIds.length) {
    return;
  }

  state.currentMood = journeyCurrent.value;
  state.targetMood = journeyTarget.value;
  state.transitionIntensity = journeyIntensity.value;

  const result = await fetchJson("/api/journey", {
    method: "POST",
    body: JSON.stringify({
      historyIds: state.sessionIds,
      preferredGenres: [],
      currentMood: state.currentMood,
      targetMood: state.targetMood,
      steps: intensityToSteps[state.transitionIntensity],
    }),
  });

  state.recommendations = result.tracks;
  recommendationCopy.textContent = `Mood journey ready: ${result.startMood} to ${result.targetMood}.`;
  renderRecommendations();
  journeyDialog.close();
}

async function refreshDerivedState() {
  renderQueueSummary();
  renderQueue();
  renderNowPlaying();
  renderMiniPlayer();
  renderLibrary();

  if (!state.sessionIds.length) {
    state.passiveSuggestion = null;
    recommendationCopy.textContent = "Start a queue, then ask NextTrack for the next pick.";
    renderPassiveSuggestion();
    renderRecommendations();
    return;
  }

  if (state.sessionIds.length < 3) {
    state.passiveSuggestion = null;
    recommendationCopy.textContent = "Mood detection begins after 3 queued songs.";
    renderPassiveSuggestion();
    renderRecommendations();
    return;
  }

  state.passiveSuggestion = await fetchJson("/api/detect-mood", {
    method: "POST",
    body: JSON.stringify({ historyIds: state.sessionIds }),
  });

  state.currentMood = state.passiveSuggestion.detectedMood || state.currentMood;
  renderQueueSummary();
  renderPassiveSuggestion();

  if (!state.recommendations.length) {
    recommendationCopy.textContent = `Your queue currently feels ${state.passiveSuggestion.detectedMood}.`;
    renderRecommendations();
  }
}

function populateJourneyForm() {
  const options = moodOptions.map((mood) => `<option value="${mood}">${mood}</option>`).join("");
  journeyCurrent.innerHTML = options;
  journeyTarget.innerHTML = options;
}

function attachAudioEvents() {
  audio.addEventListener("play", () => {
    state.isPlaying = true;
    renderNowPlaying();
    renderMiniPlayer();
  });

  audio.addEventListener("pause", () => {
    state.isPlaying = false;
    renderNowPlaying();
    renderMiniPlayer();
  });

  audio.addEventListener("timeupdate", () => {
    renderNowPlaying();
    renderMiniPlayer();
  });

  audio.addEventListener("ended", playNext);

  audio.addEventListener("loadedmetadata", () => {
    renderNowPlaying();
    renderMiniPlayer();
  });
}

async function boot() {
  populateJourneyForm();
  attachAudioEvents();

  const libraryResponse = await fetchJson("/api/library");
  state.tracks = libraryResponse.tracks;
  state.hasAudioFiles = libraryResponse.hasAudioFiles;
  state.currentTrackId = state.tracks[0]?.id || null;

  if (state.hasAudioFiles) {
    libraryCaption.textContent = "Songs found in your project music folder.";
    queueCaption.textContent = "Queue the songs you want to hear next.";
  } else {
    libraryCaption.textContent = `No audio files were found yet. Add music to ${libraryResponse.musicFolder}.`;
    queueCaption.textContent = "Your queue will appear here after you add songs.";
  }

  searchInput.addEventListener("input", () => {
    state.searchQuery = searchInput.value;
    renderLibrary();
  });

  document.querySelector("#clear-session").addEventListener("click", async () => {
    state.sessionIds = [];
    state.recommendations = [];
    state.currentTrackId = state.tracks[0]?.id || null;
    clearAudioSource();
    await refreshDerivedState();
  });

  document.querySelector("#open-journey").addEventListener("click", () => openJourneyDialog());
  document.querySelector("#suggestion-action").addEventListener("click", () => openJourneyDialog("uplifting"));
  document.querySelector("#start-journey").addEventListener("click", runJourney);
  document.querySelector("#recommend-button").addEventListener("click", runRecommendation);

  await refreshDerivedState();
}

boot().catch((error) => {
  console.error(error);
  recommendationCopy.textContent = "Something went wrong while loading your music.";
});
