import { useState, useEffect, useCallback, useRef } from "react";
import { useKioskData } from "@/hooks/use-kiosk-data";
import { useOfflineQueue } from "@/hooks/use-offline-queue";
import { useWakeLock } from "@/lib/wake-lock";
import { MemberSelector } from "@/components/kiosk/member-selector";
import { PinEntry } from "@/components/kiosk/pin-entry";
import { BusinessSelector } from "@/components/kiosk/business-selector";
import { AmountSelector } from "@/components/kiosk/amount-selector";
import { SuccessScreen } from "@/components/kiosk/success-screen";
import { IdleOverlay } from "@/components/kiosk/idle-overlay";
import { ProfileDrawer } from "@/components/kiosk/profile-drawer";
import { KioskMessagePopup } from "@/components/kiosk/kiosk-message-popup";
import type { Member, Business } from "@/lib/types";
import { useNetworkStatus } from "@/hooks/use-network-status";
import {
  ChevronLeft,
  AlertTriangle,
  Wifi,
  WifiOff,
  CloudOff,
  RefreshCw,
  CheckCircle2,
  X,
} from "lucide-react";

type KioskStep =
  | "member"
  | "pin"
  | "business"
  | "product"
  | "success"
  | "paused"
  | "disabled";

const IDLE_TIMEOUT = 45000;
const PIN_IDLE_TIMEOUT = 10000;

export default function KioskPage() {
  const { members, businesses, isLoading: dataLoading, refresh, isError } = useKioskData();
  const { isOnline, onReconnect } = useNetworkStatus();
  const { pendingCount, isSyncing, queueTransaction, syncAll } =
    useOfflineQueue(onReconnect);

  useEffect(() => {
    return onReconnect(() => {
      console.log("[kiosk] Reconnected - refreshing member/business data");
      refresh();
    });
  }, [onReconnect, refresh]);

  const [step, setStep] = useState<KioskStep>("member");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(
    null
  );
  const [lastTransactionAmount, setLastTransactionAmount] = useState<number>(0);
  const [showProfile, setShowProfile] = useState(false);
  const [showKioskMessage, setShowKioskMessage] = useState(false);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(10);
  const [pinVerified, setPinVerified] = useState(false);
  const [showSyncStatus, setShowSyncStatus] = useState(false);
  const syncPopupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return useWakeLock();
  }, []);

  useEffect(() => {
    if (!showSyncStatus) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (syncPopupRef.current && !syncPopupRef.current.contains(e.target as Node)) {
        setShowSyncStatus(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [showSyncStatus]);

  const resetIdleTimer = useCallback(() => {
    setShowIdleWarning(false);
    setIdleCountdown(10);
  }, []);

  const handleReset = useCallback(() => {
    setSelectedMember(null);
    setSelectedBusiness(null);
    setStep("member");
    setShowIdleWarning(false);
    setIdleCountdown(10);
    setShowProfile(false);
    setShowKioskMessage(false);
    setPinVerified(false);
  }, []);

  useEffect(() => {
    if (!selectedMember || step === "member" || step === "success") return;

    const timeout = step === "pin" ? PIN_IDLE_TIMEOUT : IDLE_TIMEOUT;

    let idleTimer: ReturnType<typeof setTimeout>;
    const startIdleTimer = () => {
      idleTimer = setTimeout(() => {
        if (step === "pin") {
          handleReset();
        } else {
          setShowIdleWarning(true);
        }
      }, timeout);
    };
    const handleActivity = () => {
      clearTimeout(idleTimer);
      resetIdleTimer();
      startIdleTimer();
    };
    window.addEventListener("touchstart", handleActivity);
    window.addEventListener("mousedown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    startIdleTimer();
    return () => {
      clearTimeout(idleTimer);
      window.removeEventListener("touchstart", handleActivity);
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
    };
  }, [step, selectedMember, resetIdleTimer, handleReset]);

  useEffect(() => {
    if (!showIdleWarning) return;
    const timer = setInterval(() => {
      setIdleCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleReset();
          return 10;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [showIdleWarning, handleReset]);

  const handleMemberSelect = (member: Member) => {
    setSelectedMember(member);
    if (member.is_active === false) {
      setStep("disabled");
      return;
    }
    if (member.status === "paused") {
      setStep("paused");
      return;
    }

    const shouldRequirePin = member.pin_code && !member.skip_pin;
    if (shouldRequirePin) {
      setStep("pin");
    } else {
      setPinVerified(true);
      setStep("business");
      if (member.kiosk_message) setShowKioskMessage(true);
    }
  };

  const handleBack = () => {
    if (step === "pin") {
      setSelectedMember(null);
      setStep("member");
    } else if (step === "business") {
      const shouldRequirePin =
        selectedMember?.pin_code && !selectedMember?.skip_pin;
      if (shouldRequirePin) {
        setStep("pin");
      } else {
        setSelectedMember(null);
        setStep("member");
      }
    } else if (step === "product") {
      setSelectedBusiness(null);
      setStep("business");
    }
  };

  const handleTransactionSuccess = (newBalance: number, amount: number) => {
    if (selectedMember)
      setSelectedMember({ ...selectedMember, balance: newBalance });
    setLastTransactionAmount(amount);
    setStep("success");
  };

  if (dataLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-stone-200 border-t-stone-900 rounded-full animate-spin" />
          <p className="text-stone-400 text-xs tracking-wide" data-testid="text-loading">
            Loading
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col select-none">
      {showIdleWarning && (
        <IdleOverlay countdown={idleCountdown} onContinue={resetIdleTimer} />
      )}

      {selectedMember && (
        <ProfileDrawer
          member={selectedMember}
          isOpen={showProfile}
          onClose={() => setShowProfile(false)}
          showBalance={step !== "pin"}
        />
      )}

      {showKioskMessage && selectedMember?.kiosk_message && (
        <KioskMessagePopup
          member={selectedMember}
          onClose={() => setShowKioskMessage(false)}
        />
      )}

      <header className="bg-white border-b border-stone-200 px-3 py-2 flex-shrink-0 sticky top-0 z-40">
        <div className="flex items-center justify-between max-w-lg mx-auto gap-2">
          <div className="flex items-center gap-2">
            {step !== "member" &&
              step !== "success" &&
              step !== "paused" &&
              step !== "disabled" && (
                <button
                  data-testid="button-back"
                  onClick={handleBack}
                  className="w-7 h-7 -ml-1 flex items-center justify-center text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors active:scale-95"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
            <span className="text-stone-900 text-base font-bold tracking-tight">
              PDCA
            </span>
            <span className="text-stone-300 text-[9px] font-medium leading-none mt-0.5" data-testid="text-app-version">
              v1.7
            </span>
            <div className="relative" ref={syncPopupRef}>
              <button
                onClick={() => setShowSyncStatus(!showSyncStatus)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                  isOnline && !isError
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700"
                }`}
                data-testid="status-network"
              >
                {isOnline && !isError ? (
                  <Wifi className="w-3 h-3" />
                ) : (
                  <WifiOff className="w-3 h-3" />
                )}
                {pendingCount > 0 && (
                  <span className="bg-amber-500 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center -mr-0.5">
                    {pendingCount}
                  </span>
                )}
              </button>

              {showSyncStatus && (
                <div className="absolute top-full left-0 mt-1.5 bg-white border border-stone-200 rounded-lg shadow-lg p-3 min-w-[200px] z-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-stone-700">Sync Status</span>
                    <button
                      data-testid="button-close-sync"
                      onClick={() => setShowSyncStatus(false)}
                      className="text-stone-400 hover:text-stone-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    {isOnline && !isError ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs text-stone-600">Connected</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-4 h-4 text-red-500" />
                        <span className="text-xs text-stone-600">Offline</span>
                      </>
                    )}
                  </div>

                  {pendingCount > 0 ? (
                    <div className="border-t border-stone-100 pt-2">
                      <div className="flex items-center gap-2 mb-2">
                        <CloudOff className="w-4 h-4 text-amber-500" />
                        <span className="text-xs text-stone-600">
                          {pendingCount} pending transaction{pendingCount > 1 ? "s" : ""}
                        </span>
                      </div>
                      {isOnline && !isError && (
                        <button
                          data-testid="button-sync-now"
                          onClick={() => syncAll()}
                          disabled={isSyncing}
                          className="w-full flex items-center justify-center gap-1.5 bg-stone-900 text-white rounded-md py-1.5 text-xs font-medium hover:bg-stone-800 transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin" : ""}`} />
                          {isSyncing ? "Syncing..." : "Sync now"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="border-t border-stone-100 pt-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs text-stone-600">All synced</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {step !== "success" && step !== "paused" && step !== "disabled" && (
            <div className="flex items-center gap-1">
              {[
                { key: "member", label: "Select" },
                ...(selectedMember?.pin_code && !selectedMember?.skip_pin
                  ? [{ key: "pin", label: "PIN" }]
                  : []),
                { key: "business", label: "Business" },
                { key: "product", label: "Amount" },
              ].map((s, i, arr) => {
                const stepIndex = arr.findIndex((x) => x.key === step);
                const isActive = s.key === step;
                const isCompleted = i < stepIndex;
                return (
                  <div key={s.key} className="flex items-center gap-1">
                    <div
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                        isActive
                          ? "bg-stone-900 text-white"
                          : isCompleted
                            ? "bg-stone-300 text-stone-600"
                            : "bg-stone-100 text-stone-400"
                      }`}
                    >
                      {s.label}
                    </div>
                    {i < arr.length - 1 && (
                      <div
                        className={`w-3 h-px ${isCompleted ? "bg-stone-400" : "bg-stone-200"}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {selectedMember &&
            pinVerified &&
            step !== "member" &&
            step !== "success" &&
            step !== "paused" &&
            step !== "pin" &&
            step !== "disabled" && (
              <button
                data-testid="button-open-profile"
                onClick={() => setShowProfile(true)}
                className="flex items-center gap-2 bg-stone-50 rounded-lg px-2 py-1.5 border border-stone-200 hover:border-stone-300 hover:bg-stone-100 transition-all active:scale-[0.98]"
              >
                <div className="w-6 h-6 rounded-full bg-stone-900 flex items-center justify-center">
                  <span className="text-[9px] font-semibold text-white">
                    {selectedMember.first_name[0]}
                    {selectedMember.last_name[0]}
                  </span>
                </div>
                <div className="text-left">
                  <p className="text-[11px] font-medium text-stone-900 leading-none">
                    {selectedMember.first_name}
                  </p>
                  <p className="text-[10px] text-stone-500 font-medium leading-none mt-0.5 tabular-nums">
                    {"\u20AA"}
                    {Number(selectedMember.balance).toFixed(2)}
                  </p>
                </div>
              </button>
            )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-3 py-3">
          {step === "member" && (
            <MemberSelector members={members} onSelect={handleMemberSelect} />
          )}

          {step === "pin" && selectedMember && (
            <PinEntry
              member={selectedMember}
              onSuccess={() => {
                setPinVerified(true);
                setStep("business");
                if (selectedMember.kiosk_message) setShowKioskMessage(true);
              }}
              onCancel={() => {
                setSelectedMember(null);
                setStep("member");
                setPinVerified(false);
              }}
            />
          )}

          {step === "paused" && selectedMember && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center max-w-xs">
                <div className="w-14 h-14 mx-auto mb-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-amber-600" />
                </div>
                <h2 className="text-lg font-semibold text-stone-900 mb-1">
                  Account Paused
                </h2>
                <p className="text-sm text-stone-500 mb-5">
                  Your account has been temporarily paused and cannot make
                  transactions at this time. Please contact an administrator for
                  assistance.
                </p>
                <button
                  data-testid="button-paused-back"
                  onClick={handleReset}
                  className="bg-stone-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-stone-800 transition-colors active:scale-[0.98]"
                >
                  Go Back
                </button>
              </div>
            </div>
          )}

          {step === "disabled" && selectedMember && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center max-w-xs">
                <div className="w-14 h-14 mx-auto mb-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <h2 className="text-lg font-semibold text-stone-900 mb-1">
                  Account Disabled
                </h2>
                <p className="text-sm text-stone-500 mb-5">
                  Your account has been disabled. Please contact an
                  administrator for assistance.
                </p>
                <button
                  data-testid="button-disabled-back"
                  onClick={handleReset}
                  className="bg-stone-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-stone-800 transition-colors active:scale-[0.98]"
                >
                  Go Back
                </button>
              </div>
            </div>
          )}

          {step === "business" && selectedMember && (
            <BusinessSelector
              businesses={businesses}
              member={selectedMember}
              onSelect={(business) => {
                setSelectedBusiness(business);
                setStep("product");
              }}
            />
          )}

          {step === "product" && selectedMember && selectedBusiness && (
            <AmountSelector
              member={selectedMember}
              business={selectedBusiness}
              onSuccess={handleTransactionSuccess}
              onCancel={() => {
                setSelectedBusiness(null);
                setStep("business");
              }}
              onOfflineQueue={queueTransaction}
              isOnline={isOnline && !isError}
            />
          )}

          {step === "success" && selectedMember && selectedBusiness && (
            <SuccessScreen
              member={selectedMember}
              businessName={selectedBusiness.name}
              amount={lastTransactionAmount}
              onNewTransaction={handleReset}
            />
          )}
        </div>
      </main>
    </div>
  );
}
