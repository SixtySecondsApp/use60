import { Node, Edge } from 'reactflow';

export const salesAnalysisWorkflow = {
  id: 'sales-analysis-workflow',
  name: 'Sales Analysis Workflow',
  description: 'Streamlined workflow for processing Fathom meeting data with sales analytics, task categorization, and AI coaching',
  category: 'sales',
  tags: ['fathom', 'sales', 'analytics', 'coaching', 'tasks', 'ai'],
  nodes: [
    // Node 1: Webhook Receiver
    {
      id: 'webhook-receiver',
      type: 'fathomWebhook',
      position: { x: 100, y: 200 },
      data: {
        label: 'Fathom Webhook',
        isConfigured: true,
        webhookUrl: '/api/workflow-webhook/',
        acceptedPayloads: ['meeting_data'],
        config: {
          autoDetectPayload: true,
          extractFathomId: true,
          validatePayload: true
        }
      }
    },
    
    // Node 2: Task Extractor & Categorizer
    {
      id: 'task-categorizer',
      type: 'actionItemProcessor',
      position: { x: 350, y: 200 },
      data: {
        label: 'Task Extractor & Categorizer',
        isConfigured: true,
        config: {
          categorizeByRole: true,
          salesRepCategories: [
            'Follow-up Call',
            'Send Proposal', 
            'Send Information',
            'Prepare Demo',
            'Update CRM',
            'Schedule Meeting'
          ],
          clientCategories: [
            'Review Proposal',
            'Provide Information',
            'Internal Discussion',
            'Decision Meeting',
            'Sign Contract',
            'Implementation Planning'
          ],
          priorityMapping: {
            urgent: 'eeb122d5-d850-4381-b914-2ad09e48421b',
            high: '42641fa1-9e6c-48fd-8c08-ada611ccc92a',
            medium: 'e6153e53-d1c7-431a-afde-cd7c21b02ebb',
            low: '1c00bc94-5358-4348-aaf3-cb2baa4747c4'
          },
          deadlineCalculation: {
            urgent: 1,    // 1 day
            high: 3,      // 3 days  
            medium: 7,    // 1 week
            low: 14       // 2 weeks
          },
          accountForWeekends: true
        }
      }
    },

    // Node 3: Call Analyzer
    {
      id: 'call-analyzer',
      type: 'aiAgent',
      position: { x: 600, y: 200 },
      data: {
        label: 'Call Analyzer',
        isConfigured: true,
        config: {
          modelProvider: 'openai',
          model: 'gpt-4',
          temperature: 0.3,
          maxTokens: 1000,
          systemPrompt: `You are a sales call analyzer. Extract key information from meeting transcripts.`,
          userPrompt: `Analyze this sales call and return a JSON response:

**Meeting:** {{payload.meeting_title}}
**Participants:** {{payload.meeting_invitees}}
**Transcript:** {{payload.transcript.plaintext}}
**Duration:** {{payload.duration_minutes}} minutes

Return JSON with:
{
  "call_summary": "2-3 sentence summary of the call",
  "sentiment": "positive|neutral|negative",
  "next_steps": ["list of concrete next steps mentioned"],
  "call_type": "Discovery|Demo|Follow-up|Proposal|Close|Client Call",
  "key_topics": ["main topics discussed"],
  "decision_makers": ["names and roles of decision makers"],
  "timeline": "urgency and timeline mentioned",
  "budget_discussed": true/false,
  "pain_points": ["specific challenges mentioned"],
  "success_factors": ["positive indicators"]
}`
        }
      }
    },

    // Node 4: Sales Metrics Calculator  
    {
      id: 'metrics-calculator',
      type: 'aiAgent',
      position: { x: 850, y: 200 },
      data: {
        label: 'Sales Metrics Calculator',
        isConfigured: true,
        config: {
          modelProvider: 'openai',
          model: 'gpt-4',
          temperature: 0.1,
          maxTokens: 800,
          systemPrompt: `You are a sales metrics analyzer. Calculate talk time ratios and question counts from transcripts.`,
          userPrompt: `Analyze this transcript for sales metrics:

**Transcript:** {{payload.transcript.plaintext}}
**Sales Rep:** {{payload.fathom_user.name}}
**Duration:** {{payload.duration_minutes}} minutes

Count speaking time and questions. Return JSON:
{
  "talk_time": {
    "sales_rep_percentage": 40,
    "prospect_percentage": 60,
    "total_words_sales": 500,
    "total_words_prospect": 750
  },
  "questions": {
    "sales_rep_questions": 8,
    "prospect_questions": 3,
    "discovery_questions": 5,
    "closing_questions": 2
  },
  "engagement": {
    "interruptions": 2,
    "enthusiasm_level": "high|medium|low",
    "responsiveness": "engaged|neutral|disengaged"
  }
}`
        }
      }
    },

    // Node 5: AI Sales Coach
    {
      id: 'sales-coach',
      type: 'aiAgent', 
      position: { x: 1100, y: 200 },
      data: {
        label: 'AI Sales Coach',
        isConfigured: true,
        config: {
          modelProvider: 'openai',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 1500,
          systemPrompt: `You are an expert sales coach analyzing calls for improvement opportunities. Base recommendations on proven sales methodologies.`,
          userPrompt: `Provide sales coaching analysis:

**Call Data:**
- Summary: {{callAnalysis.call_summary}}
- Type: {{callAnalysis.call_type}}
- Talk Time: {{metrics.talk_time.sales_rep_percentage}}% rep / {{metrics.talk_time.prospect_percentage}}% prospect
- Questions Asked: {{metrics.questions.sales_rep_questions}}
- Sentiment: {{callAnalysis.sentiment}}

**Transcript:** {{payload.transcript.plaintext}}

Return coaching analysis JSON:
{
  "coaching_score": 85,
  "deal_probability": 75,
  "strengths": ["what went well"],
  "improvement_areas": ["specific areas to improve"],
  "talk_time_feedback": "ideal is 30-40% rep, 60-70% prospect",
  "discovery_quality": "excellent|good|needs_improvement",
  "next_call_strategy": "recommendations for next interaction",
  "deal_risk_factors": ["potential blockers"],
  "recommended_actions": ["immediate actions to take"]
}`
        }
      }
    },

    // Node 6: Google Doc Creator
    {
      id: 'doc-creator',
      type: 'googleDocsCreator',
      position: { x: 1350, y: 200 },
      data: {
        label: 'Sales Report Creator',
        isConfigured: true,
        docTitle: '{meeting.title} - Sales Analysis Report',
        config: {
          includeAllAnalysis: true,
          formatForSharing: true,
          addActionItems: true
        },
        template: `# {{payload.meeting_title}} - Sales Analysis Report

## Meeting Overview
- **Date:** {{payload.meeting_start}}
- **Duration:** {{payload.duration_minutes}} minutes
- **Participants:** {{payload.meeting_invitees}}
- **Call Type:** {{callAnalysis.call_type}}
- **Overall Sentiment:** {{callAnalysis.sentiment}}

## Executive Summary
{{callAnalysis.call_summary}}

## Sales Metrics
- **Talk Time Ratio:** {{metrics.talk_time.sales_rep_percentage}}% Sales Rep / {{metrics.talk_time.prospect_percentage}}% Prospect
- **Questions Asked:** {{metrics.questions.sales_rep_questions}} by sales rep, {{metrics.questions.prospect_questions}} by prospect
- **Engagement Level:** {{metrics.engagement.enthusiasm_level}}

## AI Sales Coaching Analysis
- **Coaching Score:** {{coaching.coaching_score}}/10
- **Deal Probability:** {{coaching.deal_probability}}%
- **Discovery Quality:** {{coaching.discovery_quality}}

### Strengths
{{#each coaching.strengths}}
- {{this}}
{{/each}}

### Areas for Improvement
{{#each coaching.improvement_areas}}
- {{this}}
{{/each}}

## Action Items

### Sales Rep Tasks
{{#each tasks.salesRepTasks}}
- **{{this.title}}** - Due: {{this.deadline}} ({{this.priority}})
{{/each}}

### Client/Prospect Tasks  
{{#each tasks.clientTasks}}
- **{{this.title}}** - Due: {{this.deadline}} ({{this.priority}})
{{/each}}

## Next Steps
{{#each callAnalysis.next_steps}}
- {{this}}
{{/each}}

## Coaching Recommendations
{{#each coaching.recommended_actions}}
- {{this}}
{{/each}}

---
*Generated by Sales Analysis Workflow - {{timestamp}}*`
      }
    },

    // Node 7: Database Saver
    {
      id: 'database-saver',
      type: 'meetingUpsert',
      position: { x: 1600, y: 200 },
      data: {
        label: 'Save Analysis Data',
        table: 'meetings',
        upsertKey: 'fathom_recording_id',
        isConfigured: true,
        config: {
          updateExisting: true,
          includeAnalysis: true
        },
        fields: [
          'title',
          'summary', 
          'call_type',
          'sentiment',
          'talk_time_ratio',
          'questions_asked',
          'coaching_score',
          'deal_probability',
          'sales_report_url',
          'ai_analysis',
          'next_steps'
        ]
      }
    },

    // Node 8: Task Creator
    {
      id: 'task-creator',
      type: 'taskCreator',
      position: { x: 1850, y: 200 },
      data: {
        label: 'Create CRM Tasks',
        isConfigured: true,
        config: {
          createSeparateTasks: true,
          linkToMeeting: true,
          notifyAssignees: true
        }
      }
    }
  ] as Node[],
  
  edges: [
    {
      id: 'webhook-to-categorizer',
      source: 'webhook-receiver',
      target: 'task-categorizer',
      type: 'default'
    },
    {
      id: 'categorizer-to-analyzer',
      source: 'task-categorizer', 
      target: 'call-analyzer',
      type: 'default'
    },
    {
      id: 'analyzer-to-metrics',
      source: 'call-analyzer',
      target: 'metrics-calculator',
      type: 'default'
    },
    {
      id: 'metrics-to-coach',
      source: 'metrics-calculator',
      target: 'sales-coach',
      type: 'default'
    },
    {
      id: 'coach-to-doc',
      source: 'sales-coach',
      target: 'doc-creator',
      type: 'default'
    },
    {
      id: 'doc-to-database',
      source: 'doc-creator',
      target: 'database-saver',
      type: 'default'
    },
    {
      id: 'database-to-tasks',
      source: 'database-saver',
      target: 'task-creator',
      type: 'default'
    }
  ] as Edge[],
  
  variables: {
    openaiApiKey: '',
    googleServiceAccount: '',
    supabaseUrl: typeof window !== 'undefined' && (import.meta?.env?.VITE_SUPABASE_URL || import.meta?.env?.SUPABASE_URL) || '',
    supabaseKey: typeof window !== 'undefined' && (import.meta?.env?.VITE_SUPABASE_ANON_KEY || import.meta?.env?.SUPABASE_ANON_KEY) || ''
  },
  
  requiredIntegrations: ['fathom', 'openai', 'google-docs', 'supabase'],
  estimatedExecutionTime: '3-8 seconds',
  version: '1.0.0'
};

// Export function to get a fresh copy of the template
export function getSalesAnalysisWorkflow() {
  return JSON.parse(JSON.stringify(salesAnalysisWorkflow));
}

// Validation function
export function validateSalesAnalysisWorkflow(workflow: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required nodes
  const requiredNodeTypes = [
    'fathomWebhook',
    'actionItemProcessor', 
    'aiAgent',
    'googleDocsCreator',
    'meetingUpsert',
    'taskCreator'
  ];

  requiredNodeTypes.forEach(nodeType => {
    const hasNode = workflow.nodes?.some((n: any) => n.type === nodeType);
    if (!hasNode) {
      errors.push(`Missing required node type: ${nodeType}`);
    }
  });

  // Check AI agent configurations
  const aiAgents = workflow.nodes?.filter((n: any) => n.type === 'aiAgent') || [];
  if (aiAgents.length < 3) {
    errors.push('Workflow requires at least 3 AI agent nodes for complete analysis');
  }

  // Check linear flow (each node should have max 1 incoming and 1 outgoing edge)
  const nodeConnections = new Map();
  workflow.edges?.forEach((edge: any) => {
    nodeConnections.set(edge.source, (nodeConnections.get(edge.source) || 0) + 1);
  });

  return {
    valid: errors.length === 0,
    errors
  };
}