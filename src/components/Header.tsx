import { useGameStore } from '../store/gameStore';
import { formatGameTime } from '../engine/gameLoop';

export default function Header() {
  const phase = useGameStore((s) => s.phase);
  const clock = useGameStore((s) => s.clock);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const togglePause = useGameStore((s) => s.togglePause);
  const coinBudget = useGameStore((s) => s.coinBudget);
  const seekerMode = useGameStore((s) => s.seekerMode);

  if (phase === 'setup') return null;

  const phaseLabel = {
    hiding: 'HIDING PHASE',
    seeking: 'SEEKING PHASE',
    round_end: 'ROUND END',
  }[phase] ?? phase.toUpperCase();

  const phaseColor = {
    hiding: 'text-emerald-400',
    seeking: 'text-rose-400',
    round_end: 'text-[#ffbf40]',
  }[phase] ?? 'text-white';

  return (
    <div className="relative md:absolute md:top-0 md:left-0 md:right-0 z-10 bg-[#0a1a3a]/95 backdrop-blur border-b border-[#1a3a6a]/60 px-4 py-2 flex items-center justify-between safe-top">
      <div className="flex items-center gap-2 md:gap-4">
        <span className="font-mono text-sm font-bold text-gray-300">JET LAG</span>
        <span className="hidden md:inline text-[#ffbf40] text-sm">{'\u00B7'}</span>
        <span className={`hidden md:inline font-bold text-sm ${phaseColor}`}>{phaseLabel}</span>
        {seekerMode === 'consensus' && phase === 'seeking' && (
          <span className="hidden md:inline text-xs text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded">DUAL SEEKERS</span>
        )}
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {coinBudget && (
          <span className="hidden md:inline font-mono text-xs md:text-sm text-[#ffbf40]">
            Coins: {coinBudget.remaining}/{coinBudget.total}
          </span>
        )}

        <span className="hidden md:inline font-mono text-lg md:text-xl text-white">
          {formatGameTime(clock.gameMinutes)}
        </span>

        <div className="flex items-center gap-2 md:gap-1">
          {[1, 2, 5, 10, 20].map((speed) => (
            <button
              key={speed}
              onClick={() => setSpeed(speed)}
              className={`px-3 py-1 text-xs rounded font-mono min-w-[36px] md:px-2 md:py-0.5 md:min-w-0 md:min-h-0 flex items-center justify-center ${
                clock.speed === speed
                  ? 'bg-[#ffbf40] text-[#061e45]'
                  : 'bg-[#0c2a52] text-[#8ba4c4] hover:bg-[#12356a] active:bg-[#12356a]'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>

        <button
          onClick={togglePause}
          className={`px-2 py-1 text-xs rounded min-w-[32px] md:min-w-[44px] md:min-h-[44px] flex items-center justify-center ${clock.paused ? 'bg-rose-500 text-white active:bg-rose-600' : 'bg-[#0c2a52] text-[#a0b8d4] hover:bg-[#12356a] active:bg-[#12356a]'}`}
        >
          {clock.paused ? '▶' : '⏸'}
        </button>
      </div>
    </div>
  );
}
