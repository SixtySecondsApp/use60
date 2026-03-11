import React, { useState } from 'react';
import type { FormConfig } from '../../types';

interface FormBlockProps {
  config: FormConfig;
  accentColor?: string;
  textColor?: string;
  pageId?: string;
  className?: string;
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function FormBlock({ config, accentColor = '#6366f1', textColor = '#ffffff', pageId, className = '' }: FormBlockProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(config.fields.map((f) => [f.name, ''])),
  );
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  function validate(): string | null {
    for (const field of config.fields) {
      const val = (values[field.name] ?? '').trim();
      if (field.required && !val) {
        return `${field.label} is required`;
      }
      if (field.type === 'email' && val && !EMAIL_RE.test(val)) {
        return 'Please enter a valid email address';
      }
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setErrorMsg(err);
      setStatus('error');
      return;
    }

    setStatus('submitting');
    setErrorMsg('');

    // Preview mode — skip actual submission
    if (!pageId) {
      setStatus('success');
      setTimeout(() => {
        setStatus('idle');
        setValues(Object.fromEntries(config.fields.map((f) => [f.name, ''])));
      }, 3000);
      return;
    }

    try {
      // Detect submission endpoint
      const isPublished = typeof window !== 'undefined' && !window.location.origin.includes('localhost');
      const baseUrl = isPublished
        ? window.location.origin
        : 'https://caerqjzvuerejfrdtygb.supabase.co';

      const res = await fetch(`${baseUrl}/functions/v1/landing-form-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_id: pageId, fields: values }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Submission failed (${res.status})`);
      }

      setStatus('success');
      setTimeout(() => {
        setStatus('idle');
        setValues(Object.fromEntries(config.fields.map((f) => [f.name, ''])));
      }, 3000);
    } catch (submitErr: unknown) {
      setErrorMsg(submitErr instanceof Error ? submitErr.message : 'Something went wrong. Please try again.');
      setStatus('error');
    }
  }

  const borderStyle = `1px solid ${accentColor}33`;

  const inputClasses =
    'w-full bg-transparent rounded-lg px-4 py-3 text-sm outline-none placeholder:opacity-50 transition-colors focus:ring-1';

  return (
    <form onSubmit={handleSubmit} className={`w-full max-w-md mx-auto ${className}`}>
      <div className="flex flex-col gap-3 mb-4">
        {config.fields.map((field) => {
          const common = {
            name: field.name,
            required: field.required,
            placeholder: field.placeholder ?? '',
            value: values[field.name] ?? '',
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              setValues((prev) => ({ ...prev, [field.name]: e.target.value })),
            className: inputClasses,
            style: { border: borderStyle, color: textColor },
            disabled: status === 'submitting',
          };

          if (field.type === 'textarea') {
            return (
              <div key={field.name}>
                <label className="block text-xs font-medium mb-1 opacity-70" style={{ color: textColor }}>
                  {field.label}{field.required ? ' *' : ''}
                </label>
                <textarea rows={3} {...common} />
              </div>
            );
          }

          return (
            <div key={field.name}>
              <label className="block text-xs font-medium mb-1 opacity-70" style={{ color: textColor }}>
                {field.label}{field.required ? ' *' : ''}
              </label>
              <input type={field.type} {...common} />
            </div>
          );
        })}
      </div>

      {status === 'error' && errorMsg && (
        <p className="text-red-400 text-sm mb-3 text-center">{errorMsg}</p>
      )}

      {status === 'success' ? (
        <p className="text-center text-sm font-medium py-3 opacity-90" style={{ color: accentColor }}>
          {config.success_message}
        </p>
      ) : (
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="w-full rounded-lg px-6 py-3 text-white font-semibold text-sm transition-all duration-200 hover:brightness-110 disabled:opacity-60"
          style={{
            backgroundColor: accentColor,
          }}
        >
          {status === 'submitting' ? (
            <span className="inline-flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Submitting...
            </span>
          ) : (
            config.submit_label
          )}
        </button>
      )}
    </form>
  );
}
