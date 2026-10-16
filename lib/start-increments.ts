export const DEFAULT_START_INTERVAL_MIN = 30;
export const MIN_START_INTERVAL_MIN = 5;
export const MAX_START_INTERVAL_MIN = 1440;
export const START_INTERVAL_PRESETS: readonly number[] = [5, 10, 15, 20, 30, 45, 60];

export function validStartInterval(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_START_INTERVAL_MIN && value <= MAX_START_INTERVAL_MIN;
}
