import type { ProviderConfig, ConversationMessage } from '../client/providerAdapter.ts';
import {
  sendProviderMessage,
  buildToolResultMessage,
  buildAssistantMessage,
} from '../client/providerAdapter.ts';
import type { AnthropicToolDefinition, ToolCall, ToolResult, SeekerAction } from '../client/aiClient.ts';
import { getToolDefinitions } from '../client/aiClient.ts';
import { buildSeekerSystemPrompt } from '../client/systemPrompts.ts';
import type { SeekerProposal, ConsensusResult } from './consensus.ts';
import { resolveConsensus } from './consensus.ts';
import { getStations, getNeighbors } from '../data/graph.ts';
import { getQuestionById, QUESTION_POOL } from '../questions/questionPool.ts';
import { evaluateQuestion } from '../questions/evaluators.ts';
import {
  canAskCategory,
  recordQuestion,
  getCooldownRemaining,
  type CooldownTracker,
} from '../questions/cooldown.ts';
import type { Constraint } from './constraints.ts';
import { stationMatchesConstraints } from './seekerLoop.ts';
import type { SeekerViewState } from '../mcp/stateFilter.ts';
import { checkWinCondition, checkTimeLimit } from './seekingPhase.ts';
import { canAfford, spendCoins, getCost, type CoinBudget } from './coinSystem.ts';
import { getTravelInfo } from './trainSchedule.ts';
import type { SeekerTurnResult, TravelRouteEntry } from '../client/aiClient.ts';
import { logger } from './logger.ts';

const MAX_ACTIONS_PER_TURN = 4;

export interface ConsensusLogEntry {
  turnAction: number;
  proposalA: SeekerProposal;
  proposalB: SeekerProposal;
  revisedA?: SeekerProposal;
  revisedB?: SeekerProposal;
  result: ConsensusResult;
}

function getProposalTool(): AnthropicToolDefinition {
  return {
    name: 'propose_action',
    description:
      'Propose an action to take this turn. You must propose exactly one action. Your partner seeker will also propose an action, and you will need to agree on what to do.',
    input_schema: {
      type: 'object',
      properties: {
        action_type: {
          type: 'string',
          description: 'The type of action to propose: "travel_to" or "ask_question"',
        },
        target: {
          type: 'string',
          description: 'The target of the action: a station_id for travel_to, or a question_id for ask_question',
        },
        reasoning: {
          type: 'string',
          description: 'Brief reasoning for why this action is best',
        },
      },
      required: ['action_type', 'target', 'reasoning'],
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ProposalInput {
  action_type: string;
  target: string;
  reasoning: string;
}

async function getProposal(
  config: ProviderConfig,
  seekerId: 'seeker-a' | 'seeker-b',
  systemPrompt: string,
  stateMessage: string,
  extraContext?: string,
): Promise<SeekerProposal> {
  const tools = [getProposalTool()];
  const history: ConversationMessage[] = [
    {
      role: 'user',
      content: extraContext
        ? `${stateMessage}\n\n${extraContext}`
        : stateMessage,
    },
  ];

  const result = await sendProviderMessage(config, systemPrompt, history, tools);

  const proposalCall = result.toolCalls.find((tc) => tc.name === 'propose_action');
  if (!proposalCall) {
    // Default to a no-op if the AI doesn't propose
    return {
      seekerId,
      actionType: 'none',
      target: '',
      reasoning: 'AI did not propose an action',
    };
  }

  const input = proposalCall.input as unknown as ProposalInput;
  return {
    seekerId,
    actionType: input.action_type,
    target: input.target,
    reasoning: input.reasoning,
  };
}

function buildStateMessage(
  seekerStationId: string,
  gameMinutes: number,
  constraints: Constraint[],
  questionsAsked: Array<{ question: string; answer: string }>,
  coinBudget: CoinBudget | null,
  cooldownTracker: CooldownTracker,
  askedQuestionIds: Set<string>,
  visitedStations?: Set<string>,
): string {
  const stations = getStations();
  const seekerStation = stations[seekerStationId];
  const neighbors = getNeighbors(seekerStationId);

  const allVisited = new Set(visitedStations ?? []);
  allVisited.add(seekerStationId);

  const candidateStations: string[] = [];
  for (const [id, s] of Object.entries(stations)) {
    if (!stationMatchesConstraints(s, constraints)) continue;
    if (!allVisited.has(id)) {
      candidateStations.push(`${s.name} (${id})`);
    }
  }

  // Build travel info for each neighbor
  const neighborInfo = neighbors.map((nId) => {
    const nStation = stations[nId];
    const visited = allVisited.has(nId);
    const travelInfo = getTravelInfo(seekerStationId, nId, gameMinutes);
    const tag = visited ? ' [VISITED]' : '';
    if (travelInfo) {
      return `${nStation?.name ?? nId}: ${travelInfo.trainType}, wait ${Math.round(travelInfo.waitMinutes)}min, travel ${Math.round(travelInfo.travelMinutes)}min${tag}`;
    }
    return `${nStation?.name ?? nId}${tag}`;
  });

  // Available questions
  const availableQuestions = QUESTION_POOL
    .filter((q) => !askedQuestionIds.has(q.id) && canAskCategory(cooldownTracker, q.category, gameMinutes))
    .filter((q) => !coinBudget || canAfford(coinBudget, q.category))
    .map((q) => `${q.id}: "${q.text}" (cost: ${getCost(q.category)} coins)`);

  const parts = [
    `You are at ${seekerStation?.name ?? seekerStationId} (${seekerStation?.country ?? ''}).`,
    `Game time: ${Math.floor(gameMinutes)} minutes.`,
    coinBudget ? `Coins: ${coinBudget.remaining}/${coinBudget.total}` : '',
    `Candidate stations (${candidateStations.length}): ${candidateStations.join(', ')}`,
    `Visited stations (${allVisited.size}): ${Array.from(allVisited).map(id => stations[id]?.name ?? id).join(', ')}`,
    `Adjacent stations:\n${neighborInfo.join('\n')}`,
    `Available questions:\n${availableQuestions.join('\n')}`,
    'Propose ONE action: either travel_to a station or ask_question. Do NOT revisit stations — the hider is not there.',
  ];

  return parts.filter(Boolean).join('\n\n');
}

export async function runConsensusTurn(
  configA: ProviderConfig,
  configB: ProviderConfig,
  seekerStationId: string,
  hiderStationId: string,
  gameMinutes: number,
  cooldownTracker: CooldownTracker,
  constraints: Constraint[],
  questionsAsked: Array<{ question: string; answer: string }>,
  coinBudget: CoinBudget | null,
  turnNumber: number,
  onAction: (action: SeekerAction) => void,
  onConsensus?: (entry: ConsensusLogEntry) => void,
  visitedStations?: Set<string>,
): Promise<SeekerTurnResult & { coinBudget: CoinBudget | null; cooldownTracker: CooldownTracker }> {
  const stations = getStations();
  const systemPrompt = buildSeekerSystemPrompt();
  let currentStation = seekerStationId;
  let currentCooldown = cooldownTracker;
  let currentCoins = coinBudget;
  let currentGameMinutes = gameMinutes;
  const newConstraints: Constraint[] = [];
  const newQuestions: Array<{ question: string; answer: string }> = [];
  const travelRoute: TravelRouteEntry[] = [];

  const askedQuestionIds = new Set<string>();
  for (const q of questionsAsked) {
    const match = QUESTION_POOL.find((p) => p.text === q.question);
    if (match) askedQuestionIds.add(match.id);
  }

  logger.info('consensusLoop', `=== CONSENSUS TURN ${turnNumber} === at ${stations[currentStation]?.name}, game time: ${Math.floor(currentGameMinutes)}min`);

  for (let actionNum = 0; actionNum < MAX_ACTIONS_PER_TURN; actionNum++) {
    const stateMessage = buildStateMessage(
      currentStation,
      currentGameMinutes,
      [...constraints, ...newConstraints],
      [...questionsAsked, ...newQuestions],
      currentCoins,
      currentCooldown,
      askedQuestionIds,
      visitedStations,
    );

    // Phase 1: Both seekers propose in parallel
    logger.info('consensusLoop', `Action ${actionNum + 1}: getting proposals from both seekers...`);
    const [proposalA, proposalB] = await Promise.all([
      getProposal(configA, 'seeker-a', systemPrompt, stateMessage),
      getProposal(configB, 'seeker-b', systemPrompt, stateMessage),
    ]);

    logger.info('consensusLoop', `Seeker A proposes: ${proposalA.actionType} → ${proposalA.target}`);
    logger.info('consensusLoop', `Seeker B proposes: ${proposalB.actionType} → ${proposalB.target}`);

    // Phase 2: Check initial agreement
    let revisedA: SeekerProposal | null = null;
    let revisedB: SeekerProposal | null = null;

    if (proposalA.actionType !== proposalB.actionType || proposalA.target !== proposalB.target) {
      // Disagreement → discussion round
      logger.info('consensusLoop', 'Proposals differ, entering discussion phase...');
      const discussionContext = `Your partner proposed: ${proposalB.actionType} "${proposalB.target}" because: "${proposalB.reasoning}". You proposed: ${proposalA.actionType} "${proposalA.target}". Consider their reasoning and either stick with your proposal or change to theirs.`;
      const discussionContextB = `Your partner proposed: ${proposalA.actionType} "${proposalA.target}" because: "${proposalA.reasoning}". You proposed: ${proposalB.actionType} "${proposalB.target}". Consider their reasoning and either stick with your proposal or change to theirs.`;

      [revisedA, revisedB] = await Promise.all([
        getProposal(configA, 'seeker-a', systemPrompt, stateMessage, discussionContext),
        getProposal(configB, 'seeker-b', systemPrompt, stateMessage, discussionContextB),
      ]);

      logger.info('consensusLoop', `Revised A: ${revisedA.actionType} → ${revisedA.target}`);
      logger.info('consensusLoop', `Revised B: ${revisedB.actionType} → ${revisedB.target}`);
    }

    // Phase 3: Resolve
    const consensusResult = resolveConsensus(proposalA, proposalB, revisedA, revisedB, turnNumber + actionNum);

    logger.info('consensusLoop', `Consensus: ${consensusResult.method} → ${consensusResult.action.actionType} "${consensusResult.action.target}"`);

    if (onConsensus) {
      onConsensus({
        turnAction: actionNum,
        proposalA,
        proposalB,
        revisedA: revisedA ?? undefined,
        revisedB: revisedB ?? undefined,
        result: consensusResult,
      });
    }

    onAction({
      type: 'thinking',
      text: `Consensus (${consensusResult.method}): ${consensusResult.action.actionType} → ${consensusResult.action.target}`,
    });

    // Execute the agreed action
    const action = consensusResult.action;

    if (action.actionType === 'travel_to') {
      const neighbors = getNeighbors(currentStation);
      if (!neighbors.includes(action.target)) {
        logger.warn('consensusLoop', `Invalid travel target: ${action.target} not adjacent to ${currentStation}`);
        onAction({ type: 'travel_to', stationId: action.target, success: false, message: 'Not adjacent' });
        continue;
      }

      // Compute travel time
      const fromStation = currentStation;
      const travelInfo = getTravelInfo(currentStation, action.target, currentGameMinutes);
      if (travelInfo) {
        currentGameMinutes = travelInfo.arrivalTime;
      }

      currentStation = action.target;
      const newStation = stations[currentStation];
      logger.info('consensusLoop', `TRAVEL: → ${newStation?.name ?? action.target}`);

      if (travelInfo) {
        travelRoute.push({
          stationId: action.target,
          fromStationId: fromStation,
          departureTime: travelInfo.departureTime,
          arrivalTime: travelInfo.arrivalTime,
          trainType: travelInfo.trainType,
        });
      }

      onAction({
        type: 'travel_to',
        stationId: action.target,
        success: true,
        message: `Traveled to ${newStation?.name ?? action.target}`,
        travelInfo: travelInfo ? {
          fromStationId: fromStation,
          toStationId: action.target,
          departureTime: travelInfo.departureTime,
          arrivalTime: travelInfo.arrivalTime,
          trainType: travelInfo.trainType,
        } : undefined,
      });

      // Check win
      const hiderStation = stations[hiderStationId];
      if (newStation && hiderStation) {
        const won = checkWinCondition(
          { lat: newStation.lat, lng: newStation.lng },
          { lat: hiderStation.lat, lng: hiderStation.lng, radius: 0.8 },
        );
        if (won) {
          logger.info('consensusLoop', `=== SEEKER WINS === Found hider at ${newStation.name}!`);
          return {
            seekerStationId: currentStation,
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
    } else if (action.actionType === 'ask_question') {
      const question = getQuestionById(action.target);
      if (!question) {
        logger.warn('consensusLoop', `Unknown question: ${action.target}`);
        continue;
      }

      if (askedQuestionIds.has(action.target)) {
        logger.warn('consensusLoop', `Question already asked: ${action.target}`);
        continue;
      }

      if (!canAskCategory(currentCooldown, question.category, currentGameMinutes)) {
        logger.warn('consensusLoop', `Question on cooldown: ${action.target}`);
        continue;
      }

      // Check coin budget
      if (currentCoins && !canAfford(currentCoins, question.category)) {
        logger.warn('consensusLoop', `Cannot afford question: ${action.target}`);
        continue;
      }

      const evalResult = evaluateQuestion(question, hiderStationId, currentStation);
      currentCooldown = recordQuestion(currentCooldown, question.category, currentGameMinutes);
      askedQuestionIds.add(action.target);

      if (currentCoins) {
        currentCoins = spendCoins(currentCoins, question.category);
      }

      if (evalResult.constraint) {
        newConstraints.push(evalResult.constraint);
      }
      newQuestions.push({ question: question.text, answer: evalResult.answer });

      logger.info('consensusLoop', `QUESTION: "${question.text}" → "${evalResult.answer}"`);
      onAction({
        type: 'ask_question',
        questionId: action.target,
        questionText: question.text,
        category: question.category,
        answer: evalResult.answer,
        constraint: evalResult.constraint,
      });
    }

    await sleep(800);
  }

  // Check time limit
  if (checkTimeLimit(currentGameMinutes)) {
    logger.info('consensusLoop', `=== HIDER WINS === Time limit reached`);
    return {
      seekerStationId: currentStation,
      newConstraints,
      newQuestions,
      gameOver: true,
      gameResult: 'hider_wins',
      coinBudget: currentCoins,
      cooldownTracker: currentCooldown,
      travelRoute,
    };
  }

  // If no actions were taken, delay next action to prevent infinite restart loop
  const actedThisTurn = newQuestions.length > 0 || currentStation !== seekerStationId;
  const nextActionTime = actedThisTurn ? currentGameMinutes : currentGameMinutes + 15;

  return {
    seekerStationId: currentStation,
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
