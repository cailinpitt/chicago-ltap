import React, { useState } from 'react';
import { STATIONS } from '../data/lLines';
import { Station } from '../types/game';
import { searchStations } from '../utils/search';

interface AnswerInputProps {
  disabled: boolean;
  excludeIds: Set<string>;
  onSubmit: (station: Station) => void;
}

export const AnswerInput: React.FC<AnswerInputProps> = ({ disabled, excludeIds, onSubmit }) => {
  const [query, setQuery] = useState('');
  const pool = excludeIds.size ? STATIONS.filter((s) => !excludeIds.has(s.id)) : STATIONS;
  const suggestions = searchStations(pool, query);

  const pick = (s: Station) => {
    setQuery('');
    onSubmit(s);
  };

  return (
    <div className="w-full max-w-sm">
      <input
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={disabled}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type a station name…"
        className="w-full px-4 py-3 min-h-[48px] bg-neutral-900/90 backdrop-blur-xl border border-white/15 text-white placeholder-neutral-500 text-sm font-medium rounded-xl outline-none focus:border-sky-400/60 disabled:opacity-50"
      />
      {suggestions.length > 0 && (
        <div className="mt-2 bg-neutral-900/95 backdrop-blur-xl border border-white/12 rounded-xl shadow-2xl overflow-hidden">
          {suggestions.map((s) => (
            <button
              key={s.id}
              onClick={() => pick(s)}
              className="w-full text-left px-4 py-3 min-h-[44px] text-sm font-medium text-white hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer touch-manipulation border-b border-white/5 last:border-b-0"
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
