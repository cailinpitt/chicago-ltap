import React, { useState, useEffect } from 'react';
import { Round, RoundResult, Station } from './types/game';
import { generateRounds } from './utils/roundgen';
import { LineMap } from './components/Map/LineMap';
import { AnswerInput } from './components/AnswerInput';
import { RoundRecord, roundEmoji, buildShareText, shareCaption } from './utils/share';
import { buildShareImage } from './utils/shareImage';
import { stationDisplayName as dn } from './utils/format';

const TOTAL_ROUNDS = 10;

function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function roundPrompt(round: Round): string {
  const line = round.pattern.line;
  const headsign = round.pattern.headsign;
  if (round.mode === 'between') {
    return `Riding a ${headsign}-bound ${line} train, between ${dn(round.before.name)} and ${dn(round.after!.name)}`;
  }
  return `Riding a ${headsign}-bound ${line} train, right after ${dn(round.before.name)}`;
}

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    ok ? resolve() : reject(new Error('copy failed'));
  });
}

const ShareRow: React.FC<{ history: RoundRecord[]; score: number }> = ({ history, score }) => {
  const [copied, setCopied] = useState(false);
  const [imgState, setImgState] = useState<'idle' | 'working' | 'done'>('idle');

  const copyResult = async () => {
    try {
      await copyToClipboard(buildShareText(history, score));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  const shareImage = async () => {
    setImgState('working');
    try {
      const blob = await buildShareImage(history, score);
      const file = new File([blob], 'chicago-ltap.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: shareCaption(history, score) });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'chicago-ltap.png';
        a.click();
        URL.revokeObjectURL(url);
      }
      setImgState('done');
      setTimeout(() => setImgState('idle'), 1800);
    } catch {
      setImgState('idle');
    }
  };

  return (
    <div className="grid grid-cols-2 gap-2 mb-2">
      <button
        onClick={copyResult}
        className="py-3 min-h-[46px] bg-white/10 hover:bg-white/15 text-white font-semibold text-sm rounded-xl active:scale-98 transition-all cursor-pointer touch-manipulation"
      >
        {copied ? 'Copied ✓' : 'Copy result'}
      </button>
      <button
        onClick={shareImage}
        className="py-3 min-h-[46px] bg-white/10 hover:bg-white/15 text-white font-semibold text-sm rounded-xl active:scale-98 transition-all cursor-pointer touch-manipulation"
      >
        {imgState === 'working' ? 'Rendering…' : imgState === 'done' ? 'Shared ✓' : 'Share image'}
      </button>
    </div>
  );
};

export const App: React.FC = () => {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [usedHint, setUsedHint] = useState(false);
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [history, setHistory] = useState<RoundRecord[]>([]);

  const startNewGame = () => {
    setRounds(generateRounds(TOTAL_ROUNDS));
    setCurrentIndex(0);
    setScore(0);
    setUsedHint(false);
    setLastResult(null);
    setIsGameOver(false);
    setHistory([]);
  };

  useEffect(() => {
    startNewGame();
  }, []);

  const currentRound = rounds[currentIndex] || null;

  const handleGuess = (station: Station) => {
    if (!currentRound || lastResult !== null || isGameOver) return;

    const isCorrect = station.id === currentRound.answer.id;
    if (isCorrect) setScore((s) => s + (usedHint ? 0.5 : 1));

    setLastResult({ round: currentRound, guess: station, isCorrect, usedHint });
    setHistory((h) => [
      ...h,
      {
        answerId: currentRound.answer.id,
        answerName: currentRound.answer.name,
        line: currentRound.pattern.line,
        isCorrect,
        usedHint,
        guessName: station.name,
      },
    ]);
  };

  const handleNext = () => {
    if (currentIndex + 1 >= rounds.length) {
      setIsGameOver(true);
      return;
    }
    setCurrentIndex((i) => i + 1);
    setUsedHint(false);
    setLastResult(null);
  };

  return (
    <div className="relative w-full h-[100dvh] min-h-[100dvh] overflow-hidden bg-black font-sans text-white select-none touch-none">
      <LineMap round={currentRound} result={lastResult} />

      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between pointer-events-none px-6 pt-[max(0.875rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 drop-shadow-md">
          <span className="text-xs uppercase tracking-widest text-neutral-400 font-semibold">
            Chicago L Tap
          </span>
        </div>
        {!isGameOver && (
          <div className="text-xs font-mono tracking-tight text-neutral-400 flex items-center gap-3 drop-shadow-md">
            <span>
              Round {currentIndex + 1}/{rounds.length}
            </span>
            <span className="text-neutral-200 font-bold">
              {formatScore(score)} {score === 1 ? 'pt' : 'pts'}
            </span>
          </div>
        )}
      </header>

      {!isGameOver && !lastResult && currentRound && (
        <div className="absolute top-[max(3.25rem,calc(env(safe-area-inset-top)+2.5rem))] left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-in fade-in zoom-in-95 duration-200 w-[90%] max-w-md">
          <div className="bg-neutral-900/90 backdrop-blur-xl border border-white/10 px-5 py-3 rounded-2xl shadow-2xl text-center">
            <span
              className="text-[10px] uppercase tracking-widest font-bold block mb-1"
              style={{ color: currentRound.pattern.color }}
            >
              What's the missing station?
            </span>
            <h1 className="text-base sm:text-lg font-black text-white tracking-tight leading-tight">
              {roundPrompt(currentRound)}
            </h1>
            {usedHint && (
              <p className="text-[11px] text-amber-300/90 mt-1 font-medium">
                Starts with "{currentRound.answer.name[0]}"
              </p>
            )}
          </div>
        </div>
      )}

      {!isGameOver && lastResult && (
        <div className="absolute top-[max(3.25rem,calc(env(safe-area-inset-top)+2.5rem))] left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-in fade-in slide-in-from-top-3 duration-300 w-[92%] max-w-md">
          <div className="bg-neutral-950/90 backdrop-blur-2xl border border-white/12 px-5 py-3.5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-center">
            {lastResult.isCorrect ? (
              <div className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 inline-flex items-center justify-center text-xs font-black">
                  ✓
                </span>
                <span className="text-sm font-bold text-white tracking-tight">
                  That's {dn(lastResult.round.answer.name)}
                  {lastResult.usedHint && (
                    <span className="text-amber-300/80 font-semibold"> · +0.5 (hint)</span>
                  )}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center justify-center gap-2 text-xs">
                  <span className="text-rose-400 font-bold">✕</span>
                  <span className="text-neutral-300 font-medium">
                    You said {lastResult.guess?.name ?? '—'}
                  </span>
                </div>
                <span className="text-sm font-bold text-white">
                  It's {dn(lastResult.round.answer.name)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {!isGameOver && !lastResult && currentRound && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-20 pointer-events-auto pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] flex flex-col items-center gap-2 w-[92%] max-w-sm">
          <AnswerInput
            disabled={false}
            excludeIds={new Set(currentRound.after ? [currentRound.before.id, currentRound.after.id] : [currentRound.before.id])}
            onSubmit={handleGuess}
          />
          {!usedHint && (
            <button
              onClick={() => setUsedHint(true)}
              className="px-5 py-2 min-h-[38px] bg-neutral-900/90 backdrop-blur-xl border border-white/12 text-amber-300 font-semibold text-xs rounded-full shadow-2xl active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer touch-manipulation"
            >
              <span>💡 Hint</span>
              <span className="text-neutral-500 font-normal">−½ pt</span>
            </button>
          )}
        </div>
      )}

      {!isGameOver && lastResult && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-20 pointer-events-auto pb-[max(2rem,calc(env(safe-area-inset-bottom)+1.25rem))]">
          <button
            onClick={handleNext}
            className="px-7 py-3 min-h-[48px] bg-white text-black font-semibold text-sm rounded-full shadow-2xl hover:bg-neutral-200 active:scale-95 transition-all flex items-center gap-2 cursor-pointer touch-manipulation"
          >
            <span>{currentIndex + 1 >= rounds.length ? 'Finish' : 'Next'}</span>
            <span>→</span>
          </button>
        </div>
      )}

      {isGameOver && (
        <div className="absolute inset-0 z-30 bg-black/85 backdrop-blur-lg flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="text-center max-w-sm w-full pb-[env(safe-area-inset-bottom)]">
            <span className="text-xs uppercase tracking-widest text-neutral-400 font-semibold block mb-2">
              Completed
            </span>
            <h2 className="text-6xl font-black text-white tracking-tighter mb-2">
              {formatScore(score)}
              <span className="text-2xl font-medium text-neutral-500"> / {rounds.length}</span>
            </h2>
            <p className="text-sm text-neutral-400 mb-4">
              {score >= 8
                ? "You've got the whole system memorized."
                : score >= 5
                ? 'Solid L knowledge — a few branches to brush up on.'
                : 'Time to ride the whole system end to end.'}
            </p>

            <div className="text-2xl leading-none tracking-[0.15em] mb-6 break-words">
              {history.map(roundEmoji).join('')}
            </div>

            <ShareRow history={history} score={score} />

            <button
              onClick={startNewGame}
              className="w-full py-3.5 min-h-[48px] bg-white text-black font-bold text-sm rounded-xl hover:bg-neutral-200 active:scale-98 transition-all shadow-xl cursor-pointer touch-manipulation"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
