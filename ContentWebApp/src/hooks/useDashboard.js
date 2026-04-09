import { useState, useCallback } from "react";
import { analyticsService } from "../services/analyticsService";

export const useDashboard = () => {
  const [dashboard, setDashboard] = useState(null);
  const [schoolDashboard, setSchoolDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await analyticsService.getDashboard();
      setDashboard(data);
    } catch (err) {
      setError(err.message || "Unable to fetch dashboard data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchSchoolDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await analyticsService.getSchoolDashboard();
      setSchoolDashboard(data);
    } catch (err) {
      setError(err.message || "Unable to fetch school dashboard data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { dashboard, schoolDashboard, isLoading, error, fetchDashboard, fetchSchoolDashboard };
};
