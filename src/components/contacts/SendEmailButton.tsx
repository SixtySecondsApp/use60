import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Mail,
  Loader2,
  AlertCircle,
  ExternalLink,
  Lock,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useIntegrationStore } from '@/lib/stores/integrationStore';
import EmailComposerModal from './EmailComposerModal';

interface SendEmailButtonProps {
  contactEmail: string;
  contactName?: string;
  contactId?: string;
  variant?: 'default' | 'ghost' | 'outline' | 'secondary';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  className?: string;
  disabled?: boolean;
  showLabel?: boolean;
  onEmailSent?: (messageId: string) => void;
}

const SendEmailButton: React.FC<SendEmailButtonProps> = ({
  contactEmail,
  contactName,
  contactId,
  variant = 'default',
  size = 'md',
  className = '',
  disabled = false,
  showLabel = true,
  onEmailSent
}) => {
  const { google, checkGoogleConnection, connectNylas } = useIntegrationStore();
  const [showComposer, setShowComposer] = useState(false);

  useEffect(() => {
    if (!google.isConnected && !google.isLoading) {
      checkGoogleConnection();
    }
  }, []);

  const handleEmailClick = async () => {
    if (!google.isConnected) {
      toast.error('Connect Google account to send emails');
      return;
    }

    // If connected but can't read Gmail (free tier), show upgrade prompt
    if (!google.canReadGmail) {
      try {
        const authUrl = await connectNylas();
        window.location.href = authUrl;
      } catch (error: any) {
        toast.error(error.message || 'Failed to start Gmail upgrade');
      }
      return;
    }

    setShowComposer(true);
  };

  const handleEmailSent = (messageId: string) => {
    if (onEmailSent) {
      onEmailSent(messageId);
    }
    toast.success('Email sent successfully!');
  };

  const getButtonContent = () => {
    if (google.isLoading) {
      return (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {showLabel && size !== 'icon' && <span>Checking...</span>}
        </>
      );
    }

    if (!google.isConnected) {
      return (
        <>
          <AlertCircle className="h-4 w-4" />
          {showLabel && size !== 'icon' && <span>No Gmail</span>}
        </>
      );
    }

    if (!google.canReadGmail) {
      return (
        <>
          <Lock className="h-4 w-4" />
          {showLabel && size !== 'icon' && <span>Upgrade Gmail</span>}
        </>
      );
    }

    return (
      <>
        <Mail className="h-4 w-4" />
        {showLabel && size !== 'icon' && <span>Send Email</span>}
      </>
    );
  };

  const getTooltipContent = () => {
    if (google.isLoading) {
      return 'Checking Google integration...';
    }

    if (!google.isConnected) {
      return 'Connect Google account to send emails';
    }

    if (!google.canReadGmail) {
      return 'Upgrade to full Gmail access for reading and drafting emails';
    }

    return `Send email to ${contactEmail}${google.email ? ` from ${google.email}` : ''}`;
  };

  const isDisabled = disabled || google.isLoading || !google.isConnected;

  // Map 'md' size to 'default' for Button component compatibility
  const buttonSize = size === 'md' ? 'default' : size;

  return (
    <TooltipProvider>
      <div className="relative">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={variant}
              size={buttonSize as 'default' | 'sm' | 'lg' | 'icon'}
              onClick={handleEmailClick}
              disabled={isDisabled}
              className={`relative ${className} ${
                !google.isConnected && !google.isLoading
                  ? 'opacity-60 cursor-not-allowed'
                  : ''
              }`}
            >
              <div className="flex items-center gap-2">
                {getButtonContent()}
              </div>

              {google.isConnected && google.canReadGmail && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900"
                />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="text-center">
              <p>{getTooltipContent()}</p>
              {google.isConnected && google.email && (
                <p className="text-xs text-slate-400 mt-1">
                  Connected as {google.email}
                </p>
              )}
              {!google.isConnected && !google.isLoading && (
                <div className="mt-2">
                  <Badge variant="outline" className="text-xs">
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Setup required
                  </Badge>
                </div>
              )}
              {google.isConnected && !google.canReadGmail && (
                <div className="mt-2">
                  <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30">
                    <Lock className="h-3 w-3 mr-1" />
                    Limited access
                  </Badge>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Email Composer Modal */}
        <EmailComposerModal
          isOpen={showComposer}
          onClose={() => setShowComposer(false)}
          contactEmail={contactEmail}
          contactName={contactName}
          onSent={handleEmailSent}
        />

        {/* Connection Status Indicator */}
        {!google.isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute -bottom-1 -right-1"
          >
            {google.isConnected && google.canReadGmail ? (
              <div className="w-2 h-2 bg-green-500 rounded-full" />
            ) : google.isConnected ? (
              <div className="w-2 h-2 bg-amber-500 rounded-full" />
            ) : (
              <div className="w-2 h-2 bg-red-500 rounded-full" />
            )}
          </motion.div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default SendEmailButton;
