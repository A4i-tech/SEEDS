import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  Typography,
  CircularProgress,
  Alert,
  Box,
} from "@mui/material";
import { fetchAudioContent } from "../services/apiService";

const extractItems = (response) => {
  if (!response) {
    return [];
  }

  if (Array.isArray(response)) {
    return response;
  }

  const candidateArrays = ["data", "content", "items", "results"];

  for (const key of candidateArrays) {
    const collection = response?.[key];
    if (Array.isArray(collection)) {
      return collection;
    }
  }

  return [];
};

const buildContentList = (response) => {
  const rawItems = extractItems(response).filter((item) => item && item.isDeleted !== true);

  const contentList = [];

  rawItems.forEach((item) => {
    const itemId = item?._id;
    const baseName = item?.title?.english || item?.title?.local || item?.title || "Unnamed Audio";

    if (item?.audioContent && Array.isArray(item.audioContent)) {
      item.audioContent.forEach((audio, index) => {
        if (!audio?.audioUrl) {
          return;
        }

        contentList.push({
          id: `${itemId || "nested"}-${index}`,
          name: audio?.title || `${baseName} #${index + 1}`,
          url: audio.audioUrl,
          description: audio?.description || item?.description,
          type: audio?.type || item?.type,
          language: audio?.language || item?.language,
        });
      });
    }

    if (item?.audioUrl) {
      contentList.push({
        id: `${itemId || "main"}-main`,
        name: `${baseName} (Main)`,
        url: item.audioUrl,
        description: item?.description,
        type: item?.type,
        language: item?.language,
      });
    }
  });

  return contentList;
};

export const AudioContentModal = ({ open, onClose, onSubmit }) => {
  const [audioContent, setAudioContent] = useState([]);
  const [selectedContent, setSelectedContent] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let isMounted = true;

    const loadAudioContent = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetchAudioContent();
        const contentList = buildContentList(response);

        if (!isMounted) {
          return;
        }

        setAudioContent(contentList);
        setSelectedContent(contentList[0]?.url ?? null);
      } catch (err) {
        console.error("Error fetching audio content:", err);
        if (isMounted) {
          setError("Failed to load audio content. Please try again.");
          setAudioContent([]);
          setSelectedContent(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadAudioContent();

    return () => {
      isMounted = false;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const handleSubmit = () => {
    if (!selectedContent) {
      return;
    }

    // Find the content object that matches the selected URL
    const content = audioContent.find((c) => c.url === selectedContent);
    if (content) {
      onSubmit(content);
    } else {
      // Fallback: pass URL string for backward compatibility
      onSubmit(selectedContent);
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Select Audio Content</DialogTitle>
      <DialogContent>
        {isLoading && (
          <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
            <CircularProgress />
          </Box>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {!isLoading && !error && audioContent.length === 0 && (
          <Typography color="text.secondary">No audio content available.</Typography>
        )}

        {!isLoading && !error && audioContent.length > 0 && (
          <FormControl component="fieldset" fullWidth>
            <RadioGroup
              value={selectedContent || ""}
              onChange={(e) => setSelectedContent(e.target.value)}
            >
              {audioContent.map((content) => (
                <FormControlLabel
                  key={content.id}
                  value={content.url}
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body1" fontWeight={500}>
                        {content.name}
                      </Typography>
                      {content.language && (
                        <Typography variant="caption" color="text.secondary">
                          {content.language}
                        </Typography>
                      )}
                      {content.description && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {content.description}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              ))}
            </RadioGroup>
          </FormControl>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          disabled={!selectedContent || isLoading || !!error}
          variant="contained"
          sx={{
            bgcolor: "#2e7d32",
            "&:hover": {
              bgcolor: "#1b5e20",
            },
          }}
        >
          Play Selected
        </Button>
      </DialogActions>
    </Dialog>
  );
};
