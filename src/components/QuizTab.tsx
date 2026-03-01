import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { getStations } from '../data/graph';
import { canTakeQuiz, formatCooldownRemaining, QUIZ_COOLDOWN_MINUTES, QUIZ_COST } from '../engine/quizSystem';



export default function QuizTab({ mobile = false }: { mobile?: boolean }) {
  const phase = useGameStore((s) => s.phase);
  const playerStationId = useGameStore((s) => s.playerStationId);
  const playerTransit = useGameStore((s) => s.playerTransit);
  const coinBudget = useGameStore((s) => s.coinBudget);
  const quizSession = useGameStore((s) => s.quizSession);
  const quizCooldown = useGameStore((s) => s.quizCooldown);
  const clock = useGameStore((s) => s.clock);
  const startQuiz = useGameStore((s) => s.startQuiz);
  const answerQuestion = useGameStore((s) => s.answerQuestion);
  const closeQuiz = useGameStore((s) => s.closeQuiz);

  // Context station (departure when in transit)
  const contextStationId = playerTransit ? playerTransit.fromStationId : playerStationId;
  const stations = getStations();
  const contextStation = contextStationId ? stations[contextStationId] : null;

  const [selectedCount, setSelectedCount] = useState<5 | 10>(10);

  const containerClass = mobile
    ? 'flex flex-col gap-3'
    : 'flex flex-col gap-3 border-t border-[#1a3a6a]/40 pt-4 mt-4';

  // No game started
  if (phase === 'setup' || !playerStationId || !coinBudget) {
    return (
      <div className={containerClass}>
        <h3 className="text-xs text-gray-400 uppercase tracking-wide">Geography Quiz</h3>
        <p className="text-xs text-gray-500">Start a game to take quizzes.</p>
      </div>
    );
  }

  // Quiz in progress or completed
  if (quizSession) {
    return (
      <div className={containerClass}>
        {quizSession.phase === 'in_progress' ? (
          <QuizInProgress session={quizSession} onAnswer={answerQuestion} mobile={mobile} />
        ) : (
          <QuizCompleted session={quizSession} onClose={closeQuiz} mobile={mobile} />
        )}
      </div>
    );
  }

  // Cooldown active
  const onCooldown = !canTakeQuiz(quizCooldown, clock.gameMinutes);

  if (onCooldown && quizCooldown !== null) {
    return (
      <div className={containerClass}>
        <h3 className="text-xs text-gray-400 uppercase tracking-wide">Geography Quiz</h3>
        <div className="rounded border border-[#1a3a6a]/40 bg-[#0d2040]/40 px-3 py-2">
          <p className="text-xs text-gray-400">Quiz on cooldown</p>
          <p className="text-sm font-bold text-amber-400 mt-0.5">
            Available in {formatCooldownRemaining(quizCooldown, clock.gameMinutes)}
          </p>
          <p className="text-[10px] text-gray-500 mt-1">Cooldown: {QUIZ_COOLDOWN_MINUTES / 60}h</p>
        </div>
      </div>
    );
  }

  // Ready to take quiz
  const canAffordQuiz = coinBudget.remaining >= QUIZ_COST;

  return (
    <div className={containerClass}>
      <h3 className="text-xs text-gray-400 uppercase tracking-wide">Geography Quiz</h3>
      <div className="rounded border border-[#1a3a6a]/40 bg-[#0d2040]/40 px-3 py-2">
        <p className="text-xs text-gray-400">
          Questions about{' '}
          <span className="text-white font-medium">{contextStation?.name ?? contextStationId}</span>
          {playerTransit && (
            <span className="text-gray-500"> (departure station)</span>
          )}
        </p>
        <p className="text-[10px] text-gray-500 mt-0.5">{QUIZ_COOLDOWN_MINUTES / 60}h cooldown</p>
      </div>

      {/* Question count selector */}
      <div className="flex gap-2">
        {([5, 10] as const).map((n) => (
          <button
            key={n}
            onClick={() => setSelectedCount(n)}
            className={`flex-1 py-1.5 rounded text-sm font-semibold border transition-colors ${
              selectedCount === n
                ? 'border-[#ffbf40] bg-[#ffbf40]/10 text-[#ffbf40]'
                : 'border-[#1a3a6a]/60 text-gray-400 hover:border-[#ffbf40]/40'
            }`}
          >
            {n} questions
          </button>
        ))}
      </div>

      <button
        onClick={() => startQuiz(selectedCount)}
        disabled={!canAffordQuiz}
        className={`w-full py-2.5 rounded text-sm font-bold transition-colors ${
          canAffordQuiz
            ? 'bg-[#ffbf40] text-[#0a1a3a] hover:bg-yellow-300 active:bg-yellow-200'
            : 'bg-[#1a3a6a]/40 text-gray-500 cursor-not-allowed'
        }`}
      >
        {canAffordQuiz ? `Take Quiz (${QUIZ_COST} coin)` : `Need ${QUIZ_COST} coin to start`}
      </button>
    </div>
  );
}

function QuizInProgress({
  session,
  onAnswer,
  mobile,
}: {
  session: import('../types/quiz').QuizSession;
  onAnswer: (idx: number) => void;
  mobile: boolean;
}) {
  const q = session.questions[session.currentIndex];
  const shuffleOrder = session.shuffledIndices[session.currentIndex];
  const total = session.questions.length;
  const current = session.currentIndex + 1;
  const progress = (session.currentIndex / total) * 100;

  const labels = ['A', 'B', 'C', 'D'];

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs text-gray-400 uppercase tracking-wide">Geography Quiz</h3>
        <span className="text-xs text-gray-400">{current} / {total}</span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-[#1a3a6a]/40 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#ffbf40] rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Scope badge */}
      <div className="flex gap-1">
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${q.scope === 'city' ? 'bg-blue-900/40 text-blue-300' : 'bg-emerald-900/40 text-emerald-300'}`}>
          {q.scope === 'city' ? 'City' : 'Country'}
        </span>
      </div>

      {/* Question */}
      <p className={`font-medium text-white leading-snug ${mobile ? 'text-sm' : 'text-xs'}`}>{q.text}</p>

      {/* Options */}
      <div className="grid grid-cols-1 gap-2">
        {shuffleOrder.map((originalIndex, displaySlot) => (
          <button
            key={displaySlot}
            onClick={() => onAnswer(displaySlot)}
            className={`flex items-start gap-2 text-left px-3 py-2 rounded border border-[#1a3a6a]/60 bg-[#0d2040]/40 hover:border-[#ffbf40]/60 hover:bg-[#0d2040]/80 active:bg-[#1a3a6a]/60 transition-colors ${mobile ? 'text-sm' : 'text-xs'}`}
          >
            <span className="shrink-0 w-4 text-center font-bold text-[#ffbf40] mt-0.5">{labels[displaySlot]}</span>
            <span className="text-gray-200">{q.options[originalIndex]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function QuizCompleted({
  session,
  onClose,
  mobile,
}: {
  session: import('../types/quiz').QuizSession;
  onClose: () => void;
  mobile: boolean;
}) {
  const correct = session.answers.filter((a, i) => a === session.shuffledCorrect[i]).length;
  const total = session.questions.length;
  const labels = ['A', 'B', 'C', 'D'];

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs text-gray-400 uppercase tracking-wide">Quiz Complete</h3>

      {/* Score */}
      <div className="rounded border border-[#1a3a6a]/40 bg-[#0d2040]/60 px-4 py-3 text-center">
        <div className={`font-bold text-white ${mobile ? 'text-3xl' : 'text-2xl'}`}>{correct}/{total}</div>
        {session.coinsEarned > 0 ? (
          <div className="text-[#ffbf40] font-bold mt-1">
            +{session.coinsEarned} coin{session.coinsEarned !== 1 ? 's' : ''} earned!
          </div>
        ) : (
          <div className="text-gray-500 mt-1">No coins earned (need 7/10)</div>
        )}
      </div>

      {/* Answer review */}
      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
        {session.questions.map((q, i) => {
          const chosen = session.answers[i];
          const wasCorrect = chosen === session.shuffledCorrect[i];
          const shuffleOrder = session.shuffledIndices[i];
          const correctDisplaySlot = session.shuffledCorrect[i];
          return (
            <div
              key={q.id}
              className={`text-xs px-2 py-1.5 rounded border ${
                wasCorrect
                  ? 'border-emerald-700/40 bg-emerald-900/20 text-emerald-300'
                  : 'border-red-700/40 bg-red-900/20 text-red-300'
              }`}
            >
              <p className="text-white/80 truncate">{q.text}</p>
              {!wasCorrect && (
                <p className="mt-0.5 text-emerald-400/80">
                  ✓ {labels[correctDisplaySlot]}: {q.options[shuffleOrder[correctDisplaySlot]]}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={onClose}
        className="w-full py-2 rounded bg-[#1a3a6a]/60 text-gray-300 text-sm hover:bg-[#1a3a6a]/80 active:bg-[#1a3a6a] transition-colors"
      >
        Done
      </button>
    </div>
  );
}
