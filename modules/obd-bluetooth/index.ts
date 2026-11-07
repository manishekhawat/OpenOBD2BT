/**
 * Bluetooth Classic serial link for ELM327 adapters.
 *
 * A thin wrapper over the native module in this folder. It exists because the
 * published libraries for Bluetooth Classic are built on React Native's old
 * bridge and end the process rather than returning an error under the
 * bridgeless runtime.
 *
 * `requireOptionalNativeModule` rather than the throwing version: a missing
 * module should disable Bluetooth, not prevent the app from starting.
 */

import { requireOptionalNativeModule } from 'expo-modules-core';

export interface PairedDevice {
  address: string;
  name: string;
}

export interface DataEvent {
  data: string;
}

export interface CloseEvent {
  reason: string;
}

/** Which of the three connection strategies actually worked. */
export type ConnectMode = 'secure' | 'insecure' | 'channel-1';

export interface Subscription {
  remove: () => void;
}

interface ObdBluetoothNativeModule {
  isSupported: () => boolean;
  isEnabled: () => boolean;
  hasPermission: () => boolean;
  listPaired: () => Promise<PairedDevice[]>;
  connect: (address: string, preferSecure: boolean) => Promise<{ mode: ConnectMode }>;
  write: (data: string) => Promise<void>;
  disconnect: () => Promise<void>;
  addListener: ((event: 'onData', listener: (payload: DataEvent) => void) => Subscription) &
    ((event: 'onClose', listener: (payload: CloseEvent) => void) => Subscription);
}

const native = requireOptionalNativeModule<ObdBluetoothNativeModule>('ObdBluetooth');

export function isAvailable(): boolean {
  return native !== null;
}

/** Throws a readable error rather than letting a null reference escape. */
function requireNative(): ObdBluetoothNativeModule {
  if (!native) {
    throw new Error(
      'The Bluetooth module is not present in this build. Bluetooth LE and Wi-Fi adapters still work.',
    );
  }
  return native;
}

export function isSupported(): boolean {
  try {
    return requireNative().isSupported();
  } catch {
    return false;
  }
}

export function isEnabled(): boolean {
  try {
    return requireNative().isEnabled();
  } catch {
    return false;
  }
}

export function hasPermission(): boolean {
  try {
    return requireNative().hasPermission();
  } catch {
    return false;
  }
}

export function listPaired(): Promise<PairedDevice[]> {
  return requireNative().listPaired();
}

export function connect(address: string, preferSecure = true): Promise<{ mode: ConnectMode }> {
  return requireNative().connect(address, preferSecure);
}

export function write(data: string): Promise<void> {
  return requireNative().write(data);
}

export function disconnect(): Promise<void> {
  return requireNative().disconnect();
}

export function onData(listener: (payload: DataEvent) => void): Subscription {
  return requireNative().addListener('onData', listener);
}

export function onClose(listener: (payload: CloseEvent) => void): Subscription {
  return requireNative().addListener('onClose', listener);
}
