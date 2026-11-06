/**
 * The verdict strip.
 *
 * This is the first thing on the home screen and the one element allowed to be
 * loud, because it answers the only question that matters on opening the app:
 * is anything wrong, and can I drive? Everything below it is evidence.
 *
 * It is deliberately not a card — full bleed, no border — so it reads as the
 * state of the vehicle rather than one more item in a list.
 */

import { View } from 'react-native';

import type { DriveAdvice } from '@/data/dtcCatalog';
import { driveColor, space, type, usePalette } from '../theme';
import { Body, Heading, Label, Reading } from './primitives';

export type Verdict =
  | { kind: 'disconnected' }
  | { kind: 'connecting'; detail: string }
  | { kind: 'silent'; detail: string }
  | { kind: 'unscanned' }
  | { kind: 'clear'; voltage: number | null }
  | { kind: 'faults'; count: number; drive: DriveAdvice; worst: string };

export function StatusStrip({ verdict }: { verdict: Verdict }) {
  const palette = usePalette();

  switch (verdict.kind) {
    case 'disconnected':
      return (
        <Strip
          accent={palette.muted}
          headline="No adapter connected"
          body="Plug the adapter into the diagnostic port, switch the ignition on, then connect."
        />
      );

    case 'connecting':
      return <Strip accent={palette.blue} headline="Connecting" body={verdict.detail} />;

    case 'silent':
      return (
        <Strip
          accent={palette.amber}
          headline="Vehicle not answering"
          body={verdict.detail}
        />
      );

    case 'unscanned':
      return (
        <Strip
          accent={palette.blue}
          headline="Connected"
          body="Nothing has been read yet. Run a scan to check for stored faults."
        />
      );

    case 'clear':
      return (
        <Strip
          accent={palette.green}
          headline="No faults stored"
          body="The engine computer is not reporting any trouble codes."
          trailing={
            verdict.voltage !== null ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Reading value={verdict.voltage.toFixed(1)} unit="V" size={type.title} align="right" />
                <Label>Battery</Label>
              </View>
            ) : undefined
          }
        />
      );

    case 'faults': {
      const accent = driveColor(verdict.drive, palette);
      const driveText =
        verdict.drive === 'do-not-drive'
          ? 'Do not drive — have the vehicle recovered.'
          : verdict.drive === 'with-care'
            ? 'Driveable with care. Get it looked at soon.'
            : 'Safe to drive. Worth fixing when convenient.';

      return (
        <Strip
          accent={accent}
          headline={verdict.count === 1 ? '1 fault stored' : `${verdict.count} faults stored`}
          body={`${driveText} Worst: ${verdict.worst}.`}
          trailing={
            <View style={{ alignItems: 'flex-end' }}>
              <Reading value={String(verdict.count)} size={type.display} color={accent} align="right" />
            </View>
          }
        />
      );
    }
  }
}

function Strip({
  accent,
  headline,
  body,
  trailing,
}: {
  accent: string;
  headline: string;
  body: string;
  trailing?: React.ReactNode;
}) {
  const palette = usePalette();
  return (
    <View
      style={{
        paddingTop: space.wide,
        paddingBottom: space.wide,
        gap: space.small,
        borderBottomWidth: 1,
        borderBottomColor: palette.line,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.gap }}>
        <View style={{ flex: 1, gap: space.small }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.small }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
            <Heading color={accent} numberOfLines={2} style={{ flex: 1 }}>
              {headline}
            </Heading>
          </View>
          <Body color={palette.muted} style={{ maxWidth: 480 }}>
            {body}
          </Body>
        </View>
        {trailing}
      </View>
    </View>
  );
}
