import React from "react";
import * as RCheckbox from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";

/** Accessible checkbox (Radix). Supports indeterminate for "select all". */
export function Checkbox({ checked, onCheckedChange, "aria-label": ariaLabel }) {
  return (
    <RCheckbox.Root
      className="ck"
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={ariaLabel}
    >
      <RCheckbox.Indicator>
        {checked === "indeterminate" ? <Minus /> : <Check />}
      </RCheckbox.Indicator>
    </RCheckbox.Root>
  );
}

export default Checkbox;
