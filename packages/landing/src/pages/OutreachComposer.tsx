/**
 * OutreachComposer (UCR-004, UCR-005)
 *
 * Right panel in the creator view. Lets the user:
 * 1. Pick a channel (Email / LinkedIn / Slack)
 * 2. See an AI-drafted outreach message based on enrichment
 * 3. Edit the message
 * 4. Create a campaign link (/t/{code}) with one click
 *
 * Calls campaign-outreach-draft edge function for AI-generated copy.
 * Falls back to a simple template if the AI call fails.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Mail, Linkedin, MessageSquare, Copy, Check, ExternalLink, Sparkles, Loader2, Link2, RefreshCw } from 'lucide-react';
import type { ResearchData } from '../demo/demo-types';
import type { CampaignQueryParams } from './CampaignLanding';
import type { Session } from '../lib/supabase/clientV2';

type Channel = 'email' | 'linkedin' | 'slack';

interface OutreachComposerProps {
  domain: string;
  research: ResearchData;
  queryParams: CampaignQueryParams;
  session: Session;
  linkResult: { code: string; url: string } | null;
  onLinkCreated: (result: { code: string; url: string }) => void;
}

const CHANNEL_CONFIG: Record<Channel, { icon: typeof Mail; label: string; maxLength: number }> = {
  email: { icon: Mail, label: 'Email', maxLength: 2000 },
  linkedin: { icon: Linkedin, label: 'LinkedIn', maxLength: 300 },
  slack: { icon: MessageSquare, label: 'Slack', maxLength: 500 },
};

/** Quick fallback template if AI draft fails. */
function fallbackDraft(channel: Channel, companyName: string, recipientName: string): { subject?: string; body: string } {
  if (channel === 'email') {
    return {
      subject: `Quick demo for ${companyName}`,
      body: `Hi ${recipientName},\n\nPut together a personalized demo for ${companyName} — shows how AI agents could handle your sales admin (research, prep, follow-ups) so your team just focuses on closing.\n\n[LINK]\n\n60 seconds. Worth a look?`,
    };
  }
  if (channel === 'linkedin') {
    return { body: `Hi ${recipientName} — put together a quick personalized demo for ${companyName}: [LINK]\n\n60 seconds — worth a look?` };
  }
  return { body: `Hey ${recipientName} — made a personalized demo of 60 for ${companyName}: [LINK]\n\n60 seconds to check out.` };
}

export default function OutreachComposer({
  domain,
  research,
  queryParams,
  session,
  linkResult,
  onLinkCreated,
}: OutreachComposerProps) {
  const [channel, setChannel] = useState<Channel>('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [suggestedRole, setSuggestedRole] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const draftCacheRef = useRef<Record<Channel, { subject?: string; body: string } | null>>({
    email: null,
    linkedin: null,
    slack: null,
  });

  const recipientName = queryParams.fn || 'there';

  // Fetch AI draft for the current channel
  const fetchAiDraft = useCallback(async (ch: Channel) => {
    // Return cached draft if available
    if (draftCacheRef.current[ch]) {
      const cached = draftCacheRef.current[ch]!;
      setSubject(cached.subject || '');
      setBody(cached.body);
      return;
    }

    setDrafting(true);
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
          channel: ch,
          prospect: queryParams.fn ? {
            first_name: queryParams.fn,
            last_name: queryParams.ln,
            title: undefined,
          } : undefined,
          sender_name: session.user?.user_metadata?.full_name || undefined,
        }),
      });

      if (!response.ok) throw new Error('Draft generation failed');

      const data = await response.json();
      if (data.success && data.draft) {
        const draft = data.draft;
        setSubject(draft.subject || '');
        setBody(draft.body || '');
        if (draft.suggested_role) setSuggestedRole(draft.suggested_role);
        draftCacheRef.current[ch] = { subject: draft.subject, body: draft.body };
        return;
      }
      throw new Error('No draft returned');
    } catch {
      // Fall back to template
      const fb = fallbackDraft(ch, research.company.name, recipientName);
      setSubject(fb.subject || '');
      setBody(fb.body);
      draftCacheRef.current[ch] = fb;
    } finally {
      setDrafting(false);
    }
  }, [session, research, queryParams, recipientName]);

  // Fetch draft on mount and when channel changes
  useEffect(() => {
    fetchAiDraft(channel);
  }, [channel, fetchAiDraft]);

  const handleRegenerate = useCallback(() => {
    // Clear cache for this channel and re-fetch
    draftCacheRef.current[channel] = null;
    fetchAiDraft(channel);
  }, [channel, fetchAiDraft]);

  const handleCreateLink = useCallback(async () => {
    setCreating(true);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

      const prospect = {
        first_name: queryParams.fn,
        last_name: queryParams.ln,
        email: queryParams.email,
        company: research.company.name,
        domain: domain,
      };

      const response = await fetch(`${supabaseUrl}/functions/v1/campaign-enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          campaign_name: queryParams.cid || 'URL Direct',
          campaign_source: 'url-direct',
          prospects: [prospect],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Failed to create link (${response.status})`);
      }

      const data = await response.json();

      if (!data.success || !data.links?.length) {
        throw new Error('No link returned from server');
      }

      const link = data.links[0];
      onLinkCreated({ code: link.code, url: link.url });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create link');
    } finally {
      setCreating(false);
    }
  }, [session, domain, research, queryParams, onLinkCreated]);

  const handleCopy = useCallback(() => {
    if (!linkResult) return;
    navigator.clipboard.writeText(linkResult.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [linkResult]);

  // Replace [LINK] placeholder with actual link
  const displayBody = linkResult ? body.replace('[LINK]', linkResult.url) : body;

  return (
    <div className="p-6 flex flex-col h-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-1">Outreach for {research.company.name}</h2>
        <p className="text-sm text-zinc-500">
          {suggestedRole
            ? <>Target: <strong className="text-zinc-300">{suggestedRole}</strong></>
            : 'AI-personalized message with demo link'}
        </p>
      </div>

      {/* Prospect info (if available) */}
      {(queryParams.fn || queryParams.email) && (
        <div className="mb-4 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Prospect</p>
          <p className="text-sm text-zinc-200">
            {[queryParams.fn, queryParams.ln].filter(Boolean).join(' ') || 'Unknown'}
            {queryParams.email && <span className="text-zinc-500 ml-2">{queryParams.email}</span>}
          </p>
        </div>
      )}

      {/* Channel picker */}
      <div className="flex gap-1 mb-4 p-1 bg-zinc-800/50 rounded-lg">
        {(Object.entries(CHANNEL_CONFIG) as [Channel, typeof CHANNEL_CONFIG.email][]).map(([key, config]) => {
          const Icon = config.icon;
          const isActive = channel === key;
          return (
            <button
              key={key}
              onClick={() => setChannel(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {config.label}
            </button>
          );
        })}
      </div>

      {/* Subject (email only) */}
      {channel === 'email' && (
        <div className="mb-3">
          <label className="text-xs text-zinc-500 mb-1 block">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50"
          />
        </div>
      )}

      {/* Message body */}
      <div className="mb-4 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-zinc-500">Message</label>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRegenerate}
              disabled={drafting}
              className="text-xs text-zinc-600 hover:text-violet-400 flex items-center gap-1 transition-colors disabled:opacity-50"
              title="Regenerate draft"
            >
              <RefreshCw className={`w-3 h-3 ${drafting ? 'animate-spin' : ''}`} />
              {drafting ? 'Drafting...' : 'Regenerate'}
            </button>
            <span className="text-xs text-zinc-700">|</span>
            <span className="text-xs text-zinc-600 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              AI draft
            </span>
          </div>
        </div>

        {drafting ? (
          <div className="w-full flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg flex items-center justify-center min-h-[200px]">
            <div className="flex items-center gap-2 text-zinc-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Writing personalized draft...
            </div>
          </div>
        ) : (
          <textarea
            value={displayBody}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            className="w-full flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 resize-none font-mono leading-relaxed"
            maxLength={CHANNEL_CONFIG[channel].maxLength}
          />
        )}
        {!drafting && (
          <p className="text-xs text-zinc-600 mt-1 text-right">
            {displayBody.length}/{CHANNEL_CONFIG[channel].maxLength}
          </p>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Create Link / Link Result */}
      {!linkResult ? (
        <button
          onClick={handleCreateLink}
          disabled={creating || drafting}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating link...
            </>
          ) : (
            <>
              <Link2 className="w-4 h-4" />
              Create Campaign Link
            </>
          )}
        </button>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {/* Link display */}
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-xs text-emerald-400 font-medium mb-2">Link created</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm text-emerald-300 bg-zinc-900/50 px-3 py-1.5 rounded font-mono truncate">
                {linkResult.url}
              </code>
              <button
                onClick={handleCopy}
                className="shrink-0 p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                title="Copy link"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4 text-zinc-400" />
                )}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <a
              href={linkResult.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Preview link
            </a>
            <a
              href={`${import.meta.env.VITE_APP_URL || 'https://app.use60.com'}/campaigns`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
            >
              View in ABM Campaigns
            </a>
          </div>
        </motion.div>
      )}
    </div>
  );
}
