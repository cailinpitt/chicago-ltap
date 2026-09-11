import { TRACKS, STATION_MAP } from '../data/lLines';
import { RoundRecord, roundStatus, SITE_URL } from './share';

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const BG = '#0B0F19';
const TRACK_DIM = '#1E293B';
const STATUS_COLOR: Record<string, string> = {
  correct: '#10B981',
  hint: '#F59E0B',
  wrong: '#EF4444',
};

function tracksBounds(): [[number, number], [number, number]] {
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
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function buildShareImage(records: RoundRecord[], score: number): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748B';
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText('C H I C A G O   L   T A P', W / 2, 92);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 108px ${FONT}`;
  ctx.fillText(`${formatScore(score)} / ${records.length}`, W / 2, 210);

  const statuses = records.map(roundStatus);
  const nCorrect = statuses.filter((s) => s === 'correct').length;
  const nHint = statuses.filter((s) => s === 'hint').length;
  const nWrong = statuses.filter((s) => s === 'wrong').length;

  const mapX = 40;
  const mapY = 260;
  const mapW = W - 80;
  const mapH = 830;
  const b = tracksBounds();
  const cx = Math.cos((((b[0][1] + b[1][1]) / 2) * Math.PI) / 180);
  const geoW = (b[1][0] - b[0][0]) * cx;
  const geoH = b[1][1] - b[0][1];
  const scale = Math.min(mapW / geoW, mapH / geoH);
  const offX = mapX + (mapW - geoW * scale) / 2;
  const offY = mapY + (mapH - geoH * scale) / 2;
  const project = (p: [number, number]): [number, number] => [
    offX + (p[0] - b[0][0]) * cx * scale,
    offY + (b[1][1] - p[1]) * scale,
  ];

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const t of TRACKS) {
    ctx.beginPath();
    t.path.forEach((pt, i) => {
      const [x, y] = project(pt);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = TRACK_DIM;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  const statusByAnswer = new Map(records.map((r) => [r.answerId, roundStatus(r)]));
  for (const r of records) {
    const station = STATION_MAP.get(r.answerId);
    if (!station) continue;
    const [x, y] = project(station.coordinates);
    const st = statusByAnswer.get(r.answerId)!;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fillStyle = STATUS_COLOR[st];
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#F8FAFC';
    ctx.stroke();
  }

  const ly = 1180;
  const items: [string, number][] = [
    [STATUS_COLOR.correct, nCorrect],
    [STATUS_COLOR.hint, nHint],
    [STATUS_COLOR.wrong, nWrong],
  ];
  const gap = 250;
  const startX = W / 2 - gap;
  ctx.textAlign = 'left';
  ctx.font = `700 40px ${FONT}`;
  items.forEach(([color, count], i) => {
    const x = startX + i * gap;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, ly - 30, 36, 36, 8);
    ctx.fill();
    ctx.fillStyle = '#E2E8F0';
    ctx.fillText(String(count), x + 50, ly);
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748B';
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(SITE_URL.replace(/^https?:\/\//, ''), W / 2, 1282);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}
