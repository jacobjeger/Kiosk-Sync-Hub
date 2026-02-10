import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import KioskPage from "@/pages/KioskPage";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <KioskPage />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
