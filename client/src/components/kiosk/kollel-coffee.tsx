import { useState, useEffect } from "react";
import { Coffee, CheckCircle2, X, Loader2, BarChart3, ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { CoffeeTally } from "@/lib/types";
import { nanoid } from "nanoid";
import { startOfDay, startOfWeek, startOfMonth, isAfter } from "date-fns";

interface KollelCoffeeTallyProps {
  onClose: () => void;
}

export function KollelCoffeeTally({ onClose }: KollelCoffeeTallyProps) {
  const [step, setStep] = useState<"select" | "confirm" | "stats">("select");
  const [selectedType, setSelectedType] = useState<"small" | "large" | null>(null);
  const [stats, setStats] = useState({
    small: { today: 0, week: 0, month: 0 },
    large: { today: 0, week: 0, month: 0 }
  });
  const [isLogging, setIsLogging] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (step === "stats" || step === "select") {
      loadStats();
    }
  }, [step]);

  const loadStats = async () => {
    const now = new Date();
    const today = startOfDay(now).toISOString();
    const week = startOfWeek(now).toISOString();
    const month = startOfMonth(now).toISOString();

    try {
      const [
        { count: smallToday },
        { count: smallWeek },
        { count: smallMonth },
        { count: largeToday },
        { count: largeWeek },
        { count: largeMonth },
      ] = await Promise.all([
        supabase.from("coffee_tallies").select("*", { count: "exact", head: true }).eq("type", "small").gte("created_at", today),
        supabase.from("coffee_tallies").select("*", { count: "exact", head: true }).eq("type", "small").gte("created_at", week),
        supabase.from("coffee_tallies").select("*", { count: "exact", head: true }).eq("type", "small").gte("created_at", month),
        supabase.from("coffee_tallies").select("*", { count: "exact", head: true }).eq("type", "large").gte("created_at", today),
        supabase.from("coffee_tallies").select("*", { count: "exact", head: true }).eq("type", "large").gte("created_at", week),
        supabase.from("coffee_tallies").select("*", { count: "exact", head: true }).eq("type", "large").gte("created_at", month),
      ]);

      setStats({
        small: { today: smallToday ?? 0, week: smallWeek ?? 0, month: smallMonth ?? 0 },
        large: { today: largeToday ?? 0, week: largeWeek ?? 0, month: largeMonth ?? 0 },
      });
      console.log("[kollel] Stats loaded from Supabase");
    } catch {
      const allTallies = await db.coffeeTallies.toArray();
      const todayDate = startOfDay(now);
      const weekDate = startOfWeek(now);
      const monthDate = startOfMonth(now);

      const getStatsForType = (type: "small" | "large") => {
        const typeTallies = allTallies.filter(t => t.type === type);
        return {
          today: typeTallies.filter(t => isAfter(new Date(t.createdAt), todayDate)).length,
          week: typeTallies.filter(t => isAfter(new Date(t.createdAt), weekDate)).length,
          month: typeTallies.filter(t => isAfter(new Date(t.createdAt), monthDate)).length,
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-2">
            {step !== "select" && !showSuccess && (
              <button 
                onClick={() => setStep("select")}
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

        <div className="p-6">
          {showSuccess ? (
            <div className="flex flex-col items-center justify-center py-8 text-center animate-in fade-in scale-in duration-300">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h4 className="text-xl font-bold text-stone-900 mb-1">Coffee Logged!</h4>
              <p className="text-stone-500 text-sm uppercase font-bold tracking-widest">{selectedType} cup</p>
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
            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-xs font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-stone-900" /> Small Cup Tallies
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-stone-50 p-3 rounded-xl text-center border border-stone-100">
                    <p className="text-[10px] uppercase font-bold text-stone-400 mb-1">Today</p>
                    <p className="text-lg font-black text-stone-900">{stats.small.today}</p>
                  </div>
                  <div className="bg-stone-50 p-3 rounded-xl text-center border border-stone-100">
                    <p className="text-[10px] uppercase font-bold text-stone-400 mb-1">Week</p>
                    <p className="text-lg font-black text-stone-900">{stats.small.week}</p>
                  </div>
                  <div className="bg-stone-50 p-3 rounded-xl text-center border border-stone-100">
                    <p className="text-[10px] uppercase font-bold text-stone-400 mb-1">Month</p>
                    <p className="text-lg font-black text-stone-900">{stats.small.month}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-stone-900" /> Large Cup Tallies
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-stone-50 p-3 rounded-xl text-center border border-stone-100">
                    <p className="text-[10px] uppercase font-bold text-stone-400 mb-1">Today</p>
                    <p className="text-lg font-black text-stone-900">{stats.large.today}</p>
                  </div>
                  <div className="bg-stone-50 p-3 rounded-xl text-center border border-stone-100">
                    <p className="text-[10px] uppercase font-bold text-stone-400 mb-1">Week</p>
                    <p className="text-lg font-black text-stone-900">{stats.large.week}</p>
                  </div>
                  <div className="bg-stone-50 p-3 rounded-xl text-center border border-stone-100">
                    <p className="text-[10px] uppercase font-bold text-stone-400 mb-1">Month</p>
                    <p className="text-lg font-black text-stone-900">{stats.large.month}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setStep("select")}
                className="w-full py-3 rounded-xl bg-stone-900 text-white font-bold text-sm shadow-lg shadow-stone-900/10 active:scale-95 transition-all"
              >
                Back to Selection
              </button>
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
