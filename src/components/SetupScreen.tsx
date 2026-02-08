import { useState } from 'react';
import { useGameStore } from '../store/gameStore';

export default function SetupScreen() {
  const phase = useGameStore((s) => s.phase);
  const startGame = useGameStore((s) => s.startGame);
  const storedApiKey = useGameStore((s) => s.apiKey);
  const setApiKey = useGameStore((s) => s.setApiKey);
  const storedOpenaiKey = useGameStore((s) => s.openaiApiKey);
  const setOpenaiApiKey = useGameStore((s) => s.setOpenaiApiKey);

  const [selectedRole, setSelectedRole] = useState<'hider' | 'seeker' | null>(null);
  const [localKey, setLocalKey] = useState(storedApiKey);
  const [localOpenaiKey, setLocalOpenaiKey] = useState(storedOpenaiKey);
  const [error, setError] = useState('');

  if (phase !== 'setup') return null;

  const hasBothKeys = localKey.trim() !== '' && localOpenaiKey.trim() !== '';

  const handleStart = () => {
    const key = localKey.trim();
    if (!key) {
      setError('Please enter an Anthropic API key to start.');
      return;
    }
    setApiKey(key);
    if (localOpenaiKey.trim()) {
      setOpenaiApiKey(localOpenaiKey.trim());
    }
    setError('');
    startGame();
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700/60 rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
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
              <p>3. The game lasts 50 in-game hours — can you outwit your opponent?</p>
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
              className="w-full px-4 py-4 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg transition-colors text-lg text-left"
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
              <p>3. An AI seeker will ask questions and try to find you within 50 game-hours.</p>
              <p>4. Press D during the game to open the AI debug panel.</p>
            </div>

            {/* API key input - Anthropic */}
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
            </div>

            {/* API key input - OpenAI (optional) */}
            <div>
              <label
                htmlFor="openai-key"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                OpenAI API Key <span className="text-gray-500">(optional)</span>
              </label>
              <input
                id="openai-key"
                type="password"
                value={localOpenaiKey}
                onChange={(e) => setLocalOpenaiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
              {hasBothKeys && (
                <p className="text-purple-400 text-xs mt-1">
                  Two seekers will work together in consensus mode (Claude + GPT-4o)
                </p>
              )}
            </div>

            {error && (
              <p className="text-red-400 text-xs">{error}</p>
            )}

            <button
              onClick={handleStart}
              className="w-full px-4 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors text-lg"
            >
              Start Game
            </button>

            <p className="text-xs text-gray-500 text-center">
              Your API keys are used locally to power the AI seekers and are never sent to any server other than their respective providers.
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
