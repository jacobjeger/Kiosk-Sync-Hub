import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Member } from "@/lib/types";
import { X, Receipt, Store } from "lucide-react";

interface Transaction {
  id: string;
  amount: number;
  created_at: string;
  description: string | null;
  businesses: { name: string } | null;
  business_id: string;
}

interface BusinessTotal {
  businessId: string;
  businessName: string;
  total: number;
  count: number;
}

interface ProfileDrawerProps {
  member: Member;
  isOpen: boolean;
  onClose: () => void;
  showBalance?: boolean;
}

export function ProfileDrawer({
  member,
  isOpen,
  onClose,
  showBalance = true,
}: ProfileDrawerProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [businessTotals, setBusinessTotals] = useState<BusinessTotal[]>([]);
  const [cycleName, setCycleName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"summary" | "all">("summary");

  useEffect(() => {
    if (!isOpen) return;

    async function loadTransactions() {
      setLoading(true);

      const { data: activeCycle } = await supabase
        .from("billing_cycles")
        .select("id, name")
        .eq("status", "active")
        .single();

      if (activeCycle) {
        setCycleName(activeCycle.name);

        const { data } = await supabase
          .from("transactions")
          .select(
            "id, amount, created_at, description, business_id, businesses ( name )"
          )
          .eq("member_id", member.id)
          .eq("billing_cycle_id", activeCycle.id)
          .order("created_at", { ascending: false });

        const txs = (data || []) as Transaction[];
        setTransactions(txs);

        const totalsMap = new Map<string, BusinessTotal>();
        for (const tx of txs) {
          const existing = totalsMap.get(tx.business_id);
          if (existing) {
            existing.total += Number(tx.amount);
            existing.count += 1;
          } else {
            totalsMap.set(tx.business_id, {
              businessId: tx.business_id,
              businessName: tx.businesses?.name || "Unknown",
              total: Number(tx.amount),
              count: 1,
            });
          }
        }
        setBusinessTotals(
          Array.from(totalsMap.values()).sort((a, b) => b.total - a.total)
        );
      } else {
        setTransactions([]);
        setBusinessTotals([]);
      }

      setLoading(false);
    }

    loadTransactions();
  }, [isOpen, member.id]);

  const cycleTotal = transactions.reduce(
    (sum, tx) => sum + Number(tx.amount),
    0
  );

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      <div
        className={`fixed top-0 right-0 h-full w-full max-w-sm bg-white border-l border-stone-200 z-50 transform transition-transform duration-300 ease-out shadow-xl ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        data-testid="profile-drawer"
      >
        <div className="bg-stone-50 border-b border-stone-200 px-4 py-5">
          <button
            data-testid="button-close-profile"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-stone-100 hover:bg-stone-200 transition-colors text-stone-500 hover:text-stone-700"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-stone-900 flex items-center justify-center">
              <span className="text-lg font-bold text-white">
                {member.first_name[0]}
                {member.last_name[0]}
              </span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-stone-900">
                {member.first_name} {member.last_name}
              </h2>
              <p className="text-stone-500 text-xs font-mono">
                #{member.member_code}
              </p>
            </div>
          </div>

          {showBalance && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-emerald-600 text-xs uppercase tracking-wider mb-1 font-medium">
                Current Balance
              </p>
              <p className="text-3xl font-bold text-emerald-700 tabular-nums" data-testid="text-profile-balance">
                {"\u20AA"}
                {Number(member.balance).toFixed(2)}
              </p>
            </div>
          )}
        </div>

        <div className="p-4 border-b border-stone-100">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-stone-400" />
              <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                {cycleName || "Current Cycle"}
              </h3>
            </div>
            <span className="text-sm font-bold text-stone-900 tabular-nums">
              {"\u20AA"}
              {cycleTotal.toFixed(2)}
            </span>
          </div>

          <div className="flex gap-2 mb-3">
            <button
              data-testid="button-view-summary"
              onClick={() => setView("summary")}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                view === "summary"
                  ? "bg-stone-900 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              By Business
            </button>
            <button
              data-testid="button-view-all"
              onClick={() => setView("all")}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                view === "all"
                  ? "bg-stone-900 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              All Transactions
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto h-[calc(100%-320px)]">
          <div className="p-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-stone-200 border-t-stone-900 rounded-full animate-spin" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 mx-auto mb-3 bg-stone-100 rounded-xl flex items-center justify-center">
                  <Receipt className="w-6 h-6 text-stone-400" />
                </div>
                <p className="text-sm text-stone-500">
                  No transactions this cycle
                </p>
              </div>
            ) : view === "summary" ? (
              <div className="space-y-2">
                {businessTotals.map((bt) => (
                  <div
                    key={bt.businessId}
                    className="flex items-center justify-between p-4 bg-stone-50 border border-stone-100 rounded-xl flex-wrap gap-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-stone-200 flex items-center justify-center">
                        <span className="text-sm font-semibold text-stone-600">
                          {bt.businessName[0]}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stone-900">
                          {bt.businessName}
                        </p>
                        <p className="text-xs text-stone-400">
                          {bt.count} transaction
                          {bt.count !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <span className="text-base font-bold text-stone-900 tabular-nums">
                      {"\u20AA"}
                      {bt.total.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 bg-stone-50 border border-stone-100 rounded-xl flex-wrap gap-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-stone-200 flex items-center justify-center">
                        <span className="text-xs font-semibold text-stone-600">
                          {tx.businesses?.name?.[0] || "?"}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stone-900">
                          {tx.businesses?.name || "Unknown"}
                        </p>
                        <p className="text-xs text-stone-400">
                          {new Date(tx.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          at{" "}
                          {new Date(tx.created_at).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-red-500 tabular-nums">
                      -{"\u20AA"}
                      {Number(tx.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
