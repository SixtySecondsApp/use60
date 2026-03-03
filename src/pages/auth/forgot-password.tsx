import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, isClerkAuthEnabled } from '@/lib/contexts/AuthContext';
import { useSignIn } from '@clerk/clerk-react';
import { toast } from 'sonner';
import { Mail, ArrowLeft, Lock, KeyRound } from 'lucide-react';

export default function ForgotPassword() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  // Clerk-specific state for 2-step verification
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showVerificationStep, setShowVerificationStep] = useState(false);

  const navigate = useNavigate();
  const { resetPassword, isAuthenticated, loading: authLoading } = useAuth();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Clerk hooks - always called (React Rules of Hooks), guarded at usage
  const clerkSignIn = useSignIn();
  const { signIn, setActive } = isClerkAuthEnabled() ? clerkSignIn : {};

  // Handle Supabase password reset (sends email with link)
  const handleSupabaseReset = async () => {
    console.log('[ForgotPassword] Attempting password reset for:', email.toLowerCase().trim());
    console.log('[ForgotPassword] Current window location:', window.location.href);

    const { error } = await resetPassword(email);

    if (error) {
      console.error('[ForgotPassword] Reset failed:', error);
      toast.error(error.message || 'Failed to send reset email. Please try again.');
    } else {
      console.log('[ForgotPassword] ✅ Password reset email sent successfully');
      setIsSubmitted(true);
      toast.success('Password reset instructions sent to your email');
    }
  };

  // Handle Clerk password reset - Step 1: Request code
  const handleClerkResetRequest = async () => {
    if (!signIn) return;

    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.toLowerCase().trim(),
      });
      setShowVerificationStep(true);
      toast.success('Verification code sent to your email');
    } catch (err: any) {
      const errorMessage = err?.errors?.[0]?.longMessage
        || err?.errors?.[0]?.message
        || err?.message
        || 'Failed to send reset code';
      toast.error(errorMessage);
    }
  };

  // Handle Clerk password reset - Step 2: Verify code and set password
  const handleClerkVerifyAndReset = async () => {
    if (!signIn || !setActive) return;

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: verificationCode,
        password: newPassword,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        toast.success('Password reset successful! You are now logged in.');
        navigate('/dashboard', { replace: true });
      } else {
        toast.error('Password reset incomplete. Please try again.');
      }
    } catch (err: any) {
      const errorMessage = err?.errors?.[0]?.longMessage
        || err?.errors?.[0]?.message
        || err?.message
        || 'Failed to reset password';
      toast.error(errorMessage);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error('Please enter your email address');
      return;
    }

    setIsLoading(true);

    try {
      if (isClerkAuthEnabled()) {
        await handleClerkResetRequest();
      } else {
        await handleSupabaseReset();
      }
    } catch (error: any) {
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!verificationCode.trim()) {
      toast.error('Please enter the verification code');
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      await handleClerkVerifyAndReset();
    } catch (error: any) {
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.25),transparent)] pointer-events-none" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="relative bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-800/50 p-6 sm:p-8 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900/90 via-gray-900/70 to-gray-900/30 rounded-2xl -z-10" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.15),transparent)] rounded-2xl -z-10" />
          <div className="absolute -right-20 -top-20 w-40 h-40 bg-[#37bd7e]/10 blur-3xl rounded-full" />

          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2 text-white">Reset Password</h1>
            <p className="text-gray-400">
              {isSubmitted 
                ? "Check your email for reset instructions" 
                : "Enter your email to receive a password reset link"}
            </p>
          </div>

          {/* Step 1: Email input (for both Supabase and Clerk) */}
          {!isSubmitted && !showVerificationStep && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors hover:bg-gray-600"
                    placeholder="sarah@example.com"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#37bd7e] text-white py-2.5 rounded-xl font-medium hover:bg-[#2da76c] focus:outline-none focus:ring-2 focus:ring-[#37bd7e] focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#37bd7e]/20"
              >
                {isLoading ? 'Sending...' : 'Send Reset Code'}
              </button>
            </form>
          )}

          {/* Step 2: Clerk verification code + new password */}
          {showVerificationStep && (
            <form onSubmit={handleVerificationSubmit} className="space-y-6">
              <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700/30 mb-4">
                <p className="text-gray-300 text-sm">
                  We've sent a verification code to <span className="text-[#37bd7e] font-medium">{email}</span>
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">
                  Verification Code
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors hover:bg-gray-600"
                    placeholder="Enter 6-digit code"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors hover:bg-gray-600"
                    placeholder="At least 8 characters"
                    disabled={isLoading}
                    minLength={8}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#37bd7e] text-white py-2.5 rounded-xl font-medium hover:bg-[#2da76c] focus:outline-none focus:ring-2 focus:ring-[#37bd7e] focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#37bd7e]/20"
              >
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowVerificationStep(false);
                  setVerificationCode('');
                  setNewPassword('');
                }}
                className="w-full text-gray-400 hover:text-white text-sm font-medium transition-colors"
              >
                Use a different email
              </button>
            </form>
          )}

          {/* Supabase success message (email link sent) */}
          {isSubmitted && !showVerificationStep && (
            <div className="p-6 bg-gray-800/30 rounded-xl border border-gray-700/30 text-center">
              <p className="text-gray-300 mb-4">
                We've sent a password reset link to <span className="text-[#37bd7e] font-medium">{email}</span>
              </p>
              <p className="text-gray-400 text-sm mb-6">
                Please check your inbox and follow the instructions to reset your password. The link will expire in 24 hours.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => navigate('/auth/login')}
                  className="w-full bg-gray-700/50 hover:bg-gray-700 text-white py-2 px-4 rounded-xl font-medium transition-colors"
                >
                  Return to Login
                </button>
                <button
                  onClick={() => setIsSubmitted(false)}
                  className="w-full text-[#37bd7e] hover:text-[#2da76c] text-sm font-medium transition-colors"
                >
                  Send to different email
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/auth/login"
              className="text-[#37bd7e] hover:text-[#2da76c] text-sm font-medium inline-flex items-center gap-1 transition-all duration-300 hover:gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Login
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
} 