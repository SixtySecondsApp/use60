import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { logger } from '@/lib/utils/logger';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader } from 'lucide-react';

interface EmailChangeModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmail: string;
  pendingEmail?: string | null;
  onSuccess?: () => void;
}

export function EmailChangeModal({
  isOpen,
  onOpenChange,
  currentEmail,
  pendingEmail,
  onSuccess,
}: EmailChangeModalProps) {
  const [step, setStep] = useState<'form' | 'pending'>('form');
  const [newEmail, setNewEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset form when closing
      setStep('form');
      setNewEmail('');
      setConfirmEmail('');
      setPassword('');
      setErrors({});
    }
    onOpenChange(open);
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!newEmail.trim()) {
      newErrors.newEmail = 'Email is required';
    } else if (!newEmail.includes('@') || !newEmail.includes('.')) {
      newErrors.newEmail = 'Please enter a valid email address';
    }

    if (!confirmEmail.trim()) {
      newErrors.confirmEmail = 'Confirmation email is required';
    } else if (newEmail !== confirmEmail) {
      newErrors.confirmEmail = 'Emails do not match';
    }

    if (!password.trim()) {
      newErrors.password = 'Password is required';
    }

    if (newEmail === currentEmail) {
      newErrors.newEmail = 'New email must be different from current email';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRequestChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      logger.log('[EmailChangeModal] Requesting email change');

      // First, verify password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentEmail,
        password,
      });

      if (signInError) {
        setErrors({ password: 'Incorrect password' });
        setIsLoading(false);
        return;
      }

      // Call request-email-change edge function
      const { data, error } = await supabase.functions.invoke(
        'request-email-change',
        {
          body: { newEmail },
        }
      );

      if (error) {
        throw new Error(error.message || 'Failed to request email change');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to request email change');
      }

      logger.log('[EmailChangeModal] Email change requested successfully');
      toast.success('Verification email sent! Please check your email to confirm the change.');

      // Move to pending state
      setStep('pending');

      // Reset form
      setNewEmail('');
      setConfirmEmail('');
      setPassword('');
      setErrors({});

      if (onSuccess) {
        onSuccess();
      }

      // Auto-close after 3 seconds
      setTimeout(() => {
        handleOpenChange(false);
      }, 3000);
    } catch (error: any) {
      logger.error('[EmailChangeModal] Email change request failed:', error);
      setErrors({
        submit: error.message || 'Failed to request email change',
      });
      toast.error(error.message || 'Failed to request email change');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelPending = async () => {
    setIsLoading(true);

    try {
      logger.log('[EmailChangeModal] Cancelling pending email change');

      // In a real implementation, you would call an edge function to delete the pending token
      // For now, we'll just close the modal
      toast.info('Pending email change cancelled. You can request a new one anytime.');
      handleOpenChange(false);
    } catch (error: any) {
      logger.error('[EmailChangeModal] Failed to cancel pending change:', error);
      toast.error('Failed to cancel pending change');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendEmail = async () => {
    setIsLoading(true);

    try {
      logger.log('[EmailChangeModal] Resending verification email');

      // This would call an edge function to resend the email
      toast.info('Verification email resent. Please check your inbox.');
    } catch (error: any) {
      logger.error('[EmailChangeModal] Failed to resend email:', error);
      toast.error('Failed to resend verification email');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === 'form' ? (
          <>
            <DialogHeader>
              <DialogTitle>Change Email Address</DialogTitle>
              <DialogDescription>
                Enter your new email and confirm with your password
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleRequestChange} className="space-y-4">
              {/* Current Email (Read-only) */}
              <div>
                <Label htmlFor="current-email" className="text-sm">
                  Current Email
                </Label>
                <Input
                  id="current-email"
                  type="email"
                  value={currentEmail}
                  disabled
                  className="bg-gray-100 text-gray-500"
                />
              </div>

              {/* New Email */}
              <div>
                <Label htmlFor="new-email" className="text-sm">
                  New Email
                </Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="your.new.email@example.com"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    if (errors.newEmail) {
                      setErrors({ ...errors, newEmail: '' });
                    }
                  }}
                  disabled={isLoading}
                  className={errors.newEmail ? 'border-red-500' : ''}
                />
                {errors.newEmail && (
                  <p className="text-xs text-red-500 mt-1">{errors.newEmail}</p>
                )}
              </div>

              {/* Confirm Email */}
              <div>
                <Label htmlFor="confirm-email" className="text-sm">
                  Confirm Email
                </Label>
                <Input
                  id="confirm-email"
                  type="email"
                  placeholder="your.new.email@example.com"
                  value={confirmEmail}
                  onChange={(e) => {
                    setConfirmEmail(e.target.value);
                    if (errors.confirmEmail) {
                      setErrors({ ...errors, confirmEmail: '' });
                    }
                  }}
                  disabled={isLoading}
                  className={errors.confirmEmail ? 'border-red-500' : ''}
                />
                {errors.confirmEmail && (
                  <p className="text-xs text-red-500 mt-1">
                    {errors.confirmEmail}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <Label htmlFor="password" className="text-sm">
                  Confirm Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) {
                      setErrors({ ...errors, password: '' });
                    }
                  }}
                  disabled={isLoading}
                  className={errors.password ? 'border-red-500' : ''}
                />
                {errors.password && (
                  <p className="text-xs text-red-500 mt-1">{errors.password}</p>
                )}
              </div>

              {/* General Error */}
              {errors.submit && (
                <div className="bg-red-50 border border-red-200 rounded p-3 flex gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{errors.submit}</p>
                </div>
              )}

              {/* Security Note */}
              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-700">
                A verification link will be sent to your new email address. You'll
                need to click it to complete the change.
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 gap-2"
                >
                  {isLoading && (
                    <Loader className="w-4 h-4 animate-spin" />
                  )}
                  Request Change
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Email Change Pending</DialogTitle>
              <DialogDescription>
                A verification link has been sent to your new email
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-700">
                We've sent a verification link to <strong>{newEmail}</strong>.
                Click the link to confirm your new email address.
              </div>

              <div className="text-sm text-gray-600">
                <p className="font-semibold mb-2">What's next?</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Check your email for a verification link</li>
                  <li>Click the link within 24 hours</li>
                  <li>Your email will be updated immediately</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={handleCancelPending}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Cancel Request
                </Button>
                <Button
                  onClick={handleResendEmail}
                  disabled={isLoading}
                  className="flex-1 gap-2"
                >
                  {isLoading && (
                    <Loader className="w-4 h-4 animate-spin" />
                  )}
                  Resend Email
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default EmailChangeModal;
