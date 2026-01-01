import React, { useEffect, useMemo, useState } from "react";
import { fetchAudioContent } from "../services/apiService";

const getTrackId = (track) =>
  track?.id ?? track?._id ?? track?.audioId ?? track?.url ?? track?.name;

export const AudioSelectionModal = ({ open, onClose, onConfirm }) => {
  const [tracks, setTracks] = useState([]);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let isActive = true;
    const loadContent = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetchAudioContent();
        const content = Array.isArray(response) ? response : (response?.content ?? []);

        if (isActive) {
          setTracks(content);
          setSelectedTrackId(getTrackId(content[0]) ?? null);
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Unable to load audio content");
          setTracks([]);
          setSelectedTrackId(null);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadContent();

    return () => {
      isActive = false;
    };
  }, [open]);

  const selectedTrack = useMemo(
    () => tracks.find((track) => getTrackId(track) === selectedTrackId) || null,
    [tracks, selectedTrackId]
  );

  if (!open) {
    return null;
  }

  const handleConfirm = () => {
    if (!selectedTrack) {
      return;
    }

    onConfirm(selectedTrack);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Select Audio</h2>
        {isLoading && <p>Loading tracks...</p>}
        {error && <p className="error-text">{error}</p>}
        {!isLoading && !error && tracks.length === 0 && <p>No audio tracks available.</p>}

        {!isLoading && !error && tracks.length > 0 && (
          <ul className="track-list">
            {tracks.map((track) => {
              const trackId = getTrackId(track);
              return (
                <li key={trackId} className="track-list-item">
                  <label>
                    <input
                      type="radio"
                      name="audio-track"
                      value={trackId}
                      checked={selectedTrackId === trackId}
                      onChange={() => setSelectedTrackId(trackId)}
                    />
                    <span className="track-name">{track?.name || track?.title || "Untitled"}</span>
                    {track?.duration && <span className="track-duration">{track.duration}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="modal-actions">
          <button onClick={handleConfirm} disabled={!selectedTrack || isLoading || !!error}>
            Play Selected
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};
