import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { QuestionCategory } from '../questions/questionPool';
import { getCooldownRemaining } from '../questions/cooldown';

const CATEGORY_STYLES: Record<QuestionCategory, { bg: string; text: string; label: string }> = {
  radar: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'RAD' },
  relative: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'REL' },
  precision: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'PRE' },
};

export default function QuestionLog() {
  const phase = useGameStore((s) => s.phase);
  const questionsAsked = useGameStore((s) => s.questionsAsked);
  const cooldownTracker = useGameStore((s) => s.cooldownTracker);
  const gameMinutes = useGameStore((s) => s.clock.gameMinutes);
  const [collapsed, setCollapsed] = useState(false);

  if (phase !== 'seeking') return null;

  const categories: QuestionCategory[] = ['radar', 'relative', 'precision'];

  return (
    <div className="hidden md:block absolute bottom-4 right-4 z-10 w-80">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between bg-[#0a1a3a]/95 backdrop-blur border border-[#1a3a6a]/60 rounded-t-lg px-3 py-2"
      >
        <span className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          Questions
          <span className="bg-[#ffbf40] text-[#061e45] text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {questionsAsked.length}
          </span>
        </span>
        <span className="text-gray-400 text-xs">
          {collapsed ? '\u25BC' : '\u25B2'}
        </span>
      </button>

      {!collapsed && (
        <div className="bg-[#0a1a3a]/95 backdrop-blur border border-t-0 border-[#1a3a6a]/60 rounded-b-lg">
          {/* Cooldown timers */}
          <div className="flex gap-2 px-3 py-2 border-b border-[#1a3a6a]/50">
            {categories.map((cat) => {
              const remaining = cooldownTracker
                ? getCooldownRemaining(cooldownTracker, cat, gameMinutes)
                : 0;
              const style = CATEGORY_STYLES[cat];
              return (
                <div
                  key={cat}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${style.bg}`}
                >
                  <span className={style.text}>{style.label}</span>
                  <span className={remaining > 0 ? 'text-gray-400' : 'text-emerald-400'}>
                    {remaining > 0 ? `${Math.ceil(remaining)}m` : 'ready'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Question list */}
          <div className="max-h-60 overflow-y-auto">
            {questionsAsked.length === 0 ? (
              <p className="text-gray-500 text-xs px-3 py-3 text-center">
                No questions asked yet
              </p>
            ) : (
              <div className="divide-y divide-[#1a3a6a]/50">
                {[...questionsAsked].reverse().map((q, i) => {
                  const style = q.category ? CATEGORY_STYLES[q.category as QuestionCategory] : null;
                  return (
                    <div key={i} className="px-3 py-2">
                      <div className="flex items-start gap-2">
                        {style && (
                          <span
                            className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-mono ${style.bg} ${style.text}`}
                          >
                            {style.label}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs text-gray-300 leading-snug">{q.question}</p>
                          <p className="text-xs text-[#ffbf40] mt-0.5 font-medium">{q.answer}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
