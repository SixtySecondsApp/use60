import React, { useState, useCallback, useEffect, memo, useRef } from 'react';
import {
  Link2,
  Copy,
  Check,
  Eye,
  Globe,
  Lock,
  Loader2,
  FileText,
  ListChecks,
  ScrollText,
  Video,
  ExternalLink,
  Mail,
  X,
  Send,
  UserPlus,
  Shield,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { useUser } from '@/lib/hooks/useUser';

interface ShareOptions {
  include_summary: boolean;
  include_action_items: boolean;
  include_transcript: boolean;
  include_recording: boolean;
}

interface ShareEmail {
  id: string;
  email: string;
  invited_at: string;
  verified_at: string | null;
  last_accessed_at: string | null;
  expires_at: string;
}

interface ShareMeetingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  meetingTitle: string;
  sourceType: 'fathom' | 'voice' | null;
  fathomShareUrl?: string | null;
  voiceRecordingId?: string | null;
  hasSummary?: boolean;
  hasActionItems?: boolean;
  hasTranscript?: boolean;
}

/**
 * ShareMeetingModal - Dialog to manage meeting sharing
 * Supports public (anyone with link) and private (email-verified) modes
 */
export const ShareMeetingModal = memo(function ShareMeetingModal({
  open,
  onOpenChange,
  meetingId,
  meetingTitle,
  sourceType,
  fathomShareUrl,
  voiceRecordingId,
  hasSummary = false,
  hasActionItems = false,
  hasTranscript = false,
}: ShareMeetingModalProps) {
  const { userData } = useUser();
  const [isPublic, setIsPublic] = useState(false);
  const [shareMode, setShareMode] = useState<'public' | 'private'>('public');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareViews, setShareViews] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [isSavingOptions, setIsSavingOptions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email invite state
  const [emailInput, setEmailInput] = useState('');
  const [isAddingEmail, setIsAddingEmail] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState<string | null>(null);
  const [sharedEmails, setSharedEmails] = useState<ShareEmail[]>([]);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const [shareOptions, setShareOptions] = useState<ShareOptions>({
    include_summary: true,
    include_action_items: true,
    include_transcript: false,
    include_recording: true,
  });

  // Fetch current sharing status
  useEffect(() => {
    if (!open || !meetingId) return;

    const fetchSharingStatus = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('meetings')
          .select('is_public, share_token, share_views, share_options, share_mode')
          .eq('id', meetingId)
          .maybeSingle();

        if (fetchError) {
          setError('Failed to load sharing status');
          console.error('Error fetching sharing status:', fetchError);
        } else if (data) {
          setIsPublic(data.is_public || false);
          setShareViews(data.share_views || 0);
          setShareMode(data.share_mode || 'public');
          setShareToken(data.share_token || null);

          if (data.share_options) {
            setShareOptions(data.share_options as ShareOptions);
          }

          if (data.is_public && data.share_token) {
            const appUrl = window.location.origin;
            setShareUrl(`${appUrl}/share/meeting/${data.share_token}`);
          } else {
            setShareUrl(null);
          }
        }

        // Fetch shared emails (non-fatal — may fail if user isn't owner)
        try {
          const { data: emailData } = await supabase.rpc('get_meeting_share_emails', {
            p_meeting_id: meetingId,
          });

          if (emailData?.success && emailData.emails) {
            setSharedEmails(emailData.emails);
          }
        } catch (emailErr) {
          console.warn('Could not fetch share emails:', emailErr);
        }
      } catch (err) {
        setError('Failed to load sharing status');
        console.error('Error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSharingStatus();
  }, [open, meetingId]);

  // Toggle sharing on/off — uses SECURITY DEFINER RPC to bypass RLS
  const handleToggleSharing = useCallback(async () => {
    setIsToggling(true);
    setError(null);

    try {
      const newIsPublic = !isPublic;

      const { data, error: rpcError } = await supabase.rpc('toggle_meeting_sharing', {
        p_meeting_id: meetingId,
        p_is_public: newIsPublic,
        p_share_mode: newIsPublic ? shareMode : 'public',
        p_share_options: shareOptions,
      });

      if (rpcError) {
        console.error('Share toggle RPC error:', rpcError);
        throw rpcError;
      }
      if (!data?.success) {
        throw new Error(data?.error === 'not_authorized'
          ? 'You do not have permission to share this meeting'
          : data?.error || 'Failed to update sharing');
      }

      setIsPublic(newIsPublic);

      if (newIsPublic && data.share_token) {
        const appUrl = window.location.origin;
        const newShareUrl = `${appUrl}/share/meeting/${data.share_token}`;
        setShareUrl(newShareUrl);
        setShareToken(data.share_token);
        toast.success('Sharing enabled');
      } else {
        setShareUrl(null);
        toast.success('Sharing disabled');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update sharing';
      setError(msg);
      console.error('Sharing toggle error:', err);
      toast.error(msg);
    } finally {
      setIsToggling(false);
    }
  }, [isPublic, meetingId, shareOptions, shareMode]);

  // Switch share mode (public/private)
  const handleShareModeChange = useCallback(async (mode: 'public' | 'private') => {
    setShareMode(mode);

    if (isPublic) {
      setIsSavingOptions(true);
      try {
        await supabase.rpc('toggle_meeting_sharing', {
          p_meeting_id: meetingId,
          p_is_public: true,
          p_share_mode: mode,
          p_share_options: shareOptions,
        });

        if (mode === 'private') {
          toast.success('Switched to private sharing — only invited emails can view');
        } else {
          toast.success('Switched to public sharing — anyone with the link can view');
        }
      } catch (err) {
        console.error('Error saving share mode:', err);
      } finally {
        setIsSavingOptions(false);
      }
    }
  }, [isPublic, meetingId, shareOptions]);

  // Update share options
  const handleOptionChange = useCallback(async (key: keyof ShareOptions, value: boolean) => {
    const newOptions = { ...shareOptions, [key]: value };
    setShareOptions(newOptions);

    if (isPublic) {
      setIsSavingOptions(true);
      try {
        await supabase.rpc('toggle_meeting_sharing', {
          p_meeting_id: meetingId,
          p_is_public: true,
          p_share_mode: shareMode,
          p_share_options: newOptions,
        });
      } catch (err) {
        console.error('Error saving options:', err);
      } finally {
        setIsSavingOptions(false);
      }
    }
  }, [shareOptions, isPublic, meetingId, shareMode]);

  // Copy link to clipboard
  const handleCopyLink = useCallback(async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error('Failed to copy link');
    }
  }, [shareUrl]);

  // Add email to share list
  const handleAddEmail = useCallback(async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email || !meetingId) return;

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    // Check for duplicates
    if (sharedEmails.some(e => e.email.toLowerCase() === email)) {
      toast.error('This email has already been added');
      return;
    }

    setIsAddingEmail(true);
    try {
      const { data, error: addError } = await supabase.rpc('add_meeting_share_email', {
        p_meeting_id: meetingId,
        p_email: email,
      });

      if (addError) throw addError;
      if (!data?.success) throw new Error(data?.error || 'Failed to add email');

      // Add to local list
      setSharedEmails(prev => [{
        id: crypto.randomUUID(),
        email: data.email,
        invited_at: new Date().toISOString(),
        verified_at: null,
        last_accessed_at: null,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }, ...prev]);

      setEmailInput('');
      emailInputRef.current?.focus();

      // Send the invite email
      await sendShareInviteEmail(email, data.access_token);

      toast.success(`Invite sent to ${email}`);
    } catch (err) {
      console.error('Error adding email:', err);
      toast.error('Failed to add email');
    } finally {
      setIsAddingEmail(false);
    }
  }, [emailInput, meetingId, sharedEmails]);

  // Send share invite email
  const sendShareInviteEmail = useCallback(async (email: string, accessToken: string) => {
    if (!shareToken) return;

    try {
      const appUrl = window.location.origin;
      const accessUrl = `${appUrl}/share/meeting/${shareToken}?access=${accessToken}`;

      const sharerName = userData?.full_name
        || [userData?.first_name, userData?.last_name].filter(Boolean).join(' ')
        || undefined;

      await supabase.functions.invoke('send-router', {
        body: {
          action: 'meeting_share_invite',
          to_email: email,
          meeting_title: meetingTitle,
          share_url: accessUrl,
          sharer_name: sharerName,
        },
      });
    } catch (err) {
      console.error('Error sending invite email:', err);
      // Non-fatal — email is added even if send fails
    }
  }, [shareToken, meetingTitle]);

  // Resend invite email
  const handleResendInvite = useCallback(async (emailRecord: ShareEmail) => {
    setIsSendingInvite(emailRecord.email);
    try {
      // Re-add to refresh token and expiry
      const { data } = await supabase.rpc('add_meeting_share_email', {
        p_meeting_id: meetingId,
        p_email: emailRecord.email,
      });

      if (data?.success) {
        await sendShareInviteEmail(emailRecord.email, data.access_token);
        toast.success(`Invite resent to ${emailRecord.email}`);
      }
    } catch (err) {
      console.error('Error resending invite:', err);
      toast.error('Failed to resend invite');
    } finally {
      setIsSendingInvite(null);
    }
  }, [meetingId, sendShareInviteEmail]);

  // Remove email from share list
  const handleRemoveEmail = useCallback(async (email: string) => {
    try {
      const { data, error: removeError } = await supabase.rpc('remove_meeting_share_email', {
        p_meeting_id: meetingId,
        p_email: email,
      });

      if (removeError) throw removeError;
      if (!data?.success) throw new Error(data?.error || 'Failed to remove email');

      setSharedEmails(prev => prev.filter(e => e.email.toLowerCase() !== email.toLowerCase()));
      toast.success(`Removed ${email}`);
    } catch (err) {
      console.error('Error removing email:', err);
      toast.error('Failed to remove email');
    }
  }, [meetingId]);

  // Handle email input keypress
  const handleEmailKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddEmail();
    }
  }, [handleAddEmail]);

  const hasRecording = sourceType === 'voice' && voiceRecordingId;
  const hasFathomVideo = sourceType === 'fathom' && fathomShareUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Link2 className="w-5 h-5" />
            Share Meeting
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pt-2 -mx-6 px-6">
          {/* Meeting info */}
          <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
            {meetingTitle}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {/* Sharing toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/50">
                <div className="flex items-center gap-3">
                  {isPublic ? (
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                      <Globe className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <Lock className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-200">
                      {isPublic ? 'Sharing enabled' : 'Sharing disabled'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {isPublic
                        ? 'Meeting is accessible via share link'
                        : 'Only you can access this meeting'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleToggleSharing}
                  disabled={isToggling}
                  className={cn(
                    'relative w-12 h-6 rounded-full transition-colors',
                    isPublic
                      ? 'bg-emerald-500'
                      : 'bg-gray-300 dark:bg-gray-600',
                    isToggling && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
                      isPublic ? 'left-6' : 'left-0.5'
                    )}
                  />
                </button>
              </div>

              {/* Only show rest when sharing is enabled */}
              {isPublic && (
                <>
                  {/* Share mode selector */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-200">
                      Access control
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleShareModeChange('public')}
                        disabled={isSavingOptions}
                        className={cn(
                          'flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all text-left',
                          shareMode === 'public'
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
                            : 'border-gray-200 dark:border-gray-700/50 hover:border-gray-300 dark:hover:border-gray-600'
                        )}
                      >
                        <Globe className={cn(
                          'w-4 h-4 flex-shrink-0',
                          shareMode === 'public' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'
                        )} />
                        <div>
                          <p className={cn(
                            'text-sm font-medium',
                            shareMode === 'public' ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-700 dark:text-gray-300'
                          )}>
                            Public
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Anyone with link
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={() => handleShareModeChange('private')}
                        disabled={isSavingOptions}
                        className={cn(
                          'flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all text-left',
                          shareMode === 'private'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                            : 'border-gray-200 dark:border-gray-700/50 hover:border-gray-300 dark:hover:border-gray-600'
                        )}
                      >
                        <Shield className={cn(
                          'w-4 h-4 flex-shrink-0',
                          shareMode === 'private' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
                        )} />
                        <div>
                          <p className={cn(
                            'text-sm font-medium',
                            shareMode === 'private' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                          )}>
                            Private
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Email verified only
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Share link */}
                  {shareUrl && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-200">
                        Share link
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={shareUrl}
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                          className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                        <button
                          onClick={handleCopyLink}
                          className={cn(
                            'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all flex-shrink-0 text-sm',
                            copied
                              ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                              : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100'
                          )}
                        >
                          {copied ? (
                            <><Check className="w-4 h-4" /> Copied</>
                          ) : (
                            <><Copy className="w-4 h-4" /> Copy</>
                          )}
                        </button>
                      </div>

                      {/* View count */}
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <Eye className="w-3.5 h-3.5" />
                        <span>{shareViews} {shareViews === 1 ? 'view' : 'views'}</span>
                      </div>
                    </div>
                  )}

                  {/* Email invite section (for private mode) */}
                  {shareMode === 'private' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-200">
                          Invited viewers
                        </p>
                        <span className="text-xs text-gray-400">
                          {sharedEmails.length} invited
                        </span>
                      </div>

                      {/* Add email input */}
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            ref={emailInputRef}
                            type="email"
                            placeholder="Enter email address..."
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            onKeyDown={handleEmailKeyDown}
                            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50"
                          />
                        </div>
                        <button
                          onClick={handleAddEmail}
                          disabled={isAddingEmail || !emailInput.trim()}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium transition-all flex-shrink-0 text-sm',
                            'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
                          )}
                        >
                          {isAddingEmail ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <UserPlus className="w-4 h-4" />
                          )}
                          Invite
                        </button>
                      </div>

                      {/* Email list */}
                      {sharedEmails.length > 0 && (
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {sharedEmails.map((record) => (
                            <div
                              key={record.email}
                              className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 group"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={cn(
                                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0',
                                  record.verified_at
                                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                                )}>
                                  {record.verified_at ? (
                                    <Check className="w-3.5 h-3.5" />
                                  ) : (
                                    <Mail className="w-3.5 h-3.5" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm text-gray-900 dark:text-gray-200 truncate">
                                    {record.email}
                                  </p>
                                  <p className="text-xs text-gray-400">
                                    {record.verified_at
                                      ? `Viewed ${record.last_accessed_at ? new Date(record.last_accessed_at).toLocaleDateString() : ''}`
                                      : 'Invite sent'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                <button
                                  onClick={() => handleResendInvite(record)}
                                  disabled={isSendingInvite === record.email}
                                  className="p-1.5 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                                  title="Resend invite"
                                >
                                  {isSendingInvite === record.email ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Send className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleRemoveEmail(record.email)}
                                  className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                                  title="Remove access"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {sharedEmails.length === 0 && (
                        <div className="text-center py-4">
                          <Mail className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                          <p className="text-xs text-gray-400">
                            Add emails to grant private access
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Share Content Options */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-200">
                      Include in share
                    </p>
                    <div className="space-y-1.5">
                      {[
                        { key: 'include_summary' as const, label: 'AI Summary', icon: FileText, color: 'text-emerald-500', available: hasSummary },
                        { key: 'include_action_items' as const, label: 'Action Items', icon: ListChecks, color: 'text-blue-500', available: hasActionItems },
                        { key: 'include_transcript' as const, label: 'Transcript', icon: ScrollText, color: 'text-violet-500', available: hasTranscript },
                      ].map(({ key, label, icon: Icon, color, available }) => (
                        <div key={key} className={cn(
                          "flex items-center justify-between p-2.5 rounded-lg border",
                          "bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700/50",
                          !available && "opacity-50"
                        )}>
                          <div className="flex items-center gap-2.5">
                            <Icon className={cn("w-4 h-4", color)} />
                            <Label htmlFor={key} className="text-sm cursor-pointer">
                              {label}
                            </Label>
                          </div>
                          <Switch
                            id={key}
                            checked={shareOptions[key]}
                            onCheckedChange={(v) => handleOptionChange(key, v)}
                            disabled={!available || isSavingOptions}
                          />
                        </div>
                      ))}

                      {(hasRecording || hasFathomVideo) && (
                        <div className="flex items-center justify-between p-2.5 rounded-lg border bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700/50">
                          <div className="flex items-center gap-2.5">
                            <Video className="w-4 h-4 text-orange-500" />
                            <Label htmlFor="include-recording" className="text-sm cursor-pointer">
                              Recording {sourceType === 'fathom' && '(Fathom link)'}
                            </Label>
                          </div>
                          <Switch
                            id="include-recording"
                            checked={shareOptions.include_recording}
                            onCheckedChange={(v) => handleOptionChange('include_recording', v)}
                            disabled={isSavingOptions}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Fathom external link */}
                  {hasFathomVideo && fathomShareUrl && (
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700/50">
                      <a
                        href={fathomShareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open in Fathom
                      </a>
                    </div>
                  )}
                </>
              )}

              {/* Error message */}
              {error && (
                <div className="text-sm text-red-500 dark:text-red-400 text-center">
                  {error}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});

export default ShareMeetingModal;
