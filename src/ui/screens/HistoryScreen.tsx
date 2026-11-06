/**
 * Scan history.
 *
 * Every scan is kept, which is what makes a recurring fault visible: the same
 * code appearing across weeks is a different problem from one seen once.
 */

import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { listScans, type SavedScanSummary } from '@/data/repo/scans';
import { formatTimestamp } from '@/features/units';

import {
  Divider,
  EmptyState,
  Label,
  Panel,
  Reading,
  Row,
  Screen,
  Tappable,
  Title,
} from '../components/primitives';
import { space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HistoryScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();
  const [scans, setScans] = useState<SavedScanSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      listScans().then(setScans).catch(() => undefined);
    }, []),
  );

  if (scans.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="No saved scans yet"
          body="Every scan is saved here automatically, so you keep a record even after clearing the codes."
          actionLabel="Run a scan"
          onAction={() => navigation.navigate('Tabs')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ paddingTop: space.gap, gap: space.small }}>
        <Title>Scan history</Title>
        <Label>{`${scans.length} saved on this phone`}</Label>
      </View>

      <Panel style={{ marginTop: space.gap, padding: 0 }}>
        {scans.map((scan, index) => {
          const accent =
            scan.dtcCount === 0 ? palette.green : scan.milOn ? palette.amber : palette.blue;
          return (
            <View key={scan.id}>
              {index > 0 ? <Divider inset={space.gap} /> : null}
              <Tappable
                onPress={() => navigation.navigate('ScanDetail', { scanId: scan.id })}
                accessibilityLabel={`Scan from ${formatTimestamp(scan.startedAt)}`}
              >
                <Row justify="space-between" style={{ padding: space.gap }} gap={space.gap}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Title style={{ fontSize: type.body }}>{formatTimestamp(scan.startedAt)}</Title>
                    <Label numberOfLines={1}>
                      {[
                        scan.dtcCount === 0
                          ? 'No faults'
                          : `${scan.dtcCount} fault${scan.dtcCount === 1 ? '' : 's'}`,
                        scan.milOn ? 'lamp on' : null,
                        scan.clearedAt ? 'cleared' : null,
                        scan.adapter,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Label>
                  </View>
                  <Reading
                    value={String(scan.dtcCount)}
                    size={type.title}
                    color={accent}
                    align="right"
                  />
                </Row>
              </Tappable>
            </View>
          );
        })}
      </Panel>
    </Screen>
  );
}
