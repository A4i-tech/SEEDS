import React from "react";
import { Skeleton } from "@mui/material";

export const LoadingSkeleton = ({ variant = "rectangular", ...props }) => (
  <Skeleton variant={variant} animation="wave" {...props} />
);
