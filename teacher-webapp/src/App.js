import React, { useEffect, useState } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { Box } from "@mui/material";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { ROUTES } from "./constants/routes";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";
import VoiceCommandButton from "./components/VoiceCommandButton";
import theme from "./theme/theme";
import { AuthProvider, useAuthState } from "./context/AuthContext";
import { fetchTTSPrompt } from "./services/voiceCommandService";

import Login from "./pages/Login";
import ClassroomList from "./pages/ClassroomList";
import ClassroomForm from "./pages/ClassroomForm";
import ClassroomDetail from "./pages/ClassroomDetail";
import ContentDetails from "./pages/ContentDetails";

// Inner component — must live inside <BrowserRouter> and <AuthProvider>
// so it can access auth state and router context.
function AppContent() {
  const { isLoggedIn } = useAuthState();
  const [welcomeAudio, setWelcomeAudio] = useState(null);

  // Pre-fetch welcome audio on app load
  useEffect(() => {
    (async () => {
      try {
        const { audioBase64 } = await fetchTTSPrompt("welcome");
        if (audioBase64) {
          setWelcomeAudio(new Audio(`data:audio/mp3;base64,${audioBase64}`));
        }
      } catch (_) { /* ignore — TTS is non-blocking */ }
    })();
  }, []);

  // Clear welcome flag on logout so it plays again on next login
  useEffect(() => {
    if (!isLoggedIn) {
      sessionStorage.removeItem("seeds_welcomed");
    }
  }, [isLoggedIn]);

  // Play welcome audio once per session when logged in
  useEffect(() => {
    if (!isLoggedIn || !welcomeAudio) return;
    if (sessionStorage.getItem("seeds_welcomed")) return;

    sessionStorage.setItem("seeds_welcomed", "1");

    // Slight delay to ensure UI has rendered and user interaction registered
    setTimeout(() => {
      welcomeAudio.currentTime = 0;
      welcomeAudio.play().catch(() => {});
    }, 300);
  }, [isLoggedIn, welcomeAudio]);

  return (
    <>
      <Routes>
        <Route path={ROUTES.LOGIN} element={<PublicRoute element={<Login />} />} />
        <Route
          path={ROUTES.CLASSROOMS}
          element={<ProtectedRoute element={<ClassroomList />} />}
        />
        <Route
          path={ROUTES.CLASSROOM_NEW}
          element={<ProtectedRoute element={<ClassroomForm />} />}
        />
        <Route
          path={ROUTES.CLASSROOM_EDIT(":classroomId")}
          element={<ProtectedRoute element={<ClassroomForm />} />}
        />
        <Route
          path={ROUTES.CLASSROOM_DETAIL(":classroomId")}
          element={<ProtectedRoute element={<ClassroomDetail />} />}
        />
        <Route
          path={ROUTES.CONTENT_DETAILS(":contentId")}
          element={<ProtectedRoute element={<ContentDetails />} />}
        />
      </Routes>

      {/* Seeds AI voice panel + floating trigger */}
      {isLoggedIn && <VoiceCommandButton />}
    </>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
        />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
