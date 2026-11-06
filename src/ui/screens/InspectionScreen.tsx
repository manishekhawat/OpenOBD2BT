/**
 * Pre-purchase inspection.
 *
 * Built for standing next to a vehicle you are thinking of buying. Leads with
 * what would need answering, each flag paired with what to actually ask, and
 * shares as plain text to keep with the paperwork.
 */

import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { session } from '@/obd/session';
import { decodeVin, describeVin } from '@/obd/vin';
import { buildInspection, inspectionToText, type InspectionFlag } from '@/features/inspection';
import { useConnection } from '@/state/connection';
import { useDiagnostics } from '@/state/diagnostics';
import { useFaults } from '@/state/faults';

import {
  Body,
  Button,
  Divider,
  EmptyState,
  Field,
  Label,
  Panel,
  Row,
  Screen,
  SectionHeader,
  Title,
} from '../components/primitives';
import { radius, space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function InspectionScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();
  const status = useConnection((s) => s.status);
  const scan = useFaults((s) => s.result);
  const { readings, readiness, checks, performanceCounters, readAt, busy, step, refresh } =
    useDiagnostics();

  const [sharing, setSharing] = useState(false);

  const connected = status.state === 'ready' && !status.vehicleSilent;
  const vin = session.vehicleInfo?.vin ? decodeVin(session.vehicleInfo.vin) : null;

  const report = useMemo(
    () =>
      readAt
        ? buildInspection({
            vin,
            scan,
            readiness,
            readings,
            checks: checks ?? [],
            performanceCounters,
          })
        : null,
    [readAt, vin, scan, readiness, readings, checks, performanceCounters],
  );

  if (!connected) {
    return (
      <Screen>
        <EmptyState
          title="Connect to inspect the vehicle"
          body="Plug the adapter in and switch the ignition on. The engine does not need to be running for most of it, though a warm engine gives better fuel trim readings."
          actionLabel="Connect adapter"
          onAction={() => navigation.navigate('Connect')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ paddingTop: space.wide, gap: space.small }}>
        <Title>Pre-purchase inspection</Title>
        <Body color={palette.muted}>
          Checks the things a seller cannot quietly reset: permanent codes, how recently the fault
          memory was cleared, and whether the emission self-checks have had time to finish.
        </Body>
      </View>

      {report ? <VerdictPanel report={report} /> : null}

      <Button
        label={busy ? (step ?? 'Inspecting') : report ? 'Inspect again' : 'Run inspection'}
        onPress={() => void refresh()}
        tone="primary"
        busy={busy}
        style={{ marginTop: space.gap }}
      />

      {vin ? (
        <>
          <SectionHeader>Identity</SectionHeader>
          <Panel>
            <Field label="VIN" value={vin.vin} />
            <Divider />
            <Field label="Manufacturer" value={vin.manufacturer ?? `Unknown (${vin.wmi})`} />
            <Divider />
            <Field
              label="Model year"
              value={
                vin.modelYear
                  ? vin.modelYearAlternative
                    ? `${vin.modelYear} (or ${vin.modelYearAlternative})`
                    : String(vin.modelYear)
                  : 'Not decodable'
              }
            />
            <Divider />
            <Field label="Built in" value={vin.country ?? vin.region ?? 'Unknown'} />
            <Divider />
            <Field label="Plant code" value={vin.plantCode} />
          </Panel>
          {vin.modelYearAlternative ? (
            <Label style={{ marginTop: space.small }}>
              The year character repeats every thirty years, so a VIN alone cannot separate the two.
              The paperwork settles it.
            </Label>
          ) : null}
          {!vin.manufacturer ? (
            <Label style={{ marginTop: space.small }}>
              {`The identifier ${vin.wmi} is not in this app's table, which covers common makes rather than every manufacturer. The rest of the VIN is still decoded correctly.`}
            </Label>
          ) : null}
        </>
      ) : null}

      {report && report.flags.length > 0 ? (
        <>
          <SectionHeader>What to ask about</SectionHeader>
          <View style={{ gap: space.small }}>
            {report.flags.map((flag, index) => (
              <FlagCard key={`${flag.title}-${index}`} flag={flag} />
            ))}
          </View>
        </>
      ) : null}

      {report ? (
        <>
          <Button
            label="Share this report"
            tone="neutral"
            busy={sharing}
            style={{ marginTop: space.wide }}
            onPress={async () => {
              setSharing(true);
              try {
                const text = inspectionToText(report, vin, readings);
                const file = new File(Paths.cache, `inspection-${Date.now()}.txt`);
                file.create({ overwrite: true });
                await file.write(text);
                if (await Sharing.isAvailableAsync()) {
                  await Sharing.shareAsync(file.uri, {
                    mimeType: 'text/plain',
                    dialogTitle: 'Inspection report',
                  });
                }
              } finally {
                setSharing(false);
              }
            }}
          />

          <Panel tone="high" style={{ marginTop: space.wide }}>
            <Label style={{ lineHeight: 19 }}>
              This reads the engine and emissions systems over standard OBD-II. It cannot see the
              gearbox, ABS, airbags, suspension, bodywork or structure, and it says nothing about
              service history or accident damage. A clean report here is one input among several,
              not a clean bill of health.
            </Label>
          </Panel>
        </>
      ) : null}
    </Screen>
  );
}

function VerdictPanel({ report }: { report: ReturnType<typeof buildInspection> }) {
  const palette = usePalette();

  const colour =
    report.verdict === 'serious' ? palette.red
      : report.verdict === 'questions' ? palette.amber
      : palette.green;

  const headline =
    report.verdict === 'serious' ? 'Needs answers'
      : report.verdict === 'questions' ? 'Some questions'
      : 'Nothing flagged';

  return (
    <View
      style={{
        marginTop: space.wide,
        paddingTop: space.wide,
        paddingBottom: space.wide,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: palette.line,
        gap: space.small,
      }}
    >
      <Row gap={space.small}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colour }} />
        <Title style={{ color: colour, fontSize: type.heading }}>{headline}</Title>
      </Row>
      <Body color={palette.muted}>{report.summary}</Body>
    </View>
  );
}

function FlagCard({ flag }: { flag: InspectionFlag }) {
  const palette = usePalette();

  const colour =
    flag.level === 'red' ? palette.red
      : flag.level === 'amber' ? palette.amber
      : palette.muted;

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: palette.panel,
        borderRadius: radius.tile,
        overflow: 'hidden',
      }}
    >
      <View style={{ width: 3, backgroundColor: colour }} />
      <View style={{ flex: 1, padding: space.base, gap: space.small }}>
        <Body style={{ fontWeight: '600', color: colour }}>{flag.title}</Body>
        <Label style={{ color: palette.text }}>{flag.detail}</Label>
        <Body color={palette.muted}>{flag.action}</Body>
      </View>
    </View>
  );
}
