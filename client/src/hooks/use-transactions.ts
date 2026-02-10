import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db, type LocalTransaction } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { nanoid } from "nanoid";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";

// ============================================
// HOOKS FOR LOCAL-FIRST DATA
// ============================================

export function useTransactions() {
  // We use liveQuery from Dexie, but wrapped in useQuery for consistency with React Query
  // Note: dexie-react-hooks is better for this, but standard useQuery works for polling/fetching
  return useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const txs = await db.transactions.orderBy('createdAt').reverse().toArray();
      return txs;
    },
    refetchInterval: 1000, // Poll local DB every second to reflect changes
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { amount: string; description: string }) => {
      const newTx: LocalTransaction = {
        id: nanoid(),
        amount: data.amount,
        description: data.description,
        status: 'pending',
        createdAt: new Date(),
      };
      await db.transactions.add(newTx);
      return newTx;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast({
        title: "Transaction Saved",
        description: "Payment recorded locally. Will sync when online.",
      });
    },
  });
}

// ============================================
// SYNC LOGIC
// ============================================

export function useSyncService() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const sync = async () => {
    if (!isOnline || isSyncing) return;

    try {
      setIsSyncing(true);
      
      // 1. Get pending transactions
      const pendingTxs = await db.transactions.where('status').equals('pending').toArray();
      
      if (pendingTxs.length === 0) {
        setIsSyncing(false);
        return;
      }

      // 2. Format for Supabase (needs to match schema exactly)
      const recordsToInsert = pendingTxs.map(tx => ({
        id: tx.id,
        amount: tx.amount,
        description: tx.description,
        status: 'synced',
        synced_at: new Date().toISOString(),
        created_at: tx.createdAt.toISOString()
      }));

      // 3. Send to Supabase
      const { error } = await supabase
        .from('transactions')
        .upsert(recordsToInsert);

      if (error) throw error;

      // 4. Update local status on success
      await db.transaction('rw', db.transactions, async () => {
        for (const tx of pendingTxs) {
          await db.transactions.update(tx.id, { 
            status: 'synced', 
            syncedAt: new Date() 
          });
        }
      });

      toast({
        title: "Sync Complete",
        description: `Successfully synced ${pendingTxs.length} records.`,
      });

      queryClient.invalidateQueries({ queryKey: ['transactions'] });

    } catch (err) {
      console.error("Sync failed:", err);
      toast({
        title: "Sync Failed",
        description: "Could not upload transactions. Will retry later.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline) {
      sync();
    }
  }, [isOnline]);

  return { isOnline, isSyncing, sync };
}
