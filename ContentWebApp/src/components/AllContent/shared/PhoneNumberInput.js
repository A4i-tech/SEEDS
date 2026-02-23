import React from "react";
import { sanitizePhoneInput, PHONE_DIGITS_LENGTH } from "../../../utils/phoneUtils";

/**
 * Phone number input: digits only, max 10.
 */
export const PhoneNumberInput = ({
  value,
  onChange,
  id,
  placeholder = "Phone number",
  className = "",
  disabled = false,
  autoFocus = false,
  readOnly = false,
  required = true,
}) => {
  const handleChange = (e) => {
    onChange(sanitizePhoneInput(e.target.value));
  };

  return (
    <input
      type="tel"
      id={id}
      placeholder={placeholder}
      className={className}
      value={value}
      onChange={handleChange}
      maxLength={PHONE_DIGITS_LENGTH}
      aria-label="Phone number (10 digits)"
      disabled={disabled}
      autoFocus={autoFocus}
      readOnly={readOnly}
      required={required}
    />
  );
};
