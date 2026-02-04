/**
 * Custom Confirmation Dialog
 * A nice modal dialog for confirming actions instead of browser's native confirm()
 */

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'default' | 'destructive' | 'warning';
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'default',
  loading = false,
}: ConfirmDialogProps) {
  if (!open) return null;

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-[999]"
          />

          {/* Dialog */}
          <div className="fixed inset-0 flex items-center justify-center z-[1000] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-md w-full overflow-hidden"
            >
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/90 via-gray-50/70 to-gray-100/30 dark:from-gray-900/90 dark:via-gray-900/70 dark:to-gray-900/30 pointer-events-none" />

              {/* Content */}
              <div className="relative p-6">
                {/* Close button */}
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  disabled={loading}
                >
                  <X className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>

                {/* Icon */}
                <div className="flex items-center gap-4 mb-4">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      confirmVariant === 'destructive'
                        ? 'bg-red-500/20'
                        : confirmVariant === 'warning'
                        ? 'bg-amber-500/20'
                        : 'bg-violet-500/20'
                    }`}
                  >
                    <AlertTriangle
                      className={`w-6 h-6 ${
                        confirmVariant === 'destructive'
                          ? 'text-red-400'
                          : confirmVariant === 'warning'
                          ? 'text-amber-400'
                          : 'text-violet-400'
                      }`}
                    />
                  </div>

                  {/* Title */}
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
                </div>

                {/* Description */}
                <p className="text-gray-700 dark:text-gray-300 mb-6 leading-relaxed">{description}</p>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    onClick={onClose}
                    variant="outline"
                    className="flex-1 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    disabled={loading}
                  >
                    {cancelText}
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    className={`flex-1 ${
                      confirmVariant === 'destructive'
                        ? 'bg-red-600 hover:bg-red-700'
                        : confirmVariant === 'warning'
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-violet-600 hover:bg-violet-700'
                    } text-white`}
                    disabled={loading}
                  >
                    {loading ? 'Processing...' : confirmText}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
