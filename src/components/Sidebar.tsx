import { useGameStore } from '../store/gameStore';
import { getStations } from '../data/graph';
import { QUESTION_POOL } from '../questions/questionPool';
import { canAskCategory, getCooldownRemaining } from '../questions/cooldown';
import { stationMatchesConstraints } from '../engine/seekerLoop';
import { canAfford, getCost } from '../engine/coinSystem';
import { findTransitTrainDwelling } from '../engine/transitPosition';
import { getRoutes } from '../engine/trainRoutes';

const TRAIN_TYPE_COLORS: Record<string, string> = {
  express: 'text-yellow-400',
  regional: 'text-blue-400',
  local: 'text-gray-400',
};

const CATEGORY_STYLE: Record<string, { color: string; dim: string; border: string; bg: string }> = {
  radar:     { color: 'text-green-400',  dim: 'text-green-400/60',  border: 'border-green-700/50', bg: 'bg-green-900/20' },
  relative:  { color: 'text-blue-400',   dim: 'text-blue-400/60',   border: 'border-blue-700/50',  bg: 'bg-blue-900/20' },
  precision: { color: 'text-purple-400', dim: 'text-purple-400/60', border: 'border-purple-700/50', bg: 'bg-purple-900/20' },
};

const QUESTION_ICONS: Record<string, string> = {
  'radar-100': '◎',
  'radar-200': '◉',
  'radar-500': '⊚',
  'rel-north': '↕',
  'rel-east': '↔',
  'prec-same-country': '⚑',
  'prec-hub': '⬡',
  'prec-name-am': 'Aa',
};

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
  const coinBudget = useGameStore((s) => s.coinBudget);
  const playerTransit = useGameStore((s) => s.playerTransit);
  const seekerMode = useGameStore((s) => s.seekerMode);
  const setHoveredRadarRadius = useGameStore((s) => s.setHoveredRadarRadius);
  const visitedStations = useGameStore((s) => s.visitedStations);
  const seekerTransit = useGameStore((s) => s.seekerTransit);
  const seekerNextActionTime = useGameStore((s) => s.seekerNextActionTime);
  const seekerTravelQueue = useGameStore((s) => s.seekerTravelQueue);
  const getOffAtNextStation = useGameStore((s) => s.getOffAtNextStation);
  const stayOnTrain = useGameStore((s) => s.stayOnTrain);

  if (phase === 'setup' || !playerStationId) return null;

  const stations = getStations();
  const currentStation = stations[playerStationId];
  const seekerStation = seekerStationId ? stations[seekerStationId] : null;

  // Seeker mode sidebar
  if (playerRole === 'seeker' && phase === 'seeking') {
    // Candidate stations matching all constraints, excluding visited
    const candidates = Object.entries(stations).filter(([id, st]) =>
      !visitedStations.has(id) &&
      stationMatchesConstraints(
        { lat: st.lat, lng: st.lng, name: st.name, country: st.country, connections: st.connections },
        constraints,
      ),
    );
    const candidateCount = candidates.length;

    // Check which questions have been asked
    const askedQuestionIds = new Set(
      questionsAsked
        .map((q) => QUESTION_POOL.find((p) => p.text === q.question)?.id)
        .filter(Boolean),
    );

    const inTransit = !!playerTransit;

    return (
      <div className="absolute bottom-4 left-4 z-10 bg-[#0a1a3a]/95 backdrop-blur text-white p-3 rounded-lg shadow-xl border border-[#1a3a6a]/60 w-[280px] max-h-[80vh] overflow-y-auto">
        {/* Your Station */}
        <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-1">Your Station</h3>
        <p className="font-bold text-[#ffbf40]">{currentStation?.name ?? playerStationId}</p>
        <p className="text-sm text-gray-400 mb-3">{currentStation?.country}</p>

        {/* Transit indicator */}
        {inTransit && playerTransit && (() => {
          const waiting = clock.gameMinutes < playerTransit.departureTime;
          const onTrain = !waiting;
          const waitLeft = Math.ceil(playerTransit.departureTime - clock.gameMinutes);
          const travelLeft = Math.ceil(playerTransit.arrivalTime - Math.max(clock.gameMinutes, playerTransit.departureTime));
          const canGetOff = onTrain && playerTransit.toStationId !== playerTransit.destinationStationId;
          const exiting = onTrain && playerTransit.toStationId === playerTransit.destinationStationId;
          const isDwelling = onTrain && findTransitTrainDwelling(playerTransit, clock.gameMinutes);
          // Look up the actual route terminus (not just the player's destination slice)
          const routeInfo = (() => {
            if (!playerTransit.routeId) return { isTerminus: true, terminus: null as string | null };
            const route = getRoutes().find(r => r.id === playerTransit.routeId);
            if (!route) return { isTerminus: true, terminus: null };
            const lastFwd = route.stations[route.stations.length - 1];
            const lastRev = route.stations[0];
            const isTerminus = playerTransit.toStationId === lastFwd || playerTransit.toStationId === lastRev;
            // Determine which direction we're traveling to find the terminus
            const from = playerTransit.fromStationId;
            const fwdIdx = route.stations.indexOf(from);
            const revStations = [...route.stations].reverse();
            const revIdx = revStations.indexOf(from);
            const nextStation = playerTransit.toStationId;
            const fwdNextIdx = route.stations.indexOf(nextStation);
            if (fwdIdx >= 0 && fwdNextIdx > fwdIdx) return { isTerminus, terminus: lastFwd };
            if (revIdx >= 0) return { isTerminus, terminus: revStations[revStations.length - 1] };
            return { isTerminus, terminus: lastFwd };
          })();
          const canStay = exiting && !routeInfo.isTerminus;
          const bgClass = waiting ? 'bg-yellow-900/50 border-yellow-700' : exiting ? 'bg-red-900/50 border-red-700' : isDwelling ? 'bg-green-900/50 border-green-700' : 'bg-blue-900/50 border-blue-700';
          const labelClass = waiting ? 'text-yellow-400' : exiting ? 'text-red-400' : isDwelling ? 'text-green-400' : 'text-blue-400';
          const label = waiting ? 'Waiting for Departure' : exiting ? 'Exiting at Next Stop' : isDwelling ? 'Stopped at Station' : 'In Transit';
          const trainTerminus = routeInfo.terminus;
          return (
            <div className={`${bgClass} border rounded p-2 mb-3`}>
              <p className={`text-xs font-medium ${labelClass}`}>
                {label}
              </p>
              <p className="text-xs text-gray-300">
                {exiting ? 'Getting off at: ' : 'Next: '}{stations[playerTransit.toStationId]?.name ?? playerTransit.toStationId}
              </p>
              {!exiting && playerTransit.destinationStationId && playerTransit.destinationStationId !== playerTransit.toStationId && (
                <p className="text-xs text-gray-500">
                  Destination: {stations[playerTransit.destinationStationId]?.name ?? playerTransit.destinationStationId}
                </p>
              )}
              {trainTerminus && trainTerminus !== playerTransit.destinationStationId && (
                <p className="text-xs text-gray-500">
                  Train terminates: {stations[trainTerminus]?.name ?? trainTerminus}
                </p>
              )}
              <p className="text-xs text-gray-400">
                <span className={TRAIN_TYPE_COLORS[playerTransit.trainType]}>{playerTransit.trainType}</span>
                {waiting
                  ? <>{' '}— Departs in {waitLeft}min, then {travelLeft}min travel</>
                  : <>{' '}— Arriving in {Math.ceil(playerTransit.arrivalTime - clock.gameMinutes)}min</>
                }
              </p>
              {canGetOff && (
                <button
                  onClick={getOffAtNextStation}
                  className="mt-1.5 w-full px-2 py-1 text-xs font-medium text-red-400 bg-red-900/30 hover:bg-red-900/50 border border-red-700/50 rounded transition-colors"
                >
                  {isDwelling ? 'Get off now!' : `Get off at ${stations[playerTransit.toStationId]?.name ?? playerTransit.toStationId}`}
                </button>
              )}
              {canStay && (
                <button
                  onClick={stayOnTrain}
                  className="mt-1.5 w-full px-2 py-1 text-xs font-medium text-green-400 bg-green-900/30 hover:bg-green-900/50 border border-green-700/50 rounded transition-colors"
                >
                  Stay on train
                </button>
              )}
            </div>
          );
        })()}

        {/* Coin budget */}
        {coinBudget && (
          <div className="text-sm text-[#ffbf40] mb-2">
            Coins: {coinBudget.remaining}/{coinBudget.total}
          </div>
        )}

        {/* Candidates */}
        <div className="text-sm text-cyan-400 mb-3">
          <p>{candidateCount} candidate{candidateCount !== 1 ? 's' : ''} remaining</p>
          {candidateCount > 0 && candidateCount < 6 && (
            <ul className="mt-1 text-xs text-cyan-300/80 space-y-0.5">
              {candidates.map(([id, st]) => (
                <li key={id}>• {st.name}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Ask Question */}
        <div className="border-t border-[#1a3a6a]/40 pt-4 mt-4">
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
              const cost = getCost(q.category);
              const affordable = coinBudget ? canAfford(coinBudget, q.category) : true;

              const icon = QUESTION_ICONS[q.id] ?? '?';
              const cat = CATEGORY_STYLE[q.category] ?? CATEGORY_STYLE.radar;

              if (wasAsked && askedEntry) {
                return (
                  <div key={q.id} className={`flex items-start gap-1.5 text-xs px-2 py-1 rounded border ${cat.border} ${cat.bg} opacity-60`}>
                    <span className={`${cat.dim} shrink-0 w-4 text-center font-bold`}>{icon}</span>
                    <div className="min-w-0">
                      <p className="text-gray-500 truncate">{q.text}</p>
                      <p className="text-[#ffbf40] font-medium">{askedEntry.answer}</p>
                    </div>
                  </div>
                );
              }

              if (!canAsk && cooldownLeft > 0) {
                return (
                  <div key={q.id} className={`flex items-start gap-1.5 text-xs px-2 py-1 rounded border border-[#1a3a6a]/30 opacity-40`}>
                    <span className="text-gray-600 shrink-0 w-4 text-center font-bold">{icon}</span>
                    <div className="min-w-0">
                      <p className="text-gray-500 truncate">{q.text}</p>
                      <p className="text-gray-600">Cooldown: {Math.ceil(cooldownLeft)}m</p>
                    </div>
                  </div>
                );
              }

              if (!affordable) {
                return (
                  <div key={q.id} className={`flex items-start gap-1.5 text-xs px-2 py-1 rounded border border-[#1a3a6a]/30 opacity-40`}>
                    <span className="text-gray-600 shrink-0 w-4 text-center font-bold">{icon}</span>
                    <div className="min-w-0">
                      <p className="text-gray-500 truncate">{q.text}</p>
                      <p className="text-red-400/60">Can't afford</p>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={q.id}
                  onClick={() => { setHoveredRadarRadius(null); seekerAskQuestion(q.id); }}
                  onMouseEnter={() => q.category === 'radar' && q.param && setHoveredRadarRadius(q.param)}
                  onMouseLeave={() => q.category === 'radar' && setHoveredRadarRadius(null)}
                  className={`w-full flex items-start gap-1.5 text-left px-2 py-1 text-xs rounded border ${cat.border} ${cat.bg} hover:brightness-125 transition-all`}
                >
                  <span className={`${cat.color} shrink-0 w-4 text-center font-bold`}>{icon}</span>
                  <span className="text-white min-w-0">{q.text} <span className="text-[#ffbf40]/80">({cost})</span></span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Hider mode sidebar
  return (
    <div className="absolute bottom-4 left-4 z-10 bg-[#0a1a3a]/95 backdrop-blur text-white p-3 rounded-lg shadow-xl border border-[#1a3a6a]/60 w-[280px]">
      <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-1">Your Station</h3>
      <p className="font-bold text-[#ffbf40]">{currentStation?.name ?? playerStationId}</p>
      <p className="text-sm text-gray-400 mb-3">{currentStation?.country}</p>

      {/* Transit indicator for hider */}
      {playerTransit && (() => {
        const waiting = clock.gameMinutes < playerTransit.departureTime;
        const onTrain = !waiting;
        const waitLeft = Math.ceil(playerTransit.departureTime - clock.gameMinutes);
        const travelLeft = Math.ceil(playerTransit.arrivalTime - Math.max(clock.gameMinutes, playerTransit.departureTime));
        const canGetOff = onTrain && playerTransit.toStationId !== playerTransit.destinationStationId;
        const exiting = onTrain && playerTransit.toStationId === playerTransit.destinationStationId;
        const isDwelling = onTrain && findTransitTrainDwelling(playerTransit, clock.gameMinutes);
        const routeInfo = (() => {
          if (!playerTransit.routeId) return { isTerminus: true, terminus: null as string | null };
          const route = getRoutes().find(r => r.id === playerTransit.routeId);
          if (!route) return { isTerminus: true, terminus: null };
          const lastFwd = route.stations[route.stations.length - 1];
          const lastRev = route.stations[0];
          const isTerminus = playerTransit.toStationId === lastFwd || playerTransit.toStationId === lastRev;
          const from = playerTransit.fromStationId;
          const fwdIdx = route.stations.indexOf(from);
          const revStations = [...route.stations].reverse();
          const revIdx = revStations.indexOf(from);
          const nextStation = playerTransit.toStationId;
          const fwdNextIdx = route.stations.indexOf(nextStation);
          if (fwdIdx >= 0 && fwdNextIdx > fwdIdx) return { isTerminus, terminus: lastFwd };
          if (revIdx >= 0) return { isTerminus, terminus: revStations[revStations.length - 1] };
          return { isTerminus, terminus: lastFwd };
        })();
        const canStay = exiting && !routeInfo.isTerminus;
        const bgClass = waiting ? 'bg-yellow-900/50 border-yellow-700' : exiting ? 'bg-red-900/50 border-red-700' : isDwelling ? 'bg-green-900/50 border-green-700' : 'bg-blue-900/50 border-blue-700';
        const labelClass = waiting ? 'text-yellow-400' : exiting ? 'text-red-400' : isDwelling ? 'text-green-400' : 'text-blue-400';
        const label = waiting ? 'Waiting for Departure' : exiting ? 'Exiting at Next Stop' : isDwelling ? 'Stopped at Station' : 'In Transit';
        const trainTerminus = routeInfo.terminus;
        return (
          <div className={`${bgClass} border rounded p-2 mb-3`}>
            <p className={`text-xs font-medium ${labelClass}`}>
              {label}
            </p>
            <p className="text-xs text-gray-300">
              {exiting ? 'Getting off at: ' : 'Next: '}{stations[playerTransit.toStationId]?.name ?? playerTransit.toStationId}
            </p>
            {!exiting && playerTransit.destinationStationId && playerTransit.destinationStationId !== playerTransit.toStationId && (
              <p className="text-xs text-gray-500">
                Destination: {stations[playerTransit.destinationStationId]?.name ?? playerTransit.destinationStationId}
              </p>
            )}
            {trainTerminus && trainTerminus !== playerTransit.destinationStationId && (
              <p className="text-xs text-gray-500">
                Train terminates: {stations[trainTerminus]?.name ?? trainTerminus}
              </p>
            )}
            <p className="text-xs text-gray-400">
              <span className={TRAIN_TYPE_COLORS[playerTransit.trainType]}>{playerTransit.trainType}</span>
              {waiting
                ? <>{' '}— Departs in {waitLeft}min, then {travelLeft}min travel</>
                : <>{' '}— Arriving in {Math.ceil(playerTransit.arrivalTime - clock.gameMinutes)}min</>
              }
            </p>
            {canGetOff && (
              <button
                onClick={getOffAtNextStation}
                className="mt-1.5 w-full px-2 py-1 text-xs font-medium text-red-400 bg-red-900/30 hover:bg-red-900/50 border border-red-700/50 rounded transition-colors"
              >
                {isDwelling ? 'Get off now!' : `Get off at ${stations[playerTransit.toStationId]?.name ?? playerTransit.toStationId}`}
              </button>
            )}
            {canStay && (
              <button
                onClick={stayOnTrain}
                className="mt-1.5 w-full px-2 py-1 text-xs font-medium text-green-400 bg-green-900/30 hover:bg-green-900/50 border border-green-700/50 rounded transition-colors"
              >
                Stay on train
              </button>
            )}
          </div>
        );
      })()}

      {/* Hiding phase: time remaining + hide button */}
      {phase === 'hiding' && (() => {
        const HIDING_TIME_LIMIT = 240; // 4 game-hours
        const timeLeft = Math.max(0, Math.ceil(HIDING_TIME_LIMIT - clock.gameMinutes));
        const hoursLeft = Math.floor(timeLeft / 60);
        const minsLeft = timeLeft % 60;
        const onTheTrain = playerTransit && clock.gameMinutes >= playerTransit.departureTime;
        return (
          <>
            <div className="text-sm text-gray-400 mb-2">
              Time to hide: <span className={`font-mono ${timeLeft <= 30 ? 'text-red-400 font-bold' : 'text-white'}`}>{hoursLeft}h {minsLeft.toString().padStart(2, '0')}m</span>
            </div>
            {!onTheTrain && (
              <button
                onClick={() => { settleHere(); setTimeout(() => startSeeking(), 50); }}
                className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-medium transition-colors shadow-md shadow-emerald-500/20"
              >
                Hide Here — Start Seeking
              </button>
            )}
          </>
        );
      })()}

      {phase === 'seeking' && (
        <div className="border-t border-[#1a3a6a]/40 pt-4 mt-4 space-y-2">
          <h3 className="text-xs text-gray-400 uppercase tracking-wide">Seeking Phase</h3>

          {seekerStation && (
            <div>
              <p className="text-xs text-gray-500">Seeker at:</p>
              <p className="text-sm text-red-400 font-medium">{seekerStation.name}</p>
            </div>
          )}

          {seekerMode === 'consensus' && (
            <div className="text-xs text-purple-400">
              Dual seekers (consensus mode)
            </div>
          )}

          {coinBudget && (
            <div className="text-xs text-[#ffbf40]">
              Seeker coins: {coinBudget.remaining}/{coinBudget.total}
            </div>
          )}

          {/* Seeker status — always show what the AI is doing */}
          {(() => {
            if (isAISeeking) {
              return (
                <div className="flex items-center gap-2 text-xs text-[#ffbf40]">
                  <span className="w-2 h-2 rounded-full bg-[#ffbf40] animate-pulse" />
                  {seekerMode === 'consensus' ? 'Seekers deliberating...' : 'AI is thinking...'}
                </div>
              );
            }
            if (seekerTransit) {
              const toName = stations[seekerTransit.toStationId]?.name ?? seekerTransit.toStationId;
              const waiting = clock.gameMinutes < seekerTransit.departureTime;
              const queueCount = seekerTravelQueue.length;
              if (waiting) {
                const waitLeft = Math.max(0, Math.ceil(seekerTransit.departureTime - clock.gameMinutes));
                return (
                  <div className="flex items-center gap-2 text-xs text-yellow-400">
                    <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                    Waiting for train to {toName} — {waitLeft}m
                    {queueCount > 0 && <span className="text-gray-500">(+{queueCount} hop{queueCount > 1 ? 's' : ''})</span>}
                  </div>
                );
              }
              const minsLeft = Math.max(0, Math.ceil(seekerTransit.arrivalTime - clock.gameMinutes));
              return (
                <div className="flex items-center gap-2 text-xs text-blue-400">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  In transit to {toName} — {minsLeft}m
                  {queueCount > 0 && <span className="text-gray-500">(+{queueCount} hop{queueCount > 1 ? 's' : ''})</span>}
                </div>
              );
            }
            if (seekerNextActionTime > clock.gameMinutes) {
              const minsLeft = Math.max(0, Math.ceil(seekerNextActionTime - clock.gameMinutes));
              return (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
                  Idle — next action in {minsLeft}m
                </div>
              );
            }
            return (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full bg-gray-500" />
                Ready
              </div>
            );
          })()}

          {questionsAsked.length > 0 && (
            <div>
              <p className="text-xs text-gray-500">Last question:</p>
              <p className="text-xs text-gray-300 truncate">
                {questionsAsked[questionsAsked.length - 1].question}
              </p>
              <p className="text-xs text-[#ffbf40] truncate">
                {questionsAsked[questionsAsked.length - 1].answer}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
