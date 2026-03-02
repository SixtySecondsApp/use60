import { motion, AnimatePresence } from 'framer-motion';
import { Wand2, Send, FileText, CheckCircle2, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { contacts, aiSuggestionDraft } from './mockData';
import type { ShotComponentProps } from './types';

const stepVariants = {
  enter: { opacity: 0, x: 30 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
};

export default function ShotDraftCreation({ activeStep }: ShotComponentProps) {
  return (
    <AnimatePresence mode="wait">
      {activeStep === 0 && (
        <motion.div key="suggestion" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="flex items-center justify-center">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <Card className="bg-gray-800/60 border-blue-500/30 w-[480px] shadow-lg shadow-blue-500/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={{ rotate: [0, 15, -15, 0] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                  >
                    <Wand2 className="w-4 h-4 text-blue-400" />
                  </motion.div>
                  <CardTitle className="text-sm text-blue-300">AI Suggestion</CardTitle>
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs ml-auto">New</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-gray-300">
                  Follow up with <span className="text-white font-medium">{contacts[1].name}</span> about the TechFlow demo.
                  The team asked about API integration and a technical deep-dive was requested.
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>Based on: Meeting transcript + email context</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    View Draft
                  </Button>
                  <Button size="sm" variant="outline" className="border-gray-600 text-gray-300">Dismiss</Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}

      {activeStep === 1 && (
        <motion.div key="draftpreview" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
          <Card className="bg-gray-800/60 border-gray-700/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-400" />
                  <CardTitle className="text-sm text-white">Draft — TechFlow follow-up</CardTitle>
                </div>
                <Badge variant="outline" className="border-blue-500/40 text-blue-400">AI Draft</Badge>
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                <span>To: marcus.j@techflow.io</span>
                <span>&middot;</span>
                <span>Subject: TechFlow demo follow-up</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 bg-gray-900/40 rounded-lg border border-gray-700/30">
                <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{aiSuggestionDraft}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  Send Now
                </Button>
                <Button size="sm" variant="outline" className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Save as Draft
                </Button>
                <Button size="sm" variant="ghost" className="text-gray-500">Dismiss</Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {activeStep === 2 && (
        <motion.div key="savedtodrafts" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="space-y-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30"
          >
            <CheckCircle2 className="w-5 h-5 text-amber-400" />
            <span className="text-sm text-amber-300">Saved to Gmail Drafts</span>
          </motion.div>

          <Card className="bg-gray-800/60 border-gray-700/50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                <CardTitle className="text-sm text-gray-400">Gmail Drafts</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 p-3 bg-amber-500/5 rounded-lg border border-amber-500/20"
              >
                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-xs text-amber-300">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">To: {contacts[1].name}</span>
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Draft</Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">TechFlow demo follow-up</p>
                </div>
                <span className="text-xs text-gray-600">Just now</span>
              </motion.div>
              <div className="flex items-center gap-3 p-3 bg-gray-900/40 rounded-lg border border-gray-700/30 opacity-60">
                <div className="w-8 h-8 rounded-full bg-gray-700/50 flex items-center justify-center text-xs text-gray-400">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-400">To: Emily Rodriguez</span>
                  <p className="text-xs text-gray-600 mt-0.5">BrightPath Q2 planning discussion</p>
                </div>
                <span className="text-xs text-gray-600">2 days ago</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
