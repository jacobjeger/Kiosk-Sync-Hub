import { useLocation } from "wouter";
import { ArrowLeft, Database, Wifi, ShieldCheck, Terminal } from "lucide-react";
import { NetworkStatus } from "@/components/NetworkStatus";

export default function Settings() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <NetworkStatus />
      
      <div className="container max-w-2xl mx-auto p-6">
        <button 
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Dashboard</span>
        </button>

        <h1 className="text-3xl font-display font-bold mb-8">System Settings</h1>

        <div className="space-y-6">
          <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Local Database
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-muted-foreground">Storage Engine</span>
                <span className="font-mono bg-muted px-2 py-1 rounded text-sm">IndexedDB (Dexie)</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-muted-foreground">Database Name</span>
                <span className="font-medium">kiosk_db</span>
              </div>
              <div className="pt-2">
                <button 
                  className="text-destructive text-sm font-medium hover:underline"
                  onClick={() => {
                    if(confirm('Clear all local data? This cannot be undone.')) {
                      // Logic to clear DB could go here
                      alert('Function disabled for demo safety');
                    }
                  }}
                >
                  Clear Local Data
                </button>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Wifi className="w-5 h-5 text-primary" />
              Sync Configuration
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-muted-foreground">Remote Backend</span>
                <span className="font-mono bg-muted px-2 py-1 rounded text-sm">Supabase</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-muted-foreground">Sync Strategy</span>
                <span className="font-medium">Background + Manual</span>
              </div>
            </div>
          </div>
          
          <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
             <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Terminal className="w-5 h-5 text-primary" />
              Device Info
            </h2>
             <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-muted-foreground">User Agent</span>
                <span className="font-mono text-xs text-right max-w-[200px] truncate">{navigator.userAgent}</span>
              </div>
          </div>
        </div>
        
        <div className="mt-12 text-center text-sm text-muted-foreground">
          Kiosk App v1.0.0 • Built with Replit
        </div>
      </div>
    </div>
  );
}
