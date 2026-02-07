import { useState } from 'react';
import { useGameStore } from '../store/gameStore';

export default function SetupScreen() {
  const phase = useGameStore((s) => s.phase);
  const startGame = useGameStore((s) => s.startGame);
  const storedApiKey = useGameStore((s) => s.apiKey);
  const setApiKey = useGameStore((s) => s.setApiKey);

  const [selectedRole, setSelectedRole] = useState<'hider' | 'seeker' | null>(null);
  const [localKey, setLocalKey] = useState(storedApiKey);
  const [error, setError] = useState('');

  if (phase !== 'setup') return null;

  const handleStart = () => {
    const key = localKey.trim();
    if (!key) {
      setError('Please enter an Anthropic API key to start.');
      return;
    }
    setApiKey(key);
    setError('');
    startGame();
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <h1 className="text-3xl font-bold text-white mb-2">
          Jet Lag: Hide &amp; Seek
        </h1>
        <p className="text-gray-400 mb-6">
          A game of cat and mouse across Europe's train network. Hide from an AI seeker or hunt down an AI hider.
        </p>

        {selectedRole === null && (
          <div className="space-y-4">
            {/* How to play */}
            <div className="bg-gray-800/50 rounded-lg p-3 text-sm text-gray-400 space-y-1">
              <p>1. Choose your role: hider or seeker.</p>
              <p>2. Travel across the European rail network using adjacent station connections.</p>
              <p>3. The game lasts 12 in-game hours — can you outwit your opponent?</p>
              <p>4. Press D during the game to open the debug panel.</p>
            </div>

            {/* Role selection buttons */}
            <button
              onClick={() => setSelectedRole('hider')}
              className="w-full px-4 py-4 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors text-lg text-left"
            >
              Play as Hider
              <span className="block text-sm font-normal text-amber-900 mt-0.5">
                Hide from an AI seeker across Europe's train network
              </span>
            </button>

            <button
              onClick={() => startGame('seeker')}
              className="w-full px-4 py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors text-lg text-left"
            >
              Play as Seeker
              <span className="block text-sm font-normal text-red-200 mt-0.5">
                Search for an AI hider — no API key needed
              </span>
            </button>
          </div>
        )}

        {selectedRole === 'hider' && (
          <div className="space-y-4">
            {/* How to play */}
            <div className="bg-gray-800/50 rounded-lg p-3 text-sm text-gray-400 space-y-1">
              <p>1. You start at a random station on the European rail network.</p>
              <p>2. Travel to adjacent stations, then settle to create your hiding zone.</p>
              <p>3. An AI seeker will ask questions and try to find you within 12 game-hours.</p>
              <p>4. Press D during the game to open the AI debug panel.</p>
            </div>

            {/* API key input */}
            <div>
              <label
                htmlFor="api-key"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Anthropic API Key
              </label>
              <input
                id="api-key"
                type="password"
                value={localKey}
                onChange={(e) => {
                  setLocalKey(e.target.value);
                  if (error) setError('');
                }}
                placeholder="sk-ant-..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-500"
              />
              {error && (
                <p className="text-red-400 text-xs mt-1">{error}</p>
              )}
            </div>

            <button
              onClick={handleStart}
              className="w-full px-4 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors text-lg"
            >
              Start Game
            </button>

            <p className="text-xs text-gray-500 text-center">
              Your API key is used locally to power the AI seeker and is never sent to any server other than Anthropic.
            </p>

            <button
              onClick={() => setSelectedRole(null)}
              className="w-full px-3 py-2 text-gray-400 hover:text-white text-sm transition-colors"
            >
              &larr; Back to role selection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
