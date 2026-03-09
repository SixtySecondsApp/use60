/**
 * AbmCampaignsPage
 *
 * Unified page for managing personalized /t/{code} campaign links.
 * Two tabs: Manage (create + list) and Analytics (metrics + funnel).
 * Platform admin route at /platform/abm-campaigns.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Link2,
  Plus,
  Copy,
  Check,
  ExternalLink,
  Users,
  Eye,
  Sparkles,
  Upload,
  X,
  FileText,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clipboard,
  BarChart3,
  ArrowLeft,
  AlertTriangle,
  FileUp,
  Target,
  TrendingUp,
  RefreshCw,
  Loader2,
  Crosshair,
  Trash2,
  Search,
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CampaignLink {
  code: string;
  company: string;
  url: string;
  status: string;
  visitor_first_name?: string;
  visitor_last_name?: string;
  visitor_email?: string;
  visitor_title?: string;
}

interface ProspectRow {
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  company: string;
  domain: string;
}

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

interface FlatLink {
  id: string;
  code: string;
  campaign_name: string | null;
  campaign_source: string | null;
  visitor_company: string;
  visitor_first_name: string | null;
  visitor_last_name: string | null;
  visitor_email: string | null;
  visitor_title: string | null;
  view_count: number;
  status: string;
  created_at: string;
  engagement_score: number;
  conversions: number;
}

type SortField = 'name' | 'source' | 'links' | 'visitors' | 'avgScore' | 'conversions' | 'ctr';
type LinkSortField = 'visitor_company' | 'campaign_name' | 'view_count' | 'engagement_score' | 'created_at';
type SortDir = 'asc' | 'desc';
type ManagerView = 'table' | 'create' | 'results';

interface BatchProgress {
  totalBatches: number;
  completedBatches: number;
  totalProspects: number;
  enrichedCount: number;
  failedCount: number;
  isRunning: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL) as string;
const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY) as string;

const SOURCES = [
  { value: 'email', label: 'Email' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'event', label: 'Event' },
  { value: 'referral', label: 'Referral' },
  { value: 'paid', label: 'Paid' },
  { value: 'other', label: 'Other' },
] as const;

const CSV_PLACEHOLDER = `email,first_name,last_name,company,title,domain
jane@acme.com,Jane,Doe,Acme Inc,VP Sales,acme.com
bob@globex.com,Bob,Smith,Globex Corp,CRO,globex.com`;

const BATCH_SIZE = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): ProspectRow[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes('email') || firstLine.includes('first_name') || firstLine.includes('company') || firstLine.includes('domain');
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const headers = hasHeader
    ? splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'))
    : ['email', 'first_name', 'last_name', 'company', 'title', 'domain'];
  const colIndex = (name: string): number => headers.indexOf(name);

  return dataLines
    .map((line) => {
      const cols = splitCsvLine(line);
      const get = (name: string): string => { const i = colIndex(name); return i >= 0 && i < cols.length ? cols[i] : ''; };
      const company = get('company');
      const domain = get('domain') || (get('email').includes('@') ? get('email').split('@')[1] : '');
      // Need at least company or domain
      if (!company && !domain) return null;
      return {
        first_name: get('first_name'), last_name: get('last_name'),
        email: get('email'), title: get('title'),
        company: company || (domain ? domain.replace(/^www\./, '').split('.')[0].replace(/^\w/, c => c.toUpperCase()) : ''),
        domain,
      } satisfies ProspectRow;
    })
    .filter(Boolean) as ProspectRow[];
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

const CAMPAIGN_LINK_BASE = 'https://www.use60.com';

function generateLinkUrl(code: string): string {
  return `${CAMPAIGN_LINK_BASE}/t/${code}`;
}

function tierLabel(score: number): 'Low' | 'Medium' | 'High' | 'Hot' {
  if (score >= 51) return 'Hot';
  if (score >= 31) return 'High';
  if (score >= 11) return 'Medium';
  return 'Low';
}

const inputCls = 'px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all';

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function AbmCampaignsPage() {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [activeTab, setActiveTab] = useState<'manage' | 'analytics'>('manage');

  return (
    <div className="px-6 py-6 space-y-6">
      <Helmet><title>ABM Campaigns | 60</title></Helmet>

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/10 border border-violet-500/20 flex items-center justify-center">
            <Crosshair className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">ABM Campaign Links</h1>
            <p className="text-xs text-zinc-500 mt-0.5">Create personalized <code className="text-zinc-400 bg-white/[0.04] px-1 py-0.5 rounded text-[10px]">/t/</code> demo links and track engagement</p>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-white/[0.03] border border-white/[0.06] rounded-lg">
          {(['manage', 'analytics'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === tab
                  ? 'bg-white/[0.08] text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab === 'manage' ? 'Manage' : 'Analytics'}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'manage' && accessToken && <ManageTab supabaseUrl={SUPABASE_URL} authToken={accessToken} />}
      {activeTab === 'analytics' && accessToken && <AnalyticsTab accessToken={accessToken} />}
      {!accessToken && (
        <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 p-16 text-center">
          <Loader2 className="w-5 h-5 text-zinc-600 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-zinc-500">Authenticating...</p>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// MANAGE TAB
// ===========================================================================

function ManageTab({ supabaseUrl, authToken }: { supabaseUrl: string; authToken: string }) {
  const [view, setView] = useState<ManagerView>('table');

  // ── Table state ──
  const [allLinks, setAllLinks] = useState<FlatLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [linkFilter, setLinkFilter] = useState('');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [linkSort, setLinkSort] = useState<LinkSortField>('created_at');
  const [linkSortDir, setLinkSortDir] = useState<SortDir>('desc');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [deletingLink, setDeletingLink] = useState<string | null>(null);
  const [confirmDeleteLink, setConfirmDeleteLink] = useState<string | null>(null);

  // ── Create state ──
  const [campaignName, setCampaignName] = useState('');
  const [source, setSource] = useState('email');
  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const [csvText, setCsvText] = useState('');
  const [showCsvInput, setShowCsvInput] = useState(false);
  const [results, setResults] = useState<CampaignLink[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [bulkCopied, setBulkCopied] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  const [showDomainPreview, setShowDomainPreview] = useState(false);
  const [newProspect, setNewProspect] = useState<ProspectRow>({
    first_name: '', last_name: '', email: '', title: '', company: '', domain: '',
  });

  // ── Fetch all links flat ──
  const fetchLinks = useCallback(async () => {
    setLoadingLinks(true);
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/campaign_links?select=id,code,campaign_name,campaign_source,visitor_company,visitor_first_name,visitor_last_name,visitor_email,visitor_title,view_count,status,created_at,campaign_visitors(engagement_score,converted_at)&order=created_at.desc`,
        { headers: { apikey: ANON_KEY, Authorization: `Bearer ${authToken}` } }
      );
      if (!response.ok) { setAllLinks([]); return; }
      const data = await response.json();
      const links: FlatLink[] = data.map((row: CampaignLinkRow & { visitor_company: string; visitor_first_name: string | null; visitor_last_name: string | null; visitor_email: string | null; visitor_title: string | null }) => {
        const visitors = row.campaign_visitors || [];
        const topScore = visitors.length > 0 ? Math.max(...visitors.map((v: CampaignVisitorRow) => v.engagement_score)) : 0;
        const conversions = visitors.filter((v: CampaignVisitorRow) => v.converted_at).length;
        return {
          id: row.id,
          code: row.code,
          campaign_name: row.campaign_name,
          campaign_source: row.campaign_source,
          visitor_company: row.visitor_company,
          visitor_first_name: row.visitor_first_name,
          visitor_last_name: row.visitor_last_name,
          visitor_email: row.visitor_email,
          visitor_title: row.visitor_title,
          view_count: row.view_count,
          status: row.status,
          created_at: row.created_at,
          engagement_score: topScore,
          conversions,
        };
      });
      setAllLinks(links);
    } catch { setAllLinks([]); }
    finally { setLoadingLinks(false); }
  }, [supabaseUrl, authToken]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  // ── Derived data ──
  const campaignNames = useMemo(() => {
    const names = new Set<string>();
    for (const l of allLinks) { if (l.campaign_name) names.add(l.campaign_name); }
    return Array.from(names).sort();
  }, [allLinks]);

  const filteredLinks = useMemo(() => {
    let filtered = allLinks;
    if (campaignFilter !== 'all') {
      if (campaignFilter === '_none') filtered = filtered.filter((l) => !l.campaign_name);
      else filtered = filtered.filter((l) => l.campaign_name === campaignFilter);
    }
    if (linkFilter) {
      const q = linkFilter.toLowerCase();
      filtered = filtered.filter((l) =>
        l.visitor_company?.toLowerCase().includes(q) ||
        l.visitor_first_name?.toLowerCase().includes(q) ||
        l.visitor_last_name?.toLowerCase().includes(q) ||
        l.visitor_email?.toLowerCase().includes(q) ||
        l.campaign_name?.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q)
      );
    }
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const av = a[linkSort]; const bv = b[linkSort];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') return linkSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return linkSortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return sorted;
  }, [allLinks, campaignFilter, linkFilter, linkSort, linkSortDir]);

  // ── Actions ──
  const copyLink = useCallback((code: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }, []);

  const deleteLink = useCallback(async (linkId: string) => {
    setDeletingLink(linkId);
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/campaign_links?id=eq.${linkId}`,
        { method: 'DELETE', headers: { apikey: ANON_KEY, Authorization: `Bearer ${authToken}`, Prefer: 'return=minimal' } }
      );
      if (!response.ok) throw new Error(`Delete failed (${response.status})`);
      setConfirmDeleteLink(null);
      setAllLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch (err) {
      console.error('Failed to delete link:', err);
    } finally {
      setDeletingLink(null);
    }
  }, [supabaseUrl, authToken]);

  const toggleLinkSort = useCallback((field: LinkSortField) => {
    if (linkSort === field) setLinkSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setLinkSort(field); setLinkSortDir('desc'); }
  }, [linkSort]);

  // ── Campaign create helpers ──
  const addProspect = useCallback(() => {
    if (!newProspect.company.trim() && !newProspect.domain.trim()) return;
    const prospect = { ...newProspect };
    if (!prospect.company.trim() && prospect.domain.trim()) {
      prospect.company = prospect.domain.replace(/^www\./, '').split('.')[0];
      prospect.company = prospect.company.charAt(0).toUpperCase() + prospect.company.slice(1);
    }
    setProspects((prev) => [...prev, prospect]);
    setNewProspect({ first_name: '', last_name: '', email: '', title: '', company: '', domain: '' });
    setShowAdd(false);
  }, [newProspect]);

  const removeProspect = useCallback((index: number) => {
    setProspects((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleCsvPaste = useCallback(() => {
    const parsed = parseCSV(csvText);
    if (parsed.length > 0) {
      setProspects((prev) => [...prev, ...parsed]);
      setCsvText('');
      setShowCsvInput(false);
      setShowDomainPreview(true);
    }
  }, [csvText]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const parsed = parseCSV(text);
      if (parsed.length > 0) { setProspects((prev) => [...prev, ...parsed]); setShowDomainPreview(true); }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const createCampaign = useCallback(async () => {
    if (prospects.length === 0) return;
    setIsCreating(true);
    setCreateError(null);
    setBatchErrors([]);
    const batches = chunkArray(prospects, BATCH_SIZE);
    const createdLinks: CampaignLink[] = [];
    let failedCount = 0;
    const errors: string[] = [];
    setBatchProgress({ totalBatches: batches.length, completedBatches: 0, totalProspects: prospects.length, enrichedCount: 0, failedCount: 0, isRunning: true });

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/campaign-enrich`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ campaign_name: campaignName || null, campaign_source: source, prospects: batch, expires_in_days: 30 }),
        });
        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          throw new Error(errBody || `Batch ${i + 1} failed`);
        }
        const data = await response.json();
        const links: CampaignLink[] = (data.links || []).map((l: CampaignLink) => ({ ...l, url: generateLinkUrl(l.code) }));
        createdLinks.push(...links);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Batch ${i + 1} failed`);
        failedCount += batch.length;
      }
      setBatchProgress({ totalBatches: batches.length, completedBatches: i + 1, totalProspects: prospects.length, enrichedCount: createdLinks.length, failedCount, isRunning: i < batches.length - 1 });
    }

    setBatchErrors(errors);
    setResults(createdLinks);
    if (createdLinks.length > 0) { setView('results'); fetchLinks(); }
    else { setCreateError('All batches failed. No links were created.'); }
    setIsCreating(false);
    setBatchProgress((prev) => (prev ? { ...prev, isRunning: false } : null));
  }, [campaignName, source, prospects, supabaseUrl, authToken, fetchLinks]);

  const copyAllLinks = useCallback((links: CampaignLink[]) => {
    const text = links.map((l) => `${l.company}\t${l.url}`).join('\n');
    navigator.clipboard.writeText(text);
    setBulkCopied(true);
    setTimeout(() => setBulkCopied(false), 2000);
  }, []);

  const goToCreate = useCallback(() => {
    setResults([]); setProspects([]); setCampaignName(''); setSource('email');
    setCreateError(null); setBatchProgress(null); setBatchErrors([]);
    setShowDomainPreview(false); setView('create');
  }, []);

  const domainStats = useMemo(() => {
    const domainSet = new Set<string>();
    const companySet = new Set<string>();
    for (const p of prospects) {
      if (p.domain) domainSet.add(p.domain.toLowerCase());
      if (p.company) companySet.add(p.company.toLowerCase());
    }
    return { totalProspects: prospects.length, uniqueDomains: domainSet.size, uniqueCompanies: companySet.size };
  }, [prospects]);

  // ── Render ──

  return (
    <div className="space-y-5">
      {/* Sub-header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {view !== 'table' && (
            <button onClick={() => setView('table')} className="p-2 -ml-2 rounded-lg hover:bg-white/[0.04] transition-colors text-zinc-500 hover:text-zinc-300">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <p className="text-sm text-zinc-400">
            {view === 'table' ? (
              <>{allLinks.length} link{allLinks.length !== 1 ? 's' : ''} {campaignFilter !== 'all' && <span className="text-zinc-600">· filtered</span>}</>
            ) : view === 'results' ? `${results.length} links created` : 'Create campaign links'}
          </p>
        </div>
        {view === 'table' && (
          <button onClick={goToCreate} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500/20 to-violet-500/20 border border-violet-500/20 text-sm text-violet-300 hover:border-violet-500/40 transition-all">
            <Plus className="w-3.5 h-3.5" /> New links
          </button>
        )}
      </div>

      {/* ── TABLE VIEW ── */}
      {view === 'table' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
              <input
                type="text"
                value={linkFilter}
                onChange={(e) => setLinkFilter(e.target.value)}
                placeholder="Search by name, company, email..."
                className={inputCls + ' w-full pl-9'}
              />
              {linkFilter && (
                <button onClick={() => setLinkFilter('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} className={inputCls + ' [&>option]:bg-zinc-900'}>
              <option value="all">All campaigns</option>
              <option value="_none">No campaign</option>
              {campaignNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button onClick={fetchLinks} className="p-2.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-all" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loadingLinks ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingLinks ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-16 text-center">
              <Loader2 className="w-5 h-5 text-violet-400 animate-spin mx-auto mb-3" />
              <p className="text-sm text-zinc-500">Loading links...</p>
            </div>
          ) : allLinks.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-5 h-5 text-violet-400" />
              </div>
              <p className="text-sm text-zinc-400 mb-1">No links yet</p>
              <p className="text-xs text-zinc-600 mb-5">Create your first ABM link to generate a personalized demo experience</p>
              <button onClick={goToCreate} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 text-sm font-medium text-white hover:shadow-lg hover:shadow-violet-500/20 transition-all">
                <Plus className="w-4 h-4" /> Create links
              </button>
            </div>
          ) : filteredLinks.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-12 text-center">
              <p className="text-sm text-zinc-500">No links match your filters.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.03] text-zinc-400 text-left">
                    {([
                      ['visitor_company', 'Contact / Company'],
                      ['campaign_name', 'Campaign'],
                      ['engagement_score', 'Score'],
                      ['view_count', 'Views'],
                      ['created_at', 'Created'],
                    ] as [LinkSortField, string][]).map(([field, label]) => (
                      <th
                        key={field}
                        className="px-4 py-3 font-medium cursor-pointer select-none hover:text-zinc-200 transition-colors whitespace-nowrap text-xs uppercase tracking-wider"
                        onClick={() => toggleLinkSort(field)}
                      >
                        {label}
                        {linkSort === field && (linkSortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />)}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-xs uppercase tracking-wider font-medium w-[1%]">Link</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider font-medium w-[1%]" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {filteredLinks.map((link) => {
                    const contactName = [link.visitor_first_name, link.visitor_last_name].filter(Boolean).join(' ');
                    const score = link.engagement_score;
                    const tier = tierLabel(score);
                    const tierColor = tier === 'Hot' ? 'text-amber-400 bg-amber-400/10' : tier === 'High' ? 'text-violet-400 bg-violet-400/10' : tier === 'Medium' ? 'text-blue-400 bg-blue-400/10' : 'text-zinc-500 bg-zinc-500/10';
                    return (
                      <tr key={link.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-4 py-3">
                          <div>
                            {contactName && <p className="text-zinc-100 font-medium">{contactName}</p>}
                            <p className={contactName ? 'text-zinc-500 text-xs mt-0.5' : 'text-zinc-100'}>{link.visitor_company}</p>
                            {link.visitor_email && <p className="text-zinc-600 text-xs mt-0.5">{link.visitor_email}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {link.campaign_name ? (
                            <span className="inline-block px-2 py-0.5 text-xs rounded bg-white/[0.06] text-zinc-400">{link.campaign_name}</span>
                          ) : (
                            <span className="text-zinc-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {score > 0 ? (
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded ${tierColor}`}>
                              {score} <span className="opacity-70">{tier}</span>
                            </span>
                          ) : (
                            <span className="text-zinc-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-300 tabular-nums">{link.view_count}</td>
                        <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                          {new Date(link.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => copyLink(link.code, generateLinkUrl(link.code))} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors" title="Copy link">
                              {copiedCode === link.code ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-500" />}
                            </button>
                            <a href={generateLinkUrl(link.code)} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors" title="Open link">
                              <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                            </a>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {confirmDeleteLink === link.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => deleteLink(link.id)}
                                disabled={deletingLink === link.id}
                                className="px-2 py-1 rounded bg-red-500/15 text-xs font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-50 transition-all"
                              >
                                {deletingLink === link.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Delete'}
                              </button>
                              <button onClick={() => setConfirmDeleteLink(null)} className="px-1.5 py-1 text-xs text-zinc-600 hover:text-zinc-400">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteLink(link.id)}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100"
                              title="Delete link"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── CREATE VIEW ── */}
      {view === 'create' && (
        <div className="space-y-5">
          {/* Campaign details card */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Campaign (optional)</h3>
            <p className="text-xs text-zinc-600 -mt-2">Assign a campaign name to group these links. Leave blank for ungrouped links.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">Campaign Name</label>
                <input type="text" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="e.g. Q1 Outreach - Enterprise" className={inputCls + ' w-full'} list="existing-campaigns" />
                <datalist id="existing-campaigns">
                  {campaignNames.map((n) => <option key={n} value={n} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">Source</label>
                <select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls + ' w-full [&>option]:bg-zinc-900'}>
                  {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Prospects card */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.04]">
              <span className="text-sm text-zinc-400 flex items-center gap-2">
                <Users className="w-4 h-4 text-zinc-500" />
                {prospects.length} prospect{prospects.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-1">
                <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-all">
                  <FileUp className="w-3.5 h-3.5" /> Upload CSV
                </button>
                <button onClick={() => { setShowCsvInput(!showCsvInput); setShowAdd(false); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-all">
                  <Upload className="w-3.5 h-3.5" /> Paste CSV
                </button>
                <button onClick={() => { setShowAdd(true); setShowCsvInput(false); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 transition-all">
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>

            {prospects.length === 0 && !showAdd && !showCsvInput && (
              <div className="px-5 py-12 text-center">
                <div className="w-10 h-10 rounded-lg bg-white/[0.04] flex items-center justify-center mx-auto mb-3">
                  <Users className="w-5 h-5 text-zinc-600" />
                </div>
                <p className="text-sm text-zinc-500 mb-1">Add prospects to generate personalized demo links</p>
                <p className="text-xs text-zinc-600">Paste a CSV, upload a file, or add them one by one. Only a website domain is required.</p>
              </div>
            )}

            {/* CSV paste area */}
            <AnimatePresence>
              {showCsvInput && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="p-5 border-b border-white/[0.04] space-y-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-xs text-zinc-400">Paste CSV with columns: email, first_name, last_name, company, title, domain</span>
                    </div>
                    <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={CSV_PLACEHOLDER} rows={5}
                      className={inputCls + ' w-full font-mono text-xs resize-none'} />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowCsvInput(false)} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
                      <button onClick={handleCsvPaste} disabled={!csvText.trim()} className="px-4 py-1.5 rounded-lg bg-violet-500/15 text-xs font-medium text-violet-300 hover:bg-violet-500/25 disabled:opacity-40 transition-all">Parse & add</button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Prospect rows */}
            {prospects.length > 0 && (
              <div className="max-h-[320px] overflow-y-auto">
                {prospects.map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">
                        {p.first_name || p.last_name ? `${p.first_name} ${p.last_name}`.trim() + ' · ' : ''}
                        {p.company}
                      </p>
                      <p className="text-xs text-zinc-500 truncate mt-0.5">
                        {[p.title, p.email, p.domain].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button onClick={() => removeProspect(i)} className="p-1.5 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Inline add form */}
            <AnimatePresence>
              {showAdd && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="p-5 border-t border-white/[0.04] space-y-3 bg-white/[0.01]">
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" value={newProspect.domain} onChange={(e) => setNewProspect({ ...newProspect, domain: e.target.value })} placeholder="Website (e.g. acme.com) *"
                        className={inputCls} />
                      <input type="text" value={newProspect.company} onChange={(e) => setNewProspect({ ...newProspect, company: e.target.value })} placeholder="Company name (auto from domain)"
                        className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" value={newProspect.first_name} onChange={(e) => setNewProspect({ ...newProspect, first_name: e.target.value })} placeholder="First name"
                        className={inputCls} />
                      <input type="text" value={newProspect.last_name} onChange={(e) => setNewProspect({ ...newProspect, last_name: e.target.value })} placeholder="Last name"
                        className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" value={newProspect.title} onChange={(e) => setNewProspect({ ...newProspect, title: e.target.value })} placeholder="Title"
                        className={inputCls} />
                      <input type="email" value={newProspect.email} onChange={(e) => setNewProspect({ ...newProspect, email: e.target.value })} placeholder="Email"
                        className={inputCls} />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
                      <button onClick={addProspect} disabled={!newProspect.company.trim() && !newProspect.domain.trim()} className="px-4 py-1.5 rounded-lg bg-violet-500/15 text-xs font-medium text-violet-300 hover:bg-violet-500/25 disabled:opacity-40 transition-all">Add prospect</button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Domain dedup preview */}
          {showDomainPreview && prospects.length > 0 && (
            <div className="rounded-xl bg-violet-500/5 border border-violet-500/15 px-5 py-4 flex items-start gap-3">
              <Target className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-zinc-300">
                  <span className="font-semibold text-white">{domainStats.totalProspects}</span> prospect{domainStats.totalProspects !== 1 ? 's' : ''} across{' '}
                  <span className="font-semibold text-white">{domainStats.uniqueCompanies}</span> compan{domainStats.uniqueCompanies !== 1 ? 'ies' : 'y'}
                  {domainStats.uniqueDomains > 0 && <> · <span className="font-semibold text-white">{domainStats.uniqueDomains}</span> unique domain{domainStats.uniqueDomains !== 1 ? 's' : ''}</>}
                </p>
                {prospects.length > BATCH_SIZE && (
                  <p className="text-xs text-zinc-500 mt-1">Will be submitted in {Math.ceil(prospects.length / BATCH_SIZE)} batches of {BATCH_SIZE}</p>
                )}
              </div>
            </div>
          )}

          {/* Batch progress */}
          {batchProgress && batchProgress.isRunning && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">Enriching batch {batchProgress.completedBatches + 1}/{batchProgress.totalBatches}</span>
                <span className="text-xs text-zinc-500">{batchProgress.enrichedCount}/{batchProgress.totalProspects} prospects</span>
              </div>
              <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round((batchProgress.completedBatches / batchProgress.totalBatches) * 100)}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            </div>
          )}

          {createError && (
            <div className="rounded-xl bg-red-500/8 border border-red-500/20 px-5 py-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-300">{createError}</p>
            </div>
          )}

          {batchErrors.length > 0 && !isCreating && (
            <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-300">{batchProgress?.enrichedCount ?? 0} links created, {batchProgress?.failedCount ?? 0} failed</span>
              </div>
              {batchErrors.map((err, i) => <p key={i} className="text-xs text-amber-400/70 ml-6">{err}</p>)}
            </div>
          )}

          {/* Create button */}
          <button onClick={createCampaign} disabled={prospects.length === 0 || isCreating}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-violet-500/20 active:scale-[0.99] transition-all">
            {isCreating && batchProgress ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Enriching batch {Math.min(batchProgress.completedBatches + 1, batchProgress.totalBatches)}/{batchProgress.totalBatches}...
              </span>
            ) : isCreating ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating {prospects.length} links...
              </span>
            ) : (
              `Generate ${prospects.length} personalized link${prospects.length !== 1 ? 's' : ''}`
            )}
          </button>
        </div>
      )}

      {/* ── RESULTS VIEW ── */}
      {view === 'results' && results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Check className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-sm font-medium text-white">{results.length} links created successfully</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => copyAllLinks(results)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/[0.08] text-xs text-zinc-300 hover:bg-white/[0.04] transition-all">
                {bulkCopied ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!</> : <><Clipboard className="w-3.5 h-3.5" /> Copy all</>}
              </button>
              <button onClick={() => setView('table')} className="px-4 py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-all">Back to table</button>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            {results.map((link) => (
              <div key={link.code} className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white font-medium">{link.company}</p>
                  <p className="text-xs text-zinc-500 font-mono truncate mt-0.5">{link.url}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                  <button onClick={() => copyLink(link.code, link.url)} className="p-2 rounded-lg hover:bg-white/[0.04] transition-colors">
                    {copiedCode === link.code ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-500" />}
                  </button>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-white/[0.04] transition-colors">
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// ANALYTICS TAB
// ===========================================================================

function AnalyticsTab({ accessToken }: { accessToken: string }) {
  const [links, setLinks] = useState<CampaignLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('visitors');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = `${SUPABASE_URL}/rest/v1/campaign_links?select=id,code,campaign_name,campaign_source,visitor_company,view_count,status,created_at,campaign_visitors(id,campaign_link_id,views_navigated,signup_email,converted_at,engagement_score,created_at)`;
      const filters: string[] = [];
      if (sourceFilter !== 'all') filters.push(`campaign_source=eq.${encodeURIComponent(sourceFilter)}`);
      if (dateFrom) filters.push(`created_at=gte.${dateFrom}T00:00:00Z`);
      if (dateTo) filters.push(`created_at=lte.${dateTo}T23:59:59Z`);
      if (filters.length) query += '&' + filters.join('&');
      const res = await fetch(query, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) { setError(`Failed to load (${res.status})`); setLoading(false); return; }
      setLinks(await res.json());
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setLoading(false); }
  }, [sourceFilter, dateFrom, dateTo, accessToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const allVisitors = useMemo(() => links.flatMap((l) => l.campaign_visitors), [links]);
  const sources = useMemo(() => {
    const s = new Set<string>();
    links.forEach((l) => { if (l.campaign_source) s.add(l.campaign_source); });
    return Array.from(s).sort();
  }, [links]);

  const campaigns: CampaignStats[] = useMemo(() => {
    const map = new Map<string, { links: CampaignLinkRow[]; source: string }>();
    for (const l of links) {
      const key = l.campaign_name || '(unnamed)';
      if (!map.has(key)) map.set(key, { links: [], source: l.campaign_source || '-' });
      map.get(key)!.links.push(l);
    }
    return Array.from(map.entries()).map(([name, { links: cLinks, source }]) => {
      const visitors = cLinks.flatMap((l) => l.campaign_visitors);
      const totalScore = visitors.reduce((s, v) => s + v.engagement_score, 0);
      const conversions = visitors.filter((v) => v.converted_at).length;
      const totalViews = cLinks.reduce((s, l) => s + l.view_count, 0);
      return { name, source, links: cLinks.length, visitors: visitors.length,
        avgScore: visitors.length ? Math.round(totalScore / visitors.length) : 0,
        conversions, ctr: totalViews > 0 ? Math.round((visitors.length / totalViews) * 100) : 0 };
    });
  }, [links]);

  const sortedCampaigns = useMemo(() => {
    const sorted = [...campaigns];
    sorted.sort((a, b) => {
      const av = a[sortField]; const bv = b[sortField];
      if (typeof av === 'string' && typeof bv === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return sorted;
  }, [campaigns, sortField, sortDir]);

  const funnel = useMemo(() => {
    const total = allVisitors.length;
    return [
      { label: 'Link clicks', count: total },
      { label: 'Demo viewed', count: allVisitors.filter((v) => v.views_navigated?.length > 0).length },
      { label: '3+ panels', count: allVisitors.filter((v) => v.views_navigated?.length >= 3).length },
      { label: 'Email captured', count: allVisitors.filter((v) => v.signup_email).length },
      { label: 'Signed up', count: allVisitors.filter((v) => v.converted_at).length },
    ];
  }, [allVisitors]);

  const tiers = useMemo(() => {
    const counts = { Low: 0, Medium: 0, High: 0, Hot: 0 };
    for (const v of allVisitors) counts[tierLabel(v.engagement_score)]++;
    return counts;
  }, [allVisitors]);

  const totalConversions = allVisitors.filter((v) => v.converted_at).length;
  const avgEngagement = allVisitors.length ? Math.round(allVisitors.reduce((s, v) => s + v.engagement_score, 0) / allVisitors.length) : 0;
  const conversionRate = allVisitors.length ? ((totalConversions / allVisitors.length) * 100).toFixed(1) : '0.0';

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className={inputCls}>
          <option value="all">All sources</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
        <button onClick={fetchData} className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-all" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-24"><p className="text-red-400 text-sm">{error}</p></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <MetricCard icon={<Target className="w-4 h-4 text-violet-400" />} label="Campaigns" value={campaigns.length} />
            <MetricCard icon={<Link2 className="w-4 h-4 text-blue-400" />} label="Total links" value={links.length} />
            <MetricCard icon={<Users className="w-4 h-4 text-emerald-400" />} label="Visitors" value={allVisitors.length} />
            <MetricCard icon={<TrendingUp className="w-4 h-4 text-amber-400" />} label="Avg score" value={avgEngagement} />
            <MetricCard icon={<Eye className="w-4 h-4 text-pink-400" />} label="Conv. rate" value={`${conversionRate}%`} />
          </div>

          {/* Campaign table */}
          {sortedCampaigns.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.03] text-zinc-400 text-left">
                    {([['name', 'Name'], ['source', 'Source'], ['links', 'Links'], ['visitors', 'Visitors'], ['avgScore', 'Avg Score'], ['conversions', 'Conv.'], ['ctr', 'CTR']] as [SortField, string][]).map(([field, label]) => (
                      <th key={field} className="px-4 py-3 font-medium cursor-pointer select-none hover:text-zinc-200 transition-colors whitespace-nowrap text-xs uppercase tracking-wider" onClick={() => toggleSort(field)}>
                        {label}
                        {sortField === field && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {sortedCampaigns.map((c) => (
                    <tr key={c.name} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-medium text-zinc-100">{c.name}</td>
                      <td className="px-4 py-3"><span className="inline-block px-2 py-0.5 text-xs rounded bg-white/[0.06] text-zinc-400">{c.source}</span></td>
                      <td className="px-4 py-3 text-zinc-300 tabular-nums">{c.links}</td>
                      <td className="px-4 py-3 text-zinc-300 tabular-nums">{c.visitors}</td>
                      <td className="px-4 py-3 text-zinc-300 tabular-nums">{c.avgScore}</td>
                      <td className="px-4 py-3 text-zinc-300 tabular-nums">{c.conversions}</td>
                      <td className="px-4 py-3 text-zinc-300 tabular-nums">{c.ctr}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Funnel + Tiers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Conversion Funnel</h3>
              <div className="space-y-3">
                {funnel.map((stage, i) => {
                  const maxCount = funnel[0].count || 1;
                  const pct = Math.round((stage.count / maxCount) * 100);
                  return (
                    <div key={stage.label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-zinc-300">{i + 1}. {stage.label}</span>
                        <span className="text-xs text-zinc-500 tabular-nums">{stage.count} <span className="text-zinc-600">({pct}%)</span></span>
                      </div>
                      <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, delay: i * 0.1, ease: 'easeOut' }}
                          style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.8) 0%, rgba(139,92,246,0.6) 100%)' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Engagement Tiers</h3>
              <div className="space-y-3">
                {([
                  { tier: 'Hot', range: '51+', color: 'from-amber-500/80 to-orange-500/60', dot: 'bg-amber-400' },
                  { tier: 'High', range: '31-50', color: 'from-violet-500/70 to-purple-500/50', dot: 'bg-violet-400' },
                  { tier: 'Medium', range: '11-30', color: 'from-blue-500/60 to-cyan-500/40', dot: 'bg-blue-400' },
                  { tier: 'Low', range: '1-10', color: 'from-zinc-500/50 to-zinc-600/30', dot: 'bg-zinc-500' },
                ] as const).map(({ tier, range, color, dot }) => {
                  const count = tiers[tier];
                  const maxTier = Math.max(...Object.values(tiers), 1);
                  const pct = Math.round((count / maxTier) * 100);
                  return (
                    <div key={tier}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-zinc-300 flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${dot}`} />
                          {tier} <span className="text-zinc-600 text-xs">({range})</span>
                        </span>
                        <span className="text-xs text-zinc-500 tabular-nums">{count}</span>
                      </div>
                      <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full bg-gradient-to-r ${color}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-zinc-500 uppercase tracking-wide">{label}</span></div>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
    </div>
  );
}
