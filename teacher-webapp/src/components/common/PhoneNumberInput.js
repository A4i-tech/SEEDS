import React from "react";
import { TextField, InputAdornment } from "@mui/material";
import { Phone as PhoneIcon } from "@mui/icons-material";
import { sanitizePhoneInput, PHONE_DIGITS_LENGTH } from "../../utils/phoneUtils";

/**
 * Phone number input: digits only, max 10. Value is always sanitized on change.
 * Parent only needs to check value.length === 10 before submit.
 */
export const PhoneNumberInput = ({
  value,
  onChange,
  label = "Phone Number",
  fullWidth = true,
  margin = "normal",
  required = true,
  InputProps,
  inputProps,
  ...rest
}) => {
  const handleChange = (e) => {
    const next = sanitizePhoneInput(e.target.value);
    onChange(next);
  };

  return (
    <TextField
      {...rest}
      fullWidth={fullWidth}
      label={label}
      type="tel"
      value={value}
      onChange={handleChange}
      inputProps={{
        maxLength: PHONE_DIGITS_LENGTH,
        "aria-label": "Phone number (10 digits)",
        ...inputProps,
      }}
      margin={margin}
      required={required}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <PhoneIcon />
          </InputAdornment>
        ),
        ...InputProps,
      }}
    />
  );
};
