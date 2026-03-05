/**
 * AbmCampaignAnalytics
 *
 * LDI-004: ABM campaign analytics dashboard view.
 * Shows /t/ link campaign performance metrics, funnel visualization, and engagement tiers.
 * Accessible at /campaigns. Requires authentication (Supabase session).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  Users,
  Link2,
  Eye,
  TrendingUp,
  Target,
  ChevronUp,
  ChevronDown,
  Loader2,
  LogIn,
  RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CampaignVisitorRow {
  id: string;
  campaign_link_id: string;
  views_navigated: string[];
  signup_email: string | null;
  converted_at: string | null;
  engagement_score: number;
  created_at: string;
}

interface CampaignLinkRow {
  id: string;
  code: string;
  campaign_name: string | null;
  campaign_source: string | null;
  visitor_company: string;
  view_count: number;
  status: string;
  created_at: string;
  campaign_visitors: CampaignVisitorRow[];
}

interface CampaignStats {
  name: string;
  source: string;
  links: number;
  visitors: number;
  avgScore: number;
  conversions: number;
  ctr: number;
}

type SortField = 'name' | 'source' | 'links' | 'visitors' | 'avgScore' | 'conversions' | 'ctr';
type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function tierLabel(score: number): 'Low' | 'Medium' | 'High' | 'Hot' {
  if (score >= 51) return 'Hot';
  if (score >= 31) return 'High';
  if (score >= 11) return 'Medium';
  return 'Low';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CampaignAnalytics() {
  const [links, setLinks] = useState<CampaignLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(true);

  // Filters
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Sort
  const [sortField, setSortField] = useState<SortField>('visitors');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    if (!SUPABASE_URL || !ANON_KEY) {
      setError('Supabase credentials not configured.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // We need the user's access token for RLS. Try reading from localStorage (Supabase stores session there).
      const storageKey = Object.keys(localStorage).find(
        (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
      );
      const session = storageKey ? JSON.parse(localStorage.getItem(storageKey) || '{}') : null;
      const accessToken: string | undefined = session?.access_token;

      if (!accessToken) {
        setAuthed(false);
        setLoading(false);
        return;
      }

      // Build query params
      let query = `${SUPABASE_URL}/rest/v1/campaign_links?select=id,code,campaign_name,campaign_source,visitor_company,view_count,status,created_at,campaign_visitors(id,campaign_link_id,views_navigated,signup_email,converted_at,engagement_score,created_at)`;

      const filters: string[] = [];
      if (sourceFilter !== 'all') {
        filters.push(`campaign_source=eq.${encodeURIComponent(sourceFilter)}`);
      }
      if (dateFrom) {
        filters.push(`created_at=gte.${dateFrom}T00:00:00Z`);
      }
      if (dateTo) {
        filters.push(`created_at=lte.${dateTo}T23:59:59Z`);
      }

      if (filters.length) {
        query += '&' + filters.join('&');
      }

      const res = await fetch(query, {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (res.status === 401 || res.status === 403) {
        setAuthed(false);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError(`Failed to load campaigns (${res.status})`);
        setLoading(false);
        return;
      }

      const data: CampaignLinkRow[] = await res.json();
      setLinks(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------

  const allVisitors = useMemo(
    () => links.flatMap((l) => l.campaign_visitors),
    [links]
  );

  const sources = useMemo(() => {
    const s = new Set<string>();
    links.forEach((l) => {
      if (l.campaign_source) s.add(l.campaign_source);
    });
    return Array.from(s).sort();
  }, [links]);

  // Group by campaign_name
  const campaigns: CampaignStats[] = useMemo(() => {
    const map = new Map<string, { links: CampaignLinkRow[]; source: string }>();
    for (const l of links) {
      const key = l.campaign_name || '(unnamed)';
      if (!map.has(key)) {
        map.set(key, { links: [], source: l.campaign_source || '-' });
      }
      map.get(key)!.links.push(l);
    }

    return Array.from(map.entries()).map(([name, { links: cLinks, source }]) => {
      const visitors = cLinks.flatMap((l) => l.campaign_visitors);
      const totalScore = visitors.reduce((s, v) => s + v.engagement_score, 0);
      const conversions = visitors.filter((v) => v.converted_at).length;
      const totalViews = cLinks.reduce((s, l) => s + l.view_count, 0);
      return {
        name,
        source,
        links: cLinks.length,
        visitors: visitors.length,
        avgScore: visitors.length ? Math.round(totalScore / visitors.length) : 0,
        conversions,
        ctr: totalViews > 0 ? Math.round((visitors.length / totalViews) * 100) : 0,
      };
    });
  }, [links]);

  const sortedCampaigns = useMemo(() => {
    const sorted = [...campaigns];
    sorted.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return sorted;
  }, [campaigns, sortField, sortDir]);

  // Funnel
  const funnel = useMemo(() => {
    const total = allVisitors.length;
    const demoViewed = allVisitors.filter((v) => v.views_navigated && v.views_navigated.length > 0).length;
    const threePlus = allVisitors.filter((v) => v.views_navigated && v.views_navigated.length >= 3).length;
    const emailCaptured = allVisitors.filter((v) => v.signup_email).length;
    const signedUp = allVisitors.filter((v) => v.converted_at).length;
    return [
      { label: 'Link clicks', count: total },
      { label: 'Demo viewed', count: demoViewed },
      { label: '3+ panels', count: threePlus },
      { label: 'Email captured', count: emailCaptured },
      { label: 'Signed up', count: signedUp },
    ];
  }, [allVisitors]);

  // Engagement tiers
  const tiers = useMemo(() => {
    const counts = { Low: 0, Medium: 0, High: 0, Hot: 0 };
    for (const v of allVisitors) {
      counts[tierLabel(v.engagement_score)]++;
    }
    return counts;
  }, [allVisitors]);

  // Summary
  const totalConversions = allVisitors.filter((v) => v.converted_at).length;
  const avgEngagement = allVisitors.length
    ? Math.round(allVisitors.reduce((s, v) => s + v.engagement_score, 0) / allVisitors.length)
    : 0;
  const conversionRate = allVisitors.length
    ? ((totalConversions / allVisitors.length) * 100).toFixed(1)
    : '0.0';

  // -----------------------------------------------------------------------
  // Sort handler
  // -----------------------------------------------------------------------

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 inline ml-0.5" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 inline ml-0.5" />
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (!authed) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-5">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <LogIn className="w-5 h-5 text-violet-400" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Authentication required</h2>
          <p className="text-sm text-zinc-500 mb-6">
            Sign in to the 60 app to view your campaign analytics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Link
              to="/t/demo"
              className="text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to campaigns
            </Link>
            <div className="h-5 w-px bg-zinc-800" />
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-violet-400" />
              Campaign Analytics
            </h1>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-violet-500"
            >
              <option value="all">All sources</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="From"
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-violet-500"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="To"
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-violet-500"
            />

            <button
              onClick={fetchData}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-32">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : (
          <>
            {/* ---- Summary Cards ---- */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <SummaryCard
                icon={<Target className="w-4 h-4 text-violet-400" />}
                label="Campaigns"
                value={campaigns.length}
              />
              <SummaryCard
                icon={<Link2 className="w-4 h-4 text-blue-400" />}
                label="Total links"
                value={links.length}
              />
              <SummaryCard
                icon={<Users className="w-4 h-4 text-emerald-400" />}
                label="Total visitors"
                value={allVisitors.length}
              />
              <SummaryCard
                icon={<TrendingUp className="w-4 h-4 text-amber-400" />}
                label="Avg engagement"
                value={avgEngagement}
              />
              <SummaryCard
                icon={<Eye className="w-4 h-4 text-pink-400" />}
                label="Conversion rate"
                value={`${conversionRate}%`}
              />
            </div>

            {/* ---- Campaign Table ---- */}
            <section>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Campaigns
              </h2>
              {sortedCampaigns.length === 0 ? (
                <p className="text-zinc-600 text-sm py-8 text-center">No campaigns found.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-zinc-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-900/60 text-zinc-400 text-left">
                        {([
                          ['name', 'Name'],
                          ['source', 'Source'],
                          ['links', 'Links'],
                          ['visitors', 'Visitors'],
                          ['avgScore', 'Avg Score'],
                          ['conversions', 'Conversions'],
                          ['ctr', 'CTR'],
                        ] as [SortField, string][]).map(([field, label]) => (
                          <th
                            key={field}
                            className="px-4 py-3 font-medium cursor-pointer select-none hover:text-zinc-200 transition-colors whitespace-nowrap"
                            onClick={() => toggleSort(field)}
                          >
                            {label}
                            <SortIcon field={field} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {sortedCampaigns.map((c) => (
                        <tr key={c.name} className="hover:bg-zinc-900/40 transition-colors">
                          <td className="px-4 py-3 font-medium text-zinc-100">{c.name}</td>
                          <td className="px-4 py-3">
                            <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-zinc-800 text-zinc-400">
                              {c.source}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-300">{c.links}</td>
                          <td className="px-4 py-3 text-zinc-300">{c.visitors}</td>
                          <td className="px-4 py-3 text-zinc-300">{c.avgScore}</td>
                          <td className="px-4 py-3 text-zinc-300">{c.conversions}</td>
                          <td className="px-4 py-3 text-zinc-300">{c.ctr}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ---- Funnel + Engagement Tiers (side by side on large screens) ---- */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Funnel */}
              <section className="rounded-xl border border-zinc-800 p-5">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
                  Conversion Funnel
                </h2>
                <div className="space-y-3">
                  {funnel.map((stage, i) => {
                    const maxCount = funnel[0].count || 1;
                    const pct = Math.round((stage.count / maxCount) * 100);
                    return (
                      <div key={stage.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-zinc-300">
                            {i + 1}. {stage.label}
                          </span>
                          <span className="text-sm text-zinc-500">
                            {stage.count} ({pct}%)
                          </span>
                        </div>
                        <div className="h-6 bg-zinc-900 rounded-md overflow-hidden">
                          <div
                            className="h-full rounded-md transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              background: `linear-gradient(90deg, rgba(139,92,246,0.7) 0%, rgba(99,102,241,0.5) 100%)`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Engagement Tiers */}
              <section className="rounded-xl border border-zinc-800 p-5">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
                  Engagement Distribution
                </h2>
                <div className="space-y-3">
                  {(
                    [
                      { tier: 'Low', range: '1-10', color: 'bg-zinc-600' },
                      { tier: 'Medium', range: '11-30', color: 'bg-blue-500/70' },
                      { tier: 'High', range: '31-50', color: 'bg-violet-500/70' },
                      { tier: 'Hot', range: '51+', color: 'bg-amber-500/70' },
                    ] as const
                  ).map(({ tier, range, color }) => {
                    const count = tiers[tier];
                    const maxTier = Math.max(...Object.values(tiers), 1);
                    const pct = Math.round((count / maxTier) * 100);
                    return (
                      <div key={tier}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-zinc-300">
                            {tier}{' '}
                            <span className="text-zinc-600 text-xs">({range})</span>
                          </span>
                          <span className="text-sm text-zinc-500">{count}</span>
                        </div>
                        <div className="h-6 bg-zinc-900 rounded-md overflow-hidden">
                          <div
                            className={`h-full rounded-md transition-all duration-500 ${color}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-zinc-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-zinc-100">{value}</p>
    </div>
  );
}
