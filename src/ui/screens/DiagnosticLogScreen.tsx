/**
 * Diagnostic log.
 *
 * Everything the app did this session and last, written to disk as it happened.
 * The point is the last line before a crash: because writes are synchronous,
 * whatever appears last is the last thing the app managed to do, which names
 * where it died.
 *
 * If the previous session ended without shutting down properly, that is said
 * plainly at the top along with the line it stopped on.
 */

import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import {
  clearLogs,
  currentLines,
  fullLogText,
  previousSessionCrashed,
  previousSessionLastLine,
  type LogLine,
} from '@/features/log';

import {
  Body,
  Button,
  Label,
  Panel,
  Row,
  Screen,
  Title,
} from '../components/primitives';
import { radius, space, type, usePalette } from '../theme';

export function DiagnosticLogScreen() {
  const palette = usePalette();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [sharing, setSharing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setLines([...currentLines()]);
    }, []),
  );

  const crashed = previousSessionCrashed();
  const lastLine = previousSessionLastLine();

  const share = async () => {
    setSharing(true);
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const target = new File(Paths.cache, `obd-scout-log-${stamp}.txt`);
      target.create({ overwrite: true });
      await target.write(fullLogText());

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target.uri, {
          mimeType: 'text/plain',
          dialogTitle: 'Diagnostic log',
        });
      }
    } catch (err) {
      Alert.alert(
        'Could not share the log',
        err instanceof Error ? err.message : 'The file could not be written.',
      );
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen scroll={false}>
      <View style={{ paddingTop: space.gap, gap: space.small }}>
        <Title>Diagnostic log</Title>
        <Label>
          Written to the phone as each step happens, so it survives the app closing. Nothing is
          uploaded — sharing is yours to do.
        </Label>
      </View>

      {crashed ? (
        <Panel style={{ marginTop: space.gap, borderColor: palette.red, gap: space.small }}>
          <Title style={{ fontSize: type.lead, color: palette.red }}>
            The previous session ended unexpectedly
          </Title>
          <Body color={palette.muted}>
            It stopped without shutting down properly. The last thing it recorded was:
          </Body>
          {lastLine ? (
            <Text
              selectable
              style={{
                color: palette.text,
                backgroundColor: palette.panelHigh,
                padding: space.small,
                borderRadius: radius.inset,
                fontSize: 12,
                lineHeight: 18,
              }}
            >
              {lastLine}
            </Text>
          ) : null}
          <Body color={palette.muted}>
            Sharing this log includes that session in full.
          </Body>
        </Panel>
      ) : null}

      <Button
        label={sharing ? 'Preparing' : 'Share the log'}
        onPress={() => void share()}
        tone="primary"
        busy={sharing}
        style={{ marginTop: space.gap }}
      />

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
        {lines.length === 0 ? (
          <Label>Nothing recorded yet this session.</Label>
        ) : (
          lines.map((line, index) => (
            <Row key={`${line.at}-${index}`} gap={space.small} align="flex-start" style={{ paddingVertical: 1 }}>
              <Label style={{ color: palette.muted, fontSize: 11, width: 58 }}>
                {new Date(line.at).toISOString().slice(11, 19)}
              </Label>
              <Label style={{ color: colourFor(line.level, palette), fontSize: 11, flex: 1 }}>
                {`[${line.tag}] ${line.message}`}
              </Label>
            </Row>
          ))
        )}
      </ScrollView>

      <Row gap={space.small} style={{ marginTop: space.base }}>
        <Button
          label="Refresh"
          tone="neutral"
          style={{ flex: 1 }}
          onPress={() => setLines([...currentLines()])}
        />
        <Button
          label="Clear"
          tone="quiet"
          style={{ flex: 1 }}
          onPress={() =>
            Alert.alert('Clear the log?', 'Both this session and the previous one are removed.', [
              { text: 'Keep it', style: 'cancel' },
              {
                text: 'Clear',
                style: 'destructive',
                onPress: () => {
                  clearLogs();
                  setLines([]);
                },
              },
            ])
          }
        />
      </Row>
    </Screen>
  );
}

function colourFor(level: LogLine['level'], palette: ReturnType<typeof usePalette>): string {
  switch (level) {
    case 'error':
      return palette.red;
    case 'warn':
      return palette.amber;
    case 'tx':
      return palette.blue;
    case 'rx':
      return palette.text;
    default:
      return palette.muted;
  }
}
