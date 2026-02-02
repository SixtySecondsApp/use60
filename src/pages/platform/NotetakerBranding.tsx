/**
 * NotetakerBranding - Platform Admin Page
 *
 * Manage the platform-wide default bot avatar image for MeetingBaaS deployments.
 * This setting is used when organizations haven't set a custom bot_image_url.
 *
 * Access: Platform Admins only (internal + is_admin)
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Bot,
  Save,
  Loader2,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
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

const SETTING_KEY = 'notetaker_default_bot_image_url';
// Default fallback matches the edge function constant
const DEFAULT_BOT_IMAGE =
  'https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/60-notetaker.jpg';

export default function NotetakerBranding() {
  const navigate = useNavigate();
  const { isPlatformAdmin } = useUserPermissions();

  const [imageUrl, setImageUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalUrl, setOriginalUrl] = useState('');

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
        toast.error('Failed to load default bot image setting');
        return;
      }

      const url = data?.value || DEFAULT_BOT_IMAGE;
      setImageUrl(url);
      setOriginalUrl(url);
      setHasChanges(false);
    } catch (error) {
      console.error('Error loading setting:', error);
      toast.error('Failed to load default bot image setting');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!imageUrl.trim()) {
      toast.error('Image URL cannot be empty');
      return;
    }

    // Basic URL validation
    try {
      new URL(imageUrl);
    } catch {
      toast.error('Please enter a valid URL');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          {
            key: SETTING_KEY,
            value: imageUrl.trim(),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'key',
          }
        );

      if (error) {
        throw error;
      }

      setOriginalUrl(imageUrl.trim());
      setHasChanges(false);
      toast.success('Default bot image updated successfully', {
        description: 'This will be used for all new bot deployments unless an org has a custom override.',
      });
    } catch (error) {
      console.error('Error saving setting:', error);
      toast.error('Failed to save default bot image setting');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setImageUrl(DEFAULT_BOT_IMAGE);
    setHasChanges(DEFAULT_BOT_IMAGE !== originalUrl);
  };

  // Track changes
  useEffect(() => {
    setHasChanges(imageUrl !== originalUrl);
  }, [imageUrl, originalUrl]);

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
        <BackToPlatform />
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
              MeetingBaaS Bot Branding
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Configure the default bot avatar image used across all organizations
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
                <Bot className="h-5 w-5 text-emerald-600" />
                Default Bot Avatar Image
              </CardTitle>
              <CardDescription>
                This image will be used for all MeetingBaaS bot deployments unless an organization
                has set a custom override. Organizations can override this in their recording settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <>
                  {/* Image Preview */}
                  <div className="space-y-2">
                    <Label>Preview</Label>
                    <div className="flex items-center gap-4 p-6 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/30">
                      <div className="relative">
                        <img
                          src={imageUrl || DEFAULT_BOT_IMAGE}
                          alt="Bot Avatar Preview"
                          className="h-20 w-20 rounded-lg shadow-sm object-cover"
                          onError={(e) => {
                            // Fallback to default if image fails to load
                            const target = e.target as HTMLImageElement;
                            if (target.src !== DEFAULT_BOT_IMAGE) {
                              target.src = DEFAULT_BOT_IMAGE;
                            }
                          }}
                        />
                        {imageUrl && imageUrl !== DEFAULT_BOT_IMAGE && (
                          <Badge
                            variant="secondary"
                            className="absolute -top-2 -right-2 text-xs"
                          >
                            Custom
                          </Badge>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          60 Notetaker
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          This is how the bot will appear in meetings
                        </p>
                        {imageUrl && (
                          <a
                            href={imageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1 mt-1"
                          >
                            View full image <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* URL Input */}
                  <div className="space-y-2">
                    <Label htmlFor="imageUrl">Image URL</Label>
                    <Input
                      id="imageUrl"
                      type="url"
                      placeholder="https://example.com/path/to/image.jpg"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Enter a publicly accessible image URL (JPG, PNG, or GIF). Recommended size:
                      512x512 pixels.
                    </p>
                  </div>

                  {/* Info Box */}
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-700/30">
                    <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                    <div className="text-sm text-blue-700 dark:text-blue-300">
                      <p className="font-medium mb-1">How it works</p>
                      <ul className="list-disc list-inside space-y-1 text-blue-600/80 dark:text-blue-400/80">
                        <li>
                          Organizations can override this default in their recording settings
                        </li>
                        <li>
                          If an org has no override, this platform default will be used
                        </li>
                        <li>
                          Changes take effect immediately for new bot deployments
                        </li>
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
