/**
 * Adapter log.
 *
 * The raw conversation with the adapter. This is the screen that answers "why
 * will it not connect" — a clone that mangles replies shows it here plainly.
 */

import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { session } from '@/obd/session';
import { useConnection } from '@/state/connection';
import { useSettings } from '@/state/settings';
import { exportTrace } from '@/features/exports';

import {
  Body,
  Button,
  EmptyState,
  Label,
  Panel,
  Row,
  Screen,
  Title,
} from '../components/primitives';
import { radius, space, type, usePalette } from '../theme';

export function AdapterLogScreen() {
  const palette = usePalette();
  const trace = useConnection((s) => s.trace);
  const status = useConnection((s) => s.status);
  const logging = useSettings((s) => s.logAdapterTraffic);
  const setSetting = useSettings((s) => s.set);
  const [sharing, setSharing] = useState(false);

  if (trace.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="Nothing logged yet"
          body="The log fills as soon as the app talks to an adapter. Connect, and come back here if something looks wrong."
          actionLabel={logging ? undefined : 'Turn the log on'}
          onAction={logging ? undefined : () => setSetting('logAdapterTraffic', true)}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <View style={{ paddingTop: space.gap, gap: space.base }}>
        <Title>Adapter log</Title>
        <Label>
          {`${trace.length} lines. Sent lines start with the command, received lines are the adapter's reply.`}
        </Label>

        {status.adapterIdentity ? (
          <Panel tone="high">
            <Row justify="space-between">
              <Label>Adapter reports</Label>
              <Label style={{ color: palette.text }}>{status.adapterIdentity}</Label>
            </Row>
            {status.protocol ? (
              <Row justify="space-between" style={{ marginTop: space.small }}>
                <Label>Protocol</Label>
                <Label style={{ color: palette.text }}>{status.protocol}</Label>
              </Row>
            ) : null}
          </Panel>
        ) : null}
      </View>

      <ScrollView
        style={{
          flex: 1,
          marginTop: space.gap,
          backgroundColor: palette.panel,
          borderRadius: radius.panel,
          borderWidth: 1,
          borderColor: palette.line,
        }}
        contentContainerStyle={{ padding: space.base }}
      >
        {trace.map((entry, index) => {
          const color =
            entry.direction === 'tx' ? palette.blue
              : entry.direction === 'info' ? palette.muted
              : palette.text;
          const arrow = entry.direction === 'tx' ? '→' : entry.direction === 'rx' ? '←' : '·';
          return (
            <Row key={`${entry.at}-${index}`} gap={space.small} align="flex-start" style={{ paddingVertical: 2 }}>
              <Label style={{ color: palette.muted, fontSize: 11, width: 62 }}>
                {new Date(entry.at).toISOString().slice(11, 19)}
              </Label>
              <Label style={{ color, fontSize: 11, width: 12 }}>{arrow}</Label>
              <Label style={{ color, fontSize: 11, flex: 1 }}>
                {entry.text.replace(/\r/g, ' ').replace(/\n/g, ' ')}
              </Label>
            </Row>
          );
        })}
      </ScrollView>

      <Row gap={space.small} style={{ marginTop: space.base }}>
        <Button
          label="Share log"
          tone="neutral"
          busy={sharing}
          style={{ flex: 1 }}
          onPress={async () => {
            setSharing(true);
            try {
              await exportTrace(trace);
            } finally {
              setSharing(false);
            }
          }}
        />
        <Button label="Clear" tone="quiet" onPress={() => session.clearTrace()} style={{ flex: 1 }} />
      </Row>
    </Screen>
  );
}
