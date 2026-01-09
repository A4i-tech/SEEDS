import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";

const AllContent = lazy(() => import("./components/AllContent"));
const ContentDetails = lazy(() => import("./components/ContentDetails"));
const ContentEdit = lazy(() => import("./components/ContentEdit"));
const AddContent = lazy(() => import("./components/AddContent"));
const BulkCallInitiator = lazy(() => import("./components/BulkCallInitiator"));
const IVR = lazy(() => import("./components/IVR"));
const ViewIVR = lazy(() => import("./components/ViewIVR"));
const Profile = lazy(() => import("./components/Profile"));
const Login = lazy(() => import("./components/Login"));
const Register = lazy(() => import("./components/Register"));

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Suspense fallback={<div>Loading...</div>}>
          <Routes>
            <Route
              path="/"
              element={<PublicRoute element={<Login />} />}
            ></Route>
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
            <Route
              path="/register"
              element={<PublicRoute element={<Register />} />}
            />
            <Route
              path="/profile"
              element={<ProtectedRoute element={<Profile />} />}
            />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </div>
  );
}

export default App;
