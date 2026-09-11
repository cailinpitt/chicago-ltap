// Draws the 1200×630 Open Graph / social share card to an offscreen canvas.
// Runs in a headless browser (see build-og.mjs). Edit freely and re-run `npm run build:og`.
import { TRACKS, STATIONS } from '../src/data/lLines.ts';

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const W = 1200;
const H = 630;

// The three stations shown lit up, as if mid-round — spread across the system
// so the map reads as citywide, not one corner.
const HIT = new Set(['Midway', 'Cottage Grove', 'Howard']);

export async function renderOgCard() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');

  g.fillStyle = '#0A0E17';
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(890, 300, 40, 890, 300, 560);
  glow.addColorStop(0, 'rgba(34,52,80,0.6)');
  glow.addColorStop(1, 'rgba(10,14,23,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // ---- Map (right side) ----
  let mnX = Infinity;
  let mnY = Infinity;
  let mxX = -Infinity;
  let mxY = -Infinity;
  for (const t of TRACKS) {
    for (const [x, y] of t.path) {
      if (x < mnX) mnX = x;
      if (x > mxX) mxX = x;
      if (y < mnY) mnY = y;
      if (y > mxY) mxY = y;
    }
  }
  const mapX = 560;
  const mapY = -40;
  const mapW = 700;
  const mapH = 720;
  const cx = Math.cos((((mnY + mxY) / 2) * Math.PI) / 180);
  const gw = (mxX - mnX) * cx;
  const gh = mxY - mnY;
  const s = Math.min(mapW / gw, mapH / gh);
  const ox = mapX + (mapW - gw * s) / 2;
  const oy = mapY + (mapH - gh * s) / 2;
  const P = ([x, y]) => [ox + (x - mnX) * cx * s, oy + (mxY - y) * s];

  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = 5;
  for (const t of TRACKS) {
    g.beginPath();
    t.path.forEach((pt, i) => {
      const [x, y] = P(pt);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.strokeStyle = t.color;
    g.globalAlpha = 0.85;
    g.stroke();
  }
  g.globalAlpha = 1;

  for (const st of STATIONS) {
    if (!HIT.has(st.name)) continue;
    const [x, y] = P(st.coordinates);
    g.beginPath();
    g.arc(x, y, 9, 0, Math.PI * 2);
    g.fillStyle = '#34D399';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#F8FAFC';
    g.stroke();
  }

  // Fade the map into the background on its left edge
  const fade = g.createLinearGradient(560, 0, 760, 0);
  fade.addColorStop(0, '#0A0E17');
  fade.addColorStop(1, 'rgba(10,14,23,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, 760, H);

  // ---- Text (left side) ----
  const L = 72;
  g.textBaseline = 'alphabetic';

  g.fillStyle = '#00A1DE';
  g.beginPath();
  g.arc(L + 7, 86, 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#94A3B8';
  g.font = `800 24px ${FONT}`;
  g.fillText('C H I C A G O   L   T A P', L + 26, 94);

  g.fillStyle = '#F8FAFC';
  g.font = `800 62px ${FONT}`;
  g.fillText('Name the', L, 200);
  g.fillText('station.', L, 270);
  g.fillStyle = '#38BDF8';
  g.fillText('Ride the L.', L, 340);

  g.fillStyle = '#64748B';
  g.font = `500 25px ${FONT}`;
  g.fillText('8 lines  ·  10 rounds', L, 398);

  const seq = ['c', 'c', 'h', 'w', 'c', 'c', 'w', 'c', 'c', 'c'];
  const col = { c: '#10B981', h: '#F59E0B', w: '#EF4444' };
  const sq = 38;
  const gap = 11;
  seq.forEach((k, i) => {
    g.fillStyle = col[k];
    g.beginPath();
    g.roundRect(L + i * (sq + gap), 452, sq, sq, 9);
    g.fill();
  });

  g.fillStyle = '#475569';
  g.font = `600 24px ${FONT}`;
  g.fillText('cailin.link/chicago-ltap', L, 556);

  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

window.__renderOgCard = renderOgCard;
