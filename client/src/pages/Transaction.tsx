import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, DollarSign } from "lucide-react";
import { Keypad } from "@/components/Keypad";
import { useCreateTransaction } from "@/hooks/use-transactions";
import { NetworkStatus } from "@/components/NetworkStatus";
import { useToast } from "@/hooks/use-toast";

export default function Transaction() {
  const [, setLocation] = useLocation();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const { mutate: createTransaction, isPending } = useCreateTransaction();
  const { toast } = useToast();

  const handleKeyPress = (key: string) => {
    if (amount.includes(".") && key === ".") return;
    if (amount.length >= 8) return; // Max length
    setAmount(prev => prev + key);
  };

  const handleDelete = () => {
    setAmount(prev => prev.slice(0, -1));
  };

  const handleSubmit = () => {
    if (!amount || parseFloat(amount) === 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount greater than 0.",
        variant: "destructive"
      });
      return;
    }

    createTransaction(
      { amount, description: description || "Walk-in Customer" },
      {
        onSuccess: () => {
          setAmount("");
          setDescription("");
          // Could redirect to success page, but toast is enough for quick kiosk flow
          setTimeout(() => setLocation("/history"), 500);
        }
      }
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <NetworkStatus />
      
      {/* Left Panel: Input Display */}
      <div className="w-full md:w-1/2 p-6 md:p-12 flex flex-col justify-between bg-white dark:bg-zinc-900 border-r border-border relative">
        <button 
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Cancel</span>
        </button>

        <div className="flex flex-col items-center justify-center flex-grow py-12">
          <div className="text-muted-foreground font-medium mb-4 uppercase tracking-wider text-sm">
            Total Amount
          </div>
          <div className="relative flex items-center justify-center">
            <DollarSign className="w-8 h-8 md:w-12 md:h-12 text-muted-foreground/50 absolute -left-10 md:-left-16 top-1/2 -translate-y-1/2" />
            <motion.div 
              key={amount}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-6xl md:text-8xl font-display font-bold text-foreground tracking-tight"
            >
              {amount || "0.00"}
            </motion.div>
          </div>
          
          <input
            type="text"
            placeholder="Add a note (optional)..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-12 w-full max-w-sm text-center bg-transparent border-b border-border py-2 focus:outline-none focus:border-primary transition-colors text-lg"
          />
        </div>

        {/* Action Button for Mobile (Hidden on Desktop, Keypad is on right) */}
        <div className="md:hidden w-full mt-4">
          <button
            onClick={handleSubmit}
            disabled={!amount || isPending}
            className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-all disabled:opacity-50"
          >
            {isPending ? "Processing..." : "Charge"}
          </button>
        </div>
      </div>

      {/* Right Panel: Keypad */}
      <div className="hidden md:flex w-full md:w-1/2 bg-muted/30 p-8 flex-col items-center justify-center">
        <div className="bg-white/50 dark:bg-black/20 p-8 rounded-3xl shadow-xl backdrop-blur-sm border border-white/20 w-full max-w-md">
          <Keypad 
            onKeyPress={handleKeyPress}
            onDelete={handleDelete}
            onSubmit={handleSubmit}
            disabled={isPending}
            hasValue={!!amount}
          />
          
          <button
            onClick={handleSubmit}
            disabled={!amount || isPending}
            className="w-full mt-8 py-4 bg-primary text-primary-foreground rounded-xl font-bold text-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:transform-none flex items-center justify-center gap-2"
          >
            {isPending ? (
              <span className="animate-pulse">Processing...</span>
            ) : (
              <>
                <Check className="w-6 h-6" />
                Charge Card
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
