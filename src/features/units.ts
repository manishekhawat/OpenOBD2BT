/**
 * Unit handling.
 *
 * Readings are decoded in the units the OBD-II standard defines (metric), and
 * converted only at the point of display, so stored data stays comparable
 * whatever the user's preference is.
 */

export type UnitSystem = 'metric' | 'imperial';

export interface Formatted {
  value: number;
  unit: string;
  text: string;
}

const CONVERSIONS: Record<string, { unit: string; convert: (v: number) => number }> = {
  'km/h': { unit: 'mph', convert: (v) => v * 0.621371 },
  '°C': { unit: '°F', convert: (v) => v * 1.8 + 32 },
  km: { unit: 'mi', convert: (v) => v * 0.621371 },
  kPa: { unit: 'psi', convert: (v) => v * 0.145038 },
  'g/s': { unit: 'lb/min', convert: (v) => v * 0.132277 },
  'L/h': { unit: 'gal/h', convert: (v) => v * 0.264172 },
  'N·m': { unit: 'lb·ft', convert: (v) => v * 0.737562 },
  L: { unit: 'gal', convert: (v) => v * 0.264172 },
};

/** Convert and format a value for display. */
export function format(
  value: number,
  unit: string,
  system: UnitSystem,
  precision = 1,
): Formatted {
  if (system === 'metric' || !CONVERSIONS[unit]) {
    return { value, unit, text: `${round(value, precision)}` };
  }
  const conversion = CONVERSIONS[unit];
  const converted = conversion.convert(value);
  return { value: converted, unit: conversion.unit, text: `${round(converted, precision)}` };
}

/** The unit label a value will be shown in, without converting anything. */
export function displayUnit(unit: string, system: UnitSystem): string {
  if (system === 'metric') return unit;
  return CONVERSIONS[unit]?.unit ?? unit;
}

export function round(value: number, precision: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(precision);
}

/**
 * Fuel economy is the one figure where the two systems are not a simple scale:
 * metric counts litres per distance, imperial counts distance per gallon, so
 * the relationship is reciprocal.
 */
export function formatEconomy(
  litresPer100Km: number | null,
  system: UnitSystem,
): { text: string; unit: string } {
  if (litresPer100Km === null || !Number.isFinite(litresPer100Km) || litresPer100Km <= 0) {
    return { text: '—', unit: system === 'metric' ? 'L/100km' : 'mpg' };
  }
  if (system === 'metric') {
    return { text: litresPer100Km.toFixed(1), unit: 'L/100km' };
  }
  // UK gallon, which is what "mpg" means in most of the world outside the US.
  const mpg = 282.481 / litresPer100Km;
  return { text: mpg.toFixed(1), unit: 'mpg' };
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}
