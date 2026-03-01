import { Battery, DeviceCategory, Inverter, Panel, Region } from "./types";

export const LOCATION_PSH: Record<Region, number> = {
  SE_SS: 2.2,
  SW: 2.6,
  North: 3.8,
};

export const SURGE_MULTIPLIERS: Record<DeviceCategory, number> = {
  compressor: 3.0,
  motor: 2.0,
  heating: 1.2,
  electronics: 1.0,
};

export const INVERTERS: Inverter[] = [
  {
    id: "inv-1",
    name: "Firman 1kVA Hybrid",
    max_ac_w: 800,
    cc_max_pv_w: 600,
    cc_max_voc: 102,
    cc_max_amps: 50,
    system_vdc: 12,
    max_charge_amps: 50,
    cc_type: "pwm",
    price: 150000,
  },
  {
    id: "inv-2",
    name: "Felicity 3kVA",
    max_ac_w: 2400,
    cc_max_pv_w: 1500,
    cc_max_voc: 145,
    cc_max_amps: 60,
    system_vdc: 24,
    max_charge_amps: 60,
    cc_type: "mppt",
    price: 400000,
  },
  {
    id: "inv-3",
    name: "Deye 5kVA Hybrid",
    max_ac_w: 4000,
    cc_max_pv_w: 5000,
    cc_max_voc: 500,
    cc_max_amps: 100,
    system_vdc: 48,
    max_charge_amps: 120,
    cc_type: "mppt",
    price: 850000,
  },
];

export const PANELS: Panel[] = [
  {
    id: "p-1",
    name: "9solar 350W Mono",
    watts: 350,
    voc: 46.5,
    isc: 9.5,
    price: 95000,
  },
  {
    id: "p-2",
    name: "Jinko 550W Mono",
    watts: 550,
    voc: 49.9,
    isc: 14.0,
    price: 140000,
  },
];

export const BATTERIES: Battery[] = [
  {
    id: "b-1",
    name: "Tubular Lead-Acid 12V 200Ah",
    voltage: 12,
    capacity_ah: 200,
    type: "lead-acid",
    max_parallel_strings: 4,
    min_c_rate: 0.1,
    price: 250000,
  },
  {
    id: "b-2",
    name: "Lithium LiFePO4 24V 100Ah",
    voltage: 24,
    capacity_ah: 100,
    type: "lithium",
    max_parallel_strings: 8,
    min_c_rate: 0.2,
    price: 600000,
  },
  {
    id: "b-3",
    name: "Lithium Rack 48V 100Ah",
    voltage: 48,
    capacity_ah: 100,
    type: "lithium",
    max_parallel_strings: 15,
    min_c_rate: 0.2,
    price: 1100000,
  },
];
