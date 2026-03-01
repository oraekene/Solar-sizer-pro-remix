import { useState, useMemo, useEffect } from "react";
import { motion } from "motion/react";
import { Zap, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { Device, TimeRange } from "../types";

interface InteractiveBridgeProps {
  devices: Device[];
  initialDeficit: number;
  onClose: () => void;
  onChange?: (adjusted: Device[], deficit: number) => void;
}

export default function InteractiveBridge({ devices, initialDeficit, onClose, onChange }: InteractiveBridgeProps) {
  // Local state for adjusted ranges
  const [adjustedDevices, setAdjustedDevices] = useState<Device[]>(() => 
    JSON.parse(JSON.stringify(devices))
  );

  const currentDeficit = useMemo(() => {
    let savings = 0;
    adjustedDevices.forEach((adj, idx) => {
      const orig = devices[idx];
      const hourlyWh = orig.watts * orig.qty;

      const getHours = (ranges: TimeRange[]) => {
        return ranges.reduce((acc, r) => {
          if (r.end > r.start) return acc + (r.end - r.start);
          if (r.end < r.start) return acc + (24 - r.start + r.end);
          return acc;
        }, 0);
      };

      const origHours = getHours(orig.ranges);
      const adjHours = getHours(adj.ranges);
      savings += (origHours - adjHours) * hourlyWh;
    });

    return Math.max(0, initialDeficit - savings);
  }, [adjustedDevices, devices, initialDeficit]);

  useEffect(() => {
    onChange?.(adjustedDevices, currentDeficit);
  }, [adjustedDevices, currentDeficit, onChange]);

  const updateRange = (deviceIdx: number, rangeIdx: number, field: "start" | "end", value: number) => {
    setAdjustedDevices(prev => {
      const next = [...prev];
      next[deviceIdx].ranges[rangeIdx][field] = value;
      return next;
    });
  };

  const getHourLabel = (hour: number) => {
    if (hour === 0 || hour === 24) return "12 AM";
    if (hour === 12) return "12 PM";
    return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
  };

  return (
    <div className="space-y-6">
      <div className={`p-4 rounded-2xl flex items-center justify-between border transition-all ${currentDeficit === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center gap-3">
          {currentDeficit === 0 ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          ) : (
            <AlertCircle className="w-6 h-6 text-amber-600" />
          )}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Remaining Deficit</p>
            <p className={`text-2xl font-black ${currentDeficit === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {currentDeficit.toFixed(0)}Wh
            </p>
          </div>
        </div>
        {currentDeficit === 0 && (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="bg-emerald-600 text-white px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest"
          >
            Gap Bridged!
          </motion.div>
        )}
      </div>

      <div className="space-y-4">
        <h4 className="font-bold text-sm text-stone-400 uppercase tracking-widest flex items-center gap-2">
          <Clock className="w-4 h-4" /> Adjust Usage Windows
        </h4>
        
        <div className="grid gap-4">
          {adjustedDevices.map((device, dIdx) => (
            <div key={device.id} className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-stone-400" />
                  <span className="font-bold text-stone-700">{device.name}</span>
                </div>
                <span className="text-xs font-mono text-stone-400">{device.watts * device.qty}W Draw</span>
              </div>

              {device.ranges.map((range, rIdx) => (
                <div key={rIdx} className="space-y-3">
                  <div className="flex justify-between text-[10px] font-bold uppercase text-stone-400">
                    <span>Start: {getHourLabel(range.start)}</span>
                    <span>End: {getHourLabel(range.end)}</span>
                  </div>
                  
                  {/* Dual Handle Slider Simulation */}
                  <div className="relative h-6 flex items-center">
                    <div className="absolute inset-0 bg-stone-100 rounded-full h-1.5 my-auto" />
                    
                    {/* Highlighted Track */}
                    <div 
                      className="absolute h-1.5 bg-emerald-500 rounded-full my-auto"
                      style={{
                        left: `${(range.start / 24) * 100}%`,
                        width: `${((range.end >= range.start ? range.end - range.start : 24 - range.start + range.end) / 24) * 100}%`
                      }}
                    />

                    <input 
                      type="range"
                      min="0"
                      max="24"
                      value={range.start}
                      onChange={(e) => updateRange(dIdx, rIdx, "start", parseInt(e.target.value))}
                      className="absolute w-full appearance-none bg-transparent pointer-events-none z-10 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                    <input 
                      type="range"
                      min="0"
                      max="24"
                      value={range.end}
                      onChange={(e) => updateRange(dIdx, rIdx, "end", parseInt(e.target.value))}
                      className="absolute w-full appearance-none bg-transparent pointer-events-none z-10 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
