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
import { getSchoolStudents } from "../services/teacherService";
import { showToast } from "../utils/toast";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { PageContainer } from "../components/layout/PageContainer";

const ClassroomForm = () => {
  const navigate = useNavigate();
  const { classroomId } = useParams();
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

  const fetchStudents = useCallback(async () => {
    try {
      setIsLoadingStudents(true);
      const data = await getSchoolStudents();
      setTeacherStudentsList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching students:", err);
      showToast.error("Failed to fetch student list");
    } finally {
      setIsLoadingStudents(false);
    }
  }, []);

  const fetchClassroom = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      const data = await getClassroomById(classroomId);
      setFormData({
        id: data.id,
        name: data.name,
        students: data.students,
        leaders: data.leaders,
        contentIds: data.contentIds,
      });
    } catch (err) {
      setErrorMsg("Failed to load classroom. Please try again.");
      showToast.error("Failed to load classroom");
    } finally {
      setLoading(false);
    }
  }, [classroomId]);

  useEffect(() => {
    fetchStudents();
    if (isEditMode) {
      fetchClassroom();
    }
  }, [classroomId, isEditMode, fetchStudents, fetchClassroom]);

  const validateForm = () => {
    const errors = {};

    if (!formData.name.trim()) {
      errors.name = "Class name is required";
    }

    const studentSet = new Set(formData.students.map((s) => s.id));
    if (studentSet.size !== formData.students.length) {
      errors.students = "Duplicate students are not allowed";
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

    if (formData.students.some((s) => s.id === value.id)) {
      showToast.error("Student already added to classroom");
      return;
    }

    setFormData({
      ...formData,
      students: [...formData.students, value],
    });
    if (validationErrors.students) {
      setValidationErrors({ ...validationErrors, students: "" });
    }
  };

  const handleRemoveStudent = (studentId) => {
    setFormData({
      ...formData,
      students: formData.students.filter((s) => s.id !== studentId),
    });
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

  if (loading || isLoadingStudents) {
    return <LoadingSpinner />;
  }

  return (
    <PageContainer>
      <Box sx={{ mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mb: 2 }}>
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
                  (s) => !formData.students.some((fs) => fs.id === s.id)
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
                isOptionEqualToValue={(option, value) => option.phoneNumber === value?.phoneNumber}
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
                {formData.students.map((student, index) => (
                  <React.Fragment key={student.id}>
                    {index > 0 && <Divider />}
                    <ListItem
                      secondaryAction={
                        <IconButton
                          edge="end"
                          onClick={() => handleRemoveStudent(student.id)}
                          sx={{ color: "error.main" }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      }
                    >
                      <ListItemText
                        primary={student.name}
                        secondary={student.phoneNumber}
                        primaryTypographyProps={{ fontWeight: 500 }}
                      />
                    </ListItem>
                  </React.Fragment>
                ))}
              </List>
            )}
          </CardContent>
        </Card>

        <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
          <Button variant="outlined" onClick={handleBack}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" color="primary" disabled={saving}>
            {saving ? "Saving..." : isEditMode ? "Update Classroom" : "Create Classroom"}
          </Button>
        </Box>
      </form>
    </PageContainer>
  );
};

export default ClassroomForm;
