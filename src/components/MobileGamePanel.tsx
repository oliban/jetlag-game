import { useState } from 'react';
import { SidebarContent } from './Sidebar';
import { DepartureBoardMobile } from './DepartureBoardModal';
import TransitIndicator from './TransitIndicator';
import { useGameStore } from '../store/gameStore';
import { getStations } from '../data/graph';
import { stationMatchesConstraints } from '../engine/seekerLoop';
import { formatDuration } from '../engine/gameLoop';

function MobileStatusBar() {
  const phase = useGameStore((s) => s.phase);
  const playerRole = useGameStore((s) => s.playerRole);
  const playerTransit = useGameStore((s) => s.playerTransit);
  const playerStationId = useGameStore((s) => s.playerStationId);
  const clock = useGameStore((s) => s.clock);
  const getOffAtNextStation = useGameStore((s) => s.getOffAtNextStation);
  const stayOnTrain = useGameStore((s) => s.stayOnTrain);
  const queuedRoute = useGameStore((s) => s.queuedRoute);
  const coinBudget = useGameStore((s) => s.coinBudget);
  const constraints = useGameStore((s) => s.constraints);
  const visitedStations = useGameStore((s) => s.visitedStations);
  const hidingZone = useGameStore((s) => s.hidingZone);
  const cameraFollow = useGameStore((s) => s.cameraFollow);
  const toggleCameraFollow = useGameStore((s) => s.toggleCameraFollow);
  const settleHere = useGameStore((s) => s.settleHere);
  const startSeeking = useGameStore((s) => s.startSeeking);

  const stations = getStations();
  const currentStation = playerStationId ? stations[playerStationId] : null;

  if (phase === 'setup' || !playerStationId) return null;

  const isSeeker = playerRole === 'seeker' && phase === 'seeking';
  const isHiding = playerRole === 'hider' && phase === 'hiding';
  const HIDING_TIME_LIMIT = 240;
  const hidingTimeLeft = isHiding ? Math.max(0, Math.ceil(HIDING_TIME_LIMIT - clock.gameMinutes)) : 0;
  const onTheTrain = playerTransit && clock.gameMinutes >= playerTransit.departureTime;

  let candidateCount = 0;
  if (isSeeker) {
    candidateCount = Object.entries(stations).filter(([id, st]) =>
      !visitedStations.has(id) &&
      stationMatchesConstraints(st, constraints),
    ).length;
  }

  return (
    <div className="shrink-0 border-b border-[#1a3a6a]/40">
      {/* Station + coins + candidates + camera toggle */}
      <div className="px-3 pt-1.5 pb-1 flex items-center gap-2">
        <span className="text-sm font-bold text-[#ffbf40] truncate">{currentStation?.name ?? playerStationId}</span>
        <span className="text-xs text-gray-500">{currentStation?.country}</span>
        {coinBudget && (
          <span className="ml-auto text-xs text-[#ffbf40]">{coinBudget.remaining} coins</span>
        )}
        {isSeeker && (
          <span className="text-xs text-cyan-400">{candidateCount} left</span>
        )}
        <button
          onClick={toggleCameraFollow}
          className={`shrink-0 w-7 h-7 flex items-center justify-center rounded transition-colors ${
            cameraFollow ? 'bg-[#ffbf40]/20 text-[#ffbf40]' : 'bg-white/5 text-gray-500'
          }`}
          title={cameraFollow ? 'Camera following player' : 'Camera free'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </button>
      </div>

      {/* Transit indicator */}
      {playerTransit && (
        <div className="px-3 pb-1">
          <TransitIndicator
            playerTransit={playerTransit}
            clock={clock}
            stations={stations}
            getOffAtNextStation={getOffAtNextStation}
            stayOnTrain={stayOnTrain}
            queuedRoute={queuedRoute}
          />
        </div>
      )}

      {/* Hiding time + hide button (hider only) */}
      {isHiding && (
        <div className="px-3 pb-1.5 flex items-center gap-3">
          <span className="text-sm text-gray-400">
            Time to hide: <span className={`font-mono ${hidingTimeLeft <= 30 ? 'text-red-400 font-bold' : 'text-white'}`}>{formatDuration(hidingTimeLeft)}</span>
          </span>
          {!onTheTrain && !hidingZone && (
            <button
              onClick={() => { settleHere(); setTimeout(() => startSeeking(), 50); }}
              className="ml-auto px-3 py-1 bg-emerald-600 active:bg-emerald-500 text-white rounded text-xs font-medium"
            >
              Hide Here
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function MobileGamePanel() {
  const [tab, setTab] = useState<'departures' | 'game'>('departures');

  return (
    <div className="bg-[#0a1a3a] border-t border-[#1a3a6a]/60 text-white safe-bottom flex flex-col flex-1 min-h-0">
      <MobileStatusBar />

      <div className="flex shrink-0 border-b border-[#1a3a6a]/40">
        <button
          onClick={() => setTab('departures')}
          className={`flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
            tab === 'departures'
              ? 'text-[#ffbf40] border-b-2 border-[#ffbf40]'
              : 'text-gray-500 active:text-gray-300'
          }`}
        >
          Departures
        </button>
        <button
          onClick={() => setTab('game')}
          className={`flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
            tab === 'game'
              ? 'text-[#ffbf40] border-b-2 border-[#ffbf40]'
              : 'text-gray-500 active:text-gray-300'
          }`}
        >
          Questions
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'departures' ? (
          <DepartureBoardMobile />
        ) : (
          <div className="p-3">
            <SidebarContent mobile />
          </div>
        )}
      </div>
    </div>
  );
}
