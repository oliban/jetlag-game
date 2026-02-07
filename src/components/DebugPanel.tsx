import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString('en-GB', { hour12: false });
}

function JsonBlock({ data }: { data: unknown }) {
  const text = JSON.stringify(data, null, 2);
  return (
    <pre className="text-xs text-gray-400 bg-gray-950 rounded p-1.5 mt-1 overflow-x-auto max-h-32 whitespace-pre-wrap break-all">
      {text}
    </pre>
  );
}

const TOOL_COLORS: Record<string, string> = {
  ask_question: 'text-blue-400',
  move_seeker: 'text-green-400',
  declare_found: 'text-red-400',
};

export default function DebugPanel() {
  const debugLog = useGameStore((s) => s.debugLog);
  const [visible, setVisible] = useState(false);
  const [filter, setFilter] = useState<string>('all');
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
  }, [debugLog]);

  if (!visible) return null;

  const toolNames = [...new Set(debugLog.map((e) => e.tool))];
  const filtered =
    filter === 'all' ? debugLog : debugLog.filter((e) => e.tool === filter);

  return (
    <div className="absolute top-12 left-4 z-20 w-96 max-h-[70vh] flex flex-col bg-gray-950/95 backdrop-blur border border-gray-700 rounded-lg shadow-xl font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-gray-300 font-semibold">AI Debug Log</span>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-gray-800 text-gray-300 border border-gray-600 rounded px-1 py-0.5 text-xs"
          >
            <option value="all">All</option>
            {toolNames.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            onClick={() => setVisible(false)}
            className="text-gray-500 hover:text-white"
          >
            x
          </button>
        </div>
      </div>

      {/* Entries */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-gray-600 text-center py-4">No entries</p>
        ) : (
          filtered.map((entry, i) => {
            const toolColor = TOOL_COLORS[entry.tool] ?? 'text-amber-400';
            return (
              <div
                key={i}
                className="border border-gray-800 rounded p-2 bg-gray-900/50"
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
    </div>
  );
}
