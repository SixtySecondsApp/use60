import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AskAnythingPanel } from './AskAnythingPanel';

interface SearchHeroProps {
  className?: string;
}

export function SearchHero({ className }: SearchHeroProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className={cn('mb-6', className)}
    >
      <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/30 shadow-lg dark:shadow-xl dark:shadow-black/10 rounded-2xl overflow-hidden">
        {/* Gradient accent bar */}
        <div className="h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />

        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-end">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-50 dark:bg-violet-500/10 border border-violet-200/60 dark:border-violet-500/20">
              <Sparkles className="h-3 w-3 text-violet-500 dark:text-violet-400" />
              <span className="text-xs font-medium text-violet-600 dark:text-violet-400">AI Powered</span>
            </div>
          </div>

          <AskAnythingPanel />
        </CardContent>
      </Card>
    </motion.div>
  );
}
