/**
 * Standard Ops Table Templates
 *
 * Defines the 4 core standard ops tables with their columns, views, and CRM mappings.
 * These templates are instantiated when users create standard tables in their workspace.
 */

export interface StandardColumnDef {
  key: string;
  label: string;
  column_type: string; // Must be valid: text, email, url, number, boolean, enrichment, status, person, company, linkedin, date, dropdown, tags, phone, checkbox, formula
  is_system: true; // All core columns are system columns
  is_locked: true; // All core columns are locked
  position: number;
  width?: number;
  is_visible?: boolean;
  // CRM property mappings
  hubspot_property_name?: string;
  attio_property_name?: string;
  // App data source mapping
  app_source_table?: string;
  app_source_column?: string;
  // For dropdown/status columns
  dropdown_options?: Array<{ value: string; label: string; color?: string }>;
}

export interface StandardViewDef {
  name: string;
  is_default: boolean;
  filter_config?: any[];
  sort_config?: any;
  column_config?: string[]; // column keys in display order
}

export interface StandardTableTemplate {
  key: string; // e.g., 'standard_leads'
  name: string; // e.g., 'Leads'
  description: string;
  source_type: 'standard';
  columns: StandardColumnDef[];
  views: StandardViewDef[];
}

// ============================================================================
// 1. LEADS TABLE
// ============================================================================

export const LEADS_TABLE: StandardTableTemplate = {
  key: 'standard_leads',
  name: 'Leads',
  description: 'Booking-sourced leads from scheduling links, with meeting context and status tracking',
  source_type: 'standard',
  columns: [
    {
      key: 'contact_name',
      label: 'Contact Name',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 0,
      width: 200,
      is_visible: true,
      app_source_table: 'leads',
      app_source_column: 'contact_name'
    },
    {
      key: 'contact_email',
      label: 'Email',
      column_type: 'email',
      is_system: true,
      is_locked: true,
      position: 1,
      width: 220,
      is_visible: true,
      app_source_table: 'leads',
      app_source_column: 'contact_email'
    },
    {
      key: 'domain',
      label: 'Domain',
      column_type: 'url',
      is_system: true,
      is_locked: true,
      position: 2,
      width: 180,
      is_visible: true,
      app_source_table: 'leads',
      app_source_column: 'domain'
    },
    {
      key: 'meeting_title',
      label: 'Meeting',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 3,
      width: 220,
      is_visible: true,
      app_source_table: 'leads',
      app_source_column: 'meeting_title'
    },
    {
      key: 'meeting_start',
      label: 'Meeting Date',
      column_type: 'date',
      is_system: true,
      is_locked: true,
      position: 4,
      width: 160,
      is_visible: true,
      app_source_table: 'leads',
      app_source_column: 'meeting_start'
    },
    {
      key: 'source',
      label: 'Source',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 5,
      width: 140,
      is_visible: true,
      app_source_table: 'leads',
      app_source_column: 'booking_link_name'
    },
    {
      key: 'status',
      label: 'Status',
      column_type: 'status',
      is_system: true,
      is_locked: true,
      position: 6,
      width: 140,
      is_visible: true,
      app_source_table: 'leads',
      app_source_column: 'status',
      dropdown_options: [
        { value: 'new', label: 'New', color: 'blue' },
        { value: 'prepping', label: 'Prepping', color: 'yellow' },
        { value: 'ready', label: 'Ready', color: 'green' },
        { value: 'converted', label: 'Converted', color: 'purple' },
        { value: 'archived', label: 'Archived', color: 'gray' },
        { value: 'cancelled', label: 'Cancelled', color: 'red' }
      ]
    },
    {
      key: 'priority',
      label: 'Priority',
      column_type: 'status',
      is_system: true,
      is_locked: true,
      position: 7,
      width: 120,
      is_visible: true,
      app_source_table: 'leads',
      app_source_column: 'priority',
      dropdown_options: [
        { value: 'low', label: 'Low', color: 'gray' },
        { value: 'normal', label: 'Normal', color: 'blue' },
        { value: 'high', label: 'High', color: 'orange' },
        { value: 'urgent', label: 'Urgent', color: 'red' }
      ]
    },
    {
      key: 'owner',
      label: 'Owner',
      column_type: 'person',
      is_system: true,
      is_locked: true,
      position: 8,
      width: 160,
      is_visible: true,
      app_source_table: 'leads',
      app_source_column: 'owner_id'
    },
    {
      key: 'meeting_held',
      label: 'Meeting Held',
      column_type: 'status',
      is_system: true,
      is_locked: true,
      position: 9,
      width: 140,
      is_visible: true,
      app_source_table: 'meetings',
      app_source_column: 'transcript_text',
      dropdown_options: [
        { value: 'Met', label: 'Met', color: 'green' },
        { value: 'No Show', label: 'No Show', color: 'red' },
        { value: 'Upcoming', label: 'Upcoming', color: 'blue' },
        { value: 'Cancelled', label: 'Cancelled', color: 'gray' }
      ]
    },
    {
      key: 'meeting_recording_url',
      label: 'Recording',
      column_type: 'url',
      is_system: true,
      is_locked: true,
      position: 10,
      width: 120,
      is_visible: true,
      app_source_table: 'meetings',
      app_source_column: 'share_url'
    },
    {
      key: 'meeting_outcome',
      label: 'Meeting Outcome',
      column_type: 'status',
      is_system: true,
      is_locked: true,
      position: 11,
      width: 160,
      is_visible: true,
      app_source_table: 'leads',
      app_source_column: 'meeting_outcome',
      dropdown_options: [
        { value: 'scheduled', label: 'Scheduled', color: 'blue' },
        { value: 'completed', label: 'Completed', color: 'green' },
        { value: 'no_show', label: 'No Show', color: 'red' },
        { value: 'rescheduled', label: 'Rescheduled', color: 'yellow' },
        { value: 'cancelled', label: 'Cancelled', color: 'gray' }
      ]
    },
    {
      key: 'created_at',
      label: 'Created',
      column_type: 'date',
      is_system: true,
      is_locked: true,
      position: 12,
      width: 160,
      is_visible: true,
      app_source_table: 'leads',
      app_source_column: 'created_at'
    }
  ],
  views: [
    {
      name: 'All Leads',
      is_default: true,
      column_config: ['contact_name', 'contact_email', 'domain', 'meeting_title', 'meeting_start', 'meeting_held', 'meeting_recording_url', 'source', 'status', 'priority', 'owner', 'created_at'],
      sort_config: { column: 'created_at', direction: 'desc' }
    },
    {
      name: 'Upcoming Meetings',
      is_default: false,
      column_config: ['contact_name', 'contact_email', 'domain', 'meeting_title', 'meeting_start', 'meeting_held', 'status', 'priority'],
      filter_config: [
        { column: 'status', operator: 'in', value: ['new', 'prepping', 'ready'] }
      ],
      sort_config: { column: 'meeting_start', direction: 'asc' }
    },
    {
      name: 'No Shows & Reschedules',
      is_default: false,
      column_config: ['contact_name', 'contact_email', 'meeting_title', 'meeting_start', 'meeting_held', 'meeting_recording_url', 'status', 'owner'],
      filter_config: [
        { column: 'meeting_held', operator: 'in', value: ['No Show', 'Cancelled'] }
      ],
      sort_config: { column: 'meeting_start', direction: 'desc' }
    },
    {
      name: 'High Priority',
      is_default: false,
      column_config: ['contact_name', 'contact_email', 'meeting_title', 'meeting_start', 'status', 'meeting_outcome', 'priority'],
      filter_config: [
        { column: 'priority', operator: 'in', value: ['high', 'urgent'] }
      ],
      sort_config: { column: 'created_at', direction: 'desc' }
    }
  ]
};

// ============================================================================
// 2. MEETINGS TABLE
// ============================================================================

export const MEETINGS_TABLE: StandardTableTemplate = {
  key: 'standard_meetings',
  name: 'Meetings',
  description: 'Unified meeting history with recording metadata and next actions',
  source_type: 'standard',
  columns: [
    {
      key: 'title',
      label: 'Title',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 0,
      width: 250,
      is_visible: true,
      app_source_table: 'meetings',
      app_source_column: 'title'
    },
    {
      key: 'meeting_date',
      label: 'Meeting Date',
      column_type: 'date',
      is_system: true,
      is_locked: true,
      position: 1,
      width: 160,
      is_visible: true,
      app_source_table: 'meetings',
      app_source_column: 'start_time'
    },
    {
      key: 'duration_minutes',
      label: 'Duration (min)',
      column_type: 'number',
      is_system: true,
      is_locked: true,
      position: 2,
      width: 140,
      is_visible: true,
      app_source_table: 'meetings',
      app_source_column: 'duration_minutes'
    },
    {
      key: 'contact_name',
      label: 'Contact',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 3,
      width: 200,
      is_visible: true,
      app_source_table: 'meeting_attendees',
      app_source_column: 'name'
    },
    {
      key: 'contact_email',
      label: 'Email',
      column_type: 'email',
      is_system: true,
      is_locked: true,
      position: 4,
      width: 220,
      is_visible: true,
      app_source_table: 'meeting_attendees',
      app_source_column: 'email'
    },
    {
      key: 'contact_company',
      label: 'Company',
      column_type: 'company',
      is_system: true,
      is_locked: true,
      position: 5,
      width: 180,
      is_visible: true,
      app_source_table: 'meetings',
      app_source_column: 'company_id'
    },
    {
      key: 'sentiment',
      label: 'Sentiment',
      column_type: 'status',
      is_system: true,
      is_locked: true,
      position: 6,
      width: 140,
      is_visible: true,
      app_source_table: 'meetings',
      app_source_column: 'sentiment_score',
      dropdown_options: [
        { value: 'Negative', label: 'Negative', color: 'red' },
        { value: 'Neutral', label: 'Neutral', color: 'gray' },
        { value: 'Positive', label: 'Positive', color: 'green' },
        { value: 'Very Positive', label: 'Very Positive', color: 'blue' }
      ]
    },
    {
      key: 'summary',
      label: 'Summary',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 7,
      width: 300,
      is_visible: true,
      app_source_table: 'meetings',
      app_source_column: 'summary'
    },
    {
      key: 'next_actions',
      label: 'Next Actions',
      column_type: 'tags',
      is_system: true,
      is_locked: true,
      position: 8,
      width: 200,
      is_visible: true
    },
    {
      key: 'owner',
      label: 'Owner',
      column_type: 'person',
      is_system: true,
      is_locked: true,
      position: 9,
      width: 160,
      is_visible: true,
      app_source_table: 'meetings',
      app_source_column: 'owner_user_id'
    },
    {
      key: 'recording_url',
      label: 'Recording',
      column_type: 'url',
      is_system: true,
      is_locked: true,
      position: 10,
      width: 120,
      is_visible: true,
      app_source_table: 'meetings',
      app_source_column: 'share_url'
    },
    {
      key: 'transcript',
      label: 'Transcript',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 11,
      width: 300,
      is_visible: true,
      app_source_table: 'meetings',
      app_source_column: 'transcript_text'
    },
    {
      key: 'lead_source',
      label: 'Source',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 12,
      width: 160,
      is_visible: true,
      app_source_table: 'leads',
      app_source_column: 'booking_link_name'
    }
  ],
  views: [
    {
      name: 'All Meetings',
      is_default: true,
      column_config: ['title', 'meeting_date', 'duration_minutes', 'contact_name', 'contact_email', 'contact_company', 'sentiment', 'owner', 'recording_url', 'lead_source'],
      sort_config: { column: 'meeting_date', direction: 'desc' }
    },
    {
      name: 'This Week',
      is_default: false,
      column_config: ['title', 'meeting_date', 'contact_name', 'contact_email', 'sentiment', 'next_actions'],
      filter_config: [
        { column: 'meeting_date', operator: 'within_last_days', value: 7 }
      ],
      sort_config: { column: 'meeting_date', direction: 'desc' }
    },
    {
      name: 'Needs Follow-up',
      is_default: false,
      column_config: ['title', 'meeting_date', 'contact_name', 'contact_email', 'next_actions', 'owner'],
      filter_config: [
        { column: 'next_actions', operator: 'is_not_empty' }
      ],
      sort_config: { column: 'meeting_date', direction: 'desc' }
    }
  ]
};

// ============================================================================
// 3. ALL CONTACTS TABLE
// ============================================================================

export const CONTACTS_TABLE: StandardTableTemplate = {
  key: 'standard_all_contacts',
  name: 'All Contacts',
  description: 'Universal CRM contacts mirror with app contacts and aggregated signals',
  source_type: 'standard',
  columns: [
    {
      key: 'crm_id',
      label: 'CRM ID',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 0,
      width: 140,
      is_visible: true,
      hubspot_property_name: 'vid',
      attio_property_name: 'id'
    },
    {
      key: 'first_name',
      label: 'First Name',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 1,
      width: 160,
      is_visible: true,
      app_source_table: 'contacts',
      app_source_column: 'first_name',
      hubspot_property_name: 'firstname',
      attio_property_name: 'first_name'
    },
    {
      key: 'last_name',
      label: 'Last Name',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 2,
      width: 160,
      is_visible: true,
      app_source_table: 'contacts',
      app_source_column: 'last_name',
      hubspot_property_name: 'lastname',
      attio_property_name: 'last_name'
    },
    {
      key: 'email',
      label: 'Email',
      column_type: 'email',
      is_system: true,
      is_locked: true,
      position: 3,
      width: 220,
      is_visible: true,
      app_source_table: 'contacts',
      app_source_column: 'email',
      hubspot_property_name: 'email',
      attio_property_name: 'email_addresses'
    },
    {
      key: 'company_name',
      label: 'Company',
      column_type: 'company',
      is_system: true,
      is_locked: true,
      position: 4,
      width: 200,
      is_visible: true,
      app_source_table: 'companies',
      app_source_column: 'name',
      hubspot_property_name: 'company',
      attio_property_name: 'company_name'
    },
    {
      key: 'title',
      label: 'Title',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 5,
      width: 180,
      is_visible: true,
      app_source_table: 'contacts',
      app_source_column: 'title',
      hubspot_property_name: 'jobtitle',
      attio_property_name: 'job_title'
    },
    {
      key: 'phone',
      label: 'Phone',
      column_type: 'phone',
      is_system: true,
      is_locked: true,
      position: 6,
      width: 160,
      is_visible: true,
      app_source_table: 'contacts',
      app_source_column: 'phone',
      hubspot_property_name: 'phone',
      attio_property_name: 'phone_numbers'
    },
    {
      key: 'linkedin_url',
      label: 'LinkedIn',
      column_type: 'linkedin',
      is_system: true,
      is_locked: true,
      position: 7,
      width: 160,
      is_visible: true,
      app_source_table: 'contacts',
      app_source_column: 'linkedin_url',
      hubspot_property_name: 'hs_linkedinid',
      attio_property_name: 'linkedin'
    },
    {
      key: 'last_engagement',
      label: 'Last Engagement',
      column_type: 'date',
      is_system: true,
      is_locked: true,
      position: 8,
      width: 160,
      is_visible: true,
      hubspot_property_name: 'notes_last_updated'
    },
    {
      key: 'lifecycle_stage',
      label: 'Lifecycle Stage',
      column_type: 'status',
      is_system: true,
      is_locked: true,
      position: 9,
      width: 160,
      is_visible: true,
      hubspot_property_name: 'lifecyclestage',
      attio_property_name: 'status',
      dropdown_options: [
        { value: 'subscriber', label: 'Subscriber', color: 'gray' },
        { value: 'lead', label: 'Lead', color: 'blue' },
        { value: 'mql', label: 'MQL', color: 'yellow' },
        { value: 'sql', label: 'SQL', color: 'orange' },
        { value: 'opportunity', label: 'Opportunity', color: 'purple' },
        { value: 'customer', label: 'Customer', color: 'green' },
        { value: 'evangelist', label: 'Evangelist', color: 'teal' }
      ]
    },
    {
      key: 'recent_signals',
      label: 'Recent Signals',
      column_type: 'tags',
      is_system: true,
      is_locked: true,
      position: 10,
      width: 200,
      is_visible: true
    },
    {
      key: 'sync_status',
      label: 'Sync Status',
      column_type: 'status',
      is_system: true,
      is_locked: true,
      position: 11,
      width: 140,
      is_visible: true,
      dropdown_options: [
        { value: 'synced', label: 'Synced', color: 'green' },
        { value: 'pending', label: 'Pending', color: 'yellow' },
        { value: 'error', label: 'Error', color: 'red' },
        { value: 'not_connected', label: 'Not Connected', color: 'gray' }
      ]
    }
  ],
  views: [
    {
      name: 'All Contacts',
      is_default: true,
      column_config: ['first_name', 'last_name', 'email', 'company_name', 'title', 'lifecycle_stage', 'last_engagement', 'sync_status'],
      sort_config: { column: 'last_engagement', direction: 'desc' }
    },
    {
      name: 'Recently Active',
      is_default: false,
      column_config: ['first_name', 'last_name', 'email', 'company_name', 'last_engagement', 'recent_signals'],
      filter_config: [
        { column: 'last_engagement', operator: 'within_last_days', value: 30 }
      ],
      sort_config: { column: 'last_engagement', direction: 'desc' }
    },
    {
      name: 'Sync Issues',
      is_default: false,
      column_config: ['first_name', 'last_name', 'email', 'company_name', 'sync_status', 'crm_id'],
      filter_config: [
        { column: 'sync_status', operator: 'equals', value: 'error' }
      ],
      sort_config: { column: 'last_engagement', direction: 'desc' }
    }
  ]
};

// ============================================================================
// 4. ALL COMPANIES TABLE
// ============================================================================

export const COMPANIES_TABLE: StandardTableTemplate = {
  key: 'standard_all_companies',
  name: 'All Companies',
  description: 'Unified company data from app, CRM accounts, and enrichment',
  source_type: 'standard',
  columns: [
    {
      key: 'crm_id',
      label: 'CRM ID',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 0,
      width: 140,
      is_visible: true,
      hubspot_property_name: 'companyId',
      attio_property_name: 'id'
    },
    {
      key: 'name',
      label: 'Name',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 1,
      width: 220,
      is_visible: true,
      app_source_table: 'companies',
      app_source_column: 'name',
      hubspot_property_name: 'name',
      attio_property_name: 'name'
    },
    {
      key: 'domain',
      label: 'Domain',
      column_type: 'url',
      is_system: true,
      is_locked: true,
      position: 2,
      width: 200,
      is_visible: true,
      app_source_table: 'companies',
      app_source_column: 'domain',
      hubspot_property_name: 'domain',
      attio_property_name: 'domains'
    },
    {
      key: 'website',
      label: 'Website',
      column_type: 'url',
      is_system: true,
      is_locked: true,
      position: 3,
      width: 200,
      is_visible: true,
      app_source_table: 'companies',
      app_source_column: 'website',
      hubspot_property_name: 'website',
      attio_property_name: 'website'
    },
    {
      key: 'industry',
      label: 'Industry',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 4,
      width: 180,
      is_visible: true,
      app_source_table: 'companies',
      app_source_column: 'industry',
      hubspot_property_name: 'industry',
      attio_property_name: 'industry'
    },
    {
      key: 'company_size',
      label: 'Company Size',
      column_type: 'status',
      is_system: true,
      is_locked: true,
      position: 5,
      width: 160,
      is_visible: true,
      app_source_table: 'companies',
      app_source_column: 'size',
      hubspot_property_name: 'numberofemployees',
      attio_property_name: 'employee_count',
      dropdown_options: [
        { value: 'startup', label: 'Startup 1-10', color: 'gray' },
        { value: 'small', label: 'Small 11-50', color: 'blue' },
        { value: 'medium', label: 'Medium 51-200', color: 'yellow' },
        { value: 'large', label: 'Large 201-1000', color: 'orange' },
        { value: 'enterprise', label: 'Enterprise 1000+', color: 'purple' }
      ]
    },
    {
      key: 'phone',
      label: 'Phone',
      column_type: 'phone',
      is_system: true,
      is_locked: true,
      position: 6,
      width: 160,
      is_visible: true,
      app_source_table: 'companies',
      app_source_column: 'phone',
      hubspot_property_name: 'phone',
      attio_property_name: 'phone_numbers'
    },
    {
      key: 'linkedin_url',
      label: 'LinkedIn',
      column_type: 'linkedin',
      is_system: true,
      is_locked: true,
      position: 7,
      width: 160,
      is_visible: true,
      hubspot_property_name: 'linkedin_company_page',
      attio_property_name: 'linkedin'
    },
    {
      key: 'description',
      label: 'Description',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 8,
      width: 300,
      is_visible: true,
      app_source_table: 'companies',
      app_source_column: 'description',
      hubspot_property_name: 'description',
      attio_property_name: 'description'
    },
    {
      key: 'revenue',
      label: 'Revenue',
      column_type: 'number',
      is_system: true,
      is_locked: true,
      position: 9,
      width: 140,
      is_visible: true,
      hubspot_property_name: 'annualrevenue',
      attio_property_name: 'estimated_arr'
    },
    {
      key: 'active_contacts_count',
      label: 'Active Contacts',
      column_type: 'number',
      is_system: true,
      is_locked: true,
      position: 10,
      width: 140,
      is_visible: true
    },
    {
      key: 'last_contact_date',
      label: 'Last Contact',
      column_type: 'date',
      is_system: true,
      is_locked: true,
      position: 11,
      width: 160,
      is_visible: true,
      hubspot_property_name: 'notes_last_updated'
    }
  ],
  views: [
    {
      name: 'All Companies',
      is_default: true,
      column_config: ['name', 'domain', 'industry', 'company_size', 'active_contacts_count', 'last_contact_date'],
      sort_config: { column: 'name', direction: 'asc' }
    },
    {
      name: 'Key Accounts',
      is_default: false,
      column_config: ['name', 'domain', 'industry', 'active_contacts_count', 'revenue', 'last_contact_date'],
      filter_config: [
        { column: 'active_contacts_count', operator: 'greater_than_or_equal', value: 3 }
      ],
      sort_config: { column: 'active_contacts_count', direction: 'desc' }
    },
    {
      name: 'Needs Enrichment',
      is_default: false,
      column_config: ['name', 'domain', 'industry', 'revenue', 'company_size'],
      filter_config: [
        {
          operator: 'or',
          conditions: [
            { column: 'industry', operator: 'is_empty' },
            { column: 'revenue', operator: 'is_empty' }
          ]
        }
      ],
      sort_config: { column: 'name', direction: 'asc' }
    }
  ]
};

// ============================================================================
// 5. CLIENTS TABLE
// ============================================================================

export const CLIENTS_TABLE: StandardTableTemplate = {
  key: 'standard_clients',
  name: 'Clients',
  description: 'Active and past clients with subscription tracking, deal links, and lifecycle status',
  source_type: 'standard',
  columns: [
    {
      key: 'company_name',
      label: 'Company',
      column_type: 'company',
      is_system: true,
      is_locked: true,
      position: 0,
      width: 220,
      is_visible: true,
      app_source_table: 'clients',
      app_source_column: 'company_name'
    },
    {
      key: 'contact_name',
      label: 'Contact',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 1,
      width: 200,
      is_visible: true,
      app_source_table: 'clients',
      app_source_column: 'contact_name'
    },
    {
      key: 'contact_email',
      label: 'Email',
      column_type: 'email',
      is_system: true,
      is_locked: true,
      position: 2,
      width: 220,
      is_visible: true,
      app_source_table: 'clients',
      app_source_column: 'contact_email'
    },
    {
      key: 'deal_name',
      label: 'Deal',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 3,
      width: 200,
      is_visible: true,
      app_source_table: 'deals',
      app_source_column: 'name'
    },
    {
      key: 'deal_value',
      label: 'MRR',
      column_type: 'number',
      is_system: true,
      is_locked: true,
      position: 4,
      width: 140,
      is_visible: true,
      app_source_table: 'clients',
      app_source_column: 'subscription_amount'
    },
    {
      key: 'status',
      label: 'Status',
      column_type: 'status',
      is_system: true,
      is_locked: true,
      position: 5,
      width: 140,
      is_visible: true,
      app_source_table: 'clients',
      app_source_column: 'status',
      dropdown_options: [
        { value: 'active', label: 'Active', color: 'green' },
        { value: 'signed', label: 'Signed', color: 'blue' },
        { value: 'deposit_paid', label: 'Deposit Paid', color: 'purple' },
        { value: 'paused', label: 'Paused', color: 'yellow' },
        { value: 'notice_given', label: 'Notice Given', color: 'orange' },
        { value: 'churned', label: 'Churned', color: 'red' }
      ]
    },
    {
      key: 'subscription_start',
      label: 'Start Date',
      column_type: 'date',
      is_system: true,
      is_locked: true,
      position: 6,
      width: 160,
      is_visible: true,
      app_source_table: 'clients',
      app_source_column: 'subscription_start_date'
    },
    {
      key: 'owner',
      label: 'Owner',
      column_type: 'person',
      is_system: true,
      is_locked: true,
      position: 7,
      width: 160,
      is_visible: true,
      app_source_table: 'clients',
      app_source_column: 'owner_id'
    },
    {
      key: 'lead_source',
      label: 'Source',
      column_type: 'text',
      is_system: true,
      is_locked: true,
      position: 8,
      width: 160,
      is_visible: true,
      app_source_table: 'deals',
      app_source_column: 'lead_source_channel'
    },
    {
      key: 'created_at',
      label: 'Created',
      column_type: 'date',
      is_system: true,
      is_locked: true,
      position: 9,
      width: 160,
      is_visible: true,
      app_source_table: 'clients',
      app_source_column: 'created_at'
    }
  ],
  views: [
    {
      name: 'All Clients',
      is_default: true,
      column_config: ['company_name', 'contact_name', 'contact_email', 'deal_name', 'deal_value', 'status', 'subscription_start', 'owner', 'created_at'],
      sort_config: { column: 'created_at', direction: 'desc' }
    },
    {
      name: 'Active Clients',
      is_default: false,
      column_config: ['company_name', 'contact_name', 'deal_name', 'deal_value', 'status', 'subscription_start', 'owner'],
      filter_config: [
        { column: 'status', operator: 'in', value: ['active'] }
      ],
      sort_config: { column: 'subscription_start', direction: 'desc' }
    },
    {
      name: 'At Risk',
      is_default: false,
      column_config: ['company_name', 'contact_name', 'deal_name', 'deal_value', 'status', 'lead_source', 'owner'],
      filter_config: [
        { column: 'status', operator: 'in', value: ['notice_given', 'churned'] }
      ],
      sort_config: { column: 'created_at', direction: 'desc' }
    }
  ]
};

// ============================================================================
// EXPORTS
// ============================================================================

export const STANDARD_TABLE_TEMPLATES: StandardTableTemplate[] = [
  LEADS_TABLE,
  MEETINGS_TABLE,
  CONTACTS_TABLE,
  COMPANIES_TABLE,
  CLIENTS_TABLE
];

export function getStandardTableByKey(key: string): StandardTableTemplate | undefined {
  return STANDARD_TABLE_TEMPLATES.find(t => t.key === key);
}
