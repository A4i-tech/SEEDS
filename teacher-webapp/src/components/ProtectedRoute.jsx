import { Navigate } from "react-router-dom";
import { isAuthenticated } from "../utils/authHelpers";

/**
 * ProtectedRoute component that prevents unauthenticated users from accessing protected routes.
 * If user is not authenticated, redirects to login page.
 * @param {Object} props - Route component props
 * @param {JSX.Element} props.element - The component to render if authenticated
 * @returns {JSX.Element} The protected component or redirect to login
 */
const ProtectedRoute = ({ element }) => {
  return isAuthenticated() ? element : <Navigate to="/" replace />;
};

export default ProtectedRoute;
