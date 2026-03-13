import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';
import { Mail, Lock, ArrowRight, KeyRound, ArrowLeft } from 'lucide-react';
import { usePublicBrandingSettings } from '@/lib/hooks/useBrandingSettings';

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [verificationCode, setVerificationCode] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signInWithGoogle, signInWithMicrosoft, verifySecondFactor, isAuthenticated, loading: authLoading } = useAuth();
  const { logoDark } = usePublicBrandingSettings();

  // Redirect authenticated users to their intended destination
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate(getRedirectPath(), { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Pre-fill email from URL params if provided (from invitation or signup existing account)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const emailParam = params.get('email');
    if (emailParam) {
      setFormData(prev => ({ ...prev, email: emailParam }));
    }
  }, [location.search]);

  // Get the intended destination from location state or URL params
  const getRedirectPath = () => {
    // Check URL params first (for invitation redirects)
    const params = new URLSearchParams(location.search);
    const redirectParam = params.get('redirect');
    if (redirectParam && redirectParam !== '/auth/login' && redirectParam !== '/learnmore') {
      return redirectParam;
    }

    // Fall back to location state (from ProtectedRoute)
    const from = (location.state as any)?.from;
    if (from && from !== '/auth/login' && from !== '/learnmore') {
      return from;
    }
    return '/dashboard';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await signIn(formData.email, formData.password);

      if (error) {
        // Check if this error requires verification
        if (error.requiresVerification) {
          setNeedsVerification(true);
          toast.info('Please check your email for a verification code');
        } else {
          toast.error(error.message);
        }
      } else {
        // Success - redirect to intended destination or dashboard
        const redirectPath = getRedirectPath();
        navigate(redirectPath, { replace: true });
      }
    } catch (error: any) {
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await verifySecondFactor(verificationCode);

      if (error) {
        toast.error(error.message);
      } else {
        // Success - redirect to intended destination or dashboard
        const redirectPath = getRedirectPath();
        navigate(redirectPath, { replace: true });
      }
    } catch (error: any) {
      toast.error('Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        toast.error(error.message || 'Failed to sign in with Google');
        setIsGoogleLoading(false);
      }
      // If no error, browser is redirecting to Google — don't reset loading
    } catch {
      toast.error('An unexpected error occurred. Please try again.');
      setIsGoogleLoading(false);
    }
  };

  const handleMicrosoftSignIn = async () => {
    setIsMicrosoftLoading(true);
    try {
      const { error } = await signInWithMicrosoft();
      if (error) {
        toast.error(error.message || 'Failed to sign in with Microsoft');
        setIsMicrosoftLoading(false);
      }
      // If no error, browser is redirecting to Microsoft — don't reset loading
    } catch {
      toast.error('An unexpected error occurred. Please try again.');
      setIsMicrosoftLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setNeedsVerification(false);
    setVerificationCode('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-100 transition-colors duration-300">
      {/* Navigation - Fixed at top */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-gray-900/90 border-b border-gray-800/50 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <motion.a
              href="/"
              className="flex items-center gap-3"
              whileHover={{ scale: 1.02 }}
            >
              {logoDark ? (
                <img
                  src={logoDark}
                  alt="60"
                  className="h-10 w-auto transition-all duration-300"
                />
              ) : (
                <span className="text-xl font-bold text-[#37bd7e]">Sixty</span>
              )}
            </motion.a>

            <div className="flex items-center gap-3 sm:gap-4">
              <a
                href="https://use60.com/learnmore"
                className="text-sm font-medium text-gray-400 hover:text-white transition-colors duration-200 hidden sm:block"
              >
                Learn More
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="min-h-screen flex items-center justify-center p-4 pt-24 relative">
        {/* Background Gradient Effects */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.25),transparent)]" />
        </div>
      
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-md"
        >
          <div className="relative rounded-2xl overflow-hidden backdrop-blur-xl bg-gray-900/50 border border-gray-800/50 shadow-2xl p-6 sm:p-8">
            {/* Background Gradient Effects */}
            <div className="absolute inset-0 bg-gradient-to-br from-gray-900/90 via-gray-900/70 to-gray-900/30 rounded-2xl -z-10" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.15),transparent)] rounded-2xl -z-10" />
            <div className="absolute -right-20 -top-20 w-40 h-40 bg-[#37bd7e]/10 blur-3xl rounded-full" />

            {!needsVerification ? (
            <>
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold mb-2 text-white">Welcome back</h1>
                <p className="text-gray-400">Sign in to your account to continue</p>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading || isGoogleLoading}
                className="w-full flex items-center justify-center gap-3 bg-gray-700 border border-gray-600 text-white py-2.5 rounded-xl font-medium hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGoogleLoading ? (
                  <ArrowRight className="w-5 h-5 animate-spin" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                {isGoogleLoading ? 'Redirecting...' : 'Continue with Google'}
              </button>

              <button
                type="button"
                onClick={handleMicrosoftSignIn}
                disabled={isLoading || isGoogleLoading || isMicrosoftLoading}
                className="w-full flex items-center justify-center gap-3 bg-gray-700 border border-gray-600 text-white py-2.5 rounded-xl font-medium hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed mt-3"
              >
                {isMicrosoftLoading ? (
                  <ArrowRight className="w-5 h-5 animate-spin" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 21 21">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                  </svg>
                )}
                {isMicrosoftLoading ? 'Redirecting...' : 'Continue with Microsoft'}
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-700" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-gray-900/50 text-gray-500">or</span>
                </div>
              </div>

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
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-colors hover:bg-gray-600"
                      placeholder="sarah@example.com"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium text-gray-400">
                      Password
                    </label>
                    <Link
                      to="/auth/forgot-password"
                      className="text-xs text-[#37bd7e] hover:text-[#2da76c] font-medium transition-colors"
                    >
                      Forgot Password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="password"
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-colors hover:bg-gray-600"
                      placeholder="••••••••"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-[#37bd7e] text-white py-2.5 rounded-xl font-medium hover:bg-[#2da76c] focus:outline-none focus:ring-2 focus:ring-[#37bd7e] focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#37bd7e]/20"
                >
                  {isLoading ? 'Signing in...' : 'Sign in'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  to="/auth/signup"
                  className="text-[#37bd7e] hover:text-[#2da76c] text-sm font-medium inline-flex items-center gap-1 transition-all duration-300 hover:gap-2"
                >
                  Create an account
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold mb-2 text-white">Enter Verification Code</h1>
                <p className="text-gray-400">
                  We've sent a verification code to<br />
                  <span className="text-white font-medium">{formData.email}</span>
                </p>
              </div>

              <form onSubmit={handleVerifyCode} className="space-y-6">
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
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-colors hover:bg-gray-600 text-center text-lg tracking-widest"
                      placeholder="000000"
                      disabled={isLoading}
                      maxLength={6}
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-gray-500 text-center">
                    Enter the 6-digit code from your email
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || verificationCode.length !== 6}
                  className="w-full bg-[#37bd7e] text-white py-2.5 rounded-xl font-medium hover:bg-[#2da76c] focus:outline-none focus:ring-2 focus:ring-[#37bd7e] focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#37bd7e]/20"
                >
                  {isLoading ? 'Verifying...' : 'Verify & Sign In'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={handleBackToLogin}
                  className="text-[#37bd7e] hover:text-[#2da76c] text-sm font-medium inline-flex items-center gap-1 transition-all duration-300 hover:gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to login
                </button>
              </div>
            </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}