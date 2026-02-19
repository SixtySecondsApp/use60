/**
 * NotetakerRecordingLimit - Platform Admin Page
 *
 * Manage the platform-wide default monthly recording limit for 60 Notetaker.
 * This setting is used when creating a new recording_usage record for an org,
 * and as the fallback when no usage record exists yet.
 *
 * Access: Platform Admins only (internal + is_admin)
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Video,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';

const SETTING_KEY = 'notetaker_default_recording_limit';
const DEFAULT_LIMIT = 20;

export default function NotetakerRecordingLimit() {
  const { isPlatformAdmin } = useUserPermissions();

  const [limitValue, setLimitValue] = useState(String(DEFAULT_LIMIT));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalValue, setOriginalValue] = useState(String(DEFAULT_LIMIT));

  useEffect(() => {
    loadSetting();
  }, []);

  useEffect(() => {
    setHasChanges(limitValue !== originalValue);
  }, [limitValue, originalValue]);

  const loadSetting = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', SETTING_KEY)
        .maybeSingle();

      if (error) {
        console.error('Error loading setting:', error);
        toast.error('Failed to load recording limit setting');
        return;
      }

      const value = data?.value ?? String(DEFAULT_LIMIT);
      setLimitValue(value);
      setOriginalValue(value);
      setHasChanges(false);
    } catch (error) {
      console.error('Error loading setting:', error);
      toast.error('Failed to load recording limit setting');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    const parsed = parseInt(limitValue, 10);
    if (isNaN(parsed) || parsed < 1) {
      toast.error('Please enter a valid number (minimum 1)');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          {
            key: SETTING_KEY,
            value: String(parsed),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );

      if (error) throw error;

      const saved = String(parsed);
      setLimitValue(saved);
      setOriginalValue(saved);
      setHasChanges(false);
      toast.success('Recording limit updated successfully', {
        description: 'New organizations will use this limit. Existing usage records are not affected.',
      });
    } catch (error) {
      console.error('Error saving setting:', error);
      toast.error('Failed to save recording limit setting');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setLimitValue(String(DEFAULT_LIMIT));
  };

  if (!isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="text-lg font-medium text-gray-900 dark:text-gray-100">Access Denied</p>
        <p className="text-sm text-gray-500">Platform admin access required</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <BackToPlatform />

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
          <Video className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            MeetingBaaS Recording Limit
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Default monthly recording limit for all organizations
          </p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-emerald-600" />
              Default Monthly Limit
            </CardTitle>
            <CardDescription>
              Maximum number of recordings an organization can make per month.
              Applied to new organizations and used as fallback when no usage record exists.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading current setting...
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="recordingLimit">Recordings per month</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="recordingLimit"
                      type="number"
                      min={1}
                      max={10000}
                      value={limitValue}
                      onChange={(e) => setLimitValue(e.target.value)}
                      className="w-32"
                    />
                    <span className="text-sm text-gray-500 dark:text-gray-400">recordings / month</span>
                    {!hasChanges && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Saved
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Existing organizations with an active usage record this month are not affected — only new records will use this value.
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleSave}
                    disabled={isSaving || !hasChanges}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Limit
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    disabled={isSaving || limitValue === String(DEFAULT_LIMIT)}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reset to {DEFAULT_LIMIT}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="border-amber-200/50 dark:border-amber-700/30 bg-amber-50/50 dark:bg-amber-900/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                <p className="font-medium">How this limit works</p>
                <ul className="text-amber-600/90 dark:text-amber-400/80 space-y-1 list-disc list-inside">
                  <li>When an org deploys their first bot of the month, a usage record is created with this limit.</li>
                  <li>If an org already has a usage record this month, their existing limit is preserved.</li>
                  <li>To override a specific org's limit, update <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 rounded">recording_usage.recordings_limit</code> directly in the database.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
