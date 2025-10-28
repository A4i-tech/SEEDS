import { useNavigate } from 'react-router-dom';
import { ROUTES} from "../constants/routes";

export const useNavigation = () => {
  const navigate = useNavigate();

  return {
    goToLogin: () => navigate(ROUTES.LOGIN),
    goToHome: () => navigate(ROUTES.HOME),
    goToRegister: () => navigate(ROUTES.REGISTER),
  }
}