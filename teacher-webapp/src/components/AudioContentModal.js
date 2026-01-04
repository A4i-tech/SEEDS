import React, { useEffect, useState } from "react";
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

    onSubmit(selectedContent);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Select Audio Content</h2>
        {isLoading && <p>Loading audio content...</p>}
        {error && <p className="error-text">{error}</p>}
        {!isLoading && !error && audioContent.length === 0 && <p>No audio content available.</p>}

        {!isLoading && !error && audioContent.length > 0 && (
          <ul className="track-list">
            {audioContent.map((content) => (
              <li key={content.id} className="track-list-item">
                <label>
                  <input
                    type="radio"
                    name="audio-content"
                    value={content.url}
                    checked={selectedContent === content.url}
                    onChange={() => setSelectedContent(content.url)}
                  />
                  <span className="track-name">{content.name}</span>
                  {content.language && <span className="track-language">{content.language}</span>}
                </label>
                {content.description && <p className="track-description">{content.description}</p>}
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button onClick={handleSubmit} disabled={!selectedContent || isLoading || !!error}>
            Play Selected
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};
