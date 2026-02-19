import { motion } from 'framer-motion';
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

        <CardContent className="p-4 sm:p-5">
          <AskAnythingPanel />
        </CardContent>
      </Card>
    </motion.div>
  );
}
