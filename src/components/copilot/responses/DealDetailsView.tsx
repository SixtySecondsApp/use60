/**
 * Deal Details View Component
 * Shows detailed deal information in chat with email generation option
 */

import React, { useState, useEffect } from 'react';
import { Mail, Calendar, DollarSign, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import logger from '@/lib/utils/logger';
import { MeetingSummaryDisplay } from '@/components/shared/MeetingSummaryDisplay';

interface DealDetailsViewProps {
  dealId: string;
  onClose?: () => void;
  onEmailGenerated?: (email: { subject: string; body: string }) => void;
  onActionClick?: (action: any) => void;
}

interface DealDetails {
  id: string;
  name: string;
  value: number;
  stage: string;
  probability: number;
  closeDate?: string;
  company?: {
    id: string;
    name: string;
  };
  contact?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  lastMeeting?: {
    id: string;
    title: string;
    summary?: string;
    transcript?: string;
    transcript_text?: string;
    meeting_start: string;
  };
  recentActivities?: Array<{
    id: string;
    type: string;
    details?: string;
    date: string;
  }>;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

export const DealDetailsView: React.FC<DealDetailsViewProps> = ({
  dealId,
  onClose,
  onEmailGenerated,
  onActionClick
}) => {
  const [deal, setDeal] = useState<DealDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingEmail, setGeneratingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState<{ subject: string; body: string } | null>(null);
  const { sendMessage } = useCopilot();

  useEffect(() => {
    const fetchDealDetails = async () => {
      try {
        setLoading(true);
        
        // Fetch deal with related data
        const { data: dealData, error: dealError } = await supabase
          .from('deals')
          .select(`
            id,
            name,
            value,
            stage_id,
            probability,
            expected_close_date,
            company_id,
            primary_contact_id,
            deal_stages:stage_id(name),
            companies:company_id(id, name),
            contacts:primary_contact_id(id, first_name, last_name, email)
          `)
          .eq('id', dealId)
          .single();

        if (dealError) throw dealError;

        // Fetch last meeting with transcript or summary - try multiple methods
        let lastMeeting = null;
        
        // First, try direct link - get meetings linked to company or contact, then filter for those with content
        const { data: directMeetings } = await supabase
          .from('meetings')
          .select('id, title, summary, transcript_text, meeting_start')
          .or(`company_id.eq.${dealData.company_id},primary_contact_id.eq.${dealData.primary_contact_id}`)
          .order('meeting_start', { ascending: false })
          .limit(10); // Get more to filter in code
        
        // Filter to find first meeting with transcript_text or summary
        if (directMeetings) {
          lastMeeting = directMeetings.find(m => m.transcript_text || m.summary) || null;
        }

        // If no meeting found and we have contact email, search by email
        if (!lastMeeting && dealData.contacts?.email) {
          const { data: attendeesData } = await supabase
            .from('meeting_attendees')
            .select(`
              meeting_id,
              meetings!inner(
                id,
                title,
                summary,
                transcript_text,
                meeting_start
              )
            `)
            .eq('email', dealData.contacts.email)
            .order('meetings.meeting_start', { ascending: false })
            .limit(10);
          
          // Filter to find first meeting with transcript_text or summary
          if (attendeesData) {
            const meetingWithContent = attendeesData.find(a => 
              a.meetings && (a.meetings.transcript_text || a.meetings.summary)
            );
            if (meetingWithContent?.meetings) {
              lastMeeting = meetingWithContent.meetings;
            }
          }
        }

        // Try via meeting_contacts junction table
        if (!lastMeeting && dealData.primary_contact_id) {
          const { data: meetingContactsData } = await supabase
            .from('meeting_contacts')
            .select(`
              meeting_id,
              meetings!inner(
                id,
                title,
                summary,
                transcript_text,
                meeting_start
              )
            `)
            .eq('contact_id', dealData.primary_contact_id)
            .order('meetings.meeting_start', { ascending: false })
            .limit(10);
          
          // Filter to find first meeting with transcript_text or summary
          if (meetingContactsData) {
            const meetingWithContent = meetingContactsData.find(mc => 
              mc.meetings && (mc.meetings.transcript_text || mc.meetings.summary)
            );
            if (meetingWithContent?.meetings) {
              lastMeeting = meetingWithContent.meetings;
            }
          }
        }

        // Fetch recent activities - need user_id for RLS
        const { data: { user } } = await supabase.auth.getUser();
        let activities = [];
        
        if (user?.id) {
          const { data: activitiesData, error: activitiesError } = await supabase
            .from('activities')
            .select('id, type, details, date')
            .eq('deal_id', dealId)
            .eq('user_id', user.id)
            .order('date', { ascending: false })
            .limit(5);
          
          if (!activitiesError && activitiesData) {
            activities = activitiesData;
          } else {
            logger.warn('Error fetching activities:', activitiesError);
          }
        }

        setDeal({
          id: dealData.id,
          name: dealData.name,
          value: dealData.value || 0,
          stage: dealData.deal_stages?.name || 'Unknown',
          probability: dealData.probability || 0,
          closeDate: dealData.expected_close_date,
          company: dealData.companies,
          contact: dealData.contacts,
          lastMeeting: lastMeeting ? {
            id: lastMeeting.id,
            title: lastMeeting.title || '',
            summary: lastMeeting.summary || undefined,
            transcript: lastMeeting.transcript_text || undefined,
            transcript_text: lastMeeting.transcript_text || undefined,
            meeting_start: lastMeeting.meeting_start
          } : undefined,
          recentActivities: activities || []
        });
      } catch (error) {
        logger.error('Error fetching deal details:', error);
      } finally {
        setLoading(false);
      }
    };

    if (dealId) {
      fetchDealDetails();
    }
  }, [dealId]);

  const handleGenerateEmail = async () => {
    if (!deal) return;

    try {
      setGeneratingEmail(true);
      
      // Get Supabase URL and headers
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Call backend to generate email from meeting context
      // The path should be /actions/generate-deal-email after the function name
      const response = await fetch(`${supabaseUrl}/functions/v1/api-copilot/actions/generate-deal-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          dealId: deal.id,
          contactId: deal.contact?.id,
          companyId: deal.company?.id
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to generate email' }));
        throw new Error(errorData.message || 'Failed to generate email');
      }

      const emailData = await response.json();
      setEmailDraft(emailData);
      onEmailGenerated?.(emailData);
    } catch (error) {
      logger.error('Error generating email:', error);
      // Show error message to user
      alert(error instanceof Error ? error.message : 'Failed to generate email. Please ensure a meeting with transcript is linked to this deal.');
    } finally {
      setGeneratingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        </div>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6">
        <p className="text-gray-400">Deal not found</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800/50 rounded-lg p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-100 mb-2">{deal.name}</h3>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span className="flex items-center gap-1">
              <DollarSign className="w-4 h-4" />
              {formatCurrency(deal.value)}
            </span>
            <span className="flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              {deal.probability}% probability
            </span>
            <span>{deal.stage}</span>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300"
          >
            ×
          </button>
        )}
      </div>

      {/* Company & Contact */}
      {(deal.company || deal.contact) && (
        <div className="border-t border-gray-800/50 pt-4">
          <div className="space-y-2 text-sm">
            {deal.company && (
              <div>
                <span className="text-gray-500">Company: </span>
                <span className="text-gray-300">{deal.company.name}</span>
              </div>
            )}
            {deal.contact && (
              <div>
                <span className="text-gray-500">Contact: </span>
                <span className="text-gray-300">
                  {deal.contact.first_name} {deal.contact.last_name}
                  {deal.contact.email && ` (${deal.contact.email})`}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Last Meeting */}
      {deal.lastMeeting && (
        <div className="border-t border-gray-800/50 pt-4">
          <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Last Meeting
          </h4>
          <div className="text-sm text-gray-400 space-y-1">
            <p className="font-medium text-gray-300">{deal.lastMeeting.title}</p>
            <p>{formatDate(deal.lastMeeting.meeting_start)}</p>
            {deal.lastMeeting.summary && (
              <MeetingSummaryDisplay summary={deal.lastMeeting.summary} maxLength={200} />
            )}
          </div>
        </div>
      )}

      {/* Recent Activities */}
      {deal.recentActivities && deal.recentActivities.length > 0 && (
        <div className="border-t border-gray-800/50 pt-4">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Recent Activity</h4>
          <div className="space-y-2">
            {deal.recentActivities.map(activity => (
              <div key={activity.id} className="text-sm text-gray-400">
                <span className="capitalize">{activity.type}</span>
                {activity.details && <span className="ml-2">- {activity.details}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email Generation - Only show if meeting with transcript exists */}
      {emailDraft ? (
        <div className="border-t border-gray-800/50 pt-4 space-y-4">
          <h4 className="text-sm font-semibold text-gray-300">Generated Email</h4>
          <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Subject</label>
              <p className="text-sm text-gray-200">{emailDraft.subject}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Body</label>
              <div className="text-sm text-gray-300 whitespace-pre-wrap">{emailDraft.body}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                // Navigate to email page with query parameters
                const params = new URLSearchParams({
                  to: deal.contact?.email || '',
                  subject: emailDraft.subject || '',
                  body: emailDraft.body || ''
                });
                const emailUrl = `/crm/email?${params.toString()}`;
                if (onActionClick) {
                  return onActionClick({ action: 'navigate', data: { path: emailUrl } });
                }
                window.location.href = emailUrl;
              }}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
            >
              Open in Email Composer
            </button>
            <button
              onClick={() => setEmailDraft(null)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-sm"
            >
              Regenerate
            </button>
          </div>
        </div>
      ) : deal.lastMeeting && (deal.lastMeeting.transcript || deal.lastMeeting.summary) ? (
        <div className="border-t border-gray-800/50 pt-4">
          <button
            onClick={handleGenerateEmail}
            disabled={generatingEmail || !deal.contact}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {generatingEmail ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing meetings and generating email...
              </>
            ) : (
              <>
                <Mail className="w-4 h-4" />
                Write Email Based on Last Meeting
              </>
            )}
          </button>
          {!deal.contact && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              No contact associated with this deal
            </p>
          )}
        </div>
      ) : (
        <div className="border-t border-gray-800/50 pt-4">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <p className="text-xs text-amber-400 text-center">
              No meeting with transcript found. Link a meeting with transcript to generate an email.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

