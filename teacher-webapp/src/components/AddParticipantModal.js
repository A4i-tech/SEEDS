import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Checkbox,
  FormControlLabel,
  List,
  ListItem,
  Typography,
  CircularProgress,
} from "@mui/material";

export const AddParticipantModal = ({ open, onClose, availableStudents, onSubmit }) => {
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleToggleStudent = (phone_number) => {
    setSelectedStudents((prevSelected) =>
      prevSelected.includes(phone_number)
        ? prevSelected.filter((id) => id !== phone_number)
        : [...prevSelected, phone_number]
    );
  };

  const handleSubmit = async () => {
    if (selectedStudents.length === 0) return;
    setIsSubmitting(true);
    await onSubmit(selectedStudents);
    setSelectedStudents([]);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Select Participants to Add</DialogTitle>
      <DialogContent>
        {availableStudents.length === 0 ? (
          <Typography color="text.secondary">No available students to add.</Typography>
        ) : (
          <List>
            {availableStudents.map((student) => (
              <ListItem key={student.phone_number}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={selectedStudents.includes(student.phone_number)}
                      onChange={() => handleToggleStudent(student.phone_number)}
                    />
                  }
                  label={`${student.name} - ${student.phone_number}`}
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          disabled={selectedStudents.length === 0 || isSubmitting}
          variant="contained"
          sx={{
            bgcolor: "#2e7d32",
            "&:hover": {
              bgcolor: "#1b5e20",
            },
          }}
        >
          {isSubmitting ? <CircularProgress size={20} /> : "Submit"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
