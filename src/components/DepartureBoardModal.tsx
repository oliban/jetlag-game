import { useState, useRef, useCallback, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { getStations } from '../data/graph';
import { getUpcomingDepartures, type RouteDeparture } from '../engine/trainRoutes';
import { formatGameTime } from '../engine/gameLoop';

const TRAIN_TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  express: { label: 'EXP', color: 'text-[#ffbf40]', bg: 'bg-[#ffbf40]/15' },
  regional: { label: 'REG', color: 'text-blue-400', bg: 'bg-blue-400/15' },
  local: { label: 'LOC', color: 'text-gray-400', bg: 'bg-gray-400/15' },
};

const HIDING_TIME_LIMIT = 240;

/** Format route description: "-> Terminus via Intermediate" */
function formatRouteDesc(
  remainingStops: RouteDeparture['remainingStops'],
  stations: ReturnType<typeof getStations>,
): string {
  if (remainingStops.length === 0) return '';
  const terminus = stations[remainingStops[remainingStops.length - 1].stationId];
  const terminusName = terminus?.name ?? remainingStops[remainingStops.length - 1].stationId;

  if (remainingStops.length <= 1) return terminusName;

  // Pick 1-2 intermediate stations to show as "via"
  const intermediates = remainingStops.slice(0, -1);
  let viaNames: string[];
  if (intermediates.length <= 2) {
    viaNames = intermediates.map(s => stations[s.stationId]?.name ?? s.stationId);
  } else {
    // Pick evenly spaced intermediates
    const mid = Math.floor(intermediates.length / 2);
    viaNames = [
      stations[intermediates[0].stationId]?.name ?? intermediates[0].stationId,
      stations[intermediates[mid].stationId]?.name ?? intermediates[mid].stationId,
    ];
  }
  return `${terminusName} via ${viaNames.join(', ')}`;
}

export default function DepartureBoardModal() {
  const phase = useGameStore((s) => s.phase);
  const playerRole = useGameStore((s) => s.playerRole);
  const playerStationId = useGameStore((s) => s.playerStationId);
  const playerTransit = useGameStore((s) => s.playerTransit);
  const hidingZone = useGameStore((s) => s.hidingZone);
  const clock = useGameStore((s) => s.clock);
  const travelViaRoute = useGameStore((s) => s.travelViaRoute);
  const seekerStationId = useGameStore((s) => s.seekerStationId);
  const seekerTransit = useGameStore((s) => s.seekerTransit);

  // Expand/collapse state for departure rows
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Drag state
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: -1, y: -1 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Initialize position to upper-right on first render
  useEffect(() => {
    if (pos.x === -1) {
      setPos({ x: window.innerWidth - 400, y: 56 });
    }
  }, [pos.x]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag from header
    if (!(e.target as HTMLElement).closest('[data-drag-handle]')) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 320, dragRef.current.origX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 100, dragRef.current.origY + dy)),
      });
    };
    const onMouseUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [pos]);

  // Don't show in setup or round_end
  if (phase === 'setup' || phase === 'round_end') return null;

  const stations = getStations();

  // When hider is watching the seeker during seeking phase, show seeker's departures
  const showingSeekerBoard = playerRole === 'hider' && phase === 'seeking' && !!seekerStationId;

  // Pick the relevant station and transit based on whose board we're showing
  const activeStationId = showingSeekerBoard ? seekerStationId : playerStationId;
  const activeTransit = showingSeekerBoard ? seekerTransit : playerTransit;

  if (!activeStationId) return null;

  // "On the train" means past the departure time; "waiting" means transit booked but not yet departed
  const waitingForDeparture = !!activeTransit && clock.gameMinutes < activeTransit.departureTime;
  const onTheTrain = !!activeTransit && clock.gameMinutes >= activeTransit.departureTime;

  // Determine which station's departures to show
  let boardStationId: string;
  let boardTime: number;
  let canTravel: boolean;

  if (onTheTrain && activeTransit) {
    // For multi-stop routes, show next intermediate station's board
    boardStationId = activeTransit.toStationId;
    boardTime = activeTransit.nextArrivalTime ?? activeTransit.arrivalTime;
    const hiderCanTravel = playerRole === 'hider' && phase === 'hiding' && !hidingZone;
    const seekerCanTravel = playerRole === 'seeker' && phase === 'seeking';
    canTravel = showingSeekerBoard ? false : (hiderCanTravel || seekerCanTravel);
  } else {
    // At station (or waiting for departure — still at station, can change mind)
    boardStationId = activeStationId;
    boardTime = clock.gameMinutes;
    const hiderCanTravel = playerRole === 'hider' && phase === 'hiding' && !hidingZone;
    const seekerCanTravel = playerRole === 'seeker' && phase === 'seeking';
    // Hider watching the seeker can't click to travel
    canTravel = showingSeekerBoard ? false : (hiderCanTravel || seekerCanTravel);
  }

  const boardStation = stations[boardStationId];

  // Get route-based departures
  const departures = getUpcomingDepartures(boardStationId, boardTime, 10);

  if (departures.length === 0) return null;

  const handleBoard = canTravel
    ? (dep: RouteDeparture, stopStationId: string) => {
        travelViaRoute(dep.route.id, stopStationId, dep.departureTime);
      }
    : undefined;

  return (
    <div
      ref={modalRef}
      onMouseDown={onMouseDown}
      className="fixed z-20"
      style={{ left: pos.x, top: pos.y, width: 380 }}
    >
      <div className="bg-[#061e45] border border-[#1a3a6a]/60 rounded-lg overflow-hidden shadow-2xl">
        {/* Current time bar -- always visible */}
        <div
          data-drag-handle
          className="bg-[#0a1a3a] px-3 py-1 flex justify-between items-center cursor-move select-none border-b border-[#0c2a52]"
        >
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">Current Time</span>
          <span className="text-sm font-bold text-white tabular-nums">{formatGameTime(clock.gameMinutes)}</span>
        </div>
        {/* Station header */}
        <div
          data-drag-handle
          className="bg-[#0c2a52] px-3 py-1.5 flex justify-between items-center cursor-move select-none"
        >
          <span className="text-xs font-bold text-[#ffbf40] uppercase tracking-wider truncate font-mono">
            {showingSeekerBoard && <span className="text-red-400 mr-1">Seeker</span>}
            {onTheTrain ? `\u2192 ${boardStation?.name ?? boardStationId}` : (boardStation?.name ?? boardStationId)}
          </span>
          <span className="text-[10px] text-gray-400 tabular-nums ml-2 shrink-0">
            {onTheTrain ? `arr ${formatGameTime(boardTime)}` : 'Departures'}
          </span>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[3.2rem_1fr_2.6rem_2.4rem_2.8rem_2.4rem] px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wide border-b border-[#0c2a52]">
          <span>Time</span>
          <span>Route</span>
          <span className="text-center">Type</span>
          <span className="text-right">Spd</span>
          <span className="text-right">Dur</span>
          <span className="text-right">In</span>
        </div>

        {/* Departure rows */}
        {departures.map((dep) => {
          const tl = TRAIN_TYPE_LABELS[dep.route.trainType];
          const routeDesc = formatRouteDesc(dep.remainingStops, stations);
          const minsUntil = Math.max(0, Math.ceil(dep.departureTime - clock.gameMinutes));
          const isDwelling = dep.arrivalTime <= clock.gameMinutes && dep.departureTime > clock.gameMinutes;
          const imminent = !isDwelling && minsUntil <= 5 && minsUntil > 0;
          const totalDur = dep.remainingStops.length > 0
            ? Math.round(dep.remainingStops[dep.remainingStops.length - 1].arrivalMin - dep.departureTime)
            : 0;

          // Block departures that arrive after hiding time limit
          const lastArrival = dep.remainingStops.length > 0
            ? dep.remainingStops[dep.remainingStops.length - 1].arrivalMin
            : dep.departureTime;
          const blocked = playerRole === 'hider' && phase === 'hiding' && lastArrival > HIDING_TIME_LIMIT;
          // Check if this is the currently selected departure
          const isSelected = waitingForDeparture && activeTransit?.routeId === dep.route.id
            && activeTransit?.departureTime === dep.departureTime;

          const canExpand = !blocked && dep.remainingStops.length > 0;
          const rowKey = `${dep.route.id}-${dep.direction}-${dep.departureTime}`;
          const isExpanded = expandedKey === rowKey;

          return (
            <div key={rowKey}>
              <div
                onClick={canExpand ? () => {
                  setExpandedKey(isExpanded ? null : rowKey);
                } : undefined}
                className={`grid grid-cols-[3.2rem_1fr_2.6rem_2.4rem_2.8rem_2.4rem] px-3 py-1 border-b border-[#0a1a3a] items-center ${isSelected ? 'bg-[#ffbf40]/10 border-l-2 border-l-[#ffbf40]' : ''} ${isExpanded ? 'bg-[#0c2a52]/60' : ''} ${imminent && !blocked ? 'animate-pulse' : ''} ${blocked ? 'opacity-40' : ''} ${canExpand ? 'cursor-pointer hover:bg-[#0c2a52]/80 transition-colors' : ''}`}
              >
                <span className={`text-xs tabular-nums font-medium ${blocked ? 'text-gray-600 line-through' : 'text-white'}`}>
                  {formatGameTime(dep.departureTime)}
                </span>
                <span className={`text-xs truncate pr-1 ${blocked ? 'text-gray-600 line-through' : 'text-[#ffbf40]'}`} title={routeDesc}>
                  {routeDesc}
                </span>
                <span className={`text-[10px] font-bold ${blocked ? 'text-gray-600' : tl.color} ${blocked ? 'bg-[#0c2a52]' : tl.bg} rounded text-center px-1 py-0.5 leading-none`}>
                  {tl.label}
                </span>
                <span className={`text-xs tabular-nums text-right ${blocked ? 'text-gray-600' : 'text-gray-500'}`}>
                  {dep.route.speed}
                </span>
                <span className={`text-xs tabular-nums text-right ${blocked ? 'text-gray-600 line-through' : 'text-gray-500'}`}>
                  {totalDur}m
                </span>
                <span className={`text-xs tabular-nums text-right ${blocked ? 'text-gray-600' : isDwelling ? 'text-green-400 font-bold' : imminent ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
                  {isDwelling ? 'BRD' : minsUntil === 0 ? 'NOW' : `${minsUntil}m`}
                </span>
              </div>

              {/* Expanded stop list — L-shape route line */}
              {isExpanded && (
                <div className="bg-[#081c3e] ml-5">
                  {dep.remainingStops.map((stop, i) => {
                    const stopStation = stations[stop.stationId];
                    const stopName = stopStation?.name ?? stop.stationId;
                    const durFromDep = Math.round(stop.arrivalMin - dep.departureTime);
                    const isLast = i === dep.remainingStops.length - 1;
                    const stopBlocked = playerRole === 'hider' && phase === 'hiding' && stop.arrivalMin > HIDING_TIME_LIMIT;
                    const stopClickable = handleBoard && !stopBlocked;

                    return (
                      <div
                        key={stop.stationId}
                        onClick={stopClickable ? (e) => {
                          e.stopPropagation();
                          handleBoard!(dep, stop.stationId);
                          setExpandedKey(null);
                        } : undefined}
                        className={`flex items-center text-xs ${stopBlocked ? 'opacity-40' : stopClickable ? 'cursor-pointer hover:bg-[#0c2a52]/80 transition-colors' : ''}`}
                      >
                        <span className="w-4 flex-shrink-0 text-gray-600 text-center font-mono leading-none">
                          {isLast ? '└' : '├'}
                        </span>
                        <span className={`flex-1 truncate py-1 ${isLast ? 'text-[#ffbf40] font-medium' : 'text-gray-300'}`}>
                          {stopName}
                        </span>
                        <span className="text-gray-500 tabular-nums ml-2 w-12 text-right">
                          {formatGameTime(stop.arrivalMin)}
                        </span>
                        <span className="text-gray-600 tabular-nums ml-2 w-10 text-right pr-3">
                          {durFromDep}m
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
