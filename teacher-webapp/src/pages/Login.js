import React, { useState } from "react";
import {
  Box,
  Container,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Paper,
  InputAdornment,
} from "@mui/material";
import { Phone as PhoneIcon, Lock as LockIcon } from "@mui/icons-material";
import axiosInstance from "../services/axiosInstance";
import { API_ENDPOINTS } from "../constants/apiEndpoints";
import { STATUS_CODES } from "../constants/statusCodes";
import { useNavigation } from "../hooks/useNavigation";
import { showToast } from "../utils/toast";
import { isLocalStorageAvailable } from "../utils/authHelpers";
import { isValidPhoneNumber } from "../utils/phoneUtils";
import { useAuthState } from "../context/AuthContext";

function Login() {
  const navigate = useNavigation();
  const { setLoggedIn } = useAuthState();
  const [showError, setShowError] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    // Check localStorage availability before attempting login
    if (!isLocalStorageAvailable()) {
      setShowError(
        "Local storage is not available. Please enable cookies/local storage in your browser settings or try a different browser."
      );
      showToast.error("Local storage is required for login");
      return;
    }

    if (!phoneNumber || !password) {
      setShowError("All fields are required.");
      return;
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      setShowError("Phone number must be exactly 10 digits.");
      return;
    }

    setIsSubmitting(true);
    setShowError(null);
    try {
      const response = await axiosInstance.post(API_ENDPOINTS.LOGIN, {
        phoneNumber,
        password,
      });
      if (response.status === STATUS_CODES.SUCCESS) {
        localStorage.setItem("authToken", response.data.token);
        setLoggedIn(true);
        showToast.success("Login successful!");
        navigate.goToClassroom();
      }
    } catch (error) {
      console.error("Login error:", error);
      const errorMessage =
        error.response?.data?.message || "Username or password incorrect";
      setShowError(errorMessage);
      showToast.error("Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: "100%" }}>
          <Typography component="h1" variant="h4" align="center" gutterBottom>
            Login
          </Typography>

          <Box component="form" sx={{ mt: 3 }}>
            <TextField
              fullWidth
              label="Phone Number"
              type="tel"
              value={phoneNumber}
              onChange={(e) => {
                const digitsOnly = e.target.value.replace(/\D/g, "");
                setPhoneNumber(digitsOnly);
              }}
              inputProps={{
                minLength: 10,
                maxLength: 10,
                pattern: "\\d{10}",
              }}
              margin="normal"
              required
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <PhoneIcon />
                  </InputAdornment>
                ),
              }}
              aria-label="Phone number input"
              aria-required="true"
              onKeyPress={handleKeyPress}
            />

            <TextField
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockIcon />
                  </InputAdornment>
                ),
              }}
              aria-label="Password input"
              aria-required="true"
              onKeyPress={handleKeyPress}
            />

            {showError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {showError}
              </Alert>
            )}

            <Button
              type="button"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              onClick={handleLogin}
              disabled={isSubmitting}
            >
              {isSubmitting ? <CircularProgress size={24} color="inherit" /> : "Login"}
            </Button>

          </Box>
        </Paper>
      </Box>
    </Container>
  );
}

export default Login;
