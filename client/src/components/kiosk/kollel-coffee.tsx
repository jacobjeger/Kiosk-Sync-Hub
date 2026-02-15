import { useState, useEffect, useCallback } from "react";
import { Coffee, CheckCircle2, X, Loader2, BarChart3, ChevronLeft, RotateCcw, Delete } from "lucide-react";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { CoffeeTally } from "@/lib/types";
import { nanoid } from "nanoid";
import { startOfDay, startOfWeek, startOfMonth, isAfter } from "date-fns";

const RESET_PIN = "181818";

interface KollelCoffeeTallyProps {
  onClose: () => void;
}

export function KollelCoffeeTally({ onClose }: KollelCoffeeTallyProps) {
  const [step, setStep] = useState<"select" | "confirm" | "stats" | "reset-pin">("select");
  const [selectedType, setSelectedType] = useState<"small" | "large" | null>(null);
  const [stats, setStats] = useState({
    small: { today: 0, week: 0, month: 0, total: 0 },
    large: { today: 0, week: 0, month: 0, total: 0 }
  });
  const [isLogging, setIsLogging] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [resetPin, setResetPin] = useState("");
  const [resetError, setResetError] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    if (step === "stats" || step === "select") {
      loadStats();
    }
  }, [step]);

  const getResetCutoff = async (source: "supabase" | "local"): Promise<string | null> => {
    if (source === "supabase") {
      const { data } = await supabase
        .from("coffee_tallies")
        .select("created_at")
        .eq("type", "reset")
        .order("created_at", { ascending: false })
        .limit(1);
      return data && data.length > 0 ? data[0].created_at : null;
    } else {
      const resets = await db.coffeeTallies
        .where("type")
        .equals("reset")
        .reverse()
        .sortBy("createdAt");
      return resets.length > 0 ? new Date(resets[0].createdAt).toISOString() : null;
    }
  };

  const loadStats = async () => {
    const now = new Date();
    const today = startOfDay(now).toISOString();
    const week = startOfWeek(now).toISOString();
    const month = startOfMonth(now).toISOString();

    try {
      const resetCutoff = await getResetCutoff("supabase");

      const buildQuery = (type: string, dateFilter?: string) => {
        let q = supabase.from("coffee_tallies").select("*", { count: "exact", head: true }).eq("type", type);
        const cutoff = resetCutoff && dateFilter
          ? (resetCutoff > dateFilter ? resetCutoff : dateFilter)
          : (dateFilter || resetCutoff);
        if (cutoff) q = q.gte("created_at", cutoff);
        return q;
      };

      const [
        { count: smallToday },
        { count: smallWeek },
        { count: smallMonth },
        { count: smallTotal },
        { count: largeToday },
        { count: largeWeek },
        { count: largeMonth },
        { count: largeTotal },
      ] = await Promise.all([
        buildQuery("small", today),
        buildQuery("small", week),
        buildQuery("small", month),
        buildQuery("small"),
        buildQuery("large", today),
        buildQuery("large", week),
        buildQuery("large", month),
        buildQuery("large"),
      ]);

      setStats({
        small: { today: smallToday ?? 0, week: smallWeek ?? 0, month: smallMonth ?? 0, total: smallTotal ?? 0 },
        large: { today: largeToday ?? 0, week: largeWeek ?? 0, month: largeMonth ?? 0, total: largeTotal ?? 0 },
      });
      console.log("[kollel] Stats loaded from Supabase");
    } catch {
      const allTallies = await db.coffeeTallies.toArray();
      const resetCutoffLocal = await getResetCutoff("local");
      const cutoffDate = resetCutoffLocal ? new Date(resetCutoffLocal) : null;

      const todayDate = startOfDay(now);
      const weekDate = startOfWeek(now);
      const monthDate = startOfMonth(now);

      const getStatsForType = (type: "small" | "large") => {
        let typeTallies = allTallies.filter(t => t.type === type);
        if (cutoffDate) typeTallies = typeTallies.filter(t => isAfter(new Date(t.createdAt), cutoffDate));
        return {
          today: typeTallies.filter(t => isAfter(new Date(t.createdAt), todayDate)).length,
          week: typeTallies.filter(t => isAfter(new Date(t.createdAt), weekDate)).length,
          month: typeTallies.filter(t => isAfter(new Date(t.createdAt), monthDate)).length,
          total: typeTallies.length,
        };
      };

      setStats({
        small: getStatsForType("small"),
        large: getStatsForType("large"),
      });
      console.log("[kollel] Stats loaded from local DB (offline fallback)");
    }
  };

  const handleLogCoffee = async () => {
    if (!selectedType) return;
    setIsLogging(true);
    
    const tally: CoffeeTally = {
      id: nanoid(),
      type: selectedType,
      count: 1,
      status: "pending",
      createdAt: new Date(),
    };

    await db.coffeeTallies.add(tally);
    
    try {
      const { error } = await supabase.from("coffee_tallies").insert({
        type: selectedType,
        count: 1,
        created_at: tally.createdAt.toISOString(),
        synced_from_device: true,
      });
      if (!error) {
        await db.coffeeTallies.update(tally.id, { status: "synced", syncedAt: new Date() });
        console.log("[kollel] Coffee tally synced to Supabase");
      } else {
        console.warn("[kollel] Supabase insert failed, will retry later:", error.message);
      }
    } catch (err) {
      console.warn("[kollel] Network error syncing coffee tally, stored locally:", err);
    }

    setIsLogging(false);
    setShowSuccess(true);
    setTimeout(() => {
      onClose();
    }, 2000);
  };

  const handleResetPinDigit = useCallback((digit: string) => {
    setResetError(false);
    setResetPin(prev => {
      if (prev.length >= 6) return prev;
      return prev + digit;
    });
  }, []);

  const handleResetBackspace = useCallback(() => {
    setResetError(false);
    setResetPin(prev => prev.slice(0, -1));
  }, []);

  const handleResetSubmit = async () => {
    if (resetPin !== RESET_PIN) {
      setResetError(true);
      setResetPin("");
      return;
    }

    setIsResetting(true);
    const resetTime = new Date();

    const resetTally: CoffeeTally = {
      id: nanoid(),
      type: "reset" as any,
      count: 0,
      status: "synced",
      createdAt: resetTime,
    };
    await db.coffeeTallies.add(resetTally);

    try {
      await supabase.from("coffee_tallies").insert({
        type: "reset",
        count: 0,
        created_at: resetTime.toISOString(),
        synced_from_device: true,
      });
      console.log("[kollel] Reset marker synced to Supabase");
    } catch (err) {
      console.warn("[kollel] Reset marker stored locally, will appear on this device:", err);
    }

    setIsResetting(false);
    setResetDone(true);
    setResetPin("");
    setTimeout(() => {
      setResetDone(false);
      setStep("stats");
    }, 2000);
  };

  useEffect(() => {
    if (resetPin.length === 6) {
      handleResetSubmit();
    }
  }, [resetPin]);

  const goBack = () => {
    if (step === "reset-pin") {
      setResetPin("");
      setResetError(false);
      setStep("stats");
    } else if (step !== "select") {
      setStep("select");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50 shrink-0">
          <div className="flex items-center gap-2">
            {step !== "select" && !showSuccess && !resetDone && (
              <button 
                onClick={goBack}
                className="p-1 -ml-1 hover:bg-stone-200 rounded-full transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-stone-600" />
              </button>
            )}
            <div className="w-8 h-8 rounded-full bg-stone-900 flex items-center justify-center">
              <Coffee className="w-4 h-4 text-white" />
            </div>
            <h3 className="font-bold text-stone-900 text-sm">Morning Kollel Coffee</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-stone-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-stone-400" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {showSuccess ? (
            <div className="flex flex-col items-center justify-center py-8 text-center animate-in fade-in scale-in duration-300">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h4 className="text-xl font-bold text-stone-900 mb-1">Coffee Logged!</h4>
              <p className="text-stone-500 text-sm uppercase font-bold tracking-widest">{selectedType} cup</p>
            </div>
          ) : resetDone ? (
            <div className="flex flex-col items-center justify-center py-8 text-center animate-in fade-in scale-in duration-300">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h4 className="text-xl font-bold text-stone-900 mb-1">Tallies Reset</h4>
              <p className="text-stone-500 text-sm">All coffee counts have been reset to 0</p>
            </div>
          ) : step === "select" ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    setSelectedType("small");
                    setStep("confirm");
                  }}
                  className="flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-stone-100 hover:border-stone-900 hover:bg-stone-50 transition-all group"
                >
                  <Coffee className="w-10 h-10 text-stone-400 group-hover:text-stone-900 mb-2 transition-colors" />
                  <span className="font-bold text-stone-900">Small Cup</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedType("large");
                    setStep("confirm");
                  }}
                  className="flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-stone-100 hover:border-stone-900 hover:bg-stone-50 transition-all group"
                >
                  <Coffee className="w-14 h-14 text-stone-400 group-hover:text-stone-900 mb-2 transition-colors" />
                  <span className="font-bold text-stone-900">Large Cup</span>
                </button>
              </div>

              <button
                onClick={() => setStep("stats")}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-stone-50 border border-stone-200 text-stone-600 font-bold text-sm hover:bg-stone-100 transition-colors"
              >
                <BarChart3 className="w-4 h-4" />
                View Coffee Stats
              </button>
            </div>
          ) : step === "stats" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-xs font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-stone-900" /> Small Cup Tallies
                </h4>
                <div className="grid grid-cols-4 gap-1.5">
                  <div className="bg-stone-50 p-2 rounded-lg text-center border border-stone-100">
                    <p className="text-[10px] uppercase font-bold text-stone-400 mb-0.5">Today</p>
                    <p className="text-base font-black text-stone-900">{stats.small.today}</p>
                  </div>
                  <div className="bg-stone-50 p-2 rounded-lg text-center border border-stone-100">
                    <p className="text-[10px] uppercase font-bold text-stone-400 mb-0.5">Week</p>
                    <p className="text-base font-black text-stone-900">{stats.small.week}</p>
                  </div>
                  <div className="bg-stone-50 p-2 rounded-lg text-center border border-stone-100">
                    <p className="text-[10px] uppercase font-bold text-stone-400 mb-0.5">Month</p>
                    <p className="text-base font-black text-stone-900">{stats.small.month}</p>
                  </div>
                  <div className="bg-stone-900 p-2 rounded-lg text-center">
                    <p className="text-[10px] uppercase font-bold text-stone-400 mb-0.5">Total</p>
                    <p className="text-base font-black text-white">{stats.small.total}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-stone-900" /> Large Cup Tallies
                </h4>
                <div className="grid grid-cols-4 gap-1.5">
                  <div className="bg-stone-50 p-2 rounded-lg text-center border border-stone-100">
                    <p className="text-[10px] uppercase font-bold text-stone-400 mb-0.5">Today</p>
                    <p className="text-base font-black text-stone-900">{stats.large.today}</p>
                  </div>
                  <div className="bg-stone-50 p-2 rounded-lg text-center border border-stone-100">
                    <p className="text-[10px] uppercase font-bold text-stone-400 mb-0.5">Week</p>
                    <p className="text-base font-black text-stone-900">{stats.large.week}</p>
                  </div>
                  <div className="bg-stone-50 p-2 rounded-lg text-center border border-stone-100">
                    <p className="text-[10px] uppercase font-bold text-stone-400 mb-0.5">Month</p>
                    <p className="text-base font-black text-stone-900">{stats.large.month}</p>
                  </div>
                  <div className="bg-stone-900 p-2 rounded-lg text-center">
                    <p className="text-[10px] uppercase font-bold text-stone-400 mb-0.5">Total</p>
                    <p className="text-base font-black text-white">{stats.large.total}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("select")}
                  className="flex-1 py-3 rounded-xl bg-stone-900 text-white font-bold text-sm shadow-lg shadow-stone-900/10 active:scale-95 transition-all"
                >
                  Back to Selection
                </button>
                <button
                  onClick={() => {
                    setResetPin("");
                    setResetError(false);
                    setStep("reset-pin");
                  }}
                  className="py-3 px-4 rounded-xl border-2 border-red-200 text-red-600 font-bold text-sm hover:bg-red-50 active:scale-95 transition-all flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
              </div>
            </div>
          ) : step === "reset-pin" ? (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <RotateCcw className="w-6 h-6 text-red-600" />
                </div>
                <h4 className="text-lg font-bold text-stone-900 mb-1">Reset All Tallies</h4>
                <p className="text-stone-500 text-sm">Enter 6-digit PIN to confirm reset</p>
              </div>

              <div className="flex justify-center gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-10 h-12 rounded-lg border-2 flex items-center justify-center text-xl font-black transition-all ${
                      resetError
                        ? "border-red-300 bg-red-50"
                        : i < resetPin.length
                        ? "border-stone-900 bg-stone-50"
                        : "border-stone-200 bg-stone-50"
                    }`}
                  >
                    {i < resetPin.length ? (
                      <div className="w-3 h-3 rounded-full bg-stone-900" />
                    ) : null}
                  </div>
                ))}
              </div>

              {resetError && (
                <p className="text-center text-red-500 text-sm font-bold animate-in fade-in duration-200">
                  Incorrect PIN. Try again.
                </p>
              )}

              {isResetting && (
                <div className="flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                  <button
                    key={digit}
                    onClick={() => handleResetPinDigit(digit)}
                    disabled={isResetting || resetPin.length >= 6}
                    className="h-14 rounded-xl bg-stone-50 border border-stone-100 font-bold text-xl text-stone-900 hover:bg-stone-100 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {digit}
                  </button>
                ))}
                <div />
                <button
                  onClick={() => handleResetPinDigit("0")}
                  disabled={isResetting || resetPin.length >= 6}
                  className="h-14 rounded-xl bg-stone-50 border border-stone-100 font-bold text-xl text-stone-900 hover:bg-stone-100 active:scale-95 transition-all disabled:opacity-50"
                >
                  0
                </button>
                <button
                  onClick={handleResetBackspace}
                  disabled={isResetting || resetPin.length === 0}
                  className="h-14 rounded-xl bg-stone-50 border border-stone-100 font-bold text-stone-900 hover:bg-stone-100 active:scale-95 transition-all flex items-center justify-center disabled:opacity-50"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mb-4">
                <Coffee className={`text-amber-600 ${selectedType === 'large' ? 'w-8 h-8' : 'w-6 h-6'}`} />
              </div>
              <h4 className="text-lg font-bold text-stone-900 mb-2">Confirm Coffee Log</h4>
              <p className="text-stone-500 text-sm mb-8 leading-relaxed">
                Log 1 <span className="text-stone-900 font-bold uppercase tracking-widest">{selectedType}</span> coffee?
              </p>
              
              <div className="grid grid-cols-2 gap-3 w-full">
                <button
                  onClick={() => setStep("select")}
                  disabled={isLogging}
                  className="h-12 rounded-xl border-2 border-stone-100 font-bold text-stone-600 hover:bg-stone-50 active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogCoffee}
                  disabled={isLogging}
                  className="h-12 rounded-xl bg-stone-900 font-bold text-white shadow-lg shadow-stone-900/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLogging ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "Confirm"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
