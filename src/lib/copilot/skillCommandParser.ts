/**
 * Skill Command Parser
 *
 * Parses /command messages from the RichCopilotInput, validates entity
 * requirements, and prepares the prompt for skill execution.
 */

import type { EntityReference, EntityType, RichInputPayload } from '@/lib/types/entitySearch';

export interface ParsedSkillCommand {
  skillKey: string;
  command: string;
  entities: EntityReference[];
  freeText: string;
}

export interface SkillValidationError {
  type: 'missing_entity' | 'wrong_entity_type' | 'unknown_skill';
  message: string;
}

// Skill definitions — command to required entity types mapping
const SKILL_ENTITY_REQUIREMENTS: Record<string, { required: EntityType[][]; optional: EntityType[] }> = {
  proposal: { required: [['company', 'deal']], optional: ['contact'] },
  followup: { required: [['contact', 'deal']], optional: [] },
  research: { required: [['company', 'contact']], optional: [] },
  summary: { required: [['deal']], optional: ['contact'] },
  objection: { required: [['contact', 'deal']], optional: [] },
  battlecard: { required: [['deal']], optional: ['company'] },
  handoff: { required: [['deal']], optional: ['contact'] },
  chase: { required: [['contact', 'deal']], optional: [] },
  agenda: { required: [['deal', 'contact']], optional: [] },
  win: { required: [['deal']], optional: [] },
};

/**
 * Parse a rich input payload that contains a /command.
 */
export function parseSkillCommand(payload: RichInputPayload): ParsedSkillCommand | null {
  if (!payload.skillCommand) return null;

  const command = payload.skillCommand.toLowerCase().replace(/^\//, '');

  // Extract free text (everything after the /command and entity chips)
  let freeText = payload.text;
  // Remove the /command prefix from the text
  const cmdPattern = new RegExp(`^\\/${command}\\s*`, 'i');
  freeText = freeText.replace(cmdPattern, '');
  // Remove @entityName references from text (already captured as entities)
  for (const entity of payload.entities) {
    freeText = freeText.replace(`@${entity.name}`, '').trim();
  }
  freeText = freeText.replace(/\s+/g, ' ').trim();

  return {
    skillKey: `copilot-${command}`,
    command,
    entities: payload.entities,
    freeText,
  };
}

/**
 * Validate that required entity types are present for a skill command.
 * Returns null if valid, or a validation error.
 *
 * The `required` field is an array of entity type arrays (OR groups).
 * At least one entity matching ANY of the required types must be present.
 * e.g., required: [['company', 'deal']] means at least one company OR deal.
 */
export function validateSkillEntities(
  command: string,
  entities: EntityReference[],
): SkillValidationError | null {
  const reqs = SKILL_ENTITY_REQUIREMENTS[command];
  if (!reqs) {
    return { type: 'unknown_skill', message: `Unknown skill: /${command}` };
  }

  const entityTypes = entities.map((e) => e.type);

  for (const requiredGroup of reqs.required) {
    const hasMatch = requiredGroup.some((t) => entityTypes.includes(t));
    if (!hasMatch) {
      const typeNames = requiredGroup.join(' or ');
      return {
        type: 'missing_entity',
        message: `/${command} needs a ${typeNames}. Who should I ${command === 'proposal' ? 'write this for' : 'work with'}?`,
      };
    }
  }

  return null;
}

/**
 * Build the enriched prompt for a skill command.
 * Merges the command, entity context, and free text into a structured prompt.
 */
export function buildSkillPrompt(
  parsed: ParsedSkillCommand,
  entityContextBlock: string,
): string {
  const parts: string[] = [];

  parts.push(`<skill_command>/${parsed.command}</skill_command>`);

  if (entityContextBlock) {
    parts.push(entityContextBlock);
  }

  if (parsed.freeText) {
    parts.push(`<additional_instructions>${parsed.freeText}</additional_instructions>`);
  }

  parts.push(`Please execute the /${parsed.command} skill using the entity context provided above. Follow the structured workflow for this skill type.`);

  return parts.join('\n\n');
}
