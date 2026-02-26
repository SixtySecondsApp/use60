import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Plus, MessageCircle, Mail, Phone, Calendar, Sparkles, ExternalLink, TrendingUp, AlertTriangle, Info, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Contact } from '@/lib/database/models';
import type { ContactCompanyGraph } from '@/lib/hooks/useContactCompanyGraph';
import logger from '@/lib/utils/logger';
import { useNextActions } from '@/lib/hooks/useNextActions';
import { NextActionBadge, NextActionPanel } from '@/components/next-actions';
import { ContactDealHealthWidget } from '@/components/ContactDealHealthWidget';
import { DealHealthBadge } from '@/components/DealHealthBadge';
import { useDealHealthScore } from '@/lib/hooks/useDealHealth';
import { RelationshipHealthWidget } from '@/components/relationship-health/RelationshipHealthWidget';
import { ContactRoles } from '@/components/contacts/ContactRoles';

interface ContactRightPanelProps {
  contact: Contact;
  graph?: ContactCompanyGraph;
}

export function ContactRightPanel({ contact, graph }: ContactRightPanelProps) {
  const navigate = useNavigate();
  const [showNextActionsPanel, setShowNextActionsPanel] = useState(false);

  // Get AI suggestions for this contact
  const {
    pendingCount: nextActionsPendingCount,
    highUrgencyCount,
    suggestions
  } = useNextActions({
    contactId: contact.id,
    status: 'pending',
  });

  // Use graph data instead of fetching separately
  const deals = graph?.deals || [];
  const activities = graph?.activities || [];

  const handleDealClick = (dealId: string) => {
    // Navigate to deal detail page with return path
    navigate(`/crm/deals/${dealId}?returnTo=/crm/contacts/${contact.id}`);
  };

  const getStageColor = (stage: string) => {
    switch (stage?.toLowerCase()) {
      case 'won': 
      case 'signed':
      case 'closed won': 
        return 'border-l-green-500';
      case 'lost':
      case 'closed lost':
        return 'border-l-red-500';
      case 'negotiation': 
      case 'negotiate': 
        return 'border-l-purple-500';
      case 'proposal': 
      case 'quote': 
        return 'border-l-blue-500';
      case 'qualified': 
      case 'discovery': 
        return 'border-l-yellow-500';
      default: 
        return 'border-l-gray-500';
    }
  };

  const getStageBadge = (stage: string) => {
    const stageKey = stage?.toLowerCase();
    switch (stageKey) {
      case 'won': 
      case 'closed won': 
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Won</Badge>;
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

  const formatCurrency = (amount: number, currency = '£') => {
    return `${currency}${amount?.toLocaleString() || 0}`;
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'Unknown';
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'email': return { icon: Mail, color: 'text-blue-400', bgColor: 'bg-blue-500/20', borderColor: 'border-blue-500/30' };
      case 'meeting': return { icon: Calendar, color: 'text-green-400', bgColor: 'bg-green-500/20', borderColor: 'border-green-500/30' };
      case 'call': return { icon: Phone, color: 'text-orange-400', bgColor: 'bg-orange-500/20', borderColor: 'border-orange-500/30' };
      case 'task': return { icon: MessageCircle, color: 'text-purple-400', bgColor: 'bg-purple-500/20', borderColor: 'border-purple-500/30' };
      default: return { icon: MessageCircle, color: 'text-gray-400', bgColor: 'bg-gray-500/20', borderColor: 'border-gray-500/30' };
    }
  };

  // Mini component to show health badge for a deal
  const DealHealthIndicator = ({ dealId }: { dealId: string }) => {
    const { healthScore } = useDealHealthScore(dealId);
    if (!healthScore) return null;
    return <DealHealthBadge healthScore={healthScore} size="sm" />;
  };

  // Component always renders - no loading skeleton needed since parent handles loading
  return (
    <div className="space-y-6">
      {/* Relationship Health Widget */}
      <RelationshipHealthWidget
        relationshipType="contact"
        relationshipId={contact.id}
        relationshipName={`${contact.first_name || ''} ${contact.last_name || ''}`.trim()}
      />

      {/* Deal Health Widget */}
      <ContactDealHealthWidget contactId={contact.id} />

      {/* Role in Deals — manual override UI (REL-011) */}
      <ContactRoles contactId={contact.id} />

      {/* Active Deals */}
      <div className="section-card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-blue-400" />
            Active Deals
          </h2>
          <button className="btn-sm btn-secondary">
            <Plus className="w-4 h-4" />
            <span>New Deal</span>
          </button>
        </div>

        <div className="space-y-3">
          {deals.length > 0 ? (
            deals.map((deal) => (
              <div
                key={deal.id}
                className={`deal-card-clickable p-4 rounded-lg bg-gray-100/50 dark:bg-gray-800/50 border-l-4 ${getStageColor((deal.deal_stages as any)?.name || '')} group`}
                onClick={() => handleDealClick(deal.id)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 flex-1">
                    <h3 className="theme-text-primary font-medium text-sm group-hover:text-blue-400 transition-colors">
                      {deal.name || `Deal ${deal.id}`}
                    </h3>
                    <Eye className="w-4 h-4 theme-text-tertiary group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all" />
                  </div>
                  <div className="flex items-center gap-2">
                    <DealHealthIndicator dealId={deal.id} />
                    {getStageBadge((deal.deal_stages as any)?.name || '')}
                  </div>
                </div>
                <p className="theme-text-tertiary text-xs mb-2">
                  {deal.description || 'No description available'}
                </p>
                <div className="flex justify-between items-center">
                  <span className="theme-text-primary font-semibold">
                    {formatCurrency(deal.value || 0)}
                  </span>
                  <span className="theme-text-tertiary text-xs">
                    {deal.probability || 0}% probability
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 theme-text-tertiary">
              <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No deals found for this contact</p>
              <p className="text-xs mt-1">Create a new deal to get started</p>
            </div>
          )}
        </div>
      </div>

      {/* AI Suggestions */}
      {nextActionsPendingCount > 0 && (
        <div className="section-card bg-gradient-to-br from-emerald-900/20 to-blue-900/20 border-emerald-500/20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              AI Suggestions
            </h2>
            <NextActionBadge
              count={nextActionsPendingCount}
              urgency={highUrgencyCount > 0 ? 'high' : 'medium'}
              onClick={() => setShowNextActionsPanel(true)}
              compact
              showIcon={false}
            />
          </div>

          <p className="theme-text-tertiary text-sm mb-3">
            {nextActionsPendingCount} AI-powered recommendation{nextActionsPendingCount !== 1 ? 's' : ''} based on recent interactions
          </p>

          <button
            onClick={() => setShowNextActionsPanel(true)}
            className="btn-outline w-full bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
          >
            <Sparkles className="w-4 h-4" />
            <span>View All Suggestions</span>
          </button>
        </div>
      )}

      {/* Recent Communications */}
      <div className="section-card">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-blue-400" />
          Recent Activity
        </h2>

        <div className="space-y-3">
          {activities.length > 0 ? (
            activities.slice(0, 5).map((activity) => {
              const { icon: Icon, color, bgColor, borderColor } = getActivityIcon(activity.type);
              return (
                <div key={activity.id} className="p-3 rounded-lg bg-gray-100/50 dark:bg-gray-800/50">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className={`${bgColor} ${color} ${borderColor} text-xs`}>
                        <Icon className="w-3 h-3 mr-1" />
                        {activity.type?.charAt(0).toUpperCase() + activity.type?.slice(1)}
                      </Badge>
                      <span className="theme-text-primary text-sm font-medium">
                        {activity.client_name || `${activity.type} activity`}
                      </span>
                    </div>
                    <span className="theme-text-tertiary text-xs">{formatDate(activity.date || activity.created_at)}</span>
                  </div>
                  {activity.details && (
                    <p className="theme-text-secondary text-sm mb-2">{activity.details}</p>
                  )}
                  {activity.deal_id && (
                    <p className="theme-text-tertiary text-xs">Related to deal</p>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 theme-text-tertiary">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No recent activity found</p>
              <p className="text-xs mt-1">Activities will appear here as they happen</p>
            </div>
          )}
        </div>
      </div>

      {/* AI Insights */}
      <div className="section-card bg-gradient-to-br from-purple-900/20 to-blue-900/20 border-purple-500/20">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          AI Insights
        </h2>

        <div className="space-y-3">
          {/* Dynamic insights based on real data */}
          {deals.length > 0 && (
            <div className="p-3 rounded-lg bg-green-500/15 border border-green-500/30">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                <div>
                  <p className="text-green-400 text-xs font-medium mb-1">OPPORTUNITY</p>
                  <p className="theme-text-primary text-sm">
                    {deals.length} active deal{deals.length > 1 ? 's' : ''} worth {formatCurrency(deals.reduce((sum, deal) => sum + (deal.value || 0), 0))}.
                    Great potential for expansion.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activities.length === 0 && (
            <div className="p-3 rounded-lg bg-yellow-500/15 border border-yellow-500/30">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-yellow-400 rounded-full mt-2 flex-shrink-0"></div>
                <div>
                  <p className="text-yellow-400 text-xs font-medium mb-1">ATTENTION</p>
                  <p className="theme-text-primary text-sm">No recent activity. Consider reaching out to maintain engagement.</p>
                </div>
              </div>
            </div>
          )}

          <div className="p-3 rounded-lg bg-blue-500/15 border border-blue-500/30">
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <p className="text-blue-400 text-xs font-medium mb-1">INSIGHT</p>
                <p className="theme-text-primary text-sm">
                  Contact shows {activities.length > 5 ? 'high' : activities.length > 2 ? 'moderate' : 'low'} engagement
                  with {activities.length} recent activities.
                </p>
              </div>
            </div>
          </div>

          <button className="btn-outline w-full mt-4">
            <TrendingUp className="w-4 h-4" />
            <span>Generate More Insights</span>
          </button>
        </div>
      </div>

      {/* Next-Action Suggestions Panel */}
      <NextActionPanel
        contactId={contact.id}
        isOpen={showNextActionsPanel}
        onClose={() => setShowNextActionsPanel(false)}
      />
    </div>
  );
} 