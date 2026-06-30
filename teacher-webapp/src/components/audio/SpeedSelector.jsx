import React from "react";
import { Select, MenuItem } from "@mui/material";

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0];

/**
 * SpeedSelector - reusable playback speed control
 */
const SpeedSelector = ({
  value,
  onChange,
  disabled = false,
  variant = "dark",
  size = "small",
}) => {
  const isLight = variant === "light";

  return (
    <Select
      value={value}
      onChange={onChange}
      disabled={disabled}
      size={size}
      variant="outlined"
      sx={{
        ml: size === "small" ? 0.5 : 1,
        minWidth: size === "small" ? 58 : 64,
        height: size === "small" ? 28 : 32,
        fontWeight: 700,
        fontSize: size === "small" ? "0.7rem" : "0.75rem",
        color: isLight ? "text.primary" : "white",
        "& .MuiSelect-select": { py: size === "small" ? 0.25 : 0.5, px: 1 },
        "& .MuiOutlinedInput-notchedOutline": {
          borderColor: value !== 1.0 ? "#2e7d32" : isLight ? "grey.400" : "grey.600",
        },
        "&:hover .MuiOutlinedInput-notchedOutline": {
          borderColor: "#2e7d32",
        },
        "& .MuiSelect-icon": { color: isLight ? "text.secondary" : "white" },
      }}
      aria-label="Playback speed"
    >
      {SPEED_OPTIONS.map((opt) => (
        <MenuItem key={opt} value={opt} sx={{ fontSize: "0.8rem" }}>
          {opt}x
        </MenuItem>
      ))}
    </Select>
  );
};

export default SpeedSelector;
export { SPEED_OPTIONS };
