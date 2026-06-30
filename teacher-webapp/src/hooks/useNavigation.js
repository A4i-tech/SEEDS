import { useNavigate } from "react-router-dom";
import { ROUTES } from "../constants/routes";

export const useNavigation = () => {
  const navigate = useNavigate();

  return {
    goToLogin: () => navigate(ROUTES.LOGIN),
    // Redirect to classrooms instead of home
    goToClassroom: (phoneNumber) =>
      navigate(ROUTES.CLASSROOMS, { state: phoneNumber ? { phoneNumber } : undefined }),
  };
};
