/**
 * Faults.
 *
 * The scan and its results, with clearing behind a confirmation that explains
 * what clearing actually does — it erases the freeze frame and resets the
 * readiness monitors, which matters if an emissions test is coming up.
 */

import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { lookupDtc } from '@/data/dtcCatalog';
import { codeHistory } from '@/data/repo/scans';
import { session } from '@/obd/session';
import { overallDriveAdvice, rankedCodes, useFaults } from '@/state/faults';
import { useConnection } from '@/state/connection';

import {
  Body,
  Button,
  Chip,
  EmptyState,
  Label,
  Panel,
  Row,
  Screen,
  SectionHeader,
  Title,
} from '../components/primitives';
import { FaultRow } from '../components/FaultRow';
import { driveColor, space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function FaultsScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();

  const status = useConnection((s) => s.status);
  const { result, scanning, clearing, error, lastClear, scan, clear } = useFaults();
  const [occurrences, setOccurrences] = useState<Record<string, number>>({});

  const connected = status.state === 'ready' && !status.vehicleSilent;
  const codes = result ? rankedCodes(result) : [];

  // How many past scans each code appeared in — a code that keeps coming back
  // is a different problem from one seen once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const counts: Record<string, number> = {};
      for (const dtc of codes) {
        counts[dtc.code] = (await codeHistory(dtc.code)).length;
      }
      if (!cancelled) setOccurrences(counts);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [result]);

  const confirmClear = () => {
    Alert.alert(
      'Clear stored fault codes?',
      'This erases the stored codes, the freeze frame that came with them, and resets the emission readiness monitors. The vehicle has to be driven for a while before it is ready for an emissions test again.\n\nIf the underlying fault is still there, the codes will come back.',
      [
        { text: 'Keep them', style: 'cancel' },
        { text: 'Clear codes', style: 'destructive', onPress: () => void clear() },
      ],
    );
  };

  if (!connected) {
    return (
      <Screen>
        <EmptyState
          title="Connect to read fault codes"
          body="Plug the adapter into the diagnostic port, switch the ignition on, then connect. You can also try everything on the demo vehicle."
          actionLabel="Connect adapter"
          onAction={() => navigation.navigate('Connect')}
        />
        <Button label="Look up a code by number" onPress={() => navigation.navigate('CodeLookup')} tone="quiet" />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ paddingTop: space.wide, gap: space.base }}>
        <Title>Fault codes</Title>
        <Button
          label={scanning ? 'Scanning' : result ? 'Scan again' : 'Scan now'}
          onPress={() => void scan()}
          tone="primary"
          busy={scanning}
        />
      </View>

      {error ? (
        <Panel style={{ marginTop: space.gap, borderColor: palette.red }}>
          <Body color={palette.red}>{error}</Body>
        </Panel>
      ) : null}

      {lastClear ? (
        <Panel style={{ marginTop: space.gap, borderColor: lastClear.remaining === 0 ? palette.green : palette.amber }}>
          <Title style={{ fontSize: type.lead, color: lastClear.remaining === 0 ? palette.green : palette.amber }}>
            {lastClear.remaining === 0 ? 'Codes cleared' : 'Codes came straight back'}
          </Title>
          <Body color={palette.muted} style={{ marginTop: space.small }}>
            {lastClear.remaining === 0
              ? 'Nothing is stored now. If the fault is still present, the code will return once the vehicle has run through its checks again.'
              : `${lastClear.remaining} code${lastClear.remaining === 1 ? '' : 's'} came back immediately, which means the fault is active right now rather than historic.`}
          </Body>
        </Panel>
      ) : null}

      {!result ? (
        <EmptyState
          title="Nothing read yet"
          body="A scan reads stored, pending and permanent codes, and the state of the on-board emission self-checks."
        />
      ) : codes.length === 0 ? (
        <Panel style={{ marginTop: space.wide }}>
          <Title style={{ color: palette.green }}>No faults stored</Title>
          <Body color={palette.muted} style={{ marginTop: space.small }}>
            The engine computer reported no stored, pending or permanent trouble codes.
            {result.servicesAnswered.length > 0
              ? ` Checked: ${result.servicesAnswered.join(', ')}.`
              : ''}
          </Body>
        </Panel>
      ) : (
        <>
          <Panel style={{ marginTop: space.wide }}>
            <Row justify="space-between">
              <View style={{ flex: 1 }}>
                <Title>{codes.length === 1 ? '1 fault found' : `${codes.length} faults found`}</Title>
                <Label style={{ marginTop: 4, color: driveColor(overallDriveAdvice(codes), palette) }}>
                  {describeDrive(overallDriveAdvice(codes))}
                </Label>
              </View>
            </Row>
          </Panel>

          <Group
            title="Stored"
            note="Confirmed faults. These are what turn the warning lamp on."
            codes={result.stored}
            occurrences={occurrences}
            onOpen={(code) => navigation.navigate('FaultDetail', { code })}
          />
          <Group
            title="Pending"
            note="Seen once but not yet confirmed. They clear themselves if they do not recur."
            codes={result.pending}
            occurrences={occurrences}
            onOpen={(code) => navigation.navigate('FaultDetail', { code })}
          />
          <Group
            title="Permanent"
            note="Set by the vehicle and only cleared by it, once the fault is genuinely fixed."
            codes={result.permanent}
            occurrences={occurrences}
            onOpen={(code) => navigation.navigate('FaultDetail', { code })}
          />

          <View style={{ gap: space.small, marginTop: space.section }}>
            {session.supportedPids.length > 0 ? (
              <Button label="Freeze frame" onPress={() => navigation.navigate('FreezeFrame')} tone="neutral" />
            ) : null}
            <Button label="Emission readiness" onPress={() => navigation.navigate('Readiness')} tone="neutral" />
            <Button
              label={clearing ? 'Clearing' : 'Clear codes'}
              onPress={confirmClear}
              tone="danger"
              busy={clearing}
            />
          </View>
        </>
      )}
    </Screen>
  );
}

function Group({
  title, note, codes, occurrences, onOpen,
}: {
  title: string;
  note: string;
  codes: ReturnType<typeof rankedCodes>;
  occurrences: Record<string, number>;
  onOpen: (code: string) => void;
}) {
  const palette = usePalette();
  if (codes.length === 0) return null;

  return (
    <>
      <SectionHeader>{title}</SectionHeader>
      <Label style={{ marginTop: -space.small, marginBottom: space.base }}>{note}</Label>
      <View style={{ gap: space.small }}>
        {codes.map((dtc) => {
          const info = lookupDtc(dtc.code);
          return (
            <FaultRow
              key={`${dtc.code}-${dtc.origin}`}
              code={dtc.code}
              title={info.title}
              action={info.action}
              onPress={() => onOpen(dtc.code)}
              seenBefore={occurrences[dtc.code]}
            />
          );
        })}
      </View>
      {codes.some((d) => !lookupDtc(d.code).generic) ? (
        <Chip
          label="Some codes are manufacturer-specific"
          color={palette.amber}
          style={{ marginTop: space.base }}
        />
      ) : null}
    </>
  );
}

function describeDrive(drive: ReturnType<typeof overallDriveAdvice>): string {
  switch (drive) {
    case 'do-not-drive':
      return 'Do not drive — have the vehicle recovered.';
    case 'with-care':
      return 'Driveable with care. Get it looked at soon.';
    case 'ok':
      return 'Safe to drive. Worth fixing when convenient.';
  }
}
