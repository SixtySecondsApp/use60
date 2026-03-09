import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useUser } from '@/lib/hooks/useUser';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import logger from '@/lib/utils/logger';
import type { Contact, Company, Deal, Activity, Task } from '@/lib/database/models';

/**
 * Normalized timeline item that represents any record type
 * in a unified timeline view for contacts and companies
 */
export interface TimelineItem {
  id: string;
  recordType: 'activity' | 'meeting' | 'lead' | 'deal' | 'task' | 'communication';
  timestamp: string; // ISO date string for sorting
  title: string;
  description?: string;
  badgeLabel?: string; // For shared rows (e.g., "Contact & Company")
  stageLabel?: string; // Pipeline stage for deals
  pipelineStage?: 'SQL' | 'Opportunity' | 'Verbal' | 'Signed'; // Highlighted stage
  metadata: {
    // Activity-specific
    activityType?: 'sale' | 'outbound' | 'meeting' | 'proposal';
    activityStatus?: string;
    amount?: number;
    // Meeting-specific
    meetingStart?: string;
    meetingEnd?: string;
    meetingDuration?: number;
    // Lead-specific
    leadStatus?: string;
    leadPriority?: string;
    // Deal-specific
    dealValue?: number;
    dealProbability?: number;
    dealStageId?: string;
    // Task-specific
    taskPriority?: string;
    taskStatus?: string;
    dueDate?: string;
    // Communication-specific
    communicationDirection?: 'inbound' | 'outbound';
    communicationEventType?: string;
    communicationSubject?: string;
    communicationSentiment?: string;
    wasOpened?: boolean;
    wasReplied?: boolean;
  };
  // Relationship IDs for navigation
  contactId?: string;
  companyId?: string;
  dealId?: string;
  meetingId?: string;
  leadId?: string;
  taskId?: string;
  // Original record for detailed views
  originalRecord: any;
}

/**
 * Graph data structure containing all related records
 */
export interface ContactCompanyGraph {
  contact?: Contact;
  company?: Company;
  activities: Activity[];
  meetings: any[]; // Meeting records from meetings table
  leads: any[]; // Lead records from leads table
  deals: Deal[];
  tasks: Task[];
  communications: any[]; // Communication events (emails, calls)
  // Computed insights
  insights: {
    daysSinceLastTouch?: number;
    pipelineCoverage?: {
      sql: number;
      opportunity: number;
      verbal: number;
      signed: number;
    };
    totalDealValue?: number;
    activeDealsCount?: number;
    lastActivityDate?: string;
  };
}

/**
 * Activity classifier that tags timeline items based on metadata
 */
export function classifyActivity(activity: Activity): string[] {
  const tags: string[] = [];
  
  if (activity.type === 'sale' && activity.amount && activity.amount > 0) {
    tags.push('revenue-generating');
  }
  
  if (activity.type === 'proposal') {
    tags.push('proposal-sent');
  }
  
  if (activity.status === 'completed') {
    tags.push('completed');
  }
  
  if (activity.priority === 'high') {
    tags.push('high-priority');
  }
  
  // Check if activity is linked to a deal
  if (activity.deal_id) {
    tags.push('deal-linked');
  }
  
  return tags;
}

/**
 * Normalize a deal into a timeline item
 */
function normalizeDealToTimeline(deal: Deal, stageName?: string): TimelineItem {
  // Map stage name to pipeline stage
  let pipelineStage: TimelineItem['pipelineStage'] = undefined;
  if (stageName) {
    const stageLower = stageName.toLowerCase();
    if (stageLower.includes('sql') || stageLower.includes('qualified')) {
      pipelineStage = 'SQL';
    } else if (stageLower.includes('opportunity') || stageLower.includes('proposal')) {
      pipelineStage = 'Opportunity';
    } else if (stageLower.includes('verbal') || stageLower.includes('negotiation')) {
      pipelineStage = 'Verbal';
    } else if (stageLower.includes('signed') || stageLower.includes('won') || stageLower.includes('closed')) {
      pipelineStage = 'Signed';
    }
  }
  
  return {
    id: deal.id,
    recordType: 'deal',
    timestamp: deal.created_at,
    title: deal.name,
    description: deal.description || deal.notes,
    stageLabel: stageName || 'Unknown Stage',
    pipelineStage,
    metadata: {
      dealValue: deal.value,
      dealProbability: deal.probability,
      dealStageId: deal.stage_id,
    },
    contactId: deal.primary_contact_id,
    companyId: deal.company_id,
    dealId: deal.id,
    originalRecord: deal,
  };
}

/**
 * Normalize an activity into a timeline item
 */
function normalizeActivityToTimeline(activity: Activity): TimelineItem {
  return {
    id: activity.id,
    recordType: 'activity',
    timestamp: activity.date || activity.created_at,
    title: `${activity.type} - ${activity.client_name}`,
    description: activity.details,
    metadata: {
      activityType: activity.type,
      activityStatus: activity.status,
      amount: activity.amount,
    },
    contactId: activity.contact_id,
    companyId: activity.company_id,
    dealId: activity.deal_id,
    originalRecord: activity,
  };
}

/**
 * Normalize a meeting into a timeline item
 */
function normalizeMeetingToTimeline(meeting: any): TimelineItem {
  return {
    id: meeting.id,
    recordType: 'meeting',
    timestamp: meeting.meeting_start || meeting.created_at,
    title: meeting.title || 'Meeting',
    description: meeting.summary || meeting.description,
    metadata: {
      meetingStart: meeting.meeting_start,
      meetingEnd: meeting.meeting_end,
      meetingDuration: meeting.duration_minutes,
    },
    contactId: meeting.primary_contact_id,
    companyId: meeting.company_id,
    meetingId: meeting.id,
    originalRecord: meeting,
  };
}

/**
 * Normalize a lead into a timeline item
 */
function normalizeLeadToTimeline(lead: any): TimelineItem {
  return {
    id: lead.id,
    recordType: 'lead',
    timestamp: lead.meeting_start || lead.created_at,
    title: lead.meeting_title || `Lead from ${lead.external_source}`,
    description: lead.prep_summary || lead.meeting_description,
    metadata: {
      leadStatus: lead.status,
      leadPriority: lead.priority,
    },
    contactId: lead.contact_id,
    companyId: lead.company_id,
    leadId: lead.id,
    originalRecord: lead,
  };
}

/**
 * Normalize a task into a timeline item
 */
function normalizeTaskToTimeline(task: Task): TimelineItem {
  return {
    id: task.id,
    recordType: 'task',
    timestamp: task.due_date || task.created_at,
    title: task.title,
    description: task.description || task.notes,
    metadata: {
      taskPriority: task.priority,
      taskStatus: task.status,
      dueDate: task.due_date,
    },
    contactId: task.contact_id,
    companyId: task.company_id,
    dealId: task.deal_id,
    taskId: task.id,
    originalRecord: task,
  };
}

/**
 * Normalize a communication event into a timeline item
 */
function normalizeCommunicationToTimeline(comm: any): TimelineItem {
  const direction = comm.direction === 'inbound' ? 'Received' : 'Sent';
  return {
    id: comm.id,
    recordType: 'communication',
    timestamp: comm.event_timestamp || comm.communication_date || comm.created_at,
    title: `${direction}: ${comm.subject || comm.email_subject || 'Email'}`,
    description: comm.snippet || comm.email_body_preview || undefined,
    metadata: {
      communicationDirection: comm.direction,
      communicationEventType: comm.event_type,
      communicationSubject: comm.subject || comm.email_subject,
      communicationSentiment: comm.sentiment_label,
      wasOpened: comm.was_opened,
      wasReplied: comm.was_replied,
    },
    contactId: comm.contact_id,
    companyId: comm.company_id,
    dealId: comm.deal_id,
    originalRecord: comm,
  };
}

/**
 * Fetch all related data for a contact
 */
async function fetchContactGraph(contactId: string, userId: string, userData?: any): Promise<ContactCompanyGraph> {
  logger.log('📊 Fetching contact graph for:', contactId);
  
  // Check if user is admin - admins can view all contacts
  const isAdmin = userData ? isUserAdmin(userData) : false;
  
  // Fetch contact with owner profile - fetch company via separate query to avoid FK issues
  let query = supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId);
  
  // Only filter by owner_id if user is not an admin
  if (!isAdmin) {
    query = query.eq('owner_id', userId);
  }
  
  const { data: contact, error: contactError } = await query.maybeSingle();
  
  if (contactError) {
    logger.error('Error fetching contact:', contactError);
    throw contactError;
  }
  
  if (!contact) {
    const error = new Error(`Contact not found or you don't have permission to view it`);
    logger.error('Contact not found:', { contactId, userId, isAdmin });
    throw error;
  }
  
  // For non-admins, verify ownership even if we fetched without filter
  if (!isAdmin && (contact as any).owner_id !== userId) {
    const error = new Error(`You don't have permission to view this contact`);
    logger.error('Permission denied:', { contactId, userId, contactOwnerId: (contact as any).owner_id });
    throw error;
  }
  
  // Fetch company information separately to avoid FK issues between contacts and clients/companies
  let company = null;
  if ((contact as any).company_id) {
    // Try clients table first (CRM standard)
    const { data: clientCompany, error: clientError } = await (supabase
      .from('clients')
      .select('*')
      .eq('id', (contact as any).company_id)
      .maybeSingle() as any);

    if (clientCompany) {
      company = clientCompany;
    } else if (clientError && clientError.code !== 'PGRST116') {
      logger.warn('⚠️ Failed to fetch company from clients table, trying companies table...', clientError);
    }

    if (!company) {
      const { data: legacyCompany, error: legacyCompanyError } = await (supabase
        .from('companies')
        .select('*')
        .eq('id', (contact as any).company_id)
        .maybeSingle() as any);

      if (legacyCompany) {
        company = legacyCompany;
      } else if (legacyCompanyError && legacyCompanyError.code !== 'PGRST116') {
        logger.error('❌ Failed to fetch company from both clients and companies tables:', legacyCompanyError);
      }
    }
  }
  
  // If profile wasn't loaded via join, fetch it separately
  // (This can happen if the foreign key points to auth.users instead of profiles)
  let ownerProfile = (contact as any).profiles;
  if (!ownerProfile && (contact as any).owner_id) {
    const { data: profile } = await (supabase
      .from('profiles')
      .select('id, first_name, last_name, email, avatar_url, stage')
      .eq('id', (contact as any).owner_id)
      .maybeSingle() as any);
    if (profile) {
      ownerProfile = profile;
    }
  }
  
  // Attach owner profile to contact for use in components
  if (ownerProfile) {
    (contact as any).profiles = ownerProfile;
  }
  
  // Fetch all related data in parallel
  const [
    activitiesResult,
    meetingsByPrimaryResult,
    meetingsByJunctionResult,
    leadsResult,
    dealsByPrimaryResult,
    dealsByJunctionResult,
    tasksResult,
    communicationsResult,
  ] = await Promise.allSettled([
    // Activities for this contact
    supabase
      .from('activities')
      .select('*')
      .eq('contact_id', contactId)
      .eq('user_id', userId)
      .order('date', { ascending: false }),

    // Meetings linked to this contact by primary_contact_id
    supabase
      .from('meetings')
      .select('*')
      .eq('primary_contact_id', contactId)
      .eq('owner_user_id', userId)
      .order('meeting_start', { ascending: false }),

    // Meetings linked via meeting_contacts junction
    supabase
      .from('meeting_contacts')
      .select(`
        meeting_id,
        meetings!inner(*)
      `)
      .eq('contact_id', contactId),

    // Leads for this contact
    supabase
      .from('leads')
      .select('*')
      .eq('contact_id', contactId)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false }),
    
    // Deals linked to this contact by primary_contact_id
    supabase
      .from('deals')
      .select(`
        *,
        deal_stages(name)
      `)
      .eq('primary_contact_id', contactId)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false }),
    
    // Deals linked via deal_contacts junction (if it exists)
    supabase
      .from('deal_contacts')
      .select(`
        deal_id,
        deals!inner(
          *,
          deal_stages(name)
        )
      `)
      .eq('contact_id', contactId),
    
    // Tasks for this contact
    supabase
      .from('tasks')
      .select('*')
      .eq('contact_id', contactId)
      .eq('assigned_to', userId)
      .order('created_at', { ascending: false }),

    // Communication events (emails, calls) for this contact
    supabase
      .from('communication_events')
      .select('id, contact_id, company_id, deal_id, event_type, direction, subject, snippet, email_subject, email_body_preview, was_opened, was_replied, sentiment_score, sentiment_label, event_timestamp, communication_date, created_at')
      .eq('contact_id', contactId)
      .eq('user_id', userId)
      .order('event_timestamp', { ascending: false })
      .limit(50),
  ]);
  
  const activities = activitiesResult.status === 'fulfilled' 
    ? (activitiesResult.value.data || []) 
    : [];
  
  // Combine meetings from both queries
  const meetingsByPrimary = meetingsByPrimaryResult.status === 'fulfilled'
    ? (meetingsByPrimaryResult.value.data || [])
    : [];
  const meetingsByJunction = meetingsByJunctionResult.status === 'fulfilled'
    ? (meetingsByJunctionResult.value.data || [])
      .map((mc: any) => mc.meetings)
      .filter(Boolean)
    : [];
  // Deduplicate meetings by ID
  const meetingsMap = new Map();
  [...meetingsByPrimary, ...meetingsByJunction].forEach((m: any) => {
    if (m && m.id) meetingsMap.set(m.id, m);
  });
  const meetings = Array.from(meetingsMap.values());
  
  const leads = leadsResult.status === 'fulfilled'
    ? (leadsResult.value.data || [])
    : [];
  
  // Combine deals from both queries
  const dealsByPrimary = dealsByPrimaryResult.status === 'fulfilled'
    ? (dealsByPrimaryResult.value.data || [])
    : [];
  const dealsByJunction = dealsByJunctionResult.status === 'fulfilled'
    ? (dealsByJunctionResult.value.data || [])
      .map((dc: any) => dc.deals)
      .filter(Boolean)
    : [];
  // Deduplicate deals by ID
  const dealsMap = new Map();
  [...dealsByPrimary, ...dealsByJunction].forEach((d: any) => {
    if (d && d.id) dealsMap.set(d.id, d);
  });
  const deals = Array.from(dealsMap.values());
  
  const tasks = tasksResult.status === 'fulfilled'
    ? (tasksResult.value.data || [])
    : [];

  const communications = communicationsResult.status === 'fulfilled'
    ? (communicationsResult.value.data || [])
    : [];

  // Compute insights
  const allTimestamps = [
    ...activities.map((a: any) => a.date || a.created_at),
    ...meetings.map((m: any) => m.meeting_start || m.created_at),
    ...leads.map((l: any) => l.meeting_start || l.created_at),
    ...tasks.map((t: any) => t.due_date || t.created_at),
    ...communications.map((c: any) => c.event_timestamp || c.communication_date || c.created_at),
  ].filter(Boolean).map((d: any) => new Date(d).getTime());
  
  const lastActivityDate = allTimestamps.length > 0
    ? new Date(Math.max(...allTimestamps)).toISOString()
    : undefined;
  
  const daysSinceLastTouch = lastActivityDate
    ? Math.floor((Date.now() - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24))
    : undefined;
  
  // Pipeline coverage
  const pipelineCoverage = {
    sql: deals.filter(d => {
      const stageName = (d.deal_stages as any)?.name?.toLowerCase() || '';
      return stageName.includes('sql') || stageName.includes('qualified');
    }).length,
    opportunity: deals.filter(d => {
      const stageName = (d.deal_stages as any)?.name?.toLowerCase() || '';
      return stageName.includes('opportunity') || stageName.includes('proposal');
    }).length,
    verbal: deals.filter(d => {
      const stageName = (d.deal_stages as any)?.name?.toLowerCase() || '';
      return stageName.includes('verbal') || stageName.includes('negotiation');
    }).length,
    signed: deals.filter(d => {
      const stageName = (d.deal_stages as any)?.name?.toLowerCase() || '';
      return stageName.includes('signed') || stageName.includes('won') || stageName.includes('closed');
    }).length,
  };
  
  const totalDealValue = deals.reduce((sum, deal) => sum + (deal.value || 0), 0);
  const activeDealsCount = deals.filter(d => d.status === 'active').length;
  
  return {
    contact: contact as Contact,
    company: company as Company | undefined,
    activities: activities as Activity[],
    meetings,
    leads,
    deals: deals as Deal[],
    tasks: tasks as Task[],
    communications,
    insights: {
      daysSinceLastTouch,
      pipelineCoverage,
      totalDealValue,
      activeDealsCount,
      lastActivityDate,
    },
  };
}

/**
 * Fetch all related data for a company (aggregated across all contacts)
 */
async function fetchCompanyGraph(companyId: string, userId: string, userData?: any): Promise<ContactCompanyGraph> {
  logger.log('📊 Fetching company graph for:', companyId);
  
  // Check if user is admin - admins can view all companies
  const isAdmin = userData ? isUserAdmin(userData) : false;
  
  // Fetch company - use maybeSingle() to handle case where company doesn't exist
  let query = supabase
    .from('companies')
    .select('*')
    .eq('id', companyId);
  
  // Only filter by owner_id if user is not an admin
  if (!isAdmin) {
    query = query.eq('owner_id', userId);
  }
  
  const { data: company, error: companyError } = await query.maybeSingle();
  
  if (companyError) {
    logger.error('Error fetching company:', companyError);
    throw companyError;
  }
  
  if (!company) {
    const error = new Error(`Company not found or you don't have permission to view it`);
    logger.error('Company not found:', { companyId, userId, isAdmin });
    throw error;
  }
  
  // For non-admins, verify ownership even if we fetched without filter
  if (!isAdmin && (company as any).owner_id !== userId) {
    const error = new Error(`You don't have permission to view this company`);
    logger.error('Permission denied:', { companyId, userId, companyOwnerId: (company as any).owner_id });
    throw error;
  }
  
  // Fetch all contacts for this company
  const { data: contacts } = await (supabase
    .from('contacts')
    .select('id')
      .eq('company_id', companyId)
      .eq('owner_id', userId) as any);
  
  const contactIds = (contacts as any)?.map((c: any) => c.id) || [];
  
  if (contactIds.length === 0) {
    // No contacts, return empty graph
    return {
      company: company as Company,
      activities: [],
      meetings: [],
      leads: [],
      deals: [],
      tasks: [],
      communications: [],
      insights: {},
    };
  }
  
  // Fetch all related data aggregated across contacts
  const [
    activitiesResult,
    meetingsByCompanyResult,
    meetingsByPrimaryResult,
    meetingsByJunctionResult,
    leadsResult,
    dealsByCompanyResult,
    dealsByPrimaryResult,
    dealsByJunctionResult,
    tasksResult,
    communicationsResult,
  ] = await Promise.allSettled([
    // Activities for any contact in this company OR directly linked to company
    supabase
      .from('activities')
      .select('*')
      .or(`company_id.eq.${companyId},contact_id.in.(${contactIds.join(',')})`)
      .eq('user_id', userId)
      .order('date', { ascending: false }),
    
    // Meetings linked directly to company
    supabase
      .from('meetings')
      .select('*')
      .eq('company_id', companyId)
      .eq('owner_user_id', userId)
      .order('meeting_start', { ascending: false }),
    
    // Meetings linked by primary_contact_id
    contactIds.length > 0 ? supabase
      .from('meetings')
      .select('*')
      .in('primary_contact_id', contactIds)
      .eq('owner_user_id', userId)
      .order('meeting_start', { ascending: false }) : Promise.resolve({ status: 'fulfilled' as const, value: { data: [], error: null } }),
    
    // Meetings linked via meeting_contacts junction
    contactIds.length > 0 ? supabase
      .from('meeting_contacts')
      .select(`
        meeting_id,
        meetings!inner(*)
      `)
      .in('contact_id', contactIds) : Promise.resolve({ status: 'fulfilled' as const, value: { data: [], error: null } }),
    
    // Leads for company or any contact
    supabase
      .from('leads')
      .select('*')
      .or(`company_id.eq.${companyId},contact_id.in.(${contactIds.join(',')})`)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false }),
    
    // Deals linked directly to company
    supabase
      .from('deals')
      .select(`
        *,
        deal_stages(name)
      `)
      .eq('company_id', companyId)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false }),
    
    // Deals linked by primary_contact_id
    contactIds.length > 0 ? supabase
      .from('deals')
      .select(`
        *,
        deal_stages(name)
      `)
      .in('primary_contact_id', contactIds)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false }) : Promise.resolve({ status: 'fulfilled' as const, value: { data: [], error: null } }),
    
    // Deals linked via deal_contacts junction
    contactIds.length > 0 ? supabase
      .from('deal_contacts')
      .select(`
        deal_id,
        deals!inner(
          *,
          deal_stages(name)
        )
      `)
      .in('contact_id', contactIds) : Promise.resolve({ status: 'fulfilled' as const, value: { data: [], error: null } }),
    
    // Tasks for any contact in company
    supabase
      .from('tasks')
      .select('*')
      .or(`company_id.eq.${companyId},contact_id.in.(${contactIds.join(',')})`)
      .eq('assigned_to', userId)
      .order('created_at', { ascending: false }),

    // Communication events for company or any contact in company
    supabase
      .from('communication_events')
      .select('id, contact_id, company_id, deal_id, event_type, direction, subject, snippet, email_subject, email_body_preview, was_opened, was_replied, sentiment_score, sentiment_label, event_timestamp, communication_date, created_at')
      .or(`company_id.eq.${companyId},contact_id.in.(${contactIds.join(',')})`)
      .eq('user_id', userId)
      .order('event_timestamp', { ascending: false })
      .limit(50),
  ]);
  
  const activities = activitiesResult.status === 'fulfilled' 
    ? (activitiesResult.value.data || []) 
    : [];
  
  // Combine meetings from all queries
  const meetingsByCompany = meetingsByCompanyResult.status === 'fulfilled'
    ? ((meetingsByCompanyResult.value as any).data || [])
    : [];
  const meetingsByPrimary = meetingsByPrimaryResult.status === 'fulfilled'
    ? ((meetingsByPrimaryResult.value as any).data || [])
    : [];
  const meetingsByJunction = meetingsByJunctionResult.status === 'fulfilled'
    ? ((meetingsByJunctionResult.value as any).data || [])
      .map((mc: any) => mc.meetings)
      .filter(Boolean)
    : [];
  // Deduplicate meetings by ID
  const meetingsMap = new Map();
  [...meetingsByCompany, ...meetingsByPrimary, ...meetingsByJunction].forEach((m: any) => {
    if (m && m.id) meetingsMap.set(m.id, m);
  });
  const meetings = Array.from(meetingsMap.values());
  
  const leads = leadsResult.status === 'fulfilled'
    ? ((leadsResult.value as any).data || [])
    : [];
  
  // Combine deals from all queries
  const dealsByCompany = dealsByCompanyResult.status === 'fulfilled'
    ? ((dealsByCompanyResult.value as any).data || [])
    : [];
  const dealsByPrimary = dealsByPrimaryResult.status === 'fulfilled'
    ? ((dealsByPrimaryResult.value as any).data || [])
    : [];
  const dealsByJunction = dealsByJunctionResult.status === 'fulfilled'
    ? ((dealsByJunctionResult.value as any).data || [])
      .map((dc: any) => dc.deals)
      .filter(Boolean)
    : [];
  // Deduplicate deals by ID
  const dealsMap = new Map();
  [...dealsByCompany, ...dealsByPrimary, ...dealsByJunction].forEach((d: any) => {
    if (d && d.id) dealsMap.set(d.id, d);
  });
  const deals = Array.from(dealsMap.values());
  
  const tasks = tasksResult.status === 'fulfilled'
    ? (tasksResult.value.data || [])
    : [];

  const communications = communicationsResult.status === 'fulfilled'
    ? ((communicationsResult.value as any).data || [])
    : [];

  // Compute insights (same as contact)
  const allTimestamps = [
    ...activities.map((a: any) => a.date || a.created_at),
    ...meetings.map((m: any) => m.meeting_start || m.created_at),
    ...leads.map((l: any) => l.meeting_start || l.created_at),
    ...tasks.map((t: any) => t.due_date || t.created_at),
    ...communications.map((c: any) => c.event_timestamp || c.communication_date || c.created_at),
  ].filter(Boolean).map((d: any) => new Date(d).getTime());
  
  const lastActivityDate = allTimestamps.length > 0
    ? new Date(Math.max(...allTimestamps)).toISOString()
    : undefined;
  
  const daysSinceLastTouch = lastActivityDate
    ? Math.floor((Date.now() - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24))
    : undefined;
  
  const pipelineCoverage = {
    sql: deals.filter(d => {
      const stageName = (d.deal_stages as any)?.name?.toLowerCase() || '';
      return stageName.includes('sql') || stageName.includes('qualified');
    }).length,
    opportunity: deals.filter(d => {
      const stageName = (d.deal_stages as any)?.name?.toLowerCase() || '';
      return stageName.includes('opportunity') || stageName.includes('proposal');
    }).length,
    verbal: deals.filter(d => {
      const stageName = (d.deal_stages as any)?.name?.toLowerCase() || '';
      return stageName.includes('verbal') || stageName.includes('negotiation');
    }).length,
    signed: deals.filter(d => {
      const stageName = (d.deal_stages as any)?.name?.toLowerCase() || '';
      return stageName.includes('signed') || stageName.includes('won') || stageName.includes('closed');
    }).length,
  };
  
  const totalDealValue = deals.reduce((sum, deal) => sum + (deal.value || 0), 0);
  const activeDealsCount = deals.filter(d => d.status === 'active').length;
  
  return {
    company: company as Company,
    activities: activities as Activity[],
    meetings,
    leads,
    deals: deals as Deal[],
    tasks: tasks as Task[],
    communications,
    insights: {
      daysSinceLastTouch,
      pipelineCoverage,
      totalDealValue,
      activeDealsCount,
      lastActivityDate,
    },
  };
}

/**
 * Main hook for fetching contact/company relationship graph
 */
export function useContactCompanyGraph(
  type: 'contact' | 'company',
  id: string | undefined
) {
  const { userData } = useUser();
  const userId = userData?.id;
  
  const queryKey = ['contactCompanyGraph', type, id, userId];
  
  const { data: graph, isLoading, isFetching, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!id || !userId) {
        throw new Error('ID and user ID required');
      }
      
      if (type === 'contact') {
        return await fetchContactGraph(id, userId, userData);
      } else {
        return await fetchCompanyGraph(id, userId, userData);
      }
    },
    enabled: !!id && !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  // Memoized timeline items sorted by newest first
  const timelineItems = useMemo(() => {
    if (!graph) return [];
    
    const items: TimelineItem[] = [];
    
    // Add activities
    graph.activities.forEach(activity => {
      items.push(normalizeActivityToTimeline(activity));
    });
    
    // Add meetings
    graph.meetings.forEach(meeting => {
      items.push(normalizeMeetingToTimeline(meeting));
    });
    
    // Add leads
    graph.leads.forEach(lead => {
      items.push(normalizeLeadToTimeline(lead));
    });
    
    // Add deals with stage info
    graph.deals.forEach(deal => {
      const stageName = (deal.deal_stages as any)?.name;
      items.push(normalizeDealToTimeline(deal, stageName));
    });
    
    // Add tasks
    graph.tasks.forEach(task => {
      items.push(normalizeTaskToTimeline(task));
    });

    // Add communication events (emails, calls)
    (graph.communications || []).forEach((comm: any) => {
      items.push(normalizeCommunicationToTimeline(comm));
    });

    // Sort by timestamp (newest first)
    return items.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });
  }, [graph]);
  
  // Memoized selectors for different views
  const selectors = useMemo(() => {
    if (!graph) {
      return {
        activities: [],
        meetings: [],
        leads: [],
        deals: [],
        tasks: [],
        timelineItems: [],
      };
    }
    
    return {
      activities: graph.activities,
      meetings: graph.meetings,
      leads: graph.leads,
      deals: graph.deals,
      tasks: graph.tasks,
      timelineItems,
    };
  }, [graph, timelineItems]);
  
  return {
    graph,
    ...selectors,
    isLoading: isLoading || isFetching,
    error,
    refetch,
    insights: graph?.insights,
  };
}

/**
 * Hook for infinite scroll timeline
 */
export function useTimelineInfinite(
  type: 'contact' | 'company',
  id: string | undefined,
  pageSize = 20
) {
  const { userData } = useUser();
  const userId = userData?.id;
  
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ['timeline', type, id, userId],
    queryFn: async ({ pageParam = 0 }) => {
      if (!id || !userId) {
        throw new Error('ID and user ID required');
      }
      
      // Fetch full graph
      const graph = type === 'contact'
        ? await fetchContactGraph(id, userId)
        : await fetchCompanyGraph(id, userId);
      
      // Convert to timeline items
      const items: TimelineItem[] = [];
      
      graph.activities.forEach(activity => {
        items.push(normalizeActivityToTimeline(activity));
      });
      
      graph.meetings.forEach(meeting => {
        items.push(normalizeMeetingToTimeline(meeting));
      });
      
      graph.leads.forEach(lead => {
        items.push(normalizeLeadToTimeline(lead));
      });
      
      graph.deals.forEach(deal => {
        const stageName = (deal.deal_stages as any)?.name;
        items.push(normalizeDealToTimeline(deal, stageName));
      });
      
      graph.tasks.forEach(task => {
        items.push(normalizeTaskToTimeline(task));
      });

      // Add communication events (emails, calls)
      (graph.communications || []).forEach((comm: any) => {
        items.push(normalizeCommunicationToTimeline(comm));
      });

      // Sort by timestamp (newest first)
      items.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeB - timeA;
      });
      
      // Paginate
      const start = (pageParam as number) * pageSize;
      const end = start + pageSize;
      
      return {
        items: items.slice(start, end),
        nextCursor: end < items.length ? (pageParam as number) + 1 : undefined,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage: any) => lastPage?.nextCursor,
    enabled: !!id && !!userId,
    staleTime: 5 * 60 * 1000,
  });
  
  const timelineItems = data?.pages.flatMap(page => page.items) || [];
  
  return {
    timelineItems,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  };
}

