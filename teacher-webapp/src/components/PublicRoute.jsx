import { Navigate } from "react-router-dom";
import { isAuthenticated } from "../utils/authHelpers";
import { ROUTES } from "../constants/routes";

/**
 * PublicRoute component that prevents authenticated users from accessing public routes (login/register).
 * If user is already authenticated, redirects to home page.
 * @param {Object} props - Route component props
 * @param {JSX.Element} props.element - The component to render if not authenticated
 * @returns {JSX.Element} The public component or redirect to home
 */
const PublicRoute = ({ element }) => {
  return isAuthenticated() ? <Navigate to={ROUTES.HOME} replace /> : element;
};

export default PublicRoute;
