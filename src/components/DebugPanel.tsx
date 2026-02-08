import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString('en-GB', { hour12: false });
}

function JsonBlock({ data }: { data: unknown }) {
  const text = JSON.stringify(data, null, 2);
  return (
    <pre className="text-xs text-gray-400 bg-[#061e45] rounded p-1.5 mt-1 overflow-x-auto max-h-32 whitespace-pre-wrap break-all">
      {text}
    </pre>
  );
}

const TOOL_COLORS: Record<string, string> = {
  ask_question: 'text-blue-400',
  move_seeker: 'text-green-400',
  declare_found: 'text-red-400',
  thinking: 'text-purple-400',
  travel_to: 'text-green-400',
  error: 'text-red-400',
};

export default function DebugPanel() {
  const debugLog = useGameStore((s) => s.debugLog);
  const consensusLog = useGameStore((s) => s.consensusLog);
  const seekerMode = useGameStore((s) => s.seekerMode);
  const phase = useGameStore((s) => s.phase);
  const [visible, setVisible] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [tab, setTab] = useState<'log' | 'consensus'>('log');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Toggle with 'D' key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') {
        // Ignore if typing in an input
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        setVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Auto-scroll to latest
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [debugLog, consensusLog]);

  if (!visible) return null;

  const toolNames = [...new Set(debugLog.map((e) => e.tool))];
  const filtered =
    filter === 'all' ? debugLog : debugLog.filter((e) => e.tool === filter);

  return (
    <div className="absolute top-12 left-4 z-20 w-96 max-h-[70vh] flex flex-col bg-[#061e45]/95 backdrop-blur border border-[#1a3a6a]/60 rounded-lg shadow-xl font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a3a6a]/60">
        <div className="flex items-center gap-2">
          <span className="text-gray-300 font-semibold flex items-center gap-1.5">
            {phase === 'seeking' && (
              <span className="bg-red-500 w-1.5 h-1.5 rounded-full animate-pulse" />
            )}
            AI Debug
          </span>
          {seekerMode === 'consensus' && (
            <div className="flex gap-1">
              <button
                onClick={() => setTab('log')}
                className={`px-2 py-0.5 rounded text-xs ${tab === 'log' ? 'bg-[#1a3a6a] text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Log
              </button>
              <button
                onClick={() => setTab('consensus')}
                className={`px-2 py-0.5 rounded text-xs ${tab === 'consensus' ? 'bg-purple-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Consensus
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {tab === 'log' && (
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-[#0c2a52] text-gray-300 border border-[#1a3a6a] rounded px-1 py-0.5 text-xs"
            >
              <option value="all">All</option>
              {toolNames.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setVisible(false)}
            className="text-gray-500 hover:text-white text-sm"
          >
            {'\u00D7'}
          </button>
        </div>
      </div>

      {/* Log tab */}
      {tab === 'log' && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-2">
          {filtered.length === 0 ? (
            <p className="text-gray-600 text-center py-4">No entries</p>
          ) : (
            filtered.map((entry, i) => {
              const toolColor = TOOL_COLORS[entry.tool] ?? 'text-[#ffbf40]';
              return (
                <div
                  key={i}
                  className="border border-[#0c2a52] rounded p-2 bg-[#0a1a3a]/50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-semibold ${toolColor}`}>
                      {entry.tool}
                    </span>
                    <span className="text-gray-600">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  </div>
                  {entry.args && (
                    <div>
                      <span className="text-gray-500">args:</span>
                      <JsonBlock data={entry.args} />
                    </div>
                  )}
                  {entry.result !== undefined && (
                    <div className="mt-1">
                      <span className="text-gray-500">result:</span>
                      <JsonBlock data={entry.result} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Consensus tab */}
      {tab === 'consensus' && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-2">
          {consensusLog.length === 0 ? (
            <p className="text-gray-600 text-center py-4">No consensus entries</p>
          ) : (
            consensusLog.map((entry, i) => {
              const methodColor = {
                agreement: 'text-green-400',
                discussion: 'text-yellow-400',
                tiebreaker: 'text-red-400',
              }[entry.result.method] ?? 'text-gray-400';

              return (
                <div
                  key={i}
                  className="border border-[#0c2a52] rounded p-2 bg-[#0a1a3a]/50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-purple-400 font-semibold">
                      Action #{entry.turnAction + 1}
                    </span>
                    <span className={`text-xs ${methodColor}`}>
                      {entry.result.method}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div>
                      <span className="text-blue-400">Seeker A:</span>{' '}
                      <span className="text-gray-300">{entry.proposalA.actionType} → {entry.proposalA.target}</span>
                      <p className="text-gray-500 ml-4 truncate">{entry.proposalA.reasoning}</p>
                    </div>
                    <div>
                      <span className="text-orange-400">Seeker B:</span>{' '}
                      <span className="text-gray-300">{entry.proposalB.actionType} → {entry.proposalB.target}</span>
                      <p className="text-gray-500 ml-4 truncate">{entry.proposalB.reasoning}</p>
                    </div>
                    {entry.revisedA && (
                      <div className="text-gray-500">
                        Revised A: {entry.revisedA.actionType} → {entry.revisedA.target}
                      </div>
                    )}
                    {entry.revisedB && (
                      <div className="text-gray-500">
                        Revised B: {entry.revisedB.actionType} → {entry.revisedB.target}
                      </div>
                    )}
                    <div className={`font-medium ${methodColor}`}>
                      Result: {entry.result.action.actionType} → {entry.result.action.target}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
