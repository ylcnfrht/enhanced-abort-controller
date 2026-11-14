/**
 * `AbortController` with .NET `CancellationTokenSource` powers. The signal stays a real `AbortSignal`.
 *
 * @example
 * ```ts
 * import { EnhancedAbortController, TimeSpan, isAbortError } from '@ylcnfrht/enhanced-abort-controller';
 *
 * using controller = new EnhancedAbortController().abortAfter(TimeSpan.fromSeconds(5));
 * try {
 *   const response = await fetch(url, { signal: controller.signal });
 * } catch (error) {
 *   if (!isAbortError(error)) throw error;
 * }
 * ```
 *
 * @packageDocumentation
 */
export { EnhancedAbortController, type Delay, type EnhancedSignal } from './EnhancedAbortController.ts';
export { EnhancedAbortSignal } from './EnhancedAbortSignal.ts';
export { AbortError, isAbortError, isTimeoutError } from './AbortError.ts';
export { AbortRegistration } from './AbortRegistration.ts';
export { register, whenAborted } from './register.ts';
export { TimeSpan } from './TimeSpan.ts';
