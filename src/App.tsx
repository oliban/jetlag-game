import { useEffect, useRef, useCallback } from 'react';
import GameMap from './map/GameMap';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import SetupScreen from './components/SetupScreen';
import QuestionLog from './components/QuestionLog';
import DebugPanel from './components/DebugPanel';
import RoundEndScreen from './components/RoundEndScreen';
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
  const rafRef = useRef<number>(0);

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

  // Seeker mode time limit: hider wins if 12 hours (720 minutes) pass
  useEffect(() => {
    if (playerRole !== 'seeker' || phase !== 'seeking') return;
    if (clock.gameMinutes >= 720) {
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
      <SetupScreen />
      {phase === 'round_end' && <RoundEndScreen />}

      {/* AI thinking indicator */}
      {playerRole === 'hider' && isAISeeking && phase === 'seeking' && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-gray-900/90 backdrop-blur px-4 py-2 rounded-full border border-gray-700 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          <span className="text-sm text-gray-300">AI is thinking...</span>
        </div>
      )}
    </div>
  );
}

export default App;
