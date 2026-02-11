import React from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { ROUTES } from "./constants/routes";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";
import theme from "./theme/theme";

import Login from "./pages/Login";
import Register from "./pages/Register";
import ClassroomList from "./pages/ClassroomList";
import ClassroomForm from "./pages/ClassroomForm";
import ClassroomDetail from "./pages/ClassroomDetail";
import ContentPlayback from "./pages/ContentPlayback";
import ContentDetails from "./pages/ContentDetails";

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path={ROUTES.LOGIN} element={<PublicRoute element={<Login />} />} />
          <Route path={ROUTES.REGISTER} element={<PublicRoute element={<Register />} />} />
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
            path={ROUTES.CONTENT_PLAYBACK(":classroomId")}
            element={<ProtectedRoute element={<ContentPlayback />} />}
          />
          <Route
            path={ROUTES.CONTENT}
            element={<ProtectedRoute element={<ContentPlayback />} />}
          />
          <Route
            path={ROUTES.CONTENT_DETAILS(":contentId")}
            element={<ProtectedRoute element={<ContentDetails />} />}
          />
        </Routes>
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

export default App;
