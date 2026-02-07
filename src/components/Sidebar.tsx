import { useGameStore } from '../store/gameStore';
import { getStations, getNeighbors } from '../data/graph';
import { QUESTION_POOL } from '../questions/questionPool';
import { canAskCategory, getCooldownRemaining } from '../questions/cooldown';
import { stationMatchesConstraints } from '../engine/seekerLoop';

export default function Sidebar() {
  const phase = useGameStore((s) => s.phase);
  const playerRole = useGameStore((s) => s.playerRole);
  const playerStationId = useGameStore((s) => s.playerStationId);
  const hidingZone = useGameStore((s) => s.hidingZone);
  const settleHere = useGameStore((s) => s.settleHere);
  const startSeeking = useGameStore((s) => s.startSeeking);
  const isAISeeking = useGameStore((s) => s.isAISeeking);
  const seekerStationId = useGameStore((s) => s.seekerStationId);
  const questionsAsked = useGameStore((s) => s.questionsAsked);
  const constraints = useGameStore((s) => s.constraints);
  const cooldownTracker = useGameStore((s) => s.cooldownTracker);
  const clock = useGameStore((s) => s.clock);
  const seekerAskQuestion = useGameStore((s) => s.seekerAskQuestion);
  const seekerTravelTo = useGameStore((s) => s.seekerTravelTo);

  if (phase === 'setup' || !playerStationId) return null;

  const stations = getStations();
  const currentStation = stations[playerStationId];
  const seekerStation = seekerStationId ? stations[seekerStationId] : null;

  // Seeker mode sidebar
  if (playerRole === 'seeker' && phase === 'seeking') {
    const neighbors = getNeighbors(playerStationId);

    // Count candidate stations matching all constraints
    const candidateCount = Object.entries(stations).filter(([, st]) =>
      stationMatchesConstraints(
        { lat: st.lat, lng: st.lng, name: st.name, country: st.country, connections: st.connections },
        constraints,
      ),
    ).length;

    // Check which questions have been asked
    const askedQuestionIds = new Set(
      questionsAsked
        .map((q) => QUESTION_POOL.find((p) => p.text === q.question)?.id)
        .filter(Boolean),
    );

    return (
      <div className="absolute bottom-4 left-4 z-10 bg-gray-900/95 backdrop-blur text-white p-4 rounded-lg shadow-xl border border-gray-700 min-w-[260px] max-h-[80vh] overflow-y-auto">
        {/* Your Station */}
        <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-1">Your Station</h3>
        <p className="font-bold text-amber-400">{currentStation?.name ?? playerStationId}</p>
        <p className="text-sm text-gray-400 mb-3">{currentStation?.country}</p>

        {/* Candidates */}
        <div className="text-sm text-cyan-400 mb-3">
          {candidateCount} candidate{candidateCount !== 1 ? 's' : ''} remaining
        </div>

        {/* Travel */}
        <div className="border-t border-gray-700 pt-3 mb-3">
          <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2">Travel</h3>
          <div className="flex flex-wrap gap-1">
            {neighbors.map((nId) => {
              const nStation = stations[nId];
              return (
                <button
                  key={nId}
                  onClick={() => seekerTravelTo(nId)}
                  className="px-2 py-1 text-xs text-amber-400 bg-gray-800 hover:bg-gray-700 rounded border border-gray-600 transition-colors"
                >
                  {nStation?.name ?? nId}
                </button>
              );
            })}
          </div>
        </div>

        {/* Ask Question */}
        <div className="border-t border-gray-700 pt-3">
          <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2">Ask Question</h3>
          <div className="space-y-2">
            {QUESTION_POOL.map((q) => {
              const wasAsked = askedQuestionIds.has(q.id);
              const askedEntry = wasAsked
                ? questionsAsked.find((qa) => qa.question === q.text)
                : null;
              const canAsk =
                cooldownTracker &&
                canAskCategory(cooldownTracker, q.category, clock.gameMinutes);
              const cooldownLeft =
                cooldownTracker
                  ? getCooldownRemaining(cooldownTracker, q.category, clock.gameMinutes)
                  : 0;

              if (wasAsked && askedEntry) {
                return (
                  <div key={q.id} className="text-xs">
                    <p className="text-gray-500">{q.text}</p>
                    <p className="text-amber-400">{askedEntry.answer}</p>
                  </div>
                );
              }

              if (!canAsk && cooldownLeft > 0) {
                return (
                  <div key={q.id} className="text-xs">
                    <p className="text-gray-500">{q.text}</p>
                    <p className="text-gray-600">Cooldown: {Math.ceil(cooldownLeft)}m</p>
                  </div>
                );
              }

              return (
                <button
                  key={q.id}
                  onClick={() => seekerAskQuestion(q.id)}
                  className="w-full text-left px-2 py-1 text-xs text-white bg-gray-800 hover:bg-gray-700 rounded border border-gray-600 transition-colors"
                >
                  {q.text}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Hider mode sidebar (unchanged)
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
