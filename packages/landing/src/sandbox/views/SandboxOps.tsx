/**
 * SandboxOps
 *
 * Demo view showing an AI-powered Ops table with personalized HeyGen avatar
 * video outreach. Rows animate in line-by-line, each generating a video
 * using the prospect's name and company context.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Video,
  Loader2,
  Check,
  Sparkles,
  Table2,
  Zap,
  X,
} from 'lucide-react';
import { useSandboxData } from '../data/SandboxDataProvider';
import { getLogoDevUrl } from '../data/sandboxTypes';

// Simulated avatar thumbnail — uses the 60 notetaker avatar as "Andrew's avatar"
const AVATAR_THUMB =
  'https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/60-notetaker.jpg';

type VideoStatus = 'waiting' | 'generating' | 'ready';

interface OpsRow {
  id: string;
  name: string;
  title: string;
  company: string;
  domain: string;
  email: string;
  videoStatus: VideoStatus;
  videoScript: string;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function SandboxOpsInner() {
  const { data } = useSandboxData();

  // Build rows from sandbox contacts
  const rows: OpsRow[] = data.contacts.slice(0, 6).map((contact, i) => ({
    id: contact.id,
    name: `${contact.first_name} ${contact.last_name}`,
    title: contact.title || 'Decision Maker',
    company: contact.company_name,
    domain: data.companies.find((c) => c.id === contact.company_id)?.domain || 'example.com',
    email: contact.email,
    videoStatus: 'waiting' as VideoStatus,
    videoScript: `Hey ${contact.first_name}, I noticed ${contact.company_name} is ${
      i % 3 === 0
        ? 'scaling their sales team'
        : i % 3 === 1
        ? 'investing in AI-powered automation'
        : 'growing rapidly in your space'
    }. I wanted to share how 60 helps teams like yours automate everything around the sales call — so you can focus on conversations that close revenue.`,
  }));

  const [visibleRows, setVisibleRows] = useState<OpsRow[]>([]);
  const [statuses, setStatuses] = useState<Record<string, VideoStatus>>({});
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  // Animate rows appearing one by one
  useEffect(() => {
    rows.forEach((row, i) => {
      setTimeout(() => {
        setVisibleRows((prev) => {
          if (prev.find((r) => r.id === row.id)) return prev;
          return [...prev, row];
        });
      }, i * 200);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate all videos sequentially
  const handleGenerateAll = useCallback(() => {
    if (isGeneratingAll) return;
    setIsGeneratingAll(true);

    rows.forEach((row, i) => {
      // Start generating after staggered delay
      setTimeout(() => {
        setStatuses((prev) => ({ ...prev, [row.id]: 'generating' }));
      }, i * 1500);

      // Complete after generation "time"
      setTimeout(() => {
        setStatuses((prev) => ({ ...prev, [row.id]: 'ready' }));
      }, i * 1500 + 2500 + Math.random() * 1000);
    });
  }, [rows, isGeneratingAll]);

  const readyCount = Object.values(statuses).filter((s) => s === 'ready').length;
  const generatingCount = Object.values(statuses).filter((s) => s === 'generating').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Table2 className="w-5 h-5 text-[#37bd7e]" />
            AI Outreach Studio
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Personalized video outreach for {data.visitorCompany?.name ?? 'your'} prospects
          </p>
        </div>
        <button
          onClick={handleGenerateAll}
          disabled={isGeneratingAll}
          className={`
            flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all
            ${isGeneratingAll
              ? 'bg-white/[0.06] text-gray-400 cursor-not-allowed'
              : 'bg-[#37bd7e] hover:bg-[#2da76c] text-white shadow-lg shadow-[#37bd7e]/20 hover:shadow-[#37bd7e]/30 hover:scale-[1.02]'
            }
          `}
        >
          {isGeneratingAll ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating {generatingCount > 0 ? `(${readyCount}/${rows.length})` : '...'}
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Generate All Videos
            </>
          )}
        </button>
      </div>

      {/* Stats bar */}
      {isGeneratingAll && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/[0.03] border border-gray-800/50"
        >
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-[#37bd7e]" />
            <span className="text-xs text-gray-400">
              {readyCount} of {rows.length} videos ready
            </span>
          </div>
          <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-[#37bd7e] to-emerald-400 rounded-full"
              animate={{ width: `${(readyCount / rows.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </motion.div>
      )}

      {/* Table */}
      <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[2fr_1.5fr_1fr_180px] gap-4 px-4 py-3 border-b border-gray-800/50 text-xs font-medium text-gray-500 uppercase tracking-wider">
          <span>Contact</span>
          <span className="hidden sm:block">Company</span>
          <span className="hidden sm:block">Email</span>
          <span>Video</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-800/30">
          <AnimatePresence>
            {visibleRows.map((row, i) => {
              const status = statuses[row.id] || 'waiting';
              return (
                <motion.div
                  key={row.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="grid grid-cols-[2fr_1.5fr_1fr_180px] gap-4 px-4 py-3 items-center hover:bg-white/[0.02] transition-colors"
                >
                  {/* Contact */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-xs font-semibold text-gray-300 flex-shrink-0">
                      {getInitials(row.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-200 truncate">{row.name}</p>
                      <p className="text-[11px] text-gray-500 truncate">{row.title}</p>
                    </div>
                  </div>

                  {/* Company */}
                  <div className="hidden sm:flex items-center gap-2 min-w-0">
                    <img
                      src={getLogoDevUrl(row.domain, 24)}
                      alt=""
                      className="w-5 h-5 rounded object-contain bg-white/[0.06] p-0.5 flex-shrink-0"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="text-sm text-gray-400 truncate">{row.company}</span>
                  </div>

                  {/* Email */}
                  <span className="hidden sm:block text-sm text-gray-500 truncate">{row.email}</span>

                  {/* Video status */}
                  <div className="flex items-center gap-2">
                    {status === 'waiting' && (
                      <button
                        onClick={() => {
                          setStatuses((prev) => ({ ...prev, [row.id]: 'generating' }));
                          setTimeout(() => {
                            setStatuses((prev) => ({ ...prev, [row.id]: 'ready' }));
                          }, 2500 + Math.random() * 1000);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-gray-800/50 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/[0.08] transition-all"
                      >
                        <Sparkles className="w-3 h-3" />
                        Generate
                      </button>
                    )}

                    {status === 'generating' && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-2"
                      >
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
                          <img src={AVATAR_THUMB} alt="" className="w-full h-full object-cover opacity-60" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <Loader2 className="w-4 h-4 text-white animate-spin" />
                          </div>
                        </div>
                        <div>
                          <p className="text-[11px] text-blue-400 font-medium">Generating...</p>
                          <motion.div
                            className="mt-1 h-1 w-16 bg-gray-800 rounded-full overflow-hidden"
                          >
                            <motion.div
                              className="h-full bg-blue-500 rounded-full"
                              initial={{ width: '0%' }}
                              animate={{ width: '100%' }}
                              transition={{ duration: 2.5, ease: 'linear' }}
                            />
                          </motion.div>
                        </div>
                      </motion.div>
                    )}

                    {status === 'ready' && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        onClick={() => setExpandedVideo(row.id)}
                        className="flex items-center gap-2 group"
                      >
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-emerald-500/30">
                          <img src={AVATAR_THUMB} alt="" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                            <Play className="w-4 h-4 text-white" fill="white" />
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-[11px] text-emerald-400 font-medium">Ready</span>
                        </div>
                      </motion.button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Video preview modal */}
      <AnimatePresence>
        {expandedVideo && (() => {
          const row = rows.find((r) => r.id === expandedVideo);
          if (!row) return null;
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
              onClick={() => setExpandedVideo(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="bg-gray-900 border border-gray-800/50 rounded-2xl overflow-hidden max-w-lg w-full shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Video preview area */}
                <div className="relative aspect-video bg-gray-950 flex items-center justify-center">
                  <img
                    src={AVATAR_THUMB}
                    alt="AI Avatar"
                    className="h-full w-full object-cover opacity-80"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <p className="text-xs text-gray-400">Personalized video for</p>
                    <p className="text-sm font-medium text-white">{row.name} — {row.company}</p>
                  </div>
                  <button
                    onClick={() => setExpandedVideo(null)}
                    className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/40 text-white/70 hover:text-white hover:bg-black/60 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Script preview */}
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
                      <img src={AVATAR_THUMB} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-200">Your AI Avatar</p>
                      <p className="text-[11px] text-gray-500">Personalized script</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400 leading-relaxed italic">
                    &ldquo;{row.videoScript}&rdquo;
                  </p>
                  <div className="flex items-center gap-2 pt-2">
                    <span className="px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 font-medium">
                      30s video
                    </span>
                    <span className="px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-400 font-medium">
                      1080p
                    </span>
                    <span className="px-2 py-1 rounded-md bg-violet-500/10 border border-violet-500/20 text-[11px] text-violet-400 font-medium">
                      AI personalized
                    </span>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

export default SandboxOpsInner;
