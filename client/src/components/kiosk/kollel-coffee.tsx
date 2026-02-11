import { useState, useEffect } from "react";
import { Coffee, CheckCircle2, X, BarChart3, Loader2 } from "lucide-react";
import { db } from "@/lib/db";
import type { Member, CoffeeTally } from "@/lib/types";
import { nanoid } from "nanoid";
import { startOfDay, startOfWeek, startOfMonth, isAfter } from "date-fns";

interface KollelCoffeeTallyProps {
  onClose: () => void;
  members: Member[];
}

export function KollelCoffeeTally({ onClose, members }: KollelCoffeeTallyProps) {
  const [step, setStep] = useState<"select" | "confirm" | "stats">("select");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [stats, setStats] = useState({ today: 0, week: 0, month: 0 });
  const [isLogging, setIsLogging] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const allTallies = await db.coffeeTallies.toArray();
    const now = new Date();
    const today = startOfDay(now);
    const week = startOfWeek(now);
    const month = startOfMonth(now);

    setStats({
      today: allTallies.filter(t => isAfter(new Date(t.createdAt), today)).length,
      week: allTallies.filter(t => isAfter(new Date(t.createdAt), week)).length,
      month: allTallies.filter(t => isAfter(new Date(t.createdAt), month)).length,
    });
  };

  const handleLogCoffee = async () => {
    if (!selectedMember) return;
    setIsLogging(true);
    
    const tally: CoffeeTally = {
      id: nanoid(),
      memberId: selectedMember.id,
      memberName: `${selectedMember.first_name} ${selectedMember.last_name}`,
      count: 1,
      status: "pending",
      createdAt: new Date(),
    };

    await db.coffeeTallies.add(tally);
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
              <p className="text-stone-500 text-sm">Enjoy your learning</p>
            </div>
          ) : step === "select" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-stone-50 p-3 rounded-xl text-center border border-stone-100">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-stone-400 mb-1">Today</p>
                  <p className="text-xl font-black text-stone-900">{stats.today}</p>
                </div>
                <div className="bg-stone-50 p-3 rounded-xl text-center border border-stone-100">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-stone-400 mb-1">Week</p>
                  <p className="text-xl font-black text-stone-900">{stats.week}</p>
                </div>
                <div className="bg-stone-50 p-3 rounded-xl text-center border border-stone-100">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-stone-400 mb-1">Month</p>
                  <p className="text-xl font-black text-stone-900">{stats.month}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">Select Learner</label>
                <div className="max-h-[300px] overflow-y-auto pr-1 -mr-1 space-y-1">
                  {members.map(member => (
                    <button
                      key={member.id}
                      onClick={() => {
                        setSelectedMember(member);
                        setStep("confirm");
                      }}
                      className="w-full p-3 flex items-center gap-3 rounded-xl border border-stone-100 hover:border-stone-200 hover:bg-stone-50 transition-all text-left group"
                    >
                      <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 font-bold text-xs group-hover:bg-stone-900 group-hover:text-white transition-colors">
                        {member.first_name[0]}{member.last_name[0]}
                      </div>
                      <span className="font-semibold text-stone-900 text-sm">
                        {member.first_name} {member.last_name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mb-4">
                <Coffee className="w-6 h-6 text-amber-600" />
              </div>
              <h4 className="text-lg font-bold text-stone-900 mb-2">Confirm Coffee Log</h4>
              <p className="text-stone-500 text-sm mb-8 leading-relaxed">
                Log 1 coffee for <span className="text-stone-900 font-bold">{selectedMember?.first_name} {selectedMember?.last_name}</span>?
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
