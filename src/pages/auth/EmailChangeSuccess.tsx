import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

export function EmailChangeSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [countdown, setCountdown] = useState(5);

  const newEmail = searchParams.get('email') || 'your new email';

  useEffect(() => {
    // Start countdown timer
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Auto-redirect when countdown reaches 0
          navigate('/dashboard', { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [navigate]);

  const handleContinue = () => {
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-8 text-center">
          {/* Success Icon */}
          <div className="mb-6 flex justify-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-green-500" />
            </div>
          </div>

          {/* Heading */}
          <h1 className="text-2xl font-bold text-white mb-3">
            Email Successfully Changed
          </h1>

          {/* Message */}
          <p className="text-gray-300 mb-2">
            Your email has been updated to:
          </p>
          <p className="text-lg font-semibold text-white bg-gray-700 rounded px-3 py-2 mb-6 break-all">
            {newEmail}
          </p>

          {/* Details */}
          <p className="text-sm text-gray-400 mb-8">
            You can now log in using your new email address. You'll be redirected to the dashboard shortly.
          </p>

          {/* Countdown */}
          <div className="mb-8">
            <p className="text-gray-300 text-sm">
              Redirecting in{' '}
              <span className="font-semibold text-white">{countdown}</span>{' '}
              seconds...
            </p>
            <div className="mt-3 w-full bg-gray-700 rounded-full h-1 overflow-hidden">
              <div
                className="bg-green-500 h-full transition-all duration-1000"
                style={{
                  width: `${(countdown / 5) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* Action Button */}
          <Button
            onClick={handleContinue}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            Continue to Dashboard
          </Button>

          {/* Footer Note */}
          <p className="text-xs text-gray-500 mt-6">
            You remain logged in and can access all your data.
          </p>
        </div>
      </div>
    </div>
  );
}

export default EmailChangeSuccess;
