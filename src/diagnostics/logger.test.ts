import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    LOG_CONFIG,
    LogLevel,
    Logger,
    createLogger,
    initializeErrorHandlers,
    logger,
} from './logger';

// Mock console methods to prevent output pollution during tests
const originalConsole = { ...console };

beforeAll(() => {
    console.log = vi.fn();
    console.info = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
    console.debug = vi.fn();
    console.trace = vi.fn();
    console.group = vi.fn();
    console.groupEnd = vi.fn();
    console.groupCollapsed = vi.fn();
});

afterAll(() => {
    Object.assign(console, originalConsole);
});

describe('Logger', () => {
    describe('Edge cases and coverage', () => {
        it('should not throw if notifyListeners called with no listeners', () => {
            // Arrange
            testLogger.clearListeners();
            // Act & Assert
            expect(() => {
                // @ts-expect-error: private method
                testLogger.notifyListeners(LogLevel.INFO, 'msg', []);
            }).not.toThrow();
        });

        it('should suppress scope in prefix when _suppressScopeInPrefix is true', () => {
            // Arrange
            const scoped = testLogger.createScope('Suppressed');
            // @ts-expect-error: private
            scoped._suppressScopeInPrefix = true;
            // Temporarily disable color for deterministic output
            const prevColor = LOG_CONFIG.colorizeConsole;
            LOG_CONFIG.colorizeConsole = false;
            // Act
            // @ts-expect-error: private
            const prefix = scoped.getPrefix(LogLevel.INFO, 'INFO');
            // Assert
            expect(prefix).toBe('INFO');
            LOG_CONFIG.colorizeConsole = prevColor;
        });

        it('group returns true if no label', () => {
            // Act
            const result = testLogger.group();
            // Assert
            expect(result).toBe(true);
        });

        it('groupScoped returns this if no label', () => {
            // Act
            const result = testLogger.groupScoped();
            // Assert
            expect(result).toBeInstanceOf(Logger);
            expect(result).toBe(testLogger);
        });
    });
    let testLogger: Logger;

    beforeEach(() => {
        testLogger = new Logger();
        testLogger.setLogLevel(LogLevel.DEBUG);
        testLogger.clearListeners();
    });

    describe('Basic logging methods', () => {
        beforeEach(() => {
            testLogger.setLogLevel(LogLevel.TRACE); // Enable all logging
        });

        it('should log messages at different levels', () => {
            // Arrange
            const spyLog = vi.spyOn(console, 'log');
            const spyInfo = vi.spyOn(console, 'info');
            const spyWarn = vi.spyOn(console, 'warn');
            const spyError = vi.spyOn(console, 'error');

            // Act
            testLogger.log('test log');
            testLogger.info('test info');
            testLogger.warn('test warn');
            testLogger.error('test error');
            testLogger.debug('test debug');
            testLogger.trace('test trace');

            // Assert
            expect(spyLog).toHaveBeenCalledTimes(3); // log, debug, trace
            expect(spyInfo).toHaveBeenCalledTimes(1);
            expect(spyWarn).toHaveBeenCalledTimes(1);
            expect(spyError).toHaveBeenCalledTimes(1);

            spyLog.mockRestore();
            spyInfo.mockRestore();
            spyWarn.mockRestore();
            spyError.mockRestore();
        });

        it('should not log when level is disabled', () => {
            // Arrange
            testLogger.setLogLevel(LogLevel.ERROR);
            const spyInfo = vi.spyOn(console, 'info');

            // Act
            testLogger.info('should not log');

            // Assert
            expect(spyInfo).not.toHaveBeenCalled();

            spyInfo.mockRestore();
        });

        it('should log error with trace', () => {
            // Arrange
            const spyError = vi.spyOn(console, 'error');
            const spyTrace = vi.spyOn(console, 'trace');

            // Act
            testLogger.errorWithTrace('test error');

            // Assert
            expect(spyError).toHaveBeenCalled();
            expect(spyTrace).toHaveBeenCalled();

            spyError.mockRestore();
            spyTrace.mockRestore();
        });
    });

    describe('Listener management', () => {
        it('should add and notify listeners', () => {
            // Arrange
            const entries: any[] = [];
            const listener = (entry: any) => entries.push(entry);

            testLogger.addListener(listener);
            testLogger.setLogLevel(LogLevel.INFO);

            // Act
            testLogger.info('test message');

            // Assert
            expect(entries).toHaveLength(1);
            expect(entries[0].message).toBe('test message');
            expect(entries[0].level).toBe(LogLevel.INFO);
        });

        it('should remove listeners', () => {
            // Arrange
            const entries: any[] = [];
            const listener = (entry: any) => entries.push(entry);

            testLogger.addListener(listener);
            testLogger.removeListener(listener);
            testLogger.setLogLevel(LogLevel.INFO);

            // Act
            testLogger.info('test message');

            // Assert
            expect(entries).toHaveLength(0);
        });

        it('should clear all listeners', () => {
            // Arrange
            const entries: any[] = [];
            const listener1 = (entry: any) => entries.push(entry);
            const listener2 = (entry: any) => entries.push(entry);

            testLogger.addListener(listener1);
            testLogger.addListener(listener2);
            testLogger.clearListeners();
            testLogger.setLogLevel(LogLevel.INFO);

            // Act
            testLogger.info('test message');

            // Assert
            expect(entries).toHaveLength(0);
        });

        it('should handle listener errors gracefully', () => {
            // Arrange
            const spyError = vi.spyOn(console, 'error');
            const errorListener = () => {
                throw new Error('Listener error');
            };
            const goodListener = vi.fn();

            testLogger.addListener(errorListener);
            testLogger.addListener(goodListener);

            // Act & Assert
            // Should not throw despite error listener
            expect(() => {
                testLogger.setLogLevel(LogLevel.INFO);
                testLogger.info('test');
            }).not.toThrow();

            expect(goodListener).toHaveBeenCalled();
            // Should log the listener error
            expect(spyError).toHaveBeenCalledWith('Error in log listener:', expect.any(Error));

            spyError.mockRestore();
        });
    });

    describe('Scoping', () => {
        it('should create scoped loggers', () => {
            // Arrange
            const scoped = testLogger.createScope('TestScope');
            expect(scoped).toBeInstanceOf(Logger);

            const entries: any[] = [];
            testLogger.addListener(entry => entries.push(entry));

            scoped.setLogLevel(LogLevel.INFO);

            // Act
            scoped.info('scoped message');

            // Assert
            expect(entries[0].scope).toBe('TestScope');
        });

        it('should create nested scopes', () => {
            // Arrange
            const scoped1 = testLogger.createScope('Parent');
            const scoped2 = scoped1.createScope('Child');

            const entries: any[] = [];
            testLogger.addListener(entry => entries.push(entry));

            scoped2.setLogLevel(LogLevel.INFO);

            // Act
            scoped2.info('nested message');

            // Assert
            expect(entries[0].scope).toBe('Parent:Child');
        });
    });

    describe('Configuration', () => {
        it('should configure logging options', () => {
            // Act
            testLogger.configure({
                logTimestamps: false,
                colorizeConsole: false,
            });

            // Assert
            expect(LOG_CONFIG.logTimestamps).toBe(false);
            expect(LOG_CONFIG.colorizeConsole).toBe(false);
        });

        it('should check if logging is enabled for levels', () => {
            // Arrange
            testLogger.setLogLevel(LogLevel.WARN);

            // Act & Assert
            expect(testLogger.shouldLog(LogLevel.ERROR)).toBe(true);
            expect(testLogger.shouldLog(LogLevel.WARN)).toBe(true);
            expect(testLogger.shouldLog(LogLevel.INFO)).toBe(false);
        });
    });

    describe('Specialized logging', () => {
        beforeEach(() => {
            testLogger.setLogLevel(LogLevel.INFO);
        });

        it('should log with context', () => {
            // Arrange
            const spyInfo = vi.spyOn(console, 'info');
            const context = { userId: 123, action: 'login' };

            // Act
            testLogger.logWithContext(LogLevel.INFO, 'User action', context);

            // Assert
            expect(spyInfo).toHaveBeenCalled();
            spyInfo.mockRestore();
        });

        it('should skip output for logWithContext when level is disabled', () => {
            // Arrange
            testLogger.setLogLevel(LogLevel.ERROR);
            const spyInfo = vi.spyOn(console, 'info');

            // Act
            testLogger.logWithContext(LogLevel.INFO, 'disabled context log', { x: 1 });

            // Assert
            expect(spyInfo).not.toHaveBeenCalled();
            spyInfo.mockRestore();
        });
    });

    describe('Grouping', () => {
        it('should create groups', () => {
            // Arrange
            const spyGroup = vi.spyOn(console, 'group');

            // Act
            const result = testLogger.group('Test Group');

            // Assert
            expect(result).toBe(true);
            expect(spyGroup).toHaveBeenCalled();

            spyGroup.mockRestore();
        });

        it('should end groups', () => {
            // Arrange
            const spyGroupEnd = vi.spyOn(console, 'groupEnd');

            // Act
            testLogger.groupEnd();

            // Assert
            expect(spyGroupEnd).toHaveBeenCalled();

            spyGroupEnd.mockRestore();
        });

        it('should return false for group when level disabled', () => {
            // Arrange
            testLogger.setLogLevel(LogLevel.ERROR);

            // Act
            const result = testLogger.group('Test Group', LogLevel.DEBUG);

            // Assert
            expect(result).toBe(false);
        });
    });

    describe('Assertions', () => {
        it('should not log when assertion passes', () => {
            // Arrange
            const spyError = vi.spyOn(console, 'error');

            // Act
            testLogger.assert(true, 'should not log');

            // Assert
            expect(spyError).not.toHaveBeenCalled();

            spyError.mockRestore();
        });

        it('should log error when assertion fails', () => {
            // Arrange
            const spyError = vi.spyOn(console, 'error');
            const spyTrace = vi.spyOn(console, 'trace');

            // Act
            testLogger.assert(false, 'test assertion failure');

            // Assert
            expect(spyError).toHaveBeenCalledWith(
                'ERROR',
                expect.stringContaining('Assertion failed: test assertion failure')
            );
            expect(spyTrace).toHaveBeenCalled();

            spyError.mockRestore();
            spyTrace.mockRestore();
        });

        it('uses fallback messages when log methods are called without arguments', () => {
            // Arrange
            const entries: any[] = [];
            testLogger.addListener(entry => entries.push(entry));
            testLogger.setLogLevel(LogLevel.TRACE);

            // Act
            testLogger.log();
            testLogger.error();
            testLogger.warn();
            testLogger.info();
            testLogger.debug();
            testLogger.trace();

            // Assert
            expect(entries.length).toBeGreaterThanOrEqual(6);
            expect(entries.some(entry => entry.message === '')).toBe(true);
            expect(entries.some(entry => entry.message === 'Error')).toBe(true);
            expect(entries.some(entry => entry.message === 'Warning')).toBe(true);
            expect(entries.some(entry => entry.message === 'Info')).toBe(true);
            expect(entries.some(entry => entry.message === 'Debug')).toBe(true);
            expect(entries.some(entry => entry.message === 'Trace')).toBe(true);
        });
    });
});

describe('Logger.groupScoped', () => {
    beforeEach(() => {
        logger.setLogLevel(LogLevel.DEBUG);
        logger.clearListeners();
    });

    it('creates a group and returns a scoped logger when level enabled', () => {
        // Arrange
        const spyGroup = vi.spyOn(console, 'group').mockImplementation(() => {});
        const spyTrace = vi.spyOn(console, 'trace').mockImplementation(() => {});

        // Act
        const scoped = logger.groupScoped('TestScope', LogLevel.DEBUG);

        // Assert
        expect(scoped).not.toBeNull();
        expect(spyGroup).toHaveBeenCalled();

        spyGroup.mockRestore();
        spyTrace.mockRestore();
    });

    it('returns null when level is not enabled', () => {
        // Arrange
        logger.setLogLevel(LogLevel.ERROR);
        const spyGroup = vi.spyOn(console, 'group').mockImplementation(() => {});

        // Act
        const scoped = logger.groupScoped('ShouldNot', LogLevel.DEBUG);

        // Assert
        expect(scoped).toBeNull();
        expect(spyGroup).not.toHaveBeenCalled();

        spyGroup.mockRestore();
    });

    it('returned scoped logger shares listeners and sets scope', () => {
        // Arrange
        logger.setLogLevel(LogLevel.DEBUG);
        const entries: any[] = [];
        logger.addListener(entry => entries.push(entry));

        const scoped = logger.groupScoped('Parent', LogLevel.DEBUG);
        expect(scoped).not.toBeNull();

        // Act
        scoped!.info('hello');

        // Assert
        expect(entries.some(e => e.scope?.startsWith('Parent'))).toBe(true);
    });

    it('scoped group does not repeat the scope in console prefixes', () => {
        // Arrange
        logger.setLogLevel(LogLevel.DEBUG);
        const spyInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

        const scoped = logger.groupScoped('MyGroup', LogLevel.DEBUG);
        expect(scoped).not.toBeNull();

        // Act
        scoped!.info('message');

        // Assert
        // Ensure logger.debuginfo was called and the printed prefix does NOT
        // contain the group name followed by ':' since the group header
        // already showed the label.
        expect(spyInfo).toHaveBeenCalled();
        const firstArg = spyInfo.mock.calls[0][0] as string;
        expect(firstArg.includes('MyGroup:')).toBe(false);

        spyInfo.mockRestore();
    });
});

describe('createLogger', () => {
    it('should create a scoped logger', () => {
        // Arrange
        const scopedLogger = createLogger('TestScope');
        expect(scopedLogger).toBeInstanceOf(Logger);

        const entries: any[] = [];
        logger.addListener(entry => entries.push(entry));

        scopedLogger.setLogLevel(LogLevel.INFO);

        // Act
        scopedLogger.info('test message');

        // Assert
        expect(entries[0].scope).toBe('TestScope');
    });
});

describe('initializeErrorHandlers', () => {
    let addEventListenerSpy: any;
    let removeEventListenerSpy: any;

    beforeEach(() => {
        // Mock window if not available
        if (typeof window === 'undefined') {
            (globalThis as any).window = {
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            };
        }
        addEventListenerSpy = vi.spyOn(window, 'addEventListener');
        removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    });

    afterEach(() => {
        addEventListenerSpy.mockRestore();
        removeEventListenerSpy.mockRestore();
    });

    it('should initialize error handlers', () => {
        // Act
        initializeErrorHandlers();

        // Assert
        expect(addEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
        expect(addEventListenerSpy).toHaveBeenCalledWith(
            'unhandledrejection',
            expect.any(Function)
        );
    });

    it('should remove previous handlers when called multiple times', () => {
        // Act
        initializeErrorHandlers();
        initializeErrorHandlers();

        // Assert
        expect(removeEventListenerSpy).toHaveBeenCalledTimes(4); // 2 from first re-init + 2 from second re-init
        expect(addEventListenerSpy).toHaveBeenCalledTimes(4); // 2 initial + 2 re-initialized
    });

    it('error handler callback calls preventDefault and stopImmediatePropagation on cancelable events', () => {
        // Arrange
        initializeErrorHandlers();

        const installedHandler = addEventListenerSpy.mock.calls.find(
            (call: any[]) => call[0] === 'error'
        )![1] as (event: any) => void;

        const preventDefault = vi.fn();
        const stopImmediatePropagation = vi.fn();
        const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Act
        installedHandler({
            cancelable: true,
            preventDefault,
            stopImmediatePropagation,
            error: new Error('test'),
        });

        // Assert
        expect(preventDefault).toHaveBeenCalled();
        expect(stopImmediatePropagation).toHaveBeenCalled();

        spyError.mockRestore();
    });

    it('error handler callback skips preventDefault on non-cancelable events', () => {
        // Arrange
        initializeErrorHandlers();
        const installedHandler = addEventListenerSpy.mock.calls.find(
            (call: any[]) => call[0] === 'error'
        )![1] as (event: any) => void;

        const preventDefault = vi.fn();
        const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Act — cancelable: false
        installedHandler({ cancelable: false, preventDefault, error: new Error('x') });

        // Assert
        expect(preventDefault).not.toHaveBeenCalled();
        spyError.mockRestore();
    });

    it('rejection handler callback calls preventDefault and stopImmediatePropagation on cancelable events', () => {
        // Arrange
        initializeErrorHandlers();

        const installedHandler = addEventListenerSpy.mock.calls.find(
            (call: any[]) => call[0] === 'unhandledrejection'
        )![1] as (event: any) => void;

        const preventDefault = vi.fn();
        const stopImmediatePropagation = vi.fn();
        const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Act
        installedHandler({
            cancelable: true,
            preventDefault,
            stopImmediatePropagation,
            reason: 'rejected promise',
        });

        // Assert
        expect(preventDefault).toHaveBeenCalled();
        expect(stopImmediatePropagation).toHaveBeenCalled();

        spyError.mockRestore();
    });

    it('rejection handler callback skips preventDefault on non-cancelable events', () => {
        // Arrange
        initializeErrorHandlers();
        const installedHandler = addEventListenerSpy.mock.calls.find(
            (call: any[]) => call[0] === 'unhandledrejection'
        )![1] as (event: any) => void;

        const preventDefault = vi.fn();
        const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Act — cancelable: false
        installedHandler({ cancelable: false, preventDefault, reason: 'x' });

        // Assert
        expect(preventDefault).not.toHaveBeenCalled();
        spyError.mockRestore();
    });
});
