import React from "react";
import * as RCheckbox from "@radix-ui/react-checkbox";

export function Checkbox({ checked, onCheckedChange, "aria-label": ariaLabel }) {
  return (
    <RCheckbox.Root
      className="ck"
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={ariaLabel}
    />
  );
}

export default Checkbox;
