/**
 * Line chart for live and recorded readings.
 *
 * Each series carries its own scale, because plotting revs and coolant
 * temperature on one axis would make both unreadable. The axis labels belong to
 * the highlighted series, and every other series is drawn thinner and dimmer so
 * one line is always clearly the subject.
 */

import { Fragment, useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { space, tabular, type, usePalette } from '../theme';
import { Label } from './primitives';

export interface Series {
  key: number | string;
  name: string;
  unit: string;
  color: string;
  points: { at: number; value: number }[];
  precision?: number;
}

const PADDING = { left: 44, right: 10, top: 12, bottom: 20 };

export function Chart({
  series,
  height = 200,
  width,
  highlightKey,
}: {
  series: Series[];
  height?: number;
  width: number;
  /** Which series the y-axis belongs to. Defaults to the first. */
  highlightKey?: number | string;
}) {
  const palette = usePalette();

  const plotWidth = Math.max(40, width - PADDING.left - PADDING.right);
  const plotHeight = Math.max(40, height - PADDING.top - PADDING.bottom);

  const prepared = useMemo(() => {
    const withPoints = series.filter((s) => s.points.length > 1);
    if (withPoints.length === 0) return null;

    // One shared time axis so the series line up.
    let tMin = Number.POSITIVE_INFINITY;
    let tMax = Number.NEGATIVE_INFINITY;
    for (const s of withPoints) {
      for (const p of s.points) {
        if (p.at < tMin) tMin = p.at;
        if (p.at > tMax) tMax = p.at;
      }
    }
    if (!Number.isFinite(tMin) || tMax <= tMin) return null;

    const paths = withPoints.map((s) => {
      let vMin = Number.POSITIVE_INFINITY;
      let vMax = Number.NEGATIVE_INFINITY;
      for (const p of s.points) {
        if (p.value < vMin) vMin = p.value;
        if (p.value > vMax) vMax = p.value;
      }
      // Give a flat line some room rather than dividing by zero.
      if (vMax - vMin < 1e-6) {
        vMin -= 1;
        vMax += 1;
      }
      const pad = (vMax - vMin) * 0.08;
      vMin -= pad;
      vMax += pad;

      const d = s.points
        .map((p, index) => {
          const x = PADDING.left + ((p.at - tMin) / (tMax - tMin)) * plotWidth;
          const y = PADDING.top + (1 - (p.value - vMin) / (vMax - vMin)) * plotHeight;
          return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');

      return { series: s, d, vMin, vMax };
    });

    return { paths, tMin, tMax };
  }, [series, plotWidth, plotHeight]);

  if (!prepared) {
    return (
      <View style={{ height, justifyContent: 'center' }}>
        <Label>Waiting for readings</Label>
      </View>
    );
  }

  const highlighted =
    prepared.paths.find((p) => p.series.key === highlightKey) ?? prepared.paths[0];

  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const spanSeconds = Math.round((prepared.tMax - prepared.tMin) / 1000);

  return (
    <View>
      <Svg width={width} height={height}>
        {gridLines.map((fraction) => {
          const y = PADDING.top + fraction * plotHeight;
          const value = highlighted
            ? highlighted.vMax - fraction * (highlighted.vMax - highlighted.vMin)
            : 0;
          return (
            <Fragment key={`grid-${fraction}`}>
              <Line
                x1={PADDING.left}
                y1={y}
                x2={PADDING.left + plotWidth}
                y2={y}
                stroke={palette.line}
                strokeWidth={0.5}
              />
              <SvgText
                x={PADDING.left - 6}
                y={y + 3.5}
                fill={palette.muted}
                fontSize={10}
                textAnchor="end"
              >
                {formatTick(value, highlighted?.series.precision ?? 0)}
              </SvgText>
            </Fragment>
          );
        })}

        {prepared.paths.map(({ series: s, d }) => {
          const isHighlighted = s.key === highlighted?.series.key;
          return (
            <Path
              key={s.key}
              d={d}
              stroke={s.color}
              strokeWidth={isHighlighted ? 2 : 1.2}
              strokeOpacity={isHighlighted ? 1 : 0.45}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        <SvgText
          x={PADDING.left}
          y={height - 5}
          fill={palette.muted}
          fontSize={10}
        >
          {`${spanSeconds}s window`}
        </SvgText>
      </Svg>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.base, marginTop: space.small }}>
        {prepared.paths.map(({ series: s }) => {
          const latest = s.points[s.points.length - 1];
          return (
            <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 9, height: 2.5, borderRadius: 2, backgroundColor: s.color }} />
              <Label style={[tabular, { fontSize: type.micro }]}>
                {`${s.name} ${latest ? latest.value.toFixed(s.precision ?? 0) : '—'}${s.unit ? ` ${s.unit}` : ''}`}
              </Label>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function formatTick(value: number, precision: number): string {
  if (Math.abs(value) >= 10000) return `${Math.round(value / 1000)}k`;
  return value.toFixed(precision);
}

/** A single-series trace with no axes, for sitting inside a list row. */
export function Sparkline({
  points,
  color,
  width,
  height = 28,
}: {
  points: { at: number; value: number }[];
  color: string;
  width: number;
  height?: number;
}) {
  const path = useMemo(() => {
    if (points.length < 2) return null;
    let vMin = Number.POSITIVE_INFINITY;
    let vMax = Number.NEGATIVE_INFINITY;
    for (const p of points) {
      if (p.value < vMin) vMin = p.value;
      if (p.value > vMax) vMax = p.value;
    }
    if (vMax - vMin < 1e-6) {
      vMin -= 1;
      vMax += 1;
    }
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last || last.at === first.at) return null;

    return points
      .map((p, index) => {
        const x = ((p.at - first.at) / (last.at - first.at)) * width;
        const y = (1 - (p.value - vMin) / (vMax - vMin)) * (height - 4) + 2;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [points, width, height]);

  if (!path) return <View style={{ width, height }} />;

  return (
    <Svg width={width} height={height}>
      <Path d={path} stroke={color} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  );
}
