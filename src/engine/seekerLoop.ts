import type { Constraint } from './constraints.ts';
import { haversineDistance } from './geo.ts';
import type { SeekerViewState } from '../mcp/stateFilter.ts';
import type {
  SeekerAction,
  SeekerTurnResult,
  ToolResult,
  AskQuestionParams,
  TravelToParams,
  AvailableQuestion,
} from '../client/aiClient.ts';
import { getToolDefinitions } from '../client/aiClient.ts';
import { buildSeekerSystemPrompt } from '../client/systemPrompts.ts';
import type { ProviderConfig, ConversationMessage } from '../client/providerAdapter.ts';
import {
  sendProviderMessage,
  buildToolResultMessage,
  buildAssistantMessage,
} from '../client/providerAdapter.ts';
import { getQuestionById, QUESTION_POOL } from '../questions/questionPool.ts';
import { evaluateQuestion } from '../questions/evaluators.ts';
import {
  canAskCategory,
  recordQuestion,
  getCooldownRemaining,
  type CooldownTracker,
} from '../questions/cooldown.ts';
import { getStations, getNeighbors } from '../data/graph.ts';
import { checkWinCondition, checkTimeLimit } from './seekingPhase.ts';
import { logger } from './logger.ts';
import { canAfford, spendCoins, getCost, type CoinBudget } from './coinSystem.ts';
import { getTravelInfo } from './trainSchedule.ts';

const MAX_INFO_ROUNDS = 4;    // rounds where AI only gathers info (get_my_state, get_available_questions)
const MAX_TOTAL_ROUNDS = 12;  // hard safety cap

/** Check if a station satisfies all geometric constraints */
export function stationMatchesConstraints(
  station: { lat: number; lng: number; name: string; country: string; connections: number },
  allConstraints: Constraint[],
): boolean {
  for (const c of allConstraints) {
    if (c.type === 'circle') {
      const dist = haversineDistance(station.lat, station.lng, c.centerLat, c.centerLng);
      if (c.inside && dist > c.radiusKm) return false;  // should be inside but isn't
      if (!c.inside && dist <= c.radiusKm) return false; // should be outside but isn't
    } else if (c.type === 'half-plane') {
      if (c.axis === 'latitude') {
        if (c.direction === 'above' && station.lat <= c.value) return false;
        if (c.direction === 'below' && station.lat >= c.value) return false;
      } else {
        if (c.direction === 'east' && station.lng <= c.value) return false;
        if (c.direction === 'west' && station.lng >= c.value) return false;
      }
    } else if (c.type === 'text') {
      if (c.label.startsWith('Not in ') && station.country === c.label.slice(7)) return false;
      if (c.label.startsWith('In ') && station.country !== c.label.slice(3)) return false;
      if (c.label === 'Hub station (4+ connections)') {
        if (c.value === 'Yes' && station.connections < 4) return false;
        if (c.value === 'No' && station.connections >= 4) return false;
      }
      if (c.label === 'Station name A–M') {
        const first = station.name[0].toUpperCase();
        const isAM = first >= 'A' && first <= 'M';
        if (c.value === 'Yes' && !isAM) return false;
        if (c.value === 'No' && isAM) return false;
      }
    }
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSeekerTurn(
  apiKeyOrConfig: string | ProviderConfig,
  seekerStationId: string,
  hiderStationId: string,
  gameMinutes: number,
  cooldownTracker: CooldownTracker,
  constraints: Constraint[],
  questionsAsked: Array<{ question: string; answer: string }>,
  onAction: (action: SeekerAction) => void,
  coinBudget?: CoinBudget | null,
  visitedStations?: Set<string>,
): Promise<SeekerTurnResult & { coinBudget?: CoinBudget | null; cooldownTracker?: CooldownTracker }> {
  // Support both raw API key (backward compat) and ProviderConfig
  const providerConfig: ProviderConfig = typeof apiKeyOrConfig === 'string'
    ? { type: 'claude', apiKey: apiKeyOrConfig }
    : apiKeyOrConfig;

  const stations = getStations();
  const tools = getToolDefinitions();
  const systemPrompt = buildSeekerSystemPrompt();

  let currentSeekerStation = seekerStationId;
  let currentCooldown = cooldownTracker;
  let currentCoins = coinBudget ?? null;
  let turnGameMinutes = gameMinutes;
  const newConstraints: Constraint[] = [];
  const newQuestions: Array<{ question: string; answer: string }> = [];
  const travelRoute: import('../client/aiClient.ts').TravelRouteEntry[] = [];

  // Track asked question IDs — each question can only be asked once per game
  const askedQuestionIds = new Set<string>();
  for (const q of questionsAsked) {
    const match = QUESTION_POOL.find((p) => p.text === q.question);
    if (match) askedQuestionIds.add(match.id);
  }

  logger.info('seekerLoop', `=== SEEKER TURN START === at ${stations[seekerStationId]?.name} (${seekerStationId}), game time: ${Math.floor(gameMinutes)}min`);

  // Build initial conversation with a user message prompting the AI to take its turn
  const conversationHistory: ConversationMessage[] = [
    {
      role: 'user',
      content: `It is your turn. The game clock is at ${Math.floor(turnGameMinutes)} minutes. You are at station "${stations[currentSeekerStation]?.name ?? currentSeekerStation}". ${currentCoins ? `You have ${currentCoins.remaining}/${currentCoins.total} coins remaining.` : ''}\n\nCall get_my_state to see your candidateStations and visitedStations. Then plan your moves.\n\nYou can call travel_to MULTIPLE TIMES to plan a multi-hop route. All hops will execute as a queue — you won't stop to think between them. Plan a full route toward candidate stations. You can also ask a question before or between travels. Always travel toward UNVISITED candidate stations.`,
    },
  ];

  let infoRounds = 0;
  let totalRounds = 0;

  while (infoRounds < MAX_INFO_ROUNDS && totalRounds < MAX_TOTAL_ROUNDS) {
    // Yield to the event loop between rounds so React can re-render
    if (totalRounds > 0) {
      await sleep(800);
    }

    logger.info('seekerLoop', `Round ${totalRounds + 1} (info: ${infoRounds}/${MAX_INFO_ROUNDS}): calling ${providerConfig.type} API...`);

    const result = await sendProviderMessage(
      providerConfig,
      systemPrompt,
      conversationHistory,
      tools,
    );

    logger.info('seekerLoop', `${providerConfig.type} responded: ${result.toolCalls.length} tool calls, stop_reason=${result.stopReason}`,
      result.toolCalls.map(tc => `${tc.name}(${JSON.stringify(tc.input)})`));

    // Report thinking text
    if (result.thinkingText) {
      logger.debug('seekerLoop', `AI thinking: ${result.thinkingText.slice(0, 200)}...`);
      onAction({ type: 'thinking', text: result.thinkingText });
    }

    // If no tool calls, the AI is done with its turn
    if (result.toolCalls.length === 0) {
      logger.info('seekerLoop', 'No tool calls returned, ending turn');
      break;
    }

    // Add assistant message to conversation history
    conversationHistory.push(buildAssistantMessage(result.toolCalls, result.thinkingText));

    // Count this round: only pure info-gathering rounds count toward the info cap.
    // Action tools (travel_to, ask_question) don't count — those ARE the decision.
    const isInfoOnlyRound = result.toolCalls.every(tc =>
      tc.name === 'get_my_state' || tc.name === 'get_available_questions',
    );
    if (isInfoOnlyRound) infoRounds++;
    totalRounds++;

    // Execute each tool call
    const toolResults: ToolResult[] = [];

    for (const toolCall of result.toolCalls) {
      logger.debug('seekerLoop', `Tool call: ${toolCall.name}`, toolCall.input);

      let resultContent: string;

      switch (toolCall.name) {
        case 'ask_question': {
          const params = toolCall.input as unknown as AskQuestionParams;
          const question = getQuestionById(params.question_id);

          if (!question) {
            resultContent = JSON.stringify({ error: `Unknown question ID: ${params.question_id}` });
            break;
          }

          if (askedQuestionIds.has(params.question_id)) {
            resultContent = JSON.stringify({
              error: `Question "${params.question_id}" has already been asked. Each question can only be asked once.`,
            });
            break;
          }

          if (!canAskCategory(currentCooldown, question.category, turnGameMinutes)) {
            const remaining = getCooldownRemaining(currentCooldown, question.category, turnGameMinutes);
            resultContent = JSON.stringify({
              error: `Category "${question.category}" is on cooldown. ${Math.ceil(remaining)} game-minutes remaining.`,
            });
            break;
          }

          // Check coin budget
          if (currentCoins && !canAfford(currentCoins, question.category)) {
            resultContent = JSON.stringify({
              error: `Cannot afford ${question.category} question (cost=${getCost(question.category)}, remaining=${currentCoins.remaining} coins).`,
            });
            break;
          }

          const evalResult = evaluateQuestion(question, hiderStationId, currentSeekerStation);
          currentCooldown = recordQuestion(currentCooldown, question.category, turnGameMinutes);
          askedQuestionIds.add(params.question_id);

          // Deduct coins
          if (currentCoins) {
            currentCoins = spendCoins(currentCoins, question.category);
          }

          if (evalResult.constraint) {
            newConstraints.push(evalResult.constraint);
          }
          newQuestions.push({ question: question.text, answer: evalResult.answer });

          resultContent = JSON.stringify({
            answer: evalResult.answer,
            constraint: evalResult.constraint,
            ...(currentCoins ? { coinBudget: currentCoins } : {}),
          });

          logger.info('seekerLoop', `QUESTION: "${question.text}" → "${evalResult.answer}" [${question.category}]${currentCoins ? ` (coins: ${currentCoins.remaining}/${currentCoins.total})` : ''}`);

          onAction({
            type: 'ask_question',
            questionId: params.question_id,
            questionText: question.text,
            category: question.category,
            answer: evalResult.answer,
            constraint: evalResult.constraint,
          });
          break;
        }

        case 'travel_to': {
          const params = toolCall.input as unknown as TravelToParams;
          const neighbors = getNeighbors(currentSeekerStation);

          if (!neighbors.includes(params.station_id)) {
            resultContent = JSON.stringify({
              success: false,
              message: `Cannot travel to "${params.station_id}". Not adjacent to your current station. Available connections: ${neighbors.join(', ')}`,
            });
            onAction({
              type: 'travel_to',
              stationId: params.station_id,
              success: false,
              message: 'Not adjacent',
            });
            break;
          }

          // Compute travel time
          const fromStation = currentSeekerStation;
          const travelInfo = getTravelInfo(currentSeekerStation, params.station_id, turnGameMinutes);

          currentSeekerStation = params.station_id;
          const newStation = stations[currentSeekerStation];

          if (travelInfo) {
            turnGameMinutes = travelInfo.arrivalTime;
            resultContent = JSON.stringify({
              success: true,
              message: `Traveled to ${newStation?.name ?? params.station_id}`,
              trainType: travelInfo.trainType,
              departureTime: Math.round(travelInfo.departureTime),
              arrivalTime: Math.round(travelInfo.arrivalTime),
              waitMinutes: Math.round(travelInfo.waitMinutes),
              travelMinutes: Math.round(travelInfo.travelMinutes),
              currentGameTime: Math.round(turnGameMinutes),
            });
          } else {
            resultContent = JSON.stringify({
              success: true,
              message: `Traveled to ${newStation?.name ?? params.station_id}`,
            });
          }

          logger.info('seekerLoop', `TRAVEL: → ${newStation?.name ?? params.station_id} (${params.station_id})${travelInfo ? ` [${travelInfo.trainType}, +${Math.round(travelInfo.totalMinutes)}min, now at ${Math.round(turnGameMinutes)}min]` : ''}`);

          // Queue this hop — don't send travelInfo to onAction (store manages queue)
          if (travelInfo) {
            travelRoute.push({
              stationId: params.station_id,
              fromStationId: fromStation,
              departureTime: travelInfo.departureTime,
              arrivalTime: travelInfo.arrivalTime,
              trainType: travelInfo.trainType,
            });
          }

          onAction({
            type: 'travel_to',
            stationId: params.station_id,
            success: true,
            message: `Queued travel to ${newStation?.name ?? params.station_id}`,
          });

          // Check win condition after travel
          const hiderStation = stations[hiderStationId];
          if (newStation && hiderStation) {
            const won = checkWinCondition(
              { lat: newStation.lat, lng: newStation.lng },
              { lat: hiderStation.lat, lng: hiderStation.lng, radius: 0.8 },
            );
            if (won) {
              logger.info('seekerLoop', `=== SEEKER WINS === Found hider at ${newStation.name}!`);
              return {
                seekerStationId: currentSeekerStation,
                newConstraints,
                newQuestions,
                gameOver: true,
                gameResult: 'seeker_wins',
                coinBudget: currentCoins,
                cooldownTracker: currentCooldown,
                travelRoute,
              };
            }
          }
          break;
        }

        case 'get_my_state': {
          const seekerStation = stations[currentSeekerStation];
          const neighbors = getNeighbors(currentSeekerStation);
          const allConstraints = [...constraints, ...newConstraints];

          // Combine visited stations from store + stations visited this turn
          const allVisited = new Set(visitedStations ?? []);
          allVisited.add(currentSeekerStation); // current station is always visited

          // Compute candidate stations that match ALL constraints, excluding visited ones
          const candidateStations: string[] = [];
          const eliminatedByVisit: string[] = [];
          for (const [id, s] of Object.entries(stations)) {
            if (!stationMatchesConstraints(s, allConstraints)) continue;
            if (allVisited.has(id)) {
              eliminatedByVisit.push(`${s.name} (${id})`);
            } else {
              candidateStations.push(`${s.name} (${id})`);
            }
          }

          // Build travel info for each neighbor
          const neighborTravelInfo: Record<string, unknown> = {};
          for (const nId of neighbors) {
            const tInfo = getTravelInfo(currentSeekerStation, nId, turnGameMinutes);
            if (tInfo) {
              neighborTravelInfo[nId] = {
                stationName: stations[nId]?.name ?? nId,
                trainType: tInfo.trainType,
                nextDeparture: Math.round(tInfo.departureTime),
                arrivalTime: Math.round(tInfo.arrivalTime),
                waitMinutes: Math.round(tInfo.waitMinutes),
                travelMinutes: Math.round(tInfo.travelMinutes),
                totalMinutes: Math.round(tInfo.totalMinutes),
              };
            }
          }

          const state: Record<string, unknown> = {
            phase: 'seeking',
            seekerStationId: currentSeekerStation,
            seekerStationName: seekerStation?.name ?? currentSeekerStation,
            seekerCountry: seekerStation?.country ?? '',
            gameMinutes: turnGameMinutes,
            constraints: allConstraints,
            availableConnections: neighbors,
            questionsAsked: [...questionsAsked, ...newQuestions],
            candidateStations,
            visitedStations: Array.from(allVisited).map(id => stations[id]?.name ?? id),
            eliminatedByVisit: eliminatedByVisit.length,
          };

          if (Object.keys(neighborTravelInfo).length > 0) {
            state.neighborTravelInfo = neighborTravelInfo;
          }
          if (currentCoins) {
            state.coinBudget = currentCoins;
          }

          resultContent = JSON.stringify(state);
          onAction({ type: 'get_my_state', state });

          logger.info('seekerLoop', `Candidate stations (${candidateStations.length}): ${candidateStations.join(', ')}`);
          break;
        }

        case 'get_available_questions': {
          const questions: AvailableQuestion[] = QUESTION_POOL.map((q) => {
            const alreadyAsked = askedQuestionIds.has(q.id);
            const cost = getCost(q.category);
            const affordable = currentCoins ? canAfford(currentCoins, q.category) : true;
            return {
              id: q.id,
              text: q.text,
              category: q.category,
              available: !alreadyAsked && canAskCategory(currentCooldown, q.category, turnGameMinutes) && affordable,
              cooldown_remaining: alreadyAsked ? -1 : getCooldownRemaining(currentCooldown, q.category, turnGameMinutes),
              cost,
              affordable,
            };
          });
          // Calculate how many more questions the AI can afford in total
          const remainingAffordable = questions.filter(q => q.available && !askedQuestionIds.has(q.id)).length;
          const totalQuestionsLeft = QUESTION_POOL.length - askedQuestionIds.size;
          resultContent = JSON.stringify({
            questions,
            ...(currentCoins ? {
              coinBudget: currentCoins,
              budgetWarning: currentCoins.remaining <= 3
                ? `WARNING: Only ${currentCoins.remaining} coins left. Every question must count. Consider whether traveling to a better position first would make a question more valuable.`
                : `You have ${currentCoins.remaining} coins. ${remainingAffordable} questions currently affordable, ${totalQuestionsLeft} total unasked. Spend wisely — coins don't regenerate.`,
            } : {}),
          });
          onAction({ type: 'get_available_questions', questions });
          break;
        }

        default:
          resultContent = JSON.stringify({ error: `Unknown tool: ${toolCall.name}` });
      }

      toolResults.push({
        tool_use_id: toolCall.id,
        content: resultContent,
      });

      logger.debug('seekerLoop', `Tool result for ${toolCall.name}`, resultContent);

      // Yield to the event loop so React can re-render after each tool action
      await sleep(500);
    }

    // Add tool results to conversation history
    conversationHistory.push(buildToolResultMessage(toolResults));



    // If the AI's stop reason was end_turn (not tool_use), we're done
    if (result.stopReason === 'end_turn') {
      logger.info('seekerLoop', 'AI signaled end_turn, finishing this turn');
      break;
    }
  }

  // Check time limit
  if (checkTimeLimit(turnGameMinutes)) {
    logger.info('seekerLoop', `=== HIDER WINS === Time limit reached at ${Math.floor(turnGameMinutes)}min`);
    return {
      seekerStationId: currentSeekerStation,
      newConstraints,
      newQuestions,
      gameOver: true,
      gameResult: 'hider_wins',
      coinBudget: currentCoins,
      cooldownTracker: currentCooldown,
    };
  }

  // If the AI didn't actually do anything this turn (no travel, no questions),
  // delay the next action to prevent an infinite restart loop.
  const actedThisTurn = newQuestions.length > 0 || travelRoute.length > 0;
  const nextActionTime = actedThisTurn ? turnGameMinutes : turnGameMinutes + 15;

  logger.info('seekerLoop', `=== TURN END === Seeker route: ${travelRoute.map(t => stations[t.stationId]?.name ?? t.stationId).join(' → ') || '(none)'}, ${newQuestions.length} questions, game time: ${Math.round(turnGameMinutes)}min, nextAction: ${Math.round(nextActionTime)}min`);

  return {
    seekerStationId: currentSeekerStation,
    newConstraints,
    newQuestions,
    gameOver: false,
    gameResult: null,
    coinBudget: currentCoins,
    cooldownTracker: currentCooldown,
    nextActionTime,
    travelRoute,
  };
}
