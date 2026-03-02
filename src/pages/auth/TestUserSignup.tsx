/**
 * Test User Signup Page
 *
 * Minimal signup flow for users invited via admin-generated magic links.
 * - Token extracted from URL params
 * - Email pre-filled and locked from token
 * - Only collects: password, first name, last name
 * - Skips onboarding entirely — auto-signs in and goes straight to dashboard
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, Lock, User, Loader2, Mail, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

type SignupStatus = 'loading' | 'ready' | 'submitting' | 'error';

interface TokenInfo {
  email: string;
  org_name: string;
  is_test_user: boolean;
}

export default function TestUserSignup() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [status, setStatus] = useState<SignupStatus>('loading');
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
  });

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('Invalid signup link');
      return;
    }

    const validateToken = async () => {
      setStatus('loading');

      try {
        const response = await supabase.functions.invoke('validate-test-user-link', {
          body: { token },
        });

        if (response.error) {
          setStatus('error');
          setError('Failed to validate link');
          return;
        }

        const result = response.data;
        if (!result.valid) {
          setStatus('error');
          setError(result.error || 'This link is invalid or has expired');
          return;
        }

        setTokenInfo({
          email: result.email,
          org_name: result.org_name,
          is_test_user: result.is_test_user,
        });
        setStatus('ready');
      } catch (err: any) {
        setStatus('error');
        setError(err.message || 'Failed to validate link');
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !tokenInfo) return;

    // Validate form
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      toast.error('First and last name are required');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setStatus('submitting');

    try {
      const response = await supabase.functions.invoke('complete-test-user-signup', {
        body: {
          token,
          email: tokenInfo.email,
          password: formData.password,
          first_name: formData.firstName.trim(),
          last_name: formData.lastName.trim(),
        },
      });

      if (response.error) {
        // Extract error message from edge function response body
        let errorMsg = 'Signup failed';
        try {
          const ctx = response.error?.context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            errorMsg = body?.error || errorMsg;
          }
        } catch {
          errorMsg = response.error.message || errorMsg;
        }
        throw new Error(errorMsg);
      }

      const result = response.data;
      if (!result?.success) {
        throw new Error(result?.error || 'Signup failed');
      }

      // Set onboarding completed timestamp so ProductTour triggers
      localStorage.setItem('sixty_onboarding_completed_at', String(Date.now()));

      // Set the magic link org as active BEFORE sign-in so orgStore picks it up
      try {
        const stored = JSON.parse(localStorage.getItem('org-store') || '{}');
        stored.state = { ...stored.state, activeOrgId: result.org_id, activeOrgRole: 'owner' };
        localStorage.setItem('org-store', JSON.stringify(stored));
      } catch {
        // Fallback: create fresh store state
        localStorage.setItem('org-store', JSON.stringify({
          state: { activeOrgId: result.org_id, activeOrgRole: 'owner' },
          version: 0,
        }));
      }

      // Auto-sign in with the credentials they just set
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: tokenInfo.email,
        password: formData.password,
      });

      if (signInError) {
        console.error('Auto sign-in failed:', signInError);
        toast.error('Account created but auto-login failed. Please log in manually.');
        navigate('/auth/login');
        return;
      }

      // Signed in — go straight to dashboard
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setStatus('ready');
      toast.error(err.message || 'Failed to create account');
    }
  };

  // Loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.25),transparent)] pointer-events-none" />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <Loader2 className="w-8 h-8 animate-spin text-[#37bd7e] mx-auto mb-4" />
          <p className="text-gray-400">Validating your link...</p>
        </motion.div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.25),transparent)] pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="relative bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-800/50 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-4">Invalid Link</h1>
            <p className="text-gray-400 mb-6">{error}</p>
            <Button
              onClick={() => navigate('/auth/login')}
              className="bg-[#37bd7e] hover:bg-[#2da76c] text-white"
            >
              Go to Login
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Signup form
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
            <div className="w-16 h-16 rounded-full bg-[#37bd7e]/20 flex items-center justify-center mx-auto mb-6">
              <Building2 className="w-8 h-8 text-[#37bd7e]" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Join{' '}
              <span className="text-[#37bd7e]">{tokenInfo?.org_name}</span>
            </h1>
            <p className="text-gray-400">
              Create your account to get started
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email — locked */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={tokenInfo?.email || ''}
                  disabled
                  className="w-full bg-gray-700/50 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-gray-400 placeholder-gray-500 cursor-not-allowed opacity-75"
                />
              </div>
              <p className="text-xs text-gray-500">This email is linked to your invitation</p>
            </div>

            {/* First and Last Name */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">First Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-colors hover:bg-gray-600"
                    placeholder="Sarah"
                    disabled={status === 'submitting'}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Last Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-colors hover:bg-gray-600"
                    placeholder="Johnson"
                    disabled={status === 'submitting'}
                  />
                </div>
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-colors hover:bg-gray-600"
                  placeholder="••••••••"
                  disabled={status === 'submitting'}
                />
              </div>
              <p className="text-xs text-gray-500">Minimum 6 characters</p>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-colors hover:bg-gray-600"
                  placeholder="••••••••"
                  disabled={status === 'submitting'}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={status === 'submitting'}
              className="w-full bg-[#37bd7e] hover:bg-[#2da76c] text-white py-2.5 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-[#37bd7e] focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#37bd7e]/20"
            >
              {status === 'submitting' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                  Setting up your account...
                </>
              ) : (
                'Create Account & Get Started'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Already have an account?{' '}
              <button
                onClick={() => navigate('/auth/login')}
                className="text-[#37bd7e] hover:text-[#2da76c] font-medium transition-colors"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
