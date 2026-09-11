export interface Station {
  id: string;
  name: string;
  coordinates: [number, number]; // [lng, lat]
  lines: string[]; // e.g. ["Blue Line"]
}

export interface LTrack {
  name: string; // "Blue Line"
  color: string;
  path: [number, number][]; // [lng, lat][]
}

export interface LinePattern {
  line: string; // "Blue Line"
  color: string;
  headsign: string; // rider-facing destination, e.g. "O'Hare"
  stationIds: string[]; // ordered, trunk-to-terminus
}

export type RoundMode = 'between' | 'directional';

export interface Round {
  pattern: LinePattern;
  mode: RoundMode;
  before: Station; // known station immediately before the answer
  after?: Station; // known station after the answer (only in 'between' mode)
  answer: Station;
}

export interface RoundResult {
  round: Round;
  guess: Station | null;
  isCorrect: boolean;
  usedHint: boolean;
}
