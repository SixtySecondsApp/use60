import { Download, Monitor, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';

const REPO_URL = 'https://github.com/SixtySecondsApp/sixty-support-app';
const RELEASES_API = 'https://api.github.com/repos/SixtySecondsApp/sixty-support-app/releases/latest';

function detectOS(): 'mac' | 'windows' | 'unknown' {
  const platform = navigator.platform ?? '';
  if (platform.includes('Mac')) return 'mac';
  if (platform.includes('Win')) return 'windows';
  return 'unknown';
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface SupportAppDownloadProps {
  isAdmin: boolean;
}

export function SupportAppDownload({ isAdmin }: SupportAppDownloadProps) {
  const [windowsUrl, setWindowsUrl] = useState<string | null>(null);
  const [macUrl, setMacUrl] = useState<string | null>(null);
  const [hasRelease, setHasRelease] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    fetch(RELEASES_API)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.assets?.length) return;
        setHasRelease(true);
        const assets: ReleaseAsset[] = data.assets;
        const win = assets.find((a) => a.name.endsWith('.exe'));
        const mac = assets.find((a) => a.name.endsWith('.dmg'));
        if (win) setWindowsUrl(win.browser_download_url);
        if (mac) setMacUrl(mac.browser_download_url);
      })
      .catch(() => {});
  }, [isAdmin]);

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
          {hasRelease ? (
            <>
              {(os === 'windows' || os === 'unknown') && windowsUrl && (
                <a
                  href={windowsUrl}
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Windows
                </a>
              )}
              {(os === 'mac' || os === 'unknown') && macUrl && (
                <a
                  href={macUrl}
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  macOS
                </a>
              )}
            </>
          ) : (
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View on GitHub
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
