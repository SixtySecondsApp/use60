/**
 * SandboxEmailDraft
 *
 * Pixel-perfect replica of the real 60 follow-up email UI.
 * Composer with AI reasoning panel, #37bd7e accent.
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Send,
  Pencil,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  User,
  Building2,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { useSandboxData } from '../data/SandboxDataProvider';

export default function SandboxEmailDraft() {
  const { data } = useSandboxData();
  const { emailDraft } = data;
  const [showReasoning, setShowReasoning] = useState(false);
  const [typedLength, setTypedLength] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const hasAnimated = useRef(false);

  // Typewriter effect on first mount
  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;

    const fullLength = emailDraft.body.length;
    let current = 0;
    const interval = setInterval(() => {
      current += 2;
      if (current >= fullLength) {
        current = fullLength;
        clearInterval(interval);
        setIsTyping(false);
      }
      setTypedLength(current);
    }, 15);

    return () => {
      clearInterval(interval);
      // Reset so the effect can re-run after StrictMode remount
      hasAnimated.current = false;
    };
  }, [emailDraft.body]);

  const visibleBody = emailDraft.body.slice(0, typedLength);
  const visibleParagraphs = visibleBody
    .split('\n\n')
    .filter((p) => p.trim().length > 0);

  return (
    <div>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-5"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#37bd7e]" />
          <span className="text-[10px] font-mono text-[#37bd7e] uppercase tracking-wider">
            AI-Drafted Follow-up
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900/40 border border-gray-700/30 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors">
            <RefreshCw className="w-3 h-3" />
            Regenerate
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900/40 border border-gray-700/30 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors">
            <Pencil className="w-3 h-3" />
            Edit
          </button>
          <button className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#37bd7e] hover:bg-[#2da76c] text-xs text-white font-medium transition-colors">
            <Send className="w-3 h-3" />
            Send
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Email Composer */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 rounded-2xl border bg-gray-900/40 backdrop-blur-xl border-gray-700/30 overflow-hidden"
        >
          <div className="border-b border-gray-700/30">
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-700/30">
              <span className="text-xs text-gray-500 w-10">To</span>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#37bd7e]/10 border border-[#37bd7e]/20">
                  <User className="w-3 h-3 text-[#37bd7e]" />
                  <span className="text-xs text-[#37bd7e]">{emailDraft.to_name}</span>
                </div>
                <span className="text-xs text-gray-500">&lt;{emailDraft.to_email}&gt;</span>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-xs text-gray-500 w-10">Subject</span>
              <span className="text-sm text-gray-200">{emailDraft.subject}</span>
            </div>
          </div>

          <div className="p-5">
            {isTyping && typedLength === 0 ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="w-4 h-4 text-[#37bd7e] animate-spin" />
                <span className="text-xs text-gray-500 font-mono">Drafting follow-up...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {visibleParagraphs.map((paragraph, i) => (
                  <p
                    key={i}
                    className="text-sm text-gray-300 leading-relaxed"
                  >
                    {paragraph}
                    {isTyping && i === visibleParagraphs.length - 1 && (
                      <span className="inline-block w-[2px] h-4 bg-[#37bd7e] ml-0.5 align-middle animate-pulse" />
                    )}
                  </p>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Reasoning panel */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-3"
        >
          {/* Contact card */}
          <div className="rounded-2xl border bg-gray-900/40 backdrop-blur-xl border-gray-700/30 p-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Recipient
            </h4>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#37bd7e]/15 flex items-center justify-center">
                <User className="w-4 h-4 text-[#37bd7e]" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{emailDraft.to_name}</p>
                <p className="text-[11px] text-gray-500">{emailDraft.to_title}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Building2 className="w-3 h-3 text-gray-600" />
                  <span className="text-[11px] text-gray-500">{emailDraft.to_company}</span>
                </div>
              </div>
            </div>
          </div>

          {/* AI reasoning */}
          {emailDraft.reasoning && (
            <div className="rounded-2xl border bg-gray-900/40 border-[#37bd7e]/20 p-4">
              <button
                onClick={() => setShowReasoning(!showReasoning)}
                className="flex items-center justify-between w-full text-left"
              >
                <h4 className="flex items-center gap-2 text-xs font-semibold text-[#37bd7e] uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  Why this email
                </h4>
                {showReasoning ? (
                  <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                )}
              </button>
              {showReasoning && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="text-sm text-gray-400 leading-relaxed mt-3"
                >
                  {emailDraft.reasoning}
                </motion.p>
              )}
            </div>
          )}

          {/* Deal context */}
          <div className="rounded-2xl border bg-gray-900/40 backdrop-blur-xl border-gray-700/30 p-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Deal Context
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Deal</span>
                <span className="text-gray-300">{data.visitorDeal.name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Value</span>
                <span className="text-gray-300">${(data.visitorDeal.value / 1000).toFixed(0)}K</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Stage</span>
                <span className="text-gray-300 capitalize">{data.visitorDeal.stage}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Health</span>
                <span className={`font-mono ${
                  data.visitorDeal.health_score >= 70 ? 'text-emerald-400' :
                  data.visitorDeal.health_score >= 40 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {data.visitorDeal.health_score}/100
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Personalized CTA */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="mt-5 rounded-2xl p-5 bg-gradient-to-r from-[#37bd7e]/10 via-[#37bd7e]/5 to-transparent border border-[#37bd7e]/20 flex items-center justify-between"
      >
        <div>
          <p className="text-sm font-semibold text-white">
            Send this email to {emailDraft.to_name} for real
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            AI-drafted follow-ups in your tone, with full deal context — ready in seconds
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[#37bd7e] text-sm font-medium flex-shrink-0">
          Start free trial
          <ArrowRight className="w-4 h-4" />
        </div>
      </motion.div>
    </div>
  );
}
