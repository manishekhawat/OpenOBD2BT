/**
 * Look up a code.
 *
 * For a code someone has read elsewhere — off a workshop printout, another
 * tool, or a dashboard that flashes it. Works with no adapter connected.
 */

import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { allCatalogCodes, searchCatalog } from '@/data/dtcCatalog';

import {
  Body,
  Label,
  Panel,
  Screen,
  SectionHeader,
  Title,
} from '../components/primitives';
import { FaultRow } from '../components/FaultRow';
import { radius, space, type, usePalette } from '../theme';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function CodeLookupScreen() {
  const navigation = useNavigation<Nav>();
  const palette = usePalette();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (query.trim().length === 0) return allCatalogCodes().slice(0, 40);
    return searchCatalog(query);
  }, [query]);

  return (
    <Screen>
      <View style={{ paddingTop: space.gap, gap: space.base }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="P0301, or words like misfire"
          placeholderTextColor={palette.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          style={{
            backgroundColor: palette.panel,
            borderRadius: radius.tile,
            borderWidth: 1,
            borderColor: palette.line,
            color: palette.text,
            paddingHorizontal: space.gap,
            paddingVertical: 14,
            fontSize: type.lead,
          }}
        />
        <Label>
          Any complete code resolves, even one not in the catalogue — the app says what it can work
          out from the code&apos;s structure rather than inventing a description.
        </Label>
      </View>

      <SectionHeader>
        {query.trim().length === 0
          ? 'Described codes'
          : results.length === 0
            ? 'No match'
            : results.length === 1
              ? '1 match'
              : `${results.length} matches`}
      </SectionHeader>

      {results.length === 0 ? (
        <Panel>
          <Body color={palette.muted}>
            Nothing matched. If you have a complete code, type it in full — for example P0420 — and
            it will resolve whether or not the catalogue describes it.
          </Body>
        </Panel>
      ) : (
        <View style={{ gap: space.small }}>
          {results.map((info) => (
            <FaultRow
              key={info.code}
              code={info.code}
              title={info.title}
              action={info.action}
              onPress={() => navigation.navigate('FaultDetail', { code: info.code })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
