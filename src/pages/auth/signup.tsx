import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';
import { Mail, Lock, User, ArrowLeft, LogIn, Globe } from 'lucide-react';
import { useAccessCode } from '@/lib/hooks/useAccessCode';
import { AccessCodeInput } from '@/components/AccessCodeInput';
import { incrementCodeUsage } from '@/lib/services/accessCodeService';
import { extractDomainFromWebsite } from '@/lib/utils/domainUtils';
import { supabase } from '@/lib/supabase/clientV2';

export default function Signup() {
  const [isLoading, setIsLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    companyDomain: '',
  });
  const [existingAccountError, setExistingAccountError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const accessCode = useAccessCode();

  // Get redirect destination from URL params (e.g., when coming from /invite/:token)
  const redirectPath = searchParams.get('redirect') || null;
  const emailParam = searchParams.get('email') || null;

  // Pre-fill form from invitation email param, waitlist data, or localStorage
  useEffect(() => {
    const prefillFromWaitlist = async () => {
      // Priority 1: Email from invitation/organization join link
      if (emailParam) {
        setFormData(prev => ({ ...prev, email: emailParam }));
        setExistingAccountError(null); // Clear any previous errors
        return;
      }

      // Priority 2: Check localStorage for waitlist data
      const waitlistEmail = localStorage.getItem('waitlist_email');
      const waitlistName = localStorage.getItem('waitlist_name');
      const waitlistEntryId = searchParams.get('waitlist_entry') || localStorage.getItem('waitlist_entry_id');

      if (waitlistEmail) {
        setFormData(prev => ({ ...prev, email: waitlistEmail }));
      }

      if (waitlistName) {
        const nameParts = waitlistName.trim().split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        setFormData(prev => ({
          ...prev,
          firstName,
          lastName,
        }));
      }

      // If we have a waitlist entry ID, try to fetch full data
      if (waitlistEntryId && !waitlistEmail) {
        try {
          const { data: entry } = await supabase
            .from('meetings_waitlist')
            .select('email, full_name')
            .eq('id', waitlistEntryId)
            .single();

          if (entry) {
            setFormData(prev => ({ ...prev, email: entry.email || prev.email }));
            if (entry.full_name) {
              const nameParts = entry.full_name.trim().split(' ');
              const firstName = nameParts[0] || '';
              const lastName = nameParts.slice(1).join(' ') || '';
              setFormData(prev => ({
                ...prev,
                firstName,
                lastName,
              }));
            }
          }
        } catch (err) {
          console.warn('Could not fetch waitlist entry:', err);
        }
      }
    };

    prefillFromWaitlist();
  }, [searchParams]);

  const validateCompanyDomain = (input: string): boolean => {
    if (!input || input.trim().length === 0) return true; // Optional field
    const domain = extractDomainFromWebsite(input.trim());
    return domain !== null && domain.includes('.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate access code first
    if (!accessCode.isValid) {
      const isValid = await accessCode.validate();
      if (!isValid) {
        toast.error('Please enter a valid access code');
        return;
      }
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    if (!validateCompanyDomain(formData.companyDomain)) {
      toast.error('Please enter a valid company domain (e.g., mycompany.com)');
      return;
    }

    setIsLoading(true);

    try {
      const fullName = `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim();
      const companyDomain = formData.companyDomain.trim()
        ? extractDomainFromWebsite(formData.companyDomain.trim())
        : null;

      const { error } = await signUp(
        formData.email,
        formData.password,
        {
          full_name: fullName,
          first_name: formData.firstName.trim(),
          last_name: formData.lastName.trim(),
          company_domain: companyDomain,
        }
      );

      if (error) {
        // Check if this is an "account already exists" error
        if (error.message.toLowerCase().includes('already registered') ||
            error.message.toLowerCase().includes('already exists') ||
            error.message.toLowerCase().includes('user already') ||
            error.message.toLowerCase().includes('user_already_exists')) {
          // Show error with login link
          const loginUrl = `/auth/login?email=${encodeURIComponent(formData.email)}${redirectPath ? `&redirect=${encodeURIComponent(redirectPath)}` : ''}`;
          setExistingAccountError(
            `An account with ${formData.email} already exists. `
          );
          toast.error('Account already exists. Please log in instead.');
        } else {
          toast.error(error.message);
        }
      } else {
        // Increment code usage on successful signup
        await incrementCodeUsage(accessCode.code);

        // Get the newly created user
        const { data: { user: newUser } } = await supabase.auth.getUser();

        if (newUser) {
          // Try to auto-verify email if user has valid access code (linked to waitlist)
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              const { data: verifyResult, error: verifyError } = await supabase.functions.invoke('auto-verify-email', {
                body: { userId: newUser.id },
                headers: {
                  Authorization: `Bearer ${session.access_token}`
                }
              });

              if (!verifyError && verifyResult?.success) {
                // Email auto-verified, refresh session
                await supabase.auth.refreshSession();
                toast.success('Account created! Redirecting...');

                // If coming from invitation, go back to accept invitation
                if (redirectPath) {
                  navigate(redirectPath, { replace: true });
                } else {
                  // Otherwise go to onboarding
                  navigate('/onboarding', { replace: true });
                }
                return;
              }
            }
          } catch (verifyErr) {
            console.warn('Auto-verification failed, user will need to verify email:', verifyErr);
          }
        }

        // Fallback: show verification screen, but preserve redirect for after verification
        toast.success('Account created! Please check your email to verify.');
        const verifyEmailPath = `/auth/verify-email?email=${encodeURIComponent(formData.email)}${redirectPath ? `&redirect=${encodeURIComponent(redirectPath)}` : ''}`;
        navigate(verifyEmailPath);
      }
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
            <h1 className="text-3xl font-bold mb-2 text-white">Create an account</h1>
            <p className="text-gray-400">Start tracking your sales performance</p>
          </div>

          {/* Show error if account already exists */}
          {existingAccountError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-amber-500/20 border border-amber-500/30 rounded-lg"
            >
              <p className="text-amber-300 text-sm mb-3">
                {existingAccountError}
              </p>
              <Link
                to={`/auth/login?email=${encodeURIComponent(formData.email)}${redirectPath ? `&redirect=${encodeURIComponent(redirectPath)}` : ''}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-amber-300 hover:text-amber-200 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Log in to your account instead
              </Link>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">
                  First Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-colors hover:bg-gray-600"
                    placeholder="Sarah"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">
                  Last Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-colors hover:bg-gray-600"
                    placeholder="Johnson"
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>

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
              <label className="text-sm font-medium text-gray-400">
                Company Website <span className="text-gray-500">(Optional)</span>
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={formData.companyDomain}
                  onChange={(e) => setFormData({ ...formData, companyDomain: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-colors hover:bg-gray-600"
                  placeholder="mycompany.com"
                  disabled={isLoading}
                />
              </div>
              <p className="text-xs text-gray-500">
                We'll use this to customize your experience
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">
                Password
              </label>
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
                  disabled={isLoading}
                />
              </div>
              <p className="text-xs text-gray-500">
                Must be at least 6 characters
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">
                Confirm Password
              </label>
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
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Access Code */}
            <AccessCodeInput
              value={accessCode.code}
              onChange={accessCode.setCode}
              isValid={accessCode.isValid}
              isValidating={accessCode.isValidating}
              error={accessCode.error}
              onValidate={accessCode.validate}
              disabled={isLoading}
              readOnly={accessCode.hasUrlCode}
            />

            <button
              type="submit"
              disabled={isLoading || !accessCode.isValid}
              className="w-full bg-[#37bd7e] text-white py-2.5 rounded-xl font-medium hover:bg-[#2da76c] focus:outline-none focus:ring-2 focus:ring-[#37bd7e] focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#37bd7e]/20"
            >
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/auth/login"
              className="text-[#37bd7e] hover:text-[#2da76c] text-sm font-medium inline-flex items-center gap-1 transition-all duration-300 hover:gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
