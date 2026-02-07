export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_STYLES: Record<LogLevel, string> = {
  debug: 'color: #888',
  info: 'color: #4a9eff',
  warn: 'color: #fbbf24',
  error: 'color: #ef4444; font-weight: bold',
};

class GameLogger {
  private entries: LogEntry[] = [];
  private minLevel: LogLevel = 'debug';

  setLevel(level: LogLevel) {
    this.minLevel = level;
  }

  log(level: LogLevel, category: string, message: string, data?: unknown) {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
      data,
    };
    this.entries.push(entry);

    const prefix = `%c[${level.toUpperCase()}] [${category}]`;
    const style = LEVEL_STYLES[level];

    if (data !== undefined) {
      console.log(prefix, style, message, data);
    } else {
      console.log(prefix, style, message);
    }
  }

  debug(category: string, message: string, data?: unknown) {
    this.log('debug', category, message, data);
  }

  info(category: string, message: string, data?: unknown) {
    this.log('info', category, message, data);
  }

  warn(category: string, message: string, data?: unknown) {
    this.log('warn', category, message, data);
  }

  error(category: string, message: string, data?: unknown) {
    this.log('error', category, message, data);
  }

  getEntries(category?: string): LogEntry[] {
    if (!category) return [...this.entries];
    return this.entries.filter((e) => e.category === category);
  }

  clear() {
    this.entries = [];
  }
}

export const logger = new GameLogger();
