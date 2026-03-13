import { Sun, Moon } from 'lucide-react';

interface ThemeToggleV8Props {
  isDark: boolean;
  onToggle: () => void;
}

export function ThemeToggleV8({ isDark, onToggle }: ThemeToggleV8Props) {
  return (
    <button
      onClick={onToggle}
      className="p-2 rounded-lg transition-colors text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
