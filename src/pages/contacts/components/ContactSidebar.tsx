import React, { useState } from 'react';
import { User, Users, Mail, Phone, Building2, TrendingUp, ExternalLink, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import type { Contact } from '@/lib/database/models';
import type { ContactCompanyGraph } from '@/lib/hooks/useContactCompanyGraph';
import { useAiArkIntegration } from '@/lib/hooks/useAiArkIntegration';
import { extractDomainFromContact } from '@/lib/utils/domainUtils';
import { AiArkSimilaritySearch } from '@/components/prospecting/AiArkSimilaritySearch';

interface ContactSidebarProps {
  contact: Contact;
  graph?: ContactCompanyGraph;
}

export function ContactSidebar({ contact, graph }: ContactSidebarProps) {
  const navigate = useNavigate();
  const { isConnected: aiArkConnected } = useAiArkIntegration();
  const [showSimilaritySearch, setShowSimilaritySearch] = useState(false);

  // Derive company domain for "Find Similar" navigation
  const contactDomain = extractDomainFromContact({
    email: contact.email,
    company: contact.company
      ? { domain: (contact.company as any).domain, website: contact.company.website }
      : undefined,
  });

  // Use graph data for insights
  const insights = graph?.insights;
  const activities = graph?.activities || [];
  const meetings = graph?.meetings || [];
  const deals = graph?.deals || [];
  
  // Compute stats from graph data
  const stats = {
    meetings: meetings.length,
    emails: activities.filter(a => a.type === 'outbound' && a.details?.toLowerCase().includes('email')).length,
    calls: activities.filter(a => a.type === 'outbound' && a.details?.toLowerCase().includes('call')).length,
    totalDeals: deals.length,
    engagementScore: insights?.daysSinceLastTouch !== undefined
      ? Math.max(0, 100 - (insights.daysSinceLastTouch * 2)) // Simple engagement score
      : 0
  };
  
  // Get owner information from joined profile or fallback to defaults
  const ownerProfile = contact.profiles;
  const ownerInfo = {
    name: ownerProfile 
      ? `${ownerProfile.first_name || ''} ${ownerProfile.last_name || ''}`.trim() || ownerProfile.email || 'Unknown'
      : contact.owner_id 
        ? 'Assigned' 
        : 'Unassigned',
    title: ownerProfile?.stage || 'Sales Rep',
    email: ownerProfile?.email || (contact.owner_id ? 'Loading...' : ''),
    assigned_date: contact.created_at
  };

  const getInitials = (name: string) => {
    if (!name) return 'NA';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Unknown';
    }
  };

  const getEngagementColor = (score: number) => {
    if (score >= 80) return 'bg-green-500/10 dark:bg-green-500/10 border-green-500/30 dark:border-green-500/20 text-green-600 dark:text-green-400';
    if (score >= 50) return 'bg-yellow-500/10 dark:bg-yellow-500/10 border-yellow-500/30 dark:border-yellow-500/20 text-yellow-600 dark:text-yellow-400';
    return 'bg-red-500/10 dark:bg-red-500/10 border-red-500/30 dark:border-red-500/20 text-red-600 dark:text-red-400';
  };

  // Component always renders - no loading skeleton needed since parent handles loading
  return (
    <div className="space-y-6">
      {/* Lead Owner Card */}
      <div className="section-card bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
          <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          Lead Owner
        </h2>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
            {getInitials(ownerInfo.name)}
          </div>
          <div>
            <p className="theme-text-primary font-medium">{ownerInfo.name}</p>
            <p className="theme-text-tertiary text-sm">{ownerInfo.title}</p>
            <p className="theme-text-tertiary text-xs">{ownerInfo.email}</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-blue-500/20">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="theme-text-tertiary text-xs">Assigned</p>
              <p className="theme-text-primary">{formatDate(ownerInfo.assigned_date)}</p>
            </div>
            <div>
              <p className="theme-text-tertiary text-xs">Last Contact</p>
              <p className="theme-text-primary">
                {insights?.lastActivityDate
                  ? formatDate(insights.lastActivityDate)
                  : 'No activity'
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Information Card */}
      <div className="section-card">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-400" />
          Contact Information
        </h2>
        <div className="space-y-4 text-sm">
          {/* Email */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-100/50 dark:bg-gray-800/50">
            <div>
              <p className="theme-text-tertiary text-xs uppercase tracking-wider mb-1">Email</p>
              <p className="theme-text-primary">{contact.email}</p>
            </div>
            <button className="btn-icon">
              <Mail className="w-4 h-4" />
            </button>
          </div>

          {/* Phone */}
          {contact.phone && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-100/50 dark:bg-gray-800/50">
              <div>
                <p className="theme-text-tertiary text-xs uppercase tracking-wider mb-1">Phone</p>
                <p className="theme-text-primary">{contact.phone}</p>
              </div>
              <button className="btn-icon">
                <Phone className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Additional Info */}
          <div className="grid grid-cols-1 gap-3">
            {contact.company && (
              <div>
                <p className="theme-text-tertiary text-xs uppercase tracking-wider mb-1">Company</p>
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 theme-text-tertiary" />
                  <span className="theme-text-primary">{contact.company.name}</span>
                  {contact.company.website && (
                    <a
                      href={contact.company.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
            <div>
              <p className="theme-text-tertiary text-xs uppercase tracking-wider mb-1">Added on</p>
              <p className="theme-text-primary">
                {formatDate(contact.created_at)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Summary */}
      <div className="section-card">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          Activity Summary
        </h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="activity-metric text-center p-3 rounded-lg bg-blue-500/10 dark:bg-blue-500/10 border border-gray-200 dark:border-gray-700/50">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">{stats.meetings}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Meetings</div>
          </div>
          <div className="activity-metric text-center p-3 rounded-lg bg-blue-500/10 dark:bg-blue-500/10 border border-gray-200 dark:border-gray-700/50">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">{stats.emails}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Emails</div>
          </div>
          <div className="activity-metric text-center p-3 rounded-lg bg-blue-500/10 dark:bg-blue-500/10 border border-gray-200 dark:border-gray-700/50">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">{stats.calls}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Calls</div>
          </div>
          <div className="activity-metric text-center p-3 rounded-lg bg-blue-500/10 dark:bg-blue-500/10 border border-gray-200 dark:border-gray-700/50">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">{stats.totalDeals}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Deals</div>
          </div>
        </div>
        <div className={`p-3 rounded-lg border ${getEngagementColor(stats.engagementScore)}`}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-current rounded-full"></div>
            <span className="text-current text-sm font-medium">Engagement Score</span>
          </div>
          <div className="text-2xl font-bold text-white dark:text-white">{Math.round(stats.engagementScore)}%</div>
          <div className="text-xs theme-text-tertiary">
            {stats.engagementScore >= 80 ? 'Highly engaged' :
             stats.engagementScore >= 50 ? 'Moderately engaged' :
             'Low engagement'}
            {insights?.daysSinceLastTouch !== undefined && insights.daysSinceLastTouch > 0 && (
              <span className="block mt-1">
                {insights.daysSinceLastTouch} day{insights.daysSinceLastTouch !== 1 ? 's' : ''} since last touch
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Find Similar Companies (AI Ark) */}
      {aiArkConnected && contactDomain && (
        <Button
          variant="ghost"
          onClick={() => setShowSimilaritySearch(true)}
          className="w-full justify-start gap-2 text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20"
        >
          <Layers className="w-4 h-4 shrink-0" />
          Find Similar Companies
        </Button>
      )}

      {/* AI Ark Similarity Search Dialog */}
      <Dialog open={showSimilaritySearch} onOpenChange={setShowSimilaritySearch}>
        <DialogContent className="sm:max-w-4xl bg-zinc-900 border-zinc-700 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-violet-400" />
              Find Similar Companies
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Find companies similar to {contactDomain}
            </DialogDescription>
          </DialogHeader>
          <AiArkSimilaritySearch
            initialDomain={contactDomain || ''}
            onComplete={(tableId) => {
              setShowSimilaritySearch(false);
              navigate(`/ops/${tableId}`);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}