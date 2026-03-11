/**
 * RelationshipHealthDashboard Component
 *
 * Main dashboard for the Relationship Health Monitor feature.
 * Provides a comprehensive view of all relationship health metrics,
 * ghost risks, intervention opportunities, and actionable insights.
 */

import { useState, useMemo, useEffect } from 'react';
import {
  useAllRelationshipsHealth,
  useGhostRisks,
  useInterventionAnalytics,
} from '@/lib/hooks/useRelationshipHealth';
import { HealthScoreBadge } from './HealthScoreBadge';
import { InterventionAlertCard } from './InterventionAlertCard';
import { GhostDetectionPanel } from './GhostDetectionPanel';
import { InterventionModal } from './InterventionModal';
import { TemplateLibrary } from './TemplateLibrary';
import { RelationshipTimeline } from './RelationshipTimeline';
import { RelationshipDetailModal } from './RelationshipDetailModal';
import { RelationshipAvatar } from './RelationshipAvatar';
import { SentimentBadge, RelationshipStrengthBadge } from '@/components/health/SentimentAndRelationshipBadges';
import type { RelationshipHealthScore } from '@/lib/services/relationshipHealthService';
import type { GhostRiskAssessment } from '@/lib/services/ghostDetectionService';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Users,
  Send,
  BarChart3,
  Settings,
  Filter,
  Search,
  ArrowUp,
  ArrowDown,
  Clock,
  Target,
  RefreshCw,
  Building2,
  User,
} from 'lucide-react';

interface RelationshipHealthDashboardProps {
  userId: string;
}

type ViewMode = 'overview' | 'at-risk' | 'interventions' | 'templates' | 'analytics';
type SortOption = 'health' | 'risk' | 'recent' | 'value';
type EntityFilter = 'all' | 'contacts' | 'companies';

export function RelationshipHealthDashboard({ userId }: RelationshipHealthDashboardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [sortBy, setSortBy] = useState<SortOption>('health');
  const [searchQuery, setSearchQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
  const [selectedRelationship, setSelectedRelationship] = useState<RelationshipHealthScore | null>(null);
  const [selectedGhostRisk, setSelectedGhostRisk] = useState<GhostRiskAssessment | null>(null);
  const [showInterventionModal, setShowInterventionModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [relationshipNames, setRelationshipNames] = useState<Record<string, { name: string; type: 'contact' | 'company'; email?: string; domain?: string }>>({});

  // Fetch data
  const { healthScores: relationships, loading: loadingRelationships, calculateAllHealth } = useAllRelationshipsHealth();
  const { ghostRisks, loading: loadingGhosts } = useGhostRisks();
  const { analytics } = useInterventionAnalytics(30);
  const [calculating, setCalculating] = useState(false);

  // Fetch contact/company names and domains for relationships
  useEffect(() => {
    if (!relationships || relationships.length === 0) return;

    const fetchNames = async () => {
      const names: Record<string, { name: string; type: 'contact' | 'company'; email?: string; domain?: string }> = {};
      
      // Get unique contact IDs
      const contactIds = [...new Set(relationships.filter(r => r.contact_id).map(r => r.contact_id!))];
      // Get unique company IDs
      const companyIds = [...new Set(relationships.filter(r => r.company_id).map(r => r.company_id!))];

      // Fetch contacts
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, email, full_name, company_id, companies:company_id(website)')
          .in('id', contactIds);

        contacts?.forEach(contact => {
          const name = contact.full_name || 
                      (contact.first_name && contact.last_name ? `${contact.first_name} ${contact.last_name}` : 
                       contact.first_name || contact.last_name || contact.email || 'Unknown');
          const email = contact.email || '';
          const domain = email ? email.split('@')[1] : (contact.companies as any)?.website || null;
          names[contact.id] = { name, type: 'contact', email, domain };
        });
      }

      // Fetch companies
      if (companyIds.length > 0) {
        const { data: companies } = await supabase
          .from('companies')
          .select('id, name, website')
          .in('id', companyIds);

        companies?.forEach(company => {
          const domain = company.website ? company.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] : null;
          names[company.id] = { name: company.name || 'Unknown Company', type: 'company', domain };
        });
      }

      setRelationshipNames(names);
    };

    fetchNames();
  }, [relationships]);

  // Calculate summary stats
  const stats = useMemo(() => {
    if (!relationships) {
      return {
        total: 0,
        healthy: 0,
        atRisk: 0,
        critical: 0,
        ghost: 0,
        avgScore: 0,
      };
    }

    const total = relationships.length;
    const healthy = relationships.filter((r) => r.health_status === 'healthy').length;
    const atRisk = relationships.filter((r) => r.health_status === 'at_risk').length;
    const critical = relationships.filter((r) => r.health_status === 'critical').length;
    const ghost = relationships.filter((r) => r.health_status === 'ghost').length;
    const avgScore = total > 0
      ? Math.round(relationships.reduce((sum, r) => sum + r.overall_health_score, 0) / total)
      : 0;

    return { total, healthy, atRisk, critical, ghost, avgScore };
  }, [relationships]);

  // Filter and sort relationships
  const filteredRelationships = useMemo(() => {
    if (!relationships) return [];

    let filtered = relationships;

    // Filter by entity type (contacts vs companies)
    if (entityFilter === 'contacts') {
      filtered = filtered.filter((r) => !!r.contact_id);
    } else if (entityFilter === 'companies') {
      filtered = filtered.filter((r) => !!r.company_id && !r.contact_id);
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((r) => {
        const id = r.contact_id || r.company_id || '';
        const nameInfo = relationshipNames[id];
        if (nameInfo) {
          return nameInfo.name.toLowerCase().includes(query);
        }
        return id.toLowerCase().includes(query);
      });
    }

    // Filter by view mode
    if (viewMode === 'at-risk') {
      filtered = filtered.filter((r) => ['at_risk', 'critical', 'ghost'].includes(r.health_status));
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'health') {
        return a.overall_health_score - b.overall_health_score; // Lowest first
      } else if (sortBy === 'risk') {
        const statusOrder = { ghost: 0, critical: 1, at_risk: 2, healthy: 3 };
        return statusOrder[a.health_status] - statusOrder[b.health_status];
      } else if (sortBy === 'recent') {
        return new Date(b.last_calculated_at).getTime() - new Date(a.last_calculated_at).getTime();
      }
      return 0;
    });

    return filtered;
  }, [relationships, searchQuery, viewMode, sortBy, entityFilter]);

  // Helper to create a basic GhostRiskAssessment from RelationshipHealthScore
  const createGhostRiskAssessment = (relationship: RelationshipHealthScore): GhostRiskAssessment => {
    return {
      isGhostRisk: relationship.is_ghost_risk,
      ghostProbabilityPercent: relationship.ghost_probability_percent || 0,
      daysUntilPredictedGhost: relationship.days_until_predicted_ghost,
      signals: [], // Will be loaded when needed
      highestSeverity: relationship.risk_level === 'critical' ? 'critical' : 
                      relationship.risk_level === 'high' ? 'high' :
                      relationship.risk_level === 'medium' ? 'medium' : 'low',
      recommendedAction: relationship.health_status === 'ghost' ? 'urgent' :
                        relationship.health_status === 'critical' ? 'intervene_now' :
                        relationship.health_status === 'at_risk' ? 'intervene_soon' : 'monitor',
      contextTrigger: null,
    };
  };

  const handleSendIntervention = (relationshipHealth: RelationshipHealthScore) => {
    setSelectedRelationship(relationshipHealth);
    setSelectedGhostRisk(createGhostRiskAssessment(relationshipHealth));
    setShowInterventionModal(true);
  };

  if (loadingRelationships || loadingGhosts) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Relationship Health Monitor</h1>
          <p className="text-gray-400 mt-1">
            AI-powered early warning system for relationship decay
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setCalculating(true);
              await calculateAllHealth();
              setCalculating(false);
            }}
            disabled={calculating || loadingRelationships}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Calculate health scores for all your contacts"
          >
            <RefreshCw className={`w-4 h-4 ${calculating ? 'animate-spin' : ''}`} />
            {calculating ? 'Calculating...' : 'Calculate Health Scores'}
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-white/5 text-gray-300 rounded-lg hover:bg-white/10 transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Relationships"
          value={stats.total}
          icon={Users}
          color="blue"
        />
        <StatCard
          label="Healthy"
          value={stats.healthy}
          icon={CheckCircle2}
          color="green"
          percentage={stats.total > 0 ? Math.round((stats.healthy / stats.total) * 100) : 0}
        />
        <StatCard
          label="At Risk"
          value={stats.atRisk}
          icon={AlertTriangle}
          color="yellow"
          percentage={stats.total > 0 ? Math.round((stats.atRisk / stats.total) * 100) : 0}
        />
        <StatCard
          label="Critical"
          value={stats.critical}
          icon={TrendingDown}
          color="orange"
          percentage={stats.total > 0 ? Math.round((stats.critical / stats.total) * 100) : 0}
        />
        <StatCard
          label="Ghost"
          value={stats.ghost}
          icon={Activity}
          color="red"
          percentage={stats.total > 0 ? Math.round((stats.ghost / stats.total) * 100) : 0}
        />
      </div>

      {/* Intervention Performance */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard
            label="Interventions Sent"
            value={analytics.sent}
            icon={Send}
            color="blue"
          />
          <MetricCard
            label="Response Rate"
            value={`${analytics.responseRate}%`}
            icon={Target}
            color="green"
            trend={analytics.responseRate > 40 ? 'up' : 'down'}
          />
          <MetricCard
            label="Recovery Rate"
            value={`${analytics.recoveryRate}%`}
            icon={CheckCircle2}
            color="purple"
            trend={analytics.recoveryRate > 30 ? 'up' : 'down'}
          />
          <MetricCard
            label="Replied"
            value={analytics.replied}
            icon={BarChart3}
            color="orange"
          />
        </div>
      )}

      {/* Entity Filter + View Mode Tabs */}
      <div className="flex items-center justify-between border-b border-white/10">
        {/* Simple entity toggle — matches contacts view style */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800/50 rounded-lg p-1 mr-4">
          <button
            onClick={() => setEntityFilter('all')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all duration-200 ${
              entityFilter === 'all'
                ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setEntityFilter('contacts')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all duration-200 flex items-center gap-1 ${
              entityFilter === 'contacts'
                ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <User className="w-3 h-3" />
            Contacts
          </button>
          <button
            onClick={() => setEntityFilter('companies')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all duration-200 flex items-center gap-1 ${
              entityFilter === 'companies'
                ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Building2 className="w-3 h-3" />
            Companies
          </button>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10">
        <TabButton
          active={viewMode === 'overview'}
          onClick={() => setViewMode('overview')}
          icon={Activity}
        >
          Overview
        </TabButton>
        <TabButton
          active={viewMode === 'at-risk'}
          onClick={() => setViewMode('at-risk')}
          icon={AlertTriangle}
          badge={stats.atRisk + stats.critical + stats.ghost}
        >
          At Risk
        </TabButton>
        <TabButton
          active={viewMode === 'interventions'}
          onClick={() => setViewMode('interventions')}
          icon={Send}
        >
          Interventions
        </TabButton>
        <TabButton
          active={viewMode === 'templates'}
          onClick={() => setViewMode('templates')}
          icon={BarChart3}
        >
          Templates
        </TabButton>
        <TabButton
          active={viewMode === 'analytics'}
          onClick={() => setViewMode('analytics')}
          icon={TrendingDown}
        >
          Analytics
        </TabButton>
      </div>

      {/* Overview View */}
      {viewMode === 'overview' && (
        <div className="space-y-6">
          {/* Critical Alerts */}
          {ghostRisks && ghostRisks.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                Urgent: Relationships at Risk ({ghostRisks.length})
              </h2>
              <div className="space-y-3">
                {ghostRisks.slice(0, 5).map((relationship) => {
                  const ghostRisk = createGhostRiskAssessment(relationship);
                  const relationshipId = relationship.contact_id || relationship.company_id || '';
                  const nameInfo = relationshipNames[relationshipId];
                  return (
                    <InterventionAlertCard
                      key={relationship.id}
                      relationshipHealth={relationship}
                      ghostRisk={ghostRisk}
                      contactName={nameInfo?.name || relationshipId || 'Unknown'}
                      onSendIntervention={() => handleSendIntervention(relationship)}
                      onSnooze={() => {}}
                      onMarkHandled={() => {}}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Search and Filter */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search relationships..."
                className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="health">Sort by Health (Lowest)</option>
              <option value="risk">Sort by Risk (Highest)</option>
              <option value="recent">Sort by Recent</option>
            </select>
          </div>

          {/* Relationship List */}
          {filteredRelationships.length === 0 ? (
            <div className="text-center py-12 bg-white/5 border border-white/10 rounded-lg">
              <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-lg mb-2">
                {relationships.length === 0 
                  ? 'No relationship health scores found'
                  : 'No relationships match your filters'}
              </p>
              {relationships.length === 0 && (
                <p className="text-sm text-gray-500 mb-4">
                  Click "Calculate Health Scores" above to analyze your contacts and generate health scores.
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredRelationships.map((relationship) => {
                const relationshipId = relationship.contact_id || relationship.company_id || '';
                const nameInfo = relationshipNames[relationshipId];
                return (
                  <RelationshipCard
                    key={relationship.id}
                    relationship={relationship}
                    relationshipName={nameInfo?.name}
                    relationshipInfo={nameInfo}
                    onClick={() => {
                      setSelectedRelationship(relationship);
                      setShowDetailModal(true);
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* At Risk View */}
      {viewMode === 'at-risk' && (
        <div className="space-y-4">
          <p className="text-gray-400">
            Showing {filteredRelationships.length} relationships requiring attention
          </p>
          <div className="space-y-3">
            {ghostRisks?.map((relationship) => {
              const ghostRisk = createGhostRiskAssessment(relationship);
              const relationshipId = relationship.contact_id || relationship.company_id || '';
              const nameInfo = relationshipNames[relationshipId];
              return (
                <InterventionAlertCard
                  key={relationship.id}
                  relationshipHealth={relationship}
                  ghostRisk={ghostRisk}
                  contactName={nameInfo?.name || relationshipId || 'Unknown'}
                  onSendIntervention={() => handleSendIntervention(relationship)}
                  onSnooze={() => {}}
                  onMarkHandled={() => {}}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Templates View */}
      {viewMode === 'templates' && (
        <TemplateLibrary />
      )}

      {/* Analytics View */}
      {viewMode === 'analytics' && (
        <div className="space-y-6">
          <div className="text-center py-12 bg-white/5 border border-white/10 rounded-lg">
            <BarChart3 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">Analytics view coming soon</p>
            <p className="text-sm text-gray-500 mt-1">
              Detailed performance metrics and trends
            </p>
          </div>
        </div>
      )}

      {/* Intervention Modal */}
      {showInterventionModal && selectedRelationship && selectedGhostRisk && (
        <InterventionModal
          isOpen={showInterventionModal}
          onClose={() => {
            setShowInterventionModal(false);
            setSelectedRelationship(null);
            setSelectedGhostRisk(null);
          }}
          relationshipHealth={selectedRelationship}
          ghostRisk={selectedGhostRisk}
          personalizedTemplate={null} // Will be fetched inside modal
          onSendIntervention={async () => {
            // Handle intervention sending
            setShowInterventionModal(false);
          }}
        />
      )}

      {/* Relationship Detail Modal */}
      {showDetailModal && selectedRelationship && user && (
        <RelationshipDetailModal
          relationship={selectedRelationship}
          relationshipName={relationshipNames[selectedRelationship.contact_id || selectedRelationship.company_id || '']?.name || 'Unknown'}
          relationshipInfo={relationshipNames[selectedRelationship.contact_id || selectedRelationship.company_id || '']}
          userId={user.id}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedRelationship(null);
          }}
          onViewContact={() => {
            if (selectedRelationship.contact_id) {
              navigate(`/crm/contacts/${selectedRelationship.contact_id}`);
            }
          }}
          onViewCompany={() => {
            if (selectedRelationship.company_id) {
              navigate(`/crm/companies/${selectedRelationship.company_id}`);
            }
          }}
        />
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'yellow' | 'orange' | 'red';
  percentage?: number;
}

function StatCard({ label, value, icon: Icon, color, percentage }: StatCardProps) {
  const colors = {
    blue: 'bg-blue-500/10 text-blue-400',
    green: 'bg-green-500/10 text-green-400',
    yellow: 'bg-yellow-500/10 text-yellow-400',
    orange: 'bg-orange-500/10 text-orange-400',
    red: 'bg-red-500/10 text-red-400',
  };

  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="flex items-end justify-between">
        <p className="text-2xl font-bold text-white">{value}</p>
        {percentage !== undefined && (
          <span className="text-sm text-gray-400">{percentage}%</span>
        )}
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'purple' | 'orange';
  trend?: 'up' | 'down';
}

function MetricCard({ label, value, icon: Icon, color, trend }: MetricCardProps) {
  const colors = {
    blue: 'text-blue-400',
    green: 'text-green-400',
    purple: 'text-purple-400',
    orange: 'text-orange-400',
  };

  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${colors[color]}`} />
        <span className="text-sm text-gray-400">{label}</span>
      </div>
      <div className="flex items-end justify-between">
        <p className="text-2xl font-bold text-white">{value}</p>
        {trend && (
          <span className={trend === 'up' ? 'text-green-400' : 'text-red-400'}>
            {trend === 'up' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
          </span>
        )}
      </div>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  badge?: number;
  children: React.ReactNode;
}

function TabButton({ active, onClick, icon: Icon, badge, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
        active
          ? 'border-blue-500 text-white'
          : 'border-transparent text-gray-400 hover:text-gray-300'
      }`}
    >
      <Icon className="w-4 h-4" />
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

interface RelationshipCardProps {
  relationship: RelationshipHealthScore;
  onClick: () => void;
  relationshipName?: string;
  relationshipInfo?: { name: string; type: 'contact' | 'company'; email?: string; domain?: string };
}

function RelationshipCard({ relationship, onClick, relationshipName, relationshipInfo }: RelationshipCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full p-4 bg-white/5 border border-white/10 rounded-lg hover:bg-white/[0.07] transition-colors text-left"
    >
      <div className="flex items-start gap-3 mb-3">
        {/* Avatar/Logo */}
        <div className="flex-shrink-0">
          <RelationshipAvatar
            name={relationshipName || 'Unknown'}
            type={relationship.relationship_type}
            domain={relationshipInfo?.domain}
            email={relationshipInfo?.email}
            size="md"
          />
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold mb-1 truncate">
            {relationshipName || relationship.contact_id || relationship.company_id || 'Unknown'}
          </h3>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <p className="text-sm text-gray-400">
              {relationship.relationship_type === 'contact' ? 'Contact' : 'Company'}
            </p>
            {/* Sentiment badge */}
            <SentimentBadge 
              sentimentScore={relationship.sentiment_score}
              sentimentTrend={relationship.sentiment_trend}
              size="sm"
            />
            {/* Relationship strength badge */}
            <RelationshipStrengthBadge
              engagementScore={relationship.engagement_quality_score}
              communicationScore={relationship.communication_frequency_score}
              daysSinceLastContact={relationship.days_since_last_contact}
              size="sm"
            />
          </div>
        </div>
        <HealthScoreBadge
          score={relationship.overall_health_score}
          status={relationship.health_status}
          trend={relationship.sentiment_trend === 'improving' ? 'improving' :
                 relationship.sentiment_trend === 'declining' ? 'declining' : 'stable'}
          size="sm"
        />
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-gray-400 text-xs mb-1">Communication</p>
          <p className="text-white font-medium">
            {relationship.communication_frequency_score || 0}
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs mb-1">Response</p>
          <p className="text-white font-medium">
            {relationship.response_behavior_score || 0}
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs mb-1">Engagement</p>
          <p className="text-white font-medium">
            {relationship.engagement_quality_score || 0}
          </p>
        </div>
      </div>

      {relationship.days_since_last_contact !== null && (
        <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 text-xs text-gray-400">
          <Clock className="w-3 h-3" />
          Last contact: {relationship.days_since_last_contact} days ago
        </div>
      )}
    </button>
  );
}
