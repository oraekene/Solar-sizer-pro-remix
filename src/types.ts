export type Region = "SE_SS" | "SW" | "North";

export type DeviceCategory = "compressor" | "motor" | "heating" | "electronics";

export interface TimeRange {
  start: number;
  end: number;
}

export interface Device {
  id: string;
  name: string;
  category: DeviceCategory;
  qty: number;
  watts: number;
  ranges: TimeRange[];
}

export type BatteryPreference = "lithium" | "lead-acid" | "any";

export interface Inverter {
  id: string;
  name: string;
  max_ac_w: number;
  cc_max_pv_w: number;
  cc_max_voc: number;
  cc_max_amps: number;
  system_vdc: number;
  max_charge_amps: number;
  price: number;
}

export interface Panel {
  id: string;
  name: string;
  watts: number;
  voc: number;
  isc: number;
  price: number;
}

export interface Battery {
  id: string;
  name: string;
  voltage: number;
  capacity_ah: number;
  type: "lead-acid" | "lithium";
  max_parallel_strings: number;
  min_c_rate: number;
  price: number;
}

export interface LoadAnalysis {
  max_surge: number;
  nighttime_wh: number;
  total_daily_wh: number;
}

export interface SystemCombination {
  inverter: string;
  inverter_price: number;
  battery_config: string;
  battery_price: number;
  panel_config: string;
  panel_price: number;
  array_size_w: number;
  total_price: number;
  daily_yield: number;
  status: "Optimal" | "Conditional";
  advice: string;
  log: string[];
}

export interface CalculationAttempt {
  timestamp: string;
  location: Region;
  devices: Device[];
  analysis: LoadAnalysis;
  totalCombinationsChecked: number;
  validSystemsCount: number;
  allLogs: string[][];
}

export interface UserProfile {
  id: string;
  name: string;
  timestamp: string;
  region: Region;
  batteryPreference: BatteryPreference;
  devices: Device[];
}

export type AppTab = "calculator" | "database" | "logs" | "profiles";
