import { useMemo } from 'react';
import { Download, Monitor, Apple } from 'lucide-react';

const RELEASE_BASE = 'https://github.com/SixtySecondsApp/sixty-support-app/releases/latest/download';
const WIN_URL = `${RELEASE_BASE}/sixty-support-setup.exe`;
const MAC_URL = `${RELEASE_BASE}/sixty-support.dmg`;

function detectOS(): 'windows' | 'mac' | 'unknown' {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'mac';
  return 'unknown';
}

interface SupportAppDownloadProps {
  isAdmin: boolean;
}

export function SupportAppDownload({ isAdmin }: SupportAppDownloadProps) {
  const os = useMemo(() => detectOS(), []);

  if (!isAdmin) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10">
          <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">60 Support Desktop</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Admin tool for managing support tickets</p>
        </div>
      </div>
      <div className="flex gap-2">
        {(os === 'windows' || os === 'unknown') && (
          <a
            href={WIN_URL}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <Monitor className="w-3.5 h-3.5" />
            Download for Windows
          </a>
        )}
        {(os === 'mac' || os === 'unknown') && (
          <a
            href={MAC_URL}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 text-white transition-colors"
          >
            <Apple className="w-3.5 h-3.5" />
            Download for macOS
          </a>
        )}
      </div>
    </div>
  );
}
