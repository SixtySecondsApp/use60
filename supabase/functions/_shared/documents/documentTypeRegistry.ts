/**
 * DOC-001: Document Type Registry
 *
 * Defines all 8 document types the system can auto-generate from meetings.
 * Each type includes display metadata, section definitions, and a generation
 * prompt template for Claude Haiku.
 */

export type DocumentType =
  | 'proposal'
  | 'proposal_terms'
  | 'next_steps'
  | 'team_brief'
  | 'discussion_points'
  | 'scoping_document'
  | 'ideal_workflow'
  | 'project_plan';

export interface DocumentTypeConfig {
  key: DocumentType;
  displayName: string;
  description: string;
  intentKeywords: string[];
  sections: string[];
  defaultTone: 'formal' | 'conversational' | 'internal';
  slackEmoji: string;
  generationPrompt: string;
}

const DOCUMENT_TYPE_CONFIGS: Record<DocumentType, DocumentTypeConfig> = {
  proposal: {
    key: 'proposal',
    displayName: 'Proposal',
    description: 'Full commercial proposal',
    intentKeywords: [
      'proposal',
      'quote',
      'pricing document',
      'commercial offer',
      'send them a proposal',
      'put together a proposal',
      'write up a proposal',
    ],
    sections: [
      'cover',
      'executive_summary',
      'problem',
      'solution',
      'approach',
      'timeline',
      'pricing',
      'next_steps',
    ],
    defaultTone: 'formal',
    slackEmoji: ':briefcase:',
    generationPrompt: `You are generating a "Proposal" document from a sales meeting.
Produce a JSON array of sections. Each section has: { "type": "<section_name>", "title": "<display title>", "content": "<markdown content>" }
Required sections: cover, executive_summary, problem, solution, approach, timeline, pricing, next_steps.
Tone: formal, professional. Write as if this will be sent directly to the prospect.
Use specific details from the meeting — company names, pain points discussed, proposed solutions, and any pricing or timeline mentioned.
If pricing was not discussed, include a placeholder section noting that pricing will follow.`,
  },

  proposal_terms: {
    key: 'proposal_terms',
    displayName: 'Proposal with Terms',
    description: 'Proposal with legal terms',
    intentKeywords: [
      'proposal with terms',
      'terms and conditions',
      'contract proposal',
      'formal agreement',
      'proposal with legal',
      'binding proposal',
    ],
    sections: [
      'cover',
      'executive_summary',
      'solution',
      'pricing',
      'terms_and_conditions',
      'payment_terms',
      'liability',
      'signatures',
    ],
    defaultTone: 'formal',
    slackEmoji: ':scroll:',
    generationPrompt: `You are generating a "Proposal with Terms" document from a sales meeting.
Produce a JSON array of sections. Each section has: { "type": "<section_name>", "title": "<display title>", "content": "<markdown content>" }
Required sections: cover, executive_summary, solution, pricing, terms_and_conditions, payment_terms, liability, signatures.
Tone: formal, legal-aware. This document may be used as a basis for a contract.
Include standard commercial terms placeholders where specific terms were not discussed.
Use specific details from the meeting for the solution and pricing sections.`,
  },

  next_steps: {
    key: 'next_steps',
    displayName: 'Next Steps',
    description: 'Action items from meeting',
    intentKeywords: [
      'next steps',
      'action items',
      'follow up actions',
      'to do list',
      'what we agreed',
      'meeting actions',
      'tasks from meeting',
    ],
    sections: [
      'meeting_recap',
      'action_items',
      'owner_assignments',
      'timeline',
      'next_meeting',
    ],
    defaultTone: 'conversational',
    slackEmoji: ':white_check_mark:',
    generationPrompt: `You are generating a "Next Steps" document from a sales meeting.
Produce a JSON array of sections. Each section has: { "type": "<section_name>", "title": "<display title>", "content": "<markdown content>" }
Required sections: meeting_recap, action_items, owner_assignments, timeline, next_meeting.
Tone: conversational, action-oriented. Be specific — use names, dates, and concrete actions.
Each action item should have a clear owner and deadline where possible.
If a next meeting was discussed, include the proposed date/time and agenda.`,
  },

  team_brief: {
    key: 'team_brief',
    displayName: 'Team Brief',
    description: 'Internal brief for the team',
    intentKeywords: [
      'team brief',
      'internal summary',
      'brief the team',
      'team update',
      'internal debrief',
      'share with the team',
      'team handoff',
    ],
    sections: [
      'deal_overview',
      'prospect_profile',
      'key_takeaways',
      'risks_and_blockers',
      'recommended_actions',
    ],
    defaultTone: 'internal',
    slackEmoji: ':memo:',
    generationPrompt: `You are generating a "Team Brief" document from a sales meeting.
Produce a JSON array of sections. Each section has: { "type": "<section_name>", "title": "<display title>", "content": "<markdown content>" }
Required sections: deal_overview, prospect_profile, key_takeaways, risks_and_blockers, recommended_actions.
Tone: internal, candid. This is for the team only — be honest about risks and opportunities.
Include prospect sentiment, buying signals, objections raised, and competitive mentions.
Flag anything that needs immediate attention or escalation.`,
  },

  discussion_points: {
    key: 'discussion_points',
    displayName: 'Discussion Points',
    description: 'Talking points for next call',
    intentKeywords: [
      'discussion points',
      'talking points',
      'agenda for next call',
      'what to discuss',
      'prep for next meeting',
      'call prep',
      'meeting agenda',
    ],
    sections: [
      'meeting_objective',
      'key_topics',
      'questions_to_ask',
      'points_to_cover',
      'desired_outcomes',
    ],
    defaultTone: 'conversational',
    slackEmoji: ':speech_balloon:',
    generationPrompt: `You are generating a "Discussion Points" document for an upcoming sales call, based on a previous meeting.
Produce a JSON array of sections. Each section has: { "type": "<section_name>", "title": "<display title>", "content": "<markdown content>" }
Required sections: meeting_objective, key_topics, questions_to_ask, points_to_cover, desired_outcomes.
Tone: conversational, strategic. These are internal talking points to guide the next conversation.
Prioritize topics by importance. Include follow-ups from the previous meeting.
Questions should be open-ended and designed to advance the deal.`,
  },

  scoping_document: {
    key: 'scoping_document',
    displayName: 'Scoping Document',
    description: 'Technical scope definition',
    intentKeywords: [
      'scoping document',
      'scope of work',
      'SOW',
      'technical scope',
      'project scope',
      'requirements document',
      'scope definition',
    ],
    sections: [
      'project_overview',
      'objectives',
      'requirements',
      'deliverables',
      'assumptions',
      'constraints',
      'timeline',
      'out_of_scope',
    ],
    defaultTone: 'formal',
    slackEmoji: ':page_facing_up:',
    generationPrompt: `You are generating a "Scoping Document" from a sales meeting.
Produce a JSON array of sections. Each section has: { "type": "<section_name>", "title": "<display title>", "content": "<markdown content>" }
Required sections: project_overview, objectives, requirements, deliverables, assumptions, constraints, timeline, out_of_scope.
Tone: formal, precise. This document defines the boundaries of the engagement.
Be explicit about what is in scope and what is out of scope.
List assumptions clearly — these protect both parties.
Requirements should be specific and measurable where possible.`,
  },

  ideal_workflow: {
    key: 'ideal_workflow',
    displayName: 'Ideal Workflow',
    description: 'Process flow for prospect',
    intentKeywords: [
      'ideal workflow',
      'process flow',
      'workflow design',
      'how it would work',
      'proposed process',
      'workflow recommendation',
      'process improvement',
    ],
    sections: [
      'current_state',
      'pain_points',
      'proposed_workflow',
      'integration_points',
      'expected_outcomes',
      'implementation_steps',
    ],
    defaultTone: 'conversational',
    slackEmoji: ':gear:',
    generationPrompt: `You are generating an "Ideal Workflow" document from a sales meeting.
Produce a JSON array of sections. Each section has: { "type": "<section_name>", "title": "<display title>", "content": "<markdown content>" }
Required sections: current_state, pain_points, proposed_workflow, integration_points, expected_outcomes, implementation_steps.
Tone: conversational, consultative. Show the prospect you understand their current pain and have a clear path forward.
Map the current state honestly, then paint a clear picture of the improved workflow.
Be specific about integration points with their existing tools and systems.`,
  },

  project_plan: {
    key: 'project_plan',
    displayName: 'Project Plan',
    description: 'Detailed project plan',
    intentKeywords: [
      'project plan',
      'implementation plan',
      'delivery plan',
      'rollout plan',
      'project timeline',
      'phased plan',
      'project roadmap',
    ],
    sections: [
      'project_overview',
      'phases',
      'milestones',
      'resource_allocation',
      'dependencies',
      'risks',
      'success_criteria',
      'timeline',
    ],
    defaultTone: 'formal',
    slackEmoji: ':calendar:',
    generationPrompt: `You are generating a "Project Plan" document from a sales meeting.
Produce a JSON array of sections. Each section has: { "type": "<section_name>", "title": "<display title>", "content": "<markdown content>" }
Required sections: project_overview, phases, milestones, resource_allocation, dependencies, risks, success_criteria, timeline.
Tone: formal, structured. This document should give confidence that the project is well-planned.
Break the project into clear phases with measurable milestones.
Identify dependencies and risks upfront with mitigation strategies.
Success criteria should be specific and agreed-upon.`,
  },
};

/**
 * Get the configuration for a specific document type.
 */
export function getDocumentTypeConfig(key: DocumentType): DocumentTypeConfig {
  const config = DOCUMENT_TYPE_CONFIGS[key];
  if (!config) {
    throw new Error(`Unknown document type: ${key}`);
  }
  return config;
}

/**
 * Get all document type configurations.
 */
export function getAllDocumentTypes(): DocumentTypeConfig[] {
  return Object.values(DOCUMENT_TYPE_CONFIGS);
}

/**
 * Match a phrase to a document type using keyword matching.
 * Returns the first matching document type, or null if no match.
 */
export function matchDocumentType(phrase: string): DocumentType | null {
  const normalized = phrase.toLowerCase().trim();

  for (const config of Object.values(DOCUMENT_TYPE_CONFIGS)) {
    for (const keyword of config.intentKeywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        return config.key;
      }
    }
  }

  return null;
}
