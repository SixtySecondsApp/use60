/**
 * DemoLanding — Decodes encrypted demo URLs and renders the demo experience.
 *
 * Route: /d/:hash
 * The hash is a URL-safe base64-encoded domain (e.g., stripe.com → c3RyaXBlLmNvbQ).
 * This avoids conflicts with the /t/:code campaign route.
 */

import { useState, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { SandboxExperience } from '../sandbox/SandboxExperience';
import type { ResearchData } from '../demo/demo-types';
import { generateResearchFromUrl } from '../demo/demo-data';

/** Decode URL-safe base64 back to domain string */
function decodeDemoHash(hash: string): string | null {
  try {
    let s = hash.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return atob(s);
  } catch {
    return null;
  }
}

/** Encode domain to URL-safe base64 (exported for use in landing pages) */
export function encodeDemoUrl(domain: string): string {
  return btoa(domain).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export default function DemoLanding() {
  const { hash } = useParams<{ hash: string }>();
  const [loading, setLoading] = useState(true);
  const [research, setResearch] = useState<ResearchData | null>(null);

  const domain = hash ? decodeDemoHash(hash) : null;

  useEffect(() => {
    if (!domain) return;

    // Instant mock data
    const mockResearch = generateResearchFromUrl(domain);
    setResearch(mockResearch);
    setLoading(false);

    // Fire-and-forget: real research upgrade
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (supabaseUrl && anonKey) {
      fetch(`${supabaseUrl}/functions/v1/demo-research`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ domain }),
      })
        .then(res => res.ok ? res.json() : null)
        .then(json => {
          if (json?.success && json.data) {
            setResearch(json.data);
          }
        })
        .catch(() => {});
    }
  }, [domain]);

  if (!domain) return <Navigate to="/v19" replace />;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b18] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-emerald-500/20 border border-blue-500/20 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-blue-400" />
            </div>
            <div className="absolute inset-0 w-14 h-14 rounded-2xl border-2 border-blue-500/30 border-t-blue-400 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-400 font-medium">Preparing your demo...</p>
            <p className="text-xs text-gray-600 mt-1">Researching {domain}</p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!research) return null;

  return (
    <div className="min-h-screen bg-[#070b18]">
      <SandboxExperience research={research} />
    </div>
  );
}
