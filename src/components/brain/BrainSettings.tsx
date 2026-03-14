/**
 * BrainSettings — Memory Settings tab content for the Brain page
 *
 * Sections:
 * 1. Memory Stats — counts per category, oldest/newest dates
 * 2. Category Toggles — enable/disable memory collection per category
 * 3. Decay Rate — slider per category to adjust decay speed
 * 4. Bulk Purge — purge by category, by date, or purge all
 *
 * Preferences are stored in user_settings.preferences.memory_preferences JSONB.
 *
 * TRINITY-015
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Settings,
  Loader2,
  Trash2,
  Calendar as CalendarIcon,
  Save,
  BarChart3,
  ToggleLeft,
  Gauge,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type MemoryCategory = 'deal' | 'relationship' | 'preference' | 'commitment' | 'fact';

interface MemoryPreferences {
  category_enabled: Record<MemoryCategory, boolean>;
  decay_rates: Record<MemoryCategory, number>;
}

interface CategoryStats {
  category: MemoryCategory;
  count: number;
}

interface MemoryDateRange {
  oldest: string | null;
  newest: string | null;
}

// ============================================================================
// Constants
// ============================================================================

const CATEGORIES: { id: MemoryCategory; label: string }[] = [
  { id: 'deal', label: 'Deal' },
  { id: 'relationship', label: 'Relationship' },
  { id: 'preference', label: 'Preference' },
  { id: 'commitment', label: 'Commitment' },
  { id: 'fact', label: 'Fact' },
];

const DECAY_RATE_STEPS = [0.5, 1, 1.5, 2] as const;

const DECAY_RATE_LABELS: Record<number, string> = {
  0.5: '0.5x (Slower)',
  1: '1x (Normal)',
  1.5: '1.5x (Faster)',
  2: '2x (Fastest)',
};

/** Map slider index (0-3) to decay rate value */
function sliderIndexToRate(index: number): number {
  return DECAY_RATE_STEPS[index] ?? 1;
}

/** Map decay rate value to slider index (0-3) */
function rateToSliderIndex(rate: number): number {
  const idx = DECAY_RATE_STEPS.indexOf(rate as (typeof DECAY_RATE_STEPS)[number]);
  return idx === -1 ? 1 : idx; // default to 1x
}

const DEFAULT_PREFERENCES: MemoryPreferences = {
  category_enabled: {
    deal: true,
    relationship: true,
    preference: true,
    commitment: true,
    fact: true,
  },
  decay_rates: {
    deal: 1,
    relationship: 1,
    preference: 1,
    commitment: 1,
    fact: 1,
  },
};

// ============================================================================
// Section Header
// ============================================================================

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-gray-800/50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="h-4.5 w-4.5 text-slate-500 dark:text-gray-400" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-100">{title}</h3>
        <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Memory Stats Section
// ============================================================================

function MemoryStatsSection({
  stats,
  dateRange,
  loading,
}: {
  stats: CategoryStats[];
  dateRange: MemoryDateRange;
  loading: boolean;
}) {
  const totalCount = useMemo(
    () => stats.reduce((sum, s) => sum + s.count, 0),
    [stats]
  );

  if (loading) {
    return (
      <Card className="p-5">
        <SectionHeader
          icon={BarChart3}
          title="Memory Stats"
          description="Overview of stored memories"
        />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <SectionHeader
        icon={BarChart3}
        title="Memory Stats"
        description="Overview of stored memories"
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        {/* Total */}
        <div className="rounded-lg border border-slate-200 dark:border-gray-700/50 bg-slate-50 dark:bg-gray-800/30 p-3">
          <p className="text-xs text-slate-400 dark:text-gray-500">Total</p>
          <p className="text-lg font-semibold text-slate-800 dark:text-gray-100 tabular-nums">
            {totalCount}
          </p>
        </div>
        {/* Per category */}
        {CATEGORIES.map((cat) => {
          const stat = stats.find((s) => s.category === cat.id);
          return (
            <div
              key={cat.id}
              className="rounded-lg border border-slate-200 dark:border-gray-700/50 bg-slate-50 dark:bg-gray-800/30 p-3"
            >
              <p className="text-xs text-slate-400 dark:text-gray-500">{cat.label}</p>
              <p className="text-lg font-semibold text-slate-800 dark:text-gray-100 tabular-nums">
                {stat?.count ?? 0}
              </p>
            </div>
          );
        })}
      </div>

      {/* Date range */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-400 dark:text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <CalendarIcon className="h-3.5 w-3.5" />
          Oldest:{' '}
          {dateRange.oldest
            ? format(new Date(dateRange.oldest), 'MMM d, yyyy')
            : 'N/A'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarIcon className="h-3.5 w-3.5" />
          Newest:{' '}
          {dateRange.newest
            ? format(new Date(dateRange.newest), 'MMM d, yyyy')
            : 'N/A'}
        </span>
      </div>
    </Card>
  );
}

// ============================================================================
// Category Toggles Section
// ============================================================================

function CategoryTogglesSection({
  preferences,
  onChange,
}: {
  preferences: MemoryPreferences;
  onChange: (next: MemoryPreferences) => void;
}) {
  const handleToggle = (cat: MemoryCategory, enabled: boolean) => {
    onChange({
      ...preferences,
      category_enabled: { ...preferences.category_enabled, [cat]: enabled },
    });
  };

  return (
    <Card className="p-5">
      <SectionHeader
        icon={ToggleLeft}
        title="Category Toggles"
        description="Enable or disable memory collection per category"
      />
      <div className="space-y-3">
        {CATEGORIES.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-gray-800/50 last:border-0"
          >
            <Label
              htmlFor={`toggle-${cat.id}`}
              className="text-sm text-slate-700 dark:text-gray-200 cursor-pointer"
            >
              {cat.label} memories
            </Label>
            <Switch
              id={`toggle-${cat.id}`}
              checked={preferences.category_enabled[cat.id]}
              onCheckedChange={(checked) => handleToggle(cat.id, checked)}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ============================================================================
// Decay Rate Section
// ============================================================================

function DecayRateSection({
  preferences,
  onChange,
}: {
  preferences: MemoryPreferences;
  onChange: (next: MemoryPreferences) => void;
}) {
  const handleRateChange = (cat: MemoryCategory, sliderValue: number[]) => {
    const rate = sliderIndexToRate(sliderValue[0]);
    onChange({
      ...preferences,
      decay_rates: { ...preferences.decay_rates, [cat]: rate },
    });
  };

  return (
    <Card className="p-5">
      <SectionHeader
        icon={Gauge}
        title="Decay Rate"
        description="Adjust how quickly memories decay per category"
      />
      <div className="space-y-5">
        {CATEGORIES.map((cat) => {
          const rate = preferences.decay_rates[cat.id];
          const sliderIndex = rateToSliderIndex(rate);

          return (
            <div key={cat.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-slate-700 dark:text-gray-200">
                  {cat.label}
                </Label>
                <span className="text-xs font-medium text-slate-500 dark:text-gray-400 tabular-nums">
                  {DECAY_RATE_LABELS[rate] ?? `${rate}x`}
                </span>
              </div>
              <Slider
                min={0}
                max={3}
                step={1}
                value={[sliderIndex]}
                onValueChange={(v) => handleRateChange(cat.id, v)}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-slate-400 dark:text-gray-500">
                <span>Slower</span>
                <span>Normal</span>
                <span>Faster</span>
                <span>Fastest</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ============================================================================
// Purge Confirmation Dialog
// ============================================================================

function PurgeConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  count,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  count: number | null;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description}
            {count !== null && (
              <span className="block mt-2 font-medium text-slate-700 dark:text-gray-200">
                {count} {count === 1 ? 'memory' : 'memories'} will be permanently deleted.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={loading || count === 0}
            className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-500"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================================
// Bulk Purge Section
// ============================================================================

function BulkPurgeSection({ userId }: { userId: string }) {
  // ---- Purge by category ----
  const [purgeCategory, setPurgeCategory] = useState<MemoryCategory>('deal');
  const [purgeCategoryOpen, setPurgeCategoryOpen] = useState(false);
  const [purgeCategoryCount, setPurgeCategoryCount] = useState<number | null>(null);
  const [purgeCategoryLoading, setPurgeCategoryLoading] = useState(false);

  // ---- Purge by date ----
  const [purgeBeforeDate, setPurgeBeforeDate] = useState<Date | undefined>(undefined);
  const [purgeDateOpen, setPurgeDateOpen] = useState(false);
  const [purgeDateCount, setPurgeDateCount] = useState<number | null>(null);
  const [purgeDateLoading, setPurgeDateLoading] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // ---- Purge all ----
  const [purgeAllOpen, setPurgeAllOpen] = useState(false);
  const [purgeAllCount, setPurgeAllCount] = useState<number | null>(null);
  const [purgeAllLoading, setPurgeAllLoading] = useState(false);

  // Fetch count before confirming purge by category
  const openPurgeCategoryDialog = useCallback(async () => {
    const { count, error } = await supabase
      .from('copilot_memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('category', purgeCategory);

    if (error) {
      toast.error('Failed to count memories');
      return;
    }
    setPurgeCategoryCount(count ?? 0);
    setPurgeCategoryOpen(true);
  }, [userId, purgeCategory]);

  const confirmPurgeCategory = useCallback(async () => {
    setPurgeCategoryLoading(true);
    try {
      const { error } = await supabase
        .from('copilot_memories')
        .delete()
        .eq('user_id', userId)
        .eq('category', purgeCategory);

      if (error) throw error;
      toast.success(`Deleted all ${purgeCategory} memories`);
      setPurgeCategoryOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to purge memories');
    } finally {
      setPurgeCategoryLoading(false);
    }
  }, [userId, purgeCategory]);

  // Fetch count before confirming purge by date
  const openPurgeDateDialog = useCallback(async () => {
    if (!purgeBeforeDate) {
      toast.error('Please select a date');
      return;
    }
    const dateStr = purgeBeforeDate.toISOString();
    const { count, error } = await supabase
      .from('copilot_memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lt('created_at', dateStr);

    if (error) {
      toast.error('Failed to count memories');
      return;
    }
    setPurgeDateCount(count ?? 0);
    setPurgeDateOpen(true);
  }, [userId, purgeBeforeDate]);

  const confirmPurgeDate = useCallback(async () => {
    if (!purgeBeforeDate) return;
    setPurgeDateLoading(true);
    try {
      const dateStr = purgeBeforeDate.toISOString();
      const { error } = await supabase
        .from('copilot_memories')
        .delete()
        .eq('user_id', userId)
        .lt('created_at', dateStr);

      if (error) throw error;
      toast.success(`Deleted memories created before ${format(purgeBeforeDate, 'MMM d, yyyy')}`);
      setPurgeDateOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to purge memories');
    } finally {
      setPurgeDateLoading(false);
    }
  }, [userId, purgeBeforeDate]);

  // Fetch count before confirming purge all
  const openPurgeAllDialog = useCallback(async () => {
    const { count, error } = await supabase
      .from('copilot_memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      toast.error('Failed to count memories');
      return;
    }
    setPurgeAllCount(count ?? 0);
    setPurgeAllOpen(true);
  }, [userId]);

  const confirmPurgeAll = useCallback(async () => {
    setPurgeAllLoading(true);
    try {
      const { error } = await supabase
        .from('copilot_memories')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;
      toast.success('All memories deleted');
      setPurgeAllOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to purge memories');
    } finally {
      setPurgeAllLoading(false);
    }
  }, [userId]);

  return (
    <Card className="p-5">
      <SectionHeader
        icon={Trash2}
        title="Bulk Purge"
        description="Permanently delete memories. This action cannot be undone."
      />

      <div className="space-y-5">
        {/* Purge by category */}
        <div className="rounded-lg border border-slate-200 dark:border-gray-700/50 p-4 space-y-3">
          <p className="text-sm font-medium text-slate-700 dark:text-gray-200">
            Purge by category
          </p>
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <Label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">
                Category
              </Label>
              <Select
                value={purgeCategory}
                onValueChange={(v) => setPurgeCategory(v as MemoryCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={openPurgeCategoryDialog}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete All
            </Button>
          </div>
        </div>

        {/* Purge by date */}
        <div className="rounded-lg border border-slate-200 dark:border-gray-700/50 p-4 space-y-3">
          <p className="text-sm font-medium text-slate-700 dark:text-gray-200">
            Purge by date range
          </p>
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <Label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">
                Delete memories created before
              </Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !purgeBeforeDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {purgeBeforeDate
                      ? format(purgeBeforeDate, 'MMM d, yyyy')
                      : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={purgeBeforeDate}
                    onSelect={(date) => {
                      setPurgeBeforeDate(date);
                      setDatePickerOpen(false);
                    }}
                    disabled={(date) => date > new Date()}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={openPurgeDateDialog}
              disabled={!purgeBeforeDate}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
          </div>
        </div>

        {/* Purge all */}
        <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/5 p-4 space-y-3">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            Danger zone
          </p>
          <p className="text-xs text-red-600/70 dark:text-red-400/60">
            This will permanently delete all memories for your account.
          </p>
          <Button
            variant="destructive"
            onClick={openPurgeAllDialog}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete All Memories
          </Button>
        </div>
      </div>

      {/* Confirmation dialogs */}
      <PurgeConfirmDialog
        open={purgeCategoryOpen}
        onOpenChange={setPurgeCategoryOpen}
        title={`Delete all ${purgeCategory} memories?`}
        description={`This will permanently delete all memories in the "${purgeCategory}" category.`}
        count={purgeCategoryCount}
        onConfirm={confirmPurgeCategory}
        loading={purgeCategoryLoading}
      />

      <PurgeConfirmDialog
        open={purgeDateOpen}
        onOpenChange={setPurgeDateOpen}
        title="Delete memories by date?"
        description={
          purgeBeforeDate
            ? `This will permanently delete all memories created before ${format(purgeBeforeDate, 'MMM d, yyyy')}.`
            : 'This will permanently delete memories before the selected date.'
        }
        count={purgeDateCount}
        onConfirm={confirmPurgeDate}
        loading={purgeDateLoading}
      />

      <PurgeConfirmDialog
        open={purgeAllOpen}
        onOpenChange={setPurgeAllOpen}
        title="Delete ALL memories?"
        description="This will permanently delete every memory associated with your account. This action cannot be undone."
        count={purgeAllCount}
        onConfirm={confirmPurgeAll}
        loading={purgeAllLoading}
      />
    </Card>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function BrainSettings() {
  const { user } = useAuth();
  const userId = user?.id;

  // Loading states
  const [statsLoading, setStatsLoading] = useState(true);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Data
  const [stats, setStats] = useState<CategoryStats[]>([]);
  const [dateRange, setDateRange] = useState<MemoryDateRange>({ oldest: null, newest: null });
  const [preferences, setPreferences] = useState<MemoryPreferences>(DEFAULT_PREFERENCES);

  // ---- Load stats ----
  useEffect(() => {
    if (!userId) return;

    const loadStats = async () => {
      setStatsLoading(true);
      try {
        // Get counts per category
        // We need to query each category separately since Supabase JS doesn't support GROUP BY
        const countPromises = CATEGORIES.map(async (cat) => {
          const { count, error } = await supabase
            .from('copilot_memories')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('category', cat.id);

          if (error) throw error;
          return { category: cat.id, count: count ?? 0 } as CategoryStats;
        });

        // Get oldest and newest dates
        const [oldestRes, newestRes] = await Promise.all([
          supabase
            .from('copilot_memories')
            .select('created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: true })
            .limit(1),
          supabase
            .from('copilot_memories')
            .select('created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1),
        ]);

        const categoryStats = await Promise.all(countPromises);
        setStats(categoryStats);
        setDateRange({
          oldest: oldestRes.data?.[0]?.created_at ?? null,
          newest: newestRes.data?.[0]?.created_at ?? null,
        });
      } catch (e) {
        toast.error('Failed to load memory stats');
      } finally {
        setStatsLoading(false);
      }
    };

    loadStats();
  }, [userId]);

  // ---- Load preferences ----
  useEffect(() => {
    if (!userId) return;

    const loadPrefs = async () => {
      setPrefsLoading(true);
      try {
        const { data: settings, error } = await supabase
          .from('user_settings')
          .select('id, preferences')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;

        if (settings) {
          const prefs = (settings.preferences as Record<string, unknown>) ?? {};
          const memPrefs = prefs.memory_preferences as Partial<MemoryPreferences> | undefined;

          if (memPrefs) {
            setPreferences({
              category_enabled: {
                ...DEFAULT_PREFERENCES.category_enabled,
                ...(memPrefs.category_enabled ?? {}),
              },
              decay_rates: {
                ...DEFAULT_PREFERENCES.decay_rates,
                ...(memPrefs.decay_rates ?? {}),
              },
            });
          }
        }
      } catch (e) {
        toast.error('Failed to load memory preferences');
      } finally {
        setPrefsLoading(false);
      }
    };

    loadPrefs();
  }, [userId]);

  // ---- Save preferences ----
  const savePreferences = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    try {
      // Re-fetch current settings to merge
      const { data: existing, error: fetchError } = await supabase
        .from('user_settings')
        .select('id, preferences')
        .eq('user_id', userId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const currentPrefs = (existing?.preferences as Record<string, unknown>) ?? {};
      const nextPrefs = {
        ...currentPrefs,
        memory_preferences: preferences,
      };

      const payload = {
        user_id: userId,
        preferences: nextPrefs,
      };

      const { error } = existing
        ? await supabase.from('user_settings').update(payload).eq('id', existing.id)
        : await supabase.from('user_settings').insert(payload);

      if (error) throw error;

      toast.success('Memory preferences saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }, [userId, preferences]);

  // ---- Loading state ----
  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-gray-800/50 flex items-center justify-center mb-4">
          <Settings className="h-7 w-7 text-slate-400 dark:text-gray-500" />
        </div>
        <p className="text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
          Sign in required
        </p>
        <p className="text-xs text-slate-400 dark:text-gray-500">
          Please sign in to manage memory settings
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl pb-8">
      {/* Memory Stats */}
      <MemoryStatsSection stats={stats} dateRange={dateRange} loading={statsLoading} />

      {/* Category Toggles + Decay Rate */}
      {prefsLoading ? (
        <Card className="p-5">
          <div className="space-y-4">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-9 rounded-full" />
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <>
          <CategoryTogglesSection
            preferences={preferences}
            onChange={setPreferences}
          />

          <DecayRateSection
            preferences={preferences}
            onChange={setPreferences}
          />

          {/* Save button */}
          <div className="flex justify-end">
            <Button onClick={savePreferences} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {saving ? 'Saving...' : 'Save Preferences'}
            </Button>
          </div>
        </>
      )}

      {/* Bulk Purge */}
      <BulkPurgeSection userId={userId} />
    </div>
  );
}
