import { useState, useEffect, useRef } from 'react';
import type { TransitState, Station } from '../types/game';
import { findTransitTrainDwelling } from '../engine/transitPosition';
import { getRoutes } from '../engine/trainRoutes';
import { formatDuration, formatGameTime } from '../engine/gameLoop';
import { getStations } from '../data/graph';
import { useGameStore } from '../store/gameStore';

const TRAIN_TYPE_COLORS: Record<string, string> = {
  express: 'text-yellow-400',
  regional: 'text-blue-400',
  local: 'text-gray-400',
};

interface TransitIndicatorProps {
  playerTransit: TransitState;
  clock: { gameMinutes: number };
  stations: Record<string, Station>;
  getOffAtNextStation: () => void;
  stayOnTrain: () => void;
  queuedRoute?: { routeId: string; destinationStationId: string; departureTime: number } | null;
  transitBtnPy?: string;
}

export default function TransitIndicator({
  playerTransit,
  clock,
  stations,
  getOffAtNextStation,
  stayOnTrain,
  queuedRoute,
  transitBtnPy,
}: TransitIndicatorProps) {
  const btnPy = transitBtnPy ?? 'py-2 md:py-1';
  // "Missed!" animation state
  const [missedRoute, setMissedRoute] = useState<{ routeId: string; destinationStationId: string } | null>(null);
  const missedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (queuedRoute && clock.gameMinutes > queuedRoute.departureTime && !missedRoute) {
      // Departure passed — trigger missed animation
      setMissedRoute({ routeId: queuedRoute.routeId, destinationStationId: queuedRoute.destinationStationId });
      useGameStore.setState({ queuedRoute: null });
      missedTimerRef.current = setTimeout(() => {
        setMissedRoute(null);
      }, 3000);
    }
    return () => {
      if (missedTimerRef.current) clearTimeout(missedTimerRef.current);
    };
  }, [queuedRoute, clock.gameMinutes, missedRoute]);
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
  const trainRoute = playerTransit.routeId ? getRoutes().find(r => r.id === playerTransit.routeId) : undefined;

  return (
    <div className={`${bgClass} border rounded p-2 mb-3`}>
      <p className={`text-xs font-medium ${labelClass}`}>
        {label}
      </p>
      {trainRoute && (
        <p className="text-xs text-gray-500">
          <span className="font-mono text-gray-300">{trainRoute.id}</span>
          <span className="mx-1">·</span>
          <span className="text-gray-400">{trainRoute.operator}</span>
        </p>
      )}
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
          ? <>{' '}— Departs in {formatDuration(waitLeft)}, then {formatDuration(travelLeft)} travel</>
          : <>{' '}— Arriving in {formatDuration(playerTransit.arrivalTime - clock.gameMinutes)}</>
        }
      </p>
      {canGetOff && (
        <button
          onClick={getOffAtNextStation}
          className={`mt-1.5 w-full px-2 ${btnPy} text-xs font-medium text-red-400 bg-red-900/30 hover:bg-red-900/50 active:bg-red-900/50 border border-red-700/50 rounded transition-colors`}
        >
          {isDwelling ? 'Get off now!' : `Get off at ${stations[playerTransit.toStationId]?.name ?? playerTransit.toStationId}`}
        </button>
      )}
      {canStay && (
        <button
          onClick={stayOnTrain}
          className={`mt-1.5 w-full px-2 ${btnPy} text-xs font-medium text-green-400 bg-green-900/30 hover:bg-green-900/50 active:bg-green-900/50 border border-green-700/50 rounded transition-colors`}
        >
          Stay on train
        </button>
      )}
      {/* Queued connection */}
      {queuedRoute && (() => {
        const qRoute = getRoutes().find(r => r.id === queuedRoute.routeId);
        const stationMap = getStations();
        const destName = stationMap[queuedRoute.destinationStationId]?.name ?? queuedRoute.destinationStationId;
        return (
          <div className="mt-2 pt-2 border-t border-gray-700/50">
            <p className="text-[10px] text-purple-400 uppercase tracking-wide font-medium">Queued Connection</p>
            {qRoute && (
              <p className="text-xs text-gray-500">
                <span className="font-mono text-gray-300">{qRoute.id}</span>
                <span className="mx-1">·</span>
                <span className="text-gray-400">{qRoute.operator}</span>
              </p>
            )}
            <p className="text-xs text-gray-300">
              To {destName} · departs {formatGameTime(queuedRoute.departureTime)}
            </p>
          </div>
        );
      })()}
      {/* Missed connection animation */}
      {missedRoute && (() => {
        const stationMap = getStations();
        const destName = stationMap[missedRoute.destinationStationId]?.name ?? missedRoute.destinationStationId;
        return (
          <div className="mt-2 pt-2 border-t border-gray-700/50 animate-pulse">
            <p className="text-[10px] text-red-400 uppercase tracking-wide font-bold">
              Missed!
            </p>
            <p className="text-xs text-red-400/70 line-through">
              Connection to {destName}
            </p>
          </div>
        );
      })()}
    </div>
  );
}
