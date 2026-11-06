# OBD Scout

An OBD-II diagnostics app for Android, in React Native. Reads live sensor data,
fault codes, freeze frames and emission readiness from any vehicle with a
diagnostic port, through an ELM327 adapter over Bluetooth, Bluetooth LE or Wi-Fi.

**No account, no sign-in, no payment.** The app opens straight onto the home
screen and every screen is reachable immediately. There is no server: scans,
trips, vehicles and settings live on the phone and nothing is uploaded.

## Building it

The APK is not pre-compiled: the environment this was written in has no Android
SDK and blocks `dl.google.com`, so there was no way to produce one. The project
itself is complete, type-checked and tested.

### Cloud build — no Android Studio needed

Easiest if you do not already have the Android SDK. Needs only Node and a free
Expo account; the build runs on Expo's servers and ends with a download link.

```bash
npm install
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

`eas.json` is already configured — the `preview` profile produces a plain
**APK** you can sideload, rather than an App Bundle for the Play Store.

### Local build

Needs Node 20+, JDK 17 and the Android SDK (API 36) with `ANDROID_HOME` set.

```bash
npm install
npx expo run:android          # debug build onto a connected phone
```

For a release APK:

```bash
cd android && ./gradlew assembleRelease
# app/build/outputs/apk/release/app-release.apk
```

`android/` is already generated, so prebuild is not needed. Several native
modules are used, so Expo Go will not run this — `expo run:android` builds a dev
client, which is the intended workflow.

Verify before building:

```bash
npm run typecheck   # tsc --noEmit
npm test            # 53 tests
```

## Trying it without an adapter

Connect → **Demo** starts a simulated vehicle that answers exactly as a real one
does: live readings on a repeating drive cycle, three stored faults (P0301,
P0420, P0171), a pending code, a freeze frame, readiness monitors and a VIN.
Every screen works against it. The test suite drives the same simulator, so the
decoding path is covered end to end rather than only in isolation.

## Connecting a real adapter

**Find my adapter** tries paired Bluetooth Classic devices, then Bluetooth LE,
then the common Wi-Fi addresses, and connects to whichever answers.

A note on the commonest problem, *pairs but will not connect*:

- **Bluetooth Classic** adapters (sold as "Bluetooth 2.1/3.0, Android only")
  often ship a malformed SDP record, so Android's normal secure RFCOMM connect
  fails even though the device is paired. This app tries secure first and falls
  back to **insecure RFCOMM on channel 1**, which is what rescues most clones.
- **Bluetooth LE** adapters (sold as "Bluetooth 4.0", "BLE", "iOS compatible")
  speak GATT, not serial. Android will pair them but a Classic connect can never
  succeed — use the Bluetooth LE tab. There is no standard for serial-over-GATT,
  so the BLE transport discovers services and picks a notify/write pair,
  preferring known UUIDs (`FFE0/FFE1`, `FFF0/FFF1+FFF2`, `18F0/2AF0+2AF1`) and
  otherwise falling back to any usable pair it finds.
- An ELM327 accepts **one connection at a time**. Another app or a second phone
  holding it locks everyone else out.
- Some adapters need the **ignition on** before they open the serial link.

If it still misbehaves, **More → Adapter log** shows the raw conversation and
can be shared as a text file.

## What it does

| Screen | |
|---|---|
| Home | Verdict first — faults, whether it is safe to drive, battery voltage, readings at a glance |
| Live | Gauge dashboard, the full reading list grouped by system, and a multi-series plot |
| Head-up | One huge mirrored number for the windscreen |
| Faults | Stored, pending and permanent codes; clear with before/after verification |
| Fault detail | What it means, likely causes, drive advice, how often it has recurred |
| Freeze frame | Conditions captured when the fault was recorded |
| Readiness | Emission self-check status, petrol and diesel monitor sets |
| Trips | GPS + OBD recording, route, CSV and GPX export |
| Performance | 0–60, 0–100, 60–100, standing 400 m, power and torque estimates |
| Fuel | Fill-up log, economy, calibration of the app's own estimate |
| Alarms | Threshold warnings per vehicle |
| History | Every saved scan, with CSV export |
| Vehicles | Profiles: type, engine size, fuel, tank, kerb weight |
| Code lookup | Search any code, works offline with no adapter |

## How it is put together

```
src/obd/          Protocol layer — no UI, no storage
  elm327.ts         Command/response discipline, prompt-terminated, serialised
  framing.ts        ISO-TP reassembly, multi-ECU grouping, protocol families
  pids.ts           SAE J1979 parameter definitions and scaling
  dtc.ts            Fault code bit decoding
  monitors.ts       Readiness bit layout, spark and compression ignition
  vehicleInfo.ts    Mode 09, VIN check digit
  session.ts        Connect, discover, poll, scan, clear
  transports/       Bluetooth Classic, BLE, Wi-Fi, demo simulator
src/data/         SQLite schema, repositories, fault code catalogue
src/features/     Fuel, performance, trips, units, exports
src/state/        Zustand stores
src/ui/           Theme, components, screens, navigation
```

The protocol layer knows nothing about React, which is why it can be tested
directly against the simulator.

### Decoding notes

- **Protocol detection drives framing.** `ATDPN` is read after the first
  successful exchange (`ATSP0` only resolves the real protocol once something
  has answered), and the result selects header length and whether ISO-TP PCI
  bytes or a trailing checksum need stripping.
- **Multi-ECU answers are kept apart.** Several modules reply to `0100` on a
  car; responses are grouped by header and the supported-PID set is their union.
- **Mode 03 differs by protocol.** CAN prefixes the DTC list with a count byte
  and the others do not; both shapes are handled.
- **Polling is rate-classed.** Revs and speed are read every tick, temperatures
  every third, counters every tenth — an ELM327 answers one request at a time,
  so this is what keeps the fast readings responsive.

### Fault code descriptions

Written for this app, in plain language aimed at a driver. Three layers:

1. A hand-written table of generic codes.
2. Generators for the ranges the standard defines by repetition — per-cylinder
   misfires and injectors, ignition coils, oxygen sensors by bank and position.
3. A structural fallback that says what the code's range means without inventing
   a cause.

Manufacturer-specific codes (first digit 1 or 3) are **never guessed at** — the
standard leaves their meaning to the maker, so the app says so. Every fault
screen names where its description came from.

### Estimates are labelled as estimates

Fuel consumption prefers the vehicle's own PID 5E figure, falls back to mass air
flow, and finally to speed-density from manifold pressure and engine size. The
screen says which of the three it used. Power is derived from acceleration
against mass, drag and rolling resistance, and is not shown at all without a
kerb weight in the vehicle profile.

## Data sources

Parameter definitions and scaling follow **SAE J1979 / ISO 15031-5**, which
specifies exactly one conversion per parameter. Fault code descriptions are
original to this app.

## Licence

Yours. No third-party content is bundled.
