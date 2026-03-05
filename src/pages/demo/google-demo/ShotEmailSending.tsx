import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Wand2, CheckCircle2, Mail, Bold, Italic, Link2, ListOrdered, TrendingUp, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useGmailSend } from '@/lib/hooks/useGoogleIntegration';
import { contacts, draftEmailContent } from './mockData';
import type { ShotComponentProps } from './types';

const stepVariants = {
  enter: { opacity: 0, x: 30 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
};

function StreamingText({ text, speed = 15 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    let i = 0;
    setDisplayed('');
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
      {displayed}
      {displayed.length < text.length && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          className="text-blue-400"
        >
          |
        </motion.span>
      )}
    </div>
  );
}

const EMAIL_TO = 'andrew.bryce@sixtyseconds.video';
const EMAIL_SUBJECT = 'Re: Enterprise pricing discussion';

function SendOnMount() {
  const sendMutation = useGmailSend();
  const hasSent = useRef(false);

  useEffect(() => {
    if (hasSent.current) return;
    hasSent.current = true;

    sendMutation.mutateAsync({
      to: EMAIL_TO,
      subject: EMAIL_SUBJECT,
      body: draftEmailContent,
    }).catch(() => {
      // Error handled via mutation state
    });
  }, []);

  const isSuccess = sendMutation.isSuccess;
  const isError = sendMutation.isError;
  const isPending = sendMutation.isPending;

  return (
    <motion.div
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Success animation */}
      {isSuccess && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="flex flex-col items-center gap-3 py-8"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.1 }}
            className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center"
          >
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </motion.div>
          <p className="text-lg font-medium text-white">Email Sent</p>
          <p className="text-sm text-gray-400">Delivered via Gmail to {EMAIL_TO}</p>
        </motion.div>
      )}

      {/* Sending state */}
      {isPending && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
          <p className="text-lg font-medium text-white">Sending via Gmail...</p>
          <p className="text-sm text-gray-400">Delivering to {EMAIL_TO}</p>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <p className="text-lg font-medium text-white">Send Failed</p>
          <p className="text-sm text-red-300 max-w-xs text-center">
            {(sendMutation.error as Error)?.message || 'Could not send email. Check your Gmail connection.'}
          </p>
        </div>
      )}

      {/* Sent folder card */}
      {(isSuccess || isError) && (
        <Card className="bg-gray-800/60 border-gray-700/50">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-gray-500" />
              <CardTitle className="text-sm text-gray-400">Sent Folder</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 p-3 bg-gray-900/40 rounded-lg border border-gray-700/30">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs',
                isSuccess ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
              )}>
                AB
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">To: {contacts[0].name}</span>
                  <Badge className={cn(
                    'text-xs',
                    isSuccess
                      ? 'bg-green-500/20 text-green-400 border-green-500/30'
                      : 'bg-red-500/20 text-red-400 border-red-500/30'
                  )}>
                    {isSuccess ? 'Sent' : 'Failed'}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{EMAIL_SUBJECT}</p>
              </div>
              <span className="text-xs text-gray-600">Just now</span>
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}

export default function ShotEmailSending({ activeStep }: ShotComponentProps) {
  return (
    <AnimatePresence mode="wait">
      {activeStep === 0 && (
        <motion.div key="dealcard" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
          <Card className="bg-gray-800/60 border-gray-700/50 max-w-lg mx-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base text-white">Acme Corp Enterprise</CardTitle>
                  <p className="text-sm text-gray-400 mt-1">{contacts[0].name} &middot; {contacts[0].role}</p>
                </div>
                <Badge variant="outline" className="border-amber-500/40 text-amber-400">Negotiation</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-gray-900/40 rounded-lg">
                  <p className="text-lg font-semibold text-white">£45,000</p>
                  <p className="text-xs text-gray-500">Deal Value</p>
                </div>
                <div className="text-center p-3 bg-gray-900/40 rounded-lg">
                  <p className="text-lg font-semibold text-green-400">75%</p>
                  <p className="text-xs text-gray-500">Win Prob.</p>
                </div>
                <div className="text-center p-3 bg-gray-900/40 rounded-lg">
                  <p className="text-lg font-semibold text-blue-400">12</p>
                  <p className="text-xs text-gray-500">Days in Stage</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-amber-300">CFO reviewing annual commitment — follow-up needed</span>
              </div>
              <Button className="w-full bg-blue-600 hover:bg-blue-700 gap-2">
                <Send className="w-4 h-4" />
                Send Follow-up
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {activeStep === 1 && (
        <motion.div key="drafting" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
          <Card className="bg-gray-800/60 border-gray-700/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-blue-400 animate-pulse" />
                  <CardTitle className="text-sm text-blue-300">AI is drafting...</CardTitle>
                </div>
                <Badge variant="outline" className="border-gray-600 text-gray-400">via Gmail</Badge>
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                <span>To: {EMAIL_TO}</span>
                <span>&middot;</span>
                <span>{EMAIL_SUBJECT}</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="min-h-[200px] p-3 bg-gray-900/40 rounded-lg border border-gray-700/30">
                <StreamingText text={draftEmailContent} speed={12} />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {activeStep === 2 && (
        <motion.div key="fulldraft" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
          <Card className="bg-gray-800/60 border-gray-700/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-400" />
                  <CardTitle className="text-sm text-white">Follow-up Email</CardTitle>
                </div>
                <Badge variant="outline" className="border-green-500/40 text-green-400">AI Generated</Badge>
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                <span>To: {EMAIL_TO}</span>
                <span>&middot;</span>
                <span>{EMAIL_SUBJECT}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-1 p-1.5 bg-gray-900/40 rounded border border-gray-700/30">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-500"><Bold className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-500"><Italic className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-500"><Link2 className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-500"><ListOrdered className="w-3.5 h-3.5" /></Button>
              </div>
              <div className="p-3 bg-gray-900/40 rounded-lg border border-gray-700/30">
                <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{draftEmailContent}</div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2">
                  <Send className="w-4 h-4" />
                  Send via Gmail
                </Button>
                <Button variant="outline" className="border-gray-600 text-gray-300">Save Draft</Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {activeStep === 3 && (
        <SendOnMount key="sent" />
      )}
    </AnimatePresence>
  );
}
