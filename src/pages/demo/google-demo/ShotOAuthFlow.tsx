import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, Link2, MessageSquare, ToggleRight, ToggleLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useGoogleIntegration, useGoogleServiceStatus } from '@/lib/hooks/useGoogleIntegration';
import { googleApi } from '@/lib/api/googleIntegration';
import type { ShotComponentProps } from './types';

const GoogleLogo = ({ size = 'w-6 h-6' }: { size?: string }) => (
  <svg className={size} viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const stepVariants = {
  enter: { opacity: 0, x: 30 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
};

export default function ShotOAuthFlow({ activeStep, onStepChange, isActive }: ShotComponentProps) {
  const { data: integration, refetch } = useGoogleIntegration();
  const { data: services } = useGoogleServiceStatus();
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isConnected = !!integration?.is_active;

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  // When in connecting step (1), poll for connection status
  useEffect(() => {
    if (activeStep === 1 && !isConnected) {
      pollRef.current = setInterval(async () => {
        const { data } = await refetch();
        if (data?.is_active) {
          // Connected — close popup, stop polling, advance
          if (popupRef.current && !popupRef.current.closed) {
            popupRef.current.close();
          }
          popupRef.current = null;
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          onStepChange(2);
        }
      }, 2000);

      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }
  }, [activeStep, isConnected, refetch, onStepChange]);

  // If already connected and on connecting step, auto-advance
  useEffect(() => {
    if (activeStep === 1 && isConnected) {
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      onStepChange(2);
    }
  }, [activeStep, isConnected, onStepChange]);

  const handleConnect = useCallback(async () => {
    try {
      const { authUrl } = await googleApi.initiateOAuth();

      // Open centered popup
      const w = 800;
      const h = 600;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      popupRef.current = window.open(
        authUrl,
        'google-oauth',
        `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
      );

      // Move to connecting step
      onStepChange(1);
    } catch (err) {
      console.error('Failed to initiate Google OAuth:', err);
    }
  }, [onStepChange]);

  const integrationCards = [
    {
      name: 'Google Workspace',
      icon: null as null,
      description: 'Gmail, Calendar, Drive',
      connected: isConnected,
      highlight: true,
    },
    { name: 'Slack', icon: MessageSquare, description: 'Team messaging', connected: true, highlight: false },
    { name: 'HubSpot', icon: Link2, description: 'CRM sync', connected: false, highlight: false },
  ];

  const serviceToggles = [
    { label: 'Gmail Sync', desc: 'Read and send emails', key: 'gmail' as const },
    { label: 'Calendar Sync', desc: 'View and create events', key: 'calendar' as const },
    { label: 'Drive Access', desc: 'Read-only file access', key: 'drive' as const },
  ];

  return (
    <AnimatePresence mode="wait">
      {/* Step 0: Integration cards */}
      {activeStep === 0 && (
        <motion.div
          key="integrations"
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          <h3 className="text-lg font-semibold text-white">Integrations</h3>
          <p className="text-sm text-gray-400">Connect your tools to supercharge 60</p>
          <div className="grid gap-3 mt-4">
            {integrationCards.map((int) => (
              <Card
                key={int.name}
                className={cn(
                  'bg-gray-800/60 border-gray-700/50',
                  int.highlight && !int.connected && 'ring-1 ring-blue-500/40',
                  int.highlight && int.connected && 'ring-1 ring-green-500/30'
                )}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 rounded-lg bg-gray-700/50 flex items-center justify-center">
                    {int.name === 'Google Workspace' ? (
                      <GoogleLogo />
                    ) : int.icon ? (
                      <int.icon className="w-5 h-5 text-gray-400" />
                    ) : null}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{int.name}</p>
                    <p className="text-xs text-gray-500">{int.description}</p>
                  </div>
                  {int.connected ? (
                    <Badge variant="outline" className="border-green-500/40 text-green-400 text-xs">
                      Connected
                    </Badge>
                  ) : int.highlight ? (
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={handleConnect}
                    >
                      Connect
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="border-gray-600 text-gray-300">
                      Connect
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {/* Step 1: Connecting spinner */}
      {activeStep === 1 && (
        <motion.div
          key="connecting"
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center justify-center gap-6"
        >
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center"
          >
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
          </motion.div>
          <div className="text-center">
            <p className="text-lg font-medium text-white">Connecting to Google...</p>
            <p className="text-sm text-gray-400 mt-1">Complete sign-in in the popup window</p>
          </div>
        </motion.div>
      )}

      {/* Step 2: Connected state */}
      {activeStep === 2 && (
        <motion.div
          key="connected"
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
            className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30"
          >
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <div>
              <p className="text-sm font-medium text-green-300">Google Workspace Connected</p>
              <p className="text-xs text-green-400/60">{integration?.email ?? 'Unknown account'}</p>
            </div>
          </motion.div>

          <Card className="bg-gray-800/60 border-gray-700/50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-700/50 flex items-center justify-center">
                  <GoogleLogo />
                </div>
                <div>
                  <CardTitle className="text-sm text-white">Google Workspace</CardTitle>
                  <p className="text-xs text-gray-500">
                    Connected as {integration?.email ?? 'Unknown'}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {serviceToggles.map((service) => {
                const enabled = services?.[service.key] ?? false;
                return (
                  <div
                    key={service.label}
                    className="flex items-center justify-between py-2 border-b border-gray-700/30 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2
                        className={cn('w-4 h-4', enabled ? 'text-green-400' : 'text-gray-600')}
                      />
                      <div>
                        <p className="text-sm text-white">{service.label}</p>
                        <p className="text-xs text-gray-500">{service.desc}</p>
                      </div>
                    </div>
                    {enabled ? (
                      <ToggleRight className="w-6 h-6 text-green-400" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-gray-600" />
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
