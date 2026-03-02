import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ToggleRight,
  ToggleLeft,
  Unplug,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  useGoogleIntegration,
  useGoogleDisconnect,
  useGoogleServiceStatus,
} from '@/lib/hooks/useGoogleIntegration';
import type { ShotComponentProps } from './types';

const GoogleLogo = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24">
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

export default function ShotDisconnect({ activeStep, onStepChange }: ShotComponentProps) {
  const { data: integration, refetch } = useGoogleIntegration();
  const { data: services } = useGoogleServiceStatus();
  const disconnectMutation = useGoogleDisconnect();
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const isConnected = !!integration?.is_active;

  const serviceToggles = [
    { label: 'Gmail Sync', desc: 'Read and send emails', key: 'gmail' as const },
    { label: 'Calendar Sync', desc: 'View and create events', key: 'calendar' as const },
    { label: 'Drive Access', desc: 'Read-only file access', key: 'drive' as const },
  ];

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await disconnectMutation.mutateAsync();
      await refetch();
      onStepChange(2);
    } catch (err) {
      console.error('Failed to disconnect Google:', err);
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {/* Step 0: Connected state with disconnect button */}
      {activeStep === 0 && (
        <motion.div
          key="connected"
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.3 }}
        >
          {isConnected && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30 mb-4">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-sm font-medium text-green-300">Google Workspace Connected</p>
                <p className="text-xs text-green-400/60">{integration?.email ?? 'Unknown account'}</p>
              </div>
            </div>
          )}

          <Card className="bg-gray-800/60 border-gray-700/50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-10 h-10 rounded-lg bg-gray-700/50 flex items-center justify-center',
                  !isConnected && 'opacity-50'
                )}>
                  <GoogleLogo />
                </div>
                <div>
                  <CardTitle className="text-sm text-white">Google Workspace</CardTitle>
                  <p className="text-xs text-gray-500">
                    {isConnected
                      ? `Connected as ${integration?.email ?? 'Unknown'}`
                      : 'Not connected'}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {serviceToggles.map((service) => {
                const enabled = isConnected && (services?.[service.key] ?? false);
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
                        <p className={cn('text-sm', enabled ? 'text-white' : 'text-gray-500')}>
                          {service.label}
                        </p>
                        <p className={cn('text-xs', enabled ? 'text-gray-500' : 'text-gray-600')}>
                          {service.desc}
                        </p>
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
              {isConnected && (
                <Button
                  variant="outline"
                  className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 mt-2 gap-2"
                  onClick={() => onStepChange(1)}
                >
                  <Unplug className="w-4 h-4" />
                  Disconnect Google
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Step 1: Confirmation dialog */}
      {activeStep === 1 && (
        <motion.div
          key="confirm"
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.3 }}
          className="flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <Card className="bg-gray-800/80 border-red-500/30 w-[420px] shadow-lg">
              <CardHeader className="text-center pb-2">
                <div className="flex justify-center mb-3">
                  <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-red-400" />
                  </div>
                </div>
                <CardTitle className="text-base text-white">Disconnect Google?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-center">
                <p className="text-sm text-gray-400">
                  This will revoke access to Gmail and Google Calendar. Email sync will stop and
                  calendar events will no longer update.
                </p>
                <div className="space-y-2 text-left p-3 bg-gray-900/40 rounded-lg">
                  {[
                    'Email sync will be paused',
                    'Calendar events will stop updating',
                    'Existing data will be preserved',
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
                      <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1 border-gray-600 text-gray-300"
                    onClick={() => onStepChange(0)}
                    disabled={isDisconnecting}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-2"
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                  >
                    {isDisconnecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Disconnecting...
                      </>
                    ) : (
                      'Disconnect'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}

      {/* Step 2: Disconnected state */}
      {activeStep === 2 && (
        <motion.div
          key="disconnected"
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.3 }}
        >
          <Card className="bg-gray-800/60 border-gray-700/50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-700/50 flex items-center justify-center opacity-50">
                  <GoogleLogo />
                </div>
                <div>
                  <CardTitle className="text-sm text-gray-400">Google Workspace</CardTitle>
                  <Badge variant="outline" className="border-gray-600 text-gray-500 text-xs mt-1">
                    Not Connected
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {serviceToggles.map((service) => (
                <div
                  key={service.label}
                  className="flex items-center justify-between py-2 border-b border-gray-700/30 last:border-0 opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <XCircle className="w-4 h-4 text-gray-600" />
                    <div>
                      <p className="text-sm text-gray-500">{service.label}</p>
                      <p className="text-xs text-gray-600">{service.desc}</p>
                    </div>
                  </div>
                  <ToggleLeft className="w-6 h-6 text-gray-600" />
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
