/**
 * Entity Search Types
 * Used by @ mention autocomplete and entity context resolution.
 */

export type EntityType = 'contact' | 'company' | 'deal';

/** Result from the entity-search edge function */
export interface EntitySearchResult {
  id: string;
  type: EntityType;
  name: string;
  subtitle: string;
  avatar_url?: string;
  metadata: Record<string, unknown>;
  relevance_score: number;
}

/** An entity reference embedded in a chat message (stored as chip data) */
export interface EntityReference {
  id: string;
  type: EntityType;
  name: string;
}

/** The payload extracted from the rich input on submit */
export interface RichInputPayload {
  text: string;
  entities: EntityReference[];
  skillCommand?: string;
}

/** Resolved entity context for AI prompt injection */
export interface ResolvedEntityContext {
  id: string;
  type: EntityType;
  name: string;
  contextBlock: string; // Formatted text block for the AI prompt
}
