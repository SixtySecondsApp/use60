export interface StandardRuleDef {
  template_key: string;
  name: string;
  target_table: string; // 'standard_leads' | 'standard_meetings' | 'standard_all_contacts' | 'standard_all_companies'
  trigger_type: 'cell_updated' | 'enrichment_complete' | 'row_created';
  condition: Record<string, any>;
  action_type: 'update_cell' | 'run_enrichment' | 'push_to_hubspot' | 'add_tag' | 'notify';
  action_config: Record<string, any>;
  is_default: true;
}

// LEADS RULES (3)
const LEADS_ESCALATE: StandardRuleDef = {
  template_key: 'leads_escalate_high_engagement',
  name: 'Escalate High-Engagement Leads',
  target_table: 'standard_leads',
  trigger_type: 'cell_updated',
  condition: { column_key: 'engagement_level', operator: 'in', value: ['hot', 'engaged'] },
  action_type: 'notify',
  action_config: { channel: 'slack', message: 'High-engagement lead: {{first_name}} {{last_name}} at {{company}} is now {{engagement_level}}' },
  is_default: true,
};

const LEADS_ENRICH_TITLES: StandardRuleDef = {
  template_key: 'leads_enrich_missing_titles',
  name: 'Enrich Missing Titles',
  target_table: 'standard_leads',
  trigger_type: 'row_created',
  condition: { column_key: 'title', operator: 'is_empty' },
  action_type: 'run_enrichment',
  action_config: { enrichment_type: 'apollo', target_column: 'title', source_column: 'linkedin_url' },
  is_default: true,
};

const LEADS_FLAG_DUPLICATES: StandardRuleDef = {
  template_key: 'leads_flag_duplicates',
  name: 'Flag Duplicate Leads',
  target_table: 'standard_leads',
  trigger_type: 'row_created',
  condition: { column_key: 'email', operator: 'is_not_empty' },
  action_type: 'add_tag',
  action_config: { check_column: 'email', tag_on_duplicate: 'duplicate', dedupe_action: 'flag' },
  is_default: true,
};

// MEETINGS RULES (2)
const MEETINGS_CRM_SYNC: StandardRuleDef = {
  template_key: 'meetings_post_crm_sync',
  name: 'Post-Meeting CRM Sync',
  target_table: 'standard_meetings',
  trigger_type: 'cell_updated',
  condition: { column_key: 'summary', operator: 'is_not_empty' },
  action_type: 'push_to_hubspot',
  action_config: { object_type: 'engagement', fields: ['summary', 'next_actions', 'sentiment'] },
  is_default: true,
};

const MEETINGS_NEGATIVE_ALERT: StandardRuleDef = {
  template_key: 'meetings_negative_sentiment_alert',
  name: 'Alert on Negative Sentiment',
  target_table: 'standard_meetings',
  trigger_type: 'cell_updated',
  condition: { column_key: 'sentiment', operator: 'equals', value: 'negative' },
  action_type: 'notify',
  action_config: { channel: 'slack', message: 'Negative sentiment detected in meeting: {{title}} with {{primary_contact}}', urgency: 'high' },
  is_default: true,
};

// ALL CONTACTS RULES (2)
const CONTACTS_BIDI_SYNC: StandardRuleDef = {
  template_key: 'contacts_bidirectional_sync',
  name: 'Bidirectional Contact Sync',
  target_table: 'standard_all_contacts',
  trigger_type: 'cell_updated',
  condition: { column_key: 'crm_id', operator: 'is_not_empty' },
  action_type: 'push_to_hubspot',
  action_config: { object_type: 'contact', sync_direction: 'bidirectional', fields: ['email', 'first_name', 'last_name', 'title', 'phone'] },
  is_default: true,
};

const CONTACTS_DEAD_CLEANUP: StandardRuleDef = {
  template_key: 'contacts_dead_lead_cleanup',
  name: 'Dead Lead Cleanup (90 days)',
  target_table: 'standard_all_contacts',
  trigger_type: 'cell_updated',
  condition: { column_key: 'last_engagement', operator: 'older_than_days', value: 90 },
  action_type: 'add_tag',
  action_config: { tag: 'inactive_90d', notify_owner: true, message: 'Contact {{first_name}} {{last_name}} has been inactive for 90+ days' },
  is_default: true,
};

// ALL COMPANIES RULES (2)
const COMPANIES_ENRICH: StandardRuleDef = {
  template_key: 'companies_enrich_data',
  name: 'Enrich Company Data',
  target_table: 'standard_all_companies',
  trigger_type: 'row_created',
  condition: { operator: 'or', conditions: [{ column_key: 'industry', operator: 'is_empty' }, { column_key: 'revenue', operator: 'is_empty' }] },
  action_type: 'run_enrichment',
  action_config: { enrichment_type: 'apollo', target_columns: ['industry', 'revenue', 'description'], source_column: 'domain' },
  is_default: true,
};

const COMPANIES_EXPANSION: StandardRuleDef = {
  template_key: 'companies_expansion_signals',
  name: 'Account Expansion Signals',
  target_table: 'standard_all_companies',
  trigger_type: 'cell_updated',
  condition: { column_key: 'active_contacts_count', operator: 'greater_than_or_equal', value: 5 },
  action_type: 'notify',
  action_config: { channel: 'slack', message: 'Expansion opportunity at {{name}}: {{active_contacts_count}} active contacts', tag: 'expansion_opportunity' },
  is_default: true,
};

// DEALS RULES (2)
const DEALS_RISK_LEVEL_ALERT: StandardRuleDef = {
  template_key: 'deals_risk_level_alert',
  name: 'Alert on High/Critical Risk',
  target_table: 'standard_deals',
  trigger_type: 'cell_updated',
  condition: { column_key: 'risk_level', operator: 'in', value: ['high', 'critical'] },
  action_type: 'notify',
  action_config: { channel: 'slack', message: 'Deal at risk: {{deal_name}} ({{company_name}}) — risk level is {{risk_level}}', urgency: 'high' },
  is_default: true,
};

const DEALS_STALLED_STAGE_ALERT: StandardRuleDef = {
  template_key: 'deals_stalled_stage_alert',
  name: 'Alert on Stalled Deals (14+ days)',
  target_table: 'standard_deals',
  trigger_type: 'cell_updated',
  condition: { column_key: 'days_in_stage', operator: 'greater_than_or_equal', value: 14 },
  action_type: 'notify',
  action_config: { channel: 'slack', message: 'Stalled deal: {{deal_name}} has been in {{stage}} for {{days_in_stage}} days', urgency: 'medium' },
  is_default: true,
};

// WAITLIST RULES (2)
const WAITLIST_CONVERSION_ALERT: StandardRuleDef = {
  template_key: 'waitlist_conversion_alert',
  name: 'Alert on Waitlist Conversion',
  target_table: 'standard_waitlist',
  trigger_type: 'cell_updated',
  condition: { column_key: 'status', operator: 'equals', value: 'converted' },
  action_type: 'notify',
  action_config: { channel: 'slack', message: 'Waitlist conversion: {{full_name}} ({{company_name}}) has converted!' },
  is_default: true,
};

const WAITLIST_TOP_REFERRER_ALERT: StandardRuleDef = {
  template_key: 'waitlist_top_referrer_alert',
  name: 'Tag Top Referrers (5+ referrals)',
  target_table: 'standard_waitlist',
  trigger_type: 'cell_updated',
  condition: { column_key: 'referral_count', operator: 'greater_than_or_equal', value: 5 },
  action_type: 'add_tag',
  action_config: { tag: 'top_referrer', notify_owner: true, message: '{{full_name}} has referred {{referral_count}} signups — top referrer!' },
  is_default: true,
};

export const STANDARD_TABLE_AUTOMATIONS: StandardRuleDef[] = [
  LEADS_ESCALATE, LEADS_ENRICH_TITLES, LEADS_FLAG_DUPLICATES,
  MEETINGS_CRM_SYNC, MEETINGS_NEGATIVE_ALERT,
  CONTACTS_BIDI_SYNC, CONTACTS_DEAD_CLEANUP,
  COMPANIES_ENRICH, COMPANIES_EXPANSION,
  DEALS_RISK_LEVEL_ALERT, DEALS_STALLED_STAGE_ALERT,
  WAITLIST_CONVERSION_ALERT, WAITLIST_TOP_REFERRER_ALERT,
];

export function getAutomationsForTable(tableKey: string): StandardRuleDef[] {
  return STANDARD_TABLE_AUTOMATIONS.filter(a => a.target_table === tableKey);
}
