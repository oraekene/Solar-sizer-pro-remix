import { useState, useMemo, useEffect, ChangeEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sun, 
  Battery as BatteryIcon, 
  Zap, 
  MapPin, 
  Plus, 
  Trash2, 
  Calculator, 
  ChevronRight,
  Info,
  AlertCircle,
  CheckCircle2,
  ListIcon,
  X,
  Database,
  Terminal,
  ArrowLeft,
  Settings,
  ShieldCheck,
  ExternalLink,
  Cpu,
  Layers,
  Activity,
  UserCircle,
  Save,
  FolderOpen,
  Copy,
  Download,
  Upload
} from "lucide-react";
import { Device, Region, SystemCombination, LoadAnalysis, DeviceCategory, AppTab, CalculationAttempt, Inverter, Panel, Battery, BatteryPreference, UserProfile, User, SavedResult } from "./types";
import { buildCombinations } from "./utils/solarCalculator";
import { INVERTERS as DEFAULT_INVERTERS, PANELS as DEFAULT_PANELS, BATTERIES as DEFAULT_BATTERIES } from "./constants";
import InteractiveBridge from "./components/InteractiveBridge";
import Auth from "./components/Auth";

const CATEGORIES: { value: DeviceCategory; label: string }[] = [
  { value: "compressor", label: "Compressor (Fridge/AC)" },
  { value: "motor", label: "Motor (Fan/Pump)" },
  { value: "heating", label: "Heating (Iron/Heater)" },
  { value: "electronics", label: "Electronics (TV/Laptop)" },
];

const REGIONS: { value: Region; label: string }[] = [
  { value: "SE_SS", label: "South East / South South" },
  { value: "SW", label: "South West" },
  { value: "North", label: "North" },
];

const getHourLabel = (hour: number) => {
  if (hour === 0) return "12 AM";
  if (hour === 24) return "12 AM (Midnight)";
  if (hour === 12) return "12 PM";
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
};

const HOUR_OPTIONS = Array.from({ length: 25 }, (_, i) => ({
  value: i,
  label: getHourLabel(i),
}));

function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 p-3 bg-stone-800 text-white text-[10px] rounded-xl shadow-xl z-50 pointer-events-none"
          >
            <div className="font-bold mb-1 border-b border-stone-700 pb-1">Example Format:</div>
            <pre className="whitespace-pre-wrap font-mono opacity-80">{content}</pre>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-stone-800" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("calculator");
  const [region, setRegion] = useState<Region>("SE_SS");
  const [batteryPreference, setBatteryPreference] = useState<BatteryPreference>("any");
  const [devices, setDevices] = useState<Device[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [savedResults, setSavedResults] = useState<SavedResult[]>([]);
  
  // Developer Access Check
  const DEVELOPER_EMAILS = ["oraelosikeny@gmail.com", "oraelosikenny@gmail.com"];
  const isDeveloper = user && DEVELOPER_EMAILS.includes(user.email.toLowerCase().trim());

  // Fetch user data from server when logged in
  useEffect(() => {
    if (user) {
      fetch("/api/user/data")
        .then(res => res.json())
        .then(data => {
          if (data.profiles?.length > 0) setProfiles(data.profiles);
          if (data.results?.length > 0) setSavedResults(data.results);
          
          // Merge custom hardware
          if (data.hardware?.length > 0) {
            const customInverters = data.hardware.filter((h: any) => h.type === 'inverter');
            const customPanels = data.hardware.filter((h: any) => h.type === 'panel');
            const customBatteries = data.hardware.filter((h: any) => h.type === 'battery');

            if (customInverters.length > 0) {
              setInverters(prev => {
                const merged = [...prev];
                customInverters.forEach(item => {
                  const idx = merged.findIndex(i => i.id === item.id);
                  if (idx >= 0) merged[idx] = item;
                  else merged.push(item);
                });
                return merged;
              });
            }
            if (customPanels.length > 0) {
              setPanels(prev => {
                const merged = [...prev];
                customPanels.forEach(item => {
                  const idx = merged.findIndex(i => i.id === item.id);
                  if (idx >= 0) merged[idx] = item;
                  else merged.push(item);
                });
                return merged;
              });
            }
            if (customBatteries.length > 0) {
              setBatteries(prev => {
                const merged = [...prev];
                customBatteries.forEach(item => {
                  const idx = merged.findIndex(i => i.id === item.id);
                  if (idx >= 0) merged[idx] = item;
                  else merged.push(item);
                });
                return merged;
              });
            }
          }
        })
        .catch(err => console.error("Failed to fetch user data:", err));
    } else {
      // Reset to defaults or local storage when logged out
      setProfiles(JSON.parse(localStorage.getItem("ss_profiles") || "[]"));
      setSavedResults([]);
    }
  }, [user]);
  
  // Hardware State
  const [inverters, setInverters] = useState<Inverter[]>(() => {
    const saved = localStorage.getItem("ss_inverters");
    const data: Inverter[] = saved ? JSON.parse(saved) : DEFAULT_INVERTERS;
    // Migration: Ensure all have IDs and cc_type
    return data.map((item, idx) => ({ 
      ...item, 
      id: item.id || `inv-legacy-${idx}`,
      cc_type: item.cc_type || "pwm"
    }));
  });
  const [panels, setPanels] = useState<Panel[]>(() => {
    const saved = localStorage.getItem("ss_panels");
    const data: Panel[] = saved ? JSON.parse(saved) : DEFAULT_PANELS;
    return data.map((item, idx) => ({ ...item, id: item.id || `p-legacy-${idx}` }));
  });
  const [batteries, setBatteries] = useState<Battery[]>(() => {
    const saved = localStorage.getItem("ss_batteries");
    const data: Battery[] = saved ? JSON.parse(saved) : DEFAULT_BATTERIES;
    return data.map((item, idx) => ({ ...item, id: item.id || `b-legacy-${idx}` }));
  });

  // Internal Logs State
  const [internalLogs, setInternalLogs] = useState<CalculationAttempt[]>(() => {
    const saved = localStorage.getItem("ss_internal_logs");
    return saved ? JSON.parse(saved) : [];
  });

  const [newDevice, setNewDevice] = useState<Partial<Device>>({
    name: "",
    category: "electronics",
    qty: 1,
    watts: 0,
    ranges: [],
  });
  const [newRange, setNewRange] = useState({ start: 18, end: 23 });
  const [selectedSystemLog, setSelectedSystemLog] = useState<string[] | null>(null);
  const [selectedSystemDetails, setSelectedSystemDetails] = useState<SystemCombination | null>(null);
  const [showInteractiveBridge, setShowInteractiveBridge] = useState(false);
  const [adjustedLoad, setAdjustedLoad] = useState<{ devices: Device[], deficit: number } | null>(null);
  const saveHardwareToServer = async (type: "inverter" | "panel" | "battery", item: any) => {
    if (!user) return;
    try {
      await fetch("/api/user/hardware", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...item, type }),
      });
    } catch (err) {
      console.error("Failed to save hardware:", err);
    }
  };

  // Hardware Form State
  const [showAddHardware, setShowAddHardware] = useState<"inverter" | "panel" | "battery" | null>(null);
  const [editingHardware, setEditingHardware] = useState<{ type: "inverter" | "panel" | "battery", id: string } | null>(null);

  // Profile State
  const [profiles, setProfiles] = useState<UserProfile[]>(() => {
    const saved = localStorage.getItem("ss_profiles");
    return saved ? JSON.parse(saved) : [];
  });
  const [showSaveProfile, setShowSaveProfile] = useState(false);
  const [profileName, setProfileName] = useState("");

  const results = useMemo(() => {
    if (devices.length === 0) return null;
    const res = buildCombinations(region, devices, { inverters, panels, batteries }, batteryPreference);
    
    // Log attempt internally
    const attempt: CalculationAttempt = {
      timestamp: new Date().toISOString(),
      location: region,
      devices: [...devices],
      analysis: res.analysis,
      totalCombinationsChecked: res.allLogs.length,
      validSystemsCount: res.systems.length,
      allLogs: res.allLogs,
    };
    
    setInternalLogs(prev => {
      const updated = [attempt, ...prev].slice(0, 50); // Keep last 50
      localStorage.setItem("ss_internal_logs", JSON.stringify(updated));
      return updated;
    });

    return res;
  }, [region, devices, inverters, panels, batteries]);

  // Persist Hardware
  useEffect(() => {
    localStorage.setItem("ss_inverters", JSON.stringify(inverters));
    localStorage.setItem("ss_panels", JSON.stringify(panels));
    localStorage.setItem("ss_batteries", JSON.stringify(batteries));
    localStorage.setItem("ss_profiles", JSON.stringify(profiles));
  }, [inverters, panels, batteries, profiles]);

  const saveProfile = async () => {
    if (!profileName.trim()) return;
    const newProfile: UserProfile = {
      id: crypto.randomUUID(),
      name: profileName,
      timestamp: new Date().toISOString(),
      region,
      batteryPreference,
      devices: [...devices],
    };
    const updated = [newProfile, ...profiles];
    setProfiles(updated);
    
    if (user) {
      try {
        await fetch("/api/user/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: newProfile.id,
            name: newProfile.name,
            region: newProfile.region,
            battery_preference: newProfile.batteryPreference,
            devices: newProfile.devices
          })
        });
      } catch (err) {
        console.error("Failed to save profile to server:", err);
      }
    } else {
      localStorage.setItem("ss_profiles", JSON.stringify(updated));
    }

    setProfileName("");
    setShowSaveProfile(false);
  };

  const deleteProfile = async (id: string) => {
    const updated = profiles.filter((p) => p.id !== id);
    setProfiles(updated);
    
    if (user) {
      try {
        await fetch(`/api/user/profile/${id}`, { method: "DELETE" });
      } catch (err) {
        console.error("Failed to delete profile from server:", err);
      }
    } else {
      localStorage.setItem("ss_profiles", JSON.stringify(updated));
    }
  };

  const saveResult = async (system: SystemCombination) => {
    if (!user) {
      alert("Please sign in to save results.");
      return;
    }

    const name = prompt("Enter a name for this saved result:", `Result - ${new Date().toLocaleDateString()}`);
    if (!name) return;

    const newResult: SavedResult = {
      id: crypto.randomUUID(),
      profile_name: name,
      system_data: system,
      created_at: new Date().toISOString(),
    };

    setSavedResults(prev => [newResult, ...prev]);

    try {
      await fetch("/api/user/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newResult.id,
          profile_name: newResult.profile_name,
          system_data: newResult.system_data
        })
      });
    } catch (err) {
      console.error("Failed to save result to server:", err);
    }
  };

  const deleteResult = async (id: string) => {
    setSavedResults(prev => prev.filter(r => r.id !== id));
    if (user) {
      try {
        await fetch(`/api/user/result/${id}`, { method: "DELETE" });
      } catch (err) {
        console.error("Failed to delete result from server:", err);
      }
    }
  };

  const loadProfile = (p: UserProfile) => {
    setRegion(p.region);
    setBatteryPreference(p.batteryPreference);
    setDevices([...p.devices]);
    setActiveTab("calculator");
  };

  const downloadFile = (content: string, fileName: string, contentType: string) => {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportResults = (results: { analysis: LoadAnalysis; systems: SystemCombination[] }) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const getHourLabel = (hour: number) => {
      if (hour === 0) return "12 AM";
      if (hour === 24) return "12 AM (Midnight)";
      if (hour === 12) return "12 PM";
      return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
    };

    let content = `SOLARSIZER PRO - CALCULATION REPORT\n`;
    content += `Generated: ${new Date().toLocaleString()}\n`;
    content += `Region: ${REGIONS.find(r => r.value === region)?.label}\n`;
    content += `------------------------------------------\n\n`;
    
    content += `LOAD PROFILE SUMMARY\n`;
    content += `Peak Surge: ${results.analysis.max_surge}W\n`;
    content += `Night Usage: ${results.analysis.nighttime_wh}Wh\n`;
    content += `Daily Total: ${results.analysis.total_daily_wh}Wh\n\n`;

    content += `DEVICES LIST\n`;
    devices.forEach(d => {
      content += `- ${d.name}: ${d.qty}x ${d.watts}W (${d.category})\n`;
      content += `  Schedule: ${d.ranges.map(r => `${getHourLabel(r.start)} - ${getHourLabel(r.end)}`).join(", ")}\n`;
    });
    content += `\n`;

    content += `RECOMMENDED SYSTEMS (${results.systems.length} found)\n`;
    results.systems.forEach((sys, i) => {
      content += `\n[System #${i + 1}] ${sys.status === "Optimal" ? "★ " : ""}${sys.inverter}\n`;
      content += `  - Battery: ${sys.battery_config}\n`;
      content += `  - Solar: ${sys.panel_config}\n`;
      content += `  - Estimated Price: ₦${sys.total_price.toLocaleString()}\n`;
    });

    downloadFile(content, `SolarSizer_Report_${timestamp}.txt`, "text/plain");
  };

  const exportHardwareDatabaseJSON = () => {
    const data = { inverters, panels, batteries };
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadFile(JSON.stringify(data, null, 2), `SolarSizer_Hardware_${timestamp}.json`, "application/json");
  };

  const importHardwareDatabase = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        let importedCount = 0;

        if (data.inverters && Array.isArray(data.inverters)) {
          const sanitizedInverters = data.inverters.map((inv: any) => ({
            ...inv,
            id: inv.id || crypto.randomUUID(),
            max_ac_w: Number(inv.max_ac_w) || 0,
            cc_max_pv_w: Number(inv.cc_max_pv_w) || 0,
            cc_max_voc: Number(inv.cc_max_voc) || 0,
            cc_max_amps: Number(inv.cc_max_amps) || 0,
            system_vdc: Number(inv.system_vdc) || 0,
            max_charge_amps: Number(inv.max_charge_amps) || 0,
            cc_type: inv.cc_type === "mppt" ? "mppt" : "pwm",
            price: Number(inv.price) || 0,
          }));
          setInverters(prev => {
            const merged = [...prev];
            sanitizedInverters.forEach(newItem => {
              const index = merged.findIndex(item => item.id === newItem.id);
              if (index !== -1) {
                merged[index] = newItem;
              } else {
                merged.push(newItem);
              }
            });
            return merged;
          });
          if (user) {
            sanitizedInverters.forEach(inv => saveHardwareToServer("inverter", inv));
          }
          importedCount++;
        }

        if (data.panels && Array.isArray(data.panels)) {
          const sanitizedPanels = data.panels.map((p: any) => ({
            ...p,
            id: p.id || crypto.randomUUID(),
            watts: Number(p.watts) || 0,
            voc: Number(p.voc) || 0,
            isc: Number(p.isc) || 0,
            price: Number(p.price) || 0,
          }));
          setPanels(prev => {
            const merged = [...prev];
            sanitizedPanels.forEach(newItem => {
              const index = merged.findIndex(item => item.id === newItem.id);
              if (index !== -1) {
                merged[index] = newItem;
              } else {
                merged.push(newItem);
              }
            });
            return merged;
          });
          if (user) {
            sanitizedPanels.forEach(p => saveHardwareToServer("panel", p));
          }
          importedCount++;
        }

        if (data.batteries && Array.isArray(data.batteries)) {
          const sanitizedBatteries = data.batteries.map((b: any) => ({
            ...b,
            id: b.id || crypto.randomUUID(),
            voltage: Number(b.voltage) || 0,
            capacity_ah: Number(b.capacity_ah) || 0,
            min_c_rate: Number(b.min_c_rate) || 0.1,
            price: Number(b.price) || 0,
          }));
          setBatteries(prev => {
            const merged = [...prev];
            sanitizedBatteries.forEach(newItem => {
              const index = merged.findIndex(item => item.id === newItem.id);
              if (index !== -1) {
                merged[index] = newItem;
              } else {
                merged.push(newItem);
              }
            });
            return merged;
          });
          if (user) {
            sanitizedBatteries.forEach(b => saveHardwareToServer("battery", b));
          }
          importedCount++;
        }

        if (importedCount > 0) {
          alert("Hardware database updated successfully!");
        } else {
          alert("Invalid hardware database file format. Please ensure it contains 'inverters', 'panels', or 'batteries' arrays.");
        }
      } catch (err) {
        alert("Failed to parse the file. Please ensure it is a valid JSON.");
      }
    };
    reader.readAsText(file);
  };

  const exportProfilesJSON = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadFile(JSON.stringify(profiles, null, 2), `SolarSizer_Profiles_${timestamp}.json`, "application/json");
  };

  const importProfiles = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (Array.isArray(data)) {
          setProfiles([...profiles, ...data]);
          alert("Profiles imported successfully!");
        } else {
          alert("Invalid profiles file format.");
        }
      } catch (err) {
        alert("Failed to parse the file. Please ensure it is a valid JSON.");
      }
    };
    reader.readAsText(file);
  };

  const exportFullLogs = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let content = `SOLARSIZER PRO - FULL CALCULATION LOGS\n`;
    content += `Exported: ${new Date().toLocaleString()}\n`;
    content += `------------------------------------------\n\n`;

    internalLogs.forEach((log, i) => {
      content += `LOG ATTEMPT #${i + 1} - ${new Date(log.timestamp).toLocaleString()}\n`;
      content += `Region: ${log.location}\n`;
      content += `Devices: ${log.devices.length}\n`;
      content += `Analysis: Surge=${log.analysis.max_surge}W, Night=${log.analysis.nighttime_wh}Wh, Daily=${log.analysis.total_daily_wh}Wh\n`;
      content += `Checked: ${log.totalCombinationsChecked}, Valid: ${log.validSystemsCount}\n`;
      content += `--- LOG TRACE ---\n`;
      log.allLogs.forEach(path => {
        content += path.join("\n") + "\n---\n";
      });
      content += `\n==========================================\n\n`;
    });

    downloadFile(content, `SolarSizer_Full_Logs_${timestamp}.txt`, "text/plain");
  };

  const exportSingleLog = (log: CalculationAttempt) => {
    const timestamp = new Date(log.timestamp).toISOString().replace(/[:.]/g, '-');
    let content = `SOLARSIZER PRO - CALCULATION LOG ATTEMPT\n`;
    content += `Timestamp: ${new Date(log.timestamp).toLocaleString()}\n`;
    content += `Region: ${log.location}\n`;
    content += `------------------------------------------\n\n`;
    
    content += `DEVICES LIST\n`;
    log.devices.forEach(d => {
      content += `- ${d.name}: ${d.qty}x ${d.watts}W\n`;
    });
    content += `\n`;

    content += `ANALYSIS SUMMARY\n`;
    content += `Peak Surge: ${log.analysis.max_surge}W\n`;
    content += `Night Usage: ${log.analysis.nighttime_wh}Wh\n`;
    content += `Daily Total: ${log.analysis.total_daily_wh}Wh\n\n`;

    content += `CALCULATION STATS\n`;
    content += `Total Combinations Checked: ${log.totalCombinationsChecked}\n`;
    content += `Valid Systems Found: ${log.validSystemsCount}\n\n`;

    content += `--- FULL LOG TRACE ---\n`;
    log.allLogs.forEach((path, i) => {
      content += `Path #${i + 1}:\n`;
      content += path.join("\n") + "\n---\n";
    });

    downloadFile(content, `SolarSizer_Log_${timestamp}.txt`, "text/plain");
  };


  const exportHardwareDatabase = () => {
    const timestamp = new Date().toISOString().split('T')[0];
    let content = `# Solar Sizing Hardware Database Export\n`;
    content += `Generated on: ${new Date().toLocaleString()}\n\n`;

    content += `## 1. INVERTERS\n`;
    content += `| Name | Max AC (W) | DC Volts (V) | PV Input (W) | CC Type | Max Charge (A) | Price (₦) |\n`;
    content += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    inverters.forEach(inv => {
      content += `| ${inv.name} | ${inv.max_ac_w} | ${inv.system_vdc} | ${inv.cc_max_pv_w} | ${(inv.cc_type || "pwm").toUpperCase()} | ${inv.max_charge_amps} | ${inv.price.toLocaleString()} |\n`;
    });
    content += `\n`;

    content += `## 2. SOLAR PANELS\n`;
    content += `| Name | Watts (W) | Voc (V) | Isc (A) | Price (₦) |\n`;
    content += `| :--- | :--- | :--- | :--- | :--- |\n`;
    panels.forEach(p => {
      content += `| ${p.name} | ${p.watts} | ${p.voc} | ${p.isc} | ${p.price.toLocaleString()} |\n`;
    });
    content += `\n`;

    content += `## 3. BATTERIES\n`;
    content += `| Name | Voltage (V) | Capacity (Ah) | Type | Min C-Rate | Price (₦) |\n`;
    content += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    batteries.forEach(b => {
      content += `| ${b.name} | ${b.voltage} | ${b.capacity_ah} | ${b.type} | ${b.min_c_rate} | ${b.price.toLocaleString()} |\n`;
    });

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Solar_Hardware_Database_${timestamp}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const addDevice = () => {
    if (!newDevice.name || !newDevice.watts || (newDevice.ranges?.length === 0 && !newRange)) return;
    
    const finalRanges = [...(newDevice.ranges || [])];
    // If user hasn't added any ranges yet but has values in the range inputs, add it automatically
    if (finalRanges.length === 0) {
      finalRanges.push({ ...newRange });
    }

    const device: Device = {
      id: crypto.randomUUID(),
      name: newDevice.name || "Unnamed Device",
      category: newDevice.category as DeviceCategory,
      qty: newDevice.qty || 1,
      watts: newDevice.watts || 0,
      ranges: finalRanges,
    };
    setDevices([...devices, device]);
    setNewDevice({
      name: "",
      category: "electronics",
      qty: 1,
      watts: 0,
      ranges: [],
    });
    setNewRange({ start: 18, end: 23 });
  };

  const addRange = () => {
    setNewDevice({
      ...newDevice,
      ranges: [...(newDevice.ranges || []), { ...newRange }],
    });
  };

  const removeRange = (index: number) => {
    setNewDevice({
      ...newDevice,
      ranges: (newDevice.ranges || []).filter((_, i) => i !== index),
    });
  };

  const removeDevice = (id: string) => {
    setDevices(devices.filter((d) => d.id !== id));
  };

  const deleteHardware = async (type: "inverter" | "panel" | "battery", id: string) => {
    if (type === "inverter") setInverters(inverters.filter(i => i.id !== id));
    if (type === "panel") setPanels(panels.filter(p => p.id !== id));
    if (type === "battery") setBatteries(batteries.filter(b => b.id !== id));
    
    if (user) {
      try {
        await fetch(`/api/user/hardware/${id}`, { method: "DELETE" });
      } catch (err) {
        console.error("Failed to delete hardware from server:", err);
      }
    }
  };

  const startEditing = (type: "inverter" | "panel" | "battery", item: any) => {
    setEditingHardware({ type, id: item.id });
    setShowAddHardware(type);
  };

  const duplicateHardware = (type: "inverter" | "panel" | "battery", item: any) => {
    const newItem = {
      ...item,
      id: crypto.randomUUID(),
      name: `${item.name} (Copy)`
    };
    if (type === "inverter") setInverters([...inverters, newItem]);
    if (type === "panel") setPanels([...panels, newItem]);
    if (type === "battery") setBatteries([...batteries, newItem]);
    
    if (user) saveHardwareToServer(type, newItem);
  };

  const generateQuote = (sys: SystemCombination) => {
    const date = new Date().toLocaleDateString();
    const quoteId = `QT-${Math.floor(100000 + Math.random() * 900000)}`;
    
    // Use adjusted advice if available
    let finalAdvice = sys.advice;
    if (adjustedLoad && sys.status === "Conditional") {
      if (adjustedLoad.deficit === 0) {
        finalAdvice = "Perfect Match (Lifestyle Adjusted): Your modified usage schedule now fits this system's capacity perfectly.";
      } else {
        finalAdvice = `Conditional (Lifestyle Adjusted): With your current adjustments, you still have a small deficit of ${adjustedLoad.deficit.toFixed(0)}Wh. Further minor cuts or grid support needed.`;
      }
    }

    const quoteContent = `
=========================================
          SOLARSIZER PRO QUOTE
=========================================
Quote ID: ${quoteId}
Date: ${date}
Location: ${REGIONS.find(r => r.value === region)?.label}
-----------------------------------------

SYSTEM SPECIFICATIONS:
- Status: ${sys.status}
- Advice: ${finalAdvice}
- Inverter: ${sys.inverter}
- Battery Bank: ${sys.battery_config}
- Solar Array: ${sys.panel_config} (${sys.array_size_w}W)
- Est. Daily Yield: ${sys.daily_yield.toFixed(0)}Wh

ITEMIZED COST BREAKDOWN:
1. Inverter Unit:           ₦${sys.inverter_price.toLocaleString()}
2. Battery Storage Bank:    ₦${sys.battery_price.toLocaleString()}
3. Solar PV Array:          ₦${sys.panel_price.toLocaleString()}
-----------------------------------------
TOTAL INVESTMENT:           ₦${sys.total_price.toLocaleString()}

-----------------------------------------
INVOICE SUMMARY:
Subtotal:                   ₦${sys.total_price.toLocaleString()}
VAT (7.5%):                 ₦${(sys.total_price * 0.075).toLocaleString()}
-----------------------------------------
GRAND TOTAL:                ₦${(sys.total_price * 1.075).toLocaleString()}

=========================================
Thank you for choosing SolarSizer Pro!
This quote is valid for 14 days.
=========================================
    `.trim();

    const getHourLabel = (hour: number) => {
      if (hour === 0) return "12 AM";
      if (hour === 24) return "12 AM (Midnight)";
      if (hour === 12) return "12 PM";
      return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
    };

    const usageDevices = adjustedLoad?.devices || devices;
    const usageContent = `
=========================================
          LOAD PROFILE & USAGE
=========================================
Quote ID: ${quoteId}
Date: ${date}
-----------------------------------------

DEVICE SCHEDULE:
${usageDevices.map(d => `
- ${d.name} (${d.watts}W x ${d.qty})
  Schedule: ${d.ranges.map(r => `${getHourLabel(r.start)} - ${getHourLabel(r.end)}`).join(", ")}
`).join("")}

-----------------------------------------
ENERGY ANALYSIS:
Original Daily Load: ${results?.analysis.total_daily_wh.toFixed(0)}Wh
System Daily Yield: ${sys.daily_yield.toFixed(0)}Wh
Remaining Deficit: ${adjustedLoad ? adjustedLoad.deficit.toFixed(0) : sys.deficit.toFixed(0)}Wh
=========================================
    `.trim();

    const downloadFile = (content: string, filename: string) => {
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    downloadFile(quoteContent, `SolarSizer_Quote_${quoteId}.txt`);
    downloadFile(usageContent, `SolarSizer_Usage_${quoteId}.txt`);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F4] text-[#1C1917] font-sans selection:bg-emerald-100">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <Sun className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">SolarSizer <span className="text-emerald-600">Pro</span></h1>
          </div>
          
          <nav className="hidden md:flex items-center bg-stone-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab("calculator")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === "calculator" ? "bg-white shadow-sm text-emerald-600" : "text-stone-500 hover:text-stone-900"}`}
            >
              <Calculator className="w-4 h-4" /> Calculator
            </button>
            {user && (
              <>
                <button 
                  onClick={() => setActiveTab("profiles")}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === "profiles" ? "bg-white shadow-sm text-emerald-600" : "text-stone-500 hover:text-stone-900"}`}
                >
                  <FolderOpen className="w-4 h-4" /> Profiles
                </button>
                <button 
                  onClick={() => setActiveTab("results")}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === "results" ? "bg-white shadow-sm text-emerald-600" : "text-stone-500 hover:text-stone-900"}`}
                >
                  <Save className="w-4 h-4" /> Results
                </button>
                <button 
                  onClick={() => setActiveTab("database")}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === "database" ? "bg-white shadow-sm text-emerald-600" : "text-stone-500 hover:text-stone-900"}`}
                >
                  <Database className="w-4 h-4" /> Hardware DB
                </button>
                {isDeveloper && (
                  <button 
                    onClick={() => setActiveTab("logs")}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === "logs" ? "bg-white shadow-sm text-emerald-600" : "text-stone-500 hover:text-stone-900"}`}
                  >
                    <Terminal className="w-4 h-4" /> Logs
                  </button>
                )}
              </>
            )}
          </nav>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowSaveProfile(true)}
              className="hidden md:flex bg-emerald-600 text-white px-4 py-2 rounded-full hover:bg-emerald-700 transition-colors items-center gap-2 text-sm font-medium"
            >
              <Save className="w-4 h-4" /> Save Profile
            </button>
            <div className="hidden md:block h-6 w-px bg-stone-200" />
            <Auth 
              onUserChange={setUser} 
              onTabChange={setActiveTab}
              isDeveloper={isDeveloper || false}
            />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === "calculator" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Configuration */}
            <div className="lg:col-span-5 space-y-8">
            
            {/* Region & Battery Preference */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-5 h-5 text-emerald-600" />
                  <h2 className="font-semibold text-lg">Project Location</h2>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {REGIONS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setRegion(r.value)}
                      className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                        region === r.value 
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900" 
                          : "border-stone-200 hover:border-stone-300 bg-stone-50"
                      }`}
                    >
                      <span className="font-medium">{r.label}</span>
                      {region === r.value && <CheckCircle2 className="w-5 h-5" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-6 border-t border-stone-100">
                <div className="flex items-center gap-2 mb-4">
                  <BatteryIcon className="w-5 h-5 text-emerald-600" />
                  <h2 className="font-semibold text-lg">Battery Preference</h2>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["any", "lithium", "lead-acid"] as BatteryPreference[]).map((pref) => (
                    <button
                      key={pref}
                      onClick={() => setBatteryPreference(pref)}
                      className={`px-4 py-2 rounded-xl border text-xs font-bold uppercase transition-all ${
                        batteryPreference === pref 
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900" 
                          : "border-stone-200 hover:border-stone-300 bg-stone-50 text-stone-500"
                      }`}
                    >
                      {pref.replace("-", " ")}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Device Input */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
              <div className="flex items-center gap-2 mb-6">
                <Zap className="w-5 h-5 text-emerald-600" />
                <h2 className="font-semibold text-lg">Load Profile</h2>
              </div>

              <div className="space-y-4 mb-8">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Device Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Living Room AC"
                      value={newDevice.name}
                      onChange={e => setNewDevice({...newDevice, name: e.target.value})}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Category</label>
                    <select 
                      value={newDevice.category}
                      onChange={e => setNewDevice({...newDevice, category: e.target.value as DeviceCategory})}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Quantity</label>
                    <input 
                      type="number" 
                      min="1"
                      value={newDevice.qty}
                      onChange={e => setNewDevice({...newDevice, qty: parseInt(e.target.value) || 1})}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Watts (per unit)</label>
                    <input 
                      type="number" 
                      placeholder="60"
                      value={newDevice.watts || ""}
                      onChange={e => setNewDevice({...newDevice, watts: parseInt(e.target.value) || 0})}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div className="col-span-2 space-y-4">
                    <div className="flex items-end gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Start Hour</label>
                        <select 
                          value={newRange.start}
                          onChange={e => setNewRange({...newRange, start: parseInt(e.target.value)})}
                          className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                        >
                          {HOUR_OPTIONS.slice(0, 24).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">End Hour</label>
                        <select 
                          value={newRange.end}
                          onChange={e => setNewRange({...newRange, end: parseInt(e.target.value)})}
                          className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                        >
                          {HOUR_OPTIONS.slice(1).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </div>
                      <button 
                        onClick={addRange}
                        className="p-2.5 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors"
                        title="Add Time Range"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Temporary Ranges List */}
                    {newDevice.ranges && newDevice.ranges.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {newDevice.ranges.map((r, i) => (
                          <div key={i} className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-100">
                            <span>{getHourLabel(r.start)} - {getHourLabel(r.end)}</span>
                            <button onClick={() => removeRange(i)} className="hover:text-emerald-900">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button 
                  onClick={addDevice}
                  className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                >
                  <Plus className="w-5 h-5" /> Add to Profile
                </button>
              </div>

              {/* Device List */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">Current Load Items</h3>
                <AnimatePresence mode="popLayout">
                  {devices.length === 0 ? (
                    <div className="text-center py-8 text-stone-400 border-2 border-dashed border-stone-100 rounded-2xl">
                      No devices added yet
                    </div>
                  ) : (
                    devices.map((d) => (
                      <motion.div
                        key={d.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex items-center justify-between p-3 bg-stone-50 border border-stone-200 rounded-xl group"
                      >
                        <div>
                          <p className="font-semibold text-sm">{d.name}</p>
                          <div className="flex flex-wrap gap-x-2 text-xs text-stone-500">
                            <span>{d.qty}x {d.watts}W</span>
                            <span className="text-stone-300">•</span>
                            <div className="flex gap-1">
                              {d.ranges.map((r, i) => (
                                <span key={i}>{getHourLabel(r.start)}-{getHourLabel(r.end)}{i < d.ranges.length - 1 ? "," : ""}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={() => removeDevice(d.id)}
                          className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </section>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-7 space-y-8">
            {!results ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-white rounded-3xl border border-stone-200 border-dashed">
                <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-4">
                  <Calculator className="w-8 h-8 text-stone-400" />
                </div>
                <h3 className="text-xl font-bold mb-2">Ready to Calculate</h3>
                <p className="text-stone-500 max-w-xs">
                  Add your devices and select your region to see optimal solar configurations.
                </p>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                {/* Analysis Summary */}
                <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                    <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Peak Surge</p>
                    <p className="text-2xl font-bold text-stone-900">{results.analysis.max_surge}W</p>
                    <div className="mt-2 flex items-center gap-1 text-xs text-stone-400">
                      <Info className="w-3 h-3" />
                      <span>Critical for Inverter sizing</span>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                    <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Night Usage</p>
                    <p className="text-2xl font-bold text-stone-900">{results.analysis.nighttime_wh}Wh</p>
                    <div className="mt-2 flex items-center gap-1 text-xs text-stone-400">
                      <Info className="w-3 h-3" />
                      <span>Critical for Battery sizing</span>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                    <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Daily Total</p>
                    <p className="text-2xl font-bold text-stone-900">{results.analysis.total_daily_wh}Wh</p>
                    <div className="mt-2 flex items-center gap-1 text-xs text-stone-400">
                      <Info className="w-3 h-3" />
                      <span>Critical for Panel sizing</span>
                    </div>
                  </div>
                </section>

                {/* System Options */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-xl flex items-center gap-2">
                      <BatteryIcon className="w-6 h-6 text-emerald-600" />
                      Recommended Systems
                    </h2>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-stone-500">{results.systems.length} configurations found</span>
                      <button 
                        onClick={() => exportResults(results)}
                        className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-emerald-100 transition-all border border-emerald-100"
                      >
                        <Download className="w-3.5 h-3.5" /> Export Report
                      </button>
                    </div>
                  </div>

                  {results.systems.length === 0 ? (
                    <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl flex gap-4">
                      <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                      <div>
                        <h4 className="font-bold text-amber-900">No Matching Systems</h4>
                        <p className="text-sm text-amber-700 mt-1">
                          Your load requirements exceed the safety limits of our current hardware database. 
                          Try reducing your peak load or nighttime usage.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {results.systems.map((sys, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 hover:border-emerald-500 transition-all group relative overflow-hidden"
                        >
                          {idx === 0 && (
                            <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-bl-xl">
                              Best Value
                            </div>
                          )}
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="space-y-4 flex-1">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-stone-100 rounded-lg">
                                  <Zap className="w-5 h-5 text-stone-600" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-lg">{sys.inverter}</h3>
                                    {sys.status === "Optimal" ? (
                                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase rounded-full flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3" /> Perfect Match
                                      </span>
                                    ) : sys.status === "High Risk" ? (
                                      <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold uppercase rounded-full flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" /> High Risk
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase rounded-full flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" /> Budget Option
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Hybrid System Core</p>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex items-start gap-2">
                                  <BatteryIcon className="w-4 h-4 text-emerald-600 mt-0.5" />
                                  <div>
                                    <p className="text-sm font-semibold">{sys.battery_config}</p>
                                    <p className="text-xs text-stone-500">Storage Configuration</p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2">
                                  <Sun className="w-4 h-4 text-amber-500 mt-0.5" />
                                  <div>
                                    <p className="text-sm font-semibold">{sys.panel_config}</p>
                                    <p className="text-xs text-stone-500">{sys.array_size_w}W Array • {sys.daily_yield.toFixed(0)}Wh/day</p>
                                  </div>
                                </div>
                              </div>

                              {/* Advice Section */}
                              <div className={`p-3 rounded-xl text-xs flex gap-2 items-start ${
                                sys.status === 'Optimal' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 
                                sys.status === 'High Risk' ? 'bg-red-50 text-red-800 border border-red-100' :
                                'bg-amber-50 text-amber-800 border border-amber-100'
                              }`}>
                                {sys.status === 'Optimal' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Info className="w-4 h-4 shrink-0" />}
                                <p>{sys.advice}</p>
                              </div>
                            </div>

                            <div className="md:text-right pt-4 md:pt-0 border-t md:border-t-0 border-stone-100">
                              <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-1">Estimated Cost</p>
                              <p className="text-3xl font-black text-stone-900">
                                <span className="text-sm font-bold mr-1">NGN</span>
                                {sys.total_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                              <div className="mt-4 flex flex-col gap-2">
                                <button 
                                  onClick={() => setSelectedSystemLog(sys.log)}
                                  className="w-full md:w-auto px-6 py-2.5 bg-stone-100 text-stone-900 rounded-xl font-semibold hover:bg-stone-200 transition-all flex items-center justify-center gap-2"
                                >
                                  <ListIcon className="w-4 h-4" /> View Log
                                </button>
                                <button 
                                  onClick={() => setSelectedSystemDetails(sys)}
                                  className="w-full md:w-auto px-6 py-2.5 bg-stone-900 text-white rounded-xl font-semibold hover:bg-stone-800 transition-all flex items-center justify-center gap-2"
                                >
                                  View Details <ChevronRight className="w-4 h-4" />
                                </button>
                                {user && (
                                  <button 
                                    onClick={() => saveResult(sys)}
                                    className="w-full md:w-auto px-6 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl font-semibold hover:bg-emerald-100 transition-all flex items-center justify-center gap-2"
                                  >
                                    <Save className="w-4 h-4" /> Save Result
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </section>
              </motion.div>
            )}
          </div>
        </div>
      )}

        {activeTab === "database" && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Hardware Database</h2>
                <p className="text-stone-500">Manage the components used in calculations.</p>
              </div>
              <div className="flex gap-2">
                <Tooltip content={`{
  "inverters": [{"name": "...", "max_ac_w": 5000, ...}],
  "panels": [{"name": "...", "watts": 400, ...}],
  "batteries": [{"name": "...", "voltage": 48, ...}]
}`}>
                  <label className="bg-stone-100 text-stone-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-stone-200 transition-all border border-stone-200 cursor-pointer">
                    <Upload className="w-4 h-4" /> Import JSON
                    <input type="file" accept=".json" onChange={importHardwareDatabase} className="hidden" />
                  </label>
                </Tooltip>
                <button 
                  onClick={exportHardwareDatabaseJSON}
                  className="bg-stone-100 text-stone-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-stone-200 transition-all border border-stone-200"
                >
                  <Download className="w-4 h-4" /> Export JSON
                </button>
                <button 
                  onClick={exportHardwareDatabase}
                  className="bg-stone-100 text-stone-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-stone-200 transition-all border border-stone-200"
                >
                  <Download className="w-4 h-4" /> Export MD
                </button>
                <button onClick={() => setShowAddHardware("inverter")} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all">
                  <Plus className="w-4 h-4" /> Add Inverter
                </button>
                <button onClick={() => setShowAddHardware("panel")} className="bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-amber-600 transition-all">
                  <Plus className="w-4 h-4" /> Add Panel
                </button>
                <button onClick={() => setShowAddHardware("battery")} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition-all">
                  <Plus className="w-4 h-4" /> Add Battery
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Inverters */}
              <div className="space-y-4">
                <h3 className="font-bold flex items-center gap-2 text-stone-700">
                  <Cpu className="w-5 h-5 text-emerald-600" /> Inverters
                </h3>
                <div className="space-y-3">
                  {inverters.map((inv) => (
                    <div key={inv.id} className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm group relative">
                      <div className="flex justify-between items-start mb-2">
                        <p className="font-bold">{inv.name}</p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => duplicateHardware("inverter", inv)} className="p-1.5 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Duplicate"><Copy className="w-3.5 h-3.5" /></button>
                          <button onClick={() => startEditing("inverter", inv)} className="p-1.5 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Edit"><Settings className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteHardware("inverter", inv.id)} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-stone-500">
                        <span>Max AC: {inv.max_ac_w}W</span>
                        <span>DC Volts: {inv.system_vdc}V</span>
                        <span>PV Input: {inv.cc_max_pv_w}W</span>
                        <span className="uppercase">CC: {inv.cc_type || "pwm"}</span>
                        <span>Price: ₦{inv.price.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Panels */}
              <div className="space-y-4">
                <h3 className="font-bold flex items-center gap-2 text-stone-700">
                  <Sun className="w-5 h-5 text-amber-500" /> Solar Panels
                </h3>
                <div className="space-y-3">
                  {panels.map((p) => (
                    <div key={p.id} className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm group relative">
                      <div className="flex justify-between items-start mb-2">
                        <p className="font-bold">{p.name}</p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => duplicateHardware("panel", p)} className="p-1.5 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Duplicate"><Copy className="w-3.5 h-3.5" /></button>
                          <button onClick={() => startEditing("panel", p)} className="p-1.5 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Edit"><Settings className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteHardware("panel", p.id)} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-stone-500">
                        <span>Watts: {p.watts}W</span>
                        <span>Voc: {p.voc}V</span>
                        <span>Isc: {p.isc}A</span>
                        <span>Price: ₦{p.price.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Batteries */}
              <div className="space-y-4">
                <h3 className="font-bold flex items-center gap-2 text-stone-700">
                  <BatteryIcon className="w-5 h-5 text-blue-600" /> Batteries
                </h3>
                <div className="space-y-3">
                  {batteries.map((b) => (
                    <div key={b.id} className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm group relative">
                      <div className="flex justify-between items-start mb-2">
                        <p className="font-bold">{b.name}</p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => duplicateHardware("battery", b)} className="p-1.5 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Duplicate"><Copy className="w-3.5 h-3.5" /></button>
                          <button onClick={() => startEditing("battery", b)} className="p-1.5 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Edit"><Settings className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteHardware("battery", b.id)} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-stone-500">
                        <span>{b.voltage}V {b.capacity_ah}Ah</span>
                        <span>Type: {b.type}</span>
                        <span>C-Rate: {b.min_c_rate}</span>
                        <span>Price: ₦{b.price.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "logs" && isDeveloper && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Internal Developer Logs</h2>
                <p className="text-stone-500">Historical calculation attempts and internal logic traces.</p>
              </div>
              <button 
                onClick={exportFullLogs}
                className="bg-stone-100 text-stone-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-stone-200 transition-all border border-stone-200"
              >
                <Download className="w-4 h-4" /> Export Full Logs
              </button>
            </div>

            <div className="space-y-4">
              {internalLogs.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-stone-200">
                  <Activity className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                  <p className="text-stone-400">No calculation attempts recorded yet.</p>
                </div>
              ) : (
                internalLogs.map((log, i) => (
                  <div key={i} className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-stone-100 rounded-lg">
                          <Terminal className="w-4 h-4 text-stone-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{new Date(log.timestamp).toLocaleString()}</p>
                          <p className="text-xs text-stone-500">{log.location} • {log.devices.length} devices</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex gap-4 text-xs font-bold uppercase tracking-wider">
                          <div className="text-stone-400">Checked: <span className="text-stone-900">{log.totalCombinationsChecked}</span></div>
                          <div className="text-emerald-500">Valid: <span className="text-emerald-600">{log.validSystemsCount}</span></div>
                        </div>
                        <button 
                          onClick={() => exportSingleLog(log)}
                          className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Export this log"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div className="p-3 bg-stone-50 rounded-xl">
                        <p className="text-stone-400 mb-1">Surge</p>
                        <p className="font-bold">{log.analysis.max_surge}W</p>
                      </div>
                      <div className="p-3 bg-stone-50 rounded-xl">
                        <p className="text-stone-400 mb-1">Night Wh</p>
                        <p className="font-bold">{log.analysis.nighttime_wh}Wh</p>
                      </div>
                      <div className="p-3 bg-stone-50 rounded-xl">
                        <p className="text-stone-400 mb-1">Daily Wh</p>
                        <p className="font-bold">{log.analysis.total_daily_wh}Wh</p>
                      </div>
                    </div>

                    <details className="group">
                      <summary className="text-xs font-bold text-emerald-600 cursor-pointer hover:underline">
                        View Full Logic Trace ({log.allLogs.length} paths)
                      </summary>
                      <div className="mt-4 space-y-4 max-h-60 overflow-y-auto p-4 bg-stone-900 rounded-xl">
                        {log.allLogs.map((path, pi) => (
                          <div key={pi} className="border-l-2 border-stone-700 pl-4 space-y-1">
                            {path.map((line, li) => (
                              <p key={li} className="text-[10px] font-mono text-stone-400">{line}</p>
                            ))}
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {activeTab === "profiles" && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Saved Profiles</h2>
                <p className="text-stone-500">Quickly reuse your settings and load profiles.</p>
              </div>
              <div className="flex gap-2">
                <Tooltip content={`[
  {
    "name": "My Home",
    "region": "SW",
    "devices": [{"name": "TV", "watts": 100, ...}]
  }
]`}>
                  <label className="bg-stone-100 text-stone-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-stone-200 transition-all border border-stone-200 cursor-pointer">
                    <Upload className="w-4 h-4" /> Import Profiles
                    <input type="file" accept=".json" onChange={importProfiles} className="hidden" />
                  </label>
                </Tooltip>
                <button 
                  onClick={exportProfilesJSON}
                  className="bg-stone-100 text-stone-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-stone-200 transition-all border border-stone-200"
                >
                  <Download className="w-4 h-4" /> Export Profiles
                </button>
                <button 
                  onClick={() => setShowSaveProfile(true)}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all"
                >
                  <Save className="w-4 h-4" /> Save Current
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {profiles.length === 0 ? (
                <div className="col-span-full text-center py-20 bg-white rounded-3xl border border-dashed border-stone-200">
                  <UserCircle className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                  <p className="text-stone-400">No profiles saved yet.</p>
                </div>
              ) : (
                profiles.map((p) => (
                  <div key={p.id} className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm hover:border-emerald-500 transition-all group">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-50 rounded-lg">
                          <UserCircle className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg">{p.name}</h3>
                          <p className="text-xs text-stone-400">{new Date(p.timestamp).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => deleteProfile(p.id)}
                        className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-3 mb-6">
                      <div className="flex items-center gap-2 text-xs text-stone-600">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{REGIONS.find(r => r.value === p.region)?.label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-stone-600">
                        <BatteryIcon className="w-3.5 h-3.5" />
                        <span className="capitalize">{p.batteryPreference.replace("-", " ")} Preference</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-stone-600">
                        <Zap className="w-3.5 h-3.5" />
                        <span>{p.devices.length} Devices in Load Profile</span>
                      </div>
                    </div>

                    <button 
                      onClick={() => loadProfile(p)}
                      className="w-full py-2.5 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 transition-all flex items-center justify-center gap-2"
                    >
                      <FolderOpen className="w-4 h-4" /> Load Profile
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {activeTab === "results" && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Saved Results</h2>
                <p className="text-stone-500">Access your previously saved system configurations.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {savedResults.length === 0 ? (
                <div className="col-span-full text-center py-20 bg-white rounded-3xl border border-dashed border-stone-200">
                  <Save className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                  <p className="text-stone-400">No saved results yet.</p>
                </div>
              ) : (
                savedResults.map((r) => (
                  <div key={r.id} className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm hover:border-emerald-500 transition-all group">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-50 rounded-lg">
                          <Zap className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg">{r.profile_name}</h3>
                          <p className="text-xs text-stone-400">{new Date(r.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => deleteResult(r.id)}
                        className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-3 mb-6">
                      <div className="flex items-center gap-2 text-xs text-stone-600">
                        <Cpu className="w-3.5 h-3.5" />
                        <span>{r.system_data.inverter}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-stone-600">
                        <BatteryIcon className="w-3.5 h-3.5" />
                        <span>{r.system_data.battery_config}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-stone-600">
                        <Sun className="w-3.5 h-3.5" />
                        <span>{r.system_data.panel_config}</span>
                      </div>
                      <div className="pt-2 border-t border-stone-100 flex justify-between items-center">
                        <span className="text-xs font-bold text-stone-400">Total Price</span>
                        <span className="text-sm font-black text-stone-900">₦{r.system_data.total_price.toLocaleString()}</span>
                      </div>
                    </div>

                    <button 
                      onClick={() => {
                        setSelectedSystemDetails(r.system_data);
                      }}
                      className="w-full py-2.5 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 transition-all flex items-center justify-center gap-2"
                    >
                      View Details
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Save Profile Modal */}
      <AnimatePresence>
        {showSaveProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between">
                <h2 className="font-bold text-xl">Save Load Profile</h2>
                <button onClick={() => setShowSaveProfile(false)} className="p-2 hover:bg-stone-100 rounded-full"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-stone-500">
                  Save your current region, battery preferences, and device list as a reusable profile.
                </p>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Profile Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. My Home Setup"
                    value={profileName}
                    onChange={e => setProfileName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    autoFocus
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    onClick={() => setShowSaveProfile(false)}
                    className="flex-1 py-3 bg-stone-100 text-stone-900 rounded-xl font-bold hover:bg-stone-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={saveProfile}
                    disabled={!profileName.trim()}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save Profile
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-white border-t border-stone-200 mt-12 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-emerald-600 rounded flex items-center justify-center">
                  <Sun className="text-white w-4 h-4" />
                </div>
                <h2 className="font-bold tracking-tight">SolarSizer Pro</h2>
              </div>
              <p className="text-stone-500 text-sm max-w-sm">
                Advanced solar sizing algorithms based on real-world meteorological data and hardware specifications. 
                Always consult with a certified engineer before installation.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-sm uppercase tracking-wider mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-stone-500">
                <li><a href="#" className="hover:text-emerald-600">Installation Guide</a></li>
                <li><a href="#" className="hover:text-emerald-600">Battery Safety</a></li>
                <li><a href="#" className="hover:text-emerald-600">Panel Efficiency</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-sm uppercase tracking-wider mb-4">Support</h4>
              <ul className="space-y-2 text-sm text-stone-500">
                <li><a href="#" className="hover:text-emerald-600">Contact Experts</a></li>
                <li><a href="#" className="hover:text-emerald-600">Hardware Partners</a></li>
                <li><a href="#" className="hover:text-emerald-600">API Documentation</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-stone-100 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-stone-400">
            <p>© 2026 SolarSizer Pro. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-stone-600">Privacy Policy</a>
              <a href="#" className="hover:text-stone-600">Terms of Service</a>
              <a href="#" className="hover:text-stone-600">Cookie Settings</a>
            </div>
          </div>
        </div>
      </footer>

      {/* System Details Modal */}
      <AnimatePresence>
        {selectedSystemDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-emerald-600 text-white">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6" />
                  <h2 className="font-bold text-xl">System Configuration Details</h2>
                </div>
                <button 
                  onClick={() => { 
                    setSelectedSystemDetails(null); 
                    setShowInteractiveBridge(false); 
                    setAdjustedLoad(null);
                  }}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-3 p-4 rounded-2xl flex items-start gap-3 border transition-colors bg-stone-50 border-stone-100">
                    {selectedSystemDetails.status === "Optimal" ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                    ) : selectedSystemDetails.status === "High Risk" ? (
                      <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <h4 className={`font-bold text-sm uppercase tracking-wider ${
                        selectedSystemDetails.status === "Optimal" ? "text-emerald-700" : 
                        selectedSystemDetails.status === "High Risk" ? "text-red-700" :
                        "text-amber-700"
                      }`}>
                        {selectedSystemDetails.status === "Optimal" ? "Perfect Match" : 
                         selectedSystemDetails.status === "High Risk" ? "High Risk Configuration" :
                         "Conditional Recommendation"}
                      </h4>
                      <p className="text-sm text-stone-600 mt-1">{selectedSystemDetails.advice}</p>
                      {selectedSystemDetails.status === "Conditional" && !showInteractiveBridge && (
                        <button 
                          onClick={() => setShowInteractiveBridge(true)}
                          className="mt-3 px-4 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 transition-all flex items-center gap-2"
                        >
                          <Activity className="w-3 h-3" /> Bridge the Gap Interactively
                        </button>
                      )}
                    </div>
                  </div>

                  {showInteractiveBridge && selectedSystemDetails.status === "Conditional" ? (
                    <div className="md:col-span-3">
                      <InteractiveBridge 
                        devices={devices} 
                        initialDeficit={selectedSystemDetails.deficit} 
                        onClose={() => setShowInteractiveBridge(false)} 
                        onChange={(adj, def) => setAdjustedLoad({ devices: adj, deficit: def })}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100">
                    <Cpu className="w-8 h-8 text-emerald-600 mb-4" />
                    <h3 className="font-bold text-lg mb-1">{selectedSystemDetails.inverter}</h3>
                    <p className="text-sm text-stone-500">Central Power Unit</p>
                    <div className="mt-4 space-y-2 text-xs">
                      <div className="flex justify-between"><span>AC Output</span><span className="font-bold">Pure Sine Wave</span></div>
                      <div className="flex justify-between"><span>Efficiency</span><span className="font-bold">~93%</span></div>
                      <div className="flex justify-between pt-2 border-t border-stone-200"><span className="text-emerald-600 font-bold">Price</span><span className="font-bold">₦{selectedSystemDetails.inverter_price.toLocaleString()}</span></div>
                    </div>
                  </div>
                  <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100">
                    <BatteryIcon className="w-8 h-8 text-blue-600 mb-4" />
                    <h3 className="font-bold text-lg mb-1">{selectedSystemDetails.battery_config}</h3>
                    <p className="text-sm text-stone-500">Energy Storage Bank</p>
                    <div className="mt-4 space-y-2 text-xs">
                      <div className="flex justify-between"><span>Wiring</span><span className="font-bold">Series-Parallel</span></div>
                      <div className="flex justify-between"><span>Usable Capacity</span><span className="font-bold">{(selectedSystemDetails.daily_yield / 0.8).toFixed(0)}Wh</span></div>
                      <div className="flex justify-between pt-2 border-t border-stone-200"><span className="text-blue-600 font-bold">Price</span><span className="font-bold">₦{selectedSystemDetails.battery_price.toLocaleString()}</span></div>
                    </div>
                  </div>
                  <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100">
                    <Sun className="w-8 h-8 text-amber-500 mb-4" />
                    <h3 className="font-bold text-lg mb-1">{selectedSystemDetails.panel_config}</h3>
                    <p className="text-sm text-stone-500">Photovoltaic Array</p>
                    <div className="mt-4 space-y-2 text-xs">
                      <div className="flex justify-between"><span>Peak Power</span><span className="font-bold">{selectedSystemDetails.array_size_w}W</span></div>
                      <div className="flex justify-between"><span>Daily Yield</span><span className="font-bold">{selectedSystemDetails.daily_yield.toFixed(0)}Wh</span></div>
                      <div className="flex justify-between pt-2 border-t border-stone-200"><span className="text-amber-600 font-bold">Price</span><span className="font-bold">₦{selectedSystemDetails.panel_price.toLocaleString()}</span></div>
                    </div>
                  </div>
                </>
              )}
            </div>

                <div className="space-y-4">
                  <h4 className="font-bold text-lg flex items-center gap-2">
                    <Layers className="w-5 h-5 text-stone-400" /> Wiring & Installation Guide
                  </h4>
                  <div className="bg-stone-50 p-6 rounded-2xl border border-stone-100 space-y-4 text-sm text-stone-600 leading-relaxed">
                    <p>• <strong>DC Bus:</strong> Ensure all battery cables are of equal length and minimum 35mm² gauge for this configuration.</p>
                    <p>• <strong>PV String:</strong> Connect panels in the specified series-parallel configuration to stay within the {selectedSystemDetails.inverter}'s MPPT window.</p>
                    <p>• <strong>Protection:</strong> Install a 63A DC Breaker between the battery and inverter, and a 20A DC Surge Protector for the PV array.</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-1">Total System Investment</p>
                    <p className="text-3xl font-black text-emerald-900">₦{selectedSystemDetails.total_price.toLocaleString()}</p>
                  </div>
                  <button 
                    onClick={() => generateQuote(selectedSystemDetails)}
                    className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center gap-2"
                  >
                    Generate Quote <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Hardware Modal */}
      <AnimatePresence>
        {showAddHardware && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between">
                <h2 className="font-bold text-xl capitalize">{editingHardware ? "Edit" : "Add New"} {showAddHardware}</h2>
                <button onClick={() => { setShowAddHardware(null); setEditingHardware(null); }} className="p-2 hover:bg-stone-100 rounded-full"><X className="w-5 h-5" /></button>
              </div>
              <form 
                className="p-6 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const commonData = {
                    name: fd.get("name") as string,
                    price: Number(fd.get("price")),
                  };

                  if (showAddHardware === "inverter") {
                    const data: Inverter = {
                      id: editingHardware?.id || crypto.randomUUID(),
                      ...commonData,
                      max_ac_w: Number(fd.get("max_ac_w")),
                      cc_max_pv_w: Number(fd.get("cc_max_pv_w")),
                      cc_max_voc: Number(fd.get("cc_max_voc")),
                      cc_max_amps: Number(fd.get("cc_max_amps")),
                      system_vdc: Number(fd.get("system_vdc")),
                      max_charge_amps: Number(fd.get("max_charge_amps")),
                      cc_type: fd.get("cc_type") as "pwm" | "mppt",
                      max_parallel_units: Number(fd.get("max_parallel_units") || 1),
                    };
                    if (editingHardware) {
                      setInverters(inverters.map(i => i.id === editingHardware.id ? data : i));
                    } else {
                      setInverters([...inverters, data]);
                    }
                    if (user) saveHardwareToServer("inverter", data);
                  } else if (showAddHardware === "panel") {
                    const data: Panel = {
                      id: editingHardware?.id || crypto.randomUUID(),
                      ...commonData,
                      watts: Number(fd.get("watts")),
                      voc: Number(fd.get("voc")),
                      isc: Number(fd.get("isc")),
                    };
                    if (editingHardware) {
                      setPanels(panels.map(p => p.id === editingHardware.id ? data : p));
                    } else {
                      setPanels([...panels, data]);
                    }
                    if (user) saveHardwareToServer("panel", data);
                  } else if (showAddHardware === "battery") {
                    const data: Battery = {
                      id: editingHardware?.id || crypto.randomUUID(),
                      ...commonData,
                      voltage: Number(fd.get("voltage")),
                      capacity_ah: Number(fd.get("capacity_ah")),
                      type: fd.get("type") as any,
                      max_parallel_strings: Number(fd.get("max_parallel_strings") || 10),
                      min_c_rate: Number(fd.get("min_c_rate") || 0.1),
                    };
                    if (editingHardware) {
                      setBatteries(batteries.map(b => b.id === editingHardware.id ? data : b));
                    } else {
                      setBatteries([...batteries, data]);
                    }
                    if (user) saveHardwareToServer("battery", data);
                  }
                  setShowAddHardware(null);
                  setEditingHardware(null);
                }}
              >
                {(() => {
                  const currentItem = editingHardware 
                    ? (editingHardware.type === "inverter" ? inverters.find(i => i.id === editingHardware.id)
                      : editingHardware.type === "panel" ? panels.find(p => p.id === editingHardware.id)
                      : batteries.find(b => b.id === editingHardware.id))
                    : null;
                  
                  return (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold uppercase text-stone-500 mb-1">Model Name</label>
                        <input name="name" defaultValue={currentItem?.name} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {showAddHardware === "inverter" && (
                          <>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max AC (W)</label><input name="max_ac_w" type="number" defaultValue={(currentItem as Inverter)?.max_ac_w} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">DC Volts (V)</label><input name="system_vdc" type="number" defaultValue={(currentItem as Inverter)?.system_vdc} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">PV Max (W)</label><input name="cc_max_pv_w" type="number" defaultValue={(currentItem as Inverter)?.cc_max_pv_w} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max Voc (V)</label><input name="cc_max_voc" type="number" defaultValue={(currentItem as Inverter)?.cc_max_voc} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max Amps (A)</label><input name="cc_max_amps" type="number" defaultValue={(currentItem as Inverter)?.cc_max_amps} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Charge Amps (A)</label><input name="max_charge_amps" type="number" defaultValue={(currentItem as Inverter)?.max_charge_amps} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max Parallel Units</label><input name="max_parallel_units" type="number" defaultValue={(currentItem as Inverter)?.max_parallel_units || 1} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">CC Type</label><select name="cc_type" defaultValue={(currentItem as Inverter)?.cc_type || "pwm"} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl"><option value="pwm">PWM</option><option value="mppt">MPPT</option></select></div>
                          </>
                        )}
                        {showAddHardware === "panel" && (
                          <>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Watts (W)</label><input name="watts" type="number" defaultValue={(currentItem as Panel)?.watts} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Voc (V)</label><input name="voc" type="number" defaultValue={(currentItem as Panel)?.voc} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Isc (A)</label><input name="isc" type="number" step="0.1" defaultValue={(currentItem as Panel)?.isc} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                          </>
                        )}
                        {showAddHardware === "battery" && (
                          <>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Voltage (V)</label><input name="voltage" type="number" defaultValue={(currentItem as Battery)?.voltage} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Capacity (Ah)</label><input name="capacity_ah" type="number" defaultValue={(currentItem as Battery)?.capacity_ah} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Type</label><select name="type" defaultValue={(currentItem as Battery)?.type} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl"><option value="lithium">Lithium</option><option value="lead-acid">Lead-Acid</option></select></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Max Parallel</label><input name="max_parallel_strings" type="number" defaultValue={(currentItem as Battery)?.max_parallel_strings} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                            <div><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Min C-Rate</label><input name="min_c_rate" type="number" step="0.01" defaultValue={(currentItem as Battery)?.min_c_rate} className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                          </>
                        )}
                        <div className="col-span-2"><label className="block text-xs font-bold uppercase text-stone-500 mb-1">Price (₦)</label><input name="price" type="number" defaultValue={currentItem?.price} required className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl" /></div>
                      </div>
                    </div>
                  );
                })()}
                <button type="submit" className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold mt-4">
                  {editingHardware ? "Update Component" : "Save Component"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedSystemLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl max-h-[80vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Calculator className="w-5 h-5 text-emerald-600" />
                  </div>
                  <h2 className="font-bold text-xl text-stone-900">Calculation Log</h2>
                </div>
                <button 
                  onClick={() => setSelectedSystemLog(null)}
                  className="p-2 hover:bg-stone-200 rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-stone-500" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {selectedSystemLog.map((line, i) => (
                  <div 
                    key={i} 
                    className={`p-3 rounded-xl text-sm font-mono flex gap-3 ${
                      line.includes('✅') ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' :
                      line.includes('❌') ? 'bg-red-50 text-red-800 border border-red-100' :
                      line.includes('Note:') ? 'bg-amber-50 text-amber-800 border border-amber-100' :
                      'bg-stone-50 text-stone-600 border border-stone-100'
                    }`}
                  >
                    <span className="text-stone-300 select-none">{String(i + 1).padStart(2, '0')}</span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>

              <div className="p-6 border-t border-stone-100 bg-stone-50 text-center">
                <p className="text-xs text-stone-400">
                  This log shows the step-by-step validation process for this specific hardware combination.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
