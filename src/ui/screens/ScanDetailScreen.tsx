/**
 * A saved scan.
 *
 * The record as it stood at the time, including codes that have since been
 * cleared — which is the point of keeping it.
 */

import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { deleteScan, getScan, type SavedScan } from '@/data/repo/scans';
import { lookupDtc } from '@/data/dtcCatalog';
import { pidDefinition } from '@/obd/pids';
import { exportScanCsv } from '@/features/exports';
import { format, formatTimestamp } from '@/features/units';
import { useSettings } from '@/state/settings';

import {
  Body,
  Button,
  Divider,
  Field,
  Label,
  Panel,
  Reading,
  Row,
  Screen,
  SectionHeader,
  Title,
} from '../components/primitives';
import { FaultRow } from '../components/FaultRow';
import { space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ScanDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ScanDetail'>>();
  const navigation = useNavigation<Nav>();
  const palette = usePalette();
  const units = useSettings((s) => s.units);

  const [scan, setScan] = useState<SavedScan | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    getScan(route.params.scanId).then(setScan).catch(() => undefined);
  }, [route.params.scanId]);

  if (!scan) {
    return (
      <Screen>
        <View style={{ paddingTop: space.page }}>
          <Title>Loading…</Title>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ paddingTop: space.gap, gap: space.small }}>
        <Title style={{ fontSize: type.heading }}>{formatTimestamp(scan.startedAt)}</Title>
        <Label>
          {scan.clearedAt
            ? `Codes were cleared from this scan on ${formatTimestamp(scan.clearedAt)}.`
            : 'A record of what the vehicle reported at this moment.'}
        </Label>
      </View>

      <Panel style={{ marginTop: space.wide }}>
        <Row justify="space-between">
          <View>
            <Label>Stored faults</Label>
            <Reading
              value={String(scan.dtcCount)}
              size={type.heading}
              color={scan.dtcCount > 0 ? palette.amber : palette.green}
            />
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Label>Warning lamp</Label>
            <Title style={{ fontSize: type.lead, color: scan.milOn ? palette.amber : palette.green, marginTop: 4 }}>
              {scan.milOn ? 'On' : 'Off'}
            </Title>
          </View>
        </Row>
      </Panel>

      {scan.codes.length > 0 ? (
        <>
          <SectionHeader>Codes</SectionHeader>
          <View style={{ gap: space.small }}>
            {scan.codes.map((code, index) => {
              const info = lookupDtc(code.code);
              return (
                <FaultRow
                  key={`${code.code}-${index}`}
                  code={code.code}
                  title={code.title ?? info.title}
                  action={info.action}
                  origin={code.origin}
                  onPress={() => navigation.navigate('FaultDetail', { code: code.code })}
                />
              );
            })}
          </View>
        </>
      ) : (
        <Panel style={{ marginTop: space.wide }}>
          <Body color={palette.muted}>No codes were stored at the time of this scan.</Body>
        </Panel>
      )}

      {scan.freezeFrame.length > 0 ? (
        <>
          <SectionHeader>Freeze frame</SectionHeader>
          <Panel style={{ paddingVertical: space.small }}>
            {scan.freezeFrame.map((entry, index) => {
              const definition = pidDefinition(entry.pid);
              if (!definition) return null;
              const shown = format(entry.value, definition.unit, units, definition.precision);
              return (
                <View key={entry.pid}>
                  {index > 0 ? <Divider /> : null}
                  <Row justify="space-between" style={{ paddingVertical: space.base }}>
                    <Body style={{ flex: 1 }}>{definition.name}</Body>
                    <Reading value={shown.text} unit={shown.unit} size={type.lead} align="right" />
                  </Row>
                </View>
              );
            })}
          </Panel>
        </>
      ) : null}

      <SectionHeader>Conditions</SectionHeader>
      <Panel>
        <Field label="Adapter" value={scan.adapter ?? '—'} />
        <Divider />
        <Field label="Protocol" value={scan.protocol ?? '—'} />
        <Divider />
        <Field label="VIN" value={scan.vin ?? 'Not reported'} />
        <Divider />
        <Field label="Battery" value={scan.voltage !== null ? `${scan.voltage.toFixed(1)} V` : '—'} />
      </Panel>

      <View style={{ gap: space.small, marginTop: space.wide }}>
        <Button
          label="Export as CSV"
          tone="neutral"
          busy={sharing}
          onPress={async () => {
            setSharing(true);
            try {
              await exportScanCsv(scan);
            } finally {
              setSharing(false);
            }
          }}
        />
        <Button
          label="Delete this scan"
          tone="quiet"
          onPress={() =>
            Alert.alert('Delete this scan?', 'The record is removed from this phone. This cannot be undone.', [
              { text: 'Keep it', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await deleteScan(scan.id);
                  navigation.goBack();
                },
              },
            ])
          }
        />
      </View>
    </Screen>
  );
}
