import type { ConflictOdds, ConflictOutcome } from './conflict';

export type SimView = 'menu' | 'conflict' | 'disaster' | 'war' | 'rebellion' | 'coast';

/** Shown at the top of the map while a simulation plays. */
export interface SimBanner {
  kind: 'conflict' | 'disaster';
  a: string;
  b?: string;
  /** Disaster type id. */
  type?: string;
  /** Extra line, e.g. "Year 3 · event 4 of 9". */
  step?: string;
  /** Custom banner text (rebellions, coasts, sea level, world war). */
  text?: string;
  emoji?: string;
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
      /** The winner was weakened by disasters and has now recovered. */
      recovered: boolean;
      /** Allies who joined in (both sides). */
      allies: string[];
      /** War damage to the loser (partial wins). */
      damage: { id: string; military: number; money: number } | null;
    }
  | {
      /** One world event: rebellion, coast growth, rising seas, alliance. */
      kind: 'event';
      emoji: string;
      title: string;
      text: string;
      undoVersion: number | null;
      again?: 'rebellion' | 'coast' | 'sea';
    }
  | {
      kind: 'year';
      year: number;
      entries: { emoji: string; text: string }[];
      gainer?: { id: string; km2: number };
      loser?: { id: string; km2: number };
      stopped: boolean;
      undoVersion: number | null;
    }
  | {
      kind: 'war';
      battles: number;
      left: number;
      leader?: { id: string; km2: number };
      champion?: string;
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

/** One line of the World War ticker. */
export type WarTickerEntry =
  | { n: number; kind: 'battle'; a: string; b: string; outcome: ConflictOutcome; winner?: string; loser?: string; eliminated?: string }
  | { n: number; kind: 'event'; emoji: string; text: string };

/** A big World War announcement ("Down to 100!", "The Final Battle!"…). */
export interface WarMilestone {
  title: string;
  sub?: string;
  /** Flags to show in a row (the last few countries). */
  flags?: string[];
  /** Two flags with "VS" between them. */
  vs?: boolean;
  /** The winner's crowning. */
  champion?: string;
}
