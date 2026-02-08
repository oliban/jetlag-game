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
    <div className="absolute top-0 left-0 right-0 z-10 bg-[#0a1a3a]/95 backdrop-blur border-b border-[#1a3a6a]/60 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <span className="font-mono text-sm font-bold text-gray-300">JET LAG</span>
        <span className="text-[#ffbf40] text-sm">{'\u00B7'}</span>
        <span className={`font-bold text-sm ${phaseColor}`}>{phaseLabel}</span>
        {seekerMode === 'consensus' && phase === 'seeking' && (
          <span className="text-xs text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded">DUAL SEEKERS</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {coinBudget && (
          <span className="font-mono text-sm text-[#ffbf40]">
            Coins: {coinBudget.remaining}/{coinBudget.total}
          </span>
        )}

        <span className="font-mono text-xl text-white">
          {formatGameTime(clock.gameMinutes)}
        </span>

        <div className="flex items-center gap-1">
          {[1, 2, 5, 10].map((speed) => (
            <button
              key={speed}
              onClick={() => setSpeed(speed)}
              className={`px-2 py-0.5 text-xs rounded font-mono ${
                clock.speed === speed
                  ? 'bg-[#ffbf40] text-[#061e45]'
                  : 'bg-[#0c2a52] text-[#8ba4c4] hover:bg-[#12356a]'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>

        <button
          onClick={togglePause}
          className={`px-2 py-0.5 text-xs rounded ${clock.paused ? 'bg-rose-500 text-white' : 'bg-[#0c2a52] text-[#a0b8d4] hover:bg-[#12356a]'}`}
        >
          {clock.paused ? '▶' : '⏸'}
        </button>
      </div>
    </div>
  );
}
