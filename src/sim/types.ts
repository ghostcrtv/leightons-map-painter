import type { ConflictOdds, ConflictOutcome } from './conflict';

export type SimView = 'menu' | 'conflict' | 'disaster';

/** Shown at the top of the map while a simulation plays. */
export interface SimBanner {
  kind: 'conflict' | 'disaster';
  a: string;
  b?: string;
  /** Disaster type id. */
  type?: string;
}

export type SimReport =
  | {
      kind: 'conflict';
      a: string;
      b: string;
      outcome: ConflictOutcome;
      winner?: string;
      loser?: string;
      /** Real km² that changed hands. */
      km2: number;
      share: number;
      upset: boolean;
      odds: ConflictOdds;
      aPower: number;
      bPower: number;
      /** Territory version right after the change (Undo only while nothing else changed). */
      undoVersion: number | null;
    }
  | {
      kind: 'disaster';
      id: string;
      type: string;
      severity: number;
      powerBefore: number;
      powerAfter: number;
      undoVersion: number | null;
    };
