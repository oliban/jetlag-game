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

function App() {
  const phase = useGameStore((s) => s.phase);
  const tick = useGameStore((s) => s.tick);
  const seekerStationId = useGameStore((s) => s.seekerStationId);
  const isAISeeking = useGameStore((s) => s.isAISeeking);
  const gameResult = useGameStore((s) => s.gameResult);
  const executeSeekerTurn = useGameStore((s) => s.executeSeekerTurn);
  const transitionPhase = useGameStore((s) => s.transitionPhase);
  const playerRole = useGameStore((s) => s.playerRole);
  const clock = useGameStore((s) => s.clock);
  const setGameResult = useGameStore((s) => s.setGameResult);
  const seekerMode = useGameStore((s) => s.seekerMode);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const togglePause = useGameStore((s) => s.togglePause);
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
  const runSeekerLoop = useCallback(async () => {
    if (playerRole !== 'hider') return;
    if (phase !== 'seeking' || isAISeeking || gameResult) return;
    await executeSeekerTurn();
  }, [playerRole, phase, isAISeeking, gameResult, executeSeekerTurn]);

  useEffect(() => {
    if (playerRole !== 'hider') return;
    if (phase !== 'seeking' || gameResult) return;

    // Run seeker turns with a delay between them
    const interval = setInterval(() => {
      runSeekerLoop();
    }, 2000);

    // Also run immediately on first entering seeking phase
    if (!seekerStationId) return;
    const initialDelay = setTimeout(runSeekerLoop, 1000);

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

      {/* AI thinking indicator */}
      {playerRole === 'hider' && isAISeeking && phase === 'seeking' && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-gray-900/90 backdrop-blur px-4 py-2 rounded-full border border-gray-700 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${seekerMode === 'consensus' ? 'bg-purple-400' : 'bg-red-400'} animate-pulse`} />
          <span className="text-sm text-gray-300">
            {seekerMode === 'consensus' ? 'Seekers deliberating...' : 'AI is thinking...'}
          </span>
        </div>
      )}
    </div>
  );
}

export default App;
