import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, User, Calendar, DollarSign, Target, TrendingUp, Edit, Phone, Mail, MessageCircle, GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/clientV2';
import logger from '@/lib/utils/logger';
import { DealHealthBadge } from '@/components/DealHealthBadge';
import { useDealHealthScore } from '@/lib/hooks/useDealHealth';
import { HealthScoreGauge } from '@/components/health';
import EditDealModal from '@/components/EditDealModal/EditDealModal';
import { NotesSection } from '@/components/NotesSection';
import { PipelineProvider } from '@/lib/contexts/PipelineContext';
import { extractDomainFromDeal } from '@/lib/utils/domainUtils';
import { useCompanyLogo } from '@/lib/hooks/useCompanyLogo';
import { getMeetingSummaryPlainText } from '@/lib/utils/meetingSummaryParser';
import { Skeleton } from '@/components/ui/skeleton';

interface Deal {
  id: string;
  name?: string;
  description?: string;
  value?: number;
  status?: string;
  stage_id?: string;
  stage_name?: string;
  stage_color?: string;
  default_probability?: number;
  created_at?: string;
  updated_at?: string;
  company?: string;
  company_name?: string;
  company_id?: string;
  contact_name?: string;
  contact_email?: string;
  primary_contact_id?: string;
}

interface TimelineEvent {
  id: string;
  type: 'created' | 'updated' | 'meeting' | 'activity' | 'stage_change';
  title: string;
  description?: string;
  date: string;
  icon: 'create' | 'update' | 'meeting' | 'email' | 'call' | 'linkedin' | 'proposal' | 'stage_change';
  color: string;
}

const DealRecord: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');

  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoError, setLogoError] = useState(false);

  // Extract domain for logo
  const domainForLogo = useMemo(() => {
    if (!deal) return null;
    return extractDomainFromDeal({
      company: deal.company,
      contact_email: deal.contact_email,
      company_website: deal.company_website,
    });
  }, [deal?.company, deal?.contact_email, deal?.company_website]);

  const { logoUrl, isLoading } = useCompanyLogo(domainForLogo);

  // Reset error state when domain or logoUrl changes
  useEffect(() => {
    setLogoError(false);
  }, [domainForLogo, logoUrl]);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);

  // Fetch deal health score
  const { healthScore } = useDealHealthScore(id || null);

  useEffect(() => {
    const fetchDeal = async () => {
      if (!id) {
        setError('Deal ID is required');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch deal data from Supabase with related data
        const { data, error: fetchError } = await supabase
          .from('deals')
          .select(`
            *,
            deal_stages!inner(
              name,
              color,
              default_probability
            ),
            companies(
              id,
              name
            ),
            contacts!deals_primary_contact_id_fkey(
              id,
              first_name,
              last_name,
              email
            )
          `)
          .eq('id', id)
          .single();

        if (fetchError) {
          if (fetchError.code === 'PGRST116') {
            setError('Deal not found');
          } else {
            throw fetchError;
          }
          return;
        }

        // Transform the data to match the Deal interface
        const transformedDeal: Deal = {
          id: data.id,
          name: data.name,
          description: data.description,
          value: data.value,
          status: data.status,
          stage_id: data.stage_id,
          stage_name: data.deal_stages?.name,
          stage_color: data.deal_stages?.color,
          default_probability: data.deal_stages?.default_probability,
          created_at: data.created_at,
          updated_at: data.updated_at,
          company: data.company, // legacy field
          company_name: data.companies?.name || data.company,
          company_id: data.companies?.id || data.company_id, // Use joined company ID
          contact_name: data.contacts ? `${data.contacts.first_name || ''} ${data.contacts.last_name || ''}`.trim() : data.contact_name,
          contact_email: data.contacts?.email || data.contact_email,
          primary_contact_id: data.contacts?.id || data.primary_contact_id, // Use joined contact ID
        };

        setDeal(transformedDeal);

        // Fetch timeline events (meetings and activities)
        await fetchTimelineEvents(data.id, data.company_id, data.primary_contact_id);
      } catch (err) {
        logger.error('Error fetching deal:', err);
        setError(err instanceof Error ? err.message : 'Failed to load deal');
      } finally {
        setLoading(false);
      }
    };

    fetchDeal();
  }, [id]);

  const fetchTimelineEvents = async (dealId: string, companyId?: string, contactId?: string) => {
    try {
      const events: TimelineEvent[] = [];

      // Fetch meetings related to the contact or company (only if we have IDs)
      if (contactId || companyId) {
        const conditions = [];
        if (contactId) conditions.push(`primary_contact_id.eq.${contactId}`);
        if (companyId) conditions.push(`company_id.eq.${companyId}`);

        const { data: meetings, error: meetingsError } = await supabase
          .from('meetings')
          .select('id, title, summary, meeting_start, primary_contact_id, company_id')
          .or(conditions.join(','))
          .order('meeting_start', { ascending: false })
          .limit(10);

        if (!meetingsError && meetings) {
          meetings.forEach(meeting => {
            events.push({
              id: `meeting-${meeting.id}`,
              type: 'meeting',
              title: meeting.title || 'Meeting',
              description: meeting.summary ? getMeetingSummaryPlainText(meeting.summary) : 'No summary available',
              date: meeting.meeting_start,
              icon: 'meeting',
              color: 'blue'
            });
          });
        }
      }

      // Fetch activities related to the deal
      const { data: activities, error: activitiesError } = await supabase
        .from('activities')
        .select('id, type, notes, date, outbound_type, proposal_date')
        .eq('deal_id', dealId)
        .order('date', { ascending: false })
        .limit(10);

      if (!activitiesError && activities) {
        activities.forEach(activity => {
          let icon: TimelineEvent['icon'] = 'update';
          let color = 'gray';
          let title = 'Activity';

          if (activity.type === 'outbound') {
            switch (activity.outbound_type) {
              case 'email':
                icon = 'email';
                color = 'green';
                title = 'Email Sent';
                break;
              case 'call':
                icon = 'call';
                color = 'purple';
                title = 'Call Made';
                break;
              case 'linkedin':
                icon = 'linkedin';
                color = 'blue';
                title = 'LinkedIn Message';
                break;
            }
          } else if (activity.type === 'proposal') {
            icon = 'proposal';
            color = 'yellow';
            title = 'Proposal Sent';
          } else if (activity.type === 'meeting') {
            icon = 'meeting';
            color = 'blue';
            title = 'Meeting';
          }

          events.push({
            id: `activity-${activity.id}`,
            type: 'activity',
            title,
            description: activity.notes || undefined,
            date: activity.proposal_date || activity.date,
            icon,
            color
          });
        });
      }

      // Fetch CRM changes (stage history)
      const { data: stageHistory, error: stageError } = await supabase
        .from('deal_stage_history')
        .select('id, stage_id, entered_at, exited_at, duration_seconds, deal_stages:stage_id(name, color)')
        .eq('deal_id', dealId)
        .order('entered_at', { ascending: false })
        .limit(20);

      if (!stageError && stageHistory) {
        stageHistory.forEach((entry: any) => {
          const stageName = entry.deal_stages?.name || 'Unknown Stage';
          const durationLabel = entry.duration_seconds
            ? ` (${Math.round(entry.duration_seconds / 86400)}d)`
            : entry.exited_at ? '' : ' (current)';
          events.push({
            id: `stage-${entry.id}`,
            type: 'stage_change',
            title: `Moved to ${stageName}`,
            description: durationLabel ? `Stage duration${durationLabel}` : undefined,
            date: entry.entered_at,
            icon: 'stage_change',
            color: 'purple',
          });
        });
      }

      // Sort all events by date (most recent first)
      events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setTimelineEvents(events);
    } catch (err) {
      logger.error('Error fetching timeline events:', err);
    }
  };

  const handleBack = () => {
    if (returnTo) {
      navigate(returnTo);
    } else {
      navigate('/crm/deals');
    }
  };

  const handleSaveDeal = async (formData: Partial<any>) => {
    try {
      if (!id) return;

      // Update deal directly with Supabase
      const { error: updateError } = await supabase
        .from('deals')
        .update(formData)
        .eq('id', id);

      if (updateError) throw updateError;

      // Refresh deal data
      const { data, error: fetchError } = await supabase
        .from('deals')
        .select(`
          *,
          deal_stages!inner(name, color, default_probability),
          companies(id, name),
          contacts!deals_primary_contact_id_fkey(id, first_name, last_name, email)
        `)
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const transformedDeal: Deal = {
        id: data.id,
        name: data.name,
        description: data.description,
        value: data.value,
        status: data.status,
        stage_id: data.stage_id,
        stage_name: data.deal_stages?.name,
        stage_color: data.deal_stages?.color,
        default_probability: data.deal_stages?.default_probability,
        created_at: data.created_at,
        updated_at: data.updated_at,
        company: data.company,
        company_name: data.companies?.name || data.company,
        company_id: data.company_id,
        contact_name: data.contacts ? `${data.contacts.first_name || ''} ${data.contacts.last_name || ''}`.trim() : data.contact_name,
        contact_email: data.contacts?.email || data.contact_email,
        primary_contact_id: data.primary_contact_id,
      };

      setDeal(transformedDeal);
      setShowEditModal(false);
    } catch (err) {
      logger.error('Error saving deal:', err);
      throw err;
    }
  };

  const handleDeleteDeal = async (dealId: string) => {
    try {
      // Delete deal directly with Supabase
      const { error: deleteError } = await supabase
        .from('deals')
        .delete()
        .eq('id', dealId);

      if (deleteError) throw deleteError;

      // Navigate back after deletion
      handleBack();
    } catch (err) {
      logger.error('Error deleting deal:', err);
      throw err;
    }
  };

  const formatCurrency = (amount: number) => {
    return `£${amount?.toLocaleString() || 0}`;
  };

  const formatDate = (dateString?: string) => {
    try {
      if (!dateString) return 'Unknown';
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Unknown';
    }
  };

  const getStageBadge = (stage: string, color?: string) => {
    switch (stage?.toLowerCase()) {
      case 'won':
      case 'signed':
      case 'closed won':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Signed</Badge>;
      case 'lost':
      case 'closed lost':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Lost</Badge>;
      case 'negotiation': 
      case 'negotiate': 
        return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Negotiation</Badge>;
      case 'proposal': 
      case 'quote': 
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Proposal</Badge>;
      case 'qualified': 
      case 'discovery': 
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Qualified</Badge>;
      default: 
        return <Badge variant="outline">{stage || 'Unknown'}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Breadcrumb skeleton */}
          <div className="flex items-center gap-2 mb-6">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-3 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>

          {/* Deal header skeleton */}
          <div className="mb-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                {/* Logo circle */}
                <Skeleton className="w-20 h-20 rounded-full flex-shrink-0" />
                <div className="space-y-3">
                  {/* Deal name */}
                  <Skeleton className="h-9 w-64" />
                  {/* Company + contact row */}
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-5 w-4 rounded-full" />
                    <Skeleton className="h-5 w-28" />
                  </div>
                  {/* Badge row */}
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                </div>
              </div>
              {/* Action buttons */}
              <div className="flex gap-2">
                <Skeleton className="h-10 w-28 rounded-lg" />
                <Skeleton className="h-10 w-36 rounded-lg" />
              </div>
            </div>
          </div>

          {/* Content grid: 2/3 left + 1/3 right */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left column (2/3) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Deal summary card: 3 metric tiles */}
              <div className="section-card">
                <div className="flex items-center gap-2 mb-4">
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="h-6 w-32" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex flex-col items-center gap-2">
                      <Skeleton className="h-8 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes section placeholder */}
              <div className="section-card">
                <div className="flex items-center gap-2 mb-4">
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="h-6 w-20" />
                </div>
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>

              {/* Timeline section */}
              <div className="section-card">
                <div className="flex items-center gap-2 mb-4">
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="h-6 w-24" />
                </div>
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-gray-800/30">
                      <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right column (1/3) */}
            <div className="space-y-6">
              {/* Primary contact card */}
              <div className="section-card">
                <div className="flex items-center gap-2 mb-4">
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="h-6 w-32" />
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-5 w-36" />
                  </div>
                  <div className="space-y-1.5">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-5 w-44" />
                  </div>
                  <Skeleton className="h-9 w-full rounded-lg mt-2" />
                </div>
              </div>

              {/* Company card */}
              <div className="section-card">
                <div className="flex items-center gap-2 mb-4">
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="h-6 w-24" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-5 w-40" />
                </div>
                <Skeleton className="h-9 w-full rounded-lg mt-4" />
              </div>

              {/* Health score card */}
              <div className="section-card">
                <div className="flex items-center gap-2 mb-4">
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="h-6 w-28" />
                </div>
                <div className="flex justify-center">
                  <Skeleton className="w-24 h-24 rounded-full" />
                </div>
              </div>

              {/* Quick stats card */}
              <div className="section-card">
                <div className="flex items-center gap-2 mb-4">
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="h-6 w-28" />
                </div>
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex justify-between items-center">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen text-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <nav className="breadcrumb-nav">
            <button onClick={handleBack} className="breadcrumb-item flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </nav>
          
          <div className="section-card bg-red-900/20 border-red-700 text-red-300">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5" />
              <span className="font-medium">Deal Error</span>
            </div>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="min-h-screen text-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <nav className="breadcrumb-nav">
            <button onClick={handleBack} className="breadcrumb-item flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </nav>
          
          <div className="section-card">
            <p className="text-gray-400">Deal not found</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb Navigation */}
          <nav className="breadcrumb-nav">
            <button onClick={handleBack} className="breadcrumb-item flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" />
              {returnTo?.includes('/contacts/') ? 'Contact Record' : 'Deals'}
            </button>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">{deal.name || `Deal ${deal.id}`}</span>
          </nav>

          {/* Deal Header */}
          <div className="mb-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-full border-3 border-purple-400 bg-gradient-to-r from-purple-500 to-blue-600 flex items-center justify-center text-white font-bold text-2xl shadow-lg overflow-hidden">
                  {logoUrl && !logoError && !isLoading ? (
                    <img
                      src={logoUrl}
                      alt={`${deal.company_name || 'Company'} logo`}
                      className="w-full h-full object-cover"
                      onError={() => setLogoError(true)}
                    />
                  ) : (
                    <Target className="w-10 h-10" />
                  )}
                </div>
                <div>
                  <h1 className="text-3xl font-bold theme-text-primary mb-2">
                    {deal.name || `Deal ${deal.id}`}
                  </h1>
                  <div className="flex items-center gap-3 text-gray-400 mb-2">
                    {deal.company_name && (
                      <>
                        <span className="text-lg flex items-center gap-1">
                          <Building2 className="w-4 h-4" />
                          {deal.company_name}
                        </span>
                        <span className="text-gray-600">•</span>
                      </>
                    )}
                    {deal.contact_name && (
                      <span className="text-lg flex items-center gap-1">
                        <User className="w-4 h-4" />
                        {deal.contact_name}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {getStageBadge(deal.stage_name || '', deal.stage_color)}
                    {deal.status && (
                      <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
                        {deal.status}
                      </Badge>
                    )}
                    {healthScore && <DealHealthBadge healthScore={healthScore} size="lg" />}
                  </div>
                </div>
              </div>
              <div className="btn-group">
                <button
                  className="btn-primary"
                  onClick={() => setShowEditModal(true)}
                >
                  <Edit className="w-4 h-4" />
                  <span>Edit Deal</span>
                </button>
                {deal.contact_email && (
                  <button className="btn-secondary">
                    <Mail className="w-4 h-4" />
                    <span>Email Contact</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Deal Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Deal Details */}
            <div className="lg:col-span-2 space-y-6">
            {/* Deal Summary */}
            <div className="section-card">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-400" />
                Deal Summary
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="activity-metric text-center">
                  <div className="text-2xl font-bold theme-text-primary mb-1">
                    {formatCurrency(deal.value || 0)}
                  </div>
                  <div className="text-xs theme-text-tertiary">Deal Value</div>
                </div>
                
                <div className="activity-metric text-center">
                  <div className="text-2xl font-bold theme-text-primary mb-1">
                    {deal.default_probability || 0}%
                  </div>
                  <div className="text-xs theme-text-tertiary">Win Probability</div>
                </div>
                
                <div className="activity-metric text-center">
                  <div className="text-2xl font-bold theme-text-primary mb-1">
                    {deal.created_at ? Math.ceil((new Date().getTime() - new Date(deal.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0}
                  </div>
                  <div className="text-xs theme-text-tertiary">Days Active</div>
                </div>
              </div>
            </div>

            {/* Deal Description */}
            {deal.description && (
              <div className="section-card">
                <h2 className="text-lg font-semibold mb-4">Description</h2>
                <p className="theme-text-secondary leading-relaxed">{deal.description}</p>
              </div>
            )}

            {/* Notes Section */}
            <NotesSection
              entityType="deal"
              entityId={deal.id}
              entityName={deal.name}
            />

            {/* Timeline */}
            <div className="section-card">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-400" />
                Timeline
              </h2>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {/* Timeline Events */}
                {timelineEvents.map((event) => {
                  const iconColorClass = {
                    blue: 'text-blue-400',
                    green: 'text-green-400',
                    purple: 'text-purple-400',
                    yellow: 'text-yellow-400',
                    gray: 'text-gray-400'
                  }[event.color];

                  const dotColorClass = {
                    blue: 'bg-blue-400',
                    green: 'bg-green-400',
                    purple: 'bg-purple-400',
                    yellow: 'bg-yellow-400',
                    gray: 'bg-gray-400'
                  }[event.color];

                  let IconComponent = Calendar;
                  if (event.icon === 'email') IconComponent = Mail;
                  if (event.icon === 'call') IconComponent = Phone;
                  if (event.icon === 'meeting') IconComponent = MessageCircle;
                  if (event.icon === 'stage_change') IconComponent = GitBranch;

                  return (
                    <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg theme-bg-elevated theme-border border hover:border-gray-600 transition-colors">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${event.color === 'blue' ? 'bg-blue-500/10' : event.color === 'green' ? 'bg-green-500/10' : event.color === 'purple' ? 'bg-purple-500/10' : event.color === 'yellow' ? 'bg-yellow-500/10' : 'bg-gray-500/10'}`}>
                        <IconComponent className={`w-4 h-4 ${iconColorClass}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="theme-text-primary font-medium text-sm">{event.title}</p>
                        {event.description && (
                          <p className="theme-text-tertiary text-xs mt-1 line-clamp-2">{event.description}</p>
                        )}
                        <p className="theme-text-tertiary text-xs mt-1">{formatDate(event.date)}</p>
                      </div>
                    </div>
                  );
                })}

                {/* Deal Created */}
                <div className="flex items-start gap-3 p-3 rounded-lg theme-bg-elevated theme-border border">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-500/10">
                    <Target className="w-4 h-4 text-green-400" />
                  </div>
                  <div className="flex-1">
                    <p className="theme-text-primary font-medium text-sm">Deal Created</p>
                    <p className="theme-text-tertiary text-xs mt-1">{deal.created_at ? formatDate(deal.created_at) : 'Unknown'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Contact & Company Info */}
          <div className="space-y-6">
            {/* Contact Information */}
            {(deal.contact_name || deal.contact_email) && (
              <div className="section-card">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-400" />
                  Primary Contact
                </h2>
                
                <div className="space-y-3">
                  {deal.contact_name && (
                    <div>
                      <p className="theme-text-tertiary text-xs uppercase tracking-wider mb-1">Name</p>
                      <p className="theme-text-primary">{deal.contact_name}</p>
                    </div>
                  )}
                  
                  {deal.contact_email && (
                    <div>
                      <p className="theme-text-tertiary text-xs uppercase tracking-wider mb-1">Email</p>
                      <p className="theme-text-primary">{deal.contact_email}</p>
                    </div>
                  )}
                  
                  {deal.primary_contact_id && (
                    <div className="pt-2">
                      <button
                        className="btn-sm btn-secondary w-full"
                        onClick={() => navigate(`/crm/contacts/${deal.primary_contact_id}`)}
                      >
                        <User className="w-4 h-4" />
                        <span>View Contact Record</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Company Information */}
            {deal.company_name && (
              <div className="section-card">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-purple-400" />
                  Company
                </h2>
                
                <div className="space-y-3">
                  <div>
                    <p className="theme-text-tertiary text-xs uppercase tracking-wider mb-1">Company Name</p>
                    <p className="theme-text-primary">{deal.company_name}</p>
                  </div>
                  
                  {deal.company_id && (
                    <div className="pt-2">
                      <button
                        className="btn-sm btn-secondary w-full"
                        onClick={() => navigate(`/crm/companies/${deal.company_id}`)}
                      >
                        <Building2 className="w-4 h-4" />
                        <span>View Company Profile</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Deal Health Score */}
            {healthScore && (
              <div className="section-card">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-emerald-400" />
                  Deal Health
                </h2>

                <div className="flex flex-col items-center">
                  <HealthScoreGauge
                    healthScore={healthScore}
                    size={80}
                    showLabel
                    interactive
                  />
                </div>
              </div>
            )}

            {/* Quick Stats */}
            <div className="section-card bg-gradient-to-br from-purple-500/5 to-blue-500/5 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-500/10 dark:border-purple-500/20">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-400" />
                Quick Stats
              </h2>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="theme-text-tertiary">Stage</span>
                  <span className="theme-text-primary font-medium">{deal.stage_name || 'Unknown'}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="theme-text-tertiary">Status</span>
                  <span className="theme-text-primary font-medium">{deal.status || 'Active'}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="theme-text-tertiary">Value</span>
                  <span className="theme-text-primary font-medium">{formatCurrency(deal.value || 0)}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="theme-text-tertiary">Win Probability</span>
                  <span className="theme-text-primary font-medium">{deal.default_probability || 0}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Deal Modal */}
      {deal && (
        <PipelineProvider>
          <EditDealModal
            open={showEditModal}
            setOpen={setShowEditModal}
            deal={deal}
            onSave={handleSaveDeal}
            onDelete={handleDeleteDeal}
          />
        </PipelineProvider>
      )}
    </div>
  );
};

export default DealRecord; 