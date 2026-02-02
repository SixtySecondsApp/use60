import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { logger } from '@/lib/utils/logger';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Loader } from 'lucide-react';

type VerificationStatus = 'loading' | 'success' | 'error';

export function EmailChangeVerification() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('No verification token provided');
      return;
    }

    verifyEmailChange();
  }, [token]);

  const verifyEmailChange = async () => {
    try {
      setStatus('loading');
      logger.log('[EmailChangeVerification] Verifying email change with token');

      // Call verify-email-change edge function
      const { data, error } = await supabase.functions.invoke(
        'verify-email-change',
        {
          body: { token },
        }
      );

      if (error) {
        throw new Error(error.message || 'Verification failed');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Verification failed');
      }

      logger.log('[EmailChangeVerification] Email change verified successfully');
      setNewEmail(data.newEmail);
      setStatus('success');

      // Auto-redirect after 5 seconds
      const redirectTimer = setTimeout(() => {
        navigate(`/auth/email-changed?email=${encodeURIComponent(data.newEmail)}`, {
          replace: true,
        });
      }, 5000);

      return () => clearTimeout(redirectTimer);
    } catch (error: any) {
      logger.error('[EmailChangeVerification] Verification error:', error);
      setStatus('error');
      setErrorMessage(error.message || 'Failed to verify email change');
      toast.error(error.message || 'Email verification failed');
    }
  };

  const handleRetry = () => {
    if (token) {
      verifyEmailChange();
    }
  };

  const handleNavigateToDashboard = () => {
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-8">
          {status === 'loading' && (
            <div className="text-center">
              <div className="mb-6 flex justify-center">
                <Loader className="w-12 h-12 text-blue-500 animate-spin" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-3">
                Verifying Your Email
              </h1>
              <p className="text-gray-300">
                Please wait while we confirm your email change...
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center">
              <div className="mb-6 flex justify-center">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-white mb-3">
                Email Verified
              </h1>
              <p className="text-gray-300 mb-6">
                Your email has been successfully changed to:
              </p>
              <p className="text-lg font-semibold text-white bg-gray-700 rounded px-3 py-2 mb-8 break-all">
                {newEmail}
              </p>
              <p className="text-sm text-gray-400 mb-6">
                Redirecting to dashboard in a few seconds...
              </p>
              <Button
                onClick={handleNavigateToDashboard}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                Go to Dashboard
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center">
              <div className="mb-6 flex justify-center">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-white mb-3">
                Verification Failed
              </h1>
              <p className="text-gray-300 mb-6">{errorMessage}</p>

              <div className="space-y-3">
                {token && (
                  <Button
                    onClick={handleRetry}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    Try Again
                  </Button>
                )}
                <Button
                  onClick={handleNavigateToDashboard}
                  variant="outline"
                  className="w-full"
                >
                  Go to Dashboard
                </Button>
              </div>

              <p className="text-xs text-gray-500 mt-6">
                If the problem persists, please contact support.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EmailChangeVerification;
