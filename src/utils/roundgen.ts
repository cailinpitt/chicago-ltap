import { PATTERNS, STATION_MAP } from '../data/lLines';
import { LinePattern, Round } from '../types/game';

const LINES = [...new Set(PATTERNS.map((p) => p.line))];

function pickPattern(): LinePattern {
  const line = LINES[Math.floor(Math.random() * LINES.length)];
  const candidates = PATTERNS.filter((p) => p.line === line);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function generateRound(): Round {
  const pattern = pickPattern();
  const stations = pattern.stationIds.map((id) => STATION_MAP.get(id)!);
  const i = 1 + Math.floor(Math.random() * (stations.length - 1)); // [1, length-1]
  const isTerminal = i === stations.length - 1;
  const between = !isTerminal && Math.random() < 0.5;

  if (between) {
    return { pattern, mode: 'between', before: stations[i - 1], after: stations[i + 1], answer: stations[i] };
  }
  return { pattern, mode: 'directional', before: stations[i - 1], answer: stations[i] };
}

export function generateRounds(n: number): Round[] {
  const rounds: Round[] = [];
  const used = new Set<string>();
  let attempts = 0;
  while (rounds.length < n && attempts < n * 50) {
    attempts++;
    const r = generateRound();
    if (used.has(r.answer.id)) continue;
    used.add(r.answer.id);
    rounds.push(r);
  }
  return rounds;
}
