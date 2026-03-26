const LOG_LEVELS = ['silent', 'debug', 'info', 'warn', 'error'] as const;
type LogLevel = typeof LOG_LEVELS[number];

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

function getLogLevel(): LogLevel {
  const serverLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (serverLevel && LOG_LEVELS.includes(serverLevel)) {
    return serverLevel;
  }

  const publicLevel = process.env.NEXT_PUBLIC_LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (publicLevel && LOG_LEVELS.includes(publicLevel)) {
    return publicLevel;
  }

  if (isTest) return 'silent';
  return isProduction ? 'info' : 'debug';
}

const currentLevel = getLogLevel();
const levelIndex = LOG_LEVELS.indexOf(currentLevel);

function shouldLog(methodLevel: Exclude<LogLevel, 'silent'>): boolean {
  if (currentLevel === 'silent') return false;
  return LOG_LEVELS.indexOf(methodLevel) >= levelIndex;
}

function formatMessage(level: Exclude<LogLevel, 'silent'>, message: string, context?: Record<string, unknown>): string {
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
