import React from "react";
import { cn } from "../lib/cn";

/**
 * Button — tokenized, variants: primary | ghost | subtle | danger | good.
 * sizes: sm | md | lg | icon. Renders a real <button> (keyboard + focus free).
 */
export const Button = React.forwardRef(function Button(
  { variant = "ghost", size = "md", className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "btn",
        `btn-${variant}`,
        size === "sm" && "btn-sm",
        size === "lg" && "btn-lg",
        size === "icon" && "btn-icon",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export default Button;
