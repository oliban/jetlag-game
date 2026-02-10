import { useGameStore } from '../store/gameStore';
import { formatGameTime } from '../engine/gameLoop';
import { getStations } from '../data/graph';
import ReplayMiniMap from './ReplayMiniMap';

export default function RoundEndScreen() {
  const phase = useGameStore((s) => s.phase);
  const gameResult = useGameStore((s) => s.gameResult);
  const gameMinutes = useGameStore((s) => s.clock.gameMinutes);
  const questionsAsked = useGameStore((s) => s.questionsAsked);
  const transitionPhase = useGameStore((s) => s.transitionPhase);
  const playerRole = useGameStore((s) => s.playerRole);
  const hidingZone = useGameStore((s) => s.hidingZone);
  const seekerTravelHistory = useGameStore((s) => s.seekerTravelHistory);
  const seekerStartStationId = useGameStore((s) => s.seekerStartStationId);
  const playerTravelHistory = useGameStore((s) => s.playerTravelHistory);
  const playerStartStationId = useGameStore((s) => s.playerStartStationId);

  if (phase !== 'round_end' || !gameResult) return null;

  const seekerWon = gameResult === 'seeker_wins';
  const isFatalAccident = gameResult === 'fatal_accident';
  const isSeekerKilled = gameResult === 'seeker_killed';
  const playerWon =
    (playerRole === 'hider' && (gameResult === 'hider_wins' || gameResult === 'seeker_killed')) ||
    (playerRole === 'seeker' && gameResult === 'seeker_wins');

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0a1a3a] border border-[#1a3a6a]/60 rounded-xl p-5 md:p-8 max-w-2xl w-full mx-4 shadow-2xl text-center animate-scale-in max-h-[calc(100vh-2rem)] overflow-y-auto">
        {/* Result icon */}
        <div className={`rounded-full w-24 h-24 mx-auto mb-6 flex items-center justify-center ${
          isFatalAccident ? 'bg-red-500/10' :
          isSeekerKilled ? 'bg-emerald-500/10' :
          playerWon ? 'bg-emerald-500/10' : 'bg-rose-500/10'
        }`}>
          <span className={`text-5xl ${seekerWon ? 'animate-bounce' : ''}`}>
            {seekerWon ? '\uD83C\uDFAF' : isFatalAccident ? '\uD83D\uDCA5' : isSeekerKilled ? '\uD83C\uDF89' : '\uD83D\uDEE1\uFE0F'}
          </span>
        </div>

        {/* Title */}
        <h2
          className={`text-xl md:text-3xl font-bold mb-2 ${
            isFatalAccident ? 'text-red-400' :
            isSeekerKilled ? 'text-emerald-400' :
            playerWon ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {isFatalAccident ? 'Fatal Accident' :
           isSeekerKilled ? 'Seeker Crashed!' :
           seekerWon
            ? (playerRole === 'seeker' ? 'You found the hider!' : 'The seeker found you!')
            : (playerRole === 'hider' ? 'You stayed hidden!' : 'The hider escaped!')}
        </h2>

        {/* Subtitle */}
        {isFatalAccident ? (
          <p className="text-gray-400 mb-6">Your train was involved in a fatal accident.</p>
        ) : isSeekerKilled ? (
          <p className="text-gray-400 mb-6">The seeker's train was involved in a fatal accident. You win!</p>
        ) : (
          <>
            {seekerWon && hidingZone && (
              <p className="text-lg mb-1">
                <span className="text-gray-400">at </span>
                <span className="text-white font-medium">{getStations()[hidingZone.stationId]?.name ?? hidingZone.stationId}</span>
              </p>
            )}
            <p className="text-gray-400 mb-6">
              {seekerWon
                ? `Found in ${formatGameTime(gameMinutes)}`
                : `Survived for ${formatGameTime(gameMinutes)}`}
            </p>
          </>
        )}

        {/* Divider */}
        <div className={`h-px w-16 mx-auto mb-6 ${playerWon ? 'bg-emerald-500/40' : 'bg-rose-500/40'}`} />

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-[#0c2a52]/50 rounded-lg p-3 border border-[#1a3a6a]/40">
            <p className="text-xl font-bold text-white">
              {formatGameTime(gameMinutes)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{'\u23F1'} Game Time</p>
          </div>
          <div className="bg-[#0c2a52]/50 rounded-lg p-3 border border-[#1a3a6a]/40">
            <p className="text-xl font-bold text-white">
              {questionsAsked.length}
            </p>
            <p className="text-xs text-gray-500 mt-1">{'\u2753'} Questions</p>
          </div>
          <div className="bg-[#0c2a52]/50 rounded-lg p-3 border border-[#1a3a6a]/40">
            <p className={`text-xl font-bold ${playerRole === 'hider' ? 'text-[#ffbf40]' : 'text-rose-400'}`}>
              {playerRole === 'hider' ? 'Hider' : 'Seeker'}
            </p>
            <p className="text-xs text-gray-500 mt-1">Role</p>
          </div>
        </div>

        {/* Route Replay */}
        {(seekerTravelHistory.length > 0 || playerTravelHistory.length > 0) && hidingZone && (
          <div className="mb-6">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Route Replay</p>
            <ReplayMiniMap
              history={seekerTravelHistory}
              hiderStationId={hidingZone.stationId}
              seekerStartStationId={seekerStartStationId}
              totalGameMinutes={gameMinutes}
              gameResult={gameResult}
              playerHistory={playerTravelHistory}
              playerStartStationId={playerStartStationId}
              playerRole={playerRole}
            />
          </div>
        )}

        {/* Play again */}
        <button
          onClick={() => transitionPhase('setup')}
          className="w-full px-4 py-3 bg-[#ffbf40] hover:bg-[#ffbf40]/90 active:bg-[#ffbf40]/90 text-[#061e45] font-bold rounded-lg transition-colors text-lg"
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
