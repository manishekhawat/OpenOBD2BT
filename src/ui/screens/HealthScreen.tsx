/**
 * Vehicle health.
 *
 * One screen that answers "is this vehicle healthy?" — the verdict first, then
 * each check with the measurement behind it, then what to do about anything
 * that is not right. Tapping a check opens its reasoning rather than hiding it.
 */

import { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { session } from '@/obd/session';
import { decodeVin, describeVin } from '@/obd/vin';
import type { ReadinessReport } from '@/obd/monitors';
import { overallHealth, type HealthCheck, type HealthStatus } from '@/features/health';
import { useConnection } from '@/state/connection';
import { useDiagnostics } from '@/state/diagnostics';

import {
  Body,
  Button,
  Divider,
  EmptyState,
  Label,
  Panel,
  Row,
  Screen,
  SectionHeader,
  Tappable,
  Title,
} from '../components/primitives';
import { space, type, usePalette, type Palette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HealthScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();
  const status = useConnection((s) => s.status);

  const { checks, testResults, readiness, busy, step, refresh } = useDiagnostics();
  const [expanded, setExpanded] = useState<string | null>(null);

  const connected = status.state === 'ready' && !status.vehicleSilent;

  if (!connected) {
    return (
      <Screen>
        <EmptyState
          title="Connect to check the vehicle"
          body="The health check reads live sensors, fault codes and the measurements behind each emission monitor, so it needs the vehicle connected with the ignition on."
          actionLabel="Connect adapter"
          onAction={() => navigation.navigate('Connect')}
        />
      </Screen>
    );
  }

  const decoded = session.vehicleInfo?.vin ? decodeVin(session.vehicleInfo.vin) : null;
  const overall = checks ? overallHealth(checks) : 'unknown';

  return (
    <Screen>
      <View style={{ paddingTop: space.wide, gap: space.small }}>
        <Title>Vehicle health</Title>
        {decoded ? <Label>{describeVin(decoded) ?? decoded.vin}</Label> : null}
      </View>

      {checks ? (
        <Verdict status={overall} checks={checks} readiness={readiness} />
      ) : (
        <Panel style={{ marginTop: space.gap }}>
          <Body color={palette.muted}>
            Reads fuel trims, charging voltage, oxygen sensors, temperature and the measurements
            behind each emission monitor, then says what they mean together rather than leaving you
            to interpret them.
          </Body>
        </Panel>
      )}

      <Button
        label={busy ? (step ?? 'Checking') : checks ? 'Check again' : 'Run health check'}
        onPress={() => void refresh()}
        tone="primary"
        busy={busy}
        style={{ marginTop: space.gap }}
      />

      {checks ? (
        <>
          <SectionHeader>Checks</SectionHeader>
          <View style={{ gap: space.small }}>
            {checks.map((check) => (
              <CheckRow
                key={check.id}
                check={check}
                expanded={expanded === check.id}
                onToggle={() => setExpanded(expanded === check.id ? null : check.id)}
              />
            ))}
          </View>

          {testResults.length > 0 ? (
            <Button
              label={`Monitor test results (${testResults.length})`}
              onPress={() => navigation.navigate('TestResults')}
              tone="neutral"
              style={{ marginTop: space.wide }}
            />
          ) : (
            <Panel tone="high" style={{ marginTop: space.wide }}>
              <Label style={{ lineHeight: 19 }}>
                This vehicle returned no monitor test results. Service 06 is optional on
                pre-CAN vehicles and some makers implement it thinly, so its absence is common and
                does not indicate a fault.
              </Label>
            </Panel>
          )}
        </>
      ) : null}
    </Screen>
  );
}

function Verdict({
  status, checks, readiness,
}: {
  status: HealthStatus;
  checks: HealthCheck[];
  readiness: ReadinessReport | null;
}) {
  const palette = usePalette();
  const colour = statusColour(status, palette);

  const bad = checks.filter((c) => c.status === 'bad').length;
  const watch = checks.filter((c) => c.status === 'watch').length;

  const headline =
    status === 'bad' ? 'Needs attention'
      : status === 'watch' ? 'Mostly healthy'
      : status === 'good' ? 'Healthy'
      : 'Not enough data';

  const body =
    status === 'bad'
      ? `${bad} ${bad === 1 ? 'check needs' : 'checks need'} attention${watch > 0 ? `, ${watch} worth watching` : ''}.`
      : status === 'watch'
        ? `Nothing wrong, but ${watch} ${watch === 1 ? 'check is' : 'checks are'} worth keeping an eye on.`
        : status === 'good'
          ? 'Every check that could be run came back normal.'
          : 'The vehicle did not report enough for a verdict.';

  return (
    <View
      style={{
        paddingTop: space.wide,
        paddingBottom: space.wide,
        borderBottomWidth: 1,
        borderBottomColor: palette.line,
        gap: space.small,
      }}
    >
      <Row gap={space.small}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colour }} />
        <Title style={{ color: colour, fontSize: type.heading }}>{headline}</Title>
      </Row>
      <Body color={palette.muted}>{body}</Body>
      {readiness ? (
        <Label style={{ marginTop: 2 }}>
          {readiness.readyForTest
            ? 'All emission self-checks complete'
            : `${readiness.monitors.filter((m) => m.supported && m.complete).length} of ${readiness.monitors.filter((m) => m.supported).length} emission self-checks complete`}
        </Label>
      ) : null}
    </View>
  );
}

function CheckRow({
  check, expanded, onToggle,
}: {
  check: HealthCheck;
  expanded: boolean;
  onToggle: () => void;
}) {
  const palette = usePalette();
  const colour = statusColour(check.status, palette);

  return (
    <Tappable onPress={onToggle} accessibilityLabel={`${check.label}: ${check.verdict}`}>
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: palette.panel,
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <View style={{ width: 3, backgroundColor: colour }} />
        <View style={{ flex: 1, padding: space.base, gap: 3 }}>
          <Row justify="space-between">
            <Body style={{ fontWeight: '600', flex: 1 }}>{check.label}</Body>
            <Label style={{ color: colour, fontWeight: '600' }}>{check.verdict}</Label>
          </Row>
          {check.detail ? <Label>{check.detail}</Label> : null}

          {expanded && check.advice ? (
            <>
              <Divider />
              <Body color={palette.muted} style={{ marginTop: space.small }}>
                {check.advice}
              </Body>
            </>
          ) : check.advice ? (
            <Label style={{ color: palette.amber, marginTop: 2 }}>Tap for what this means</Label>
          ) : null}
        </View>
      </View>
    </Tappable>
  );
}

export function statusColour(status: HealthStatus, palette: Palette): string {
  switch (status) {
    case 'bad':
      return palette.red;
    case 'watch':
      return palette.amber;
    case 'good':
      return palette.green;
    case 'unknown':
      return palette.muted;
  }
}
