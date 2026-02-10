import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Cloud, CloudOff, Search } from "lucide-react";
import { NetworkStatus } from "@/components/NetworkStatus";
import { useTransactions } from "@/hooks/use-transactions";
import { format } from "date-fns";

export default function History() {
  const [, setLocation] = useLocation();
  const { data: transactions, isLoading } = useTransactions();

  const totalAmount = transactions?.reduce((sum, tx) => sum + parseFloat(tx.amount), 0) || 0;
  const pendingCount = transactions?.filter(tx => tx.status === 'pending').length || 0;

  return (
    <div className="min-h-screen bg-muted/20">
      <NetworkStatus />
      
      {/* Header */}
      <div className="bg-background border-b border-border sticky top-0 z-20 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setLocation("/")}
            className="p-2 -ml-2 hover:bg-muted rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-display font-bold">Transaction History</h1>
        </div>
        
        <div className="text-right">
          <div className="text-sm text-muted-foreground font-medium uppercase tracking-wide">Total Sales</div>
          <div className="text-2xl font-bold font-mono">${totalAmount.toFixed(2)}</div>
        </div>
      </div>

      <div className="container max-w-5xl mx-auto p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-background p-4 rounded-xl border border-border shadow-sm">
            <div className="text-muted-foreground text-xs font-bold uppercase mb-1">Total Txns</div>
            <div className="text-3xl font-display font-bold">{transactions?.length || 0}</div>
          </div>
          <div className="bg-background p-4 rounded-xl border border-border shadow-sm">
            <div className="text-orange-500 text-xs font-bold uppercase mb-1">Pending Sync</div>
            <div className="text-3xl font-display font-bold text-orange-600">{pendingCount}</div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search transactions..." 
            className="w-full pl-12 pr-4 py-3 rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
          />
        </div>

        {/* Transactions List */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-20 text-muted-foreground">Loading transactions...</div>
          ) : transactions?.length === 0 ? (
            <div className="text-center py-20 bg-background rounded-2xl border border-dashed border-border">
              <div className="text-muted-foreground">No transactions found</div>
              <button 
                onClick={() => setLocation("/transaction")}
                className="mt-4 text-primary font-medium hover:underline"
              >
                Create your first sale
              </button>
            </div>
          ) : (
            transactions?.map((tx, i) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-background p-4 rounded-xl border border-border shadow-sm flex items-center justify-between hover:border-primary/50 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className={`
                    w-12 h-12 rounded-full flex items-center justify-center shrink-0
                    ${tx.status === 'synced' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}
                  `}>
                    {tx.status === 'synced' ? (
                      <Cloud className="w-6 h-6" />
                    ) : (
                      <CloudOff className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-lg">${parseFloat(tx.amount).toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <span>{format(tx.createdAt, 'MMM d, h:mm a')}</span>
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                      <span className="max-w-[150px] truncate">{tx.description}</span>
                    </div>
                  </div>
                </div>
                
                <div className="text-right hidden sm:block">
                  <span className={`
                    px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide
                    ${tx.status === 'synced' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}
                  `}>
                    {tx.status === 'synced' ? 'Synced' : 'Pending'}
                  </span>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
