import { BATTERIES, INVERTERS, LOCATION_PSH, PANELS, SURGE_MULTIPLIERS, IRRADIANCE_PROFILES } from "../constants";
import { Device, LoadAnalysis, Region, SystemCombination, Inverter, Panel, Battery, BatteryPreference } from "../types";

export function calculateUserNeeds(devices: Device[]): LoadAnalysis {
  const hourlyConsumption: Record<number, number> = {};
  const hourlySurge: Record<number, number> = {};

  for (let h = 0; h < 24; h++) {
    hourlyConsumption[h] = 0;
    hourlySurge[h] = 0;
  }

  for (const d of devices) {
    const runW = d.watts * d.qty;
    const surgeW = runW * (SURGE_MULTIPLIERS[d.category] || 1.0);
    const surgeDiff = surgeW - runW;

    for (const range of d.ranges) {
      const start = range.start;
      const end = range.end;
      
      // Calculate duration correctly including wrap-around and 24h coverage
      const duration = end > start ? end - start : 24 - start + end;

      for (let i = 0; i < duration; i++) {
        const h = (start + i) % 24;
        hourlyConsumption[h] += runW;
        if (surgeDiff > hourlySurge[h]) {
          hourlySurge[h] = surgeDiff;
        }
      }
    }
  }

  const maxSurge = Math.max(
    ...Object.keys(hourlyConsumption).map(
      (h) => hourlyConsumption[Number(h)] + hourlySurge[Number(h)]
    )
  );

  // Nighttime: 18:00 to 07:00
  const nightHours = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6];
  const nighttimeWh = nightHours.reduce(
    (acc, h) => acc + hourlyConsumption[h],
    0
  );

  const totalDailyWh = Object.values(hourlyConsumption).reduce(
    (acc, val) => acc + val,
    0
  );

  return { 
    max_surge: maxSurge, 
    nighttime_wh: nighttimeWh, 
    total_daily_wh: totalDailyWh,
    hourly_consumption: hourlyConsumption
  };
}

export function simulateHourlySoC(
  hourlyLoad: Record<number, number>,
  actualDailyYield: number,
  usableBatteryWh: number,
  maxChargeW: number,
  ccType: "pwm" | "mppt",
  location: Region
): { passed: boolean; lowestSoCWh: number; finalDeficitWh: number; failureTime: string | null } {
  // FETCH DYNAMIC REGIONAL CURVE
  const irradianceCurve = IRRADIANCE_PROFILES[location];
  
  const hourlySolarGen: Record<number, number> = {};
  for (let h = 0; h < 24; h++) {
    hourlySolarGen[h] = (irradianceCurve[h] || 0) * actualDailyYield;
  }

  // 2. Set up the Virtual Battery
  // Start at 18:00 (6 PM) assuming a full battery
  let currentBatteryWh = usableBatteryWh;
  let lowestBatteryWh = usableBatteryWh;

  // Loop from 18 to 23, then 0 to 17
  const simulationHours = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

  for (const h of simulationHours) {
    const load = hourlyLoad[h] || 0;
    const gen = hourlySolarGen[h] || 0;

    // Priority 1: Solar powers the active load first
    const netPower = gen - load;

    if (netPower > 0) {
      // Priority 2: Excess solar goes to the battery
      const chargeAdded = Math.min(netPower, maxChargeW);
      currentBatteryWh += chargeAdded;

      // Cap battery at 100% full
      if (currentBatteryWh > usableBatteryWh) {
        currentBatteryWh = usableBatteryWh;
      }
    } else {
      // Deficit: Pull from battery
      currentBatteryWh += netPower; // netPower is negative
    }

    // 3. Failure Check
    if (currentBatteryWh < lowestBatteryWh) {
      lowestBatteryWh = currentBatteryWh;
    }

    if (currentBatteryWh < 0) {
      const amPm = h < 12 ? "AM" : "PM";
      let displayHour = h % 12;
      if (displayHour === 0) displayHour = 12;
      const failureTime = `${displayHour}:00 ${amPm}`;

      return { passed: false, lowestSoCWh: lowestBatteryWh, finalDeficitWh: Math.abs(currentBatteryWh), failureTime };
    }
  }

  // Check if battery recharged by end of next day (5 PM)
  if (currentBatteryWh < usableBatteryWh * 0.95) {
    return { passed: false, lowestSoCWh: lowestBatteryWh, finalDeficitWh: usableBatteryWh - currentBatteryWh, failureTime: "Late Afternoon (Battery failed to recharge)" };
  }

  return { passed: true, lowestSoCWh: lowestBatteryWh, finalDeficitWh: 0, failureTime: null };
}

export function getLoadSheddingAdvice(devices: Device[], deficit: number): string {
  // Sort devices by hourly consumption (highest to lowest)
  const sortedDevices = [...devices].sort((a, b) => (b.watts * b.qty) - (a.watts * a.qty));

  let deficitRemaining = deficit;
  const adviceSteps: string[] = [];

  for (const d of sortedDevices) {
    const hourlyWh = d.watts * d.qty;

    // Calculate total run hours for this device
    let totalRunHours = 0;
    for (const range of d.ranges) {
      const start = range.start;
      const end = range.end;
      totalRunHours += end > start ? end - start : 24 - start + end;
    }

    if (hourlyWh === 0 || totalRunHours <= 0) {
      continue;
    }

    const hoursToCut = Math.ceil(deficitRemaining / hourlyWh);

    // If we can cover the remaining deficit just by trimming this device:
    if (hoursToCut <= totalRunHours) {
      if (hoursToCut === totalRunHours) {
        adviceSteps.push(`turn off the ${d.name} completely`);
      } else {
        adviceSteps.push(`run your ${d.name} for ${hoursToCut} hour(s) less`);
      }

      deficitRemaining = 0;
      break; // We've covered the deficit!
    }
    // If this device isn't enough, we turn it off completely and keep going:
    else {
      adviceSteps.push(`turn off the ${d.name} completely`);
      deficitRemaining -= (totalRunHours * hourlyWh);
    }
  }

  // Format the final output
  if (deficitRemaining <= 0) {
    return `To bridge the ${deficit.toFixed(0)}Wh gap, ` + adviceSteps.join(" AND ") + ".";
  } else {
    return `Even after suggesting major cuts, you are still short. You must use grid power or upgrade the setup.`;
  }
}

export function buildCombinations(
  location: Region,
  devices: Device[],
  hardware: { inverters: Inverter[]; panels: Panel[]; batteries: Battery[] },
  batteryPreference: BatteryPreference = "any"
): { analysis: LoadAnalysis; systems: SystemCombination[]; allLogs: string[][] } {
  const analysis = calculateUserNeeds(devices);
  const { max_surge, nighttime_wh, total_daily_wh } = analysis;
  const psh = LOCATION_PSH[location];

  const validSystems: SystemCombination[] = [];
  const allLogs: string[][] = [];

  for (const inv of hardware.inverters) {
    const invLog: string[] = [];
    invLog.push(`Checking inverter: ${inv.name} (Max AC: ${inv.max_ac_w}W)`);
    
    if (inv.max_ac_w < max_surge) {
      invLog.push(`❌ Rejected: Max AC output (${inv.max_ac_w}W) is less than peak surge (${max_surge}W).`);
      allLogs.push(invLog);
      continue;
    }
    invLog.push(`✅ Inverter matches surge requirements.`);

    for (const bat of hardware.batteries) {
      const batLog = [...invLog];
      batLog.push(`Checking battery: ${bat.name} (${bat.voltage}V, ${bat.capacity_ah}Ah)`);

      // Battery Preference Filter
      if (batteryPreference !== "any" && bat.type !== batteryPreference) {
        batLog.push(`❌ Rejected: Battery type (${bat.type}) does not match preference (${batteryPreference}).`);
        allLogs.push(batLog);
        continue;
      }

      // 1. System DC Voltage Compatibility
      if (inv.system_vdc % bat.voltage !== 0) {
        batLog.push(`❌ Rejected: Battery voltage (${bat.voltage}V) is not a factor of Inverter DC voltage (${inv.system_vdc}V).`);
        allLogs.push(batLog);
        continue;
      }

      const batteriesInSeries = inv.system_vdc / bat.voltage;
      batLog.push(`System requires ${batteriesInSeries} battery(ies) in series to match ${inv.system_vdc}V DC.`);

      // 2. Capacity & Parallel Strings Math
      const dodLimit = bat.type === "lead-acid" ? 0.5 : 0.8;
      const usableWhPerBattery = bat.voltage * bat.capacity_ah * dodLimit;
      const totalUsablePerString = usableWhPerBattery * batteriesInSeries;
      batLog.push(`Usable energy per series string: ${totalUsablePerString}Wh (DoD: ${dodLimit * 100}%).`);

      let parallelStrings = 1;
      if (nighttime_wh > 0) {
        parallelStrings = Math.ceil(nighttime_wh / totalUsablePerString);
        batLog.push(`Required nighttime energy (${nighttime_wh}Wh) requires ${parallelStrings} parallel string(s).`);
      } else {
        batLog.push(`No nighttime load detected. Using 1 parallel string.`);
      }

      // 3. Physical Parallel Wiring Limits
      if (parallelStrings > bat.max_parallel_strings) {
        batLog.push(`❌ Rejected: Required parallel strings (${parallelStrings}) exceeds battery's physical limit (${bat.max_parallel_strings}).`);
        allLogs.push(batLog);
        continue;
      }

      const totalBatteries = parallelStrings * batteriesInSeries;
      batLog.push(`Total batteries in bank: ${totalBatteries} (${batteriesInSeries}S x ${parallelStrings}P).`);

      // 4. Charge Current (C-Rate) Bottleneck Check
      const totalAhBank = bat.capacity_ah * parallelStrings;
      const minChargeAmpsNeeded = totalAhBank * bat.min_c_rate;
      batLog.push(`Battery bank requires min ${minChargeAmpsNeeded.toFixed(1)}A charging current (C-Rate: ${bat.min_c_rate}).`);

      if (inv.max_charge_amps < minChargeAmpsNeeded) {
        batLog.push(`❌ Rejected: Inverter max charge current (${inv.max_charge_amps}A) is less than required (${minChargeAmpsNeeded.toFixed(1)}A).`);
        allLogs.push(batLog);
        continue;
      }
      batLog.push(`✅ Battery bank is compatible with inverter charging capacity.`);

      const totalBatteryPrice = bat.price * totalBatteries;

      for (const panel of hardware.panels) {
        const panelLog = [...batLog];
        panelLog.push(`Checking panel: ${panel.name} (${panel.watts}W, Voc: ${panel.voc}V, Isc: ${panel.isc}A)`);

        // 1. Find the physical limits of the Inverter's Charge Controller
        const maxSeries = Math.floor(inv.cc_max_voc / panel.voc);
        const maxParallel = Math.floor(inv.cc_max_amps / panel.isc);
        const maxAllowedPanels = maxSeries * maxParallel;
        panelLog.push(`Charge controller limits: Max ${maxSeries} in series, Max ${maxParallel} in parallel (Total: ${maxAllowedPanels} panels).`);

        if (maxAllowedPanels === 0) {
          panelLog.push(`❌ Rejected: Panel electrical specs exceed charge controller limits.`);
          allLogs.push(panelLog);
          continue;
        }

        // --- NEW: Dynamic MPPT vs PWM Power Calculation ---
        const ccType = (inv.cc_type || "pwm").toLowerCase();
        let usableWattsPerPanel = 0;
        let ccEfficiency = 0;

        if (ccType === "mppt") {
          ccEfficiency = 0.95;
          usableWattsPerPanel = panel.watts * ccEfficiency;
          panelLog.push(`Charge Controller: MPPT (Efficiency: 95%). Usable power per panel: ${usableWattsPerPanel.toFixed(1)}W.`);
        } else {
          // PWM Logic: Calculate nominal charging voltage (13.5V per 12V block)
          const chargingVoltage = (inv.system_vdc / 12) * 13.5;
          // PWM Usable Power = Battery Voltage x Panel Amps (Isc is a safe proxy for Imp in sizing)
          usableWattsPerPanel = chargingVoltage * panel.isc;
          ccEfficiency = usableWattsPerPanel / panel.watts;
          panelLog.push(`Charge Controller: PWM. Panel voltage dragged to ${chargingVoltage}V. Usable power per panel: ${usableWattsPerPanel.toFixed(1)}W (Effective Efficiency: ${(ccEfficiency * 100).toFixed(1)}%).`);
        }

        // --- Calculate MINIMUM panels needed using physically accurate wattage ---
        // Formula: Required Array Watts = Daily_Wh / (PSH * System Efficiency)
        // 0.8 is standard system loss (wiring, dust, etc.)
        const requiredArrayWatts = total_daily_wh / (psh * 0.8);
        let minPanelsNeeded = Math.ceil(requiredArrayWatts / usableWattsPerPanel);

        // Even if load is tiny (or 0), we need at least 1 panel to charge the battery
        if (minPanelsNeeded === 0) {
          minPanelsNeeded = 1;
        }
        panelLog.push(`Minimum panels needed to meet load (${total_daily_wh}Wh): ${minPanelsNeeded}.`);

        // Check if the inverter can physically fit the number of panels we need
        if (minPanelsNeeded > maxAllowedPanels) {
          panelLog.push(`❌ Rejected: Required panels (${minPanelsNeeded}) exceeds inverter's physical limit (${maxAllowedPanels}).`);
          allLogs.push(panelLog);
          continue;
        }

        // Use the MINIMUM required panels for the final setup!
        const totalPanels = minPanelsNeeded;
        const arrayWattsRaw = totalPanels * panel.watts; // What's on the roof
        const arrayWattsActual = totalPanels * usableWattsPerPanel; // What actually makes it through
        
        // Calculate the actual daily yield of this right-sized array
        // We cap the actual throughput by the CC's PV input limit
        const usableArrayWatts = Math.min(arrayWattsActual, inv.cc_max_pv_w);
        if (arrayWattsRaw > inv.cc_max_pv_w) {
          panelLog.push(`Note: Array size (${arrayWattsRaw}W) exceeds charge controller PV input (${inv.cc_max_pv_w}W). Clipping will occur.`);
        }

        const dailyYield = usableArrayWatts * psh; 
        panelLog.push(`Adjusted Daily Yield: ${dailyYield.toFixed(0)}Wh.`);
        
        // --- THE NEW HOURLY PHYSICS ENGINE ---
        const totalUsableBatteryWh = totalUsablePerString * parallelStrings;
        const maxChargeW = inv.max_charge_amps * inv.system_vdc;
        
        const sim = simulateHourlySoC(
          analysis.hourly_consumption,
          dailyYield,
          totalUsableBatteryWh,
          maxChargeW,
          ccType as "pwm" | "mppt",
          location
        );

        let status: "Optimal" | "Conditional" | "High Risk" | null = null;
        let advice = "";
        const simDeficit = sim.finalDeficitWh;
        const deficitPercentage = total_daily_wh > 0 ? (simDeficit / total_daily_wh) * 100 : 0;

        if (sim.passed) {
          status = "Optimal";
          advice = "Perfect match. Fully covers your scheduled daily energy needs based on hourly simulation.";
          panelLog.push(`✅ System passed 24-hour hourly stress test.`);
        } else if (deficitPercentage <= 20) {
          // ALLOWED: It failed, but it's close enough for the user to fix!
          status = "Conditional";
          const controllerWarning = ccType.toUpperCase();
          advice = `⚠️ Blackout Risk: With this ${controllerWarning} setup, your battery will drain at ${sim.failureTime}. You are short by ${simDeficit.toFixed(0)}Wh. Use the sliders below to adjust your schedule and prevent this.`;
          panelLog.push(`⚠️ System failed hourly simulation (${deficitPercentage.toFixed(0)}% deficit), but within tolerance.`);
        } else {
          // REJECTED: System is way too small (deficit > 20%)
          panelLog.push(`❌ Rejected: Hourly simulation failed with ${simDeficit.toFixed(0)}Wh deficit (${deficitPercentage.toFixed(0)}% > 20% tolerance).`);
          allLogs.push(panelLog);
          continue;
        }

        const totalPanelPrice = panel.price * totalPanels;
        const totalSystemPrice = inv.price + totalBatteryPrice + totalPanelPrice;
        
        validSystems.push({
          inverter: inv.name,
          inverter_price: inv.price,
          battery_config: `${totalBatteries}x ${bat.name} (${batteriesInSeries}S${parallelStrings}P)`,
          battery_price: totalBatteryPrice,
          panel_config: `${totalPanels}x ${panel.name}`,
          panel_price: totalPanelPrice,
          array_size_w: arrayWattsActual, // Showing the actual usable watts!
          total_price: totalSystemPrice,
          daily_yield: dailyYield,
          deficit: Math.max(0, simDeficit), // Passes the exact deficit to the UI sliders!
          status,
          advice,
          log: panelLog,
        });
        allLogs.push(panelLog);
      }
    }
  }

  validSystems.sort((a, b) => a.total_price - b.total_price);

  return { analysis, systems: validSystems, allLogs };
}
