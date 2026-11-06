/**
 * One fault, in full.
 *
 * Leads with what it means and whether the vehicle can be driven, then the
 * likely causes. The provenance line at the bottom is deliberate: a description
 * generated from the code's structure is not the same as one written for that
 * specific code, and the reader deserves to know which they are looking at.
 */

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';

import { actionLabel, driveLabel, lookupDtc, type DtcInfo } from '@/data/dtcCatalog';
import { isGenericCode, powertrainArea, systemName } from '@/obd/dtc';
import { codeHistory } from '@/data/repo/scans';
import { formatTimestamp } from '@/features/units';

import {
  Body,
  Chip,
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
import { actionBackground, actionColor, driveColor, space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

export function FaultDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'FaultDetail'>>();
  const palette = usePalette();
  const code = route.params.code;
  const info = lookupDtc(code);

  const [seen, setSeen] = useState<{ scanId: number; at: number }[]>([]);
  useEffect(() => {
    codeHistory(code).then(setSeen).catch(() => undefined);
  }, [code]);

  const accent = actionColor(info.action, palette);

  return (
    <Screen>
      <View style={{ paddingTop: space.gap, gap: space.base }}>
        <Reading value={code} size={type.display} color={accent} />
        <Title numberOfLines={3}>{info.title}</Title>

        <Row gap={space.small} style={{ flexWrap: 'wrap' }}>
          <Chip
            label={actionLabel(info.action)}
            color={accent}
            background={actionBackground(info.action, palette)}
          />
          <Chip
            label={driveLabel(info.drive)}
            color={driveColor(info.drive, palette)}
            background={palette.panelHigh}
          />
          <Chip label={systemName(code[0] === 'C' || code[0] === 'B' || code[0] === 'U' ? (code[0] as never) : 'P')} />
        </Row>
      </View>

      <SectionHeader>What it means</SectionHeader>
      <Panel>
        <Body>{info.meaning}</Body>
      </Panel>

      {info.causes.length > 0 ? (
        <>
          <SectionHeader>Common causes</SectionHeader>
          <Panel style={{ paddingVertical: space.small }}>
            {info.causes.map((cause, index) => (
              <View key={cause}>
                {index > 0 ? <Divider /> : null}
                <Row gap={space.base} align="flex-start" style={{ paddingVertical: space.base }}>
                  <View
                    style={{
                      width: 6, height: 6, borderRadius: 3,
                      backgroundColor: accent, marginTop: 7,
                    }}
                  />
                  <Body style={{ flex: 1 }}>{cause}</Body>
                </Row>
              </View>
            ))}
          </Panel>
          <Label style={{ marginTop: space.small }}>
            Listed roughly most-likely first. They are starting points for diagnosis, not a
            diagnosis — the same code can have different causes on different vehicles.
          </Label>
        </>
      ) : null}

      {seen.length > 1 ? (
        <>
          <SectionHeader>Seen before</SectionHeader>
          <Panel>
            <Body color={palette.muted} style={{ marginBottom: space.small }}>
              {`This code has appeared in ${seen.length} scans on this phone. A fault that keeps returning after clearing is active, not historic.`}
            </Body>
            {seen.slice(0, 6).map((entry) => (
              <Field key={entry.scanId} label={formatTimestamp(entry.at)} value="" />
            ))}
          </Panel>
        </>
      ) : null}

      <SectionHeader>About this code</SectionHeader>
      <Panel>
        <Field label="Code" value={code} />
        <Divider />
        <Field label="System" value={systemName(code[0] === 'C' || code[0] === 'B' || code[0] === 'U' ? (code[0] as never) : 'P')} />
        {powertrainArea(code) ? (
          <>
            <Divider />
            <Field label="Area" value={powertrainArea(code) ?? ''} />
          </>
        ) : null}
        <Divider />
        <Field label="Defined by" value={isGenericCode(code) ? 'The OBD-II standard' : 'The manufacturer'} />
      </Panel>

      <Provenance info={info} />
    </Screen>
  );
}

/** Say where the description came from, plainly. */
function Provenance({ info }: { info: DtcInfo }) {
  const palette = usePalette();

  const text =
    info.source === 'catalog'
      ? 'This description was written for this code. The code itself is read straight from the vehicle.'
      : info.source === 'generated'
        ? 'This description is built from the pattern the standard defines for this family of codes, so the cylinder or sensor it names is reliable, but the wording is general rather than specific to your vehicle.'
        : info.source === 'manufacturer'
          ? 'No description is shown because the manufacturer defines what this code means. The code itself was read correctly from the vehicle — only its wording needs their service documentation.'
          : 'A full description for this code is not in the catalogue. The code itself is read straight from the vehicle; check it against your service information.';

  return (
    <Panel tone="high" style={{ marginTop: space.wide }}>
      <Label style={{ color: palette.muted, lineHeight: 19 }}>{text}</Label>
    </Panel>
  );
}
