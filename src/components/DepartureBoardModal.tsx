import { useState, useRef, useCallback, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { getStations, getNeighbors } from '../data/graph';
import { getTravelInfo, type TravelInfo } from '../engine/trainSchedule';
import { formatGameTime } from '../engine/gameLoop';

const TRAIN_TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  express: { label: 'EXP', color: 'text-yellow-400', bg: 'bg-yellow-400/15' },
  regional: { label: 'REG', color: 'text-blue-400', bg: 'bg-blue-400/15' },
  local: { label: 'LOC', color: 'text-gray-400', bg: 'bg-gray-400/15' },
};

export default function DepartureBoardModal() {
  const phase = useGameStore((s) => s.phase);
  const playerRole = useGameStore((s) => s.playerRole);
  const playerStationId = useGameStore((s) => s.playerStationId);
  const playerTransit = useGameStore((s) => s.playerTransit);
  const hidingZone = useGameStore((s) => s.hidingZone);
  const clock = useGameStore((s) => s.clock);
  const seekerTravelTo = useGameStore((s) => s.seekerTravelTo);
  const travelTo = useGameStore((s) => s.travelTo);
  const seekerStationId = useGameStore((s) => s.seekerStationId);
  const seekerTransit = useGameStore((s) => s.seekerTransit);

  // Drag state
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: -1, y: -1 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Initialize position to upper-right on first render
  useEffect(() => {
    if (pos.x === -1) {
      setPos({ x: window.innerWidth - 300, y: 56 });
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
        x: Math.max(0, Math.min(window.innerWidth - 280, dragRef.current.origX + dx)),
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
    // Actually moving — show destination station departures
    boardStationId = activeTransit.toStationId;
    boardTime = activeTransit.arrivalTime;
    canTravel = false;
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
  const neighbors = getNeighbors(boardStationId);

  // When on the train, exclude the station we're coming from
  const filteredNeighbors = onTheTrain && activeTransit
    ? neighbors.filter((nId) => nId !== activeTransit.fromStationId)
    : neighbors;

  const departures = filteredNeighbors
    .map((nId) => ({ nId, info: getTravelInfo(boardStationId, nId, boardTime) }))
    .filter((r): r is { nId: string; info: TravelInfo } => r.info !== null)
    .sort((a, b) => a.info.departureTime - b.info.departureTime);

  if (departures.length === 0) return null;

  const handleSelect = canTravel
    ? (nId: string) => {
        if (playerRole === 'seeker') seekerTravelTo(nId);
        else travelTo(nId);
      }
    : undefined;

  return (
    <div
      ref={modalRef}
      onMouseDown={onMouseDown}
      className="fixed z-20"
      style={{ left: pos.x, top: pos.y, width: 280 }}
    >
      <div className="bg-gray-950 border border-gray-700 rounded-lg overflow-hidden shadow-2xl">
        {/* Current time bar — always visible */}
        <div
          data-drag-handle
          className="bg-gray-900 px-3 py-1 flex justify-between items-center cursor-move select-none border-b border-gray-800"
        >
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">Current Time</span>
          <span className="text-sm font-bold text-white tabular-nums">{formatGameTime(clock.gameMinutes)}</span>
        </div>
        {/* Station header */}
        <div
          data-drag-handle
          className="bg-gray-800 px-3 py-1.5 flex justify-between items-center cursor-move select-none"
        >
          <span className="text-xs font-bold text-white uppercase tracking-wider truncate">
            {showingSeekerBoard && <span className="text-red-400 mr-1">Seeker</span>}
            {onTheTrain ? `\u2192 ${boardStation?.name ?? boardStationId}` : (boardStation?.name ?? boardStationId)}
          </span>
          <span className="text-[10px] text-gray-400 tabular-nums ml-2 shrink-0">
            {onTheTrain ? `arr ${formatGameTime(boardTime)}` : 'Departures'}
          </span>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[3.2rem_1fr_2.6rem_2.4rem_2.4rem] px-3 py-1 text-[10px] text-gray-600 uppercase tracking-wide border-b border-gray-800">
          <span>Time</span>
          <span>Destination</span>
          <span className="text-center">Train</span>
          <span className="text-right">Dur</span>
          <span className="text-right">In</span>
        </div>

        {/* Departure rows */}
        {departures.map(({ nId, info }) => {
          const nStation = stations[nId];
          const tl = TRAIN_TYPE_LABELS[info.trainType];
          const isSelected = waitingForDeparture && activeTransit?.toStationId === nId;
          const minsUntil = Math.max(0, Math.ceil(info.departureTime - clock.gameMinutes));
          const imminent = minsUntil <= 5 && minsUntil > 0;
          // Block departures that arrive after hiding time limit
          const HIDING_TIME_LIMIT = 240;
          const blocked = playerRole === 'hider' && phase === 'hiding' && info.departureTime + info.travelMinutes > HIDING_TIME_LIMIT;
          const rowClickable = handleSelect && !blocked;
          return (
            <div
              key={nId}
              onClick={rowClickable ? () => handleSelect(nId) : undefined}
              className={`grid grid-cols-[3.2rem_1fr_2.6rem_2.4rem_2.4rem] px-3 py-1 border-b border-gray-900 items-center ${isSelected ? 'bg-amber-900/30 border-l-2 border-l-amber-400' : ''} ${imminent && !blocked ? 'animate-pulse' : ''} ${blocked ? 'opacity-40' : ''} ${rowClickable ? 'cursor-pointer hover:bg-gray-800/80 transition-colors' : ''}`}
            >
              <span className={`text-xs tabular-nums font-medium ${blocked ? 'text-gray-600 line-through' : 'text-white'}`}>{formatGameTime(info.departureTime)}</span>
              <span className={`text-xs truncate pr-1 ${blocked ? 'text-gray-600 line-through' : 'text-amber-400'}`} title={nStation?.name ?? nId}>
                {nStation?.name ?? nId}
              </span>
              <span className={`text-[10px] font-bold ${blocked ? 'text-gray-600' : tl.color} ${blocked ? 'bg-gray-800' : tl.bg} rounded text-center px-1 py-0.5 leading-none`}>{tl.label}</span>
              <span className={`text-xs tabular-nums text-right ${blocked ? 'text-gray-600 line-through' : 'text-gray-500'}`}>{Math.round(info.travelMinutes)}m</span>
              <span className={`text-xs tabular-nums text-right ${blocked ? 'text-gray-600' : imminent ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
                {minsUntil === 0 ? 'NOW' : `${minsUntil}m`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
