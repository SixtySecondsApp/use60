/**
 * Conditional logging utility that only logs in development
 * Prevents memory leaks from console.log in production
 * Type-safe logging interface
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogArgs = readonly unknown[];
type TableData = Record<string, unknown> | readonly Record<string, unknown>[];

const isDevelopment = process.env.NODE_ENV === 'development';
// Only show error logs by default; set VITE_DEBUG_LOGS=true to see all logs
const enableDebugLogs = import.meta.env.VITE_DEBUG_LOGS === 'true';

interface Logger {
  log: (...args: LogArgs) => void;
  warn: (...args: LogArgs) => void;
  error: (...args: LogArgs) => void;
  info: (...args: LogArgs) => void;
  debug: (...args: LogArgs) => void;
  table: (data: TableData) => void;
  time: (label: string) => void;
  timeEnd: (label: string) => void;
  group: (label?: string) => void;
  groupEnd: () => void;
  clear: () => void;
}

const noop = () => {};

export const logger: Logger = {
  // Only show logs if debug is enabled
  log: isDevelopment && enableDebugLogs ? (...args: LogArgs) => console.log(...args) : noop,
  warn: isDevelopment && enableDebugLogs ? (...args: LogArgs) => console.warn(...args) : noop,
  // Always show errors in development
  error: isDevelopment ? (...args: LogArgs) => console.error(...args) : noop,
  info: isDevelopment && enableDebugLogs ? (...args: LogArgs) => console.info(...args) : noop,
  debug: isDevelopment && enableDebugLogs ? (...args: LogArgs) => console.debug(...args) : noop,
  table: isDevelopment && enableDebugLogs ? (data: TableData) => console.table(data) : noop,
  time: isDevelopment && enableDebugLogs ? (label: string) => console.time(label) : noop,
  timeEnd: isDevelopment && enableDebugLogs ? (label: string) => console.timeEnd(label) : noop,
  group: isDevelopment && enableDebugLogs ? (label?: string) => console.group(label) : noop,
  groupEnd: isDevelopment && enableDebugLogs ? () => console.groupEnd() : noop,
  clear: isDevelopment && enableDebugLogs ? () => console.clear() : noop,
};

export default logger;