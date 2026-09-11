import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { TRACKS } from '../../data/lLines';
import { Round, RoundResult } from '../../types/game';
import { stationDisplayName as dn } from '../../utils/format';

const TRACKS_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: TRACKS.map((t) => ({
    type: 'Feature',
    properties: { line: t.name, color: t.color },
    geometry: { type: 'LineString', coordinates: t.path },
  })),
};

const NETWORK_BOUNDS: [[number, number], [number, number]] = (() => {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const t of TRACKS) {
    for (const [lng, lat] of t.path) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  const pad = 0.012;
  return [
    [minLng - pad, minLat - pad],
    [maxLng + pad, maxLat + pad],
  ];
})();

// Station coordinates (stops.txt) and the drawn track (shapes.txt, simplified) come
// from independent GTFS sources and don't line up exactly — snap markers onto the
// track they're actually drawn on, same technique chicago-maptap uses to draw route
// legs onto real track (nearestOnPolyline in its transitRouting.ts).
function nearestOnPolyline(poly: [number, number][], p: [number, number]): { point: [number, number]; distSq: number } {
  let best = { point: poly[0], distSq: Infinity };
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const proj: [number, number] = [ax + t * dx, ay + t * dy];
    const ddx = p[0] - proj[0];
    const ddy = p[1] - proj[1];
    const distSq = ddx * ddx + ddy * ddy;
    if (distSq < best.distSq) best = { point: proj, distSq };
  }
  return best;
}

function snapToTrack(point: [number, number], candidateLines: string[]): [number, number] {
  let best: [number, number] | null = null;
  let bestDistSq = Infinity;
  for (const t of TRACKS) {
    if (!candidateLines.includes(t.name)) continue;
    const r = nearestOnPolyline(t.path, point);
    if (r.distSq < bestDistSq) {
      bestDistSq = r.distSq;
      best = r.point;
    }
  }
  return best ?? point;
}

function overviewPadding() {
  const mobile = window.innerWidth < 640;
  return mobile ? { top: 128, bottom: 92, left: 16, right: 16 } : { top: 120, bottom: 88, left: 48, right: 48 };
}

function roundPadding() {
  const mobile = window.innerWidth < 640;
  return mobile ? { top: 220, bottom: 180, left: 40, right: 40 } : { top: 180, bottom: 160, left: 80, right: 80 };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function stationMarkerEl(name: string, color: string) {
  const el = document.createElement('div');
  el.className = 'flex flex-col items-center gap-1 pointer-events-none';
  el.innerHTML = `
    <span class="px-2 py-1 rounded-lg bg-neutral-950/90 border border-white/15 text-[11px] font-bold text-white text-center leading-tight max-w-[36vw] shadow-lg">${escapeHtml(name)}</span>
    <span class="w-3.5 h-3.5 rounded-full border-2 border-white shadow-lg" style="background:${color}"></span>
  `;
  return el;
}

function mysteryMarkerEl(state: 'pending' | 'correct' | 'wrong', name?: string) {
  const el = document.createElement('div');
  if (state === 'pending') {
    el.className = 'relative flex items-center justify-center pointer-events-none';
    el.innerHTML = `
      <span class="absolute w-9 h-9 rounded-full bg-sky-400/40 animate-pulse-ring"></span>
      <span class="relative w-4 h-4 rounded-full bg-sky-300 border-2 border-white shadow-xl animate-pulse-glow"></span>
    `;
    return el;
  }
  const dot = state === 'correct' ? 'bg-emerald-400' : 'bg-rose-500';
  el.className = 'flex flex-col items-center gap-1 pointer-events-none';
  el.innerHTML = `
    <span class="px-2.5 py-1 rounded-lg bg-neutral-950/95 border border-white/20 text-xs font-black text-white text-center leading-tight max-w-[36vw] shadow-xl">${escapeHtml(name || '')}</span>
    <span class="w-4 h-4 rounded-full border-2 border-white shadow-xl ${dot}"></span>
  `;
  return el;
}

interface LineMapProps {
  round: Round | null;
  result: RoundResult | null;
}

export const LineMap: React.FC<LineMapProps> = ({ round, result }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const isMapLoadedRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const lastRoundRef = useRef<Round | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      bounds: NETWORK_BOUNDS,
      fitBoundsOptions: { padding: overviewPadding() },
      minZoom: 8.5,
      maxZoom: 17,
      maxBounds: [
        [-88.05, 41.55],
        [-87.42, 42.12],
      ],
      attributionControl: false,
      dragRotate: false,
      touchPitch: false,
    });

    mapRef.current = map;

    map.on('load', () => {
      isMapLoadedRef.current = true;
      setMapLoaded(true);

      const style = map.getStyle();
      if (style && style.layers) {
        for (const layer of style.layers) {
          if (layer.type === 'symbol') {
            map.setLayoutProperty(layer.id, 'visibility', 'none');
          }
        }
      }

      map.addSource('tracks', { type: 'geojson', data: TRACKS_FC });

      map.addLayer({
        id: 'tracks-glow',
        type: 'line',
        source: 'tracks',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 3, 14, 12],
          'line-opacity': 0,
          'line-blur': 4,
        },
      });

      map.addLayer({
        id: 'tracks-line',
        type: 'line',
        source: 'tracks',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.4, 12, 3, 15, 5],
          'line-opacity': 0.3,
        },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      isMapLoadedRef.current = false;
      setMapLoaded(false);
    };
  }, []);

  useEffect(() => {
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, result, mapLoaded]);

  const clearMarkers = () => {
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
  };

  const render = () => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;

    clearMarkers();

    if (!round) {
      map.setPaintProperty('tracks-line', 'line-opacity', 0.3);
      map.setPaintProperty('tracks-glow', 'line-opacity', 0);
      map.fitBounds(NETWORK_BOUNDS, { padding: overviewPadding(), duration: 700, essential: true });
      lastRoundRef.current = null;
      return;
    }

    const isNewRound = lastRoundRef.current !== round;
    lastRoundRef.current = round;

    const activeLine = round.pattern.line;
    map.setPaintProperty('tracks-line', 'line-opacity', [
      'case',
      ['==', ['get', 'line'], activeLine],
      1,
      0.15,
    ]);
    map.setPaintProperty('tracks-glow', 'line-opacity', [
      'case',
      ['==', ['get', 'line'], activeLine],
      0.5,
      0,
    ]);

    const line = [round.pattern.line];
    const beforePt = snapToTrack(round.before.coordinates, line);
    const answerPt = snapToTrack(round.answer.coordinates, line);
    const afterPt = round.after ? snapToTrack(round.after.coordinates, line) : null;

    const points: [number, number][] = [beforePt, answerPt];
    if (afterPt) points.push(afterPt);

    markersRef.current.push(
      new maplibregl.Marker({ element: stationMarkerEl(dn(round.before.name), round.pattern.color), anchor: 'bottom' })
        .setLngLat(beforePt)
        .addTo(map)
    );
    if (afterPt) {
      markersRef.current.push(
        new maplibregl.Marker({ element: stationMarkerEl(dn(round.after!.name), round.pattern.color), anchor: 'bottom' })
          .setLngLat(afterPt)
          .addTo(map)
      );
    }

    if (!result) {
      markersRef.current.push(
        new maplibregl.Marker({ element: mysteryMarkerEl('pending'), anchor: 'center' })
          .setLngLat(answerPt)
          .addTo(map)
      );
    } else {
      markersRef.current.push(
        new maplibregl.Marker({
          element: mysteryMarkerEl(result.isCorrect ? 'correct' : 'wrong', dn(round.answer.name)),
          anchor: 'bottom',
        })
          .setLngLat(answerPt)
          .addTo(map)
      );
      if (!result.isCorrect && result.guess && result.guess.id !== round.answer.id) {
        const guessPt = snapToTrack(result.guess.coordinates, result.guess.lines);
        points.push(guessPt);
        markersRef.current.push(
          new maplibregl.Marker({ element: stationMarkerEl(result.guess.name, '#F87171'), anchor: 'top' })
            .setLngLat(guessPt)
            .addTo(map)
        );
      }
    }

    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lngs) - 0.006, Math.min(...lats) - 0.005],
      [Math.max(...lngs) + 0.006, Math.max(...lats) + 0.005],
    ];

    if (isNewRound && !result) {
      map.fitBounds(NETWORK_BOUNDS, { padding: overviewPadding(), duration: 500, essential: true });
      setTimeout(() => {
        if (mapRef.current === map) map.fitBounds(bounds, { padding: roundPadding(), duration: 900, essential: true });
      }, 550);
    } else {
      map.fitBounds(bounds, { padding: roundPadding(), duration: 700, essential: true });
    }
  };

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
};
