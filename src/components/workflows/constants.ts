export const WORKFLOW_TRIGGERS = [
  { type: 'form_submission', label: 'Form Submission', iconName: 'FileText', description: 'When form submitted', nodeType: 'form' },
  { type: 'stage_changed', label: 'Stage Changed', iconName: 'Target', description: 'When deal moves stages' },
  { type: 'activity_created', label: 'Activity Created', iconName: 'Activity', description: 'When activity logged' },
  { type: 'deal_created', label: 'Deal Created', iconName: 'Database', description: 'When new deal added' },
  { type: 'webhook_received', label: 'Webhook Received', iconName: 'Zap', description: 'External webhook trigger' },
  { type: 'task_overdue', label: 'Task Overdue', iconName: 'AlertTriangle', description: 'Task past due date' },
  { type: 'activity_monitor', label: 'Activity Monitor', iconName: 'Activity', description: 'Monitor activity levels' },
  { type: 'scheduled', label: 'Scheduled', iconName: 'Clock', description: 'Time-based trigger' },
  { type: 'time_based', label: 'Time Based', iconName: 'Clock', description: 'After time period' }
];

export const WORKFLOW_CONDITIONS = [
  { type: 'if_value', label: 'If Value', condition: 'Check field value' },
  { type: 'if_stage', label: 'If Stage', condition: 'Check deal stage' },
  { type: 'if_custom_field', label: 'Custom Field Value', condition: 'Check custom fields' },
  { type: 'time_since_contact', label: 'Time Since Contact', condition: 'Days since last interaction' },
  { type: 'if_time', label: 'If Time', condition: 'Time-based condition' },
  { type: 'if_user', label: 'If User', condition: 'User-based check' },
  { type: 'stage_router', label: 'Stage Router', condition: 'Route by stage', nodeType: 'router' },
  { type: 'edit_fields', label: 'Edit Fields', condition: 'Transform variables', iconName: 'Edit', nodeType: 'action' },
  { type: 'multi_action', label: 'Multiple Actions', condition: 'Split workflow into multiple branches', iconName: 'Zap', nodeType: 'action' }
];

export const WORKFLOW_AI_NODES = [
  { type: 'ai_agent', label: 'AI Agent', description: 'Process with AI model', iconName: 'Sparkles', nodeType: 'aiAgent' },
  { type: 'custom_gpt', label: 'Custom GPT', description: 'Use OpenAI Assistant', iconName: 'Bot', nodeType: 'customGPT' },
  { type: 'assistant_manager', label: 'Assistant Manager', description: 'Create/Update Assistant', iconName: 'Settings', nodeType: 'assistantManager' },
  { type: 'prospect_research', label: 'Prospect Research', description: 'AI-powered prospect research', iconName: 'Search', nodeType: 'prospectResearch' },
  { type: 'image_input', label: 'Image Input', description: 'Input image source', iconName: 'Image', nodeType: 'imageInput' },
  { type: 'freepik_image_gen', label: 'Image Generator', description: 'AI Image Creation (Multiple Models)', iconName: 'Sparkles', nodeType: 'freepikImageGen' },
  { type: 'nanobanana_image_gen', label: 'Nano Banana Pro', description: 'Gemini 3 Pro Image Generation', iconName: 'Sparkles', nodeType: 'nanobananaImageGen' },
  { type: 'freepik_upscale', label: 'Upscaler', description: 'Image Upscaling (Magnific)', iconName: 'Maximize', nodeType: 'freepikUpscale' },
  { type: 'freepik_video_gen', label: 'Video Generator', description: 'AI Video Creation (Multiple Models)', iconName: 'Video', nodeType: 'freepikVideoGen' },
  { type: 'veo3_video_gen', label: 'Veo 3', description: 'Google Veo 3 Text-to-Video', iconName: 'Video', nodeType: 'veo3VideoGen' },
  { type: 'freepik_lip_sync', label: 'Lip Sync', description: 'Sync audio to video', iconName: 'MessageSquare', nodeType: 'freepikLipSync' },
  { type: 'freepik_music', label: 'Music Generator', description: 'AI Music Creation', iconName: 'Music', nodeType: 'freepikMusic' },
  { type: 'ai_ark_search', label: 'AI Ark Search', description: 'Find companies, people, or lookalike accounts', iconName: 'Search', nodeType: 'aiArkSearch' }
];

// Deprecated: Merged into WORKFLOW_AI_NODES
export const WORKFLOW_MEDIA_NODES = [];

export const WORKFLOW_ACTIONS = [
  { type: 'create_task', label: 'Create Task', iconName: 'CheckSquare', description: 'Generate task' },
  { type: 'create_recurring_task', label: 'Recurring Task', iconName: 'CheckSquare', description: 'Scheduled tasks' },
  { type: 'send_webhook', label: 'Send Webhook', iconName: 'Zap', description: 'Call external API' },
  { type: 'send_notification', label: 'Send Notification', iconName: 'Bell', description: 'Send alert' },
  { type: 'multi_channel_notify', label: 'Send Notifications', iconName: 'Bell', description: 'Multi-channel notifications' },
  { type: 'send_slack', label: 'Send to Slack', iconName: 'Slack', description: 'Post to Slack channel' },
  { type: 'send_email', label: 'Send Email', iconName: 'Mail', description: 'Email notification' },
  { type: 'add_note', label: 'Add Note/Comment', iconName: 'FileText', description: 'Add activity note' },
  { type: 'update_fields', label: 'Update Fields', iconName: 'TrendingUp', description: 'Update one or more fields' },
  { type: 'assign_owner', label: 'Assign Owner', iconName: 'Users', description: 'Change owner' },
  { type: 'create_activity', label: 'Create Activity', iconName: 'Calendar', description: 'Log activity' },
  { type: 'create_contact', label: 'Create Contact', iconName: 'Users', description: 'Create new contact' },
  { type: 'create_deal', label: 'Create Deal', iconName: 'Database', description: 'Create new deal' },
  { type: 'create_or_update_deal', label: 'Create/Update Deal', iconName: 'TrendingUp', description: 'Auto-create/update deal from meeting insights' },
  { type: 'create_company', label: 'Create Company', iconName: 'Briefcase', description: 'Create new company' },
  { type: 'meeting', label: 'Meeting', iconName: 'Calendar', description: 'Create/update meetings and add details' }
];
