import React, { useEffect, useRef, useState } from "react";
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
import { useNavigation } from "../hooks/useNavigation";
import { showToast } from "../utils/toast";
import { isLocalStorageAvailable } from "../utils/authHelpers";
import { isValidPhoneNumber } from "../utils/phoneUtils";
import { useAuthContext } from "../contexts/AuthContext";
import { fetchTTSPrompt } from "../services/voiceCommandService";

function Login() {
  const navigate = useNavigation();
  const { login, loginState } = useAuthContext();
  const [formError, setFormError] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const welcomeAudioRef = useRef(null);

  const showError = formError || (loginState.error && "Username or password incorrect");

  // Pre-fetch welcome audio so it's ready to play the instant login succeeds
  useEffect(() => {
    (async () => {
      const { audio_base64 } = await fetchTTSPrompt("welcome");
      if (audio_base64) {
        welcomeAudioRef.current = new Audio(`data:audio/mp3;base64,${audio_base64}`);
      }
    })();
  }, []);

  const handleLogin = async () => {
    // Check localStorage availability before attempting login
    if (!isLocalStorageAvailable()) {
      setFormError(
        "Local storage is not available. Please enable cookies/local storage in your browser settings or try a different browser."
      );
      showToast.error("Local storage is required for login");
      return;
    }

    if (!phoneNumber || !password) {
      setFormError("All fields are required.");
      return;
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      setFormError("Phone number must be exactly 10 digits.");
      return;
    }

    setFormError(null);
    const data = await login(phoneNumber, password);
    if (!data) {
      showToast.error("Login failed");
      return;
    }
    showToast.success("Login successful!");
    if (welcomeAudioRef.current && !sessionStorage.getItem("seeds_welcomed")) {
      sessionStorage.setItem("seeds_welcomed", "1");
      welcomeAudioRef.current.play().catch(() => {});
    }
    navigate.goToClassroom();
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
              disabled={loginState.isLoading}
            >
              {loginState.isLoading ? <CircularProgress size={24} color="inherit" /> : "Login"}
            </Button>

          </Box>
        </Paper>
      </Box>
    </Container>
  );
}

export default Login;
