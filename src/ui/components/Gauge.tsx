/**
 * Arc gauge.
 *
 * A 240° sweep with the gap at the bottom — the instrument-cluster convention,
 * which is why it reads instantly to anyone who has looked at a dashboard. The
 * arc stays neutral until the reading leaves its safe band, so colour on a
 * gauge always means something is wrong.
 */

import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { READING_BOUNDS, readingColor, space, tabular, type, usePalette } from '../theme';
import { Label, Reading } from './primitives';

const START_ANGLE = 150;
const SWEEP = 240;

function polar(cx: number, cy: number, r: number, degrees: number): { x: number; y: number } {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(radians), y: cy + r * Math.sin(radians) };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const start = polar(cx, cy, r, from);
  const end = polar(cx, cy, r, to);
  const largeArc = to - from > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function Gauge({
  value,
  min,
  max,
  unit,
  name,
  pid,
  size = 148,
  precision = 0,
}: {
  value: number | null;
  min: number;
  max: number;
  unit: string;
  name: string;
  /** Used to look up the safe band, so the arc can turn amber or red. */
  pid?: number;
  size?: number;
  precision?: number;
}) {
  const palette = usePalette();
  const stroke = Math.max(8, size * 0.075);
  const radius = (size - stroke) / 2;
  const centre = size / 2;

  const bounds = pid !== undefined ? READING_BOUNDS[pid] : undefined;
  const tint = value === null ? palette.muted : readingColor(value, bounds, palette);

  const span = max - min;
  const fraction =
    value === null || span <= 0 ? 0 : Math.max(0, Math.min(1, (value - min) / span));
  const endAngle = START_ANGLE + SWEEP * fraction;

  return (
    <View style={{ alignItems: 'center', gap: space.small }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Path
            d={arcPath(centre, centre, radius, START_ANGLE, START_ANGLE + SWEEP)}
            stroke={palette.track}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
          />
          {fraction > 0.004 ? (
            <Path
              d={arcPath(centre, centre, radius, START_ANGLE, endAngle)}
              stroke={tint}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
            />
          ) : null}
          {/* A small cap marks the live end of the arc, like a needle tip. */}
          {value !== null && fraction > 0.004 ? (
            <Circle
              cx={polar(centre, centre, radius, endAngle).x}
              cy={polar(centre, centre, radius, endAngle).y}
              r={stroke * 0.28}
              fill={palette.ground}
            />
          ) : null}
        </Svg>

        <View style={{ alignItems: 'center' }}>
          <Reading
            value={value === null ? '—' : value.toFixed(precision)}
            size={size * 0.24}
            color={tint}
            align="center"
          />
          <Label style={[tabular, { marginTop: -2 }]}>{unit}</Label>
        </View>
      </View>

      <Label numberOfLines={1} style={{ fontSize: type.label, textAlign: 'center', maxWidth: size + 16 }}>
        {name}
      </Label>
    </View>
  );
}

/**
 * A horizontal bar for readings where the band matters more than the magnitude
 * — fuel level, load, throttle.
 */
export function BarReading({
  value,
  min,
  max,
  unit,
  name,
  pid,
  precision = 0,
}: {
  value: number | null;
  min: number;
  max: number;
  unit: string;
  name: string;
  pid?: number;
  precision?: number;
}) {
  const palette = usePalette();
  const bounds = pid !== undefined ? READING_BOUNDS[pid] : undefined;
  const tint = value === null ? palette.muted : readingColor(value, bounds, palette);
  const span = max - min;
  const fraction = value === null || span <= 0 ? 0 : Math.max(0, Math.min(1, (value - min) / span));

  return (
    <View style={{ gap: space.small }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Label numberOfLines={1} style={{ flex: 1 }}>{name}</Label>
        <Reading
          value={value === null ? '—' : value.toFixed(precision)}
          unit={unit}
          size={type.lead}
          color={tint}
        />
      </View>
      <View style={{ height: 6, backgroundColor: palette.track, borderRadius: 3, overflow: 'hidden' }}>
        <View
          style={{
            width: `${fraction * 100}%`,
            height: '100%',
            backgroundColor: tint,
            borderRadius: 3,
          }}
        />
      </View>
    </View>
  );
}
