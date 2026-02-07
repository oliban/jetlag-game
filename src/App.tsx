import { useEffect, useRef, useCallback } from 'react';
import GameMap from './map/GameMap';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import SetupScreen from './components/SetupScreen';
import QuestionLog from './components/QuestionLog';
import DebugPanel from './components/DebugPanel';
import RoundEndScreen from './components/RoundEndScreen';
import DepartureBoardModal from './components/DepartureBoardModal';
import { useGameStore } from './store/gameStore';
import { getStations } from './data/graph';

function App() {
  const phase = useGameStore((s) => s.phase);
  const tick = useGameStore((s) => s.tick);
  const seekerStationId = useGameStore((s) => s.seekerStationId);
  const isAISeeking = useGameStore((s) => s.isAISeeking);
  const gameResult = useGameStore((s) => s.gameResult);
  const transitionPhase = useGameStore((s) => s.transitionPhase);
  const playerRole = useGameStore((s) => s.playerRole);
  const clock = useGameStore((s) => s.clock);
  const setGameResult = useGameStore((s) => s.setGameResult);
  const seekerMode = useGameStore((s) => s.seekerMode);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const togglePause = useGameStore((s) => s.togglePause);
  const settleHere = useGameStore((s) => s.settleHere);
  const startSeeking = useGameStore((s) => s.startSeeking);
  const hidingZone = useGameStore((s) => s.hidingZone);
  const playerTransit = useGameStore((s) => s.playerTransit);
  const seekerNextActionTime = useGameStore((s) => s.seekerNextActionTime);
  const seekerTransit = useGameStore((s) => s.seekerTransit);
  const rafRef = useRef<number>(0);

  // Keyboard shortcuts for speed: 1=1x, 2=2x, 3=5x, 4=10x, 5=pause/unpause
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (phase === 'setup') return;
      switch (e.key) {
        case '1': setSpeed(1); break;
        case '2': setSpeed(2); break;
        case '3': setSpeed(5); break;
        case '4': setSpeed(10); break;
        case '5': togglePause(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, setSpeed, togglePause]);

  // Game clock loop
  useEffect(() => {
    if (phase === 'setup') return;

    const loop = () => {
      tick(performance.now());
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, tick]);

  // Auto-run seeker turns during seeking phase (only when player is hider)
  // The AI sleeps until seekerNextActionTime (game minutes), then takes its next turn.
  // Time-sensitive checks read from store directly to avoid dependency thrashing.
  const runSeekerLoop = useCallback(async () => {
    const s = useGameStore.getState();
    if (s.playerRole !== 'hider') return;
    if (s.phase !== 'seeking' || s.isAISeeking || s.gameResult) return;
    if (!s.seekerStationId) return;
    // Wait for any in-progress transit or queued travel to complete
    if (s.seekerTransit) return;
    if (s.seekerTravelQueue.length > 0) return;
    // Wait until the game clock reaches the AI's scheduled next action time
    if (s.clock.gameMinutes < s.seekerNextActionTime) return;
    await s.executeSeekerTurn();
  }, []);

  useEffect(() => {
    if (playerRole !== 'hider') return;
    if (phase !== 'seeking' || gameResult) return;
    if (!seekerStationId) return;

    // Poll every 500ms — the callback reads fresh state each time
    const interval = setInterval(runSeekerLoop, 500);
    const initialDelay = setTimeout(runSeekerLoop, 500);

    return () => {
      clearInterval(interval);
      clearTimeout(initialDelay);
    };
  }, [playerRole, phase, gameResult, seekerStationId, runSeekerLoop]);

  // Handle game result → transition to round_end
  useEffect(() => {
    if (!gameResult) return;
    const timer = setTimeout(() => {
      transitionPhase('round_end');
    }, 1500);
    return () => clearTimeout(timer);
  }, [gameResult, transitionPhase]);

  // Hiding phase time limit: 4 game-hours (240 minutes), auto-settle and start seeking
  useEffect(() => {
    if (playerRole !== 'hider' || phase !== 'hiding') return;
    if (clock.gameMinutes < 240) return;
    // Don't auto-settle while on a train
    const onTheTrain = playerTransit && clock.gameMinutes >= playerTransit.departureTime;
    if (onTheTrain) return;
    if (!hidingZone) settleHere();
    // Small delay to ensure settle completes before starting
    setTimeout(() => startSeeking(), 50);
  }, [playerRole, phase, clock.gameMinutes, hidingZone, playerTransit, settleHere, startSeeking]);

  // Seeker mode time limit: hider wins if 50 hours (3000 minutes) pass
  useEffect(() => {
    if (playerRole !== 'seeker' || phase !== 'seeking') return;
    if (clock.gameMinutes >= 3000) {
      setGameResult('hider_wins');
      transitionPhase('round_end');
    }
  }, [playerRole, phase, clock.gameMinutes, setGameResult, transitionPhase]);

  return (
    <div className="w-full h-screen relative">
      <GameMap />
      <Header />
      <Sidebar />
      <QuestionLog />
      <DebugPanel />
      <DepartureBoardModal />
      <SetupScreen />
      {phase === 'round_end' && <RoundEndScreen />}

      {/* AI status indicator — always visible during seeking phase when player is hider */}
      {playerRole === 'hider' && phase === 'seeking' && !gameResult && (() => {
        const stations = getStations();
        let dotColor = 'bg-gray-500';
        let label = 'Seeker idle';

        if (isAISeeking) {
          dotColor = seekerMode === 'consensus' ? 'bg-purple-400' : 'bg-red-400';
          label = seekerMode === 'consensus' ? 'Seekers deliberating...' : 'AI is thinking...';
        } else if (seekerTransit) {
          const toName = stations?.[seekerTransit.toStationId]?.name ?? seekerTransit.toStationId;
          const waiting = clock.gameMinutes < seekerTransit.departureTime;
          if (waiting) {
            dotColor = 'bg-yellow-400';
            const waitLeft = Math.max(0, Math.ceil(seekerTransit.departureTime - clock.gameMinutes));
            label = `Waiting for train to ${toName} — departs in ${waitLeft}m`;
          } else {
            dotColor = 'bg-blue-400';
            const minsLeft = Math.max(0, Math.ceil(seekerTransit.arrivalTime - clock.gameMinutes));
            label = `In transit to ${toName} — ${minsLeft}m`;
          }
        } else if (seekerNextActionTime > clock.gameMinutes) {
          dotColor = 'bg-gray-400';
          const minsLeft = Math.max(0, Math.ceil(seekerNextActionTime - clock.gameMinutes));
          label = `Waiting for next action — ${minsLeft}m`;
        }

        return (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-gray-900/90 backdrop-blur px-4 py-2 rounded-full border border-gray-700 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${dotColor} animate-pulse`} />
            <span className="text-sm text-gray-300">{label}</span>
          </div>
        );
      })()}
    </div>
  );
}

export default App;
