import { useNavigate } from 'react-router-dom';
import { ROUTES} from "../constants/routes";

export const useNavigation = () => {
  const navigate = useNavigate();

  return {
    goToLogin: () => navigate(ROUTES.LOGIN),
    // accept optional state (e.g., { phoneNumber }) to pass to the target route
    goToHome: (phoneNumber) => navigate(ROUTES.HOME, { state: phoneNumber ? { phoneNumber } : undefined }),
    goToRegister: () => navigate(ROUTES.REGISTER),
  }
}