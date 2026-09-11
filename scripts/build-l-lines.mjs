// Build src/data/lLines.ts from the CTA GTFS schedule feed.
// Run: node scripts/build-l-lines.mjs   (or: npm run build:data)

import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import AdmZip from 'adm-zip';
import { parse as parseCsv } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE = resolve(__dirname, '.cache');
const ZIP = resolve(CACHE, 'cta-gtfs.zip');
const GTFS_DIR = resolve(CACHE, 'gtfs');
const OUT = resolve(__dirname, '../src/data/lLines.ts');

const GTFS_URL = 'https://www.transitchicago.com/downloads/sch_data/google_transit.zip';

const MIN_PATTERN_TRIPS = 5; // drops deadhead/garage-move noise
const TRACK_SHAPE_SHARE = 0.1; // min share of route's trips to keep a track shape

const L_LINES = {
  Red: { name: 'Red Line', color: '#C60C30' },
  Blue: { name: 'Blue Line', color: '#00A1DE' },
  Brn: { name: 'Brown Line', color: '#62361B' },
  G: { name: 'Green Line', color: '#009B3A' },
  Org: { name: 'Orange Line', color: '#F9461C' },
  P: { name: 'Purple Line', color: '#522398' },
  Pink: { name: 'Pink Line', color: '#E27EA6' },
  Y: { name: 'Yellow Line', color: '#F9E300' },
};

if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });

function readTable(name) {
  return parseCsv(readFileSync(resolve(GTFS_DIR, name), 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
}

async function ensureGtfs() {
  if (!existsSync(ZIP)) {
    console.log('Downloading CTA GTFS feed (~70 MB) …');
    const res = await fetch(GTFS_URL);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    writeFileSync(ZIP, Buffer.from(await res.arrayBuffer()));
  } else {
    console.log('Using cached cta-gtfs.zip');
  }
  console.log('Unzipping …');
  new AdmZip(ZIP).extractAllTo(GTFS_DIR, true);
}

function collectStopTimes(tripIds) {
  return new Promise((resolvePromise, reject) => {
    const rl = createInterface({
      input: createReadStream(resolve(GTFS_DIR, 'stop_times.txt')),
      crlfDelay: Infinity,
    });
    const byTrip = new Map();
    let header = null;
    let iTrip, iStop, iSeq, iHeadsign;
    rl.on('line', (line) => {
      if (!header) {
        header = line.replace(/^﻿/, '').split(',');
        iTrip = header.indexOf('trip_id');
        iStop = header.indexOf('stop_id');
        iSeq = header.indexOf('stop_sequence');
        iHeadsign = header.indexOf('stop_headsign');
        return;
      }
      const c = line.split(',');
      const trip = c[iTrip];
      if (!tripIds.has(trip)) return;
      if (!byTrip.has(trip)) byTrip.set(trip, []);
      byTrip.get(trip).push({
        seq: Number(c[iSeq]),
        stopId: c[iStop],
        headsign: c[iHeadsign] || '',
      });
    });
    rl.on('close', () => resolvePromise(byTrip));
    rl.on('error', reject);
  });
}

function collectShapes(shapeIds) {
  return new Promise((resolvePromise, reject) => {
    const rl = createInterface({
      input: createReadStream(resolve(GTFS_DIR, 'shapes.txt')),
      crlfDelay: Infinity,
    });
    const byShape = new Map();
    let header = null;
    let iId, iLat, iLon, iSeq;
    rl.on('line', (line) => {
      if (!header) {
        header = line.replace(/^﻿/, '').split(',');
        iId = header.indexOf('shape_id');
        iLat = header.indexOf('shape_pt_lat');
        iLon = header.indexOf('shape_pt_lon');
        iSeq = header.indexOf('shape_pt_sequence');
        return;
      }
      const c = line.split(',');
      if (!shapeIds.has(c[iId])) return;
      if (!byShape.has(c[iId])) byShape.set(c[iId], []);
      byShape.get(c[iId]).push({ seq: Number(c[iSeq]), pt: [Number(c[iLon]), Number(c[iLat])] });
    });
    rl.on('close', () => {
      for (const arr of byShape.values()) arr.sort((a, b) => a.seq - b.seq);
      resolvePromise(byShape);
    });
    rl.on('error', reject);
  });
}

// Douglas–Peucker simplification (epsilon in degrees).
function simplifyPath(points, epsilon) {
  if (points.length < 3) return points;
  const sqSegDist = (p, a, b) => {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const dp = (start, end, out) => {
    let maxDist = 0;
    let idx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = sqSegDist(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        idx = i;
      }
    }
    if (maxDist > epsilon * epsilon) {
      if (idx - start > 1) dp(start, idx, out);
      out.push(points[idx]);
      if (end - idx > 1) dp(idx, end, out);
    }
  };
  const out = [points[0]];
  dp(0, points.length - 1, out);
  out.push(points[points.length - 1]);
  return out;
}

function isSubsequence(shorter, longer) {
  let i = 0;
  for (let j = 0; j < longer.length && i < shorter.length; j++) {
    if (longer[j] === shorter[i]) i++;
  }
  return i === shorter.length;
}

async function main() {
  await ensureGtfs();

  const routes = readTable('routes.txt');
  const trips = readTable('trips.txt');
  const stopsRaw = readTable('stops.txt');
  const calendar = readTable('calendar.txt');
  const calendarDates = readTable('calendar_dates.txt');

  const routeById = new Map(routes.map((r) => [r.route_id, r]));
  const lRouteIds = new Set(Object.keys(L_LINES).filter((id) => routeById.has(id)));

  // Pin one Wednesday inside the feed's first active pick, else overlapping picks inflate service.
  const asDate = (s) => new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
  const earliest = calendar.reduce((m, s) => (s.start_date < m ? s.start_date : m), '99999999');
  const target = asDate(earliest);
  while (target.getDay() !== 3) target.setDate(target.getDate() + 1); // 3 = Wednesday
  const ymd =
    `${target.getFullYear()}` +
    `${String(target.getMonth() + 1).padStart(2, '0')}` +
    `${String(target.getDate()).padStart(2, '0')}`;

  const weekdayServices = new Set(
    calendar
      .filter((s) => s.wednesday === '1' && s.start_date <= ymd && ymd <= s.end_date)
      .map((s) => s.service_id)
  );
  for (const e of calendarDates) {
    if (e.date !== ymd) continue;
    if (e.exception_type === '1') weekdayServices.add(e.service_id);
    if (e.exception_type === '2') weekdayServices.delete(e.service_id);
  }
  console.log(`Modeling Wednesday ${ymd}: ${weekdayServices.size} active service ids`);

  // location_type '1' rows are the real named stations; '0' platform stops carry parent_station.
  const canonicalById = new Map();
  for (const s of stopsRaw) {
    if (s.location_type === '1') {
      canonicalById.set(s.stop_id, {
        id: s.stop_id,
        name: s.stop_name,
        coordinates: [Number(s.stop_lon), Number(s.stop_lat)],
        lines: new Set(),
      });
    }
  }
  const platformToStation = new Map();
  for (const s of stopsRaw) {
    if (s.parent_station && canonicalById.has(s.parent_station)) {
      platformToStation.set(s.stop_id, s.parent_station);
    }
  }
  console.log(`${canonicalById.size} canonical stations, ${platformToStation.size} platform stops mapped`);

  const lTripIds = new Set();
  const tripRoute = new Map();
  for (const t of trips) {
    if (!weekdayServices.has(t.service_id) || !lRouteIds.has(t.route_id)) continue;
    lTripIds.add(t.trip_id);
    tripRoute.set(t.trip_id, { routeId: t.route_id });
  }
  console.log(`${lTripIds.size} weekday 'L' trips across ${lRouteIds.size} routes`);

  const stopTimes = await collectStopTimes(lTripIds);

  // Some routes (Brown/Orange/Purple/Pink here) run one round-trip vehicle block per
  // trip_id, headsign flipping partway (e.g. Brown: Kimball→Loop, same trip continues
  // Loop→Kimball). Split every trip into headsign-homogeneous segments — that's the
  // real directional unit, not the trip.
  const segments = []; // { routeId, headsign, stationIds }
  for (const [tripId, rows] of stopTimes) {
    rows.sort((a, b) => a.seq - b.seq);
    const { routeId } = tripRoute.get(tripId);
    let curHeadsign = null;
    let curStations = [];
    let lastHeadsign = '';
    const flush = () => {
      if (curHeadsign && curStations.length >= 2) segments.push({ routeId, headsign: curHeadsign, stationIds: curStations });
    };
    for (const r of rows) {
      const stationId = platformToStation.get(r.stopId);
      if (!stationId) continue;
      const hs = r.headsign || lastHeadsign;
      if (hs) lastHeadsign = hs;
      if (hs !== curHeadsign) {
        flush();
        curHeadsign = hs;
        curStations = [];
      }
      if (curStations[curStations.length - 1] !== stationId) curStations.push(stationId);
    }
    flush();
  }

  const patternGroups = new Map(); // "route|headsign" -> { routeId, headsign, best, segCount }
  for (const seg of segments) {
    const key = `${seg.routeId}|${seg.headsign}`;
    let g = patternGroups.get(key);
    if (!g) {
      g = { routeId: seg.routeId, headsign: seg.headsign, best: seg.stationIds, segCount: 0 };
      patternGroups.set(key, g);
    }
    g.segCount += 1;
    if (seg.stationIds.length > g.best.length) g.best = seg.stationIds;
  }

  const byRoute = new Map(); // routeId -> candidate patterns
  for (const g of patternGroups.values()) {
    if (g.segCount < MIN_PATTERN_TRIPS) continue;
    if (!byRoute.has(g.routeId)) byRoute.set(g.routeId, []);
    byRoute.get(g.routeId).push(g);
  }

  const patterns = [];
  const droppedSubsets = [];
  for (const [, candidates] of byRoute) {
    candidates.sort((a, b) => b.best.length - a.best.length);
    const kept = [];
    for (const c of candidates) {
      const isSubset = kept.some((k) => isSubsequence(c.best, k.best));
      if (isSubset) {
        droppedSubsets.push(`${L_LINES[c.routeId]?.name || c.routeId} → "${c.headsign}" (${c.best.length} stops, ${c.segCount} segs)`);
        continue;
      }
      kept.push(c);
    }
    for (const c of kept) {
      const meta = L_LINES[c.routeId];
      patterns.push({ line: meta.name, color: meta.color, headsign: c.headsign, stationIds: c.best });
      for (const id of c.best) canonicalById.get(id)?.lines.add(meta.name);
    }
  }

  // A pattern truncated at a headsign flip (e.g. Brown's "Loop" stops 3 stations short
  // of the real loop) is a strict station subset of its line's fullest pattern — replace
  // it with that pattern's reverse so every station keeps both real neighbors.
  const byLine = new Map();
  for (const p of patterns) {
    if (!byLine.has(p.line)) byLine.set(p.line, []);
    byLine.get(p.line).push(p);
  }
  const stitched = [];
  for (const group of byLine.values()) {
    const complete = group.reduce((a, b) => (b.stationIds.length > a.stationIds.length ? b : a));
    const completeSet = new Set(complete.stationIds);
    for (const p of group) {
      if (p === complete || p.stationIds.length >= complete.stationIds.length) continue;
      if (p.stationIds.every((id) => completeSet.has(id))) {
        stitched.push(`${p.line} → "${p.headsign}" (${p.stationIds.length} → ${complete.stationIds.length} stops)`);
        p.stationIds = [...complete.stationIds].reverse();
      }
    }
  }

  patterns.sort((a, b) => a.line.localeCompare(b.line) || a.headsign.localeCompare(b.headsign));

  if (stitched.length) {
    console.log(`\nStitched ${stitched.length} truncated patterns onto their line's full reverse:`);
    for (const s of stitched) console.log(`  ${s}`);
  }
  console.log(`\n${patterns.length} kept patterns (branches × directions):`);
  for (const p of patterns) console.log(`  ${p.line.padEnd(12)} → ${p.headsign.padEnd(20)} (${p.stationIds.length} stops)`);
  if (droppedSubsets.length) {
    console.log(`\nDropped ${droppedSubsets.length} short-turn/subset patterns:`);
    for (const d of droppedSubsets) console.log(`  ${d}`);
  }

  const usedStationIds = new Set(patterns.flatMap((p) => p.stationIds));
  const stations = [...usedStationIds]
    .map((id) => canonicalById.get(id))
    .filter(Boolean)
    .map((s) => ({
      id: s.id,
      name: s.name,
      coordinates: [Math.round(s.coordinates[0] * 1e5) / 1e5, Math.round(s.coordinates[1] * 1e5) / 1e5],
      lines: [...s.lines].sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  console.log(`\n${stations.length} stations referenced by kept patterns`);

  const routeTripCounts = new Map();
  const shapeTripCounts = new Map(); // routeId -> Map(shape_id -> count)
  for (const t of trips) {
    if (!weekdayServices.has(t.service_id) || !lRouteIds.has(t.route_id) || !t.shape_id) continue;
    routeTripCounts.set(t.route_id, (routeTripCounts.get(t.route_id) || 0) + 1);
    if (!shapeTripCounts.has(t.route_id)) shapeTripCounts.set(t.route_id, new Map());
    const m = shapeTripCounts.get(t.route_id);
    m.set(t.shape_id, (m.get(t.shape_id) || 0) + 1);
  }
  const keptShapesByRoute = new Map();
  for (const [routeId, m] of shapeTripCounts) {
    const total = routeTripCounts.get(routeId) || 1;
    keptShapesByRoute.set(
      routeId,
      [...m.entries()].filter(([, n]) => n / total >= TRACK_SHAPE_SHARE).map(([sid]) => sid)
    );
  }
  const shapesById = await collectShapes(new Set([...keptShapesByRoute.values()].flat()));
  const tracks = [];
  for (const [routeId, sids] of keptShapesByRoute) {
    const meta = L_LINES[routeId];
    const seen = new Set();
    for (const sid of sids) {
      const pts = simplifyPath((shapesById.get(sid) || []).map((p) => p.pt), 0.00004);
      if (pts.length < 2) continue;
      const sig = `${pts[0]}|${pts[pts.length - 1]}|${pts.length}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      tracks.push({
        name: meta.name,
        color: meta.color,
        path: pts.map((p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]),
      });
    }
  }
  tracks.sort((a, b) => a.name.localeCompare(b.name));
  console.log(`${tracks.length} track overlay shapes`);

  const lLineMeta = Object.fromEntries(Object.values(L_LINES).map((l) => [l.name, l]));
  const body = `// AUTO-GENERATED by scripts/build-l-lines.mjs — do not edit by hand.
// Source: CTA GTFS schedule feed (transitchicago.com).
import { Station, LinePattern, LTrack } from '../types/game';

export const L_LINE_META: Record<string, { name: string; color: string }> =
  ${JSON.stringify(lLineMeta, null, 2).replace(/\n/g, '\n  ')};

// Every canonical station referenced by a kept pattern below.
export const STATIONS: Station[] = JSON.parse(
  ${JSON.stringify(JSON.stringify(stations))}
);

// One entry per real branch × direction: an ordered, trunk-to-terminus station list.
export const PATTERNS: LinePattern[] = JSON.parse(
  ${JSON.stringify(JSON.stringify(patterns))}
);

// Full-resolution 'L' line geometry (from GTFS shapes.txt) for the background map overlay.
export const TRACKS: LTrack[] = JSON.parse(
  ${JSON.stringify(JSON.stringify(tracks))}
);

export const STATION_MAP = new Map<string, Station>(STATIONS.map((s) => [s.id, s]));
`;

  writeFileSync(OUT, body);
  console.log(`\nWrote ${OUT} (${(body.length / 1024).toFixed(0)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
