import { useState } from 'react';
import { AlertCircle, Loader2, Building2, Users, Calendar, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  deactivateOrganizationAsOwner,
  getAllOrgMembers,
  showDeactivationError,
  validateOwnerCanDeactivate
} from '@/lib/services/organizationDeactivationService';

interface DeactivateOrganizationDialogProps {
  orgId: string;
  orgName: string;
  open: boolean;
  onClose: () => void;
  onDeactivateSuccess: () => void;
}

type DialogStep = 'confirm-warning' | 'review-members' | 'type-confirm';

export function DeactivateOrganizationDialog({
  orgId,
  orgName,
  open,
  onClose,
  onDeactivateSuccess
}: DeactivateOrganizationDialogProps) {
  const [step, setStep] = useState<DialogStep>('confirm-warning');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [reason, setReason] = useState<string>('Billing issues');
  const [otherReason, setOtherReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Handle opening the dialog - start fresh
  const handleOpen = async () => {
    setStep('confirm-warning');
    setConfirmText('');
    setValidationError(null);
    setReason('Billing issues');
    setOtherReason('');

    // Validate ownership immediately
    try {
      const error = await validateOwnerCanDeactivate(orgId);
      if (error) {
        setValidationError(error);
        showDeactivationError(error);
        onClose();
      }
    } catch (error) {
      console.error('Validation error:', error);
      toast.error('An error occurred while validating your permissions');
      onClose();
    }
  };

  // Load members when moving to review step
  const handleGoToReview = async () => {
    setIsLoadingMembers(true);
    try {
      const membersList = await getAllOrgMembers(orgId);
      setMembers(membersList);
      setStep('review-members');
    } catch (error) {
      toast.error('Failed to load organization members');
      console.error('Error loading members:', error);
    } finally {
      setIsLoadingMembers(false);
    }
  };

  // Handle deactivation
  const handleDeactivate = async () => {
    if (confirmText !== 'DEACTIVATE') {
      toast.error('Please type "DEACTIVATE" to confirm');
      return;
    }

    setIsLoading(true);
    try {
      const finalReason = reason === 'Other' ? otherReason || 'Owner requested deactivation' : reason;

      const result = await deactivateOrganizationAsOwner(orgId, finalReason);

      if (result.success) {
        toast.success('Organization deactivated. Check your email for reactivation options.');

        // Clear localStorage for this org
        try {
          localStorage.removeItem(`activeOrgId`);
          localStorage.removeItem(`activeOrg_${orgId}`);
        } catch (e) {
          console.warn('Failed to clear localStorage:', e);
        }

        // Trigger callback
        onDeactivateSuccess();

        // Close and redirect
        onClose();

        // Redirect to onboarding/org selection
        setTimeout(() => {
          window.location.href = '/onboarding/select-organization';
        }, 1500);
      } else {
        showDeactivationError(result.error || 'Failed to deactivate organization');
      }
    } catch (error) {
      console.error('Deactivation error:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (!open) return null;

  // Initialize on open
  if (step === 'confirm-warning' && validationError === null && confirmText === '' && reason === 'Billing issues') {
    handleOpen();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 max-w-2xl w-full mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 z-20"
          aria-label="Close"
        >
          <XCircle className="w-6 h-6" />
        </button>

        {/* Content */}
        <div className="max-h-[90vh] overflow-y-auto">
          {/* Step 1: Confirm Warning */}
          {step === 'confirm-warning' && (
            <div className="p-8 space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    Deactivate Organization
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    This action will deactivate <span className="font-semibold">{orgName}</span>. All members will lose access immediately, but your data will be preserved for 30 days.
                  </p>
                </div>
              </div>

              {/* Warning Points */}
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 space-y-2">
                <h3 className="font-semibold text-red-900 dark:text-red-100 text-sm">Important Information:</h3>
                <ul className="space-y-2 text-sm text-red-800 dark:text-red-200">
                  <li className="flex items-start gap-2">
                    <span className="font-bold">•</span>
                    <span><strong>All members</strong> will lose access immediately</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold">•</span>
                    <span><strong>30-day</strong> window to reactivate before data is deleted</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold">•</span>
                    <span><strong>You will</strong> be removed from the organization</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold">•</span>
                    <span><strong>Confirmation email</strong> will be sent with reactivation options</span>
                  </li>
                </ul>
              </div>

              {/* Reason Selection */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  Reason for Deactivation
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="Billing issues">Billing issues</option>
                  <option value="Team restructuring">Team restructuring</option>
                  <option value="Business closed">Business closed</option>
                  <option value="Other">Other (please explain)</option>
                </select>

                {reason === 'Other' && (
                  <textarea
                    value={otherReason}
                    onChange={(e) => setOtherReason(e.target.value)}
                    placeholder="Please explain the reason for deactivation..."
                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    rows={3}
                  />
                )}
              </div>

              {/* Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-800">
                <Button
                  onClick={onClose}
                  variant="ghost"
                  disabled={isLoadingMembers}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGoToReview}
                  disabled={isLoadingMembers || (reason === 'Other' && !otherReason.trim())}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {isLoadingMembers ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'Continue'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Review Members */}
          {step === 'review-members' && (
            <div className="p-8 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Review Affected Members
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  These {members.length} members will lose access to {orgName}:
                </p>
              </div>

              {/* Members List */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 max-h-64 overflow-y-auto">
                {members.length > 0 ? (
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {members.map((member) => (
                      <div key={member.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs font-semibold text-white">
                          {member.full_name?.[0]?.toUpperCase() || member.email[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {member.full_name || member.email.split('@')[0]}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email}</p>
                        </div>
                        <span className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                          {member.role === 'owner' ? 'Owner' : member.role === 'admin' ? 'Admin' : 'Member'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                    No members found
                  </div>
                )}
              </div>

              {/* Confirmation checkbox */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    id="understand-deactivation"
                    checked={confirmText === 'understood'}
                    onChange={(e) => setConfirmText(e.target.checked ? 'understood' : '')}
                    className="mt-1 rounded border-gray-300 dark:border-gray-600"
                  />
                  <span className="text-sm text-yellow-900 dark:text-yellow-100">
                    I understand that all members will lose access immediately and the organization will be deactivated
                  </span>
                </label>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-800">
                <Button
                  onClick={() => setStep('confirm-warning')}
                  variant="ghost"
                >
                  Back
                </Button>
                <Button
                  onClick={() => {
                    setConfirmText('');
                    setStep('type-confirm');
                  }}
                  disabled={confirmText !== 'understood'}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Continue to Confirmation
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Type to Confirm */}
          {step === 'type-confirm' && (
            <div className="p-8 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Final Confirmation
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Type <span className="font-mono font-bold">DEACTIVATE</span> to permanently deactivate the organization.
                </p>
              </div>

              {/* Key details */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    <strong>Organization:</strong> {orgName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    <strong>Members:</strong> {members.length} will lose access
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    <strong>Recovery Window:</strong> 30 days
                  </span>
                </div>
              </div>

              {/* Confirmation input */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  Type to confirm
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DEACTIVATE"
                  autoFocus
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-3 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {confirmText.length === 0
                    ? 'Type "DEACTIVATE" to continue'
                    : confirmText === 'DEACTIVATE'
                      ? '✓ Ready to deactivate'
                      : 'Must match exactly (case-sensitive)'}
                </p>
              </div>

              {/* Warning */}
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-sm text-red-800 dark:text-red-200">
                  <strong>This action is irreversible immediately for members, but you have 30 days to reactivate.</strong> After 30 days, your organization data will be permanently deleted.
                </p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-800">
                <Button
                  onClick={() => setStep('review-members')}
                  variant="ghost"
                  disabled={isLoading}
                >
                  Back
                </Button>
                <Button
                  onClick={handleDeactivate}
                  disabled={confirmText !== 'DEACTIVATE' || isLoading}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deactivating...
                    </>
                  ) : (
                    'Deactivate Organization'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
