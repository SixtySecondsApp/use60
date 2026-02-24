/**
 * Variable interpolation system for AI prompts
 * Supports {{variableName}} syntax with nested object access
 */

export interface VariableContext {
  deal?: {
    id?: string;
    value?: number;
    stage?: string;
    company?: string;
    contact?: string;
    probability?: number;
    closeDate?: string;
  };
  contact?: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    title?: string;
  };
  activity?: {
    type?: string;
    date?: string;
    notes?: string;
    outcome?: string;
  };
  task?: {
    id?: string;
    title?: string;
    description?: string;
    dueDate?: string;
    priority?: string;
    status?: string;
  };
  workflow?: {
    executionId?: string;
    startTime?: string;
    currentNode?: string;
    previousOutput?: any;
  };
  formData?: {
    submittedAt?: string;
    fields?: Record<string, any>;
    formId?: string;
    submissionId?: string;
    formTitle?: string;
    submitterIp?: string;
    submitterUserAgent?: string;
  };
  factProfile?: {
    id: string;
    company_name: string;
    industry: string;
    description: string;
    products: string[];
    value_propositions: string[];
    pain_points: string[];
    differentiators: string[];
    tech_stack: string[];
    target_industries: string[];
    target_roles: string[];
  };
  productProfile?: {
    id: string;
    name: string;
    category: string;
    description: string;
    value_propositions: string[];
    pricing_model: string;
    key_features: string[];
    differentiators: string[];
    pain_points_solved: string[];
    target_industries: string[];
    target_company_sizes: string[];
    target_roles: string[];
    use_cases: string[];
  };
  custom?: Record<string, any>;
}

/**
 * Parse a template string and extract variable names
 * @param template - The template string containing {{variables}}
 * @returns Array of variable names found in the template
 */
export function extractVariables(template: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const variables: string[] = [];
  let match;

  while ((match = regex.exec(template)) !== null) {
    const variable = match[1].trim();
    if (!variables.includes(variable)) {
      variables.push(variable);
    }
  }

  return variables;
}

/**
 * Replace variables in a template with actual values
 * @param template - The template string containing {{variables}}
 * @param context - The context object containing variable values
 * @returns The template with variables replaced
 */
export function interpolateVariables(
  template: string,
  context: VariableContext
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
    const trimmedVar = variable.trim();
    const value = getNestedValue(context, trimmedVar);
    
    if (value === undefined || value === null) {
      // Return the original placeholder if value not found
      return match;
    }
    
    // Convert value to string
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    return String(value);
  });
}

/**
 * Get a nested value from an object using dot notation
 * @param obj - The object to search
 * @param path - The path to the value (e.g., "deal.value")
 * @returns The value at the path, or undefined if not found
 */
function getNestedValue(obj: any, path: string): any {
  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * Get available variables from a context object
 * @param context - The context object
 * @returns Array of available variable paths
 */
export function getAvailableVariables(context: VariableContext): string[] {
  const variables: string[] = [];

  function traverse(obj: any, prefix: string = '') {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        const path = prefix ? `${prefix}.${key}` : key;

        if (value && typeof value === 'object' && !Array.isArray(value)) {
          traverse(value, path);
        } else if (value !== undefined) {
          variables.push(path);
        }
      }
    }
  }

  traverse(context);
  return variables;
}

/**
 * Validate that all required variables in a template are available
 * @param template - The template string
 * @param context - The context object
 * @returns Object with validation result and missing variables
 */
export function validateTemplate(
  template: string,
  context: VariableContext
): { isValid: boolean; missingVariables: string[] } {
  const requiredVariables = extractVariables(template);
  const availableVariables = getAvailableVariables(context);
  const missingVariables: string[] = [];

  for (const variable of requiredVariables) {
    const value = getNestedValue(context, variable);
    if (value === undefined || value === null) {
      missingVariables.push(variable);
    }
  }

  return {
    isValid: missingVariables.length === 0,
    missingVariables,
  };
}

/**
 * Format a value for display in the UI
 * @param value - The value to format
 * @returns Formatted string representation
 */
export function formatVariableValue(value: any): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  
  if (typeof value === 'number') {
    // Format numbers with appropriate precision
    if (value % 1 === 0) {
      return value.toLocaleString();
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  
  if (value instanceof Date) {
    return value.toLocaleDateString();
  }
  
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  
  return String(value);
}

/**
 * Create a context object from workflow execution data
 * @param workflowData - Data from the workflow execution
 * @returns A properly structured context object
 */
export function createContextFromWorkflow(workflowData: any): VariableContext {
  const context: VariableContext = {
    workflow: {
      executionId: workflowData.executionId,
      startTime: workflowData.startTime,
      currentNode: workflowData.currentNode,
      previousOutput: workflowData.previousOutput,
    },
  };

  // Map common workflow data to context
  if (workflowData.deal) {
    context.deal = workflowData.deal;
  }

  if (workflowData.contact) {
    context.contact = workflowData.contact;
  }

  if (workflowData.activity) {
    context.activity = workflowData.activity;
  }

  if (workflowData.task) {
    context.task = workflowData.task;
  }

  // Add form data if present
  if (workflowData.formData) {
    context.formData = workflowData.formData;
  }

  // Add any custom data
  if (workflowData.custom) {
    context.custom = workflowData.custom;
  }

  return context;
}