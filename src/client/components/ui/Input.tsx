import * as React from "react";

import { cn } from "@/client/lib/utils";
import { SIZES, DEFAULT_SIZE, type ControlSize } from "./_shared/sizes";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** @default "md" — shares heights with Button/Select so controls line up. */
  size?: ControlSize;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = DEFAULT_SIZE, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex w-full border border-edge bg-abyss text-frost shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-dusk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blood focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:cursor-not-allowed disabled:opacity-50",
          SIZES[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
