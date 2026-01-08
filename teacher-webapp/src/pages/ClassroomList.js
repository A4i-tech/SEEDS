import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Grid,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  People as PeopleIcon,
  School as SchoolIcon,
  Logout as LogoutIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { getAllClassrooms, deleteClassroom } from "../services/classroomService";
import { useAuth } from "../hooks/useAuth";
import { showToast } from "../utils/toast";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { PageContainer } from "../components/layout/PageContainer";
import { ROUTES } from "../constants/routes";
const ClassroomList = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [classroomToDelete, setClassroomToDelete] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetchClassrooms();
  }, []);

  const fetchClassrooms = async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      const data = await getAllClassrooms();
      setClassrooms(data);
    } catch (err) {
      setErrorMsg("Failed to load classrooms. Please try again.");
      showToast.error("Failed to load classrooms");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    navigate(ROUTES.CLASSROOM_NEW);
  };

  const handleEdit = (classroomId) => {
    navigate(ROUTES.CLASSROOM_EDIT(classroomId));
  };

  const handleView = (classroomId) => {
    navigate(ROUTES.CLASSROOM_DETAIL(classroomId));
  };

  const handleDeleteClick = (classroom) => {
    setClassroomToDelete(classroom);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteClassroom(classroomToDelete._id);
      showToast.success("Classroom deleted successfully");
      setDeleteDialogOpen(false);
      setClassroomToDelete(null);
      fetchClassrooms();
    } catch (err) {
      showToast.error("Failed to delete classroom");
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setClassroomToDelete(null);
  };

  const handleLogout = () => {
    logout();
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <PageContainer>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          My Classrooms
        </Typography>
        <Box sx={{ display: "flex", gap: 2 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleCreateNew}
          >
            Create Classroom
          </Button>
          <IconButton
            onClick={handleLogout}
            sx={{
              color: "error.main",
              "&:hover": {
                backgroundColor: "error.light",
                color: "white",
              },
            }}
          >
            <LogoutIcon />
          </IconButton>
        </Box>
      </Box>

      {errorMsg && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {errorMsg}
        </Alert>
      )}

      {classrooms.length === 0 ? (
        <Card sx={{ textAlign: "center", py: 6 }}>
          <CardContent>
            <SchoolIcon sx={{ fontSize: 64, color: "text.secondary", mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No Classrooms Yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Create your first classroom to get started
            </Typography>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={handleCreateNew}
            >
              Create Classroom
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {classrooms.map((classroom) => (
            <Grid item xs={12} sm={6} md={4} key={classroom._id}>
              <Card
                sx={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  "&:hover": {
                    transform: "translateY(-4px)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  },
                }}
              >
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography
                    variant="h6"
                    component="h2"
                    gutterBottom
                    sx={{ fontWeight: 600 }}
                  >
                    {classroom.name}
                  </Typography>
                  <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <PeopleIcon sx={{ fontSize: 20, color: "text.secondary" }} />
                      <Typography variant="body2" color="text.secondary">
                        {classroom.students?.length || 0} Students
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <SchoolIcon sx={{ fontSize: 20, color: "text.secondary" }} />
                      <Typography variant="body2" color="text.secondary">
                        {classroom.leaders?.length || 0} Leaders
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
                <CardActions sx={{ justifyContent: "space-between", px: 2, pb: 2 }}>
                  <Button
                    size="small"
                    onClick={() => handleView(classroom._id)}
                  >
                    View
                  </Button>
                  <Box>
                    <IconButton
                      size="small"
                      onClick={() => handleEdit(classroom._id)}
                      sx={{ color: "primary.main" }}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteClick(classroom)}
                      sx={{ color: "error.main" }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
        <DialogTitle>Delete Classroom</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{classroomToDelete?.name}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};

export default ClassroomList;
