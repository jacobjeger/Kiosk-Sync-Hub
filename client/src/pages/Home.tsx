import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Store, CreditCard, History, Settings } from "lucide-react";
import { NetworkStatus } from "@/components/NetworkStatus";

export default function Home() {
  const [, setLocation] = useLocation();

  const menuItems = [
    {
      title: "New Sale",
      description: "Process a new transaction",
      icon: CreditCard,
      color: "bg-primary text-primary-foreground",
      path: "/transaction",
      delay: 0.1
    },
    {
      title: "History",
      description: "View past transactions",
      icon: History,
      color: "bg-accent text-accent-foreground",
      path: "/history",
      delay: 0.2
    },
    {
      title: "Settings",
      description: "Configure kiosk mode",
      icon: Settings,
      color: "bg-white text-foreground border-2 border-border",
      path: "/settings", // Placeholder
      delay: 0.3
    }
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col items-center justify-center p-6">
      <div className="absolute inset-0 bg-grid-pattern opacity-5 pointer-events-none" />
      <NetworkStatus />

      {/* Hero Section */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12 relative z-10"
      >
        <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6 text-primary">
          <Store className="w-10 h-10" />
        </div>
        <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
          Store Kiosk
        </h1>
        <p className="text-muted-foreground text-lg max-w-md mx-auto">
          Welcome. Select an option below to get started.
        </p>
      </motion.div>

      {/* Menu Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl relative z-10">
        {menuItems.map((item) => (
          <motion.button
            key={item.title}
            onClick={() => setLocation(item.path)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: item.delay }}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
            whileTap={{ scale: 0.98 }}
            className={`
              relative overflow-hidden group p-8 rounded-3xl text-left h-64 flex flex-col justify-between
              shadow-lg hover:shadow-xl transition-all duration-300
              ${item.color}
            `}
          >
            <div className="relative z-10">
              <item.icon className="w-12 h-12 mb-4" />
              <h3 className="text-2xl font-bold mb-2">{item.title}</h3>
              <p className="opacity-80 text-sm font-medium">{item.description}</p>
            </div>

            {/* Decorative background circle */}
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
          </motion.button>
        ))}
      </div>
    </div>
  );
}
