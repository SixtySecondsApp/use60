/**
 * ShareFactProfileDialog -- Share settings for a Fact Profile.
 *
 * Provides a dialog to toggle public sharing, copy the share URL,
 * set/remove a password, configure an expiry date, and view share
 * analytics (view count, last viewed at).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { factProfileKeys } from '@/lib/hooks/useFactProfiles';
import {
  Share2,
  Copy,
  Check,
  Eye,
  Lock,
  Unlock,
  Calendar,
  Link2,
  Loader2,
} from 'lucide-react';
import type { FactProfile } from '@/lib/types/factProfile';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ShareFactProfileDialogProps {
  profile: FactProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
}

function getShareUrl(shareToken: string): string {
  return `${window.location.origin}/share/fact-profile/${shareToken}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ShareFactProfileDialog({
  profile,
  open,
  onOpenChange,
}: ShareFactProfileDialogProps) {
  const queryClient = useQueryClient();

  // Local state derived from profile
  const [isPublic, setIsPublic] = useState(false);
  const [password, setPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync local state when profile changes or dialog opens
  useEffect(() => {
    if (profile && open) {
      setIsPublic(profile.is_public);
      setHasPassword(!!profile.share_password_hash);
      setPassword('');
      setExpiryDate(profile.share_expires_at ? profile.share_expires_at.split('T')[0] : '');
      setCopied(false);
    }
  }, [profile, open]);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  const handleCopy = useCallback(async () => {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(getShareUrl(profile.share_token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  }, [profile]);

  const invalidateCache = useCallback(() => {
    if (!profile) return;
    queryClient.invalidateQueries({ queryKey: factProfileKeys.list(profile.organization_id) });
    queryClient.invalidateQueries({ queryKey: factProfileKeys.detail(profile.id) });
  }, [profile, queryClient]);

  const handleSave = useCallback(async () => {
    if (!profile) return;
    setSaving(true);

    try {
      // 1. Toggle public if changed
      if (isPublic !== profile.is_public) {
        const { data, error } = await supabase.functions.invoke('fact-profile-share', {
          body: { action: 'toggle_public', profileId: profile.id, is_public: isPublic },
        });
        if (error || !data?.success) {
          throw new Error(data?.error || error?.message || 'Failed to update sharing');
        }
      }

      // 2. Handle password changes
      if (password) {
        // User typed a new password
        const { data, error } = await supabase.functions.invoke('fact-profile-share', {
          body: { action: 'set_password', profileId: profile.id, password },
        });
        if (error || !data?.success) {
          throw new Error(data?.error || error?.message || 'Failed to set password');
        }
      } else if (hasPassword && profile.share_password_hash && !password) {
        // hasPassword is still true, no new password typed -- keep existing password (no-op)
      }

      // 3. Handle expiry changes
      const currentExpiry = profile.share_expires_at ? profile.share_expires_at.split('T')[0] : '';
      if (expiryDate !== currentExpiry) {
        const { data, error } = await supabase.functions.invoke('fact-profile-share', {
          body: {
            action: 'set_expiry',
            profileId: profile.id,
            expires_at: expiryDate ? `${expiryDate}T23:59:59Z` : null,
          },
        });
        if (error || !data?.success) {
          throw new Error(data?.error || error?.message || 'Failed to set expiry');
        }
      }

      invalidateCache();
      toast.success('Share settings updated');
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save share settings';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [profile, isPublic, password, hasPassword, expiryDate, invalidateCache, onOpenChange]);

  const handleRemovePassword = useCallback(async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('fact-profile-share', {
        body: { action: 'remove_password', profileId: profile.id },
      });
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Failed to remove password');
      }
      setHasPassword(false);
      setPassword('');
      invalidateCache();
      toast.success('Password removed');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove password';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [profile, invalidateCache]);

  if (!profile) return null;

  const shareUrl = getShareUrl(profile.share_token);
  const lastViewedLabel = formatRelativeTime(profile.last_viewed_at);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#1E293B] dark:text-gray-100">
            <Share2 className="h-5 w-5 text-[#64748B] dark:text-gray-400" />
            Share Fact Profile
          </DialogTitle>
          <DialogDescription className="text-[#64748B] dark:text-gray-400">
            Configure external sharing for &ldquo;{profile.company_name}&rdquo;
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ---- Public sharing toggle ---- */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isPublic ? (
                <Unlock className="h-4 w-4 text-brand-teal" />
              ) : (
                <Lock className="h-4 w-4 text-[#94A3B8] dark:text-gray-500" />
              )}
              <span className="text-sm font-medium text-[#1E293B] dark:text-gray-100">
                Public sharing
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isPublic}
              onClick={() => setIsPublic(!isPublic)}
              className={`
                relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-blue-500 focus-visible:ring-offset-2
                ${isPublic ? 'bg-brand-blue' : 'bg-[#E2E8F0] dark:bg-gray-700'}
              `}
            >
              <span
                className={`
                  pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0
                  transition duration-200 ease-in-out
                  ${isPublic ? 'translate-x-5' : 'translate-x-0'}
                `}
              />
            </button>
          </div>

          {/* ---- Sharing details (visible when public) ---- */}
          {isPublic && (
            <div className="space-y-4 rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC] dark:bg-gray-800/50 p-4">
              {/* Share link */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-[#64748B] dark:text-gray-400">
                  <Link2 className="h-3.5 w-3.5" />
                  Share link
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 px-3 py-2 text-xs text-[#1E293B] dark:text-gray-100 truncate"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-brand-teal" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-[#64748B] dark:text-gray-400">
                  <Lock className="h-3.5 w-3.5" />
                  {hasPassword ? 'Update password' : 'Set password'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={hasPassword ? 'Enter new password...' : 'Optional password...'}
                    className="flex-1 rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 px-3 py-2 text-xs text-[#1E293B] dark:text-gray-100 placeholder:text-[#94A3B8] dark:placeholder:text-gray-500"
                  />
                  {hasPassword && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemovePassword}
                      disabled={saving}
                      className="shrink-0 text-xs text-red-500 hover:text-red-600"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>

              {/* Expiry date */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-[#64748B] dark:text-gray-400">
                  <Calendar className="h-3.5 w-3.5" />
                  Expiry date
                </label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 px-3 py-2 text-xs text-[#1E293B] dark:text-gray-100"
                />
                {expiryDate && (
                  <button
                    type="button"
                    onClick={() => setExpiryDate('')}
                    className="text-xs text-[#64748B] dark:text-gray-400 hover:text-[#1E293B] dark:hover:text-gray-200 underline"
                  >
                    Remove expiry
                  </button>
                )}
              </div>

              {/* View analytics */}
              <div className="flex items-center gap-4 pt-1 border-t border-[#E2E8F0] dark:border-gray-700/50">
                <div className="flex items-center gap-1.5 text-xs text-[#64748B] dark:text-gray-400">
                  <Eye className="h-3.5 w-3.5" />
                  <span>
                    Viewed {profile.share_views} time{profile.share_views === 1 ? '' : 's'}
                  </span>
                </div>
                {lastViewedLabel && (
                  <div className="text-xs text-[#94A3B8] dark:text-gray-500">
                    Last viewed {lastViewedLabel}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
