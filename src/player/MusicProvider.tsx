/**
 * MusicProvider — the single owner of playback and recommendation state.
 *
 * State separation:
 *  - recommendation state: resolved context + memoised decision per context
 *  - playback state: engine status, music on/off, volume, play history
 *
 * Two context sources are supported:
 *  - "soundtracks": the bundled project sample experiences
 *    (data/sample_experiences.json, including the 5-video KL sequence)
 *  - "clips": local video files uploaded by the user, grouped into a trip so
 *    that every clip in one trip shares one music context
 *
 * Continuity rules implemented here:
 *  1. Moving between items that share a context key (consecutive sequence
 *     videos, or consecutive clips of one uploaded trip) reuses the memoised
 *     decision and never touches the audio element: music keeps playing.
 *  2. Switching to a different context recomputes the decision.
 *  3. If the new decision is a different track the engine fades to it.
 *  4. If it is the same track the engine is left alone (no restart).
 *
 * Music on/off and volume persist in localStorage. Autoplay policy is handled
 * by the engine: playback only starts from a user gesture.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import { AVAILABLE_AUDIO_FILES, toAudioUrl } from '../audioManifest';
import {
  datasetNotice,
  datasetStatus,
  experiences,
  tracks,
  taxonomyData,
} from '../data/dataset';
import {
  buildContext,
  groupingContextKey,
  groupingMembers,
  isPlayable,
  isProductionEligible,
  isStructurallyValid,
  recommend,
  resolveContextSource,
  resolveGroupingContextSource,
} from '../engine/recommender';
import { validateAll } from '../engine/validator';
import type {
  Experience,
  GroupingFilter,
  Recommendation,
  RecommendationContext,
  RecommendationMode,
  ValidationResult,
} from '../types';
import { getAudioEngine, type AudioEngineLike, type AudioEngineState } from './audioEngine';
import {
  buildClipExperiences,
  defaultTripContext,
  type Clip,
  type TripContext,
} from './clips';

const MUSIC_ENABLED_KEY = 'glassnik.musicEnabled';
const VOLUME_KEY = 'glassnik.volume';
const ONBOARDING_KEY = 'glassnik.onboardingDismissed';
/**
 * Ring buffer of recently recommended tracks. The player passes this list to
 * the recommender as `avoidTrackIds`, so a track that played recently is
 * skipped while any other eligible candidate exists. Fifteen entries give the
 * 38-song catalogue a strong variety window.
 */
const HISTORY_LIMIT = 15;
/**
 * How many broken files in a row may be skipped automatically. The limit stops
 * an endless loop when every candidate file is unreadable: the player then
 * stays on the error state instead of skipping forever.
 */
const MAX_AUTO_SKIPS = 5;

export type SourceMode = 'soundtracks' | 'clips';

export interface SequenceInfo {
  group: string | null;
  videos: Experience[];
  currentIndex: number;
}

export interface MusicContextValue {
  // Data
  experiences: Experience[];
  validation: ValidationResult;
  datasetStatus: string;
  datasetNotice: string;
  // Context source
  sourceMode: SourceMode;
  setSourceMode: (mode: SourceMode) => void;
  // Sample experience selection
  selectedExperience: Experience;
  selectExperience: (id: string) => void;
  sequence: SequenceInfo;
  /** Simulated video change inside the current sequence (no real video). */
  goToVideo: (indexInSequence: number) => void;
  // Grouping browse (Category / Place / Location — the three Glassnik views)
  /** The grouping the viewer is currently browsing, or null for per-Experience. */
  groupingFilter: GroupingFilter | null;
  setGroupingFilter: (filter: GroupingFilter | null) => void;
  /** The Experiences inside the active grouping (catalogue order). */
  groupingItems: Experience[];
  // Uploaded clips
  clips: Clip[];
  activeClip: Clip | null;
  activeClipIndex: number;
  addClips: (files: File[]) => void;
  removeClip: (id: string) => void;
  clearClips: () => void;
  goToClip: (index: number) => void;
  /** Replaces the shared context for the whole uploaded trip. */
  updateTripContext: (update: TripContext) => void;
  tripContext: TripContext;
  // Recommendation mode
  mode: RecommendationMode;
  setMode: (mode: RecommendationMode) => void;
  // Recommendation state
  context: RecommendationContext | null;
  recommendation: Recommendation | null;
  nextTrack: () => void;
  /** When true, "Next track" cycles through every track in the catalogue. */
  browseAllTracks: boolean;
  setBrowseAllTracks: (enabled: boolean) => void;
  // Playback state
  engineState: AudioEngineState;
  musicEnabled: boolean;
  volume: number;
  toggleMusic: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  togglePlayPause: () => void;
  /** True when the current context resolves to a genuinely different key. */
  contextChanged: boolean;
  // Onboarding
  onboardingDismissed: boolean;
  dismissOnboarding: () => void;
}

const MusicContext = createContext<MusicContextValue | null>(null);

function readStoredPreferences(): { musicEnabled: boolean; volume: number } {
  let musicEnabled = true;
  let volume = 1;
  try {
    const storedEnabled = localStorage.getItem(MUSIC_ENABLED_KEY);
    if (storedEnabled !== null) musicEnabled = storedEnabled !== '0';
    const storedVolume = localStorage.getItem(VOLUME_KEY);
    if (storedVolume !== null) {
      const parsed = Number(storedVolume);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) volume = parsed;
    }
  } catch {
    // localStorage unavailable (private mode / SSR): fall back to defaults.
  }
  return { musicEnabled, volume };
}

function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures; preferences simply will not persist.
  }
}

function chunksOf(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.trim().toLowerCase().split(/[\s_-]+/).filter(Boolean);
}

interface DecisionMemo {
  key: string;
  /** Signature of the context inputs; changing any of them invalidates the memo. */
  signature: string;
  mode: RecommendationMode;
  context: RecommendationContext;
  recommendation: Recommendation;
  /**
   * Forces playback to start when the track is applied. Used by the automatic
   * advance (a track that ended or failed has to be replaced by one that
   * plays), never by the manual "next track" button.
   */
  forceAutoplay?: boolean;
}

/** Stable fingerprint of everything that can change a recommendation decision. */
export function contextSignature(context: RecommendationContext): string {
  return JSON.stringify([
    context.categoryId,
    context.placeType,
    context.destination,
    context.preferredMoods,
    context.energyRange,
  ]);
}

export function MusicProvider({
  children,
  engine: engineOverride,
}: {
  children: ReactNode;
  engine?: AudioEngineLike;
}): JSX.Element {
  const engineRef = useRef<AudioEngineLike | null>(null);
  if (engineRef.current === null) {
    engineRef.current = engineOverride ?? getAudioEngine();
  }
  const engine = engineRef.current;

  const initialPreferences = useMemo(readStoredPreferences, []);
  const [sourceMode, setSourceModeState] = useState<SourceMode>('soundtracks');
  const [selectedExperienceId, setSelectedExperienceId] = useState(
    experiences[0]?.experience_id ?? '',
  );
  const [clips, setClips] = useState<Clip[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [tripContext, setTripContextState] = useState<TripContext>(defaultTripContext);
  const [mode, setMode] = useState<RecommendationMode>('research');
  const [musicEnabled, setMusicEnabled] = useState(initialPreferences.musicEnabled);
  const [volume, setVolumeState] = useState(initialPreferences.volume);
  const [engineState, setEngineState] = useState<AudioEngineState>(() => engine.getState());
  const [decision, setDecision] = useState<DecisionMemo | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [browseAllTracks, setBrowseAllTracksState] = useState(false);
  /**
   * The active Category / Place / Location the viewer is browsing. While a
   * grouping is set, every Experience inside it shares one music decision and
   * changing Experience keeps the music playing (brief rule: music continues
   * within the same Category, Place or Location and changes on switching).
   */
  const [groupingFilter, setGroupingFilterState] = useState<GroupingFilter | null>(null);

  const historyRef = useRef<string[]>([]);
  const appliedTrackRef = useRef<string | null>(null);
  const memoRef = useRef<DecisionMemo | null>(null);
  /** Mirrors `musicEnabled` so the engine event handler always sees the value. */
  const musicEnabledRef = useRef(musicEnabled);
  /** Counts consecutive automatic skips caused by unreadable files. */
  const autoSkipCountRef = useRef(0);

  useEffect(() => {
    musicEnabledRef.current = musicEnabled;
  }, [musicEnabled]);

  const validation = useMemo(
    () =>
      validateAll({
        taxonomy: taxonomyData,
        catalogue: { dataset_status: datasetStatus, tracks },
        experiences: { experiences },
        availableAudioFiles: AVAILABLE_AUDIO_FILES,
      }),
    [],
  );

  const selectedExperience = useMemo(
    () =>
      experiences.find((e) => e.experience_id === selectedExperienceId) ?? experiences[0],
    [selectedExperienceId],
  );

  const sequence = useMemo<SequenceInfo>(() => {
    if (!selectedExperience.sequence_group) {
      return { group: null, videos: [], currentIndex: -1 };
    }
    const videos = experiences
      .filter((e) => e.sequence_group === selectedExperience.sequence_group)
      .sort((a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0));
    return {
      group: selectedExperience.sequence_group,
      videos,
      currentIndex: videos.findIndex(
        (e) => e.experience_id === selectedExperience.experience_id,
      ),
    };
  }, [selectedExperience]);

  const clipExperiences = useMemo(
    () => buildClipExperiences(clips, tripContext),
    [clips, tripContext],
  );

  const activeClipIndex = useMemo(() => {
    if (clips.length === 0) return -1;
    const index = clips.findIndex((c) => c.id === activeClipId);
    return index === -1 ? 0 : index;
  }, [clips, activeClipId]);

  const activeClip = activeClipIndex >= 0 ? clips[activeClipIndex] : null;

  /**
   * The item currently driving the recommendation: an uploaded clip when the
   * clip source is active and populated, otherwise the bundled experience.
   */
  const activeItem: Experience =
    sourceMode === 'clips' && clipExperiences.length > 0
      ? clipExperiences[Math.max(0, activeClipIndex)]
      : selectedExperience;

  /**
   * Grouping browse: while the viewer is inside a Category, Place or
   * Location grouping, that grouping's FIRST Experience (catalogue order)
   * speaks for the whole grouping — exactly how a sequence's first video
   * speaks for the sequence. Opening a different Experience in the grouping
   * then cannot move the music; only a different grouping can.
   */
  const groupingContextSource: Experience | null = useMemo(
    () =>
      groupingFilter && sourceMode !== 'clips'
        ? resolveGroupingContextSource(groupingFilter, experiences)
        : null,
    [groupingFilter, sourceMode],
  );

  /** Members of the active grouping, for the browsing UI. */
  const groupingItems: Experience[] = useMemo(
    () => (groupingFilter ? groupingMembers(groupingFilter, experiences) : []),
    [groupingFilter],
  );

  /**
   * The item that speaks for the whole trip. A trip makes one music decision,
   * so the music context is always taken from the first clip of an uploaded
   * trip or from the first video of a sequence. Moving through the trip then
   * never changes the context, so the same song keeps playing.
   */
  const contextSource: Experience = useMemo(() => {
    if (sourceMode === 'clips' && clipExperiences.length > 0) {
      return resolveContextSource(clipExperiences[0], clipExperiences);
    }
    // Grouping browse wins over the per-Experience representative: while a
    // Category / Place / Location grouping is active, its first member is the
    // context for every Experience in it.
    if (groupingContextSource) return groupingContextSource;
    return resolveContextSource(selectedExperience, experiences);
  }, [sourceMode, clipExperiences, selectedExperience, groupingContextSource]);

  // Subscribe to the single engine instance.
  useEffect(() => engine.subscribe(setEngineState), [engine]);

  // Restore volume on the shared engine (also covers re-mounts).
  useEffect(() => {
    engine.setVolume(volume);
  }, [engine, volume]);

  // Resolve the recommendation decision for the current context.
  useEffect(() => {
    const currentMemo = memoRef.current;
    // Decision key: while a Category / Place / Location grouping is being
    // browsed, the grouping itself is the key — stable across every
    // Experience inside it, so switching Experience never touches the music.
    // Otherwise the linkage is the trip/Experience key as before.
    const key = groupingContextSource
      ? groupingContextKey(groupingFilter!)
      : contextSource.sequence_group ?? contextSource.experience_id;
    const base = buildContext(contextSource);
    // While browsing a grouping the context openly says so, and its key is
    // the grouping key (the memo depends on key+signature).
    const context: RecommendationContext = groupingContextSource
      ? {
          ...base,
          key,
          label: `Browsing ${groupingFilter!.type.replace('_', ' ')}: ${groupingFilter!.value}`,
        }
      : base;
    const signature = contextSignature(context);
    // Reuse the memo only when the context inputs are genuinely unchanged.
    // Changing a trip's category or place type keeps the same key but must
    // still recompute, so the signature is part of the check.
    if (
      currentMemo &&
      currentMemo.key === key &&
      currentMemo.mode === mode &&
      currentMemo.signature === signature
    ) {
      if (decision !== currentMemo) setDecision(currentMemo);
      return;
    }
    // A new trip (or a new mode) starts a new queue. The songs played in
    // another trip must not push this one to a different track, so the same
    // context always resolves to the same music.
    if (!currentMemo || currentMemo.key !== key || currentMemo.mode !== mode) {
      historyRef.current = [];
    }
    const recommendation = recommend({
      context,
      tracks,
      mode,
      availableAudioFiles: AVAILABLE_AUDIO_FILES,
      avoidTrackIds: historyRef.current,
    });
    if (recommendation.track) {
      historyRef.current = [...historyRef.current, recommendation.track.track_id].slice(
        -HISTORY_LIMIT,
      );
    }
    const memo: DecisionMemo = { key, signature, mode, context, recommendation };
    memoRef.current = memo;
    setDecision(memo);
  }, [contextSource, groupingContextSource, groupingFilter, mode, decision]);
  // Apply a changed track to the engine. Same track => untouched engine.
  useEffect(() => {
    const recommendation = decision?.recommendation;
    if (!recommendation?.track) return;
    const url = toAudioUrl(recommendation.track.file_reference, AVAILABLE_AUDIO_FILES);
    if (!url) return;
    if (appliedTrackRef.current === recommendation.track.track_id) return;
    const wasActive = engineState.status === 'loading' || engineState.status === 'playing';
    const forceAutoplay = decision?.forceAutoplay === true;
    appliedTrackRef.current = recommendation.track.track_id;
    void engine.transitionTo(url, {
      autoplay: musicEnabled && (wasActive || forceAutoplay),
    });
  }, [decision, engine, engineState.status, musicEnabled]);

  const selectExperience = useCallback((id: string) => {
    setSourceModeState('soundtracks');
    setSelectedExperienceId(id);
  }, []);

  const goToVideo = useCallback(
    (indexInSequence: number) => {
      const target = sequence.videos[indexInSequence];
      if (target) setSelectedExperienceId(target.experience_id);
    },
    [sequence.videos],
  );

  const setSourceMode = useCallback((next: SourceMode) => {
    setSourceModeState(next);
  }, []);

  const addClips = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setClips((current) => {
      const next = [...current];
      for (const file of files) {
        next.push({
          id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          file,
        });
      }
      return next;
    });
    setSourceModeState('clips');
  }, []);

  const removeClip = useCallback((id: string) => {
    setClips((current) => current.filter((c) => c.id !== id));
    setActiveClipId((current) => (current === id ? null : current));
  }, []);

  const clearClips = useCallback(() => {
    setClips([]);
    setActiveClipId(null);
  }, []);

  const goToClip = useCallback(
    (index: number) => {
      const target = clips[index];
      if (target) {
        setActiveClipId(target.id);
        setSourceModeState('clips');
      }
    },
    [clips],
  );

  const updateTripContext = useCallback((update: TripContext) => {
    setTripContextState(update);
  }, []);

  /**
   * Moves to the next recommended track for the current context.
   *
   * The track that is playing right now is always avoided, so the same song is
   * never repeated straight away. When the context has no other candidate the
   * player simply stays where it is.
   */
  const advanceTrack = useCallback(
    (options: { forceAutoplay?: boolean } = {}) => {
      const current = memoRef.current;
      if (!current) return;
      const currentTrackId = current.recommendation.track?.track_id ?? null;
      const avoidTrackIds = currentTrackId
        ? historyRef.current.includes(currentTrackId)
          ? [...historyRef.current]
          : [...historyRef.current, currentTrackId]
        : [...historyRef.current];

      // When browsing all tracks, ignore the tier filters and pick from every
      // playable track in the catalogue instead of only those that match the
      // sample experience.
      if (browseAllTracks) {
        const eligible =
          mode === 'production'
            ? tracks.filter((t) => isProductionEligible(t) && isPlayable(t, AVAILABLE_AUDIO_FILES))
            : tracks.filter((t) => isStructurallyValid(t) && isPlayable(t, AVAILABLE_AUDIO_FILES));
        const fresh = eligible.filter((t) => !avoidTrackIds.includes(t.track_id));
        const pool = fresh.length > 0 ? fresh : eligible;
        if (pool.length === 0) return;
        if (currentTrackId && pool.length === 1 && pool[0].track_id === currentTrackId) return;
        const ordered = [...pool].sort((a, b) => {
          if (fresh.length > 0) return a.track_id < b.track_id ? -1 : a.track_id > b.track_id ? 1 : 0;
          // Every track has been played: keep going from the least recently played.
          const ai = avoidTrackIds.indexOf(a.track_id);
          const bi = avoidTrackIds.indexOf(b.track_id);
          return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
        });
        const nextTrack = ordered[0];
        historyRef.current = [...historyRef.current, nextTrack.track_id].slice(-HISTORY_LIMIT);
        const memo: DecisionMemo = {
          ...current,
          recommendation: {
            ...current.recommendation,
            track: nextTrack,
            reason: 'general_fallback',
            explanation: `Browsing all tracks: playing ${nextTrack.title} by ${nextTrack.artist}.`,
            matchedValue: null,
            matchedField: null,
            tierCandidateCount: pool.length,
            eligibleCandidateCount: eligible.length,
            repeatUnavoidable: fresh.length === 0,
          },
          forceAutoplay: options.forceAutoplay === true,
        };
        memoRef.current = memo;
        setDecision(memo);
        return;
      }

      const next = recommend({
        context: current.context,
        tracks,
        mode,
        availableAudioFiles: AVAILABLE_AUDIO_FILES,
        avoidTrackIds,
      });
      if (!next.track) return;
      // Nothing else to play: never restart the same song.
      if (currentTrackId && next.track.track_id === currentTrackId) return;
      historyRef.current = [...historyRef.current, next.track.track_id].slice(-HISTORY_LIMIT);
      const memo: DecisionMemo = {
        ...current,
        recommendation: next,
        forceAutoplay: options.forceAutoplay === true,
      };
      memoRef.current = memo;
      setDecision(memo);
    },
    [mode, browseAllTracks],
  );

  const nextTrack = useCallback(() => {
    advanceTrack();
  }, [advanceTrack]);

  /**
   * Automatic advance.
   *
   * When a track ends the player moves on to the next recommended track and
   * keeps playing. When a file cannot be played the broken track is skipped
   * and the next one is tried. Both paths never repeat the current song and
   * never crash the app; a run of broken files stops after MAX_AUTO_SKIPS.
   */
  useEffect(() => {
    return engine.subscribeEvents((event) => {
      if (event.type === 'ended') {
        // A track that ended while the player was paused is not a reason to
        // start something new.
        if (!event.wasPlaying) return;
        if (!musicEnabledRef.current) return;
        autoSkipCountRef.current = 0;
        advanceTrack({ forceAutoplay: true });
        return;
      }
      if (event.type === 'error') {
        if (!musicEnabledRef.current) return;
        if (autoSkipCountRef.current >= MAX_AUTO_SKIPS) return;
        autoSkipCountRef.current += 1;
        advanceTrack({ forceAutoplay: true });
      }
    });
  }, [engine, advanceTrack]);

  const togglePlayPause = useCallback(() => {
    const status = engine.getState().status;
    if (status === 'playing' || status === 'loading') {
      engine.pause();
      return;
    }
    const recommendation = memoRef.current?.recommendation;
    const url = recommendation?.track
      ? toAudioUrl(recommendation.track.file_reference, AVAILABLE_AUDIO_FILES)
      : null;
    if (!url) return;
    const state = engine.getState();
    if (state.url !== url || state.status === 'error') {
      engine.setSource(url, state.status === 'error');
    }
    setMusicEnabled(true);
    writePreference(MUSIC_ENABLED_KEY, '1');
    void engine.play();
  }, [engine]);

  const toggleMusic = useCallback(
    (enabled: boolean) => {
      setMusicEnabled(enabled);
      writePreference(MUSIC_ENABLED_KEY, enabled ? '1' : '0');
      if (!enabled) {
        engine.pause();
        return;
      }
      const recommendation = memoRef.current?.recommendation;
      const url = recommendation?.track
        ? toAudioUrl(recommendation.track.file_reference, AVAILABLE_AUDIO_FILES)
        : null;
      if (!url) return;
      const state = engine.getState();
      if (state.url !== url || state.status === 'error') {
        engine.setSource(url, state.status === 'error');
      }
      void engine.play();
    },
    [engine],
  );

  const setBrowseAllTracks = useCallback(
    (enabled: boolean) => {
      setBrowseAllTracksState(enabled);
      // A fresh "browse all" run should not be blocked by tracks played before.
      historyRef.current = [];
    },
    [],
  );

  /**
   * Browses by a Category, Place or Location grouping (or turns the grouping
   * off with null). Switching grouping is a new music decision, and it starts
   * with a fresh variety window.
   */
  const setGroupingFilter = useCallback((filter: GroupingFilter | null) => {
    setGroupingFilterState(filter);
    historyRef.current = [];
  }, []);

  const setVolume = useCallback((next: number) => {
    setVolumeState(next);
    writePreference(VOLUME_KEY, String(next));
  }, []);

  const dismissOnboarding = useCallback(() => {
    setOnboardingDismissed(true);
    writePreference(ONBOARDING_KEY, '1');
  }, []);

  /**
   * Suggests a trip context from file names, e.g. "kl-mall-1.mp4" ->
   * place_type shopping_mall. Only applies when the user has not already set
   * a context explicitly.
   */
  useEffect(() => {
    if (clips.length === 0) return;
    if (tripContext.label !== null) return;
    const vocabulary: Array<{ field: keyof TripContext; value: string }> = [
      ...taxonomyData.category_ids.map((c) => ({
        field: 'categoryId' as const,
        value: c.category_id,
      })),
      ...taxonomyData.place_types.map((p) => ({
        field: 'placeType' as const,
        value: p.place_type,
      })),
    ];
    for (const clip of clips) {
      const chunks = chunksOf(clip.name);
      for (const entry of vocabulary) {
        if (chunks.includes(entry.value)) {
          setTripContextState((current) => ({ ...current, [entry.field]: entry.value }));
          return;
        }
      }
    }
  }, [clips, tripContext.label]);

  const contextChanged =
    sourceMode === 'clips' &&
    clipExperiences.length > 0 &&
    activeItem.sequence_group !== null;

  const value: MusicContextValue = {
    experiences,
    validation,
    datasetStatus,
    datasetNotice,
    sourceMode,
    setSourceMode,
    selectedExperience,
    selectExperience,
    sequence,
    goToVideo,
    groupingFilter,
    setGroupingFilter,
    groupingItems,
    clips,
    activeClip,
    activeClipIndex,
    addClips,
    removeClip,
    clearClips,
    goToClip,
    updateTripContext,
    tripContext,
    mode,
    setMode,
    context: decision?.context ?? null,
    recommendation: decision?.recommendation ?? null,
    nextTrack,
    browseAllTracks,
    setBrowseAllTracks,
    engineState,
    musicEnabled,
    volume,
    toggleMusic,
    setVolume,
    togglePlayPause,
    contextChanged,
    onboardingDismissed,
    dismissOnboarding,
  };

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusic(): MusicContextValue {
  const value = useContext(MusicContext);
  if (value === null) {
    throw new Error('useMusic must be used inside a <MusicProvider>');
  }
  return value;
}
