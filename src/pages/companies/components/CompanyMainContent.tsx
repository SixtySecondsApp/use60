import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { 
  BarChart3, 
  Heart, 
  Users, 
  Activity,
  FileText,
  DollarSign,
  Calendar,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Star,
  Building2,
  Mail,
  Phone,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TimelineView } from '@/components/CRM/TimelineView';
import type { ContactCompanyGraph } from '@/lib/hooks/useContactCompanyGraph';
import type { Company, Deal } from '@/lib/database/models';

interface CompanyMainContentProps {
  activeTab: 'overview' | 'deals' | 'contacts' | 'activities' | 'documents';
  company: Company;
  deals: Deal[];
  activities: any[];
  clients: any[];
  graph?: ContactCompanyGraph;
}

export function CompanyMainContent({ 
  activeTab, 
  company, 
  deals, 
  activities, 
  clients,
  graph
}: CompanyMainContentProps) {
  const navigate = useNavigate();
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', { 
      style: 'currency', 
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const getDealStatusColor = (status: CompanyDeal['status']) => {
    switch (status) {
      case 'won':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'in_progress':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'lost':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      default:
        return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
  };

  const getDealStatusIcon = (status: CompanyDeal['status']) => {
    switch (status) {
      case 'won':
        return CheckCircle;
      case 'in_progress':
        return Clock;
      case 'lost':
        return XCircle;
      default:
        return AlertCircle;
    }
  };

  const getActivityTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'sale':
        return DollarSign;
      case 'meeting':
        return Calendar;
      case 'call':
        return Phone;
      case 'email':
        return Mail;
      default:
        return Activity;
    }
  };

  const renderOverview = () => (
    <motion.div
      key="overview"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="theme-bg-card backdrop-blur-xl rounded-xl p-6 theme-border">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-medium theme-text-tertiary">Revenue Overview</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm theme-text-tertiary">Total Deals</span>
              <span className="text-sm font-medium theme-text-primary">{formatCurrency(company.total_deal_value || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm theme-text-tertiary">Won Deals</span>
              <span className="text-sm font-medium text-emerald-400">
                {formatCurrency(deals.filter(d => d.status === 'won').reduce((sum, d) => sum + d.value, 0))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm theme-text-tertiary">Monthly MRR</span>
              <span className="text-sm font-medium text-blue-400">
                {formatCurrency(deals.filter(d => d.status === 'won').reduce((sum, d) => sum + (d.monthly_mrr || 0), 0))}
              </span>
            </div>
          </div>
        </div>

        <div className="theme-bg-card backdrop-blur-xl rounded-xl p-6 theme-border">
          <div className="flex items-center gap-3 mb-4">
            <Heart className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-medium theme-text-tertiary">Deal Pipeline</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm theme-text-tertiary">Total Deals</span>
              <span className="text-sm font-medium theme-text-primary">{deals.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm theme-text-tertiary">Won</span>
              <span className="text-sm font-medium text-emerald-400">{deals.filter(d => d.status === 'won').length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm theme-text-tertiary">In Progress</span>
              <span className="text-sm font-medium text-blue-400">{deals.filter(d => d.status === 'in_progress').length}</span>
            </div>
          </div>
        </div>

        <div className="theme-bg-card backdrop-blur-xl rounded-xl p-6 theme-border">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-medium theme-text-tertiary">Activity Summary</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm theme-text-tertiary">Total Activities</span>
              <span className="text-sm font-medium theme-text-primary">{activities.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm theme-text-tertiary">Sales Activities</span>
              <span className="text-sm font-medium text-emerald-400">{activities.filter(a => a.type === 'sale').length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm theme-text-tertiary">Last 30 Days</span>
              <span className="text-sm font-medium text-blue-400">
                {activities.filter(a => {
                  const activityDate = new Date(a.date);
                  const thirtyDaysAgo = new Date();
                  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                  return activityDate >= thirtyDaysAgo;
                }).length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Company Intelligence (from enrichment) */}
      {company.enrichment_data && (
        <div className="theme-bg-card backdrop-blur-xl rounded-xl theme-border">
          <div className="p-6 border-b border-gray-200 dark:border-gray-800/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold theme-text-primary">Company Intelligence</h3>
            </div>
            {company.enriched_at && (
              <span className="text-xs theme-text-tertiary">
                Enriched {format(new Date(company.enriched_at), 'MMM d, yyyy')}
              </span>
            )}
          </div>
          <div className="p-6 space-y-5">
            {/* Description */}
            {company.enrichment_data.description && (
              <div>
                <p className="text-sm theme-text-secondary leading-relaxed">{company.enrichment_data.description}</p>
              </div>
            )}

            {/* Quick Facts */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {company.enrichment_data.employee_count && (
                <div className="p-3 rounded-lg bg-gray-100/50 dark:bg-gray-800/30">
                  <span className="text-xs theme-text-tertiary block">Employees</span>
                  <span className="text-sm font-medium theme-text-primary">{company.enrichment_data.employee_count}</span>
                </div>
              )}
              {company.enrichment_data.headquarters && (
                <div className="p-3 rounded-lg bg-gray-100/50 dark:bg-gray-800/30">
                  <span className="text-xs theme-text-tertiary block">Headquarters</span>
                  <span className="text-sm font-medium theme-text-primary">{company.enrichment_data.headquarters}</span>
                </div>
              )}
              {company.enrichment_data.founded_year && (
                <div className="p-3 rounded-lg bg-gray-100/50 dark:bg-gray-800/30">
                  <span className="text-xs theme-text-tertiary block">Founded</span>
                  <span className="text-sm font-medium theme-text-primary">{company.enrichment_data.founded_year}</span>
                </div>
              )}
              {company.enrichment_data.funding_status && (
                <div className="p-3 rounded-lg bg-gray-100/50 dark:bg-gray-800/30">
                  <span className="text-xs theme-text-tertiary block">Funding</span>
                  <span className="text-sm font-medium theme-text-primary">{company.enrichment_data.funding_status}</span>
                </div>
              )}
            </div>

            {/* Key People */}
            {company.enrichment_data.key_people?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium theme-text-primary mb-2">Key People</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {company.enrichment_data.key_people.slice(0, 6).map((person: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-100/50 dark:bg-gray-800/30">
                      <Users className="w-4 h-4 text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium theme-text-primary block truncate">{person.name}</span>
                        {person.title && <span className="text-xs theme-text-tertiary block truncate">{person.title}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Competitors */}
            {company.enrichment_data.competitors?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium theme-text-primary mb-2">Competitors</h4>
                <div className="flex flex-wrap gap-2">
                  {company.enrichment_data.competitors.slice(0, 8).map((comp: any, i: number) => (
                    <span key={i} className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 theme-text-secondary">
                      {typeof comp === 'string' ? comp : comp.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Recent News */}
            {company.enrichment_data.recent_news?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium theme-text-primary mb-2">Recent News</h4>
                <div className="space-y-2">
                  {company.enrichment_data.recent_news.slice(0, 3).map((news: any, i: number) => (
                    <div key={i} className="p-2 rounded-lg bg-gray-100/50 dark:bg-gray-800/30">
                      <span className="text-sm font-medium theme-text-primary">{typeof news === 'string' ? news : news.headline}</span>
                      {news.date && <span className="text-xs theme-text-tertiary ml-2">{news.date}</span>}
                      {news.summary && <p className="text-xs theme-text-tertiary mt-0.5">{news.summary}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Products & Growth Signals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {company.enrichment_data.products?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium theme-text-primary mb-2">Products</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {company.enrichment_data.products.slice(0, 6).map((p: any, i: number) => (
                      <span key={i} className="px-2 py-0.5 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                        {typeof p === 'string' ? p : p.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {company.enrichment_data.growth_indicators?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium theme-text-primary mb-2">Growth Signals</h4>
                  <div className="space-y-1">
                    {company.enrichment_data.growth_indicators.slice(0, 3).map((g: any, i: number) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span className="text-xs theme-text-secondary">{typeof g === 'string' ? g : g.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="theme-bg-card backdrop-blur-xl rounded-xl theme-border">
        <div className="p-6 border-b border-gray-200 dark:border-gray-800/50">
          <h3 className="text-lg font-semibold theme-text-primary">Recent Activity</h3>
        </div>
        <div className="p-6">
          {activities.length > 0 ? (
            <div className="space-y-4">
              {activities.slice(0, 5).map((activity, index) => {
                const Icon = getActivityTypeIcon(activity.type);
                return (
                  <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-100/50 dark:bg-gray-800/30">
                    <div className="w-8 h-8 rounded-lg bg-gray-200/50 dark:bg-gray-700/50 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium theme-text-primary capitalize">{activity.type}</span>
                        <span className="text-xs theme-text-tertiary">•</span>
                        <span className="text-xs theme-text-tertiary">{format(new Date(activity.date), 'MMM d, yyyy')}</span>
                      </div>
                      <p className="text-sm theme-text-tertiary">{activity.details || 'No details available'}</p>
                      {activity.amount && (
                        <p className="text-sm text-emerald-400 mt-1">{formatCurrency(activity.amount)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-500">
              No activities found for this company.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );

  const renderDeals = () => (
    <motion.div
      key="deals"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="theme-bg-card backdrop-blur-xl rounded-xl theme-border">
        <div className="p-6 border-b border-gray-200 dark:border-gray-800/50">
          <h3 className="text-lg font-semibold theme-text-primary">Deals ({deals.length})</h3>
        </div>
        <div className="p-6">
          {deals.length > 0 ? (
            <div className="space-y-4">
              {deals.map((deal) => {
                const stageName = (deal.deal_stages as any)?.name || 'Unknown Stage';
                const StatusIcon = getDealStatusIcon(deal.status as any);
                return (
                  <div
                    key={deal.id}
                    className="p-4 rounded-lg bg-gray-100/50 dark:bg-gray-800/30 border border-gray-300 dark:border-gray-700/50 hover:border-gray-400 dark:hover:border-gray-600/50 hover:bg-gray-200/50 dark:hover:bg-gray-800/50 transition-all cursor-pointer group"
                    onClick={() => navigate(`/crm/deals/${deal.id}`)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-lg font-medium theme-text-primary mb-1 group-hover:text-blue-400 transition-colors">{deal.name}</h4>
                          <ExternalLink className="w-4 h-4 text-gray-500 dark:text-gray-500 group-hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100" />
                        </div>
                        <p className="text-sm theme-text-tertiary">Stage: {stageName}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold theme-text-primary mb-1">{formatCurrency(deal.value || 0)}</div>
                        <div className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                          getDealStatusColor(deal.status as any)
                        )}>
                          <StatusIcon className="w-3 h-3" />
                          {deal.status.replace('_', ' ')}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      {deal.monthly_mrr && (
                        <div className="flex justify-between">
                          <span className="theme-text-tertiary">Monthly MRR:</span>
                          <span className="text-blue-400 font-medium">{formatCurrency(deal.monthly_mrr)}</span>
                        </div>
                      )}
                      {deal.one_off_revenue && (
                        <div className="flex justify-between">
                          <span className="theme-text-tertiary">One-off:</span>
                          <span className="text-emerald-400 font-medium">{formatCurrency(deal.one_off_revenue)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="theme-text-tertiary">Created:</span>
                        <span className="theme-text-primary">{format(new Date(deal.created_at), 'MMM d, yyyy')}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-500">
              No deals found for this company.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );

  const renderActivities = () => (
    <motion.div
      key="activities"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="theme-bg-card backdrop-blur-xl rounded-xl theme-border">
        <div className="p-6 border-b border-gray-200 dark:border-gray-800/50">
          <h3 className="text-lg font-semibold theme-text-primary">Activity Timeline</h3>
          <p className="text-sm theme-text-tertiary mt-1">
            All activities, meetings, leads, deals, and tasks for this company
          </p>
        </div>
        <div className="p-6">
          <TimelineView
            type="company"
            id={company.id}
            onItemClick={(item) => {
              // Navigate to detail page based on item type
              if (item.dealId) {
                window.location.href = `/crm/deals/${item.dealId}`;
              } else if (item.meetingId) {
                window.location.href = `/meetings/${item.meetingId}`;
              } else if (item.contactId) {
                window.location.href = `/crm/contacts/${item.contactId}`;
              }
            }}
          />
        </div>
      </div>
    </motion.div>
  );

  const renderContacts = () => (
    <motion.div
      key="contacts"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="theme-bg-card backdrop-blur-xl rounded-xl theme-border">
        <div className="p-6 border-b border-gray-200 dark:border-gray-800/50">
          <h3 className="text-lg font-semibold theme-text-primary">Contacts</h3>
        </div>
        <div className="p-6">
          {company.primary_contact ? (
            <div
              className="p-4 rounded-lg bg-gray-100/50 dark:bg-gray-800/30 border border-gray-300 dark:border-gray-700/50 hover:border-gray-400 dark:hover:border-gray-600/50 hover:bg-gray-200/50 dark:hover:bg-gray-800/50 transition-all cursor-pointer group"
              onClick={() => navigate(`/crm/contacts?search=${encodeURIComponent(company.primary_contact || '')}`)}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <span className="text-sm font-medium text-emerald-500">
                    {company.primary_contact.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-lg font-medium theme-text-primary mb-1 group-hover:text-emerald-400 transition-colors">{company.primary_contact}</h4>
                    <ExternalLink className="w-4 h-4 text-gray-500 dark:text-gray-500 group-hover:text-emerald-400 transition-colors opacity-0 group-hover:opacity-100" />
                  </div>
                  <p className="text-sm theme-text-tertiary mb-3">Primary Contact • Click to view in contacts</p>
                  <div className="space-y-2">
                    {company.primary_email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-500 dark:text-gray-500" />
                        <a
                          href={`mailto:${company.primary_email}`}
                          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {company.primary_email}
                        </a>
                      </div>
                    )}
                    {company.primary_phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-500 dark:text-gray-500" />
                        <a
                          href={`tel:${company.primary_phone}`}
                          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {company.primary_phone}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-500">
              No contacts found for this company.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );

  const renderDocuments = () => (
    <motion.div
      key="documents"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="theme-bg-card backdrop-blur-xl rounded-xl theme-border">
        <div className="p-6 border-b border-gray-200 dark:border-gray-800/50">
          <h3 className="text-lg font-semibold theme-text-primary">Documents</h3>
        </div>
        <div className="p-6">
          <div className="text-center py-8 text-gray-500 dark:text-gray-500">
            Document management coming soon.
          </div>
        </div>
      </div>
    </motion.div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverview();
      case 'deals':
        return renderDeals();
      case 'contacts':
        return renderContacts();
      case 'activities':
        return renderActivities();
      case 'documents':
        return renderDocuments();
      default:
        return renderOverview();
    }
  };

  return (
    <AnimatePresence mode="wait">
      {renderContent()}
    </AnimatePresence>
  );
}