/**
 * NotetakerVideoQuality - Platform Admin Page
 *
 * Configure the default video compression quality for the Lambda pipeline.
 * Stored in app_settings as notetaker_video_quality (480p / 720p / 1080p).
 *
 * Access: Platform Admins only (internal + is_admin)
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  Video,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';

const SETTING_KEY = 'notetaker_video_quality';
const DEFAULT_QUALITY = '480p';

type VideoQuality = '480p' | '720p' | '1080p';

const QUALITY_OPTIONS: {
  value: VideoQuality;
  label: string;
  description: string;
  estimate: string;
}[] = [
  {
    value: '480p',
    label: '480p (Standard)',
    description: 'Good quality for most meetings. Lowest storage cost.',
    estimate: '~150 MB/hr',
  },
  {
    value: '720p',
    label: '720p (HD)',
    description: 'Higher quality for screen-sharing and presentations.',
    estimate: '~350 MB/hr',
  },
  {
    value: '1080p',
    label: '1080p (Full HD)',
    description: 'Maximum quality. Best for detailed visual content.',
    estimate: '~700 MB/hr',
  },
];

export default function NotetakerVideoQuality() {
  const navigate = useNavigate();
  const { isPlatformAdmin } = useUserPermissions();

  const [quality, setQuality] = useState<VideoQuality>(DEFAULT_QUALITY);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalQuality, setOriginalQuality] = useState<VideoQuality>(DEFAULT_QUALITY);

  useEffect(() => {
    loadSetting();
  }, []);

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
        toast.error('Failed to load video quality setting');
        return;
      }

      const val = (data?.value as VideoQuality) || DEFAULT_QUALITY;
      setQuality(val);
      setOriginalQuality(val);
      setHasChanges(false);
    } catch (error) {
      console.error('Error loading setting:', error);
      toast.error('Failed to load video quality setting');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          {
            key: SETTING_KEY,
            value: quality,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'key',
          }
        );

      if (error) {
        throw error;
      }

      setOriginalQuality(quality);
      setHasChanges(false);
      toast.success('Video quality updated successfully', {
        description: `New recordings will be compressed at ${quality}. Existing recordings are not affected.`,
      });
    } catch (error) {
      console.error('Error saving setting:', error);
      toast.error('Failed to save video quality setting');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setQuality(DEFAULT_QUALITY);
    setHasChanges(DEFAULT_QUALITY !== originalQuality);
  };

  // Track changes
  useEffect(() => {
    setHasChanges(quality !== originalQuality);
  }, [quality, originalQuality]);

  // Access control
  if (!isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">You don't have permission to access this page.</p>
        <Button variant="outline" onClick={() => navigate('/platform')}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 mb-8"
        >
          <Button variant="outline" size="icon" onClick={() => navigate('/platform')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Video Quality Settings
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Configure the default compression quality for recorded meetings
            </p>
          </div>
        </motion.div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5 text-purple-600" />
                Recording Compression Quality
              </CardTitle>
              <CardDescription>
                Choose the target resolution for video compression in the Lambda pipeline.
                Higher quality means larger file sizes and higher S3 storage costs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <>
                  {/* Quality Radio Group */}
                  <div className="space-y-3">
                    <Label>Target Resolution</Label>
                    <RadioGroup
                      value={quality}
                      onValueChange={(val) => setQuality(val as VideoQuality)}
                      className="space-y-3"
                    >
                      {QUALITY_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                            quality === opt.value
                              ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                        >
                          <RadioGroupItem value={opt.value} className="mt-0.5" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {opt.label}
                              </span>
                              {opt.value === DEFAULT_QUALITY && (
                                <Badge variant="secondary" className="text-xs">
                                  Default
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                              {opt.description}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                              Est. storage: {opt.estimate}
                            </p>
                          </div>
                        </label>
                      ))}
                    </RadioGroup>
                  </div>

                  {/* Info Box */}
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-700/30">
                    <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                    <div className="text-sm text-blue-700 dark:text-blue-300">
                      <p className="font-medium mb-1">How it works</p>
                      <ul className="list-disc list-inside space-y-1 text-blue-600/80 dark:text-blue-400/80">
                        <li>This setting applies to all new recordings processed by the Lambda pipeline</li>
                        <li>Existing recordings are not re-compressed when this setting changes</li>
                        <li>Higher resolutions increase S3 storage costs proportionally</li>
                      </ul>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-200/50 dark:border-gray-700/30">
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      disabled={!hasChanges || isSaving}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Reset to Default
                    </Button>
                    <div className="flex items-center gap-2">
                      {hasChanges && (
                        <Badge variant="outline" className="text-xs">
                          Unsaved changes
                        </Badge>
                      )}
                      <Button
                        onClick={handleSave}
                        disabled={!hasChanges || isSaving}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            Save Changes
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
