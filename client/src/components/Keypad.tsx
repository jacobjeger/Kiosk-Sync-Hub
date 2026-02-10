import { motion } from "framer-motion";
import { Delete, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface KeypadProps {
  onKeyPress: (key: string) => void;
  onDelete: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  hasValue?: boolean;
}

export function Keypad({ onKeyPress, onDelete, onSubmit, disabled, hasValue }: KeypadProps) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"];

  return (
    <div className="grid grid-cols-3 gap-4 w-full max-w-sm mx-auto p-4">
      {keys.map((key) => (
        <motion.button
          key={key}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onKeyPress(key)}
          disabled={disabled}
          className="
            aspect-square rounded-2xl text-3xl font-display font-medium
            bg-white shadow-sm border border-border/50
            hover:shadow-md hover:border-primary/50 hover:text-primary
            active:bg-primary/5
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200
          "
        >
          {key}
        </motion.button>
      ))}
      
      {/* Delete Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onDelete}
        disabled={disabled}
        className="
          aspect-square rounded-2xl flex items-center justify-center
          bg-red-50 text-red-500 border border-red-100
          hover:bg-red-100 hover:border-red-200
          active:scale-95
          transition-all duration-200
        "
      >
        <Delete className="w-8 h-8" />
      </motion.button>

      {/* Submit Button (Spans full width at bottom or replaces empty slot?) 
          Let's put it outside the grid or make it prominent. 
          Actually, let's keep the grid clean and put Submit as a big separate button.
          But for a classic ATM feel, let's just leave the grid 3x4.
      */}
    </div>
  );
}
