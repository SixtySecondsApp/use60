/**
 * AccessCodeInput Component
 * Reusable input component for access code entry with validation state
 * Used on the signup form to gate account creation
 */

import { useEffect } from 'react';
import { Check, X, Loader2, KeyRound } from 'lucide-react';

interface AccessCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  isValid: boolean | null;
  isValidating: boolean;
  error: string | null;
  onValidate: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}

export function AccessCodeInput({
  value,
  onChange,
  isValid,
  isValidating,
  error,
  onValidate,
  disabled,
  readOnly,
  className = ''
}: AccessCodeInputProps) {
  // Auto-validate after 500ms debounce when user types
  useEffect(() => {
    if (value.length >= 4 && !readOnly && isValid === null) {
      const timer = setTimeout(() => {
        onValidate();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [value, readOnly, onValidate, isValid]);

  // Get status icon based on state
  const getStatusIcon = () => {
    if (isValidating) {
      return <Loader2 className="w-5 h-5 animate-spin text-gray-400" />;
    }
    if (isValid === true) {
      return <Check className="w-5 h-5 text-[#37bd7e]" />;
    }
    if (isValid === false) {
      return <X className="w-5 h-5 text-red-500" />;
    }
    return <KeyRound className="w-5 h-5 text-gray-400" />;
  };

  // Get border/ring color based on validation state
  const getBorderClass = () => {
    if (isValid === true) return 'border-[#37bd7e] focus:ring-[#37bd7e]';
    if (isValid === false) return 'border-red-500 focus:ring-red-500';
    return 'border-gray-600 focus:ring-[#37bd7e]';
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="text-sm font-medium text-gray-400">
        Access Code <span className="text-red-400">*</span>
      </label>
      <div className="relative">
        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="Enter your access code"
          disabled={disabled || readOnly}
          className={`
            w-full bg-gray-700 border rounded-xl pl-10 pr-10 py-2.5
            text-white placeholder-gray-400
            uppercase tracking-wider font-mono text-sm
            transition-colors
            focus:ring-2 focus:border-transparent
            hover:bg-gray-600
            disabled:opacity-50 disabled:cursor-not-allowed
            ${getBorderClass()}
            ${readOnly ? 'bg-gray-800 cursor-not-allowed' : ''}
          `}
          onBlur={() => {
            // Validate on blur if not already validated
            if (value && isValid === null && !isValidating) {
              onValidate();
            }
          }}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {getStatusIcon()}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-400 flex items-center gap-1">
          <X className="w-3 h-3" />
          {error}
        </p>
      )}

      {/* Success message */}
      {isValid === true && !error && (
        <p className="text-sm text-[#37bd7e] flex items-center gap-1">
          <Check className="w-3 h-3" />
          {readOnly ? 'Code applied from link' : 'Valid access code'}
        </p>
      )}

      {/* Helper text when no code entered */}
      {!value && !error && (
        <p className="text-xs text-gray-500">
          Need a code? Join our waitlist at{' '}
          <a
            href="https://www.use60.com/waitlist"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            use60.com/waitlist
          </a>{' '}
          to request access.
        </p>
      )}
    </div>
  );
}

export default AccessCodeInput;
