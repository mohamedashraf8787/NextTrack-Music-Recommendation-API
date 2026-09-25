import { moodProfiles, tracks as defaultTracks } from "./trackData.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function getCatalogue(catalogue) {
  if (Array.isArray(catalogue)) {
    return catalogue;
  }
  return defaultTracks;
}

function getTrackMap(catalogue) {
  return new Map(getCatalogue(catalogue).map((track) => [track.id, track]));
}

function getHistory(historyIds = [], catalogue) {
  const trackMap = getTrackMap(catalogue);
  return historyIds.map((id) => trackMap.get(id)).filter(Boolean);
}

function getSessionProfile(history) {
  if (!history.length) {
    return { energy: 50, valence: 50, tempo: 100 };
  }

  return {
    energy: average(history.map((track) => track.energy)),
    valence: average(history.map((track) => track.valence)),
    tempo: average(history.map((track) => track.tempo)),
  };
}

function nearestMood(profile) {
  const entries = Object.entries(moodProfiles).map(([name, target]) => {
    const distance = Math.abs(profile.energy - target.energy) + Math.abs(profile.valence - target.valence);
    return { name, distance };
  });

  return entries.sort((a, b) => a.distance - b.distance)[0].name;
}

function interpolateProfile(from, to, weight) {
  return {
    energy: from.energy + (to.energy - from.energy) * weight,
    valence: from.valence + (to.valence - from.valence) * weight,
    tempo: from.tempo + ((to.tempo || from.tempo) - from.tempo) * weight,
  };
}

function genreOverlapScore(track, preferredGenres) {
  if (!preferredGenres.length) {
    return 0.4;
  }

  const overlap = track.genres.filter((genre) => preferredGenres.includes(genre)).length;
  return overlap / preferredGenres.length;
}

function moodOverlapScore(track, desiredMood) {
  if (!desiredMood) {
    return 0.45;
  }

  return track.moods.includes(desiredMood) ? 1 : 0.25;
}

function transitionScore(track, lastTrack) {
  if (!lastTrack) {
    return 0.6;
  }

  const tempoScore = 1 - clamp(Math.abs(track.tempo - lastTrack.tempo) / 45, 0, 1);
  const energyScore = 1 - clamp(Math.abs(track.energy - lastTrack.energy) / 65, 0, 1);
  const valenceScore = 1 - clamp(Math.abs(track.valence - lastTrack.valence) / 65, 0, 1);

  return average([tempoScore, energyScore, valenceScore]);
}

function targetAlignmentScore(track, targetProfile) {
  const energyScore = 1 - clamp(Math.abs(track.energy - targetProfile.energy) / 100, 0, 1);
  const valenceScore = 1 - clamp(Math.abs(track.valence - targetProfile.valence) / 100, 0, 1);
  const tempoScore = 1 - clamp(Math.abs(track.tempo - targetProfile.tempo) / 80, 0, 1);

  return average([energyScore, valenceScore, tempoScore]);
}

function buildExplanation(track, lastTrack, desiredMood, preferredGenres, score) {
  const explanationItems = [];

  if (lastTrack) {
    const tempoGap = Math.abs(track.tempo - lastTrack.tempo);
    explanationItems.push({
      label: "Tempo continuity",
      detail: `${track.tempo} BPM keeps the session flow ${tempoGap <= 10 ? "steady" : "moving"}.`,
      strength: tempoGap <= 10 ? "High" : "Medium",
    });
  }

  const matchedGenres = track.genres.filter((genre) => preferredGenres.includes(genre));
  if (matchedGenres.length) {
    explanationItems.push({
      label: "Genre match",
      detail: `${matchedGenres.join(", ")} matches the selected session preferences.`,
      strength: matchedGenres.length > 1 ? "High" : "Medium",
    });
  }

  if (desiredMood && track.moods.includes(desiredMood)) {
    explanationItems.push({
      label: "Mood alignment",
      detail: `The track supports the ${desiredMood} direction requested for this session.`,
      strength: "High",
    });
  }

  if (!explanationItems.length) {
    explanationItems.push({
      label: "Balanced fit",
      detail: "The track offers a balanced compromise between continuity and session goals.",
      strength: "Medium",
    });
  }

  return {
    summary: `${track.title} fits the current session because it balances continuity, mood direction, and genre preference.`,
    items: explanationItems,
    confidence: Math.round(score * 100),
  };
}

function scoreCandidates({
  history,
  catalogue,
  preferredGenres = [],
  primaryMood,
  targetMood,
  excludeIds = [],
  limit = 5,
}) {
  const candidates = getCatalogue(catalogue);
  const sessionProfile = getSessionProfile(history);
  const lastTrack = history.at(-1);
  const desiredMood = targetMood || primaryMood || nearestMood(sessionProfile);
  const targetProfile = targetMood
    ? interpolateProfile(sessionProfile, moodProfiles[targetMood], 0.55)
    : moodProfiles[desiredMood] || sessionProfile;

  const excluded = new Set([...history.map((track) => track.id), ...excludeIds]);

  const ranked = candidates
    .filter((track) => !excluded.has(track.id))
    .map((track) => {
      const transition = transitionScore(track, lastTrack);
      const target = targetAlignmentScore(track, targetProfile);
      const genre = genreOverlapScore(track, preferredGenres);
      const mood = moodOverlapScore(track, desiredMood);
      const artistPenalty = lastTrack && lastTrack.artist === track.artist ? 0.04 : 0;
      const score = clamp(
        transition * 0.35 + target * 0.35 + genre * 0.18 + mood * 0.16 - artistPenalty,
        0,
        1
      );

      return {
        ...track,
        score,
        explanation: buildExplanation(track, lastTrack, desiredMood, preferredGenres, score),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { ranked, desiredMood, sessionProfile, targetProfile };
}

export function getTrackCatalogue(catalogue) {
  return getCatalogue(catalogue);
}

export function detectSessionMood({ historyIds = [], catalogue }) {
  const history = getHistory(historyIds, catalogue);
  if (history.length < 3) {
    return {
      ready: false,
      minimumTracks: 3,
      detectedMood: null,
      profile: getSessionProfile(history),
      recentTrackIds: history.map((track) => track.id),
      recommendation: null,
    };
  }

  const recentTracks = history.slice(-3);
  const profile = getSessionProfile(recentTracks);
  const detectedMood = nearestMood(profile);
  const lowEnergy = profile.energy < 35;
  const lowValence = profile.valence < 35;
  const recommendation =
    lowEnergy && lowValence
      ? {
          title: "Low-energy pattern detected",
          message: "Your recent listening session seems low-energy. Would you like to start an uplifting mood journey?",
          suggestedTargetMood: "uplifting",
        }
      : {
          title: "Session mood stable",
          message: `The recent session currently trends ${detectedMood}.`,
          suggestedTargetMood: detectedMood,
        };

  return {
    ready: true,
    detectedMood,
    profile,
    recentTrackIds: recentTracks.map((track) => track.id),
    recommendation,
  };
}

export function recommendNextTracks({
  historyIds = [],
  catalogue,
  preferredGenres = [],
  primaryMood,
  targetMood,
}) {
  const history = getHistory(historyIds, catalogue);
  const { ranked, desiredMood, sessionProfile, targetProfile } = scoreCandidates({
    history,
    catalogue,
    preferredGenres,
    primaryMood,
    targetMood,
  });

  return {
    detectedSessionMood: nearestMood(sessionProfile),
    recommendationMood: desiredMood,
    sessionProfile,
    targetProfile,
    candidates: ranked,
  };
}

export function generateJourney({
  historyIds = [],
  catalogue,
  preferredGenres = [],
  currentMood,
  targetMood = "uplifting",
  steps = 5,
}) {
  const history = getHistory(historyIds, catalogue);
  const sessionProfile = getSessionProfile(history);
  const startMood = currentMood || nearestMood(sessionProfile);
  const fromProfile = moodProfiles[startMood] || sessionProfile;
  const toProfile = moodProfiles[targetMood] || moodProfiles.uplifting;

  const chosen = [];
  const used = [];

  for (let step = 1; step <= steps; step += 1) {
    const weight = step / steps;
    const stepProfile = interpolateProfile(fromProfile, toProfile, weight);
    const stepMood = nearestMood(stepProfile);
    const { ranked } = scoreCandidates({
      history: [...history, ...chosen],
      catalogue,
      preferredGenres,
      primaryMood: stepMood,
      targetMood,
      excludeIds: used,
      limit: 1,
    });

    const selected = ranked[0];
    if (!selected) {
      break;
    }

    used.push(selected.id);
    chosen.push({
      ...selected,
      step,
      targetStepProfile: stepProfile,
      stepMood,
    });
  }

  const path = [
    { label: "start", ...fromProfile },
    ...chosen.map((track) => ({
      label: track.title,
      energy: track.energy,
      valence: track.valence,
    })),
  ];

  return {
    startMood,
    targetMood,
    stepsRequested: steps,
    generatedSteps: chosen.length,
    path,
    tracks: chosen,
  };
}
