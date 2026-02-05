import { useRef, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { logger } from '@/lib/utils/logger';
import { useOrgStore } from '@/lib/stores/orgStore';
// Square logo preview - no Avatar (circular) used here
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { X, Upload } from 'lucide-react';

interface OrgLogoUploadProps {
  currentLogoUrl?: string | null;
  orgName?: string;
  orgId: string;
  onUploadComplete?: (logoUrl: string) => void;
  onRemoveComplete?: () => void;
  onRefresh?: () => void | Promise<void>;
  size?: 'sm' | 'md' | 'lg';
}

export function OrgLogoUpload({
  currentLogoUrl,
  orgName = 'Organization',
  orgId,
  onUploadComplete,
  onRemoveComplete,
  onRefresh,
  size = 'md',
}: OrgLogoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [displayLogoUrl, setDisplayLogoUrl] = useState<string | null | undefined>(currentLogoUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Update display logo URL when prop changes
  useEffect(() => {
    setDisplayLogoUrl(currentLogoUrl);
  }, [currentLogoUrl]);

  // Helper to update both React Query cache and Zustand store
  const updateOrgInAllStores = (updates: any) => {
    // Update React Query caches - merge with existing data
    queryClient.setQueryData(['organization', orgId], (oldData: any) => {
      if (!oldData) return oldData;
      return { ...oldData, ...updates };
    });
    queryClient.setQueryData(['active-org'], (oldData: any) => {
      if (!oldData) return oldData;
      return { ...oldData, ...updates };
    });
    queryClient.setQueryData(['organizations'], (oldData: any) => {
      if (!Array.isArray(oldData)) return oldData;
      return oldData.map((org: any) =>
        org.id === orgId ? { ...org, ...updates } : org
      );
    });

    // Update Zustand store organizations array - merge with existing data
    const store = useOrgStore.getState();
    const updatedOrgs = store.organizations.map((org) =>
      org.id === orgId ? { ...org, ...updates } : org
    );
    useOrgStore.setState({ organizations: updatedOrgs });
  };

  // Determine display initials from organization name
  const initials = orgName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Size configurations
  const sizeConfig = {
    sm: { container: 'w-12 h-12', icon: 'w-4 h-4' },
    md: { container: 'w-24 h-24', icon: 'w-5 h-5' },
    lg: { container: 'w-32 h-32', icon: 'w-6 h-6' },
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const fileType = file.type.toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(fileType)) {
      toast.error('Please upload a valid image file (JPEG, PNG, GIF, or WebP)');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    await uploadLogo(file);
    // Reset file input
    e.target.value = '';
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);

    try {
      // Create a unique file name: {orgId}_{timestamp}.{ext}
      // Using underscore to separate orgId from timestamp (UUID contains hyphens)
      const fileExt = file.name.split('.').pop();
      const fileName = `${orgId}_${Date.now()}.${fileExt}`;

      logger.log('[OrgLogoUpload] Uploading logo:', { fileName, fileSize: file.size });

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('org-logos')
        .upload(fileName, file, {
          upsert: false, // Fail if file exists
        });

      if (uploadError) {
        logger.error('[OrgLogoUpload] Upload error:', uploadError);
        throw uploadError;
      }

      // Get public URL
      const { data } = supabase.storage.from('org-logos').getPublicUrl(fileName);
      const publicUrl = data?.publicUrl;

      if (!publicUrl) {
        throw new Error('Failed to get public URL for uploaded file');
      }

      logger.log('[OrgLogoUpload] File uploaded, URL:', publicUrl);

      // Update organization with new logo URL (with cache-busting timestamp) and clear remove_logo flag
      const logoUrlWithTimestamp = `${publicUrl}?v=${Date.now()}`;
      const now = new Date().toISOString();

      // Optimistic update: Update cache AND Zustand store immediately
      const updatedOrg = {
        logo_url: logoUrlWithTimestamp,
        remove_logo: false,
        updated_at: now,
      };
      updateOrgInAllStores(updatedOrg);

      // Update the database in the background
      const { error: updateError } = await supabase
        .from('organizations')
        .update({
          logo_url: logoUrlWithTimestamp,
          remove_logo: false,
          updated_at: now,
        })
        .eq('id', orgId);

      if (updateError) {
        logger.error('[OrgLogoUpload] Organization update error:', updateError);
        throw updateError;
      }

      toast.success('Organization logo updated successfully');
      logger.log('[OrgLogoUpload] Logo upload completed successfully');

      // Invalidate related queries to ensure activeOrg is refreshed
      queryClient.invalidateQueries({ queryKey: ['organization', orgId] });
      queryClient.invalidateQueries({ queryKey: ['active-org'] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });

      if (onUploadComplete) {
        onUploadComplete(logoUrlWithTimestamp);
      }

      // Call refresh callback if provided to refresh the full org data
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: any) {
      logger.error('[OrgLogoUpload] Logo upload failed:', error);
      toast.error(error.message || 'Failed to upload logo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    setUploading(true);

    try {
      logger.log('[OrgLogoUpload] Removing logo for org:', orgId);

      const now = new Date().toISOString();

      // Optimistic update: Update cache AND Zustand store immediately
      const updatedOrg = {
        logo_url: null,
        remove_logo: true,
        updated_at: now,
      };
      updateOrgInAllStores(updatedOrg);

      // Clear the display logo URL immediately for instant UI feedback
      setDisplayLogoUrl(null);

      // Update the database in the background
      const { error: updateError } = await supabase
        .from('organizations')
        .update({
          logo_url: null,
          remove_logo: true,
          updated_at: now,
        })
        .eq('id', orgId);

      if (updateError) {
        logger.error('[OrgLogoUpload] Organization update error:', updateError);
        throw updateError;
      }

      toast.success('Organization logo removed');
      logger.log('[OrgLogoUpload] Logo removed successfully');

      setShowRemoveDialog(false);

      // Invalidate related queries to ensure activeOrg is refreshed
      queryClient.invalidateQueries({ queryKey: ['organization', orgId] });
      queryClient.invalidateQueries({ queryKey: ['active-org'] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });

      if (onRemoveComplete) {
        onRemoveComplete();
      }

      // Call refresh callback if provided to refresh the full org data
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: any) {
      logger.error('[OrgLogoUpload] Logo removal failed:', error);
      toast.error(error.message || 'Failed to remove logo. Please try again.');
      // Restore the display logo URL if removal fails
      setDisplayLogoUrl(currentLogoUrl);
    } finally {
      setUploading(false);
    }
  };

  const handleClickLogo = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <div className="flex flex-col items-center gap-4">
        {/* Logo Display */}
        <div className="relative group">
          <div className={`${sizeConfig[size].container} rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700/50 flex-shrink-0`}>
            {displayLogoUrl ? (
              <img src={displayLogoUrl} alt={orgName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#37bd7e] to-[#2da76c] flex items-center justify-center">
                <span className="text-white font-semibold text-lg">{initials}</span>
              </div>
            )}
          </div>

          {/* Hover Overlay with Upload Indicator */}
          <button
            onClick={handleClickLogo}
            disabled={uploading}
            className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center disabled:opacity-100 cursor-pointer"
          >
            <Upload className={`${sizeConfig[size].icon} text-white`} />
          </button>

          {/* Loading Spinner */}
          {uploading && (
            <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center">
              <div className="animate-spin rounded-full border-2 border-white border-t-transparent w-6 h-6" />
            </div>
          )}
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileSelect}
          disabled={uploading}
          className="hidden"
          aria-label="Upload organization logo"
        />

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <Button
            onClick={handleClickLogo}
            disabled={uploading}
            variant="default"
            className="w-full"
            size="sm"
          >
            {uploading ? 'Uploading...' : 'Change Logo'}
          </Button>

          {displayLogoUrl && (
            <Button
              onClick={() => setShowRemoveDialog(true)}
              disabled={uploading}
              variant="outline"
              className="w-full gap-2"
              size="sm"
            >
              <X className="w-4 h-4" />
              Remove Logo
            </Button>
          )}
        </div>

        {/* File Size Hint */}
        <p className="text-xs text-gray-500 text-center">
          JPG, PNG, GIF or WebP. Max 5MB.
        </p>
      </div>

      {/* Remove Confirmation Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogTitle>Remove Organization Logo?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove your organization logo and revert to displaying the organization's initials.
            This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end pt-4">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveLogo}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
