import React, { useEffect, useState } from "react";
import DateRangeSelector from "./DateRangeSelector";
import { schoolService } from "../../../services/schoolService";
import { teacherService } from "../../../services/teacherService";
import { getRole, getAuthHeaders } from "../../../utils/authHelpers";

/**
 * Date range plus school/teacher filters for the analytics sections.
 * School select: tenant only. Teacher select: school_admin only
 * (tenants have no teacher-list endpoint).
 */
const AnalyticsFilters = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  schoolId,
  onSchoolIdChange,
  teacherId,
  onTeacherIdChange,
  onFetch,
  isLoading,
  onClose,
}) => {
  const role = getRole();
  const isTenant = role === "tenant";
  const isSchoolAdmin = role === "school_admin";

  const [schools, setSchools] = useState([]);
  const [teachers, setTeachers] = useState([]);

  useEffect(() => {
    let active = true;
    if (isTenant) {
      schoolService
        .getSchools()
        .then((response) => active && setSchools(response.data || response || []))
        .catch((err) => console.error("Unable to load schools:", err));
    }
    if (isSchoolAdmin) {
      teacherService
        .getTeachers(getAuthHeaders())
        .then((response) => active && setTeachers(response || []))
        .catch((err) => console.error("Unable to load teachers:", err));
    }
    return () => {
      active = false;
    };
  }, [isTenant, isSchoolAdmin]);

  return (
    <div>
      {(isTenant || isSchoolAdmin) && (
        <div className="analytics-filter-selects">
          {isTenant && (
            <label className="analytics-filter-label">
              School
              <select
                className="analytics-filter-select"
                value={schoolId || ""}
                onChange={(e) => onSchoolIdChange(e.target.value || null)}
              >
                <option value="">All schools</option>
                {schools.map((school) => (
                  <option key={school._id} value={school._id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {isSchoolAdmin && (
            <label className="analytics-filter-label">
              Teacher
              <select
                className="analytics-filter-select"
                value={teacherId || ""}
                onChange={(e) => onTeacherIdChange(e.target.value || null)}
              >
                <option value="">All teachers</option>
                {teachers.map((teacher) => (
                  <option key={teacher._id} value={teacher._id}>
                    {teacher.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      <DateRangeSelector
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        onFetch={onFetch}
        isLoading={isLoading}
        onClose={onClose}
      />
    </div>
  );
};

export default AnalyticsFilters;
