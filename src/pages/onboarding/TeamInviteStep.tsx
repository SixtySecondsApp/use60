/**
 * TeamInviteStep - Team Invitation Onboarding Step
 *
 * Allows users to invite team members to their organization.
 * This step is optional - users can skip and invite later.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Mail, Plus, X, Send, Loader2, UserPlus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrg } from '@/lib/contexts/OrgContext';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

interface TeamInviteStepProps {
  onNext: () => void;
  onBack: () => void;
}

interface PendingInvite {
  id: string;
  email: string;
  role: 'admin' | 'member';
  status: 'pending' | 'sending' | 'sent' | 'error';
  error?: string;
}

const roleOptions = [
  { value: 'member' as const, label: 'Member', description: 'Can access and modify data' },
  { value: 'admin' as const, label: 'Admin', description: 'Can manage team and settings' },
];

export function TeamInviteStep({ onNext, onBack }: TeamInviteStepProps) {
  const { activeOrgId, activeOrg } = useOrg();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'member'>('member');
  const [isSendingAll, setIsSendingAll] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddInvite = () => {
    const email = newEmail.trim().toLowerCase();

    if (!email) {
      setEmailError('Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    if (invites.some((inv) => inv.email === email)) {
      setEmailError('This email has already been added');
      return;
    }

    const newInvite: PendingInvite = {
      id: crypto.randomUUID(),
      email,
      role: newRole,
      status: 'pending',
    };

    setInvites([...invites, newInvite]);
    setNewEmail('');
    setNewRole('member');
    setEmailError(null);
  };

  const handleRemoveInvite = (id: string) => {
    setInvites(invites.filter((inv) => inv.id !== id));
  };

  const handleSendInvites = async () => {
    if (invites.length === 0) {
      onNext();
      return;
    }

    if (!activeOrgId) {
      toast.error('Organization not found');
      return;
    }

    setIsSendingAll(true);

    // Update all pending invites to sending status
    setInvites((prev) => prev.map((inv) => ({ ...inv, status: 'sending' as const })));

    // Send invites one by one
    const results = await Promise.all(
      invites.map(async (invite) => {
        try {
          // Create invitation record in database
          // Note: organization_invitations table is created by our migrations but not in generated types
          const { data, error } = await supabase
            .from('organization_invitations' as any)
            .insert({
              org_id: activeOrgId,
              email: invite.email,
              role: invite.role,
              token: crypto.randomUUID(),
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
            } as any)
            .select()
            .single();

          if (error) throw error;

          // TODO: Trigger email sending via Edge Function
          // For now, we just create the invitation record

          return { id: invite.id, success: true };
        } catch (err: any) {
          console.error('Error sending invite:', err);
          return {
            id: invite.id,
            success: false,
            error: err.message || 'Failed to send invite',
          };
        }
      })
    );

    // Update invite statuses
    setInvites((prev) =>
      prev.map((inv) => {
        const result = results.find((r) => r.id === inv.id);
        if (result?.success) {
          return { ...inv, status: 'sent' as const };
        } else {
          return {
            ...inv,
            status: 'error' as const,
            error: result?.error || 'Failed to send',
          };
        }
      })
    );

    const successCount = results.filter((r) => r.success).length;
    const errorCount = results.filter((r) => !r.success).length;

    if (successCount > 0) {
      toast.success(`${successCount} invitation${successCount > 1 ? 's' : ''} sent!`);
    }

    if (errorCount > 0) {
      toast.error(`${errorCount} invitation${errorCount > 1 ? 's' : ''} failed to send`);
    }

    setIsSendingAll(false);

    // Auto-proceed if all invites were sent successfully
    if (errorCount === 0) {
      setTimeout(() => {
        onNext();
      }, 1500);
    }
  };

  const handleSkip = () => {
    onNext();
  };

  const pendingCount = invites.filter((inv) => inv.status === 'pending').length;
  const sentCount = invites.filter((inv) => inv.status === 'sent').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-xl mx-auto"
    >
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring' }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-[#37bd7e] to-[#2da76c] mb-6"
        >
          <Users className="w-10 h-10 text-white" />
        </motion.div>
        <h1 className="text-3xl font-bold mb-4 text-white">Invite Your Team</h1>
        <p className="text-lg text-gray-400">
          Add team members to {activeOrg?.name || 'your organization'}
        </p>
      </div>

      <div className="bg-gray-900/50 backdrop-blur-xl rounded-xl border border-gray-800/50 p-6 mb-6">
        {/* Add new invite form */}
        <div className="space-y-4 mb-6">
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    setEmailError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddInvite();
                    }
                  }}
                  placeholder="colleague@company.com"
                  disabled={isSendingAll}
                  className="w-full bg-gray-700/50 border border-gray-600 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-all disabled:opacity-50"
                />
              </div>
            </div>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'admin' | 'member')}
              disabled={isSendingAll}
              className="bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2.5 text-white focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-all disabled:opacity-50"
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              onClick={handleAddInvite}
              disabled={isSendingAll}
              variant="outline"
              size="icon"
              className="border-gray-600 hover:border-[#37bd7e] hover:bg-[#37bd7e]/10"
            >
              <Plus className="w-5 h-5" />
            </Button>
          </div>
          {emailError && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red-400 text-sm"
            >
              {emailError}
            </motion.p>
          )}
        </div>

        {/* Invite list */}
        <AnimatePresence>
          {invites.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2 mb-4"
            >
              <p className="text-sm text-gray-400 mb-3">
                {invites.length} team member{invites.length > 1 ? 's' : ''} to invite:
              </p>
              {invites.map((invite) => (
                <motion.div
                  key={invite.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    invite.status === 'sent'
                      ? 'bg-green-500/10 border border-green-500/30'
                      : invite.status === 'error'
                      ? 'bg-red-500/10 border border-red-500/30'
                      : 'bg-gray-800/50'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <UserPlus className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{invite.email}</p>
                    <p className="text-gray-500 text-xs">
                      {invite.role === 'admin' ? 'Admin' : 'Member'}
                      {invite.status === 'sent' && ' - Invite sent!'}
                      {invite.status === 'error' && ` - ${invite.error}`}
                    </p>
                  </div>
                  {invite.status === 'sending' && (
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  )}
                  {invite.status === 'pending' && (
                    <button
                      onClick={() => handleRemoveInvite(invite.id)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {invites.length === 0 && (
          <div className="text-center py-6 text-gray-500">
            <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Add team members above or skip this step</p>
          </div>
        )}
      </div>

      <div className="flex gap-4 justify-center">
        <Button
          onClick={onBack}
          variant="ghost"
          className="text-gray-400 hover:text-white"
          disabled={isSendingAll}
        >
          Back
        </Button>
        {invites.length > 0 && pendingCount > 0 ? (
          <Button
            onClick={handleSendInvites}
            disabled={isSendingAll}
            className="bg-[#37bd7e] hover:bg-[#2da76c] text-white px-8"
          >
            {isSendingAll ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send {pendingCount} Invite{pendingCount > 1 ? 's' : ''}
              </>
            )}
          </Button>
        ) : (
          <Button
            onClick={handleSkip}
            variant="ghost"
            className="text-gray-400 hover:text-white"
            disabled={isSendingAll}
          >
            {sentCount > 0 ? 'Continue' : 'Skip for now'}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>

      <p className="text-center text-xs text-gray-500 mt-4">
        You can always invite more team members from Settings later
      </p>
    </motion.div>
  );
}
