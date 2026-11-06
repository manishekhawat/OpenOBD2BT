/**
 * Emission readiness.
 *
 * What an emissions test reads. The useful answer is binary — ready or not —
 * so that goes first, with the monitor-by-monitor detail beneath it.
 */

import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { session } from '@/obd/session';
import type { ReadinessReport } from '@/obd/monitors';
import { useConnection } from '@/state/connection';
import { useFaults } from '@/state/faults';

import {
  Body,
  Button,
  Divider,
  EmptyState,
  Label,
  Panel,
  Reading,
  Row,
  Screen,
  SectionHeader,
  Title,
} from '../components/primitives';
import { space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ReadinessScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();
  const status = useConnection((s) => s.status);
  const scanResult = useFaults((s) => s.result);

  const [report, setReport] = useState<ReadinessReport | null>(scanResult?.readiness ?? null);
  const [loading, setLoading] = useState(false);

  const connected = status.state === 'ready' && !status.vehicleSilent;

  const refresh = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      setReport(await session.readReadiness());
    } finally {
      setLoading(false);
    }
  }, [connected]);

  useEffect(() => {
    if (!report && connected) void refresh();
  }, [report, connected, refresh]);

  if (!connected) {
    return (
      <Screen>
        <EmptyState
          title="Connect to read readiness"
          body="The on-board self-checks are reported by the engine computer, so the vehicle needs to be connected and the ignition on."
          actionLabel="Connect adapter"
          onAction={() => navigation.navigate('Connect')}
        />
      </Screen>
    );
  }

  if (!report) {
    return (
      <Screen>
        <EmptyState
          title="Not reported"
          body="This vehicle did not return a readiness report. Some older or non-compliant vehicles do not support it."
          actionLabel="Try again"
          onAction={() => void refresh()}
        />
      </Screen>
    );
  }

  const supported = report.monitors.filter((m) => m.supported);
  const complete = supported.filter((m) => m.complete);
  const incomplete = supported.filter((m) => !m.complete);
  const accent = report.readyForTest ? palette.green : palette.amber;

  return (
    <Screen>
      <View style={{ paddingTop: space.gap, gap: space.base }}>
        <Title style={{ color: accent, fontSize: type.heading }}>
          {report.readyForTest ? 'Ready for a test' : 'Not ready for a test'}
        </Title>
        <Body color={palette.muted}>
          {report.readyForTest
            ? 'Every self-check this vehicle supports has finished running.'
            : `${incomplete.length} of ${supported.length} checks have not finished. They complete by themselves over a mix of driving — town, open road and some time with the engine cold.`}
        </Body>
      </View>

      <Panel style={{ marginTop: space.wide }}>
        <Row justify="space-between">
          <View>
            <Label>Warning lamp</Label>
            <Title style={{ fontSize: type.lead, color: report.milOn ? palette.amber : palette.green, marginTop: 2 }}>
              {report.milOn ? 'On' : 'Off'}
            </Title>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Label>Stored faults</Label>
            <Reading
              value={String(report.dtcCount)}
              size={type.title}
              align="right"
              color={report.dtcCount > 0 ? palette.amber : palette.text}
            />
          </View>
        </Row>
        <Divider />
        <Row justify="space-between" style={{ paddingTop: space.base }}>
          <Label>Engine type</Label>
          <Label style={{ color: palette.text }}>
            {report.ignition === 'compression' ? 'Compression ignition (diesel)' : 'Spark ignition (petrol)'}
          </Label>
        </Row>
      </Panel>

      {incomplete.length > 0 ? (
        <>
          <SectionHeader>Still running</SectionHeader>
          <Panel style={{ paddingVertical: space.small }}>
            {incomplete.map((monitor, index) => (
              <View key={monitor.name}>
                {index > 0 ? <Divider /> : null}
                <Row justify="space-between" style={{ paddingVertical: space.base }}>
                  <Body style={{ flex: 1 }}>{monitor.name}</Body>
                  <Label style={{ color: palette.amber, fontWeight: '600' }}>Incomplete</Label>
                </Row>
              </View>
            ))}
          </Panel>
        </>
      ) : null}

      {complete.length > 0 ? (
        <>
          <SectionHeader>Complete</SectionHeader>
          <Panel style={{ paddingVertical: space.small }}>
            {complete.map((monitor, index) => (
              <View key={monitor.name}>
                {index > 0 ? <Divider /> : null}
                <Row justify="space-between" style={{ paddingVertical: space.base }}>
                  <Body style={{ flex: 1 }} color={palette.muted}>{monitor.name}</Body>
                  <Label style={{ color: palette.green, fontWeight: '600' }}>Passed</Label>
                </Row>
              </View>
            ))}
          </Panel>
        </>
      ) : null}

      <Panel tone="high" style={{ marginTop: space.wide }}>
        <Label style={{ lineHeight: 19 }}>
          Clearing fault codes resets every one of these to incomplete. If a test is coming up, read
          the codes but leave them stored until after it.
        </Label>
      </Panel>

      <Button
        label={loading ? 'Reading' : 'Read again'}
        onPress={() => void refresh()}
        tone="neutral"
        busy={loading}
        style={{ marginTop: space.gap }}
      />
    </Screen>
  );
}
