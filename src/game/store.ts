/**
 * App-wide state (Zustand). Kept small on purpose: the map itself is drawn by
 * MapRenderer outside React, so moving the map never re-renders React.
 *
 * Future phases add their own slices here (territory edits, stats, battles, saves).
 */
import { create } from 'zustand';
import type { SimBanner, SimReport, SimView } from '../sim/types';
import type { CountryInfo } from '../data/countries';
import { readSetting, writeSetting } from '../utils/settings';

/** Phase 5 adds 'expand' and 'island'. */
export type Tool = 'select' | 'paint' | 'erase' | 'land';
/** Land tool: add new land from the sea, or erode land into sea. */
export type LandMode = 'add' | 'erode';
/** S/M/L are round brushes; F (Fill) takes a whole country with one tap. */
export type BrushSize = 'S' | 'M' | 'L' | 'F';
/** Brush radius in screen pixels: the brush looks the same size at any zoom. */
export const BRUSH_PX: Record<BrushSize, number> = { S: 7, M: 16, L: 34, F: 0 };
export type GameMode = 'sandbox'; // Later: 'conquest'

interface GameState {
  status: 'loading' | 'ready' | 'error';
  loadingMessage: string;
  error: string | null;
  countries: CountryInfo[];
  countryById: Map<string, CountryInfo>;

  mode: GameMode;
  tool: Tool;
  brush: BrushSize;
  landMode: LandMode;
  /** The country that paints when using the Paint tool. */
  painterId: string | null;
  /** True once the territory engine is ready (shortly after the map appears). */
  territoryReady: boolean;
  /** Bumps when territory changes, so panels re-read the numbers. */
  territoryVersion: number;
  canUndo: boolean;
  canRedo: boolean;
  /** Bumps when any power rating changes. */
  statsVersion: number;
  /** Which pop-up window is open from the Actions menu (null = none). */
  actionsOpen: boolean;
  rankingsOpen: boolean;
  /** Simulation menu: which page is open (null = closed). */
  simView: SimView | null;
  /** Nations to start the Conflict window with (from the country panel's Attack / Defend). */
  conflictPreset: { a: string; b: string } | null;
  /** A simulation is playing on the map: the banner text. */
  simBanner: SimBanner | null;
  /** The last simulation's result card (null = hidden). */
  simReport: SimReport | null;
  /** Auto battles: keep running random conflicts. */
  simAuto: boolean;
  /** A long simulation is running (shows Skip / Stop buttons). */
  simRunning: 'year' | 'war' | null;
  /** The saved world being played. */
  world: { id: string; name: string } | null;
  /** Bumps when the world changes (opened, renamed, names/custom countries edited). */
  worldVersion: number;
  worldsOpen: boolean;
  historyOpen: boolean;
  /** Country designer: null = closed, {} = new country, {id} = edit. */
  designer: { id?: string } | null;
  badgeToast: string | null;
  badgesOpen: boolean;
  leaderboardOpen: boolean;
  /** Shown if saving failed (e.g. storage full). */
  saveProblem: string | null;
  selectedId: string | null;
  panelCollapsed: boolean;

  helpOpen: boolean;
  settingsOpen: boolean;
  tourOpen: boolean;
  showLabels: boolean;
  showBorders: boolean;
  showCapitals: boolean;
  showNight: boolean;
  /** Zombies, aliens and other crazy disasters (Settings). */
  crazyDisasters: boolean;

  setTool(t: Tool): void;
  setBrush(b: BrushSize): void;
  setLandMode(m: LandMode): void;
  setPainter(id: string | null): void;
  territoryChanged(info: { canUndo: boolean; canRedo: boolean }): void;
  setTerritoryReady(): void;
  statsChanged(): void;
  setActionsOpen(v: boolean): void;
  setRankingsOpen(v: boolean): void;
  setSimView(v: SimView | null): void;
  setConflictPreset(v: { a: string; b: string } | null): void;
  setSimBanner(v: SimBanner | null): void;
  setSimReport(v: SimReport | null): void;
  setSimAuto(v: boolean): void;
  setSimRunning(v: 'year' | 'war' | null): void;
  setWorld(w: { id: string; name: string } | null): void;
  worldChanged(): void;
  setWorldsOpen(v: boolean): void;
  setHistoryOpen(v: boolean): void;
  setDesigner(v: { id?: string } | null): void;
  setBadgeToast(v: string | null): void;
  setBadgesOpen(v: boolean): void;
  setLeaderboardOpen(v: boolean): void;
  setSaveProblem(v: string | null): void;
  setLoading(message: string): void;
  setError(message: string): void;
  setReady(countries: CountryInfo[]): void;
  /** Replace the country list (custom countries added, names changed). */
  setCountries(countries: CountryInfo[]): void;
  select(id: string | null): void;
  setPanelCollapsed(v: boolean): void;
  setHelpOpen(v: boolean): void;
  setSettingsOpen(v: boolean): void;
  setTourOpen(v: boolean): void;
  setShowLabels(v: boolean): void;
  setShowBorders(v: boolean): void;
  setShowCapitals(v: boolean): void;
  setShowNight(v: boolean): void;
  setCrazyDisasters(v: boolean): void;
}

export const useGame = create<GameState>((set) => ({
  status: 'loading',
  loadingMessage: 'Getting the world ready…',
  error: null,
  countries: [],
  countryById: new Map(),

  mode: 'sandbox',
  tool: 'select',
  brush: readSetting<BrushSize>('brush', 'M'),
  landMode: 'add',
  painterId: null,
  territoryReady: false,
  territoryVersion: 0,
  canUndo: false,
  canRedo: false,
  statsVersion: 0,
  actionsOpen: false,
  rankingsOpen: false,
  simView: null,
  conflictPreset: null,
  simBanner: null,
  simReport: null,
  simAuto: false,
  simRunning: null,
  world: null,
  worldVersion: 0,
  worldsOpen: false,
  historyOpen: false,
  designer: null,
  badgeToast: null,
  badgesOpen: false,
  leaderboardOpen: false,
  saveProblem: null,
  selectedId: null,
  panelCollapsed: false,

  helpOpen: false,
  settingsOpen: false,
  tourOpen: false,
  showLabels: readSetting('showLabels', true),
  showBorders: readSetting('showBorders', true),
  showCapitals: readSetting('showCapitals', true),
  showNight: readSetting('showNight', false),
  crazyDisasters: readSetting('crazyDisasters', false),

  setTool: (tool) => set((s) => ({ tool, brush: tool === 'land' && s.brush === 'F' ? 'M' : s.brush })),
  setLandMode: (landMode) => set({ landMode }),
  setBrush: (brush) => {
    writeSetting('brush', brush);
    set({ brush });
  },
  setPainter: (painterId) => set({ painterId }),
  territoryChanged: ({ canUndo, canRedo }) => set((s) => ({ territoryVersion: s.territoryVersion + 1, canUndo, canRedo })),
  setTerritoryReady: () => set({ territoryReady: true }),
  statsChanged: () => set((s) => ({ statsVersion: s.statsVersion + 1 })),
  setActionsOpen: (actionsOpen) => set({ actionsOpen }),
  setRankingsOpen: (rankingsOpen) => set({ rankingsOpen }),
  setSimView: (simView) => set({ simView }),
  setConflictPreset: (conflictPreset) => set({ conflictPreset }),
  setSimBanner: (simBanner) => set({ simBanner }),
  setSimReport: (simReport) => set({ simReport }),
  setSimAuto: (simAuto) => set({ simAuto }),
  setSimRunning: (simRunning) => set({ simRunning }),
  setWorld: (world) => set({ world }),
  worldChanged: () => set((s) => ({ worldVersion: s.worldVersion + 1 })),
  setWorldsOpen: (worldsOpen) => set({ worldsOpen }),
  setHistoryOpen: (historyOpen) => set({ historyOpen }),
  setDesigner: (designer) => set({ designer }),
  setBadgeToast: (badgeToast) => set({ badgeToast }),
  setBadgesOpen: (badgesOpen) => set({ badgesOpen }),
  setLeaderboardOpen: (leaderboardOpen) => set({ leaderboardOpen }),
  setSaveProblem: (saveProblem) => set({ saveProblem }),
  setLoading: (loadingMessage) => set({ loadingMessage }),
  setError: (error) => set({ status: 'error', error }),
  setReady: (countries) =>
    set({ status: 'ready', countries, countryById: new Map(countries.map((c) => [c.id, c])) }),
  setCountries: (countries) => set({ countries, countryById: new Map(countries.map((c) => [c.id, c])) }),
  select: (selectedId) => set({ selectedId, panelCollapsed: false }),
  setPanelCollapsed: (panelCollapsed) => set({ panelCollapsed }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setTourOpen: (tourOpen) => set({ tourOpen }),
  setShowLabels: (showLabels) => {
    writeSetting('showLabels', showLabels);
    set({ showLabels });
  },
  setShowBorders: (showBorders) => {
    writeSetting('showBorders', showBorders);
    set({ showBorders });
  },
  setCrazyDisasters: (crazyDisasters) => {
    writeSetting('crazyDisasters', crazyDisasters);
    set({ crazyDisasters });
  },
  setShowNight: (showNight) => {
    writeSetting('showNight', showNight);
    set({ showNight });
  },
  setShowCapitals: (showCapitals) => {
    writeSetting('showCapitals', showCapitals);
    set({ showCapitals });
  },
}));
