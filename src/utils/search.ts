import { Station } from '../types/game';

export function searchStations(stations: Station[], query: string, limit = 6): Station[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: Station[] = [];
  const contains: Station[] = [];
  for (const s of stations) {
    const name = s.name.toLowerCase();
    if (name.startsWith(q)) starts.push(s);
    else if (name.includes(q)) contains.push(s);
  }
  return [...starts, ...contains].slice(0, limit);
}
