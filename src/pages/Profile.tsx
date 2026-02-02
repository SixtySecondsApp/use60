import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@/lib/hooks/useUser';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { Camera, Save, Lock, UserCog, Link2, History, ChevronRight, Mail, Building2, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import logger from '@/lib/utils/logger';
import { EmailChangeModal } from '@/components/EmailChangeModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { leaveOrganization, isLastOwner } from '@/lib/services/leaveOrganizationService';
import { GoodbyeScreen } from '@/components/GoodbyeScreen';

export default function Profile() {
  const navigate = useNavigate();
  const { userData, isLoading: userLoading } = useUser();
  const { user, userProfile, updatePassword } = useAuth();
  const { activeOrgId, orgName, permissions } = useOrg();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isEmailChangeModalOpen, setIsEmailChangeModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isLeavingOrg, setIsLeavingOrg] = useState(false);
  const [showGoodbyeScreen, setShowGoodbyeScreen] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const queryClient = useQueryClient();

  // Check if user is owner of current organization
  useEffect(() => {
    const checkOwnerStatus = async () => {
      if (activeOrgId && user?.id) {
        const ownerStatus = await isLastOwner(activeOrgId, user.id);
        setIsOwner(ownerStatus);
      }
    };
    checkOwnerStatus();
  }, [activeOrgId, user?.id]);

  // Debug logging
  useEffect(() => {
    logger.log('Profile page mounted:', { 
      userData, 
      userProfile,
      user,
      userLoading 
    });
  }, [userData, userProfile, user, userLoading]);

  // Update form data when user data is loaded
  useEffect(() => {
    // Use userProfile from AuthContext if userData from useUser is not available
    const profileData = userData || userProfile;
    
    if (profileData) {
      logger.log('Setting form data from profile:', profileData);
      setFormData(prev => ({
        ...prev,
        firstName: profileData.first_name || '',
        lastName: profileData.last_name || '',
        email: profileData.email || ''
      }));
    }
  }, [userData, userProfile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const updates = {
      first_name: formData.firstName,
      last_name: formData.lastName
    };

    try {
      // Update auth user metadata (email is not editable)
      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: `${formData.firstName} ${formData.lastName}` }
      });

      if (authError) throw authError;

      // Update profile record if we have a user ID
      if (user?.id) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            first_name: formData.firstName,
            last_name: formData.lastName
          })
          .eq('id', user.id);

        if (profileError) throw profileError;
      }

      toast.success('Profile updated successfully');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeaveOrganization = () => {
    if (!activeOrgId || !user?.id) return;

    // Check if owner
    if (isOwner) {
      toast.error(
        'You are the last owner of this organization. Please transfer ownership to another member before leaving.'
      );
      return;
    }

    // Show confirmation dialog
    setShowLeaveConfirmation(true);
  };

  const handleConfirmLeaveOrganization = async () => {
    if (!activeOrgId || !user?.id) return;

    setIsLeavingOrg(true);
    const result = await leaveOrganization(activeOrgId, user.id);

    if (result.success) {
      setShowLeaveConfirmation(false);
      toast.success('You have left the organization');
      setShowGoodbyeScreen(true);
    } else {
      toast.error(result.error || 'Failed to leave organization');
      setIsLeavingOrg(false);
      setShowLeaveConfirmation(false);
    }
  };

  const handleRedirectFromGoodbye = () => {
    // Clear org context and redirect
    queryClient.invalidateQueries({ queryKey: ['organizations'] });
    window.location.href = '/learnmore';
  };

  // Show goodbye screen if user just left organization
  if (showGoodbyeScreen) {
    return <GoodbyeScreen organizationName={orgName} onRedirectComplete={handleRedirectFromGoodbye} />;
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (formData.newPassword !== formData.confirmPassword) {
      toast.error('New passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await updatePassword(formData.newPassword);
      if (error) throw new Error(error.message);
      toast.success('Password updated successfully');
      setIsPasswordModalOpen(false);
      setFormData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }));
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    setUploading(true);

    try {
      // Create a unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}-${Date.now()}.${fileExt}`;

      logger.log('[Profile] Uploading avatar:', { fileName, fileSize: file.size });

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file);

      if (uploadError) {
        logger.error('[Profile] Upload error:', uploadError);
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      logger.log('[Profile] File uploaded, URL:', publicUrl);

      // Update user profile with new avatar URL
      if (user?.id) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
          .eq('id', user.id);

        if (updateError) {
          logger.error('[Profile] Profile update error:', updateError);
          throw updateError;
        }
      }

      // Invalidate cache so new avatar shows immediately
      queryClient.invalidateQueries({ queryKey: ['user'] });

      toast.success('Profile picture updated successfully');
      logger.log('[Profile] Avatar upload completed successfully');
    } catch (error: any) {
      logger.error('[Profile] Avatar upload failed:', error);
      toast.error(error.message || 'Failed to upload image. Please try again.');
    } finally {
      setUploading(false);
      // Reset file input so same file can be uploaded again
      e.target.value = '';
    }
  };

  // Show loading state while user data is loading
  if (userLoading) {
    return (
      <div className="p-4 sm:p-8 mt-12 lg:mt-0">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#37bd7e]"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-8 mt-12 lg:mt-0">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Profile Settings</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your account settings and preferences</p>
        </div>

        {/* Profile Form */}
        <div className="bg-white border border-transparent dark:bg-gray-900/50 dark:backdrop-blur-xl dark:border-gray-800/50 rounded-xl shadow-sm dark:shadow-none overflow-hidden">
          <form onSubmit={handleSave} className="p-6 space-y-6">
            {/* Profile Picture */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative group">
                <div className="w-24 h-24 rounded-xl overflow-hidden bg-[#37bd7e]/20 border-2 border-[#37bd7e]/30 group-hover:border-[#37bd7e]/50 transition-all duration-300">
                  {(userData?.avatar_url || userProfile?.avatar_url) ? (
                    <img
                      src={userData?.avatar_url || userProfile?.avatar_url}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-2xl font-medium text-[#37bd7e]">
                        {formData.firstName?.[0] || 'A'}{formData.lastName?.[0] || 'B'}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {uploading ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Camera className="w-6 h-6 text-white" />
                    )}
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="profile-picture"
                  onChange={handleImageUpload}
                  disabled={uploading}
                />
              </div>
              <label
                htmlFor="profile-picture"
                className={`text-sm text-[#37bd7e] hover:text-[#2da76c] cursor-pointer ${
                  uploading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {uploading ? 'Uploading...' : 'Change Picture'}
              </label>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-400">
                  First Name
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-all duration-200"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-400">
                  Last Name
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-all duration-200"
                />
              </div>
              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-400">
                  Email Address
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={formData.email}
                    disabled={true}
                    className="flex-1 bg-gray-100 dark:bg-gray-800/30 border border-gray-300 dark:border-gray-700/30 rounded-xl px-4 py-2.5 text-gray-600 dark:text-gray-500 placeholder-gray-400 cursor-not-allowed opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setIsEmailChangeModalOpen(true)}
                    className="px-4 py-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all duration-300 border border-blue-300 dark:border-blue-700/50 font-medium text-sm flex items-center gap-2 whitespace-nowrap"
                  >
                    <Mail className="w-4 h-4" />
                    Change
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Click "Change" to request a new email address</p>
              </div>

              {/* Organization Info */}
              {activeOrgId && orgName && (
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-400 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Current Organization
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={orgName}
                      disabled={true}
                      className="flex-1 bg-gray-100 dark:bg-gray-800/30 border border-gray-300 dark:border-gray-700/30 rounded-xl px-4 py-2.5 text-gray-900 dark:text-gray-400 placeholder-gray-400 cursor-not-allowed opacity-60"
                    />
                    {!isOwner && (
                      <button
                        type="button"
                        onClick={handleLeaveOrganization}
                        disabled={isLeavingOrg}
                        className="px-4 py-2.5 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-all duration-300 border border-red-300 dark:border-red-700/50 font-medium text-sm flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
                      >
                        <LogOut className="w-4 h-4" />
                        {isLeavingOrg ? 'Leaving...' : 'Leave'}
                      </button>
                    )}
                    {isOwner && (
                      <div className="px-4 py-2.5 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700/50 font-medium text-xs flex items-center gap-2 whitespace-nowrap">
                        You are the owner
                      </div>
                    )}
                  </div>
                  {isOwner && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">
                      As owner, you must transfer ownership or delete the organization before leaving.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Password Section */}
            <div className="pt-6 border-t border-gray-200 dark:border-gray-800/50">
              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800/50 text-gray-900 dark:text-white hover:bg-[#37bd7e]/20 transition-all duration-300 border border-gray-300 dark:border-gray-700/50 hover:border-[#37bd7e]/50"
              >
                <Lock className="w-4 h-4" />
                Change Password
              </button>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isLoading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#37bd7e] text-white hover:bg-[#2da76c] transition-colors"
              >
                <Save className="w-4 h-4" />
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Password Change Modal */}
        {isPasswordModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
            onClick={() => setIsPasswordModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Change Password</h2>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-400">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={formData.currentPassword}
                    onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                    className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-all duration-200"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-400">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={formData.newPassword}
                    onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                    className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-all duration-200"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-400">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-all duration-200"
                  />
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsPasswordModalOpen(false)}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors border border-gray-300 dark:border-gray-700/30"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-4 py-2 rounded-xl bg-[#37bd7e] text-white hover:bg-[#2da76c] transition-colors"
                  >
                    {isLoading ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

      {/* Email Change Modal */}
      <EmailChangeModal
        isOpen={isEmailChangeModalOpen}
        onOpenChange={setIsEmailChangeModalOpen}
        currentEmail={formData.email}
        pendingEmail={userProfile?.pending_email}
        onSuccess={() => {
          // Refresh user data after email change request
          queryClient.invalidateQueries({ queryKey: ['user'] });
        }}
      />

      {/* Leave Organization Confirmation Dialog */}
      <ConfirmDialog
        open={showLeaveConfirmation}
        onClose={() => {
          setShowLeaveConfirmation(false);
          setIsLeavingOrg(false);
        }}
        onConfirm={handleConfirmLeaveOrganization}
        title="Leave Organization?"
        description={`You will no longer have access to ${orgName || 'this organization'}'s data and all its resources. You can request to join again later if needed.`}
        confirmText="Leave Organization"
        cancelText="Cancel"
        confirmVariant="destructive"
        loading={isLeavingOrg}
      />
      </div>
    </div>
  );
}