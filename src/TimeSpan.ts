const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function finite(value: number, unit: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`TimeSpan ${unit} must be a finite number, got ${String(value)}.`);
  }
  return value;
}

/**
 * An immutable time interval, stored in milliseconds. Modeled on .NET's `TimeSpan`.
 *
 * @example
 * ```ts
 * controller.abortAfter(TimeSpan.fromSeconds(30));
 * TimeSpan.fromMinutes(1).add(TimeSpan.fromSeconds(30)).totalSeconds; // 90
 * ```
 */
export class TimeSpan {
  /** A zero-length interval. */
  static readonly zero: TimeSpan = new TimeSpan(0);
  /** The largest interval (`Number.MAX_SAFE_INTEGER` ms, about 285,616 years). */
  static readonly maxValue: TimeSpan = new TimeSpan(Number.MAX_SAFE_INTEGER);
  /** The smallest interval (`-Number.MAX_SAFE_INTEGER` ms). */
  static readonly minValue: TimeSpan = new TimeSpan(-Number.MAX_SAFE_INTEGER);
  /** -1 ms, .NET's `Timeout.InfiniteTimeSpan`: `abortAfter(TimeSpan.infinite)` cancels a scheduled abort. */
  static readonly infinite: TimeSpan = new TimeSpan(-1);

  /** The interval in milliseconds. */
  readonly milliseconds: number;

  /** @throws RangeError if `milliseconds` is not a finite number. */
  constructor(milliseconds: number) {
    this.milliseconds = finite(milliseconds, 'milliseconds');
  }

  /** The interval in whole and fractional seconds. */
  get totalSeconds(): number {
    return this.milliseconds / MS_PER_SECOND;
  }

  /** The interval in whole and fractional minutes. */
  get totalMinutes(): number {
    return this.milliseconds / MS_PER_MINUTE;
  }

  /** The interval in whole and fractional hours. */
  get totalHours(): number {
    return this.milliseconds / MS_PER_HOUR;
  }

  /** The interval in whole and fractional days. */
  get totalDays(): number {
    return this.milliseconds / MS_PER_DAY;
  }

  /** A new interval: this one plus `other`. */
  add(other: TimeSpan): TimeSpan {
    return new TimeSpan(this.milliseconds + other.milliseconds);
  }

  /** A new interval: this one minus `other`. */
  subtract(other: TimeSpan): TimeSpan {
    return new TimeSpan(this.milliseconds - other.milliseconds);
  }

  /** True if both intervals have the same length. */
  equals(other: TimeSpan): boolean {
    return this.milliseconds === other.milliseconds;
  }

  /** Negative if this interval is shorter than `other`, 0 if equal, positive if longer. */
  compareTo(other: TimeSpan): number {
    return Math.sign(this.milliseconds - other.milliseconds);
  }

  /** The interval in milliseconds, so `+span` and comparisons work. */
  valueOf(): number {
    return this.milliseconds;
  }

  /** E.g. `"1500ms"`. */
  toString(): string {
    return `${this.milliseconds}ms`;
  }

  static fromMilliseconds(milliseconds: number): TimeSpan {
    return new TimeSpan(milliseconds);
  }

  static fromSeconds(seconds: number): TimeSpan {
    return new TimeSpan(finite(seconds, 'seconds') * MS_PER_SECOND);
  }

  static fromMinutes(minutes: number): TimeSpan {
    return new TimeSpan(finite(minutes, 'minutes') * MS_PER_MINUTE);
  }

  static fromHours(hours: number): TimeSpan {
    return new TimeSpan(finite(hours, 'hours') * MS_PER_HOUR);
  }

  static fromDays(days: number): TimeSpan {
    return new TimeSpan(finite(days, 'days') * MS_PER_DAY);
  }
}
