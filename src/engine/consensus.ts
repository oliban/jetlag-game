export interface SeekerProposal {
  seekerId: 'seeker-a' | 'seeker-b';
  actionType: string;
  target: string;
  reasoning: string;
}

export interface ConsensusResult {
  agreed: boolean;
  action: SeekerProposal;
  method: 'agreement' | 'discussion' | 'tiebreaker';
}

/** Check if two proposals agree on action type and target */
export function checkAgreement(a: SeekerProposal, b: SeekerProposal): boolean {
  return a.actionType === b.actionType && a.target === b.target;
}

/** Get the tiebreaker winner for a given turn number (alternates) */
export function getTiebreakerWinner(turnNumber: number): 'seeker-a' | 'seeker-b' {
  return turnNumber % 2 === 0 ? 'seeker-a' : 'seeker-b';
}

/** Select the winning proposal based on agreement, discussion, or tiebreaker */
export function resolveConsensus(
  proposalA: SeekerProposal,
  proposalB: SeekerProposal,
  revisedA: SeekerProposal | null,
  revisedB: SeekerProposal | null,
  turnNumber: number,
): ConsensusResult {
  // Phase 1: Initial agreement
  if (checkAgreement(proposalA, proposalB)) {
    return { agreed: true, action: proposalA, method: 'agreement' };
  }

  // Phase 2: After discussion (revised proposals)
  const finalA = revisedA ?? proposalA;
  const finalB = revisedB ?? proposalB;

  if (checkAgreement(finalA, finalB)) {
    return { agreed: true, action: finalA, method: 'discussion' };
  }

  // Phase 3: Tiebreaker
  const winner = getTiebreakerWinner(turnNumber);
  return {
    agreed: false,
    action: winner === 'seeker-a' ? finalA : finalB,
    method: 'tiebreaker',
  };
}
