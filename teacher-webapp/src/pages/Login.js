import React, { useEffect, useState } from "react";
import {
  Box,
  Container,
  TextField,
  Button,
  MenuItem,
  Typography,
  Alert,
  CircularProgress,
  Link,
  Paper,
  InputAdornment,
} from "@mui/material";
import { Phone as PhoneIcon, Lock as LockIcon, School as SchoolIcon } from "@mui/icons-material";
import axiosInstance from "../services/axiosInstance";
import { API_ENDPOINTS } from "../constants/apiEndpoints";
import { STATUS_CODES } from "../constants/statusCodes";
import { useNavigation } from "../hooks/useNavigation";
import { showToast } from "../utils/toast";
import { useCancellableRequest, isCancelError } from "../hooks/useCancellableRequest";
import { isLocalStorageAvailable } from "../utils/authHelpers";

function Login() {
  const navigate = useNavigation();
  const signal = useCancellableRequest();
  const [showError, setShowError] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [schools, setSchools] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchSchools = async () => {
      setLoadingSchools(true);
      try {
        const response = await axiosInstance.get(`${API_ENDPOINTS.GET_SCHOOLS}`, { signal });
        if (response.status === STATUS_CODES.SUCCESS) {
          setSchools(response.data);
        } else {
          console.error("Failed to fetch schools");
          showToast.error("Failed to load schools");
        }
      } catch (error) {
        if (isCancelError(error)) {
          showToast.info("Request canceled");
          return;
        }
        console.error("Error fetching schools:", error);
        showToast.error("Failed to load schools");
      } finally {
        setLoadingSchools(false);
      }
    };

    fetchSchools();
  }, [signal]);

  const handleLogin = async () => {
    // Check localStorage availability before attempting login
    if (!isLocalStorageAvailable()) {
      setShowError(
        "Local storage is not available. Please enable cookies/local storage in your browser settings or try a different browser."
      );
      showToast.error("Local storage is required for login");
      return;
    }

    if (!phoneNumber || !password || !schoolName) {
      setShowError("All fields are required.");
      return;
    }

    setIsSubmitting(true);
    setShowError(null);
    try {
      const response = await axiosInstance.post(`${API_ENDPOINTS.LOGIN}`, {
        phoneNumber,
        password,
        tenantId: schoolName,
      });
      if (response.status === STATUS_CODES.SUCCESS) {
        localStorage.setItem("authToken", response.data.token);
        showToast.success("Login successful!");
        navigate.goToClassroom();
      }
    } catch (error) {
      console.error("Login error:", error);
      const errorMessage =
        error.response?.data?.message || "Username or password or tenant name incorrect";
      setShowError(errorMessage);
      showToast.error("Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = () => {
    navigate.goToRegister();
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

            <TextField
              fullWidth
              select
              label="School"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              margin="normal"
              required
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    {loadingSchools ? <CircularProgress size={20} /> : <SchoolIcon />}
                  </InputAdornment>
                ),
              }}
              aria-label="School selection"
              aria-required="true"
            >
              <MenuItem value="" disabled={loadingSchools}>
                {loadingSchools ? "Select School" : "Select School"}
              </MenuItem>
              {schools.map((sch, idx) => {
                const value = sch.id;
                const label = sch.tenantName;
                return (
                  <MenuItem key={idx} value={value}>
                    {label}
                  </MenuItem>
                );
              })}
            </TextField>

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
              disabled={isSubmitting || loadingSchools}
            >
              {isSubmitting ? <CircularProgress size={24} color="inherit" /> : "Login"}
            </Button>

            <Box textAlign="center">
              <Link
                component="button"
                variant="body2"
                onClick={handleRegister}
                sx={{ cursor: "pointer" }}
                aria-label="Navigate to registration page"
              >
                Don&apos;t have an account? Sign up
              </Link>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}

export default Login;
