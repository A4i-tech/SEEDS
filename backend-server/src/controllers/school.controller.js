const validator = require("validator");
const { STATUS, PASSWORD_POLICY } = require("../config/constants");

const schoolService = require("../services/school.service");

exports.createSchool = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({ message: "Name, email, and password are required" });
    }

    const tenantId = req.tenantId;
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!validator.isEmail(trimmedEmail)) {
      return res
        .status(STATUS.BAD_REQUEST)
        .json({ message: "Must be a valid email" });
    }

    if (!validator.isStrongPassword(password, PASSWORD_POLICY)) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: "Password must be at least 8 characters, and include uppercase, lowercase, number, and special character",
      });
    }

    const school = await schoolService.createSchool(trimmedName, trimmedEmail, tenantId, password);
    return res.status(STATUS.CREATED).json(school);
  } catch (error) {
    if (error.status === STATUS.BAD_REQUEST) {
      return res.status(STATUS.BAD_REQUEST).json({ message: error.message });
    }
    return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
  }
};

exports.getSchools = async (req, res) => {
    try {
        const tenantId = req.tenantId;
        console.log("tenantId", tenantId);
        const schools = await schoolService.getSchools(tenantId);
        return res.status(STATUS.OK).json(schools);
    } catch (error) {
        return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
};

exports.getSchoolById = async (req, res) => {
    try {
        const schoolId = req.params.schoolId;
        const tenantId = req.tenantId;

        if (!schoolId || !tenantId) {
            return res.status(STATUS.BAD_REQUEST).json({ message: "School ID and tenant ID are required" });
        }

        const school = await schoolService.getSchoolById(schoolId, tenantId);
        return res.status(STATUS.OK).json(school);
    } catch (error) {
        if (error.status === STATUS.NOT_FOUND) {
            return res.status(STATUS.NOT_FOUND).json({ message: error.message });
        }
        return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
};


exports.deleteSchool = async (req, res) => {
    try {
        const schoolId = req.params.schoolId;
        const tenantId = req.tenantId;
        const result = await schoolService.deleteSchool(schoolId, tenantId);
        return res.status(STATUS.OK).json(result);
    } catch (error) {
        if (error.status === STATUS.NOT_FOUND) {
            return res.status(STATUS.NOT_FOUND).json({ message: error.message });
        }
        if (error.status === STATUS.BAD_REQUEST) {
            return res.status(STATUS.BAD_REQUEST).json({ message: error.message });
        }
        return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
};

exports.getSchoolAnalytics = async (req, res) => {
    const { startDate, endDate } = req.body;
    const schoolId = req.schoolId;

    if (!startDate || !endDate) {
        return res.status(STATUS.BAD_REQUEST).json({ message: "Both startDate and endDate are required" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(STATUS.BAD_REQUEST).json({ message: "Invalid date format" });
    }

    try {
        const data = await schoolService.getSchoolAnalytics(schoolId, start, end);
        return res.status(STATUS.OK).json({ startDate, endDate, count: data.length, data });
    } catch (error) {
        console.error("School analytics error:", error);
        return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
};

exports.getSchoolDashboard = async (req, res) => {
    try {
        const schoolId = req.schoolId;
        const tenantId = req.tenantId;

        const result = await schoolService.getSchoolDashboard(schoolId, tenantId);
        return res.status(STATUS.OK).json(result);
    } catch (error) {
        return res.status(STATUS.INTERNAL_ERROR).json({ message: "Internal server error" });
    }
};
