/**
 * Generic OBD-II fault code descriptions.
 *
 * Written for this app in plain language, aimed at a driver rather than a
 * workshop. Codes are stored as compact rows to keep the table readable:
 *
 *   [code, title, meaning, causes (pipe-separated), severity, driveability]
 *
 * severity:     i = information   m = monitor   s = service soon
 *               u = urgent        x = stop driving
 * driveability: o = fine to drive  c = drive with care  n = do not drive
 *
 * Only standard (generic) codes belong here. Manufacturer-specific codes —
 * anything with 1 or 3 as the first digit — are deliberately absent, because
 * guessing at them would be worse than saying the make's documentation is
 * needed. See dtcCatalog.ts for how those are handled.
 */

export type Severity = 'i' | 'm' | 's' | 'u' | 'x';
export type Driveability = 'o' | 'c' | 'n';

export type DtcRow = readonly [
  code: string,
  title: string,
  meaning: string,
  causes: string,
  severity: Severity,
  driveability: Driveability,
];

export const DTC_ROWS: readonly DtcRow[] = [
  // --- Variable valve timing and camshaft correlation ---------------------
  ['P0010', 'Camshaft position actuator circuit, bank 1', 'The electrical circuit that adjusts valve timing on bank 1 is not behaving as the engine computer expects.', 'Faulty camshaft timing solenoid|Wiring or connector damage at the solenoid|Low or dirty engine oil', 's', 'c'],
  ['P0011', 'Camshaft timing over-advanced, bank 1', 'Valve timing on bank 1 is further ahead than commanded, so the engine is not breathing as designed.', 'Low or dirty engine oil restricting the timing actuator|Stuck camshaft timing solenoid|Worn timing chain or tensioner', 's', 'c'],
  ['P0012', 'Camshaft timing over-retarded, bank 1', 'Valve timing on bank 1 is lagging behind what was commanded.', 'Low or dirty engine oil|Stuck or faulty camshaft timing solenoid|Worn timing chain', 's', 'c'],
  ['P0014', 'Exhaust camshaft timing over-advanced, bank 1', 'Exhaust valve timing on bank 1 is ahead of the commanded position.', 'Dirty or low engine oil|Faulty exhaust camshaft solenoid|Timing chain wear', 's', 'c'],
  ['P0016', 'Crankshaft and camshaft position do not agree, bank 1', 'The crankshaft and camshaft sensors disagree about engine position, so the computer cannot trust its timing reference.', 'Stretched or jumped timing chain|Faulty camshaft or crankshaft sensor|Camshaft timing actuator fault', 'u', 'c'],
  ['P0017', 'Crankshaft and exhaust camshaft position do not agree, bank 1', 'The crankshaft and exhaust camshaft sensors disagree about engine position.', 'Timing chain stretch or a jumped tooth|Faulty camshaft sensor|Oil control valve fault', 'u', 'c'],

  // --- Oxygen sensor heaters ---------------------------------------------
  ['P0030', 'Oxygen sensor heater circuit, bank 1 sensor 1', 'The heater inside the first oxygen sensor is not responding, so the sensor takes too long to start working.', 'Failed oxygen sensor heater element|Blown fuse or damaged wiring|Corroded sensor connector', 'm', 'o'],
  ['P0031', 'Oxygen sensor heater circuit low, bank 1 sensor 1', 'The oxygen sensor heater circuit is reading lower voltage than it should.', 'Short to ground in the heater wiring|Failed sensor heater|Connector corrosion', 'm', 'o'],
  ['P0032', 'Oxygen sensor heater circuit high, bank 1 sensor 1', 'The oxygen sensor heater circuit is reading higher voltage than it should.', 'Short to power in the heater wiring|Failed oxygen sensor|Damaged connector', 'm', 'o'],
  ['P0036', 'Oxygen sensor heater circuit, bank 1 sensor 2', 'The heater in the oxygen sensor after the catalytic converter is not responding.', 'Failed sensor heater element|Blown fuse or wiring damage|Corroded connector', 'm', 'o'],

  // --- Air and fuel metering sensors --------------------------------------
  ['P0068', 'Air flow and throttle position do not agree', 'The amount of air measured does not match what the throttle opening suggests, so one of the readings is wrong.', 'Large vacuum or intake leak|Faulty MAF or MAP sensor|Throttle position sensor fault', 's', 'c'],
  ['P0071', 'Ambient air temperature sensor range or performance', 'The outside air temperature reading is implausible.', 'Faulty ambient temperature sensor|Wiring or connector damage', 'i', 'o'],
  ['P0087', 'Fuel rail pressure too low', 'Fuel pressure at the injectors is below what the engine computer commanded.', 'Failing fuel pump|Blocked fuel filter|Leaking pressure regulator or injector', 'u', 'c'],
  ['P0088', 'Fuel rail pressure too high', 'Fuel pressure at the injectors is above the commanded value.', 'Faulty fuel pressure regulator|Blocked return line|Fuel pressure sensor fault', 'u', 'c'],
  ['P0089', 'Fuel pressure regulator performance', 'The fuel pressure regulator is not holding the pressure it is asked to.', 'Worn fuel pressure regulator|Blocked fuel filter|Weak fuel pump', 's', 'c'],

  ['P0100', 'Mass air flow sensor circuit', 'The sensor that measures incoming air is not giving a usable signal.', 'Dirty or failed MAF sensor|Damaged wiring or loose connector|Air leak after the sensor', 's', 'c'],
  ['P0101', 'Mass air flow sensor range or performance', 'The air flow reading is present but does not match the engine’s operating conditions.', 'Dirty MAF sensor element|Air filter blocked or badly fitted|Intake leak between the sensor and the engine', 's', 'c'],
  ['P0102', 'Mass air flow sensor circuit low', 'The air flow sensor is reporting less air than is physically plausible.', 'Dirty or failed MAF sensor|Blocked air filter|Short to ground in the sensor wiring', 's', 'c'],
  ['P0103', 'Mass air flow sensor circuit high', 'The air flow sensor is reporting more air than is plausible.', 'Failed MAF sensor|Wiring short to power|Intake leak', 's', 'c'],
  ['P0105', 'Manifold absolute pressure sensor circuit', 'The intake manifold pressure sensor is not giving a usable reading, so the computer cannot judge engine load.', 'Faulty MAP sensor|Cracked or disconnected vacuum hose|Wiring or connector damage', 's', 'c'],
  ['P0106', 'Manifold pressure sensor range or performance', 'The manifold pressure reading does not match engine conditions.', 'Vacuum leak|Faulty MAP sensor|Blocked vacuum passage', 's', 'c'],
  ['P0107', 'Manifold pressure sensor circuit low', 'Manifold pressure is reading lower than physically possible.', 'Short to ground in sensor wiring|Failed MAP sensor|Disconnected vacuum line', 's', 'c'],
  ['P0108', 'Manifold pressure sensor circuit high', 'Manifold pressure is reading higher than physically possible.', 'Failed MAP sensor|Short to power in wiring|Blocked vacuum hose', 's', 'c'],
  ['P0110', 'Intake air temperature sensor circuit', 'The intake air temperature reading is not usable.', 'Faulty intake air temperature sensor|Damaged wiring or connector', 'm', 'o'],
  ['P0111', 'Intake air temperature sensor range or performance', 'The intake air temperature reading is implausible for the conditions.', 'Faulty sensor|Sensor contaminated with oil or dirt|Wiring fault', 'm', 'o'],
  ['P0112', 'Intake air temperature circuit low', 'The intake air temperature sensor is reading at the bottom of its range.', 'Short to ground in sensor wiring|Failed sensor', 'm', 'o'],
  ['P0113', 'Intake air temperature circuit high', 'The intake air temperature sensor is reading at the top of its range.', 'Open circuit or disconnected sensor|Failed sensor|Corroded connector', 'm', 'o'],
  ['P0115', 'Engine coolant temperature sensor circuit', 'The coolant temperature reading is not usable, so the computer cannot fuel the engine correctly.', 'Faulty coolant temperature sensor|Damaged wiring or connector|Poor earth connection', 's', 'c'],
  ['P0116', 'Coolant temperature sensor range or performance', 'The coolant temperature reading is present but does not change as expected.', 'Faulty coolant temperature sensor|Stuck thermostat|Low coolant level', 's', 'c'],
  ['P0117', 'Coolant temperature circuit low', 'The coolant sensor is reading at the bottom of its range, which usually means a short.', 'Short to ground in the sensor wiring|Failed sensor', 's', 'c'],
  ['P0118', 'Coolant temperature circuit high', 'The coolant sensor is reading at the top of its range, which usually means an open circuit.', 'Disconnected or open sensor circuit|Failed sensor|Corroded connector', 's', 'c'],
  ['P0120', 'Throttle position sensor A circuit', 'The computer cannot get a reliable reading of how far the throttle is open.', 'Worn throttle position sensor|Damaged wiring or loose connector|Sensor out of position on the throttle body', 'u', 'c'],
  ['P0121', 'Throttle position sensor A range or performance', 'The throttle reading does not match other engine signals.', 'Dirty or worn throttle body|Faulty throttle position sensor|Carbon build-up on the throttle plate', 's', 'c'],
  ['P0122', 'Throttle position sensor A circuit low', 'The throttle sensor is reading below its normal range.', 'Short to ground in sensor wiring|Failed sensor|Loose connector', 'u', 'c'],
  ['P0123', 'Throttle position sensor A circuit high', 'The throttle sensor is reading above its normal range.', 'Short to power in sensor wiring|Failed sensor', 'u', 'c'],
  ['P0125', 'Engine not warming up enough for closed-loop fuelling', 'The engine is taking too long to reach operating temperature, so it keeps running on a rich warm-up mixture.', 'Stuck-open thermostat|Faulty coolant temperature sensor|Low coolant level', 'm', 'o'],
  ['P0128', 'Coolant thermostat below regulating temperature', 'The engine is not reaching its normal running temperature in the expected time.', 'Thermostat stuck open|Faulty coolant temperature sensor|Low coolant', 'm', 'o'],

  // --- Oxygen sensors ------------------------------------------------------
  ['P0130', 'Oxygen sensor circuit, bank 1 sensor 1', 'The main oxygen sensor is not giving a usable signal, so fuelling cannot be trimmed accurately.', 'Failed oxygen sensor|Exhaust leak before the sensor|Damaged wiring or connector', 's', 'c'],
  ['P0131', 'Oxygen sensor circuit low voltage, bank 1 sensor 1', 'The oxygen sensor is reporting a persistently lean signal.', 'Exhaust leak ahead of the sensor|Failed oxygen sensor|Low fuel pressure or a vacuum leak', 's', 'c'],
  ['P0132', 'Oxygen sensor circuit high voltage, bank 1 sensor 1', 'The oxygen sensor is reporting a persistently rich signal.', 'Failed oxygen sensor|Leaking fuel injector|Fuel pressure too high', 's', 'c'],
  ['P0133', 'Oxygen sensor slow response, bank 1 sensor 1', 'The oxygen sensor is still working but reacting too slowly to be useful for fine fuel control.', 'Ageing oxygen sensor|Sensor contaminated by oil or coolant|Exhaust leak', 'm', 'o'],
  ['P0134', 'Oxygen sensor no activity, bank 1 sensor 1', 'The oxygen sensor signal is not moving at all.', 'Failed oxygen sensor|Broken wiring or disconnected sensor|Blown heater fuse', 's', 'c'],
  ['P0135', 'Oxygen sensor heater circuit, bank 1 sensor 1', 'The oxygen sensor heater is not working, so the sensor warms up too slowly.', 'Failed heater element inside the sensor|Blown fuse|Wiring damage', 'm', 'o'],
  ['P0136', 'Oxygen sensor circuit, bank 1 sensor 2', 'The oxygen sensor after the catalytic converter is not giving a usable signal.', 'Failed oxygen sensor|Exhaust leak|Wiring or connector damage', 'm', 'o'],
  ['P0137', 'Oxygen sensor circuit low voltage, bank 1 sensor 2', 'The post-converter oxygen sensor is reading persistently lean.', 'Exhaust leak near the sensor|Failed sensor|Wiring fault', 'm', 'o'],
  ['P0138', 'Oxygen sensor circuit high voltage, bank 1 sensor 2', 'The post-converter oxygen sensor is reading persistently rich.', 'Failed sensor|Short to power in wiring|Contaminated sensor', 'm', 'o'],
  ['P0140', 'Oxygen sensor no activity, bank 1 sensor 2', 'The post-converter oxygen sensor signal is not moving.', 'Failed oxygen sensor|Open circuit in the wiring|Disconnected sensor', 'm', 'o'],
  ['P0141', 'Oxygen sensor heater circuit, bank 1 sensor 2', 'The heater in the post-converter oxygen sensor is not working.', 'Failed heater element|Blown fuse|Damaged wiring', 'm', 'o'],
  ['P0150', 'Oxygen sensor circuit, bank 2 sensor 1', 'The main oxygen sensor on bank 2 is not giving a usable signal.', 'Failed oxygen sensor|Exhaust leak before the sensor|Wiring damage', 's', 'c'],
  ['P0151', 'Oxygen sensor circuit low voltage, bank 2 sensor 1', 'The bank 2 oxygen sensor is reporting persistently lean.', 'Exhaust leak|Failed sensor|Low fuel pressure', 's', 'c'],
  ['P0152', 'Oxygen sensor circuit high voltage, bank 2 sensor 1', 'The bank 2 oxygen sensor is reporting persistently rich.', 'Failed sensor|Leaking injector|Excess fuel pressure', 's', 'c'],
  ['P0155', 'Oxygen sensor heater circuit, bank 2 sensor 1', 'The bank 2 oxygen sensor heater is not working.', 'Failed heater element|Blown fuse|Wiring damage', 'm', 'o'],
  ['P0157', 'Oxygen sensor circuit low voltage, bank 2 sensor 2', 'The bank 2 post-converter sensor is reading persistently lean.', 'Exhaust leak|Failed sensor|Wiring fault', 'm', 'o'],

  // --- Fuel trim -----------------------------------------------------------
  ['P0171', 'System too lean, bank 1', 'The engine is getting more air than fuel and the computer has run out of room to correct it.', 'Vacuum or intake leak|Dirty mass air flow sensor|Weak fuel pump or blocked filter|Leaking intake manifold gasket', 's', 'c'],
  ['P0172', 'System too rich, bank 1', 'The engine is getting more fuel than air and the computer has run out of room to correct it.', 'Leaking fuel injector|Fuel pressure too high|Dirty air filter|Faulty oxygen sensor', 's', 'c'],
  ['P0174', 'System too lean, bank 2', 'Bank 2 is running lean beyond the computer’s ability to correct.', 'Vacuum leak|Dirty MAF sensor|Fuel delivery problem', 's', 'c'],
  ['P0175', 'System too rich, bank 2', 'Bank 2 is running rich beyond the computer’s ability to correct.', 'Leaking injector|High fuel pressure|Faulty oxygen sensor', 's', 'c'],

  // --- Injectors -----------------------------------------------------------
  ['P0190', 'Fuel rail pressure sensor circuit', 'The fuel rail pressure sensor is not giving a usable reading.', 'Failed fuel rail pressure sensor|Wiring or connector damage', 'u', 'c'],
  ['P0200', 'Injector circuit malfunction', 'The injector driver circuit is not behaving correctly.', 'Open or shorted injector wiring|Failed injector|Engine computer driver fault', 'u', 'c'],
  ['P0217', 'Engine over-temperature', 'The engine has exceeded its safe operating temperature.', 'Low coolant level|Failed water pump or thermostat|Blocked radiator or failed cooling fan', 'x', 'n'],
  ['P0219', 'Engine over-speed', 'The engine has been revved beyond its design limit.', 'Over-revving, often from a missed downshift|Faulty engine speed sensor', 'u', 'c'],
  ['P0230', 'Fuel pump primary circuit', 'The fuel pump control circuit is faulty.', 'Failed fuel pump relay|Damaged wiring|Failed fuel pump', 'u', 'c'],
  ['P0234', 'Turbocharger overboost', 'The turbocharger is producing more boost than the engine computer allows.', 'Stuck wastegate|Faulty boost control solenoid|Leaking or disconnected boost hose', 'u', 'c'],

  // --- Misfire -------------------------------------------------------------
  ['P0300', 'Random or multiple cylinder misfire', 'More than one cylinder is misfiring, or the misfire moves between cylinders. Unburnt fuel can damage the catalytic converter.', 'Worn spark plugs or ignition coils|Vacuum leak|Low fuel pressure|Faulty injectors', 'u', 'c'],
  ['P0313', 'Misfire detected with low fuel level', 'The engine is misfiring and the fuel level is low enough to be the cause.', 'Fuel level too low|Failing fuel pump|Blocked fuel filter', 'm', 'c'],
  ['P0315', 'Crankshaft position system variation not learned', 'The computer has not learned the crankshaft’s tolerance pattern, which it needs to detect misfires accurately.', 'Relearn procedure not carried out after a repair|Faulty crankshaft sensor', 'i', 'o'],
  ['P0316', 'Misfire on engine start', 'The engine misfired during the first moments after starting.', 'Worn spark plugs|Fuel delivery problem at start-up|Low compression', 's', 'c'],

  // --- Ignition and knock --------------------------------------------------
  ['P0320', 'Ignition or distributor engine speed input circuit', 'The engine speed signal used for ignition timing is unreliable.', 'Faulty crankshaft position sensor|Wiring damage|Ignition module fault', 'u', 'c'],
  ['P0325', 'Knock sensor 1 circuit, bank 1', 'The knock sensor is not giving a usable signal, so the computer cannot protect against detonation.', 'Failed knock sensor|Loose sensor mounting|Wiring or connector damage', 's', 'c'],
  ['P0327', 'Knock sensor 1 circuit low, bank 1', 'The knock sensor signal is below its expected range.', 'Failed knock sensor|Short to ground in wiring|Loose sensor', 's', 'c'],
  ['P0328', 'Knock sensor 1 circuit high, bank 1', 'The knock sensor signal is above its expected range.', 'Failed knock sensor|Wiring short to power', 's', 'c'],
  ['P0335', 'Crankshaft position sensor A circuit', 'The crankshaft position signal is missing or unreliable. The engine may not start or may cut out.', 'Failed crankshaft position sensor|Damaged wiring or connector|Damaged sensor reluctor ring', 'x', 'n'],
  ['P0336', 'Crankshaft position sensor A range or performance', 'The crankshaft signal is present but irregular.', 'Damaged reluctor ring teeth|Failing crankshaft sensor|Metal debris on the sensor tip', 'u', 'c'],
  ['P0339', 'Crankshaft position sensor A intermittent', 'The crankshaft signal is dropping out intermittently.', 'Loose or corroded connector|Failing sensor|Chafed wiring', 'u', 'c'],
  ['P0340', 'Camshaft position sensor A circuit', 'The camshaft position signal is missing or unreliable, so the computer cannot time injection precisely.', 'Failed camshaft position sensor|Wiring or connector damage|Timing chain fault', 'u', 'c'],
  ['P0341', 'Camshaft position sensor A range or performance', 'The camshaft signal is present but does not agree with the crankshaft.', 'Timing chain stretch or jumped tooth|Failing camshaft sensor|Damaged sensor ring', 'u', 'c'],
  ['P0344', 'Camshaft position sensor A intermittent', 'The camshaft signal drops out intermittently.', 'Loose connector|Failing sensor|Chafed wiring', 'u', 'c'],
  ['P0351', 'Ignition coil A primary or secondary circuit', 'The ignition coil circuit for cylinder 1 is faulty.', 'Failed ignition coil|Damaged coil wiring or connector|Engine computer driver fault', 'u', 'c'],
  ['P0380', 'Glow plug or heater circuit A', 'The glow plug circuit used for cold starting is faulty.', 'Failed glow plug or glow plug relay|Wiring damage|Blown fuse', 'm', 'o'],

  // --- Emission controls ---------------------------------------------------
  ['P0400', 'Exhaust gas recirculation flow', 'Exhaust gas recirculation flow is not what the computer expects.', 'Blocked EGR passages|Stuck EGR valve|Faulty EGR solenoid or sensor', 's', 'c'],
  ['P0401', 'Exhaust gas recirculation flow insufficient', 'Not enough exhaust gas is being recirculated, which raises combustion temperature and emissions.', 'Carbon-blocked EGR passages|Stuck-closed EGR valve|Faulty differential pressure sensor', 's', 'c'],
  ['P0402', 'Exhaust gas recirculation flow excessive', 'Too much exhaust gas is being recirculated, which can make the engine run rough or stall.', 'Stuck-open EGR valve|Faulty EGR control solenoid|Damaged EGR gasket', 's', 'c'],
  ['P0403', 'Exhaust gas recirculation control circuit', 'The EGR valve control circuit is faulty.', 'Failed EGR solenoid|Wiring or connector damage|Blown fuse', 's', 'c'],
  ['P0411', 'Secondary air injection system, incorrect flow', 'The secondary air system, which helps the catalytic converter warm up, is not flowing correctly.', 'Failed secondary air pump|Blocked or leaking air hoses|Stuck check valve', 'm', 'o'],
  ['P0420', 'Catalyst efficiency below threshold, bank 1', 'The catalytic converter is not cleaning the exhaust as well as it should. Often a worn converter, but an oxygen sensor or an exhaust leak can give the same reading.', 'Worn catalytic converter|Ageing oxygen sensor|Exhaust leak|Engine running rich or misfiring', 's', 'o'],
  ['P0430', 'Catalyst efficiency below threshold, bank 2', 'The bank 2 catalytic converter is not cleaning the exhaust as well as it should.', 'Worn catalytic converter|Ageing oxygen sensor|Exhaust leak|Engine misfire', 's', 'o'],
  ['P0440', 'Evaporative emission control system', 'The system that stops fuel vapour escaping from the tank is not sealing or venting correctly.', 'Loose or faulty fuel cap|Cracked vapour hose|Faulty purge or vent valve', 'i', 'o'],
  ['P0441', 'Evaporative emission system, incorrect purge flow', 'Fuel vapour is not being drawn into the engine at the expected rate.', 'Stuck purge valve|Blocked or split vapour hose|Faulty vent valve', 'i', 'o'],
  ['P0442', 'Evaporative emission system, small leak detected', 'A small leak has been found in the fuel vapour system. The commonest cause by far is the fuel cap.', 'Loose, worn or incorrect fuel cap|Small crack in a vapour hose|Faulty vent valve seal', 'i', 'o'],
  ['P0443', 'Evaporative emission purge control valve circuit', 'The purge valve control circuit is faulty.', 'Failed purge solenoid|Wiring or connector damage|Blown fuse', 'i', 'o'],
  ['P0446', 'Evaporative emission vent control circuit', 'The vent valve circuit in the fuel vapour system is faulty.', 'Failed vent valve|Blocked vent filter|Wiring damage', 'i', 'o'],
  ['P0455', 'Evaporative emission system, large leak detected', 'A large leak has been found in the fuel vapour system — usually a missing or unsealed fuel cap.', 'Fuel cap missing, loose or not sealing|Disconnected vapour hose|Failed vent valve stuck open', 'i', 'o'],
  ['P0456', 'Evaporative emission system, very small leak detected', 'A very small leak has been found in the fuel vapour system.', 'Fuel cap seal worn|Pinhole in a vapour hose|Faulty vent valve', 'i', 'o'],
  ['P0457', 'Evaporative emission leak, fuel cap loose or off', 'The system has detected the fuel cap is not sealing.', 'Fuel cap loose, missing or the wrong type|Damaged filler neck seal', 'i', 'o'],
  ['P0461', 'Fuel level sensor range or performance', 'The fuel gauge sender is giving an implausible reading.', 'Faulty fuel level sender|Wiring fault|Sender float stuck', 'i', 'o'],
  ['P0480', 'Cooling fan 1 control circuit', 'The radiator cooling fan control circuit is faulty, which risks overheating in slow traffic.', 'Failed fan relay|Failed fan motor|Wiring damage or blown fuse', 'u', 'c'],

  // --- Speed, idle and auxiliary inputs ------------------------------------
  ['P0500', 'Vehicle speed sensor A', 'The vehicle speed signal is missing or unreliable.', 'Faulty vehicle speed sensor|Wiring or connector damage|Faulty ABS module providing the signal', 's', 'c'],
  ['P0501', 'Vehicle speed sensor range or performance', 'The speed signal is present but implausible.', 'Faulty speed sensor|Damaged reluctor ring|Wiring fault', 's', 'c'],
  ['P0505', 'Idle air control system', 'The engine computer cannot hold the idle speed where it wants it.', 'Dirty or faulty idle air control valve|Carbon build-up in the throttle body|Vacuum leak', 's', 'c'],
  ['P0506', 'Idle speed lower than expected', 'The engine is idling more slowly than commanded.', 'Carbon build-up in the throttle body|Dirty idle air control valve|Restricted air intake', 'm', 'c'],
  ['P0507', 'Idle speed higher than expected', 'The engine is idling faster than commanded.', 'Vacuum leak|Stuck idle air control valve|Throttle plate not closing fully', 'm', 'c'],
  ['P0520', 'Engine oil pressure sensor or switch circuit', 'The oil pressure sensor circuit is faulty, so oil pressure cannot be monitored.', 'Failed oil pressure sensor|Wiring or connector damage', 'u', 'c'],
  ['P0521', 'Engine oil pressure sensor range or performance', 'The oil pressure reading is implausible. If oil pressure really is low, engine damage can follow quickly.', 'Genuinely low oil pressure|Failed oil pressure sensor|Low oil level or worn oil pump', 'x', 'n'],
  ['P0532', 'Air conditioning refrigerant pressure sensor circuit low', 'The air conditioning pressure sensor is reading below its range.', 'Low refrigerant charge|Failed pressure sensor|Wiring fault', 'i', 'o'],
  ['P0560', 'System voltage', 'The electrical system voltage is outside its normal range.', 'Failing battery|Faulty alternator or voltage regulator|Corroded battery terminals', 'u', 'c'],
  ['P0562', 'System voltage low', 'Electrical system voltage is too low, which can make other readings and codes unreliable.', 'Failing battery|Alternator not charging|Loose or corroded battery connections|Slipping drive belt', 'u', 'c'],
  ['P0563', 'System voltage high', 'Electrical system voltage is too high, which can damage the battery and electronics.', 'Faulty voltage regulator|Failing alternator|Poor earth connection', 'u', 'c'],
  ['P0571', 'Brake switch A circuit', 'The brake light switch signal is unreliable, which can affect cruise control and the gearbox.', 'Faulty brake light switch|Switch out of adjustment|Wiring damage', 's', 'c'],

  // --- Control module ------------------------------------------------------
  ['P0600', 'Serial communication link', 'Internal communication inside the engine computer or to another module has failed.', 'Wiring or connector fault between modules|Failed control module|Poor earth connection', 'u', 'c'],
  ['P0601', 'Internal control module memory checksum error', 'The engine computer has found an error in its own memory.', 'Failed engine control module|Corrupted software after a failed update|Low system voltage during programming', 'u', 'c'],
  ['P0602', 'Control module programming error', 'The engine computer has not been programmed correctly.', 'Incomplete or failed software update|Replacement module not coded to the vehicle', 'u', 'c'],
  ['P0606', 'Control module processor fault', 'The engine computer’s processor has reported an internal fault.', 'Failed engine control module|Low supply voltage|Poor earth connection', 'u', 'c'],
  ['P0620', 'Generator control circuit', 'The alternator control circuit is faulty.', 'Failed alternator or regulator|Wiring damage|Control module fault', 's', 'c'],
  ['P0627', 'Fuel pump control circuit open', 'The fuel pump control circuit is open.', 'Failed fuel pump relay|Broken wiring|Failed fuel pump', 'u', 'c'],
  ['P0645', 'Air conditioning clutch relay control circuit', 'The air conditioning compressor clutch relay circuit is faulty.', 'Failed relay|Wiring damage|Blown fuse', 'i', 'o'],
  ['P0685', 'Engine control module power relay control circuit open', 'The main relay that powers the engine computer has an open control circuit.', 'Failed main relay|Wiring damage|Blown fuse', 'u', 'c'],

  // --- Transmission --------------------------------------------------------
  ['P0700', 'Transmission control system', 'The gearbox control unit has stored a fault of its own. This code is a pointer — the gearbox module holds the detail.', 'A fault stored in the transmission control module|Wiring between the engine and gearbox modules', 'u', 'c'],
  ['P0705', 'Transmission range sensor circuit', 'The gear selector position signal is unreliable.', 'Faulty range or inhibitor switch|Selector cable out of adjustment|Wiring damage', 'u', 'c'],
  ['P0711', 'Transmission fluid temperature sensor range or performance', 'The gearbox fluid temperature reading is implausible.', 'Faulty temperature sensor|Low fluid level|Wiring fault', 's', 'c'],
  ['P0715', 'Input or turbine speed sensor circuit', 'The gearbox input speed signal is missing or unreliable.', 'Failed input speed sensor|Wiring damage|Low transmission fluid', 'u', 'c'],
  ['P0720', 'Output speed sensor circuit', 'The gearbox output speed signal is missing or unreliable.', 'Failed output speed sensor|Wiring damage|Damaged reluctor ring', 'u', 'c'],
  ['P0730', 'Incorrect gear ratio', 'The gearbox is not achieving the ratio it selected.', 'Low or degraded transmission fluid|Worn clutches|Faulty shift solenoid', 'u', 'c'],
  ['P0740', 'Torque converter clutch circuit', 'The torque converter lock-up clutch circuit is faulty.', 'Failed torque converter clutch solenoid|Low transmission fluid|Wiring damage', 's', 'c'],
  ['P0741', 'Torque converter clutch performance or stuck off', 'The torque converter clutch is not locking up, which hurts fuel economy and raises gearbox temperature.', 'Failed lock-up solenoid|Low or contaminated fluid|Worn torque converter', 's', 'c'],
  ['P0750', 'Shift solenoid A', 'A gear shift solenoid is not responding correctly.', 'Failed shift solenoid|Wiring damage|Low or dirty transmission fluid', 'u', 'c'],
  ['P0755', 'Shift solenoid B', 'A gear shift solenoid is not responding correctly.', 'Failed shift solenoid|Wiring damage|Low transmission fluid', 'u', 'c'],

  // --- Hybrid --------------------------------------------------------------
  ['P0A80', 'Replace hybrid battery pack', 'The hybrid battery pack has degraded beyond its usable limit, usually because one module is far weaker than the rest.', 'Worn hybrid battery modules|Blocked battery cooling fan or duct|Failed battery control module', 'u', 'c'],

  // --- Network and communication -------------------------------------------
  ['U0001', 'High speed CAN communication bus', 'The main communication network between the vehicle’s computers has a fault.', 'Damaged CAN wiring|Failed module dragging the bus down|Poor earth or power to a module', 'u', 'c'],
  ['U0073', 'Control module communication bus A off', 'A module has taken itself off the communication network after too many errors.', 'Short or open in CAN wiring|Failed control module|Power or earth fault at a module', 'u', 'c'],
  ['U0100', 'Lost communication with the engine control module', 'Other modules can no longer talk to the engine computer.', 'Failed engine control module|CAN wiring damage|Lost power or earth at the module', 'x', 'n'],
  ['U0101', 'Lost communication with the transmission control module', 'The gearbox control module has stopped communicating.', 'Failed transmission control module|CAN wiring damage|Blown fuse', 'u', 'c'],
  ['U0121', 'Lost communication with the ABS control module', 'The anti-lock braking module has stopped communicating. ABS and stability control will not be available.', 'Failed ABS module|CAN wiring damage|Blown fuse or lost earth', 'u', 'c'],
  ['U0155', 'Lost communication with the instrument cluster', 'The instrument cluster has stopped communicating, so warnings and gauges may be wrong.', 'Failed instrument cluster|CAN wiring damage|Blown fuse', 'u', 'c'],
  ['U0401', 'Invalid data received from the engine control module', 'The engine computer is communicating, but sending data other modules cannot use.', 'Software mismatch after a module replacement|Failing engine control module|Intermittent wiring fault', 'u', 'c'],

  // --- Chassis: wheel speed and braking ------------------------------------
  ['C0035', 'Left front wheel speed sensor circuit', 'The left front wheel speed signal is missing or unreliable. ABS and stability control may switch off.', 'Faulty wheel speed sensor|Damaged sensor wiring|Dirty or damaged reluctor ring|Incorrect sensor air gap', 'u', 'c'],
  ['C0040', 'Right front wheel speed sensor circuit', 'The right front wheel speed signal is missing or unreliable.', 'Faulty wheel speed sensor|Damaged wiring|Dirty or damaged reluctor ring', 'u', 'c'],
  ['C0045', 'Left rear wheel speed sensor circuit', 'The left rear wheel speed signal is missing or unreliable.', 'Faulty wheel speed sensor|Damaged wiring|Dirty or damaged reluctor ring', 'u', 'c'],
  ['C0050', 'Right rear wheel speed sensor circuit', 'The right rear wheel speed signal is missing or unreliable.', 'Faulty wheel speed sensor|Damaged wiring|Dirty or damaged reluctor ring', 'u', 'c'],
  ['C0061', 'ABS control system', 'The anti-lock braking system has reported an internal fault. Normal braking usually remains, but ABS may not work.', 'Failed ABS module or pump|Low brake fluid|Wheel speed sensor fault', 'u', 'c'],

  // --- Body -----------------------------------------------------------------
  ['B0001', 'Driver airbag deployment control', 'The driver airbag circuit has a fault. The airbag may not deploy in a crash.', 'Faulty clock spring in the steering column|Damaged airbag wiring or connector|Failed airbag module', 'u', 'c'],
  ['B0010', 'Passenger airbag deployment control', 'The passenger airbag circuit has a fault.', 'Damaged airbag wiring or connector|Failed airbag module|Faulty occupancy sensor', 'u', 'c'],
];
