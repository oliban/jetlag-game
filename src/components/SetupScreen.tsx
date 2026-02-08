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
  // Never pre-fill API keys in the UI — env keys stay hidden in the store
  const [localKey, setLocalKey] = useState('');
  const [localOpenaiKey, setLocalOpenaiKey] = useState('');
  const [error, setError] = useState('');
  const [hoveredCard, setHoveredCard] = useState<'hider' | 'seeker' | null>(null);

  if (phase !== 'setup') return null;

  const hasAnthropicKey = localKey.trim() !== '' || storedApiKey !== '';
  const hasOpenaiKey = localOpenaiKey.trim() !== '' || storedOpenaiKey !== '';
  const hasBothKeys = hasAnthropicKey && hasOpenaiKey;

  const handleStart = () => {
    // Use typed key, or fall back to env-backed key already in the store
    const key = localKey.trim() || storedApiKey;
    if (!key) {
      setError('Please enter an Anthropic API key to start.');
      return;
    }
    setApiKey(key);
    const oaiKey = localOpenaiKey.trim() || storedOpenaiKey;
    if (oaiKey) {
      setOpenaiApiKey(oaiKey);
    }
    setError('');
    startGame();
  };

  const font = "'DM Sans', system-ui, sans-serif";
  const mono = "'DM Mono', 'DM Sans', monospace";

  // Jet Lag brand palette
  const gold = '#ffbf40';
  const goldDark = '#e5a520';
  const red = '#e23235';
  const navyDeep = '#061e45';

  return (
    <div className="setup-screen absolute inset-0 z-30 flex items-center justify-center">
      {/* Warm background with gold ambient lighting */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(160deg, #0d2850 0%, #0f1f35 40%, #151a25 100%)',
      }} />
      {/* Warm gold wash across entire background */}
      <div className="absolute inset-0" style={{
        background: `radial-gradient(ellipse 80% 60% at 50% 30%, ${gold}14 0%, transparent 70%)`,
      }} />
      {/* Stronger gold glow top-right */}
      <div className="absolute inset-0" style={{
        background: `radial-gradient(ellipse 50% 40% at 80% 10%, ${gold}1a 0%, transparent 60%)`,
      }} />

      <div className="relative z-10 w-full max-w-[580px] mx-8 setup-card-enter max-h-[calc(100vh-4rem)] overflow-y-auto rounded-2xl" style={{
        boxShadow: `0 30px 80px -12px rgba(0,0,0,0.5), 0 0 0 1px ${gold}18, 0 0 60px -20px ${gold}20`,
      }}>
        <div className="relative rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(180deg, #0f2444 0%, #13243f 100%)' }}>
          {/* Gold accent line at top */}
          <div className="h-[2px]" style={{ background: `linear-gradient(90deg, transparent 10%, ${gold} 50%, transparent 90%)` }} />

          {/* Hero section */}
          <div className="relative h-64 overflow-hidden">
            <img
              src="/Train%20Chaos.png"
              alt=""
              className="w-full h-full object-cover object-center"
              style={{ filter: 'brightness(0.75) contrast(1.1) saturate(0.9)' }}
            />
            {/* Warm gold-tinted gradient overlay */}
            <div className="absolute inset-0" style={{
              background: `linear-gradient(to top, #0f2444 0%, rgba(15,36,68,0.6) 40%, transparent 100%)`,
            }} />
            <div className="absolute inset-0" style={{
              background: `linear-gradient(135deg, transparent 40%, ${gold}10 100%)`,
            }} />

            {/* Title over image */}
            <div className="absolute bottom-0 left-0 right-0 px-10 pb-7">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="h-px w-10" style={{ background: `linear-gradient(90deg, ${gold}, transparent)` }} />
                <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ fontFamily: font, color: gold }}>
                  European Rail Network
                </p>
              </div>
              <h1 className="text-[3.2rem] font-black tracking-tight leading-[0.9]" style={{ fontFamily: font, color: '#ffffff' }}>
                Jet Lag
              </h1>
              <h2 className="text-base font-medium tracking-wide mt-1" style={{ fontFamily: font, color: `${gold}99` }}>
                Hide &amp; Seek
              </h2>
            </div>
          </div>

          {/* Card body */}
          <div>
            {selectedRole === null && (
              <div className="px-10 pt-5 pb-10">
                <p className="text-[15px] leading-relaxed mb-8" style={{ fontFamily: font, color: 'rgba(255,255,255,0.55)' }}>
                  A game of cat and mouse across Europe. Hide from AI seekers
                  or hunt down an AI hider across the rail network.
                </p>

                {/* Role cards */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                  {/* Hider — gold themed */}
                  <button
                    onClick={() => setSelectedRole('hider')}
                    onMouseEnter={() => setHoveredCard('hider')}
                    onMouseLeave={() => setHoveredCard(null)}
                    className="group relative text-left rounded-xl overflow-hidden transition-all duration-300"
                    style={{
                      background: hoveredCard === 'hider'
                        ? `linear-gradient(135deg, ${gold}1a 0%, ${gold}08 100%)`
                        : `linear-gradient(135deg, ${gold}0a 0%, rgba(255,255,255,0.02) 100%)`,
                      boxShadow: hoveredCard === 'hider'
                        ? `0 0 0 1.5px ${gold}, 0 8px 24px -8px ${gold}30`
                        : `0 0 0 1px ${gold}20`,
                    }}
                  >
                    <div className="p-5">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4 transition-colors duration-300" style={{
                        background: hoveredCard === 'hider' ? `${gold}25` : `${gold}12`,
                      }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={hoveredCard === 'hider' ? gold : `${gold}90`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                      </div>
                      <p className="font-semibold text-[15px] mb-1" style={{ fontFamily: font, color: '#fff' }}>
                        Play as Hider
                      </p>
                      <p className="text-[13px] leading-relaxed" style={{ fontFamily: font, color: 'rgba(255,255,255,0.45)' }}>
                        Evade AI seekers across the continent
                      </p>
                    </div>
                  </button>

                  {/* Seeker — red themed */}
                  <button
                    onClick={() => startGame('seeker')}
                    onMouseEnter={() => setHoveredCard('seeker')}
                    onMouseLeave={() => setHoveredCard(null)}
                    className="group relative text-left rounded-xl overflow-hidden transition-all duration-300"
                    style={{
                      background: hoveredCard === 'seeker'
                        ? `linear-gradient(135deg, ${red}1a 0%, ${red}08 100%)`
                        : `linear-gradient(135deg, ${red}0a 0%, rgba(255,255,255,0.02) 100%)`,
                      boxShadow: hoveredCard === 'seeker'
                        ? `0 0 0 1.5px ${red}, 0 8px 24px -8px ${red}30`
                        : `0 0 0 1px ${red}20`,
                    }}
                  >
                    <div className="p-5">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4 transition-colors duration-300" style={{
                        background: hoveredCard === 'seeker' ? `${red}20` : `${red}0d`,
                      }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={hoveredCard === 'seeker' ? red : `${red}80`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
                        </svg>
                      </div>
                      <p className="font-semibold text-[15px] mb-1" style={{ fontFamily: font, color: '#fff' }}>
                        Play as Seeker
                      </p>
                      <p className="text-[13px] leading-relaxed" style={{ fontFamily: font, color: 'rgba(255,255,255,0.45)' }}>
                        Hunt an AI hider — no API key needed
                      </p>
                    </div>
                  </button>
                </div>

                {/* Steps — gold accent bar */}
                <div className="rounded-xl px-5 py-3.5" style={{
                  background: `linear-gradient(90deg, ${gold}0d 0%, ${gold}06 50%, ${gold}0d 100%)`,
                  border: `1px solid ${gold}18`,
                }}>
                  <div className="flex items-center justify-center gap-5 text-[12px]" style={{ fontFamily: font }}>
                    <span style={{ color: 'rgba(255,255,255,0.45)' }}>
                      <span className="font-bold mr-1" style={{ color: gold }}>1</span>
                      Choose role
                    </span>
                    <span style={{ color: `${gold}30` }}>/</span>
                    <span style={{ color: 'rgba(255,255,255,0.45)' }}>
                      <span className="font-bold mr-1" style={{ color: gold }}>2</span>
                      Travel by rail
                    </span>
                    <span style={{ color: `${gold}30` }}>/</span>
                    <span style={{ color: 'rgba(255,255,255,0.45)' }}>
                      <span className="font-bold mr-1" style={{ color: gold }}>3</span>
                      Outwit your opponent
                    </span>
                  </div>
                </div>
              </div>
            )}

            {selectedRole === 'hider' && (
              <div className="px-10 pt-5 pb-10 space-y-6 setup-form-enter">
                {/* Back + title */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedRole(null)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                  </button>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${gold}20` }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      </svg>
                    </div>
                    <h3 className="font-semibold text-base" style={{ fontFamily: font, color: '#fff' }}>
                      Hider Setup
                    </h3>
                  </div>
                </div>

                {/* Info */}
                <div className="rounded-xl p-5 text-[13px] leading-relaxed space-y-1.5" style={{
                  background: `linear-gradient(135deg, ${gold}08 0%, rgba(255,255,255,0.03) 100%)`,
                  border: `1px solid ${gold}12`,
                  color: 'rgba(255,255,255,0.55)',
                  fontFamily: font,
                }}>
                  <p>Start at a random station, travel the network, then settle to create your hiding zone.</p>
                  <p>AI seekers will hunt you down within <span className="font-semibold" style={{ color: gold }}>50 game-hours</span>.</p>
                </div>

                {/* Anthropic key */}
                <div>
                  <label htmlFor="api-key" className="block text-[13px] font-medium mb-2" style={{ fontFamily: font, color: `${gold}90` }}>
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
                    placeholder={storedApiKey ? 'Using key from .env' : 'sk-ant-...'}
                    className="w-full px-4 py-3 rounded-xl text-[14px] focus:outline-none transition-all duration-200"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      color: '#fff',
                      border: `1px solid ${gold}18`,
                      fontFamily: mono,
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.border = `1px solid ${gold}`;
                      e.currentTarget.style.boxShadow = `0 0 0 3px ${gold}20`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.border = `1px solid ${gold}18`;
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>

                {/* OpenAI key */}
                <div>
                  <label htmlFor="openai-key" className="block text-[13px] font-medium mb-2" style={{ fontFamily: font, color: `${gold}90` }}>
                    OpenAI API Key
                    <span className="ml-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>(optional — enables dual seekers)</span>
                  </label>
                  <input
                    id="openai-key"
                    type="password"
                    value={localOpenaiKey}
                    onChange={(e) => setLocalOpenaiKey(e.target.value)}
                    placeholder={storedOpenaiKey ? 'Using key from .env' : 'sk-...'}
                    className="w-full px-4 py-3 rounded-xl text-[14px] focus:outline-none transition-all duration-200"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      color: '#fff',
                      border: `1px solid ${gold}18`,
                      fontFamily: mono,
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.border = '1px solid #8b5cf6';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.15)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.border = `1px solid ${gold}18`;
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  {hasBothKeys && (
                    <p className="text-[12px] mt-2.5 flex items-center gap-2" style={{ fontFamily: font, color: '#a78bfa' }}>
                      <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ background: '#a78bfa' }} />
                      Consensus mode: Claude + GPT-4o will seek together
                    </p>
                  )}
                </div>

                {error && (
                  <p className="text-[13px]" style={{ fontFamily: font, color: red }}>{error}</p>
                )}

                {/* Start button */}
                <button
                  onClick={handleStart}
                  className="w-full py-3.5 rounded-xl font-bold text-[15px] transition-all duration-200"
                  style={{
                    background: `linear-gradient(135deg, ${gold} 0%, ${goldDark} 100%)`,
                    color: navyDeep,
                    fontFamily: font,
                    boxShadow: `0 4px 24px -4px ${gold}60, inset 0 1px 0 rgba(255,255,255,0.25)`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `0 8px 32px -4px ${gold}70, inset 0 1px 0 rgba(255,255,255,0.3)`;
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = `0 4px 24px -4px ${gold}60, inset 0 1px 0 rgba(255,255,255,0.25)`;
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  Start Game
                </button>

                <p className="text-[11px] text-center pt-1" style={{ fontFamily: font, color: 'rgba(255,255,255,0.2)' }}>
                  Keys stay local — sent only to their respective providers.
                </p>
              </div>
            )}
          </div>

          {/* Gold accent line at bottom */}
          <div className="h-px" style={{ background: `linear-gradient(90deg, transparent 15%, ${gold}30 50%, transparent 85%)` }} />
        </div>
      </div>

      <style>{`
        @keyframes setup-card-enter {
          from { opacity: 0; transform: scale(0.97) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes setup-form-enter {
          from { opacity: 0; transform: translateX(6px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .setup-card-enter { animation: setup-card-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .setup-form-enter { animation: setup-form-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .setup-screen input::placeholder { color: rgba(255,191,64,0.25); }
        .setup-screen ::-webkit-scrollbar { width: 6px; }
        .setup-screen ::-webkit-scrollbar-track { background: transparent; }
        .setup-screen ::-webkit-scrollbar-thumb { background: rgba(255,191,64,0.15); border-radius: 3px; }
        .setup-screen ::-webkit-scrollbar-thumb:hover { background: rgba(255,191,64,0.25); }
      `}</style>
    </div>
  );
}
