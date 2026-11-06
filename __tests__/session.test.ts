/**
 * End-to-end tests against the built-in simulator.
 *
 * These drive the whole stack — ELM327 command layer, ISO-TP framing, decoders
 * — rather than each piece in isolation, so a mistake in how the layers fit
 * together is caught as well as a mistake inside one of them.
 */

import { ObdSession } from '@/obd/session';
import { DemoTransport } from '@/obd/transports/demo';

jest.setTimeout(20000);

async function connected(): Promise<ObdSession> {
  const session = new ObdSession();
  await session.connect(new DemoTransport());
  return session;
}

describe('a session against the demo vehicle', () => {
  it('connects, negotiates a protocol and reports the adapter', async () => {
    const session = await connected();
    const status = session.getStatus();

    expect(status.state).toBe('ready');
    expect(status.vehicleSilent).toBe(false);
    expect(status.family).toBe('can11');
    expect(status.adapterIdentity).toContain('ELM327');
    expect(status.voltage).toBeGreaterThan(10);

    await session.disconnect();
  });

  it('discovers the parameters the vehicle supports', async () => {
    const session = await connected();

    expect(session.supportedPids).toContain(0x0c); // engine speed
    expect(session.supportedPids).toContain(0x0d); // vehicle speed
    expect(session.supportedPids).toContain(0x05); // coolant temperature
    // Block markers are not readable values.
    expect(session.supportedPids).not.toContain(0x00);
    expect(session.supportedPids).not.toContain(0x20);

    await session.disconnect();
  });

  it('reads a live value within its declared range', async () => {
    const session = await connected();

    const rpm = await session.readValue(0x0c);
    expect(rpm).not.toBeNull();
    expect(rpm!.value).toBeGreaterThan(0);
    expect(rpm!.value).toBeLessThan(16384);
    expect(rpm!.unit).toBe('rpm');

    const coolant = await session.readValue(0x05);
    expect(coolant!.value).toBeGreaterThan(-40);
    expect(coolant!.value).toBeLessThan(216);

    await session.disconnect();
  });

  it('reads the stored fault codes the simulator holds', async () => {
    const session = await connected();
    const result = await session.scanFaults();

    expect(result.stored.map((d) => d.code).sort()).toEqual(['P0171', 'P0301', 'P0420']);
    expect(result.pending.map((d) => d.code)).toEqual(['P0133']);
    expect(result.permanent).toHaveLength(0);

    await session.disconnect();
  });

  it('reads readiness with the lamp on and three faults', async () => {
    const session = await connected();
    const readiness = await session.readReadiness();

    expect(readiness).not.toBeNull();
    expect(readiness!.milOn).toBe(true);
    expect(readiness!.dtcCount).toBe(3);
    expect(readiness!.ignition).toBe('spark');

    await session.disconnect();
  });

  it('clears the codes and confirms by re-reading', async () => {
    const session = await connected();

    const before = await session.scanFaults();
    expect(before.stored.length).toBe(3);

    const outcome = await session.clearFaults();
    expect(outcome.cleared).toBe(true);
    expect(outcome.remaining).toHaveLength(0);

    const after = await session.scanFaults();
    expect(after.stored).toHaveLength(0);
    expect(after.readiness?.milOn).toBe(false);

    await session.disconnect();
  });

  it('reads the VIN over Mode 09', async () => {
    const session = await connected();

    expect(session.vehicleInfo?.vin).toBe('MA1TA2YS3P4567890');
    expect(session.vehicleInfo?.ecuName).toBe('ECM-EngineControl');

    await session.disconnect();
  });

  it('reads a freeze frame that differs from the live values', async () => {
    const session = await connected();
    const frame = await session.readFreezeFrame(0);

    expect(frame.length).toBeGreaterThan(0);
    const coolant = frame.find((r) => r.pid === 0x05);
    expect(coolant?.value).toBe(91); // the frozen snapshot, not the warming engine

    await session.disconnect();
  });

  it('polls several parameters and stops cleanly', async () => {
    const session = await connected();

    const seen: number[] = [];
    const stop = session.startPolling([0x0c, 0x0d, 0x05], (reading) => {
      seen.push(reading.pid);
    });

    await new Promise((resolve) => setTimeout(resolve, 1200));
    stop();
    session.stopPolling();

    expect(seen.length).toBeGreaterThan(2);
    expect(new Set(seen).size).toBeGreaterThan(1);

    await session.disconnect();
  });

  it('refuses to read once disconnected rather than hanging', async () => {
    const session = await connected();
    await session.disconnect();

    expect(session.isReady()).toBe(false);
    expect(await session.readValue(0x0c)).toBeNull();
  });
});
