import React from "react";
import { Container, Box } from "@mui/material";

export const PageContainer = ({ children, maxWidth = "md", ...props }) => (
  <Container maxWidth={maxWidth} {...props}>
    <Box py={4}>{children}</Box>
  </Container>
);
