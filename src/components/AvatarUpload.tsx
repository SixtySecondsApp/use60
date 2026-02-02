import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { logger } from '@/lib/utils/logger';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  userName?: string;
  userId: string;
  onUploadComplete?: (avatarUrl: string) => void;
  onRemoveComplete?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export function AvatarUpload({
  currentAvatarUrl,
  userName = 'User',
  userId,
  onUploadComplete,
  onRemoveComplete,
  size = 'md',
}: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Determine display initials from user name
  const initials = userName
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

    await uploadAvatar(file);
    // Reset file input
    e.target.value = '';
  };

  const uploadAvatar = async (file: File) => {
    setUploading(true);

    try {
      // Create a unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}-${Date.now()}.${fileExt}`;

      logger.log('[AvatarUpload] Uploading avatar:', { fileName, fileSize: file.size });

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, {
          upsert: false, // Fail if file exists
        });

      if (uploadError) {
        logger.error('[AvatarUpload] Upload error:', uploadError);
        throw uploadError;
      }

      // Get public URL
      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const publicUrl = data?.publicUrl;

      if (!publicUrl) {
        throw new Error('Failed to get public URL for uploaded file');
      }

      logger.log('[AvatarUpload] File uploaded, URL:', publicUrl);

      // Update user profile with new avatar URL and clear remove_avatar flag
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          avatar_url: publicUrl,
          remove_avatar: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (updateError) {
        logger.error('[AvatarUpload] Profile update error:', updateError);
        throw updateError;
      }

      // Invalidate cache so new avatar shows immediately
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });

      toast.success('Profile picture updated successfully');
      logger.log('[AvatarUpload] Avatar upload completed successfully');

      if (onUploadComplete) {
        onUploadComplete(publicUrl);
      }
    } catch (error: any) {
      logger.error('[AvatarUpload] Avatar upload failed:', error);
      toast.error(error.message || 'Failed to upload image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setUploading(true);

    try {
      logger.log('[AvatarUpload] Removing avatar for user:', userId);

      // Update profile to mark avatar as removed
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          remove_avatar: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (updateError) {
        logger.error('[AvatarUpload] Profile update error:', updateError);
        throw updateError;
      }

      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });

      toast.success('Profile picture removed');
      logger.log('[AvatarUpload] Avatar removed successfully');

      setShowRemoveDialog(false);

      if (onRemoveComplete) {
        onRemoveComplete();
      }
    } catch (error: any) {
      logger.error('[AvatarUpload] Avatar removal failed:', error);
      toast.error(error.message || 'Failed to remove image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleClickAvatar = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <div className="flex flex-col items-center gap-4">
        {/* Avatar Display */}
        <div className="relative group">
          <Avatar className={sizeConfig[size].container}>
            {currentAvatarUrl && (
              <AvatarImage src={currentAvatarUrl} alt={userName} />
            )}
            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>

          {/* Hover Overlay with Upload Indicator */}
          <button
            onClick={handleClickAvatar}
            disabled={uploading}
            className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center disabled:opacity-100 cursor-pointer"
          >
            <Upload className={`${sizeConfig[size].icon} text-white`} />
          </button>

          {/* Loading Spinner */}
          {uploading && (
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
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
          aria-label="Upload profile picture"
        />

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <Button
            onClick={handleClickAvatar}
            disabled={uploading}
            variant="default"
            className="w-full"
            size="sm"
          >
            {uploading ? 'Uploading...' : 'Change Picture'}
          </Button>

          {currentAvatarUrl && (
            <Button
              onClick={() => setShowRemoveDialog(true)}
              disabled={uploading}
              variant="outline"
              className="w-full gap-2"
              size="sm"
            >
              <X className="w-4 h-4" />
              Remove Picture
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
          <AlertDialogTitle>Remove Profile Picture?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove your profile picture and revert to displaying your initials.
            This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end pt-4">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveAvatar}
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
