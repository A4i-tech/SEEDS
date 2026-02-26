import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Checkbox,
  Alert,
  Divider,
  Paper,
  InputAdornment,
  Autocomplete,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Delete as DeleteIcon,
  Person as PersonIcon,
  School as SchoolIcon,
} from "@mui/icons-material";
import { useNavigate, useParams } from "react-router-dom";
import {
  getClassroomById,
  createClassroom,
  updateClassroom,
} from "../services/classroomService";
import { getTeacherStudents } from "../services/teacherService";
import { useAuth } from "../hooks/useAuth";
import { showToast } from "../utils/toast";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { PageContainer } from "../components/layout/PageContainer";

const ClassroomForm = () => {
  const navigate = useNavigate();
  const { classroomId } = useParams();
  const { getCurrentTeacher } = useAuth();
  const isEditMode = !!classroomId;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    students: [],
    leaders: [],
    contentIds: [],
  });
  const [teacherStudentsList, setTeacherStudentsList] = useState([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  const fetchTeacherStudents = useCallback(async () => {
    try {
      setIsLoadingStudents(true);

      const teacher = await getCurrentTeacher();
      const teacherPhone = teacher.phoneNumber;

      if (!teacherPhone) {
        console.warn("No teacher phone found");
        showToast.error("Unable to fetch teacher information");
        return;
      }

      const data = await getTeacherStudents(teacherPhone);
      setTeacherStudentsList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching teacher students:", err);
      showToast.error("Failed to fetch your student list");
    } finally {
      setIsLoadingStudents(false);
    }
  }, [getCurrentTeacher]);

  const fetchClassroom = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      const data = await getClassroomById(classroomId);
      setFormData({
        _id: data._id,
        name: data.name || "",
        students: data.students || [],
        leaders: data.leaders || [],
        contentIds: data.contentIds || [],
      });
    } catch (err) {
      setErrorMsg("Failed to load classroom. Please try again.");
      showToast.error("Failed to load classroom");
    } finally {
      setLoading(false);
    }
  }, [classroomId]);

  useEffect(() => {
    fetchTeacherStudents();
    if (isEditMode) {
      fetchClassroom();
    }
  }, [isEditMode, fetchClassroom, fetchTeacherStudents]);

  const validateForm = () => {
    const errors = {};

    if (!formData.name.trim()) {
      errors.name = "Class name is required";
    }

    const studentSet = new Set(formData.students);
    if (studentSet.size !== formData.students.length) {
      errors.students = "Duplicate students are not allowed";
    }

    const invalidLeaders = formData.leaders.filter((leader) => !formData.students.includes(leader));
    if (invalidLeaders.length > 0) {
      errors.leaders = "All leaders must be selected from students";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNameChange = (e) => {
    setFormData({ ...formData, name: e.target.value });
    if (validationErrors.name) {
      setValidationErrors({ ...validationErrors, name: "" });
    }
  };

  const handleAddStudent = (event, value) => {
    if (!value) return;

    const studentPhone = value.phoneNumber;

    if (formData.students.includes(studentPhone)) {
      showToast.error("Student already added to classroom");
      return;
    }

    setFormData({
      ...formData,
      students: [...formData.students, studentPhone],
    });
    if (validationErrors.students) {
      setValidationErrors({ ...validationErrors, students: "" });
    }
  };

  const handleRemoveStudent = (studentPhone) => {
    setFormData({
      ...formData,
      students: formData.students.filter((s) => s !== studentPhone),
      leaders: formData.leaders.filter((l) => l !== studentPhone),
    });
  };

  const handleToggleLeader = (studentPhone) => {
    const isLeader = formData.leaders.includes(studentPhone);
    if (isLeader) {
      setFormData({
        ...formData,
        leaders: formData.leaders.filter((l) => l !== studentPhone),
      });
    } else {
      setFormData({
        ...formData,
        leaders: [...formData.leaders, studentPhone],
      });
    }
    if (validationErrors.leaders) {
      setValidationErrors({ ...validationErrors, leaders: "" });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      showToast.error("Please fix validation errors");
      return;
    }

    try {
      setSaving(true);
      setErrorMsg("");

      if (isEditMode) {
        await updateClassroom(formData);
        showToast.success("Classroom updated successfully");
      } else {
        await createClassroom(formData);
        showToast.success("Classroom created successfully");
      }

      navigate("/classrooms");
    } catch (err) {
      setErrorMsg(err.message || "Failed to save classroom");
      showToast.error(err.message || "Failed to save classroom");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    navigate("/classrooms");
  };

  const getStudentByPhone = useCallback((phoneNumber) => {
    return teacherStudentsList.find((s) => s.phoneNumber === phoneNumber);
  }, [teacherStudentsList]);

  if (loading || isLoadingStudents) {
    return <LoadingSpinner />;
  }

  return (
    <PageContainer>
      <Box sx={{ mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={handleBack}
          sx={{ mb: 2 }}
        >
          Back to Classrooms
        </Button>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          {isEditMode ? "Edit Classroom" : "Create New Classroom"}
        </Typography>
      </Box>

      {errorMsg && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {errorMsg}
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Classroom Details
            </Typography>
            <TextField
              fullWidth
              label="Classroom Name"
              value={formData.name}
              onChange={handleNameChange}
              error={!!validationErrors.name}
              helperText={validationErrors.name}
              required
              sx={{ mt: 2 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SchoolIcon />
                  </InputAdornment>
                ),
              }}
            />
          </CardContent>
        </Card>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Students
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Add students from your student list to this classroom
            </Typography>

            {validationErrors.students && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {validationErrors.students}
              </Alert>
            )}

            <Box sx={{ mb: 3 }}>
              <Autocomplete
                options={teacherStudentsList.filter(
                  (s) => !formData.students.includes(s.phoneNumber)
                )}
                getOptionLabel={(option) => `${option.name} - ${option.phoneNumber}`}
                onChange={handleAddStudent}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Search and Add Student"
                    placeholder="Type student name or phone number..."
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <>
                          <InputAdornment position="start">
                            <PersonIcon />
                          </InputAdornment>
                          {params.InputProps.startAdornment}
                        </>
                      ),
                    }}
                  />
                )}
                value={null}
                isOptionEqualToValue={(option, value) =>
                  option.phoneNumber === value?.phoneNumber
                }
              />
            </Box>

            {formData.students.length === 0 ? (
              <Paper
                variant="outlined"
                sx={{
                  p: 3,
                  textAlign: "center",
                  bgcolor: "background.default",
                }}
              >
                <PersonIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  No students added yet
                </Typography>
              </Paper>
            ) : (
              <List sx={{ bgcolor: "background.paper", borderRadius: 1 }}>
                {formData.students.map((phoneNumber, index) => {
                  const student = getStudentByPhone(phoneNumber);
                  return (
                    <React.Fragment key={phoneNumber}>
                      {index > 0 && <Divider />}
                      <ListItem
                        secondaryAction={
                          <IconButton
                            edge="end"
                            onClick={() => handleRemoveStudent(phoneNumber)}
                            sx={{ color: "error.main" }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        }
                      >
                        <ListItemText
                          primary={student ? student.name : phoneNumber}
                          secondary={phoneNumber}
                          primaryTypographyProps={{ fontWeight: 500 }}
                        />
                      </ListItem>
                    </React.Fragment>
                  );
                })}
              </List>
            )}
          </CardContent>
        </Card>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Leaders
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Select students to assign as classroom leaders
            </Typography>

            {validationErrors.leaders && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {validationErrors.leaders}
              </Alert>
            )}

            {formData.students.length === 0 ? (
              <Paper
                variant="outlined"
                sx={{
                  p: 3,
                  textAlign: "center",
                  bgcolor: "background.default",
                }}
              >
                <SchoolIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  Add students first to assign leaders
                </Typography>
              </Paper>
            ) : (
              <List sx={{ bgcolor: "background.paper", borderRadius: 1 }}>
                {formData.students.map((phoneNumber, index) => {
                  const isLeader = formData.leaders.includes(phoneNumber);
                  const student = getStudentByPhone(phoneNumber);
                  return (
                    <React.Fragment key={phoneNumber}>
                      {index > 0 && <Divider />}
                      <ListItem>
                        <Checkbox
                          checked={isLeader}
                          onChange={() => handleToggleLeader(phoneNumber)}
                          sx={{ mr: 1 }}
                        />
                        <ListItemText
                          primary={student ? student.name : phoneNumber}
                          secondary={isLeader ? `Leader - ${phoneNumber}` : phoneNumber}
                          primaryTypographyProps={{
                            fontWeight: isLeader ? 600 : 400,
                          }}
                        />
                      </ListItem>
                    </React.Fragment>
                  );
                })}
              </List>
            )}
          </CardContent>
        </Card>

        <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
          <Button variant="outlined" onClick={handleBack}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={saving}
          >
            {saving ? "Saving..." : isEditMode ? "Update Classroom" : "Create Classroom"}
          </Button>
        </Box>
      </form>
    </PageContainer>
  );
};

export default ClassroomForm;
