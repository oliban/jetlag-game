import { useGameStore } from '../store/gameStore';
import { getStations } from '../data/graph';

export default function Sidebar() {
  const phase = useGameStore((s) => s.phase);
  const playerStationId = useGameStore((s) => s.playerStationId);
  const hidingZone = useGameStore((s) => s.hidingZone);
  const settleHere = useGameStore((s) => s.settleHere);
  const startSeeking = useGameStore((s) => s.startSeeking);
  const isAISeeking = useGameStore((s) => s.isAISeeking);
  const seekerStationId = useGameStore((s) => s.seekerStationId);
  const questionsAsked = useGameStore((s) => s.questionsAsked);

  if (phase === 'setup' || !playerStationId) return null;

  const stations = getStations();
  const currentStation = stations[playerStationId];
  const seekerStation = seekerStationId ? stations[seekerStationId] : null;

  return (
    <div className="absolute bottom-4 left-4 z-10 bg-gray-900/95 backdrop-blur text-white p-4 rounded-lg shadow-xl border border-gray-700 min-w-[220px]">
      <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-1">Your Station</h3>
      <p className="font-bold text-amber-400">{currentStation?.name ?? playerStationId}</p>
      <p className="text-sm text-gray-400 mb-3">{currentStation?.country}</p>

      {hidingZone && (
        <div className="text-sm text-green-400 flex items-center gap-1 mb-3">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Hiding Zone Active
        </div>
      )}

      {phase === 'hiding' && !hidingZone && (
        <button
          onClick={settleHere}
          className="w-full px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-medium transition-colors"
        >
          Settle Here
        </button>
      )}

      {phase === 'hiding' && hidingZone && (
        <button
          onClick={startSeeking}
          className="w-full px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium transition-colors"
        >
          Start Seeking Phase
        </button>
      )}

      {phase === 'seeking' && (
        <div className="border-t border-gray-700 pt-3 mt-1 space-y-2">
          <h3 className="text-xs text-gray-400 uppercase tracking-wide">Seeking Phase</h3>

          {seekerStation && (
            <div>
              <p className="text-xs text-gray-500">Seeker at:</p>
              <p className="text-sm text-red-400 font-medium">{seekerStation.name}</p>
            </div>
          )}

          {isAISeeking && (
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              AI is thinking...
            </div>
          )}

          {questionsAsked.length > 0 && (
            <div>
              <p className="text-xs text-gray-500">Last question:</p>
              <p className="text-xs text-gray-300 truncate">
                {questionsAsked[questionsAsked.length - 1].question}
              </p>
              <p className="text-xs text-amber-400 truncate">
                {questionsAsked[questionsAsked.length - 1].answer}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
