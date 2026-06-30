import React from "react";

const PASSWORD_POLICY = {
  minLength: 8,
  minLowercase: 1,
  minUppercase: 1,
  minNumbers: 1,
  minSymbols: 1,
};

export const getPasswordPolicyStatus = (password) => {
  const length = password.length >= PASSWORD_POLICY.minLength;
  const lower = (password.match(/[a-z]/g) || []).length >= PASSWORD_POLICY.minLowercase;
  const upper = (password.match(/[A-Z]/g) || []).length >= PASSWORD_POLICY.minUppercase;
  const numbers = (password.match(/[0-9]/g) || []).length >= PASSWORD_POLICY.minNumbers;
  const symbols = (password.match(/[^A-Za-z0-9]/g) || []).length >= PASSWORD_POLICY.minSymbols;
  const isValid = length && lower && upper && numbers && symbols;
  return { length, lower, upper, numbers, symbols, isValid };
};

const labelStyle = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#0f172a",
  marginBottom: "6px",
};

const inputStyle = {
  width: "100%",
  borderRadius: "10px",
  border: "1px solid #e2e8f0",
  padding: "12px",
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box",
};

const hintsContainerStyle = {
  marginTop: "8px",
  fontSize: "12px",
  color: "#94a3b8",
};

const hintsListStyle = {
  margin: "4px 0 0",
  paddingLeft: "18px",
};

const hintItemStyle = (isValid) => ({
  margin: "2px 0",
  color: isValid ? "#16a34a" : "#94a3b8",
});

const PasswordInput = ({ id = "password", label = "Password", value, onChange }) => {
  const status = getPasswordPolicyStatus(value || "");

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <input
        id={id}
        type="password"
        placeholder="Enter password"
        value={value}
        onChange={onChange}
        style={inputStyle}
      />
      <div style={hintsContainerStyle}>
        <span>Password must include:</span>
        <ul style={hintsListStyle}>
          <li style={hintItemStyle(status.length)}>
            At least {PASSWORD_POLICY.minLength} characters
          </li>
          <li style={hintItemStyle(status.lower)}>
            At least {PASSWORD_POLICY.minLowercase} lowercase letter
          </li>
          <li style={hintItemStyle(status.upper)}>
            At least {PASSWORD_POLICY.minUppercase} uppercase letter
          </li>
          <li style={hintItemStyle(status.numbers)}>
            At least {PASSWORD_POLICY.minNumbers} number
          </li>
          <li style={hintItemStyle(status.symbols)}>
            At least {PASSWORD_POLICY.minSymbols} symbol (e.g. !@#$)
          </li>
        </ul>
      </div>
    </div>
  );
};

export default PasswordInput;
