import { Download, Monitor } from 'lucide-react';

const RELEASE_BASE =
  'https://github.com/SixtySecondsApp/sixty-support-app/releases/latest/download';

const WINDOWS_URL = `${RELEASE_BASE}/sixty-support-setup.exe`;
const MACOS_ARM64_URL = `${RELEASE_BASE}/sixty-support-arm64.dmg`;
const MACOS_X64_URL = `${RELEASE_BASE}/sixty-support-x64.dmg`;

function detectOS(): 'mac' | 'windows' | 'unknown' {
  const platform = navigator.platform ?? '';
  if (platform.includes('Mac')) return 'mac';
  if (platform.includes('Win')) return 'windows';
  return 'unknown';
}

interface SupportAppDownloadProps {
  isAdmin: boolean;
}

export function SupportAppDownload({ isAdmin }: SupportAppDownloadProps) {
  if (!isAdmin) return null;

  const os = detectOS();

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex items-start gap-3 shadow-sm hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600/40 hover:-translate-y-0.5 transition-all duration-200 group">
      <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 group-hover:bg-blue-100 dark:group-hover:bg-blue-500/20 transition-colors">
        <Monitor className="w-4 h-4 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">
          60 Support
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Desktop app for ticket management
        </p>
        <div className="flex gap-2 mt-2">
          {(os === 'windows' || os === 'unknown') && (
            <a
              href={WINDOWS_URL}
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Windows
            </a>
          )}
          {(os === 'mac' || os === 'unknown') && (
            <a
              href={MACOS_ARM64_URL}
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              macOS (Apple Silicon)
            </a>
          )}
          {(os === 'mac' || os === 'unknown') && (
            <a
              href={MACOS_X64_URL}
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              macOS (Intel)
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
