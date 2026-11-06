/**
 * A fault in a list.
 *
 * The coloured spine down the left edge carries the severity, so a list of
 * faults can be read at a glance without reading any of the words. That is
 * structure encoding information rather than decoration — which is also why
 * there is no spine on rows that have no severity to report.
 */

import { View } from 'react-native';

import { actionLabel, type ActionLevel } from '@/data/dtcCatalog';
import { actionColor, radius, space, tabular, type, usePalette } from '../theme';
import { Body, Label, Tappable } from './primitives';

export function FaultRow({
  code,
  title,
  action,
  origin,
  onPress,
  seenBefore,
}: {
  code: string;
  title: string;
  action: ActionLevel;
  origin?: 'stored' | 'pending' | 'permanent';
  onPress?: () => void;
  /** Number of earlier scans this code appeared in, when known. */
  seenBefore?: number;
}) {
  const palette = usePalette();
  const spine = actionColor(action, palette);

  const originNote =
    origin === 'pending'
      ? 'Pending — seen once, not yet confirmed'
      : origin === 'permanent'
        ? 'Permanent — only the vehicle can clear this'
        : null;

  const content = (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: palette.panel,
        borderRadius: radius.tile,
        overflow: 'hidden',
      }}
    >
      <View style={{ width: 3, backgroundColor: spine }} />
      <View style={{ flex: 1, padding: space.base, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.small }}>
          <Body
            style={[tabular, { fontWeight: '700', fontSize: type.lead, letterSpacing: 0.2 }]}
          >
            {code}
          </Body>
          <Label style={{ color: spine, fontWeight: '600', flex: 1 }} numberOfLines={1}>
            {actionLabel(action)}
          </Label>
        </View>

        <Body color={palette.text} numberOfLines={2}>
          {title}
        </Body>

        {originNote ? <Label style={{ marginTop: 2 }}>{originNote}</Label> : null}

        {seenBefore && seenBefore > 1 ? (
          <Label style={{ marginTop: 2 }}>{`Seen in ${seenBefore} scans`}</Label>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) return content;
  return (
    <Tappable onPress={onPress} accessibilityLabel={`${code}. ${title}`}>
      {content}
    </Tappable>
  );
}
