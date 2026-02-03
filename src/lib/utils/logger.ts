/**
 * Conditional logging utility that only logs in development
 * Prevents memory leaks from console.log in production
 * Type-safe logging interface
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogArgs = readonly unknown[];
type TableData = Record<string, unknown> | readonly Record<string, unknown>[];

const isDevelopment = process.env.NODE_ENV === 'development';

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
  log: isDevelopment ? (...args: LogArgs) => console.log(...args) : noop,
  warn: isDevelopment ? (...args: LogArgs) => console.warn(...args) : noop,
  error: isDevelopment ? (...args: LogArgs) => console.error(...args) : noop,
  info: isDevelopment ? (...args: LogArgs) => console.info(...args) : noop,
  debug: isDevelopment ? (...args: LogArgs) => console.debug(...args) : noop,
  table: isDevelopment ? (data: TableData) => console.table(data) : noop,
  time: isDevelopment ? (label: string) => console.time(label) : noop,
  timeEnd: isDevelopment ? (label: string) => console.timeEnd(label) : noop,
  group: isDevelopment ? (label?: string) => console.group(label) : noop,
  groupEnd: isDevelopment ? () => console.groupEnd() : noop,
  clear: isDevelopment ? () => console.clear() : noop,
};

export default logger;