import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Video, Link2, RefreshCw, Loader2, Bot, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFathomIntegration } from '@/lib/hooks/useFathomIntegration';

interface MeetingsEmptyStateProps {
  meetingCount?: number;
  isSyncing?: boolean;
}

export function MeetingsEmptyState({ meetingCount = 0, isSyncing: propIsSyncing = false }: MeetingsEmptyStateProps) {
  const navigate = useNavigate();
  const { integration, connectFathom, triggerSync, loading: fathomLoading, isSyncing: hookIsSyncing } = useFathomIntegration();

  const isConnected = integration?.is_active === true;
  const hasMeetings = meetingCount > 0;
  // Use hook's isSyncing for actual sync state, propIsSyncing for parent-passed state
  const isSyncingNow = hookIsSyncing || propIsSyncing;

  const handleConnectFathom = async () => {
    try {
      await connectFathom();
    } catch (error) {
      console.error('Error connecting Fathom:', error);
    }
  };

  const handleManualSync = async () => {
    try {
      await triggerSync();
    } catch (error) {
      console.error('Error triggering sync:', error);
    }
  };

  // Fathom not connected state
  if (!isConnected) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-16 px-4"
      >
        <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-800/50 flex items-center justify-center mb-6">
          <Video className="w-12 h-12 text-gray-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 text-center">
          No Meetings Yet
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-8 text-center max-w-md">
          Connect Fathom to sync your recordings, or use 60 Notetaker to record meetings automatically.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleConnectFathom}
            disabled={fathomLoading}
            className="bg-[#37bd7e] hover:bg-[#2da76c] text-white"
          >
            {fathomLoading ? (
              <>
                <Loader2 className="mr-2 w-5 h-5 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Link2 className="mr-2 w-5 h-5" />
                Connect Fathom
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/meetings/recordings/settings')}
          >
            <Bot className="mr-2 w-5 h-5" />
            Set Up 60 Notetaker
          </Button>
        </div>
      </motion.div>
    );
  }

  // Syncing state
  if (isSyncingNow) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-16 px-4"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-800/50 flex items-center justify-center mb-6"
        >
          <Loader2 className="w-12 h-12 text-[#37bd7e]" />
        </motion.div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 text-center">
          Syncing Your Meetings
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4 text-center max-w-md">
          We're fetching your meeting recordings from Fathom. This may take a few moments.
        </p>
        <div className="text-sm text-gray-500">
          Please wait while we sync your data...
        </div>
      </motion.div>
    );
  }

  // Fathom connected but no meetings
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-800/50 flex items-center justify-center mb-6">
        <Video className="w-12 h-12 text-gray-400" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 text-center">
        No Meetings Yet
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-8 text-center max-w-md">
        Your Fathom account is connected! Sync your meetings to start analyzing your sales calls.
      </p>
      <div className="flex gap-4">
        <Button
          onClick={handleManualSync}
          disabled={isSyncingNow}
          className="bg-[#37bd7e] hover:bg-[#2da76c] text-white"
        >
          {isSyncingNow ? (
            <>
              <Loader2 className="mr-2 w-5 h-5 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 w-5 h-5" />
              Sync Meetings Now
            </>
          )}
        </Button>
      </div>
      <div className="mt-8 bg-gray-50 dark:bg-gray-900/50 dark:backdrop-blur-xl rounded-xl border border-gray-200 dark:border-gray-800/50 p-6 max-w-md">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">What happens next?</h3>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li className="flex items-start gap-2">
            <span className="text-[#37bd7e] mt-1">•</span>
            <span>Meetings will sync automatically when recorded in Fathom</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#37bd7e] mt-1">•</span>
            <span>You can manually sync anytime using the button above</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#37bd7e] mt-1">•</span>
            <span>Each meeting will be analyzed for insights and coaching</span>
          </li>
        </ul>
      </div>
    </motion.div>
  );
}

