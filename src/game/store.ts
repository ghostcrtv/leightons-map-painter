/**
 * App-wide state (Zustand). Kept small on purpose: the map itself is drawn by
 * MapRenderer outside React, so moving the map never re-renders React.
 *
 * Future phases add their own slices here (territory edits, stats, battles, saves).
 */
import { create } from 'zustand';
import type { CountryInfo } from '../data/countries';
import { readSetting, writeSetting } from '../utils/settings';

export type Tool = 'select'; // Phase 2+: 'paint' | 'erase' | 'expand' | 'island'
export type GameMode = 'sandbox'; // Later: 'conquest'

interface GameState {
  status: 'loading' | 'ready' | 'error';
  loadingMessage: string;
  error: string | null;
  countries: CountryInfo[];
  countryById: Map<string, CountryInfo>;

  mode: GameMode;
  tool: Tool;
  selectedId: string | null;
  panelCollapsed: boolean;

  helpOpen: boolean;
  settingsOpen: boolean;
  tourOpen: boolean;
  showLabels: boolean;
  showBorders: boolean;
  showCapitals: boolean;

  setLoading(message: string): void;
  setError(message: string): void;
  setReady(countries: CountryInfo[]): void;
  select(id: string | null): void;
  setPanelCollapsed(v: boolean): void;
  setHelpOpen(v: boolean): void;
  setSettingsOpen(v: boolean): void;
  setTourOpen(v: boolean): void;
  setShowLabels(v: boolean): void;
  setShowBorders(v: boolean): void;
  setShowCapitals(v: boolean): void;
}

export const useGame = create<GameState>((set) => ({
  status: 'loading',
  loadingMessage: 'Getting the world ready…',
  error: null,
  countries: [],
  countryById: new Map(),

  mode: 'sandbox',
  tool: 'select',
  selectedId: null,
  panelCollapsed: false,

  helpOpen: false,
  settingsOpen: false,
  tourOpen: false,
  showLabels: readSetting('showLabels', true),
  showBorders: readSetting('showBorders', true),
  showCapitals: readSetting('showCapitals', true),

  setLoading: (loadingMessage) => set({ loadingMessage }),
  setError: (error) => set({ status: 'error', error }),
  setReady: (countries) =>
    set({ status: 'ready', countries, countryById: new Map(countries.map((c) => [c.id, c])) }),
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
  setShowCapitals: (showCapitals) => {
    writeSetting('showCapitals', showCapitals);
    set({ showCapitals });
  },
}));
