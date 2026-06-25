import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  Search,
  User,
  CreditCard,
  Check,
  Banknote,
  Calculator,
  X,
  ChevronRight,
  Building2,
  Receipt,
  KeyRound,
  Edit3,
  Users,
  CloudOff,
} from "lucide-react";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { Member } from "@/lib/types";

interface MemberLite {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  card_last_four: string | null;
  pin_code: string | null;
  is_active: boolean;
}

interface RecordedPayment {
  id: string;
  amount: number;
  payment_type: string;
  notes: string | null;
  created_at: string;
  collected_by_member_id: string | null;
}

interface BillData {
  invoiceId: string | null;
  invoiceTotal: number;
  grandTotal: number;
  totalCashPaid: number;
  amountOwed: number;
  businessBreakdown: Array<{ name: string; total: number; transactions: number }>;
  transactionCount: number;
  recordedPayments: RecordedPayment[];
}

interface BillingCycle {
  id: string;
  name: string;
}

type CashStep = "search" | "bill" | "payment" | "success";

interface Props {
  collector: Member;
  onExit: () => void;
  isOnline: boolean;
  queueCashPayment: (data: {
    memberId: string;
    memberName: string;
    billingCycleId: string;
    billingCycleName: string;
    amount: number;
    collectorMemberId: string | null;
    paymentType?: "cash" | "zelle";
    notes?: string | null;
    isFullPayment?: boolean;
  }) => Promise<unknown>;
}

const DENOMINATIONS = [200, 100, 50, 20, 10, 5, 1];

export default function CashCollectionPage({
  collector,
  onExit,
  isOnline,
  queueCashPayment,
}: Props) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Ref-based guard against double-tap on "Paid Full" / "Record Payment".
  // setLoading is async via React state and won't disable the button before
  // a second touch event fires on a tablet; the ref flips synchronously.
  const submittingRef = useRef(false);

  const [step, setStep] = useState<CashStep>("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [allMembers, setAllMembers] = useState<MemberLite[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<MemberLite[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberLite | null>(null);
  const [lastClosedCycle, setLastClosedCycle] = useState<BillingCycle | null>(null);
  const [billData, setBillData] = useState<BillData | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [isFullPayment, setIsFullPayment] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const [showChangeCalc, setShowChangeCalc] = useState(false);
  const [amountReceived, setAmountReceived] = useState("");

  const [editingPin, setEditingPin] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editingPaymentAmount, setEditingPaymentAmount] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinSaving, setPinSaving] = useState(false);

  const loadInitialData = useCallback(async () => {
    setInitialLoading(true);
    setBannerError(null);

    // Pull from local Dexie cache first so search works offline.
    const cachedMembers = await db.members.toArray();
    const memberList: MemberLite[] = cachedMembers
      .filter((m) => m.is_active)
      .map((m) => ({
        id: m.id,
        first_name: m.first_name,
        last_name: m.last_name,
        email: m.email,
        card_last_four: m.card_last_four ?? null,
        pin_code: m.pin_code,
        is_active: m.is_active,
      }))
      .sort((a, b) => a.first_name.localeCompare(b.first_name));
    setAllMembers(memberList);

    const cachedCycle = await db.billingCyclesCache
      .where("status")
      .equals("closed")
      .reverse()
      .sortBy("fetched_at");
    if (cachedCycle[0]) {
      setLastClosedCycle({ id: cachedCycle[0].id, name: cachedCycle[0].name });
    }

    // Online: refresh cycle from Supabase.
    if (isOnline) {
      const { data, error } = await supabase
        .from("billing_cycles")
        .select("id, name, status, start_date, end_date")
        .eq("status", "closed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        setLastClosedCycle({ id: data.id, name: data.name });
        await db.billingCyclesCache.put({
          id: data.id,
          name: data.name,
          status: data.status as "closed",
          start_date: data.start_date,
          end_date: data.end_date,
          fetched_at: Date.now(),
        });
      } else if (error && !cachedCycle[0]) {
        setBannerError("No closed billing cycle available offline.");
      }
    } else if (!cachedCycle[0]) {
      setBannerError(
        "Offline and no cached billing cycle — connect once to load the cycle."
      );
    }

    setInitialLoading(false);
  }, [isOnline]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (searchQuery.length < 1) {
      setFilteredMembers([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFilteredMembers(
      allMembers
        .filter(
          (m) =>
            m.first_name.toLowerCase().includes(q) ||
            m.last_name.toLowerCase().includes(q) ||
            `${m.first_name} ${m.last_name}`.toLowerCase().includes(q) ||
            (m.email && m.email.toLowerCase().includes(q))
        )
        .slice(0, 15)
    );
  }, [searchQuery, allMembers]);

  async function loadBill(member: MemberLite, cycle: BillingCycle): Promise<BillData> {
    // Fetch transactions for this member in this cycle (with business name).
    let transactions: Array<{
      amount: number;
      businesses?: { name: string } | null;
    }> = [];
    if (isOnline) {
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, businesses(name)")
        .eq("member_id", member.id)
        .eq("billing_cycle_id", cycle.id);
      if (!error && data) {
        transactions = data.map((row: any) => ({
          amount: Number(row.amount),
          businesses: Array.isArray(row.businesses)
            ? row.businesses[0] ?? null
            : row.businesses ?? null,
        }));
      } else if (error) {
        console.warn("[cash] tx fetch failed:", error.message);
      }
    }

    // Get any existing invoice for this member/cycle so we can wire payment_status.
    let invoiceId: string | null = null;
    let invoiceTotal = 0;
    if (isOnline) {
      const { data } = await supabase
        .from("invoices")
        .select("id, total_amount")
        .eq("member_id", member.id)
        .eq("billing_cycle_id", cycle.id)
        .maybeSingle();
      invoiceId = data?.id ?? null;
      invoiceTotal = Number(data?.total_amount ?? 0);
    }

    // Cash payments — server-of-record (active only — voided rows are
    // excluded so the collector's mistake correction sticks) plus any
    // locally-queued ones that haven't synced yet. After a successful sync
    // we drop the cache row in use-offline-queue.ts; the filter below is
    // belt-and-suspenders so a stale cache row left behind by a bug can't
    // double-count the same payment.
    let cashFromServer: Array<{
      id: string;
      amount: number;
      payment_type: string;
      notes: string | null;
      created_at: string;
      collected_by_member_id: string | null;
    }> = [];
    if (isOnline) {
      const { data } = await supabase
        .from("cash_payments")
        .select(
          "id, amount, payment_type, notes, created_at, collected_by_member_id"
        )
        .eq("member_id", member.id)
        .eq("billing_cycle_id", cycle.id)
        .is("voided_at", null)
        .order("created_at", { ascending: false });
      cashFromServer = (data ?? []).map((p: any) => ({
        id: p.id,
        amount: Number(p.amount),
        payment_type: p.payment_type,
        notes: p.notes,
        created_at: p.created_at,
        collected_by_member_id: p.collected_by_member_id,
      }));
    }
    const cachedRows = await db.cashPaymentsCache
      .where("[member_id+billing_cycle_id]")
      .equals([member.id, cycle.id])
      .toArray();

    // Only credit cache rows whose corresponding offlineCashPayments entry
    // is still pending — anything else already made it server-side.
    const pendingOfflineIds = new Set(
      (
        await db.offlineCashPayments
          .where("status")
          .equals("pending")
          .toArray()
      ).map((p) => p.id)
    );
    const localCash = cachedRows.filter((r) => pendingOfflineIds.has(r.id));

    const totalCashPaid =
      cashFromServer.reduce((s, p) => s + p.amount, 0) +
      localCash.reduce((s, p) => s + Number(p.amount), 0);

    const businessBreakdown: Record<
      string,
      { name: string; total: number; transactions: number }
    > = {};
    for (const tx of transactions) {
      const name = tx.businesses?.name ?? "Unknown";
      const key = name;
      if (!businessBreakdown[key]) {
        businessBreakdown[key] = { name, total: 0, transactions: 0 };
      }
      businessBreakdown[key].total += tx.amount;
      businessBreakdown[key].transactions += 1;
    }

    const grandTotal = transactions.reduce((s, t) => s + t.amount, 0);
    const amountOwed = Math.max(grandTotal - totalCashPaid, 0);

    return {
      invoiceId,
      invoiceTotal,
      grandTotal,
      totalCashPaid,
      amountOwed,
      businessBreakdown: Object.values(businessBreakdown),
      transactionCount: transactions.length,
      recordedPayments: cashFromServer,
    };
  }

  async function voidRecordedPayment(paymentId: string) {
    if (!selectedMember || !lastClosedCycle) return;
    const { error } = await supabase.rpc("void_cash_payment", {
      p_cash_payment_id: paymentId,
      p_actor_member_id: collector.id,
      p_reason: "Voided from kiosk",
    });
    if (error) {
      alert("Could not void payment: " + error.message);
      return;
    }
    // Reload the bill so totals reflect the void.
    const refreshed = await loadBill(selectedMember, lastClosedCycle);
    setBillData(refreshed);
  }

  async function editRecordedPayment(paymentId: string, newAmount: number) {
    if (!selectedMember || !lastClosedCycle) return;
    if (!newAmount || newAmount <= 0) return;
    const { error } = await supabase.rpc("edit_cash_payment", {
      p_cash_payment_id: paymentId,
      p_new_amount: newAmount,
      p_actor_member_id: collector.id,
    });
    if (error) {
      alert("Could not edit payment: " + error.message);
      return;
    }
    const refreshed = await loadBill(selectedMember, lastClosedCycle);
    setBillData(refreshed);
  }

  async function selectMember(member: MemberLite) {
    if (!lastClosedCycle) return;
    setSelectedMember(member);
    setLoading(true);
    try {
      const data = await loadBill(member, lastClosedCycle);
      setBillData(data);
      setStep("bill");
    } finally {
      setLoading(false);
    }
  }

  async function handlePayment(fullPayment: boolean) {
    if (submittingRef.current) return;
    if (!selectedMember || !lastClosedCycle || !billData) return;
    const amount = fullPayment
      ? billData.amountOwed
      : Number.parseFloat(paymentAmount);
    if (!amount || amount <= 0) return;

    submittingRef.current = true;
    setLoading(true);
    try {
      // Always go through the offline queue — it syncs immediately when online and
      // queues durably when not.
      await queueCashPayment({
        memberId: selectedMember.id,
        memberName: `${selectedMember.first_name} ${selectedMember.last_name}`,
        billingCycleId: lastClosedCycle.id,
        billingCycleName: lastClosedCycle.name,
        amount,
        collectorMemberId: collector.id,
        paymentType: "cash",
        notes: fullPayment ? "Paid in full" : "Partial payment",
        isFullPayment: fullPayment,
      });
      setIsFullPayment(fullPayment);
      setStep("success");
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePin() {
    if (!selectedMember || newPin.length !== 4) return;
    setPinSaving(true);
    try {
      const { error } = await supabase
        .from("members")
        .update({ pin_code: newPin, updated_at: new Date().toISOString() })
        .eq("id", selectedMember.id);
      if (!error) {
        setSelectedMember({ ...selectedMember, pin_code: newPin });
        setAllMembers((prev) =>
          prev.map((m) =>
            m.id === selectedMember.id ? { ...m, pin_code: newPin } : m
          )
        );
        // Also update local cache so the main kiosk sees the change without a refetch.
        try {
          const cached = await db.members.get(selectedMember.id);
          if (cached) {
            await db.members.put({ ...cached, pin_code: newPin });
          }
        } catch (err) {
          console.warn("[cash] failed to update member cache:", err);
        }
        setEditingPin(false);
        setNewPin("");
      } else {
        console.error("[cash] PIN save error:", error.message);
      }
    } finally {
      setPinSaving(false);
    }
  }

  function calculateChange(received: number, owed: number) {
    const change = received - owed;
    if (change <= 0) return { change: 0, breakdown: [] as Array<{ denom: number; count: number }> };
    const breakdown: Array<{ denom: number; count: number }> = [];
    let remaining = change;
    for (const denom of DENOMINATIONS) {
      const count = Math.floor(remaining / denom);
      if (count > 0) {
        breakdown.push({ denom, count });
        remaining -= count * denom;
      }
    }
    return { change, breakdown };
  }

  function resetToSearch() {
    setStep("search");
    setSelectedMember(null);
    setBillData(null);
    setPaymentAmount("");
    setSearchQuery("");
    setFilteredMembers([]);
    setShowChangeCalc(false);
    setAmountReceived("");
    setEditingPin(false);
    setNewPin("");
    submittingRef.current = false;
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }

  const changeResult =
    amountReceived && billData
      ? calculateChange(Number.parseFloat(amountReceived), billData.amountOwed)
      : { change: 0, breakdown: [] };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col">
      <header className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={onExit}
            className="w-10 h-10 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-stone-900">Cash Collection</h1>
            {lastClosedCycle && (
              <p className="text-sm text-stone-500">
                Collecting for: <span className="font-medium">{lastClosedCycle.name}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isOnline && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
              <CloudOff className="w-3.5 h-3.5" />
              Offline
            </div>
          )}
          <div className="text-right text-sm text-stone-500">
            <Users className="w-4 h-4 inline mr-1" />
            {allMembers.length} members
          </div>
          <Button
            variant="outline"
            onClick={() => setShowChangeCalc(!showChangeCalc)}
            className="gap-2 bg-transparent h-10"
          >
            <Calculator className="w-5 h-5" />
            <span className="hidden sm:inline">Calculator</span>
          </Button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-5xl mx-auto w-full">
        {bannerError && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-sm">
            {bannerError}
          </div>
        )}

        {showChangeCalc && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowChangeCalc(false)}
          >
            <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Change Calculator</h3>
                  <button
                    onClick={() => setShowChangeCalc(false)}
                    className="text-stone-400 hover:text-stone-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-stone-900 text-white rounded-xl p-4 text-center">
                  <p className="text-stone-400 text-sm">Amount Owed</p>
                  <p className="text-3xl font-bold">
                    ₪{billData ? billData.amountOwed.toFixed(2) : "0.00"}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-stone-700 mb-2 block">
                    Amount Received
                  </label>
                  <Input
                    type="number"
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                    placeholder="0.00"
                    className="text-xl h-14 text-center font-semibold"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {[20, 50, 100, 200].map((amt) => (
                    <Button
                      key={amt}
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setAmountReceived((prev) => (Number(prev || 0) + amt).toString())
                      }
                      className="bg-transparent text-base"
                    >
                      +{amt}
                    </Button>
                  ))}
                </div>

                {Number(amountReceived) > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <p className="text-sm text-emerald-700 mb-1">Change to give:</p>
                    <p className="text-4xl font-bold text-emerald-700 mb-3">
                      ₪{changeResult.change.toFixed(2)}
                    </p>
                    {changeResult.breakdown.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {changeResult.breakdown.map((item) => (
                          <span
                            key={item.denom}
                            className="bg-white border border-emerald-200 px-3 py-1.5 rounded-lg text-sm font-semibold"
                          >
                            {item.count} × ₪{item.denom}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <Button
                  variant="outline"
                  onClick={() => setAmountReceived("")}
                  className="w-full bg-transparent"
                >
                  Clear
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {step === "search" && (
          <div className="space-y-4">
            {initialLoading ? (
              <div className="text-center py-16 text-stone-500">
                <div className="w-10 h-10 border-3 border-stone-300 border-t-stone-600 rounded-full animate-spin mx-auto mb-4" />
                <p className="text-lg">Loading members...</p>
              </div>
            ) : !lastClosedCycle ? (
              <div className="text-center py-16 text-stone-500">
                <Receipt className="w-16 h-16 mx-auto mb-4 text-stone-300" />
                <p className="text-xl font-medium">No closed billing cycle</p>
                <p className="text-base">
                  Close a billing cycle first to collect cash payments
                </p>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-stone-400" />
                  <Input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 h-16 text-xl rounded-2xl border-2 border-stone-200 focus:border-stone-400"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  )}
                </div>

                {filteredMembers.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredMembers.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => selectMember(member)}
                        disabled={loading}
                        className="bg-white border-2 border-stone-200 rounded-2xl p-4 flex items-center gap-4 hover:border-emerald-400 hover:shadow-md transition-all text-left disabled:opacity-50"
                      >
                        <div className="w-14 h-14 rounded-full bg-stone-900 flex items-center justify-center flex-shrink-0">
                          <span className="text-lg font-bold text-white">
                            {member.first_name[0]}
                            {member.last_name[0]}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-lg text-stone-900 truncate">
                            {member.first_name} {member.last_name}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {member.card_last_four && (
                              <span className="flex items-center gap-1 text-xs text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full">
                                <CreditCard className="w-3 h-3" />
                                {member.card_last_four}
                              </span>
                            )}
                            {member.pin_code && (
                              <span className="flex items-center gap-1 text-xs text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full">
                                <KeyRound className="w-3 h-3" />
                                {member.pin_code}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-6 h-6 text-stone-400 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}

                {searchQuery.length >= 1 && filteredMembers.length === 0 && !loading && (
                  <div className="text-center py-16 text-stone-500">
                    <User className="w-16 h-16 mx-auto mb-4 text-stone-300" />
                    <p className="text-xl">No members found</p>
                  </div>
                )}

                {searchQuery.length < 1 && (
                  <div className="text-center py-16 text-stone-400">
                    <Search className="w-16 h-16 mx-auto mb-4 text-stone-300" />
                    <p className="text-xl">Start typing to search</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === "bill" && selectedMember && billData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Card className="overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-stone-900 flex items-center justify-center">
                        <span className="text-2xl font-bold text-white">
                          {selectedMember.first_name[0]}
                          {selectedMember.last_name[0]}
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-xl text-stone-900">
                          {selectedMember.first_name} {selectedMember.last_name}
                        </p>
                        {selectedMember.email && (
                          <p className="text-sm text-stone-500">{selectedMember.email}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-stone-50 rounded-xl p-3">
                      <div className="flex items-center gap-2 text-stone-500 text-sm mb-1">
                        <CreditCard className="w-4 h-4" />
                        <span>Card</span>
                      </div>
                      <p className="font-mono font-semibold text-lg">
                        {selectedMember.card_last_four
                          ? `**** ${selectedMember.card_last_four}`
                          : "No card"}
                      </p>
                    </div>

                    <div className="bg-stone-50 rounded-xl p-3">
                      <div className="flex items-center justify-between text-stone-500 text-sm mb-1">
                        <div className="flex items-center gap-2">
                          <KeyRound className="w-4 h-4" />
                          <span>PIN</span>
                        </div>
                        <button
                          onClick={() => {
                            setEditingPin(true);
                            setNewPin(selectedMember.pin_code || "");
                          }}
                          className="text-emerald-600 hover:text-emerald-700"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                      {editingPin ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="text"
                            maxLength={4}
                            value={newPin}
                            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                            className="h-8 w-20 text-center font-mono font-semibold"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={handleSavePin}
                            disabled={newPin.length !== 4 || pinSaving}
                            className="h-8 px-2"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingPin(false)}
                            className="h-8 px-2"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <p className="font-mono font-semibold text-lg">
                          {selectedMember.pin_code || "Not set"}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {billData.businessBreakdown.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-stone-500 text-sm mb-3">
                      <Building2 className="w-4 h-4" />
                      <span>Spending by Business</span>
                    </div>
                    <div className="space-y-2">
                      {billData.businessBreakdown.map((biz) => (
                        <div
                          key={biz.name}
                          className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0"
                        >
                          <div>
                            <p className="font-medium text-stone-900">{biz.name}</p>
                            <p className="text-xs text-stone-500">
                              {biz.transactions} transactions
                            </p>
                          </div>
                          <p className="font-bold text-stone-900">₪{biz.total.toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {billData.recordedPayments.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-stone-500 text-sm mb-3">
                      <Banknote className="w-4 h-4" />
                      <span>
                        Recorded Payments ({billData.recordedPayments.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {billData.recordedPayments.map((p) => {
                        const minePayment = p.collected_by_member_id === collector.id;
                        const isEditing = editingPaymentId === p.id;
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0 gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    value={editingPaymentAmount}
                                    onChange={(e) =>
                                      setEditingPaymentAmount(e.target.value)
                                    }
                                    className="h-9 w-28 font-mono"
                                    autoFocus
                                  />
                                  <Button
                                    size="sm"
                                    onClick={async () => {
                                      await editRecordedPayment(
                                        p.id,
                                        Number.parseFloat(editingPaymentAmount)
                                      );
                                      setEditingPaymentId(null);
                                      setEditingPaymentAmount("");
                                    }}
                                    disabled={
                                      !editingPaymentAmount ||
                                      Number.parseFloat(editingPaymentAmount) <= 0
                                    }
                                    className="h-9 px-2"
                                  >
                                    <Check className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingPaymentId(null);
                                      setEditingPaymentAmount("");
                                    }}
                                    className="h-9 px-2"
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <p className="font-semibold text-stone-900 tabular-nums">
                                    ₪{p.amount.toFixed(2)}
                                    <span className="ml-2 text-xs font-normal text-stone-500 uppercase">
                                      {p.payment_type}
                                    </span>
                                  </p>
                                  <p className="text-xs text-stone-500">
                                    {minePayment ? "by you" : "by another collector"} ·{" "}
                                    {new Date(p.created_at).toLocaleString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      day: "numeric",
                                      month: "short",
                                    })}
                                  </p>
                                </>
                              )}
                            </div>
                            {!isEditing && minePayment && (
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingPaymentId(p.id);
                                    setEditingPaymentAmount(p.amount.toFixed(2));
                                  }}
                                  className="h-9 px-2 text-stone-500 hover:text-stone-900"
                                  title="Edit amount"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Delete ₪${p.amount.toFixed(2)} payment? This can't be undone from the tablet.`
                                      )
                                    ) {
                                      voidRecordedPayment(p.id);
                                    }
                                  }}
                                  className="h-9 px-2 text-red-600 hover:text-red-700"
                                  title="Delete payment"
                                >
                                  <X className="w-5 h-5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-4">
              <Card className="bg-stone-900 text-white overflow-hidden">
                <CardContent className="p-6 text-center">
                  <p className="text-stone-400 text-sm mb-1">{lastClosedCycle?.name}</p>
                  <p className="text-5xl font-bold mb-2">₪{billData.amountOwed.toFixed(2)}</p>
                  <p className="text-stone-400 text-sm">
                    {billData.transactionCount} transactions | Total: ₪
                    {billData.grandTotal.toFixed(2)}
                    {billData.totalCashPaid > 0 && (
                      <span className="text-emerald-400">
                        {" "}
                        | Paid: ₪{billData.totalCashPaid.toFixed(2)}
                      </span>
                    )}
                  </p>
                </CardContent>
              </Card>

              {billData.amountOwed > 0 ? (
                <div className="space-y-3">
                  <Button
                    onClick={() => handlePayment(true)}
                    disabled={loading}
                    className="w-full h-16 text-xl bg-emerald-600 hover:bg-emerald-700 rounded-2xl"
                  >
                    <Banknote className="w-6 h-6 mr-3" />
                    Paid Full ₪{billData.amountOwed.toFixed(2)}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setStep("payment")}
                    className="w-full h-14 text-lg bg-transparent rounded-2xl"
                  >
                    <Receipt className="w-5 h-5 mr-2" />
                    Partial Payment
                  </Button>

                  <Button
                    variant="ghost"
                    onClick={() => setShowChangeCalc(true)}
                    className="w-full h-12 text-stone-600"
                  >
                    <Calculator className="w-5 h-5 mr-2" />
                    Calculate Change
                  </Button>
                </div>
              ) : (
                <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-8 text-center">
                  <Check className="w-16 h-16 mx-auto mb-4 text-emerald-600" />
                  <p className="text-2xl font-bold text-emerald-700">Fully Paid</p>
                  <p className="text-emerald-600 mt-1">No outstanding balance</p>
                </div>
              )}

              <Button
                variant="ghost"
                onClick={resetToSearch}
                className="w-full h-12 text-stone-600"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back to Search
              </Button>
            </div>
          </div>
        )}

        {step === "payment" && selectedMember && billData && (
          <div className="max-w-md mx-auto space-y-4">
            <button
              onClick={() => setStep("bill")}
              className="flex items-center gap-2 text-stone-500 hover:text-stone-700 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to bill
            </button>

            <Card className="bg-stone-900 text-white">
              <CardContent className="p-6 text-center">
                <p className="text-stone-400 text-sm">Amount Owed</p>
                <p className="text-4xl font-bold">₪{billData.amountOwed.toFixed(2)}</p>
              </CardContent>
            </Card>

            <div>
              <label className="text-sm font-medium text-stone-700 mb-2 block">
                Payment Amount
              </label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="Enter amount"
                className="h-16 text-2xl text-center rounded-2xl"
                autoFocus
              />
            </div>

            <Button
              onClick={() => handlePayment(false)}
              disabled={
                !paymentAmount || Number.parseFloat(paymentAmount) <= 0 || loading
              }
              className="w-full h-16 text-xl bg-emerald-600 hover:bg-emerald-700 rounded-2xl"
            >
              <Banknote className="w-6 h-6 mr-3" />
              Record Payment
            </Button>
          </div>
        )}

        {step === "success" && selectedMember && (
          <div className="max-w-md mx-auto text-center py-8">
            <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
              <Check className="w-12 h-12 text-emerald-600" />
            </div>

            <h2 className="text-3xl font-bold text-stone-900 mb-2">Payment Recorded</h2>
            <p className="text-stone-500 text-lg mb-8">
              {isFullPayment ? "Full payment" : "Partial payment"} from{" "}
              {selectedMember.first_name} {selectedMember.last_name}
            </p>

            <Button
              onClick={resetToSearch}
              className="w-full h-16 text-xl bg-emerald-600 hover:bg-emerald-700 rounded-2xl"
              autoFocus
            >
              <Users className="w-6 h-6 mr-3" />
              Next Person
            </Button>

            <Button
              variant="ghost"
              onClick={onExit}
              className="w-full h-12 mt-3 text-stone-600"
            >
              Exit Cash Collection
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
