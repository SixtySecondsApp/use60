/**
 * CampaignManager
 *
 * UI for creating and managing personalized campaign links.
 * Accessible from the main app (not the landing page sandbox).
 * This is a standalone component that can be mounted in app settings.
 *
 * CMP-003: Campaign form, CSV paste, submit to campaign-enrich, results table,
 *          bulk copy, campaign list view.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
  Clipboard,
  BarChart3,
  Calendar,
  ArrowLeft,
  AlertTriangle,
  FileUp,
} from 'lucide-react';

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

interface ExistingCampaign {
  campaign_name: string;
  campaign_source: string | null;
  link_count: number;
  total_views: number;
  created_at: string;
  links: CampaignLink[];
}

interface CampaignManagerProps {
  /** Supabase URL for API calls */
  supabaseUrl: string;
  /** Auth token */
  authToken: string;
}

type ManagerView = 'list' | 'create' | 'results';

const SOURCES = [
  { value: 'email', label: 'Email' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'event', label: 'Event' },
  { value: 'referral', label: 'Referral' },
] as const;

const CSV_PLACEHOLDER = `email,first_name,last_name,company,title
jane@acme.com,Jane,Doe,Acme Inc,VP Sales
bob@globex.com,Bob,Smith,Globex Corp,CRO`;

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

/** Split a CSV line respecting quoted fields (handles commas inside quotes) */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): ProspectRow[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  // Detect header row
  const firstLine = lines[0].toLowerCase();
  const hasHeader =
    firstLine.includes('email') ||
    firstLine.includes('first_name') ||
    firstLine.includes('company');

  const dataLines = hasHeader ? lines.slice(1) : lines;

  // Determine column order from header or use default
  const headers = hasHeader
    ? splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'))
    : ['email', 'first_name', 'last_name', 'company', 'title'];

  const colIndex = (name: string): number => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? idx : -1;
  };

  return dataLines
    .map((line) => {
      const cols = splitCsvLine(line);
      const get = (name: string): string => {
        const i = colIndex(name);
        return i >= 0 && i < cols.length ? cols[i] : '';
      };

      const company = get('company');
      if (!company) return null;

      const email = get('email');
      const domain = email.includes('@') ? email.split('@')[1] : '';

      return {
        first_name: get('first_name'),
        last_name: get('last_name'),
        email,
        title: get('title'),
        company,
        domain,
      } satisfies ProspectRow;
    })
    .filter(Boolean) as ProspectRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BATCH_SIZE = 50;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

interface BatchProgress {
  totalBatches: number;
  completedBatches: number;
  totalProspects: number;
  enrichedCount: number;
  failedCount: number;
  isRunning: boolean;
}

function generateLinkUrl(code: string): string {
  // Use current origin in dev, or default to landing page domain
  const base =
    typeof window !== 'undefined' && window.location.hostname !== 'localhost'
      ? window.location.origin
      : 'https://www.use60.com';
  return `${base}/t/${code}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CampaignManager({ supabaseUrl, authToken }: CampaignManagerProps) {
  const [view, setView] = useState<ManagerView>('list');

  // Create form state
  const [campaignName, setCampaignName] = useState('');
  const [source, setSource] = useState('email');
  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const [csvText, setCsvText] = useState('');
  const [showCsvInput, setShowCsvInput] = useState(false);
  const [results, setResults] = useState<CampaignLink[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [bulkCopied, setBulkCopied] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // Campaign list state
  const [campaigns, setCampaigns] = useState<ExistingCampaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);

  // File upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch progress state
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);

  // Domain preview state (shown after CSV/file parse)
  const [showDomainPreview, setShowDomainPreview] = useState(false);

  // Inline add prospect
  const [newProspect, setNewProspect] = useState<ProspectRow>({
    first_name: '',
    last_name: '',
    email: '',
    title: '',
    company: '',
    domain: '',
  });

  // ---------------------------------------------------------------------------
  // Fetch existing campaigns
  // ---------------------------------------------------------------------------

  const fetchCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/campaign_links?select=code,campaign_name,campaign_source,visitor_company,visitor_first_name,visitor_last_name,visitor_email,visitor_title,view_count,status,created_at&order=created_at.desc`,
        {
          headers: {
            apikey: authToken,
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      if (!response.ok) {
        setCampaigns([]);
        return;
      }

      const data = await response.json();

      // Group by campaign_name
      const grouped: Record<string, ExistingCampaign> = {};
      for (const row of data) {
        const name = row.campaign_name || 'Untitled';
        if (!grouped[name]) {
          grouped[name] = {
            campaign_name: name,
            campaign_source: row.campaign_source,
            link_count: 0,
            total_views: 0,
            created_at: row.created_at,
            links: [],
          };
        }
        grouped[name].link_count += 1;
        grouped[name].total_views += row.view_count || 0;
        grouped[name].links.push({
          code: row.code,
          company: row.visitor_company,
          url: generateLinkUrl(row.code),
          status: row.status,
          visitor_first_name: row.visitor_first_name,
          visitor_last_name: row.visitor_last_name,
          visitor_email: row.visitor_email,
          visitor_title: row.visitor_title,
        });
      }

      setCampaigns(Object.values(grouped));
    } catch {
      setCampaigns([]);
    } finally {
      setLoadingCampaigns(false);
    }
  }, [supabaseUrl, authToken]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // ---------------------------------------------------------------------------
  // Prospect management
  // ---------------------------------------------------------------------------

  const addProspect = useCallback(() => {
    if (!newProspect.company.trim()) return;
    setProspects((prev) => [...prev, { ...newProspect }]);
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
      if (parsed.length > 0) {
        setProspects((prev) => [...prev, ...parsed]);
        setShowDomainPreview(true);
      }
    };
    reader.readAsText(file);

    // Reset the input so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Create campaign
  // ---------------------------------------------------------------------------

  const createCampaign = useCallback(async () => {
    if (!campaignName.trim() || prospects.length === 0) return;

    setIsCreating(true);
    setCreateError(null);
    setBatchErrors([]);

    const batches = chunkArray(prospects, BATCH_SIZE);
    const allLinks: CampaignLink[] = [];
    let failedCount = 0;
    const errors: string[] = [];

    setBatchProgress({
      totalBatches: batches.length,
      completedBatches: 0,
      totalProspects: prospects.length,
      enrichedCount: 0,
      failedCount: 0,
      isRunning: true,
    });

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/campaign-enrich`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            campaign_name: campaignName,
            campaign_source: source,
            prospects: batch,
            expires_in_days: 30,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          throw new Error(errBody || `Batch ${i + 1} failed`);
        }

        const data = await response.json();
        const links: CampaignLink[] = (data.links || []).map((l: CampaignLink) => ({
          ...l,
          url: l.url || generateLinkUrl(l.code),
        }));
        allLinks.push(...links);
      } catch (err) {
        const msg = err instanceof Error ? err.message : `Batch ${i + 1} failed`;
        console.error(`[CampaignManager] Batch ${i + 1} error:`, err);
        errors.push(msg);
        failedCount += batch.length;
      }

      setBatchProgress({
        totalBatches: batches.length,
        completedBatches: i + 1,
        totalProspects: prospects.length,
        enrichedCount: allLinks.length,
        failedCount,
        isRunning: i < batches.length - 1,
      });
    }

    setBatchErrors(errors);
    setResults(allLinks);

    if (allLinks.length > 0) {
      setView('results');
      fetchCampaigns();
    } else {
      setCreateError('All batches failed. No links were created.');
    }

    setIsCreating(false);
    setBatchProgress((prev) => (prev ? { ...prev, isRunning: false } : null));
  }, [campaignName, source, prospects, supabaseUrl, authToken, fetchCampaigns]);

  // ---------------------------------------------------------------------------
  // Copy helpers
  // ---------------------------------------------------------------------------

  const copyLink = useCallback((code: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }, []);

  const copyAllLinks = useCallback((links: CampaignLink[]) => {
    const text = links.map((l) => `${l.company}\t${l.url}`).join('\n');
    navigator.clipboard.writeText(text);
    setBulkCopied(true);
    setTimeout(() => setBulkCopied(false), 2000);
  }, []);

  // ---------------------------------------------------------------------------
  // Reset to create new
  // ---------------------------------------------------------------------------

  const resetToCreate = useCallback(() => {
    setResults([]);
    setProspects([]);
    setCampaignName('');
    setSource('email');
    setCreateError(null);
    setBatchProgress(null);
    setBatchErrors([]);
    setShowDomainPreview(false);
    setView('create');
  }, []);

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const totalLinks = useMemo(
    () => campaigns.reduce((acc, c) => acc + c.link_count, 0),
    [campaigns]
  );

  const totalViews = useMemo(
    () => campaigns.reduce((acc, c) => acc + c.total_views, 0),
    [campaigns]
  );

  // Domain dedup stats
  const domainStats = useMemo(() => {
    const domainSet = new Set<string>();
    const companySet = new Set<string>();
    for (const p of prospects) {
      if (p.domain) domainSet.add(p.domain.toLowerCase());
      if (p.company) companySet.add(p.company.toLowerCase());
    }
    return {
      totalProspects: prospects.length,
      uniqueDomains: domainSet.size,
      uniqueCompanies: companySet.size,
    };
  }, [prospects]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {view !== 'list' && (
            <button
              onClick={() => setView('list')}
              className="p-2 rounded-lg hover:bg-white/[0.04] transition-colors text-zinc-500 hover:text-zinc-300"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Campaign Links</h2>
            <p className="text-xs text-zinc-500">
              {view === 'list'
                ? `${totalLinks} links across ${campaigns.length} campaigns`
                : view === 'results'
                  ? `${results.length} links created`
                  : 'Create personalized demo links for prospects'}
            </p>
          </div>
        </div>
        {view === 'list' && (
          <button
            onClick={resetToCreate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-500/15 text-xs text-violet-300 hover:bg-violet-500/25 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New campaign
          </button>
        )}
      </div>

      {/* ================================================================= */}
      {/* LIST VIEW                                                          */}
      {/* ================================================================= */}
      {view === 'list' && (
        <>
          {/* Stats bar */}
          {campaigns.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-zinc-900/80 border border-white/[0.06] rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                  <BarChart3 className="w-3.5 h-3.5" />
                  Campaigns
                </div>
                <p className="text-lg font-semibold text-white">{campaigns.length}</p>
              </div>
              <div className="bg-zinc-900/80 border border-white/[0.06] rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                  <Link2 className="w-3.5 h-3.5" />
                  Links
                </div>
                <p className="text-lg font-semibold text-white">{totalLinks}</p>
              </div>
              <div className="bg-zinc-900/80 border border-white/[0.06] rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                  <Eye className="w-3.5 h-3.5" />
                  Views
                </div>
                <p className="text-lg font-semibold text-white">{totalViews}</p>
              </div>
            </div>
          )}

          {/* Campaign list */}
          {loadingCampaigns ? (
            <div className="bg-zinc-900/80 border border-white/[0.06] rounded-xl px-4 py-12 text-center">
              <div className="w-5 h-5 border-2 border-zinc-600 border-t-violet-400 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-zinc-600">Loading campaigns...</p>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="bg-zinc-900/80 border border-white/[0.06] rounded-xl px-4 py-12 text-center">
              <Sparkles className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500 mb-4">No campaigns yet</p>
              <button
                onClick={resetToCreate}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500/15 text-sm text-violet-300 hover:bg-violet-500/25 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create your first campaign
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <div
                  key={campaign.campaign_name}
                  className="bg-zinc-900/80 border border-white/[0.06] rounded-xl overflow-hidden"
                >
                  {/* Campaign header */}
                  <button
                    onClick={() =>
                      setExpandedCampaign(
                        expandedCampaign === campaign.campaign_name ? null : campaign.campaign_name
                      )
                    }
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {expandedCampaign === campaign.campaign_name ? (
                        <ChevronDown className="w-4 h-4 text-zinc-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-500" />
                      )}
                      <div className="text-left">
                        <p className="text-sm font-medium text-white">{campaign.campaign_name}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          {campaign.campaign_source && (
                            <span className="text-xs text-zinc-600 capitalize">
                              {campaign.campaign_source}
                            </span>
                          )}
                          <span className="text-xs text-zinc-600 flex items-center gap-1">
                            <Link2 className="w-3 h-3" />
                            {campaign.link_count}
                          </span>
                          <span className="text-xs text-zinc-600 flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {campaign.total_views}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyAllLinks(campaign.links);
                      }}
                      className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors text-zinc-500 hover:text-zinc-300"
                      title="Copy all links"
                    >
                      <Clipboard className="w-4 h-4" />
                    </button>
                  </button>

                  {/* Expanded links */}
                  <AnimatePresence>
                    {expandedCampaign === campaign.campaign_name && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-white/[0.04]">
                          {campaign.links.map((link) => (
                            <div
                              key={link.code}
                              className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04] last:border-0"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-white">
                                  {link.visitor_first_name
                                    ? `${link.visitor_first_name} ${link.visitor_last_name || ''} `.trim()
                                    : ''}{' '}
                                  <span className="text-zinc-500">
                                    {link.visitor_first_name ? '- ' : ''}
                                    {link.company}
                                  </span>
                                </p>
                                <p className="text-xs text-zinc-600 font-mono truncate">{link.url}</p>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                                <button
                                  onClick={() => copyLink(link.code, link.url)}
                                  className="p-2 rounded-lg hover:bg-white/[0.04] transition-colors"
                                >
                                  {copiedCode === link.code ? (
                                    <Check className="w-4 h-4 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-4 h-4 text-zinc-500" />
                                  )}
                                </button>
                                <a
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 rounded-lg hover:bg-white/[0.04] transition-colors"
                                >
                                  <ExternalLink className="w-4 h-4 text-zinc-500" />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ================================================================= */}
      {/* CREATE VIEW                                                        */}
      {/* ================================================================= */}
      {view === 'create' && (
        <>
          {/* Campaign details */}
          <div className="bg-zinc-900/80 border border-white/[0.06] rounded-xl p-4 space-y-4">
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">Campaign Name</label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Q1 Outreach - Enterprise"
                className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/40"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">Source</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white outline-none focus:border-violet-500/40 [&>option]:bg-zinc-900"
              >
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Prospects list */}
          <div className="bg-zinc-900/80 border border-white/[0.06] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
              <span className="text-xs text-zinc-500 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {prospects.length} prospect{prospects.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
                >
                  <FileUp className="w-3 h-3" />
                  Upload CSV
                </button>
                <button
                  onClick={() => {
                    setShowCsvInput(!showCsvInput);
                    setShowAdd(false);
                  }}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
                >
                  <Upload className="w-3 h-3" />
                  Paste CSV
                </button>
                <button
                  onClick={() => {
                    setShowAdd(true);
                    setShowCsvInput(false);
                  }}
                  className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add
                </button>
              </div>
            </div>

            {prospects.length === 0 && !showAdd && !showCsvInput && (
              <div className="px-4 py-8 text-center">
                <Sparkles className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
                <p className="text-sm text-zinc-600 mb-1">
                  Add prospects to generate personalized demo links
                </p>
                <p className="text-xs text-zinc-700">Paste a CSV or add them one by one</p>
              </div>
            )}

            {/* CSV paste area */}
            <AnimatePresence>
              {showCsvInput && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-b border-white/[0.04] overflow-hidden"
                >
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-xs text-zinc-500">
                        Paste CSV: email, first_name, last_name, company, title
                      </span>
                    </div>
                    <textarea
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                      placeholder={CSV_PLACEHOLDER}
                      rows={5}
                      className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder:text-zinc-700 outline-none focus:border-violet-500/40 font-mono text-xs resize-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowCsvInput(false)}
                        className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCsvPaste}
                        disabled={!csvText.trim()}
                        className="px-3 py-1.5 rounded-lg bg-violet-500/15 text-xs text-violet-300 hover:bg-violet-500/25 disabled:opacity-40 transition-colors"
                      >
                        Parse & add
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Prospect rows */}
            {prospects.map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]"
              >
                <div>
                  <p className="text-sm text-white">
                    {p.first_name} {p.last_name}
                    {p.first_name || p.last_name ? ' - ' : ''}
                    {p.company}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {p.title}
                    {p.email ? ` · ${p.email}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => removeProspect(i)}
                  className="p-1 text-zinc-600 hover:text-zinc-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {/* Inline add form */}
            <AnimatePresence>
              {showAdd && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-t border-white/[0.04] overflow-hidden"
                >
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={newProspect.first_name}
                        onChange={(e) =>
                          setNewProspect({ ...newProspect, first_name: e.target.value })
                        }
                        placeholder="First name"
                        className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder:text-zinc-600 outline-none"
                      />
                      <input
                        type="text"
                        value={newProspect.last_name}
                        onChange={(e) =>
                          setNewProspect({ ...newProspect, last_name: e.target.value })
                        }
                        placeholder="Last name"
                        className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder:text-zinc-600 outline-none"
                      />
                    </div>
                    <input
                      type="text"
                      value={newProspect.company}
                      onChange={(e) =>
                        setNewProspect({ ...newProspect, company: e.target.value })
                      }
                      placeholder="Company name *"
                      className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder:text-zinc-600 outline-none"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={newProspect.title}
                        onChange={(e) =>
                          setNewProspect({ ...newProspect, title: e.target.value })
                        }
                        placeholder="Title"
                        className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder:text-zinc-600 outline-none"
                      />
                      <input
                        type="email"
                        value={newProspect.email}
                        onChange={(e) =>
                          setNewProspect({ ...newProspect, email: e.target.value })
                        }
                        placeholder="Email"
                        className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder:text-zinc-600 outline-none"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowAdd(false)}
                        className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={addProspect}
                        disabled={!newProspect.company.trim()}
                        className="px-3 py-1.5 rounded-lg bg-violet-500/15 text-xs text-violet-300 hover:bg-violet-500/25 disabled:opacity-40 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Domain dedup preview */}
          {showDomainPreview && prospects.length > 0 && (
            <div className="bg-violet-500/5 border border-violet-500/15 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-medium text-violet-300">Import Summary</span>
              </div>
              <p className="text-sm text-zinc-300">
                Found{' '}
                <span className="font-semibold text-white">{domainStats.totalProspects}</span>{' '}
                prospect{domainStats.totalProspects !== 1 ? 's' : ''} across{' '}
                <span className="font-semibold text-white">{domainStats.uniqueCompanies}</span>{' '}
                compan{domainStats.uniqueCompanies !== 1 ? 'ies' : 'y'}
                {domainStats.uniqueDomains > 0 && (
                  <>
                    {' '}
                    ({' '}
                    <span className="font-semibold text-white">{domainStats.uniqueDomains}</span>{' '}
                    unique domain{domainStats.uniqueDomains !== 1 ? 's' : ''})
                  </>
                )}
              </p>
              {prospects.length > BATCH_SIZE && (
                <p className="text-xs text-zinc-500 mt-1">
                  Will be submitted in {Math.ceil(prospects.length / BATCH_SIZE)} batches of {BATCH_SIZE}
                </p>
              )}
            </div>
          )}

          {/* Batch progress bar */}
          {batchProgress && batchProgress.isRunning && (
            <div className="bg-zinc-900/80 border border-white/[0.06] rounded-xl px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">
                  Enriching batch {batchProgress.completedBatches + 1}/{batchProgress.totalBatches}...
                </span>
                <span className="text-xs text-zinc-500">
                  {batchProgress.enrichedCount}/{batchProgress.totalProspects} prospects
                </span>
              </div>
              <div className="w-full h-2 bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.round((batchProgress.completedBatches / batchProgress.totalBatches) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {createError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <p className="text-sm text-red-400">{createError}</p>
            </div>
          )}

          {/* Batch errors summary */}
          {batchErrors.length > 0 && !isCreating && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-medium text-amber-300">
                  {batchProgress?.enrichedCount ?? 0} links created, {batchProgress?.failedCount ?? 0} failed
                </span>
              </div>
              {batchErrors.map((err, i) => (
                <p key={i} className="text-xs text-amber-400/70 mt-0.5">{err}</p>
              ))}
            </div>
          )}

          {/* Create button */}
          <button
            onClick={createCampaign}
            disabled={!campaignName.trim() || prospects.length === 0 || isCreating}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-semibold
              disabled:opacity-40 disabled:cursor-not-allowed
              hover:shadow-lg hover:shadow-violet-500/20 transition-all"
          >
            {isCreating && batchProgress ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Enriching batch {Math.min(batchProgress.completedBatches + 1, batchProgress.totalBatches)}/{batchProgress.totalBatches}...
              </span>
            ) : isCreating ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating {prospects.length} links...
              </span>
            ) : (
              `Generate ${prospects.length} personalized link${prospects.length !== 1 ? 's' : ''}`
            )}
          </button>
        </>
      )}

      {/* ================================================================= */}
      {/* RESULTS VIEW                                                       */}
      {/* ================================================================= */}
      {view === 'results' && results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              {results.length} links created
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => copyAllLinks(results)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-zinc-300 hover:bg-white/[0.08] transition-colors"
              >
                {bulkCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Clipboard className="w-3.5 h-3.5" />
                    Copy all
                  </>
                )}
              </button>
              <button
                onClick={resetToCreate}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Create another
              </button>
            </div>
          </div>

          <div className="bg-zinc-900/80 border border-white/[0.06] rounded-xl overflow-hidden">
            {results.map((link) => (
              <div
                key={link.code}
                className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04] last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white font-medium">{link.company}</p>
                  <p className="text-xs text-zinc-500 font-mono truncate">{link.url}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <button
                    onClick={() => copyLink(link.code, link.url)}
                    className="p-2 rounded-lg hover:bg-white/[0.04] transition-colors"
                  >
                    {copiedCode === link.code ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-zinc-500" />
                    )}
                  </button>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg hover:bg-white/[0.04] transition-colors"
                  >
                    <ExternalLink className="w-4 h-4 text-zinc-500" />
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
