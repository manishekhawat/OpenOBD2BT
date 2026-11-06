/**
 * Trip recording.
 *
 * Samples speed and revs from the vehicle and position from the phone, buffers
 * them, and writes to the database in batches. Distance is taken from the
 * vehicle's own speed signal rather than from GPS, because the speedometer
 * keeps working in tunnels and multi-storey car parks where satellites do not.
 */

import * as Location from 'expo-location';
import { create } from 'zustand';

import { appendPoints, finishTrip, startTrip, type TripPoint } from '@/data/repo/trips';
import { session } from '@/obd/session';
import { fuelRate, integrateLitres } from './fuel';
import { useSettings } from '@/state/settings';
import { useVehicles } from '@/state/vehicles';

/** Write to the database at this interval rather than per sample. */
const FLUSH_MS = 10_000;
const SAMPLE_MS = 1000;

export interface TripRecorderState {
  tripId: number | null;
  recording: boolean;
  startedAt: number | null;
  distanceKm: number;
  maxSpeedKmh: number;
  pointCount: number;
  litresUsed: number;
  hasLocation: boolean;
  error: string | null;

  start: () => Promise<void>;
  stop: () => Promise<number | null>;
}

let sampleTimer: ReturnType<typeof setInterval> | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let locationSub: Location.LocationSubscription | null = null;
let buffer: TripPoint[] = [];
let lastSampleAt: number | null = null;
let lastPosition: Location.LocationObject | null = null;
let fuelSamples: { at: number; litresPerHour: number }[] = [];

export const useTripRecorder = create<TripRecorderState>((set, get) => ({
  tripId: null,
  recording: false,
  startedAt: null,
  distanceKm: 0,
  maxSpeedKmh: 0,
  pointCount: 0,
  litresUsed: 0,
  hasLocation: false,
  error: null,

  async start() {
    if (get().recording) return;
    if (!session.isReady()) {
      set({ error: 'Connect to the vehicle before recording a trip.' });
      return;
    }

    // Location is optional: without it the trip still records speed and revs,
    // it simply has no route to draw.
    let hasLocation = false;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      hasLocation = status === 'granted';
    } catch {
      hasLocation = false;
    }

    const tripId = await startTrip(useVehicles.getState().activeId);

    buffer = [];
    fuelSamples = [];
    lastSampleAt = null;
    lastPosition = null;

    if (hasLocation) {
      locationSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 3 },
        (position) => {
          lastPosition = position;
        },
      );
    }

    sampleTimer = setInterval(() => void sample(set, get), SAMPLE_MS);
    flushTimer = setInterval(() => void flush(tripId), FLUSH_MS);

    set({
      tripId,
      recording: true,
      startedAt: Date.now(),
      distanceKm: 0,
      maxSpeedKmh: 0,
      pointCount: 0,
      litresUsed: 0,
      hasLocation,
      error: null,
    });
  },

  async stop() {
    const { tripId, startedAt, distanceKm, maxSpeedKmh, pointCount, litresUsed } = get();
    if (!tripId) return null;

    if (sampleTimer) clearInterval(sampleTimer);
    if (flushTimer) clearInterval(flushTimer);
    sampleTimer = null;
    flushTimer = null;
    locationSub?.remove();
    locationSub = null;

    await flush(tripId);

    const durationS = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
    const movingHours = durationS / 3600;

    await finishTrip(tripId, {
      distanceKm,
      durationS,
      maxSpeedKmh,
      avgSpeedKmh: movingHours > 0 ? distanceKm / movingHours : 0,
      fuelUsedL: litresUsed > 0 ? litresUsed : null,
      pointCount,
    });

    set({ tripId: null, recording: false, startedAt: null });
    return tripId;
  },
}));

async function sample(
  set: (partial: Partial<TripRecorderState>) => void,
  get: () => TripRecorderState,
): Promise<void> {
  if (!session.isReady()) return;

  const now = Date.now();
  const speedReading = await session.readValue(0x0d);
  const rpmReading = await session.readValue(0x0c);
  const speedKmh = speedReading?.value ?? null;

  // Integrate the vehicle's own speed for distance.
  const state = get();
  let distanceKm = state.distanceKm;
  if (speedKmh !== null && lastSampleAt !== null) {
    const hours = (now - lastSampleAt) / 3_600_000;
    if (hours > 0 && hours < 0.01) distanceKm += speedKmh * hours;
  }
  lastSampleAt = now;

  // Fuel, when the vehicle gives enough to work it out.
  const mafReading = await session.readValue(0x10).catch(() => null);
  const rate = fuelRate({
    fuelRateLh: null,
    mafGs: mafReading?.value ?? null,
    rpm: rpmReading?.value ?? null,
    fuelType: useVehicles.getState().active()?.fuelType ?? null,
    calibration: calibrationForActiveVehicle(),
  });
  if (rate) fuelSamples.push({ at: now, litresPerHour: rate.litresPerHour });

  buffer.push({
    tMs: now,
    lat: lastPosition?.coords.latitude ?? null,
    lon: lastPosition?.coords.longitude ?? null,
    alt: lastPosition?.coords.altitude ?? null,
    speedKmh,
    rpm: rpmReading?.value ?? null,
  });

  set({
    distanceKm,
    maxSpeedKmh: Math.max(state.maxSpeedKmh, speedKmh ?? 0),
    pointCount: state.pointCount + 1,
    litresUsed: integrateLitres(fuelSamples),
  });
}

async function flush(tripId: number): Promise<void> {
  if (buffer.length === 0) return;
  const pending = buffer;
  buffer = [];
  await appendPoints(tripId, pending).catch(() => undefined);
}

function calibrationForActiveVehicle(): number | undefined {
  const vehicleId = useVehicles.getState().activeId;
  if (!vehicleId) return undefined;
  return useSettings.getState().fuelCalibration[vehicleId];
}
