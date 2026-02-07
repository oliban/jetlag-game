import { useGameStore } from '../store/gameStore';
import { formatGameTime } from '../engine/gameLoop';

export default function RoundEndScreen() {
  const phase = useGameStore((s) => s.phase);
  const gameResult = useGameStore((s) => s.gameResult);
  const gameMinutes = useGameStore((s) => s.clock.gameMinutes);
  const questionsAsked = useGameStore((s) => s.questionsAsked);
  const transitionPhase = useGameStore((s) => s.transitionPhase);
  const playerRole = useGameStore((s) => s.playerRole);

  if (phase !== 'round_end' || !gameResult) return null;

  const seekerWon = gameResult === 'seeker_wins';
  const playerWon =
    (playerRole === 'hider' && !seekerWon) ||
    (playerRole === 'seeker' && seekerWon);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl text-center animate-scale-in">
        {/* Result icon */}
        <div
          className={`text-6xl mb-4 ${seekerWon ? 'animate-bounce' : ''}`}
        >
          {seekerWon ? '!' : '?'}
        </div>

        {/* Title */}
        <h2
          className={`text-2xl font-bold mb-2 ${
            playerWon ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {seekerWon
            ? (playerRole === 'seeker' ? 'You found the hider!' : 'The seeker found you!')
            : (playerRole === 'hider' ? 'You stayed hidden!' : 'The hider escaped!')}
        </h2>

        {/* Subtitle */}
        <p className="text-gray-400 mb-6">
          {seekerWon
            ? `Found in ${formatGameTime(gameMinutes)}`
            : `Survived for ${formatGameTime(gameMinutes)}`}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-2xl font-bold text-white">
              {formatGameTime(gameMinutes)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Game Time</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-2xl font-bold text-white">
              {questionsAsked.length}
            </p>
            <p className="text-xs text-gray-500 mt-1">Questions Asked</p>
          </div>
        </div>

        {/* Play again */}
        <button
          onClick={() => transitionPhase('setup')}
          className="w-full px-4 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors text-lg"
        >
          Play Again
        </button>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        .animate-scale-in { animation: scale-in 0.3s ease-out; }
      `}</style>
    </div>
  );
}
