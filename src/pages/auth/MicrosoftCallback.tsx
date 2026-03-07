import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

export default function MicrosoftCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing Microsoft authorization...');

  useEffect(() => {
    const statusParam = searchParams.get('status');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    const email = searchParams.get('email');

    if (statusParam === 'connected') {
      setStatus('success');
      setMessage(email ? `Connected ${email} successfully!` : 'Microsoft account connected successfully!');
      toast.success(email ? `Connected Microsoft account: ${email}` : 'Microsoft account connected!');
      setTimeout(() => navigate('/integrations'), 3000);
    } else if (error || statusParam === 'error') {
      setStatus('error');
      setMessage(errorDescription || error || 'Authorization failed');
      toast.error(`Microsoft authorization failed: ${errorDescription || error || 'Unknown error'}`);
      setTimeout(() => navigate('/integrations'), 3000);
    } else {
      // No status params yet — the edge function should redirect here with params
      setStatus('error');
      setMessage('No authorization status received');
      toast.error('Invalid callback - no authorization status');
      setTimeout(() => navigate('/integrations'), 3000);
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-gray-900/50 backdrop-blur-md rounded-xl border border-gray-800 p-8">
          <div className="flex flex-col items-center space-y-6">
            {/* Status Icon */}
            <div className="relative">
              {status === 'processing' && (
                <Loader2 className="h-16 w-16 text-blue-500 animate-spin" />
              )}
              {status === 'success' && (
                <CheckCircle className="h-16 w-16 text-green-500 animate-pulse" />
              )}
              {status === 'error' && (
                <XCircle className="h-16 w-16 text-red-500" />
              )}
            </div>

            {/* Status Message */}
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold text-white">
                {status === 'processing' && 'Connecting to Microsoft'}
                {status === 'success' && 'Connected Successfully!'}
                {status === 'error' && 'Connection Failed'}
              </h2>
              <p className="text-gray-400">{message}</p>
            </div>

            {/* Progress Indicator */}
            {status === 'processing' && (
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '75%' }} />
              </div>
            )}

            {/* Additional Info */}
            {status === 'success' && (
              <div className="text-center text-sm text-gray-500">
                <p>Redirecting you to integrations...</p>
              </div>
            )}

            {status === 'error' && (
              <div className="text-center text-sm text-gray-500">
                <p>Redirecting you back...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
