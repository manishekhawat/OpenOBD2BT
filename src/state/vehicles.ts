/**
 * Vehicle profiles and the active selection.
 *
 * The app is usable with no profile at all — readings and fault codes do not
 * need one. A profile only adds the things that depend on knowing the vehicle:
 * tank size, weight for power estimates, and a saved dashboard layout.
 */

import { create } from 'zustand';

import {
  defaultDashboard,
  deleteVehicle as deleteVehicleRow,
  getDashboard,
  listVehicles,
  saveDashboard,
  saveVehicle,
  type DashboardSlot,
  type Vehicle,
} from '@/data/repo/vehicles';
import { useSettings } from './settings';

export interface VehiclesState {
  vehicles: Vehicle[];
  activeId: string | null;
  dashboard: DashboardSlot[];
  loaded: boolean;

  load: () => Promise<void>;
  setActive: (id: string | null) => Promise<void>;
  upsert: (vehicle: Vehicle) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setDashboard: (slots: DashboardSlot[]) => Promise<void>;
  active: () => Vehicle | null;
}

export const useVehicles = create<VehiclesState>((set, get) => ({
  vehicles: [],
  activeId: null,
  dashboard: [],
  loaded: false,

  async load() {
    const vehicles = await listVehicles();
    const stored = useSettings.getState().activeVehicleId;
    // Fall back to the first profile if the stored one has been deleted.
    const activeId =
      stored && vehicles.some((v) => v.id === stored) ? stored : vehicles[0]?.id ?? null;

    let dashboard: DashboardSlot[] = [];
    if (activeId) {
      dashboard = await getDashboard(activeId);
      const vehicle = vehicles.find((v) => v.id === activeId);
      if (dashboard.length === 0 && vehicle) {
        dashboard = defaultDashboard(vehicle.type);
        await saveDashboard(activeId, dashboard);
      }
    }

    set({ vehicles, activeId, dashboard, loaded: true });
  },

  async setActive(id) {
    useSettings.getState().set('activeVehicleId', id);
    let dashboard: DashboardSlot[] = [];
    if (id) {
      dashboard = await getDashboard(id);
      const vehicle = get().vehicles.find((v) => v.id === id);
      if (dashboard.length === 0 && vehicle) {
        dashboard = defaultDashboard(vehicle.type);
        await saveDashboard(id, dashboard);
      }
    }
    set({ activeId: id, dashboard });
  },

  async upsert(vehicle) {
    await saveVehicle(vehicle);
    const vehicles = await listVehicles();
    set({ vehicles });
    // A first profile becomes the active one straight away.
    if (!get().activeId) await get().setActive(vehicle.id);
  },

  async remove(id) {
    await deleteVehicleRow(id);
    const vehicles = await listVehicles();
    set({ vehicles });
    if (get().activeId === id) {
      await get().setActive(vehicles[0]?.id ?? null);
    }
  },

  async setDashboard(slots) {
    const id = get().activeId;
    if (!id) return;
    await saveDashboard(id, slots);
    set({ dashboard: slots });
  },

  active() {
    const { vehicles, activeId } = get();
    return vehicles.find((v) => v.id === activeId) ?? null;
  },
}));

/** A readable one-line description of a profile. */
export function describeVehicle(vehicle: Vehicle): string {
  const parts = [vehicle.make, vehicle.model, vehicle.year ? String(vehicle.year) : null]
    .filter(Boolean);
  if (parts.length === 0) {
    return vehicle.type.charAt(0).toUpperCase() + vehicle.type.slice(1);
  }
  return parts.join(' ');
}

export function newVehicleId(): string {
  return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
