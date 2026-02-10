import { formatGameTime } from '../engine/gameLoop';

interface ReplayScrubberProps {
  currentTime: number;
  totalTime: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
}

export default function ReplayScrubber({
  currentTime,
  totalTime,
  isPlaying,
  onSeek,
  onTogglePlay,
}: ReplayScrubberProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <button
        onClick={onTogglePlay}
        className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white text-xs flex-shrink-0"
      >
        {isPlaying ? '\u23F8' : '\u25B6'}
      </button>

      <input
        type="range"
        min={0}
        max={Math.max(1, totalTime)}
        value={currentTime}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="flex-1 h-1 appearance-none bg-white/20 rounded-full cursor-pointer accent-red-500"
        style={{
          background: `linear-gradient(to right, #ef4444 ${(currentTime / Math.max(1, totalTime)) * 100}%, rgba(255,255,255,0.2) ${(currentTime / Math.max(1, totalTime)) * 100}%)`,
        }}
      />

      <span className="text-[10px] text-gray-400 tabular-nums flex-shrink-0">
        {formatGameTime(currentTime)} / {formatGameTime(totalTime)}
      </span>
    </div>
  );
}
