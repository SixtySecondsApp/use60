import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

/**
 * Task Work Package Creation for LinkedIn Leads
 *
 * Creates the minimum set of tasks:
 * - Follow-up task (always)
 * - Research/prep task (for high-value companies)
 * - CRM hygiene task (only when material update needed)
 */

interface TaskInput {
  contact_id: string
  company_id: string | null
  deal_id: string | null
  org_id: string
  owner_id: string | null
  contact_name: string
  company_name: string | null
  icp_score: number
  urgency: string
  lead_type: 'ad_form' | 'event_form'
  campaign_name: string | null
  is_new_contact: boolean
  is_new_company: boolean
}

export interface TaskResult {
  tasks_created: number
  task_ids: string[]
}

export async function createLeadTaskPackage(
  supabase: SupabaseClient,
  input: TaskInput
): Promise<TaskResult> {
  const taskIds: string[] = []
  const now = new Date()

  // 1. Follow-up task (always created)
  const followUpDue = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour
  const followUpTitle = input.lead_type === 'event_form'
    ? `Follow up with ${input.contact_name} (event registration)`
    : `Follow up with ${input.contact_name} (LinkedIn lead)`

  const { data: followUpTask } = await supabase
    .from('tasks')
    .insert({
      org_id: input.org_id,
      assigned_to: input.owner_id,
      owner_id: input.owner_id,
      created_by: input.owner_id,
      title: followUpTitle,
      description: buildFollowUpDescription(input),
      priority: input.urgency === 'critical' ? 'urgent' : input.urgency === 'high' ? 'high' : 'medium',
      due_date: followUpDue.toISOString(),
      status: 'pending',
      contact_id: input.contact_id,
      company_id: input.company_id,
      deal_id: input.deal_id,
    })
    .select('id')
    .maybeSingle()

  if (followUpTask?.id) taskIds.push(followUpTask.id)

  // 2. Research/prep task (for high-value leads with ICP >= 70)
  if (input.icp_score >= 70) {
    const researchDue = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 hours
    const { data: researchTask } = await supabase
      .from('tasks')
      .insert({
        org_id: input.org_id,
        assigned_to: input.owner_id,
        owner_id: input.owner_id,
        created_by: input.owner_id,
        title: `Research ${input.company_name || input.contact_name} before outreach`,
        description: `High-ICP lead (${input.icp_score}/100). Research the company before your first real conversation.\n\nCheck: competitive landscape, recent news, tech stack, potential pain points.`,
        priority: 'medium',
        due_date: researchDue.toISOString(),
        status: 'pending',
        contact_id: input.contact_id,
        company_id: input.company_id,
        deal_id: input.deal_id,
      })
      .select('id')
      .maybeSingle()

    if (researchTask?.id) taskIds.push(researchTask.id)
  }

  // 3. CRM hygiene task (only for new contacts/companies that need enrichment)
  if (input.is_new_contact && input.is_new_company && input.company_id) {
    const hygieneDue = new Date(now.getTime() + 48 * 60 * 60 * 1000) // 48 hours
    const { data: hygieneTask } = await supabase
      .from('tasks')
      .insert({
        org_id: input.org_id,
        assigned_to: input.owner_id,
        owner_id: input.owner_id,
        created_by: input.owner_id,
        title: `Verify ${input.company_name || 'new company'} details`,
        description: 'New company created from LinkedIn lead. Verify company details, add website, confirm industry and size.',
        priority: 'low',
        due_date: hygieneDue.toISOString(),
        status: 'pending',
        contact_id: input.contact_id,
        company_id: input.company_id,
      })
      .select('id')
      .maybeSingle()

    if (hygieneTask?.id) taskIds.push(hygieneTask.id)
  }

  return {
    tasks_created: taskIds.length,
    task_ids: taskIds,
  }
}

function buildFollowUpDescription(input: TaskInput): string {
  const lines: string[] = []
  lines.push(`LinkedIn lead from ${input.lead_type === 'event_form' ? 'event registration' : 'lead gen form'}`)
  if (input.campaign_name) lines.push(`Campaign: ${input.campaign_name}`)
  lines.push(`ICP Score: ${input.icp_score}/100 (${input.urgency})`)
  if (input.is_new_contact) lines.push('New contact - first touchpoint')
  lines.push('')
  lines.push('Check the email draft in Slack or Command Centre and approve/edit before sending.')
  return lines.join('\n')
}
