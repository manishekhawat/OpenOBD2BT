/**
 * Monitor test results — service 06.
 *
 * The measurements behind the readiness monitors, grouped by system, worst
 * first. Each test shows where its value sits between the limits it was judged
 * against, so a component drifting towards failure is visible long before it
 * sets a code.
 */

import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { describeMargin, groupByMonitor, type TestResult } from '@/obd/mode06';
import { useConnection } from '@/state/connection';
import { useDiagnostics } from '@/state/diagnostics';

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
import { radius, space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function TestResultsScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();
  const status = useConnection((s) => s.status);
  const { testResults, busy, step, refresh } = useDiagnostics();

  const connected = status.state === 'ready' && !status.vehicleSilent;

  if (!connected) {
    return (
      <Screen>
        <EmptyState
          title="Connect to read test results"
          body="These measurements come from the engine computer's own monitoring, so the vehicle has to be connected."
          actionLabel="Connect adapter"
          onAction={() => navigation.navigate('Connect')}
        />
      </Screen>
    );
  }

  if (testResults.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="No test results yet"
          body="Service 06 reports the actual measurement behind each emission monitor, with the limits it was judged against. Not every vehicle implements it — it is optional on pre-CAN vehicles and thin on some makes."
          actionLabel={busy ? (step ?? 'Reading') : 'Read test results'}
          onAction={() => void refresh({ includeCounters: false })}
        />
      </Screen>
    );
  }

  const groups = groupByMonitor(testResults);
  const failing = groups.filter((g) => !g.allPassed).length;
  const narrow = groups.filter(
    (g) => g.allPassed && g.worstMargin !== null && g.worstMargin < 0.2,
  ).length;

  return (
    <Screen>
      <View style={{ paddingTop: space.gap, gap: space.small }}>
        <Title>Monitor test results</Title>
        <Label>
          {`${testResults.length} tests across ${groups.length} monitors`}
          {failing > 0 ? ` · ${failing} failing` : ''}
          {narrow > 0 ? ` · ${narrow} close to the limit` : ''}
        </Label>
      </View>

      {groups.map((group) => {
        const colour = !group.allPassed
          ? palette.red
          : group.worstMargin !== null && group.worstMargin < 0.2
            ? palette.amber
            : palette.green;

        return (
          <View key={group.mid} style={{ marginTop: space.wide }}>
            <Row justify="space-between" style={{ marginBottom: space.small }}>
              <Title style={{ fontSize: type.lead, flex: 1 }} numberOfLines={2}>
                {group.name}
              </Title>
              <Label style={{ color: colour, fontWeight: '600' }}>
                {describeMargin(group.worstMargin, group.allPassed)}
              </Label>
            </Row>

            {!group.nameKnown ? (
              <Label style={{ marginBottom: space.small }}>
                The standard does not name this monitor — the manufacturer defines what it tests.
              </Label>
            ) : null}

            <Panel style={{ paddingVertical: space.small }}>
              {group.tests.map((test, index) => (
                <View key={`${test.mid}-${test.tid}-${index}`}>
                  {index > 0 ? <Divider /> : null}
                  <TestRow test={test} />
                </View>
              ))}
            </Panel>
          </View>
        );
      })}

      <Panel tone="high" style={{ marginTop: space.section }}>
        <Label style={{ lineHeight: 19 }}>
          Margin is how far a value sits from the limit that would fail it, as a proportion. It is
          worked out from the raw numbers, so it stays meaningful even where the unit is one this
          app does not recognise — a test can always be judged pass or fail, even when its scaling
          is unknown.
        </Label>
      </Panel>

      <Button
        label={busy ? (step ?? 'Reading') : 'Read again'}
        onPress={() => void refresh({ includeCounters: false })}
        tone="neutral"
        busy={busy}
        style={{ marginTop: space.gap }}
      />
    </Screen>
  );
}

function TestRow({ test }: { test: TestResult }) {
  const palette = usePalette();

  const colour = !test.passed
    ? palette.red
    : test.margin !== null && test.margin < 0.2
      ? palette.amber
      : palette.green;

  const unit = test.scalingKnown ? test.unit : '';
  const precision = test.scalingKnown && Math.abs(test.value) < 10 ? 3 : 1;

  return (
    <View style={{ paddingVertical: space.base, gap: space.small }}>
      <Row justify="space-between" align="flex-end">
        <View style={{ flex: 1 }}>
          <Label>{`Test $${test.tid.toString(16).toUpperCase().padStart(2, '0')}`}</Label>
          <Label style={{ marginTop: 2 }}>
            {test.bound === 'both'
              ? `Limits ${test.minLimit.toFixed(precision)} to ${test.maxLimit.toFixed(precision)}`
              : test.bound === 'max'
                ? `Must stay below ${test.maxLimit.toFixed(precision)}`
                : test.bound === 'min'
                  ? `Must stay above ${test.minLimit.toFixed(precision)}`
                  : 'No limit reported'}
          </Label>
        </View>
        <Reading
          value={test.value.toFixed(precision)}
          unit={unit}
          size={type.lead}
          color={colour}
          align="right"
        />
      </Row>

      {test.margin !== null ? <MarginBar margin={test.margin} colour={colour} /> : null}

      {!test.scalingKnown ? (
        <Label>
          {`Raw value — scaling ID $${test.unitScalingId.toString(16).toUpperCase().padStart(2, '0')} is not one this app decodes, so no unit is shown. The pass or fail above is still correct.`}
        </Label>
      ) : null}
    </View>
  );
}

/** How much room is left, drawn as a bar rather than left as a percentage. */
function MarginBar({ margin, colour }: { margin: number; colour: string }) {
  const palette = usePalette();
  return (
    <View
      style={{
        height: 5,
        backgroundColor: palette.track,
        borderRadius: radius.inset,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${Math.max(2, margin * 100)}%`,
          height: '100%',
          backgroundColor: colour,
          borderRadius: radius.inset,
        }}
      />
    </View>
  );
}
