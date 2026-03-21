const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = typeof LOG_LEVELS[number];

const isProduction = process.env.NODE_ENV === 'production';

function getLogLevel(): LogLevel {
  const envLevel = process.env.NEXT_PUBLIC_LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (envLevel && LOG_LEVELS.includes(envLevel)) {
    return envLevel;
  }
  return isProduction ? 'info' : 'debug';
}

const currentLevel = getLogLevel();
const levelIndex = LOG_LEVELS.indexOf(currentLevel);

function shouldLog(methodLevel: LogLevel): boolean {
  return LOG_LEVELS.indexOf(methodLevel) >= levelIndex;
}

function formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  if (isProduction && context) {
    return JSON.stringify({ level, message, ...context, timestamp: new Date().toISOString() });
  }
  const prefix = `[${level.toUpperCase()}]`;
  if (context) {
    return `${prefix} ${message} ${JSON.stringify(context)}`;
  }
  return `${prefix} ${message}`;
}

const noop = () => undefined;

function createLogger() {
  const logger = {
    debug: shouldLog('debug')
      ? (message: string, context?: Record<string, unknown>) => {
          console.debug(formatMessage('debug', message, context));
        }
      : noop,

    info: shouldLog('info')
      ? (message: string, context?: Record<string, unknown>) => {
          console.info(formatMessage('info', message, context));
        }
      : noop,

    warn: shouldLog('warn')
      ? (message: string, context?: Record<string, unknown>) => {
          console.warn(formatMessage('warn', message, context));
        }
      : noop,

    error: shouldLog('error')
      ? (message: string, context?: Record<string, unknown>) => {
          console.error(formatMessage('error', message, context));
        }
      : noop,
  };

  return logger;
}

const logger = createLogger();

export { logger };
