import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useSyncService } from "@/hooks/use-transactions";
import { motion, AnimatePresence } from "framer-motion";

export function NetworkStatus() {
  const { isOnline, isSyncing, sync } = useSyncService();

  return (
    <motion.button
      layout
      onClick={() => sync()}
      disabled={isSyncing || !isOnline}
      className={`
        fixed top-6 right-6 z-50
        flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm
        shadow-lg backdrop-blur-md border transition-colors duration-300
        ${isOnline 
          ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 hover:bg-emerald-500/20" 
          : "bg-rose-500/10 text-rose-700 border-rose-500/20 hover:bg-rose-500/20"}
      `}
    >
      <AnimatePresence mode="wait">
        {isSyncing ? (
          <motion.div
            key="syncing"
            initial={{ rotate: 0 }}
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          >
            <RefreshCw className="w-4 h-4" />
          </motion.div>
        ) : isOnline ? (
          <motion.div key="online" initial={{ scale: 0 }} animate={{ scale: 1 }}>
            <Wifi className="w-4 h-4" />
          </motion.div>
        ) : (
          <motion.div key="offline" initial={{ scale: 0 }} animate={{ scale: 1 }}>
            <WifiOff className="w-4 h-4" />
          </motion.div>
        )}
      </AnimatePresence>
      
      <span className="hidden sm:inline">
        {isSyncing ? "Syncing..." : isOnline ? "Online" : "Offline Mode"}
      </span>
    </motion.button>
  );
}
