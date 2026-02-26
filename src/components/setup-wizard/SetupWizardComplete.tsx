import { useState, useEffect, useRef } from 'react';
import { Bot, Check, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSetupWizardStore } from '@/lib/stores/setupWizardStore';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { supabase } from '@/lib/supabase/clientV2';
import { cn } from '@/lib/utils';

interface ScanResult {
  briefing: string;
  stats?: {
    deals: number;
    stale_deals: number;
    overdue_tasks: number;
    upcoming_meetings: number;
  };
}

export function SetupWizardComplete() {
  const { closeWizard } = useSetupWizardStore();
  const { user } = useAuth();
  const activeOrgId = useActiveOrgId();

  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const hasRun = useRef(false);

  // Run agent scan + create persona on mount (once only)
  useEffect(() => {
    if (hasRun.current || !user?.id || !activeOrgId) return;
    hasRun.current = true;

    // Fire-and-forget: create agent persona with defaults
    supabase.rpc('upsert_agent_persona', {
      p_user_id: user.id,
      p_org_id: activeOrgId,
      p_agent_name: 'Sixty',
      p_tone: 'concise',
      p_custom_instructions: null,
      p_proactive_frequency: 'balanced',
      p_focus_areas: ['pipeline', 'meetings'],
      p_quiet_hours_start: '20:00',
      p_quiet_hours_end: '08:00',
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      p_morning_briefing_time: '08:00',
      p_morning_briefing_enabled: true,
    }).catch((err) => console.error('[SetupWizardComplete] Persona creation failed:', err));

    // Run the initial scan
    const runScan = async () => {
      setIsScanning(true);
      try {
        const { data, error } = await supabase.functions.invoke('agent-initial-scan', {
          body: { user_id: user.id, org_id: activeOrgId },
        });
        if (error) throw error;
        setScanResult(data);
      } catch (err) {
        console.error('[SetupWizardComplete] Scan failed:', err);
        setScanResult({
          briefing: "I'm ready to start monitoring your pipeline. You'll see my first morning briefing tomorrow at 8:00 AM.",
        });
      } finally {
        setIsScanning(false);
      }
    };

    runScan();
  }, [user?.id, activeOrgId]);

  return (
    <div className="p-8">
      {/* Hero icon */}
      <div className="text-center mb-5">
        <div className={cn(
          'inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4',
          isScanning
            ? 'bg-gradient-to-br from-blue-500 to-purple-600 animate-pulse'
            : 'bg-gradient-to-br from-emerald-400 to-blue-500'
        )}>
          {isScanning ? (
            <Bot className="w-8 h-8 text-white" />
          ) : (
            <Check className="w-8 h-8 text-white" />
          )}
        </div>

        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          {isScanning ? 'Sixty is scanning your workspace...' : "Here's what I found"}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {isScanning
            ? 'Analyzing your deals, meetings, and tasks from the last 7 days.'
            : 'Your workspace is connected and I\'m ready to go.'}
        </p>
      </div>

      {/* Scanning spinner */}
      {isScanning && (
        <div className="flex justify-center mb-6">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      )}

      {/* Scan results */}
      {!isScanning && scanResult && (
        <div className="space-y-4 mb-6">
          {/* Briefing text */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/50 p-4">
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {scanResult.briefing}
            </p>
          </div>

          {/* Stats grid */}
          {scanResult.stats && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Active Deals', value: scanResult.stats.deals },
                { label: 'Stale Deals', value: scanResult.stats.stale_deals },
                { label: 'Overdue Tasks', value: scanResult.stats.overdue_tasks },
                { label: 'Upcoming Meetings', value: scanResult.stats.upcoming_meetings },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/30 p-3">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* What to expect */}
          <div className="space-y-2">
            {[
              "I'll send your first morning briefing tomorrow at 8:00 AM",
              "I'll alert you when deals need attention",
              'All my activity will appear in your agent feed',
              'You can customize me anytime in Settings',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-gray-600 dark:text-gray-300">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Credits earned card */}
      <div className="rounded-xl border border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-900/20 p-4 mb-5 text-center">
        <div className="flex items-center justify-center gap-2 mb-0.5">
          <Sparkles className="w-4 h-4 text-green-600 dark:text-green-400" />
          <span className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wider">
            Total earned
          </span>
        </div>
        <div className="text-3xl font-bold text-green-700 dark:text-green-300">
          100
        </div>
        <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">credits</p>
      </div>

      {/* CTA */}
      <Button
        onClick={closeWizard}
        disabled={isScanning}
        className={cn(
          'w-full h-11 font-medium rounded-xl transition-all',
          isScanning
            ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white'
        )}
      >
        {isScanning ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Scanning...
          </span>
        ) : (
          "Let's Go"
        )}
      </Button>
    </div>
  );
}
