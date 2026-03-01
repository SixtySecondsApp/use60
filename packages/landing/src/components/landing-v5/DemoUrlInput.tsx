import { useState, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { springs } from '../../lib/animation-tokens';

const EXAMPLE_DOMAINS = ['stripe.com', 'notion.com', 'linear.app', 'figma.com'];

interface DemoUrlInputProps {
  onSubmit: (url: string) => void;
  placeholder?: string;
  buttonText?: string;
  showExamples?: boolean;
  className?: string;
}

export const DemoUrlInput = forwardRef<HTMLInputElement, DemoUrlInputProps>(
  function DemoUrlInput({ onSubmit, placeholder = 'yourcompany.com', buttonText = 'Show me', showExamples = true, className }, ref) {
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = url.trim();
      if (!trimmed) {
        setError('Enter a website to get started');
        return;
      }
      setError('');
      onSubmit(trimmed);
    };

    const handleExample = (domain: string) => {
      setUrl(domain);
      onSubmit(domain);
    };

    return (
      <div className={className}>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
            <div className="flex-1 relative">
              <input
                ref={ref}
                type="text"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(''); }}
                placeholder={placeholder}
                className={cn(
                  'w-full px-5 py-3.5 sm:py-4 rounded-xl text-base',
                  'bg-white/[0.05] border placeholder-zinc-500 text-white',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/70 focus-visible:border-transparent',
                  'transition-all duration-200',
                  error
                    ? 'border-red-500/50'
                    : 'border-white/10 hover:border-white/20 focus:shadow-[0_0_20px_rgba(139,92,246,0.15)]'
                )}
              />
              {error && (
                <p className="absolute -bottom-6 left-1 text-xs text-red-400">{error}</p>
              )}
            </div>

            <motion.button
              type="submit"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={springs.press}
              className="px-7 py-3.5 sm:py-4 rounded-xl font-semibold text-base
                bg-white text-zinc-950 hover:bg-zinc-100 transition-colors
                flex items-center justify-center gap-2 shrink-0
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950
                motion-reduce:transform-none"
            >
              {buttonText}
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>

          {showExamples && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-zinc-500">
              <span className="text-zinc-600">Try:</span>
              {EXAMPLE_DOMAINS.map((domain) => (
                <button
                  key={domain}
                  type="button"
                  onClick={() => handleExample(domain)}
                  className="px-2.5 py-1 rounded-lg border border-white/[0.06] bg-white/[0.02]
                    text-zinc-400 hover:text-white hover:border-white/15 hover:bg-white/[0.04]
                    transition-all duration-150
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  {domain}
                </button>
              ))}
            </div>
          )}
        </form>
      </div>
    );
  }
);
