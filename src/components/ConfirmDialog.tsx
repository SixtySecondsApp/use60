/**
 * Custom Confirmation Dialog
 * A nice modal dialog for confirming actions instead of browser's native confirm()
 * Rendered in a portal so it breaks out of parent containers and covers full screen
 */

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPortal } from 'react-dom';

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

  // Render in a portal so it breaks out of parent containers and covers full screen
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop - Full screen, above everything including navbar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-[9999]"
          />

          {/* Dialog - Full screen, above everything including navbar */}
          <div className="fixed inset-0 flex items-center justify-center z-[10000] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl max-w-md w-full overflow-hidden"
            >
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-gray-900/90 via-gray-900/70 to-gray-900/30 pointer-events-none" />

              {/* Content */}
              <div className="relative p-6">
                {/* Close button */}
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-800 transition-colors"
                  disabled={loading}
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>

                {/* Icon */}
                <div className="flex items-center gap-4 mb-4">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      confirmVariant === 'destructive'
                        ? 'bg-red-500/20'
                        : confirmVariant === 'warning'
                        ? 'bg-amber-500/20'
                        : 'bg-blue-500/20'
                    }`}
                  >
                    <AlertTriangle
                      className={`w-6 h-6 ${
                        confirmVariant === 'destructive'
                          ? 'text-red-400'
                          : confirmVariant === 'warning'
                          ? 'text-amber-400'
                          : 'text-blue-400'
                      }`}
                    />
                  </div>

                  {/* Title */}
                  <h3 className="text-xl font-bold text-white">{title}</h3>
                </div>

                {/* Description */}
                <p className="text-gray-300 mb-6 leading-relaxed whitespace-pre-wrap">{description}</p>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    onClick={onClose}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white border-0"
                    disabled={loading}
                  >
                    {cancelText}
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium border-0"
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
    </AnimatePresence>,
    document.body
  );
}
