/**
 * Natural Language Query Bar Types
 *
 * Type definitions for parsing natural language queries into structured
 * Apify actor searches. Used by the NL query parser edge function and
 * query bar UI components.
 */

// ---------------------------------------------------------------------------
// Entity Types
// ---------------------------------------------------------------------------

export type EntityType = 'companies' | 'people';

// ---------------------------------------------------------------------------
// Source Preferences
// ---------------------------------------------------------------------------

export type SourcePreference = 'linkedin' | 'maps' | 'serp' | 'apollo' | 'ai_ark';

// ---------------------------------------------------------------------------
// Filter Types
// ---------------------------------------------------------------------------

export type FilterOperator = 'equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'not_in';

export interface ParsedFilter {
  field: string;
  value: string | number | string[] | number[];
  operator?: FilterOperator;
}

// ---------------------------------------------------------------------------
// Query Parse Result
// ---------------------------------------------------------------------------

export interface QueryParseResult {
  /** Entity type to search for */
  entity_type: EntityType;

  /** Number of results to return (max 100) */
  count: number;

  /** Geographic location filter */
  location?: string;

  /** Keywords for semantic search */
  keywords?: string[];

  /** Structured filters (title, industry, size, etc.) */
  filters?: ParsedFilter[];

  /** Preferred data source */
  source_preference?: SourcePreference;

  /** Confidence score from NLP parser (0-1) */
  confidence: number;

  /** Original natural language query */
  original_query?: string;

  /** Suggested Apify actor ID */
  suggested_actor_id?: string;
}

// ---------------------------------------------------------------------------
// Query Validation
// ---------------------------------------------------------------------------

export interface QueryValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export function validateQueryParseResult(result: QueryParseResult): QueryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Count validation
  if (result.count > 100) {
    errors.push('Count exceeds maximum of 100');
  }

  if (result.count < 1) {
    errors.push('Count must be at least 1');
  }

  // Confidence validation
  if (result.confidence < 0 || result.confidence > 1) {
    errors.push('Confidence must be between 0 and 1');
  }

  // Low confidence warning
  if (result.confidence < 0.5) {
    warnings.push('Low confidence parse - query may need clarification');
  }

  // Entity type validation
  const validEntityTypes: EntityType[] = ['companies', 'people', 'agencies', 'organizations'];
  if (!validEntityTypes.includes(result.entity_type)) {
    errors.push(`Invalid entity type: ${result.entity_type}`);
  }

  // Source preference validation
  if (result.source_preference) {
    const validSources: SourcePreference[] = ['linkedin', 'maps', 'serp', 'apollo', 'ai_ark'];
    if (!validSources.includes(result.source_preference)) {
      errors.push(`Invalid source preference: ${result.source_preference}`);
    }
  }

  // Filter validation
  if (result.filters) {
    result.filters.forEach((filter, index) => {
      if (!filter.field || filter.field.trim().length === 0) {
        errors.push(`Filter ${index}: field is required`);
      }

      if (filter.value === undefined || filter.value === null) {
        errors.push(`Filter ${index}: value is required`);
      }

      if (filter.operator) {
        const validOperators: FilterOperator[] = ['equals', 'contains', 'gt', 'lt', 'gte', 'lte', 'in', 'not_in'];
        if (!validOperators.includes(filter.operator)) {
          errors.push(`Filter ${index}: invalid operator "${filter.operator}"`);
        }
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ---------------------------------------------------------------------------
// Actor Input Mapping
// ---------------------------------------------------------------------------

/**
 * Maps parsed query result to Apify actor input
 */
export interface ActorInputMapping {
  actor_id: string;
  input: Record<string, unknown>;
}

/**
 * Maps a parsed query to LinkedIn actor input
 */
export function mapToLinkedInActorInput(query: QueryParseResult): Record<string, unknown> {
  const input: Record<string, unknown> = {};

  // Map keywords
  if (query.keywords && query.keywords.length > 0) {
    input.keywords = query.keywords.join(' ');
  }

  // Map location
  if (query.location) {
    input.location = query.location;
  }

  // Map filters to LinkedIn-specific fields
  if (query.filters) {
    query.filters.forEach(filter => {
      switch (filter.field.toLowerCase()) {
        case 'title':
        case 'job_title':
          input.jobTitle = filter.value;
          break;
        case 'company':
        case 'company_name':
          input.companyName = filter.value;
          break;
        case 'industry':
          input.industry = filter.value;
          break;
        case 'company_size':
        case 'employee_count':
          input.companySize = filter.value;
          break;
        case 'seniority':
        case 'seniority_level':
          input.seniorityLevel = filter.value;
          break;
      }
    });
  }

  // Set max results
  input.maxResults = Math.min(query.count, 100);

  return input;
}

/**
 * Maps a parsed query to Google Maps actor input
 */
export function mapToGoogleMapsActorInput(query: QueryParseResult): Record<string, unknown> {
  const input: Record<string, unknown> = {};

  // Map keywords to search query
  if (query.keywords && query.keywords.length > 0) {
    input.searchQuery = query.keywords.join(' ');
  }

  // Map location
  if (query.location) {
    input.location = query.location;
  }

  // Set max results
  input.maxResults = Math.min(query.count, 100);

  return input;
}

/**
 * Maps a parsed query to Apollo search params
 */
export function mapToApolloSearchParams(query: QueryParseResult): Record<string, unknown> {
  const params: Record<string, unknown> = {
    per_page: Math.min(query.count, 100),
    page: 1,
  };

  // Map keywords
  if (query.keywords && query.keywords.length > 0) {
    params.q_keywords = query.keywords.join(' ');
  }

  // Map location
  if (query.location) {
    params.person_locations = [query.location];
  }

  // Map filters to Apollo-specific fields
  if (query.filters) {
    const titles: string[] = [];
    const industries: string[] = [];
    const seniorities: string[] = [];

    query.filters.forEach(filter => {
      switch (filter.field.toLowerCase()) {
        case 'title':
        case 'job_title':
          if (Array.isArray(filter.value)) {
            titles.push(...filter.value.map(String));
          } else {
            titles.push(String(filter.value));
          }
          break;
        case 'industry':
          if (Array.isArray(filter.value)) {
            industries.push(...filter.value.map(String));
          } else {
            industries.push(String(filter.value));
          }
          break;
        case 'seniority':
        case 'seniority_level':
          if (Array.isArray(filter.value)) {
            seniorities.push(...filter.value.map(String));
          } else {
            seniorities.push(String(filter.value));
          }
          break;
      }
    });

    if (titles.length > 0) params.person_titles = titles;
    if (industries.length > 0) params.q_organization_keyword_tags = industries;
    if (seniorities.length > 0) params.person_seniorities = seniorities;
  }

  return params;
}

// ---------------------------------------------------------------------------
// Query History
// ---------------------------------------------------------------------------

export interface QueryHistoryItem {
  id: string;
  org_id: string;
  user_id: string;
  original_query: string;
  parsed_result: QueryParseResult;
  executed: boolean;
  result_count?: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Query Suggestions
// ---------------------------------------------------------------------------

export interface QuerySuggestion {
  text: string;
  entity_type: EntityType;
  confidence: number;
}

export const EXAMPLE_QUERIES: QuerySuggestion[] = [
  {
    text: 'Find 50 marketing directors in San Francisco',
    entity_type: 'people',
    confidence: 1.0,
  },
  {
    text: 'Get 25 SaaS companies with 100-500 employees',
    entity_type: 'companies',
    confidence: 1.0,
  },
  {
    text: 'Search for 30 sales managers in tech companies',
    entity_type: 'people',
    confidence: 1.0,
  },
  {
    text: 'Find 20 creative agencies in New York',
    entity_type: 'agencies',
    confidence: 1.0,
  },
  {
    text: 'Get 40 CEOs of Series A startups',
    entity_type: 'people',
    confidence: 1.0,
  },
];
