import React from "react";
import { Search } from "lucide-react";
import { cn } from "../lib/cn";

export function Field({ label, htmlFor, help, error, children }) {
  return (
    <div className="field">
      {label ? <label className="label" htmlFor={htmlFor}>{label}</label> : null}
      {children}
      {error ? <span className="err" role="alert">{error}</span> : help ? <span className="help">{help}</span> : null}
    </div>
  );
}

export const Input = React.forwardRef(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn("input", className)} {...rest} />;
});

export const Textarea = React.forwardRef(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn("input", className)} {...rest} />;
});

export const SearchInput = React.forwardRef(function SearchInput(
  { className, "aria-label": ariaLabel = "Search", ...rest },
  ref
) {
  return (
    <span className={cn("input-search", className)}>
      <Search aria-hidden="true" />
      <input ref={ref} className="input" type="search" aria-label={ariaLabel} {...rest} />
    </span>
  );
});
