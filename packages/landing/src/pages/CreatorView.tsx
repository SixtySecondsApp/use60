/**
 * CreatorView (UCR-003, UCR-005)
 *
 * Command center for /t/{domain} — shows company intelligence, outreach composer,
 * and a miniature demo preview that expands to fullscreen.
 *
 * Auth-gated: inline login if not authenticated.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogIn,
  Loader2,
  AlertCircle,
  Building2,
  Users,
  MapPin,
  DollarSign,
  Cpu,
  Newspaper,
  TrendingUp,
  Maximize2,
  X,
  Swords,
  Sparkles,
  Target,
  Activity,
  ExternalLink,
  Copy,
  Linkedin,
  Mail,
  Link2,
} from 'lucide-react';
import { SandboxExperience } from '../sandbox/SandboxExperience';
import { useDemoResearch } from '../demo/useDemoResearch';
import { ResearchFeed } from '../components/ResearchFeed';
import { ContactCard } from '../components/ContactCard';
import { supabase, type Session } from '../lib/supabase/clientV2';
import OutreachComposer from './OutreachComposer';
import type { CampaignQueryParams } from './CampaignLanding';
import type { ResearchData, DiscoveredContact } from '../demo/demo-types';

interface CreatorViewProps {
  domain: string;
  queryParams: CampaignQueryParams;
}

export default function CreatorView({ domain, queryParams }: CreatorViewProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [linkResult, setLinkResult] = useState<{ code: string; url: string } | null>(null);
  const [prospectIntel, setProspectIntel] = useState<ResearchData['prospect'] | null>(null);
  const [demoExpanded, setDemoExpanded] = useState(false);
  const [contacts, setContacts] = useState<DiscoveredContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [expandedContactIdx, setExpandedContactIdx] = useState<number | null>(null);
  const contactDraftCache = useRef<Record<string, { subject: string; body: string }>>({});
  const [contactDrafts, setContactDrafts] = useState<Record<string, { subject: string; body: string; loading: boolean }>>({});
  const [instantlyPushing, setInstantlyPushing] = useState(false);
  const [instantlyResult, setInstantlyResult] = useState<{ campaign_name: string; leads_pushed: number } | null>(null);
  const { research, isComplete, providerEvents, start } = useDemoResearch();

  // Check auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Start enrichment once authenticated
  useEffect(() => {
    if (session && !research) {
      start(domain);
    }
  }, [session, domain, research, start]);

  // Enrich prospect in parallel (if we have email or name)
  useEffect(() => {
    if (!session || prospectIntel) return;
    const hasProspectData = queryParams.email || (queryParams.fn && domain);
    if (!hasProspectData) return;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    fetch(`${supabaseUrl}/functions/v1/prospect-enrich`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        email: queryParams.email,
        first_name: queryParams.fn,
        last_name: queryParams.ln,
        domain,
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.success && data.prospect) {
          setProspectIntel(data.prospect);
        }
      })
      .catch(() => {}); // Silent fail — prospect intel is optional
  }, [session, queryParams, domain, prospectIntel]);

  // Discover decision makers once research completes
  useEffect(() => {
    if (!session || !research || contacts.length > 0 || contactsLoading) return;

    setContactsLoading(true);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    fetch(`${supabaseUrl}/functions/v1/discover-contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        domain,
        icp_titles: research.company.icp?.title ? [research.company.icp.title, 'VP Sales', 'Head of Sales', 'CEO', 'Founder'] : undefined,
        max_contacts: 5,
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.success && data.contacts?.length) {
          setContacts(data.contacts);
        }
      })
      .catch(() => {})
      .finally(() => setContactsLoading(false));
  }, [session, research, domain, contacts.length, contactsLoading]);

  // Fetch personalized outreach draft for a specific contact
  const fetchContactDraft = useCallback(async (contact: DiscoveredContact) => {
    const key = contact.email || contact.linkedin_url || contact.full_name;
    if (!key || !session || !research) return;

    // Use cache if available
    if (contactDraftCache.current[key]) {
      setContactDrafts(prev => ({ ...prev, [key]: { ...contactDraftCache.current[key], loading: false } }));
      return;
    }

    setContactDrafts(prev => ({ ...prev, [key]: { subject: '', body: '', loading: true } }));

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const response = await fetch(`${supabaseUrl}/functions/v1/campaign-outreach-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          company: research.company,
          channel: 'email',
          prospect: {
            first_name: contact.first_name,
            last_name: contact.last_name,
            title: contact.title,
          },
          prospect_intel: {
            title: contact.title,
            seniority: contact.seniority,
            recent_activity: contact.recent_posts || [],
          },
          sender_name: session.user?.user_metadata?.full_name || undefined,
        }),
      });

      if (!response.ok) throw new Error('Draft failed');
      const data = await response.json();
      if (data.success && data.draft) {
        const draft = { subject: data.draft.subject || '', body: data.draft.body || '' };
        contactDraftCache.current[key] = draft;
        setContactDrafts(prev => ({ ...prev, [key]: { ...draft, loading: false } }));
        return;
      }
    } catch {
      // Fallback draft
      const fallback = {
        subject: `Quick demo for ${research.company.name}`,
        body: `Hi ${contact.first_name},\n\nAs ${contact.title} at ${contact.company_name}, you're likely juggling ${contact.seniority === 'C-Suite' || contact.seniority === 'VP' ? 'strategic priorities' : 'team performance'} alongside pipeline growth.\n\nPut together a 60-second personalized demo showing how AI agents handle the sales admin — research, prep, follow-ups — so your team focuses on closing.\n\n[LINK]\n\nWorth a look?`
      };
      contactDraftCache.current[key] = fallback;
      setContactDrafts(prev => ({ ...prev, [key]: { ...fallback, loading: false } }));
    }
  }, [session, research]);

  // Push all contacts to Instantly campaign
  const handleInstantlyPush = useCallback(async () => {
    if (!session || !research || contacts.length === 0) return;
    const contactsWithEmail = contacts.filter(c => c.email);
    if (contactsWithEmail.length === 0) return;

    setInstantlyPushing(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const response = await fetch(`${supabaseUrl}/functions/v1/crm-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'campaign_instantly',
          campaign_name: `${research.company.name} — Outreach ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
          contacts: contactsWithEmail.map(c => ({
            email: c.email,
            first_name: c.first_name,
            last_name: c.last_name,
            company_name: c.company_name,
            title: c.title,
            linkedin_url: c.linkedin_url,
            demo_link: linkResult?.url,
          })),
        }),
      });

      if (!response.ok) throw new Error('Push failed');
      const data = await response.json();
      if (data.success) {
        setInstantlyResult({ campaign_name: data.campaign_name, leads_pushed: data.leads_pushed });
      }
    } catch {
      // Silent fail for now — could add error state
    } finally {
      setInstantlyPushing(false);
    }
  }, [session, research, contacts, linkResult]);

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" />
      </div>
    );
  }

  // Not authenticated — inline login form
  if (!session) {
    return <InlineLogin domain={domain} onSession={setSession} />;
  }

  // Enrichment loading state — show real-time research feed
  if (!isComplete || !research) {
    return <ResearchFeed domain={domain} events={providerEvents} />;
  }

  const c = research.company;
  const logoUrl = `https://img.logo.dev/${domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=128&format=png`;

  return (
    <div className="min-h-screen bg-zinc-950 pt-16">
      {/* ── Company Header Bar ─────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl"
      >
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            {/* Logo + Name */}
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="relative">
                <img
                  src={logoUrl}
                  alt={c.name}
                  className="w-11 h-11 rounded-xl object-contain bg-white/[0.06] p-1 border border-zinc-800/50"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                  }}
                />
                <div className="hidden w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
                  <span className="text-base font-bold text-white">{c.name.charAt(0)}</span>
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <h1 className="text-lg font-semibold text-white truncate">{c.name}</h1>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20 whitespace-nowrap">
                    {c.vertical}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 truncate max-w-lg mt-0.5">{c.product_summary}</p>
              </div>
            </div>

            {/* Quick stats pills */}
            <div className="ml-auto flex items-center gap-2 flex-shrink-0">
              {c.employee_range && (
                <Pill icon={Users} label={c.employee_range} />
              )}
              {c.funding_stage && (
                <Pill icon={DollarSign} label={c.funding_stage} />
              )}
              {c.headquarters && (
                <Pill icon={MapPin} label={c.headquarters} />
              )}
              {c.founded_year && (
                <Pill icon={Building2} label={`Est. ${c.founded_year}`} />
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Main Content Grid ──────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* ── Left Column: Outreach Composer (7 cols) ────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="lg:col-span-7 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-sm overflow-hidden"
          >
            <OutreachComposer
              domain={domain}
              research={research}
              queryParams={queryParams}
              session={session}
              linkResult={linkResult}
              onLinkCreated={setLinkResult}
              prospectIntel={prospectIntel}
            />
          </motion.div>

          {/* ── Right Column: Intelligence Cards (5 cols) ──── */}
          <div className="lg:col-span-5 space-y-4">

            {/* Decision Makers */}
            {(contactsLoading || contacts.length > 0) && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="rounded-2xl bg-zinc-900/40 border border-zinc-800/50 p-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-violet-400" />
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Decision Makers</h3>
                  {contacts.length > 0 && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20">
                      {contacts.length}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {contactsLoading ? (
                    <>
                      <ContactCard contact={{} as DiscoveredContact} loading />
                      <ContactCard contact={{} as DiscoveredContact} loading />
                      <ContactCard contact={{} as DiscoveredContact} loading />
                    </>
                  ) : (
                    contacts.map((contact, i) => {
                      const draftKey = contact.email || contact.linkedin_url || contact.full_name;
                      const draft = draftKey ? contactDrafts[draftKey] : undefined;
                      const isExpanded = expandedContactIdx === i;

                      return (
                        <ContactCard
                          key={contact.linkedin_url || contact.full_name || i}
                          contact={contact}
                          expanded={isExpanded}
                          onToggle={() => {
                            if (isExpanded) {
                              setExpandedContactIdx(null);
                            } else {
                              setExpandedContactIdx(i);
                              fetchContactDraft(contact);
                            }
                          }}
                        >
                          {/* CC-004: Per-contact outreach draft */}
                          {draft?.loading ? (
                            <div className="flex items-center gap-2 py-3 text-zinc-500 text-xs">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Writing personalized draft for {contact.first_name}...
                            </div>
                          ) : draft ? (
                            <div className="space-y-2 mt-1">
                              {draft.subject && (
                                <div>
                                  <p className="text-[10px] text-zinc-600 mb-0.5">Subject</p>
                                  <p className="text-xs text-zinc-300">{draft.subject}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-[10px] text-zinc-600 mb-0.5">Message</p>
                                <p className="text-xs text-zinc-400 whitespace-pre-line leading-relaxed max-h-32 overflow-y-auto">
                                  {linkResult ? draft.body.replace('[LINK]', linkResult.url) : draft.body}
                                </p>
                              </div>
                              {/* CC-005: One-click outreach actions */}
                              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-zinc-800/40">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const text = linkResult
                                      ? `Subject: ${draft.subject}\n\n${draft.body.replace('[LINK]', linkResult.url)}`
                                      : `Subject: ${draft.subject}\n\n${draft.body}`;
                                    navigator.clipboard.writeText(text);
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800/60 hover:bg-zinc-700/60 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
                                >
                                  <Copy className="w-3 h-3" />
                                  Copy Draft
                                </button>
                                {contact.linkedin_url && (
                                  <a
                                    href={contact.linkedin_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800/60 hover:bg-blue-500/20 text-[11px] text-zinc-400 hover:text-blue-300 transition-colors"
                                  >
                                    <Linkedin className="w-3 h-3" />
                                    LinkedIn
                                  </a>
                                )}
                                {contact.email && (
                                  <a
                                    href={`mailto:${contact.email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(linkResult ? draft.body.replace('[LINK]', linkResult.url) : draft.body)}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800/60 hover:bg-emerald-500/20 text-[11px] text-zinc-400 hover:text-emerald-300 transition-colors"
                                  >
                                    <Mail className="w-3 h-3" />
                                    Send Email
                                  </a>
                                )}
                                {linkResult && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(linkResult.url);
                                    }}
                                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800/60 hover:bg-violet-500/20 text-[11px] text-zinc-400 hover:text-violet-300 transition-colors"
                                  >
                                    <Link2 className="w-3 h-3" />
                                    Copy Link
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </ContactCard>
                      );
                    })
                  )}
                </div>

                {/* Push to Instantly */}
                {contacts.some(c => c.email) && !instantlyResult && (
                  <button
                    onClick={handleInstantlyPush}
                    disabled={instantlyPushing}
                    className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    {instantlyPushing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Pushing to Instantly...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-3.5 h-3.5" />
                        Push {contacts.filter(c => c.email).length} contacts to Instantly
                      </>
                    )}
                  </button>
                )}
                {instantlyResult && (
                  <div className="mt-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-xs text-emerald-400 font-medium">
                      {instantlyResult.leads_pushed} leads pushed to &ldquo;{instantlyResult.campaign_name}&rdquo;
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Research stats */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="rounded-2xl bg-zinc-900/40 border border-zinc-800/50 p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Research Intelligence</h3>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="Signals" value={research.stats.signals_found} color="text-emerald-400" />
                <StatCard label="Actions" value={research.stats.actions_queued} color="text-blue-400" />
                <StatCard label="Contacts" value={research.stats.contacts_identified} color="text-violet-400" />
                <StatCard label="Opps" value={research.stats.opportunities_mapped} color="text-amber-400" />
              </div>
            </motion.div>

            {/* Tech Stack */}
            {c.tech_stack && c.tech_stack.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="rounded-2xl bg-zinc-900/40 border border-zinc-800/50 p-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Cpu className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Tech Stack</h3>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.tech_stack.slice(0, 12).map((tech) => (
                    <span
                      key={tech}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-800/60 text-zinc-400 border border-zinc-700/30"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Recent News */}
            {c.recent_news && c.recent_news.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.4 }}
                className="rounded-2xl bg-zinc-900/40 border border-zinc-800/50 p-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Newspaper className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Recent News</h3>
                </div>
                <div className="space-y-2">
                  {c.recent_news.slice(0, 3).map((news, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <TrendingUp className="w-3 h-3 text-amber-400/60 mt-1 shrink-0" />
                      <p className="text-xs text-zinc-400 leading-relaxed">{news}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Competitive Intel */}
            {research.competitive?.competitors && research.competitive.competitors.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="rounded-2xl bg-zinc-900/40 border border-zinc-800/50 p-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Swords className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Competitive Landscape</h3>
                </div>
                <div className="space-y-2.5">
                  {research.competitive.competitors.slice(0, 3).map((comp) => (
                    <div key={comp.domain} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-zinc-800/30 border border-zinc-700/20">
                      <img
                        src={`https://img.logo.dev/${comp.domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=40&format=png`}
                        alt=""
                        className="w-7 h-7 rounded-md bg-zinc-800 object-contain shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-zinc-300 font-medium">{comp.name}</p>
                        {comp.differentiators.slice(0, 1).map((diff, i) => (
                          <p key={i} className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed truncate">{diff}</p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ICP Card */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.4 }}
              className="rounded-2xl bg-zinc-900/40 border border-zinc-800/50 p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-violet-400" />
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Ideal Customer Profile</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500">Target role</span>
                  <span className="text-xs text-zinc-300 font-medium">{c.icp.title}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500">Company size</span>
                  <span className="text-xs text-zinc-300">{c.icp.company_size}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500">Industry</span>
                  <span className="text-xs text-zinc-300">{c.icp.industry}</span>
                </div>
                {c.competitors && c.competitors.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500">Competitors</span>
                    <span className="text-xs text-zinc-400">{c.competitors.slice(0, 3).join(', ')}</span>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Demo Preview Thumbnail */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.4 }}
              className="rounded-2xl bg-zinc-900/40 border border-zinc-800/50 overflow-hidden group cursor-pointer"
              onClick={() => setDemoExpanded(true)}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Prospect Demo Preview</h3>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-600 group-hover:text-violet-400 transition-colors">
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Expand</span>
                </div>
              </div>
              <div className="relative h-[200px] overflow-hidden">
                <div className="absolute inset-0 scale-[0.35] origin-top-left w-[286%] h-[286%] pointer-events-none">
                  <SandboxExperience
                    research={research}
                    onSignup={() => {}}
                  />
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600/90 text-white text-sm font-medium shadow-lg shadow-violet-500/20">
                    <Maximize2 className="w-4 h-4" />
                    Open full preview
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ── Fullscreen Demo Overlay ────────────────────────── */}
      <AnimatePresence>
        {demoExpanded && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm"
              onClick={() => setDemoExpanded(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-3 z-[71] rounded-2xl bg-zinc-950 border border-zinc-800/50 overflow-hidden flex flex-col shadow-2xl shadow-black/50"
            >
              {/* Demo overlay header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/50 bg-zinc-950/90 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-3">
                  <img
                    src={logoUrl}
                    alt=""
                    className="w-7 h-7 rounded-lg object-contain bg-white/[0.06] p-0.5"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">{c.name} Demo Preview</p>
                    <p className="text-[11px] text-zinc-500">This is what your prospect will see</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {linkResult && (
                    <a
                      href={linkResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open live link
                    </a>
                  )}
                  <button
                    onClick={() => setDemoExpanded(false)}
                    className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              {/* Demo content */}
              <div className="flex-1 overflow-y-auto">
                <SandboxExperience
                  research={research}
                  onSignup={() => {}}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Pill Component ──────────────────────────────────────

function Pill({ icon: Icon, label }: { icon: typeof Building2; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/60 border border-zinc-700/30 text-[11px] text-zinc-400 whitespace-nowrap">
      <Icon className="w-3 h-3 text-zinc-500" />
      {label}
    </span>
  );
}

// ── Stat Card Component ────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center p-2 rounded-xl bg-zinc-800/30 border border-zinc-700/20">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-zinc-500 mt-0.5">{label}</p>
    </div>
  );
}

// ── Inline Login ───────────────────────────────────────

function InlineLogin({ domain, onSession }: { domain: string; onSession: (s: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      onSession(data.session);
    }
    setLoading(false);
  }, [email, password, onSession]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-5">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <LogIn className="w-5 h-5 text-violet-400" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-1">Sign in to create a link</h2>
          <p className="text-sm text-zinc-500">
            for <strong className="text-zinc-300">{domain}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50"
          />

          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white text-zinc-950 text-sm font-semibold hover:bg-zinc-100 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Sign in
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
