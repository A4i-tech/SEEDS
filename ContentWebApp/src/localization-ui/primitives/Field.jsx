import React, { useId } from "react";
import { cn } from "../lib/cn";

export function Field({ label, htmlFor, help, error, children }) {
  const autoId = useId();
  const id = htmlFor || autoId;
  const child =
    label && React.isValidElement(children)
      ? React.cloneElement(children, { id: children.props.id || id })
      : children;
  return (
    <div className="field">
      {label ? (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      {child}
      {error ? (
        <span className="err" role="alert">
          {error}
        </span>
      ) : help ? (
        <span className="help">{help}</span>
      ) : null}
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
      <input ref={ref} className="input" type="search" aria-label={ariaLabel} {...rest} />
    </span>
  );
});
