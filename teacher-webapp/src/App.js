import React, { useEffect, useState } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { ROUTES } from "./constants/routes";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";
import VoiceCommandButton from "./components/VoiceCommandButton";
import theme from "./theme/theme";
import { AuthProvider, useAuthContext } from "./contexts/AuthContext";
import { fetchTTSPrompt } from "./services/voiceCommandService";

import Login from "./pages/Login";
import ClassroomList from "./pages/ClassroomList";
import ClassroomForm from "./pages/ClassroomForm";
import ClassroomDetail from "./pages/ClassroomDetail";
import ContentDetails from "./pages/ContentDetails";

function AppRoutes() {
  const { initializing, isAuthenticated } = useAuthContext();
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
    if (!isAuthenticated) {
      sessionStorage.removeItem("seeds_welcomed");
    }
  }, [isAuthenticated]);

  // Play welcome audio once per session when logged in
  useEffect(() => {
    if (!isAuthenticated || !welcomeAudio) return;
    if (sessionStorage.getItem("seeds_welcomed")) return;

    sessionStorage.setItem("seeds_welcomed", "1");

    // Slight delay to ensure UI has rendered and user interaction registered
    setTimeout(() => {
      welcomeAudio.currentTime = 0;
      welcomeAudio.play().catch(() => {});
    }, 300);
  }, [isAuthenticated, welcomeAudio]);

  if (initializing) {
    return null;
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
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
        {isAuthenticated && <VoiceCommandButton />}
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
    </ThemeProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
</content>
</invoke>
<invoke name="Read">
<parameter name="file_path">C:/zz-misc/SEEDS/teacher-webapp/src/hooks/useAuth.js