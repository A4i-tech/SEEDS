import React from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ROUTES } from "./constants/routes";

import Homepage from "./pages/Homepage";
import Login from "./pages/Login";
import Register from "./pages/Register";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={ROUTES.LOGIN} element={<Login />} />
        <Route path={ROUTES.HOME} element={<Homepage />} />
        <Route path={ROUTES.REGISTER} element={<Register />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
