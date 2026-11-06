/**
 * Design tokens.
 *
 * The palette is taken from an instrument cluster at night: a deep blue-black
 * ground with amber as the accent, because amber is the colour of the
 * check-engine lamp and therefore the most meaningful colour in this domain.
 *
 * The rule that holds the whole interface together: colour encodes severity and
 * nothing else. Amber means attention, red means stop, green means a check has
 * passed. Nothing is tinted for decoration, so a flash of red anywhere in the
 * app always means the same thing.
 */

import { useColorScheme } from 'react-native';

import { useSettings } from '@/state/settings';
import type { ActionLevel, DriveAdvice } from '@/data/dtcCatalog';

export interface Palette {
  /** Page ground. */
  ground: string;
  /** Raised surface for grouped content. */
  panel: string;
  /** A surface one step above panel, for nested content. */
  panelHigh: string;
  /** Hairline rules and borders. */
  line: string;
  text: string;
  muted: string;
  /** Primary accent — the warning lamp. */
  amber: string;
  amberDim: string;
  red: string;
  redDim: string;
  green: string;
  greenDim: string;
  blue: string;
  /** Track behind a gauge arc. */
  track: string;
  isDark: boolean;
}

const DARK: Palette = {
  ground: '#0A0E14',
  panel: '#141A23',
  panelHigh: '#1C242F',
  line: '#243040',
  text: '#E8EDF4',
  muted: '#8296AE',
  amber: '#FFB020',
  amberDim: '#4A3613',
  red: '#FF4D3D',
  redDim: '#4A1A16',
  green: '#3DD68C',
  greenDim: '#13402C',
  blue: '#55A8FF',
  track: '#1F2936',
  isDark: true,
};

const LIGHT: Palette = {
  ground: '#F2F5F9',
  panel: '#FFFFFF',
  panelHigh: '#F7F9FC',
  line: '#DDE4ED',
  text: '#101822',
  muted: '#5A6B80',
  amber: '#B8720A',
  amberDim: '#FBEBD0',
  red: '#C62C1C',
  redDim: '#FBDFDB',
  green: '#1B7F52',
  greenDim: '#D7F0E3',
  blue: '#1668C4',
  track: '#E6EBF2',
  isDark: false,
};

/** Spacing scale. Multiples of 4, named by use rather than by number. */
export const space = {
  hair: 2,
  tight: 4,
  small: 8,
  base: 12,
  gap: 16,
  wide: 24,
  section: 32,
  page: 48,
} as const;

/**
 * Radii are differentiated on purpose: a gauge is a circle, a panel is softly
 * rounded, a chip is fully round. One radius everywhere flattens hierarchy.
 */
export const radius = {
  chip: 999,
  panel: 14,
  tile: 10,
  inset: 6,
} as const;

/**
 * Type scale at roughly 1.22, from The Elements of Typographic Style's
 * guidance. Readings get the top of the scale because they are the content.
 */
export const type = {
  micro: 12,
  label: 13,
  body: 15,
  lead: 17,
  title: 20,
  heading: 26,
  reading: 34,
  display: 48,
  hero: 64,
} as const;

/** Tabular figures, so changing digits do not shift the layout. */
export const tabular = { fontVariant: ['tabular-nums' as const] };

export function usePalette(): Palette {
  const systemScheme = useColorScheme();
  const choice = useSettings((s) => s.theme);
  const isDark = choice === 'system' ? systemScheme !== 'light' : choice === 'dark';
  return isDark ? DARK : LIGHT;
}

/** Severity → colour. The single source of truth for what a colour means. */
export function actionColor(action: ActionLevel, palette: Palette): string {
  switch (action) {
    case 'stop':
      return palette.red;
    case 'urgent':
      return palette.amber;
    case 'service-soon':
      return palette.amber;
    case 'monitor':
      return palette.blue;
    case 'info':
      return palette.muted;
  }
}

export function actionBackground(action: ActionLevel, palette: Palette): string {
  switch (action) {
    case 'stop':
      return palette.redDim;
    case 'urgent':
    case 'service-soon':
      return palette.amberDim;
    case 'monitor':
      return palette.isDark ? '#14304A' : '#DBEAFB';
    case 'info':
      return palette.panelHigh;
  }
}

export function driveColor(drive: DriveAdvice, palette: Palette): string {
  switch (drive) {
    case 'ok':
      return palette.green;
    case 'with-care':
      return palette.amber;
    case 'do-not-drive':
      return palette.red;
  }
}

/**
 * Colour for a live reading against its safe range. Used sparingly — most
 * readings stay neutral, and only turn amber or red when genuinely out of band.
 */
export function readingColor(
  value: number,
  bounds: { warn?: number; danger?: number; invert?: boolean } | undefined,
  palette: Palette,
): string {
  if (!bounds) return palette.text;
  const { warn, danger, invert } = bounds;
  const past = (limit: number) => (invert ? value <= limit : value >= limit);
  if (danger !== undefined && past(danger)) return palette.red;
  if (warn !== undefined && past(warn)) return palette.amber;
  return palette.text;
}

/** Safe ranges for the readings where an out-of-band value actually matters. */
export const READING_BOUNDS: Record<number, { warn?: number; danger?: number; invert?: boolean }> = {
  0x05: { warn: 105, danger: 115 },           // coolant temperature
  0x5c: { warn: 125, danger: 140 },           // oil temperature
  0x42: { warn: 12.8, danger: 12.0, invert: true }, // control module voltage
  0x2f: { warn: 15, danger: 8, invert: true },      // fuel level
  0x0c: { warn: 6000, danger: 7000 },         // engine speed
  0x04: { warn: 95, danger: 99 },             // calculated load
};
