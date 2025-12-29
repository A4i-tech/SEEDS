import AllContent from "./components/AllContent";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import ContentDetails from "./components/ContentDetails";
import ContentEdit from "./components/ContentEdit";
import AddContent from "./components/AddContent";
import BulkCallInitiator from "./components/BulkCallInitiator";
import IVR from "./components/IVR";
import ViewIVR from "./components/ViewIVR";
import Profile from "./components/Profile";
import "./App.css";
import Login from "./components/Login";
import ApiDocumentation from "./components/ApiDocumentation";
import Register from "./components/Register";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PublicRoute element={<Login />} />}></Route>
          <Route
            path="/content"
            element={<ProtectedRoute element={<AllContent />} />}
          />
          <Route
            path="/content/create"
            element={<ProtectedRoute element={<AddContent />} />}
          />
          <Route
            path="/content/detail/:type/:id"
            element={<ProtectedRoute element={<ContentDetails />} />}
          />
          <Route
            path="/content/edit/:type/:id"
            element={<ProtectedRoute element={<ContentEdit />} />}
          />
          <Route path="/ivr" element={<ProtectedRoute element={<IVR />} />} />
          <Route
            path="/viewivr"
            element={<ProtectedRoute element={<ViewIVR />} />}
          />
          <Route
            path="/bulkcall"
            element={<ProtectedRoute element={<BulkCallInitiator />} />}
          />
          <Route path="/api-docs" element={<ApiDocumentation />} />
          <Route
            path="/register"
            element={<PublicRoute element={<Register />} />}
          />
          <Route
            path="/profile"
            element={<ProtectedRoute element={<Profile />} />}
          />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
