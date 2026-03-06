/**
 * CreatorView (UCR-003, UCR-005)
 *
 * Split-screen view for authenticated users visiting /t/{domain.com}.
 * Left: SandboxExperience preview (what the prospect will see)
 * Right: OutreachComposer panel (draft message + create link)
 *
 * Auth-gated: redirects to app login if not authenticated.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, LogIn } from 'lucide-react';
import { SandboxExperience } from '../sandbox/SandboxExperience';
import { useDemoResearch } from '../demo/useDemoResearch';
import { supabase, type Session } from '../lib/supabase/clientV2';
import OutreachComposer from './OutreachComposer';
import type { CampaignQueryParams } from './CampaignLanding';

interface CreatorViewProps {
  domain: string;
  queryParams: CampaignQueryParams;
}

export default function CreatorView({ domain, queryParams }: CreatorViewProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [linkResult, setLinkResult] = useState<{ code: string; url: string } | null>(null);
  const { research, isComplete, start } = useDemoResearch();

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

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" />
      </div>
    );
  }

  // Not authenticated — prompt to sign in
  if (!session) {
    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
    const appUrl = import.meta.env.VITE_APP_URL || 'https://app.use60.com';
    const loginUrl = `${appUrl}/login?redirect=${returnUrl}`;

    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-5">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm"
        >
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <LogIn className="w-5 h-5 text-violet-400" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Sign in to create a link</h2>
          <p className="text-sm text-zinc-500 mb-6">
            Sign in to your 60 account to create a personalized campaign link for <strong className="text-zinc-300">{domain}</strong>.
          </p>
          <a
            href={loginUrl}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-zinc-950 text-sm font-semibold hover:bg-zinc-100 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Sign in
          </a>
        </motion.div>
      </div>
    );
  }

  // Enrichment loading state
  if (!isComplete || !research) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-violet-400" />
            </div>
            <div className="absolute inset-0 w-14 h-14 rounded-2xl border-2 border-violet-500/30 border-t-violet-400 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm text-zinc-400 font-medium">Researching {domain}...</p>
            <p className="text-xs text-zinc-600 mt-1">Enriching company profile</p>
          </div>
        </motion.div>
      </div>
    );
  }

  // Split-screen: preview + composer
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col lg:flex-row">
      {/* Left: Preview */}
      <div className="lg:w-[60%] w-full lg:h-screen overflow-y-auto border-r border-zinc-800/50">
        <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-800/50 px-4 py-2">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Preview — what your prospect will see</p>
        </div>
        <div className="pointer-events-none">
          <SandboxExperience
            research={research}
            onSignup={() => {}}
          />
        </div>
      </div>

      {/* Right: Outreach Composer */}
      <div className="lg:w-[40%] w-full lg:h-screen overflow-y-auto bg-zinc-900/50">
        <OutreachComposer
          domain={domain}
          research={research}
          queryParams={queryParams}
          session={session}
          linkResult={linkResult}
          onLinkCreated={setLinkResult}
        />
      </div>
    </div>
  );
}
