export interface RoundRecord {
  answerId: string;
  answerName: string;
  line: string;
  isCorrect: boolean;
  usedHint: boolean;
  guessName: string | null;
}

export type RoundStatus = 'correct' | 'hint' | 'wrong';

export function roundStatus(r: RoundRecord): RoundStatus {
  if (!r.isCorrect) return 'wrong';
  return r.usedHint ? 'hint' : 'correct';
}

const EMOJI: Record<RoundStatus, string> = {
  correct: '🟩',
  hint: '🟨',
  wrong: '🟥',
};

export function roundEmoji(r: RoundRecord): string {
  return EMOJI[roundStatus(r)];
}

export const SITE_URL = 'https://cailin.link/chicago-ltap';

export function shareUrl(): string {
  return SITE_URL;
}

function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function shareCaption(records: RoundRecord[], score: number): string {
  return `Chicago L Tap — ${formatScore(score)}/${records.length} ${shareUrl()}`;
}

export function buildShareText(records: RoundRecord[], score: number): string {
  const grid = records.map(roundEmoji).join('');
  const list = records.map((r) => `${roundEmoji(r)} ${r.answerName}`).join('\n');
  return [
    `Chicago L Tap — ${formatScore(score)}/${records.length}`,
    grid,
    '',
    list,
    '',
    shareUrl(),
  ].join('\n');
}
