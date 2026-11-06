/**
 * About.
 *
 * Says plainly what the app does, where its information comes from, and what
 * it does not do — which here includes collecting anything.
 */

import Constants from 'expo-constants';
import { View } from 'react-native';

import { allCatalogCodes } from '@/data/dtcCatalog';
import { PID_DEFINITIONS } from '@/obd/pids';

import {
  Body,
  Divider,
  Field,
  Label,
  Panel,
  Screen,
  SectionHeader,
  Title,
} from '../components/primitives';
import { space, type, usePalette } from '../theme';

export function AboutScreen() {
  const palette = usePalette();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen>
      <View style={{ paddingTop: space.gap, gap: space.small }}>
        <Title style={{ fontSize: type.heading }}>OBD Scout</Title>
        <Label>{`Version ${version}`}</Label>
      </View>

      <Panel style={{ marginTop: space.wide }}>
        <Body>
          A diagnostic tool for any vehicle with an OBD-II port — cars, vans, and the motorcycles and
          scooters that support the standard. It reads live sensor data, fault codes, freeze frames
          and emission readiness through an ELM327 adapter over Bluetooth, Bluetooth LE or Wi-Fi.
        </Body>
      </Panel>

      <SectionHeader>Privacy</SectionHeader>
      <Panel>
        <Body>
          There is no account and no server. Scans, trips, vehicle profiles and settings are stored
          on this phone and nowhere else. Satellite positions recorded during a trip stay on the
          phone too — no map tiles are downloaded, so a route is drawn from its own points. Nothing
          is uploaded, and the app works with no network connection at all.
        </Body>
      </Panel>

      <SectionHeader>Where the information comes from</SectionHeader>
      <Panel>
        <Body>
          Live parameter definitions and their scaling follow SAE J1979 / ISO 15031-5, the published
          standard that defines OBD-II. The standard specifies exactly one conversion per parameter,
          so these are facts rather than choices.
        </Body>
        <Divider />
        <Body style={{ marginTop: space.base }}>
          Fault code descriptions were written for this app, in plain language aimed at a driver.
          Codes the manufacturer defines rather than the standard — those with 1 or 3 as the first
          digit — are shown without a description, because guessing at their meaning would be worse
          than saying their documentation is needed. Every description names its own origin on the
          fault&apos;s own screen.
        </Body>
      </Panel>

      <SectionHeader>What it cannot do</SectionHeader>
      <Panel>
        <Body color={palette.muted}>
          It reads the standard OBD-II services, which covers the engine and emissions systems. ABS,
          airbag, gearbox and body modules mostly use manufacturer-specific protocols that the
          standard does not describe, so codes from those are read where the vehicle exposes them
          generically and otherwise are not available. Power and fuel figures derived from sensor
          data are estimates, and say so wherever they appear.
        </Body>
      </Panel>

      <SectionHeader>Built in</SectionHeader>
      <Panel>
        <Field label="Live parameters" value={String(PID_DEFINITIONS.length)} />
        <Divider />
        <Field label="Described fault codes" value={String(allCatalogCodes().length)} />
        <Divider />
        <Field label="Adapter types" value="Bluetooth, Bluetooth LE, Wi-Fi" />
        <Divider />
        <Field label="Protocols" value="CAN 11/29-bit, ISO 9141-2, KWP2000, J1850" />
      </Panel>

      <Panel tone="high" style={{ marginTop: space.wide }}>
        <Label style={{ lineHeight: 19 }}>
          Clearing fault codes erases evidence a mechanic may need, and resets the emission readiness
          monitors — which can mean failing an emissions test until the vehicle has been driven
          enough to run its checks again. Read the codes before clearing them.
        </Label>
      </Panel>
    </Screen>
  );
}
