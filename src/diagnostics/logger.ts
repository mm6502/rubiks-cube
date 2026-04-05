// Comprehensive logging system with conditional logging and performance tracking.
import { canColorizeOutput } from '@/global';

// @eslint-disable no-console

// ============================================================================
// LOG CONFIGURATION
// ============================================================================

/** Log levels */
export enum LogLevel {
    NONE = 0, // No logging output
    ERROR = 1, // Only errors
    WARN = 2, // Warnings and errors
    INFO = 3, // Info, warnings, and errors
    DEBUG = 4, // All debug information
    TRACE = 5, // Verbose trace information
}

/** Global log configuration */
export interface LogConfig {
    level: LogLevel;
    logTimestamps: boolean;
    colorizeConsole: boolean;
}

/**
 * Global logging configuration.
 * Can be modified at runtime to enable/disable logging.
 */
export const LOG_CONFIG: LogConfig = {
    level: LogLevel.INFO,
    logTimestamps: true,
    colorizeConsole: true,
};

/** Performance metrics for logging */
export interface PerformanceMetrics {
    moveExecutionTime: number; // milliseconds
    stateUpdateTime: number; // milliseconds
    viewUpdateTime: number; // milliseconds
    memoryUsage: number; // bytes
    timestamp: number; // when measurement was taken
}

/** Log entry for external listeners */
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    levelName: string;
    message: string;
    args: any[];
    context?: Record<string, any>;
    scope?: string;
}

/** Listener callback type */
export type LogListener = (entry: LogEntry) => void;

/** Console colors for debugging */
const ConsoleColors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
} as const;

/**
 * Logger class - Comprehensive logging utility.
 */
export class Logger {
    private _listeners: LogListener[] = [];
    private _scope: string = '';
    // When true, the scope will be included in LogEntry.scope for listeners
    // but will NOT be printed as part of the console prefix. This is used
    // for scoped groups to avoid repeating the scope label on every log
    // when the console group already displays it.
    private _suppressScopeInPrefix: boolean = false;

    /** Add a listener for log events */
    addListener(callback: LogListener): void {
        this._listeners.push(callback);
    }

    /** Remove a listener */
    removeListener(callback: LogListener): void {
        const index = this._listeners.indexOf(callback);
        if (index > -1) {
            this._listeners.splice(index, 1);
        }
    }

    /** Remove all listeners */
    clearListeners(): void {
        this._listeners = [];
    }

    /** Notify all listeners of a log event */
    private notifyListeners(
        level: LogLevel,
        message: string,
        args: any[],
        context?: Record<string, any>
    ): void {
        if (this._listeners.length === 0) return;

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            levelName: LogLevel[level],
            message,
            args,
            context,
            scope: this._scope || undefined,
        };

        this._listeners.forEach(listener => {
            try {
                listener(entry);
            } catch (error) {
                // Prevent listener errors from breaking logging
                console.error('Error in log listener:', error);
            }
        });
    }

    /** Create a scoped logger */
    createScope(scope: string): Logger {
        const scopedLogger = new Logger();
        scopedLogger._scope = this._scope ? `${this._scope}:${scope}` : scope;
        scopedLogger._listeners = this._listeners; // Share listeners
        return scopedLogger;
    }

    /** Set debug level */
    setLogLevel(level?: LogLevel): void {
        LOG_CONFIG.level = level ?? LogLevel.INFO;
    }

    /** Check if a specific debug level should be logged */
    shouldLog(level?: LogLevel): boolean {
        if (!level) return false;

        return LOG_CONFIG.level !== LogLevel.NONE && LOG_CONFIG.level >= level;
    }

    /** Configure debug options */
    configure(config: Partial<LogConfig>): void {
        Object.assign(LOG_CONFIG, config);
    }

    /** Get timestamp prefix for logs */
    private getTimestamp(): string {
        if (!LOG_CONFIG.logTimestamps) return '';
        return `[${new Date().toISOString()}] `;
    }

    /** Get formatted prefix for log level */
    private getPrefix(level: LogLevel, label: string): string {
        let coloredLabel = label;

        if (LOG_CONFIG.colorizeConsole && canColorizeOutput()) {
            const colorMap: Record<LogLevel, string> = {
                [LogLevel.NONE]: ConsoleColors.white,
                [LogLevel.ERROR]: ConsoleColors.red,
                [LogLevel.WARN]: ConsoleColors.yellow,
                [LogLevel.INFO]: ConsoleColors.green,
                [LogLevel.DEBUG]: ConsoleColors.blue,
                [LogLevel.TRACE]: ConsoleColors.cyan,
            };

            const color = colorMap[level] || ConsoleColors.white;
            coloredLabel = `${color}${label}${ConsoleColors.reset}`;
        }

        // If suppression is enabled we still keep the scope available in
        // LogEntry.scope for listeners, but we don't repeat it in the
        // console prefix (useful for scoped groups where the group label
        // already shows the scope).
        if (!this._scope || this._suppressScopeInPrefix) return coloredLabel;

        return `${this._scope}: ${coloredLabel}`;
    }

    /** Log message */
    log(...args: any[]): void {
        this.notifyListeners(LOG_CONFIG.level, args[0] || '', args);
        if (!this.shouldLog(LOG_CONFIG.level)) return;
        console.log(this.getTimestamp().trimEnd(), ...args);
    }

    /** Log error message */
    error(...args: any[]): void {
        this.notifyListeners(LogLevel.ERROR, args[0] || 'Error', args);
        if (!this.shouldLog(LogLevel.ERROR)) return;
        console.error(this.getTimestamp() + this.getPrefix(LogLevel.ERROR, 'ERROR'), ...args);
    }

    /** Log error message with stack trace */
    errorWithTrace(...args: any[]): void {
        this.notifyListeners(LogLevel.ERROR, args[0] || 'Error', args);
        if (!this.shouldLog(LogLevel.ERROR)) return;
        console.error(this.getTimestamp() + this.getPrefix(LogLevel.ERROR, 'ERROR'), ...args);
        console.trace();
    }

    /** Log warning message */
    warn(...args: any[]): void {
        this.notifyListeners(LogLevel.WARN, args[0] || 'Warning', args);
        if (!this.shouldLog(LogLevel.WARN)) return;
        console.warn(this.getTimestamp() + this.getPrefix(LogLevel.WARN, 'WARN'), ...args);
    }

    /** Log info message */
    info(...args: any[]): void {
        this.notifyListeners(LogLevel.INFO, args[0] || 'Info', args);
        if (!this.shouldLog(LogLevel.INFO)) return;
        console.info(this.getTimestamp() + this.getPrefix(LogLevel.INFO, 'INFO'), ...args);
    }

    /** Log debug message */
    debug(...args: any[]): void {
        this.notifyListeners(LogLevel.DEBUG, args[0] || 'Debug', args);
        if (!this.shouldLog(LogLevel.DEBUG)) return;
        console.log(this.getTimestamp() + this.getPrefix(LogLevel.DEBUG, 'DEBUG'), ...args);
    }

    /** Log trace message */
    trace(...args: any[]): void {
        this.notifyListeners(LogLevel.TRACE, args[0] || 'Trace', args);
        if (!this.shouldLog(LogLevel.TRACE)) return;
        console.log(this.getTimestamp() + this.getPrefix(LogLevel.TRACE, 'TRACE'), ...args);
    }

    /** Log with structured context */
    logWithContext(level: LogLevel, message: string, context: Record<string, any>): void {
        this.notifyListeners(level, message, [context], context);
        if (!this.shouldLog(level)) return;

        const { fn, label } = this.levelMap[level];
        fn(this.getTimestamp() + this.getPrefix(level, label), message, context);
    }

    levelMap: Record<LogLevel, { fn: (...data: any[]) => void; label: string }> = {
        [LogLevel.NONE]: { fn: console.log, label: 'NONE' },
        [LogLevel.ERROR]: { fn: console.error, label: 'ERROR' },
        [LogLevel.WARN]: { fn: console.warn, label: 'WARN' },
        [LogLevel.INFO]: { fn: console.info, label: 'INFO' },
        [LogLevel.DEBUG]: { fn: console.log, label: 'DEBUG' },
        [LogLevel.TRACE]: { fn: console.log, label: 'TRACE' },
    };

    /**
     * Start console group.
     * @param label - Group label.
     * @param level - Optional log level for the group. If specified, group will only be created if given level is enabled.
     * @return True if group was created, false otherwise.
     */
    group(label?: string, loglevel?: LogLevel): boolean {
        return !!this.groupScoped(label, loglevel);
    }

    /**
     * Start a console group and return a scoped Logger for the group.
     * - If a log level is provided and that level is not enabled, returns null.
     * - If label is provided, the returned Logger will be a new scoped logger (parent:label).
     * - If label is omitted, returns `this` (no new scope) to allow groupEnd on current logger.
     */
    groupScoped(label?: string, loglevel?: LogLevel): Logger | null {
        if (loglevel && !this.shouldLog(loglevel)) return null;

        let prefix = this.getTimestamp();
        if (loglevel) {
            prefix += this.getPrefix(loglevel, this.levelMap[loglevel].label);
            if (label) prefix += ' ';
        }
        if (label) prefix += label;
        console.group(prefix);
        console.trace();

        if (label) {
            const scoped = this.createScope(label);
            // When creating a scoped logger specifically for a console group,
            // avoid repeating the scope in each log's console prefix since the
            // group header already contains the scope label.
            scoped._suppressScopeInPrefix = true;
            return scoped;
        }

        return this;
    }

    /** End console group */
    groupEnd(): void {
        console.groupEnd();
    }

    /** Assert condition and log error if false */
    assert(condition: boolean, message: string): void {
        if (!condition) {
            this.error(`Assertion failed: ${message}`);
            console.trace();
        }
    }
}

/**
 * Log utility functions.
 */
export const logger = new Logger();

/**
 * Export scoped logger creator.
 * @param scope - The scope name for the logger.
 * @returns A LogLogger instance scoped to the given name.
 */
export function createLogger(scope: string): Logger {
    return logger.createScope(scope);
}

// Store handler references so they can be removed if needed (e.g., in tests)
let errorHandler: ((event: ErrorEvent) => void) | null = null;
let rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

/**
 * Initializes global error handlers for uncaught errors and unhandled promise rejections.
 * Can be called multiple times; previous handlers will be removed before installing new ones.
 */
export function initializeErrorHandlers(): void {
    // Remove existing handlers if they exist
    if (errorHandler) {
        window.removeEventListener('error', errorHandler);
    }
    if (rejectionHandler) {
        window.removeEventListener('unhandledrejection', rejectionHandler);
    }

    // Create and install new handlers
    errorHandler = event => {
        // Prevent the browser's default reporting and stop other listeners from
        // also logging the error which can lead to duplicate messages.
        if (event.cancelable) {
            event.preventDefault();
            if (typeof (event as any).stopImmediatePropagation === 'function') {
                (event as any).stopImmediatePropagation();
            }
        }
        logger.error('Uncaught error:', event.error);
    };

    rejectionHandler = event => {
        // Prevent the default console message for unhandled rejections and stop
        // propagation so other listeners don't duplicate logs.
        if (event.cancelable) {
            event.preventDefault();
            if (typeof (event as any).stopImmediatePropagation === 'function') {
                (event as any).stopImmediatePropagation();
            }
        }
        logger.error('Unhandled promise rejection:', (event as any).reason);
    };

    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', rejectionHandler);
}

// Initialize debug startup behavior and expose helpers on window.
// Wrapped in try/catch to be safe in non-browser environments (tests, SSR).
(function initLogSetup() {
    const storageKey = 'loglevel';

    try {
        (window as any).LogLevel = LogLevel;
        (window as any).Logger = logger;

        // Example: Integrate with error tracking in production.
        const isProd = typeof import.meta !== 'undefined' ? import.meta.env.PROD : false;

        if (isProd) {
            // Add listener for production error tracking
            logger.addListener((entry: LogEntry) => {
                if (entry.level === LogLevel.ERROR) {
                    // Send to error tracking service (e.g., Sentry, LogRocket)
                    // Example: Sentry.captureException(entry.args[0], { contexts: { log: entry } });
                }
            });
        }

        const isProdFlag = isProd;
        const urlParams =
            typeof location !== 'undefined'
                ? new URLSearchParams(location.search)
                : new URLSearchParams('');
        const param = (urlParams.get('debug') || urlParams.get('dbg') || '').toLowerCase();
        const paramTrue = ['1', 'true', 'yes', 'on'].includes(param);
        const paramFalse = ['0', 'false', 'no', 'off'].includes(param);
        // Only access localStorage in browser environment (not in Node test environment).
        const localSetting =
            typeof window !== 'undefined' && typeof localStorage !== 'undefined'
                ? localStorage.getItem(storageKey)
                : null; // '1' | '0' | null

        let enabled = false;
        if (!isProdFlag) {
            // Dev builds: enabled by default unless explicitly disabled.
            if (paramFalse) enabled = false;
            else if (paramTrue) enabled = true;
            else if (localSetting === '1') enabled = true;
            else if (localSetting === '0') enabled = false;
            else enabled = true;
        } else {
            // Prod builds: disabled by default, but allow explicit enable via URL param or localStorage.
            if (paramTrue || localSetting === '1') {
                console.warn(
                    'Logging was explicitly requested in production; enabling for this session. Be cautious!'
                );
                enabled = true;
            } else {
                enabled = false;
            }
        }

        if (enabled) {
            logger.setLogLevel(LogLevel.DEBUG);
            // Only set localStorage in browser environment (not in Node test environment).
            if (typeof window !== 'undefined' && typeof localStorage !== 'undefined')
                localStorage.setItem(storageKey, '1');
        } else {
            logger.setLogLevel(LogLevel.ERROR);
        }

        (window as any).setLogLevel = (level = LogLevel.INFO) => {
            if (import.meta.env && import.meta.env.PROD) {
                if (level === LogLevel.DEBUG || level === LogLevel.TRACE) {
                    console.warn('Enabling debugging in production build.');
                }
            }
            logger.setLogLevel(level);
            logger.log('Current log level:', LogLevel[level]);
            if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
                localStorage.setItem(storageKey, '1');
            }
        };

        // Expose listener management for debugging integrations.
        (window as any).addLogListener = logger.addListener.bind(logger);
        (window as any).removeLogListener = logger.removeListener.bind(logger);

        // Initialize global error handlers.
        initializeErrorHandlers();
    } catch (e) {
        // Not running in browser environment; skip DOM-dependent initialization.
    }
})();
