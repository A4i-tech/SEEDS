import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  TextField,
  Button,
  MenuItem,
  Typography,
  Alert,
  CircularProgress,
  Paper,
  InputAdornment,
} from "@mui/material";
import { Lock as LockIcon, School as SchoolIcon } from "@mui/icons-material";
import axiosInstance from "../services/axiosInstance";
import { API_ENDPOINTS } from "../constants/apiEndpoints";
import { STATUS_CODES } from "../constants/statusCodes";
import { showToast } from "../utils/toast";
import { PhoneNumberInput } from "../components/common/PhoneNumberInput";
import { isValidPhoneNumber } from "../utils/phoneUtils";
import { useCancellableRequest, isCancelError } from "../hooks/useCancellableRequest";

const Register = () => {
  const navigate = useNavigate();
  const signal = useCancellableRequest();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [school, setSchool] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchSchools = async () => {
      setLoadingSchools(true);
      try {
        const response = await axiosInstance.get(`${API_ENDPOINTS.GET_SCHOOLS}`, { signal });
        if (response.status === STATUS_CODES.SUCCESS) {
          setSchool(response.data);
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

  const handleRegister = async () => {
    if (!phoneNumber || !password || !schoolName) {
      setError("All fields are required.");
      return;
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      setError("Phone number must be exactly 10 digits.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await axiosInstance.post(`${API_ENDPOINTS.REGISTER}`, {
        phoneNumber,
        password,
        tenantId: schoolName,
      });
      if (response.status === STATUS_CODES.CREATED) {
        showToast.success("Registration successful! Please login.");
        navigate("/"); // Navigate to the login page after successful registration
      }
    } catch (err) {
      console.error("Registration error:", err);
      const errorMessage = err.response?.data?.message || "Registration failed. Please try again.";
      setError(errorMessage);
      showToast.error("Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleRegister();
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
            Register
          </Typography>

          <Box component="form" sx={{ mt: 3 }}>
            <PhoneNumberInput
              value={phoneNumber}
              onChange={setPhoneNumber}
              onKeyPress={handleKeyPress}
              aria-label="Phone number input"
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
              {school.map((sch, idx) => {
                const value = sch.id;
                const label = sch.tenantName;
                return (
                  <MenuItem key={idx} value={value}>
                    {label}
                  </MenuItem>
                );
              })}
            </TextField>

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

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              type="button"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              onClick={handleRegister}
              disabled={isSubmitting || loadingSchools}
            >
              {isSubmitting ? <CircularProgress size={24} color="inherit" /> : "Register"}
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default Register;
