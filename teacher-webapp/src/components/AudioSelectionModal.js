import React, { useEffect, useMemo, useState } from "react";
import { fetchAudioContent } from "../services/apiService";
import { formatSeconds } from "../utils/formatSeconds";

const getTrackId = (track) => track.id;

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
        const page = await fetchAudioContent();

        if (isActive) {
          setTracks(page.items);
          setSelectedTrackId(page.items[0] ? getTrackId(page.items[0]) : null);
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
                    <span className="track-name">{track.display_title}</span>
                    {track.duration_seconds != null && (
                      <span className="track-duration">{formatSeconds(track.duration_seconds)}</span>
                    )}
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
