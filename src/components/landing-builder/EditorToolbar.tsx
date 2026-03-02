/**
 * EditorToolbar — Top toolbar for the assembly preview panel
 *
 * Provides:
 * - Device width toggles (mobile 375px / tablet 768px / desktop 100%)
 * - Edit mode toggle (Preview vs Editor 3-panel layout)
 * - Copy Code / Download HTML export buttons
 * - Back to Chat navigation
 */

import React from 'react';
import {
  Smartphone,
  Tablet,
  Monitor,
  Code2,
  Download,
  ArrowLeft,
  Columns3,
  Eye,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Device = 'mobile' | 'tablet' | 'desktop';

export interface EditorToolbarProps {
  device: Device;
  onDeviceChange: (device: Device) => void;
  isEditorMode: boolean;
  onToggleEditorMode: () => void;
  onExport: () => void;
  onDownload: () => void;
  onBackToChat: () => void;
  isExporting?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEVICE_OPTIONS: { key: Device; icon: typeof Monitor; label: string }[] = [
  { key: 'mobile', icon: Smartphone, label: 'Mobile (375px)' },
  { key: 'tablet', icon: Tablet, label: 'Tablet (768px)' },
  { key: 'desktop', icon: Monitor, label: 'Desktop (100%)' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  device,
  onDeviceChange,
  isEditorMode,
  onToggleEditorMode,
  onExport,
  onDownload,
  onBackToChat,
  isExporting = false,
}) => {
  return (
    <div className="flex items-center justify-between h-10 px-3 bg-gray-50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/5">
      {/* Left group: back + device toggles */}
      <div className="flex items-center gap-2">
        {/* Back to Chat */}
        <button
          type="button"
          onClick={onBackToChat}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          title="Back to Chat"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Chat</span>
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-200 dark:bg-white/10" />

        {/* Device toggles */}
        <div className="flex items-center gap-0.5">
          {DEVICE_OPTIONS.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onDeviceChange(key)}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                device === key
                  ? 'bg-violet-500/10 text-violet-500'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
              )}
              title={label}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>

      {/* Right group: mode toggle + export actions */}
      <div className="flex items-center gap-1">
        {/* Edit mode toggle */}
        <button
          type="button"
          onClick={onToggleEditorMode}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors',
            isEditorMode
              ? 'bg-violet-500/10 text-violet-500'
              : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5',
          )}
          title={isEditorMode ? 'Switch to Preview' : 'Switch to Editor'}
        >
          {isEditorMode ? (
            <>
              <Columns3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Editor</span>
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Preview</span>
            </>
          )}
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-200 dark:bg-white/10" />

        {/* Copy Code */}
        <button
          type="button"
          onClick={onExport}
          disabled={isExporting}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors',
            isExporting
              ? 'text-gray-400 dark:text-slate-500 cursor-not-allowed'
              : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5',
          )}
          title="Copy Code"
        >
          {isExporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Code2 className="w-3.5 h-3.5" />
          )}
          <span className="hidden sm:inline">{isExporting ? 'Copying...' : 'Copy Code'}</span>
        </button>

        {/* Download HTML */}
        <button
          type="button"
          onClick={onDownload}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          title="Download HTML"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Download</span>
        </button>
      </div>
    </div>
  );
};

export default EditorToolbar;
