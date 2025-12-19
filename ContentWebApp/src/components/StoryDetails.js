import React from "react";
import { useState, useEffect } from "react";
import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import "./StoryDetails.css";

const StoryDetails = ({ type, story }) => {
  const [audioSrc, setAudioSrc] = useState('');
  const [answerAudioSrc, setAnswerAudioSrc] = useState('');

  useEffect(() => {
    const fetchSASUrl = async (url) => {
      // Validate URL before making request
      if (!url || typeof url !== 'string' || url.trim() === '') {
        console.warn('Invalid or empty audio URL:', url);
        return '';
      }
      
      try {
        const response = await fetch(`${SEEDS_URL}/content/sasUrl?url=${encodeURIComponent(url)}`, {
          method: 'GET',
          headers: getAuthHeaders(),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Failed to fetch SAS URL:', response.status, errorData);
          return '';
        }
        
        const data = await response.json();
        return data.url || '';
      } catch (error) {
        console.error('Error fetching SAS URL:', error);
        return '';
      }
    };

    // Follow the same priority as mobile app:
    // 1. audioContent[0].audioUrl (if available)
    // 2. title.audioUrl
    // 3. theme.audioUrl
    const getAudioUrl = () => {
      if (story.audioContent && story.audioContent.length > 0 && story.audioContent[0].audioUrl) {
        return story.audioContent[0].audioUrl;
      }
      if (story.title && typeof story.title === 'object' && story.title.audioUrl) {
        return story.title.audioUrl;
      }
      if (story.theme && typeof story.theme === 'object' && story.theme.audioUrl) {
        return story.theme.audioUrl;
      }
      return null;
    };

    const audioUrl = getAudioUrl();
    
    // Fetch SAS URL for the main audio (blob URLs need SAS tokens for authentication)
    if (audioUrl) {
      fetchSASUrl(audioUrl).then(setAudioSrc);
    }

    // For Riddles, also fetch answer audio
    if (type === 'Riddle') {
      // Try to find answer audio in audioContent array
      const answerAudio = story.audioContent?.find(ac => 
        ac.description?.toLowerCase().includes('answer') || 
        ac.audioUrl?.toLowerCase().includes('answer')
      );
      
      if (answerAudio?.audioUrl) {
        fetchSASUrl(answerAudio.audioUrl).then(setAnswerAudioSrc);
      } else if (story.audioContent && story.audioContent.length > 1) {
        // Use second audioContent entry if available
        fetchSASUrl(story.audioContent[1].audioUrl).then(setAnswerAudioSrc);
      }
    }
  }, [story, type]);

  // Helper to get text from title/theme (handle both object and string formats)
  const getTitleText = () => {
    if (typeof story.title === 'object') {
      return story.title.english || story.title.local || '';
    }
    return story.title || '';
  };

  const getLocalTitle = () => {
    if (typeof story.title === 'object') {
      return story.title.local || '';
    }
    return story.localTitle || '';
  };

  const getThemeText = () => {
    if (typeof story.theme === 'object') {
      return story.theme.english || story.theme.local || '';
    }
    return story.theme || '';
  };

  const getLocalTheme = () => {
    if (typeof story.theme === 'object') {
      return story.theme.local || '';
    }
    return story.localTheme || '';
  };

  return (
    <div className="story-details">
      {/* Header Section */}
      <div className="story-header">
        <div className="story-title-section">
          <span className="story-type-badge">{story.type || 'Content'}</span>
          <h1 className="story-title-main">{getTitleText()}</h1>
          {getLocalTitle() && (
            <p className="story-title-local">{getLocalTitle()}</p>
          )}
        </div>
      </div>

      {/* Content Section */}
      <div className="story-content">
        {/* Metadata Grid */}
        <div className="metadata-grid">
          <div className="metadata-item">
            <p className="metadata-label">Language</p>
            <p className="metadata-value">{story.language || 'N/A'}</p>
          </div>

          <div className="metadata-item">
            <p className="metadata-label">Platforms</p>
            <div className="platform-badges">
              {story.isPullModel && (
                <span className="platform-badge ivr">IVR</span>
              )}
              {story.isTeacherApp && (
                <span className="platform-badge teacher">Teacher App</span>
              )}
              {!story.isPullModel && !story.isTeacherApp && (
                <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: '400' }}>Not specified</span>
              )}
            </div>
          </div>

          <div className="metadata-item">
            <p className="metadata-label">Theme</p>
            <p className="metadata-value">{getThemeText()}</p>
            {getLocalTheme() && (
              <p className="metadata-value-secondary">{getLocalTheme()}</p>
            )}
          </div>
        </div>

        {/* Description */}
        {story.description && (
          <div className="description-section">
            <p className="description-label">Description</p>
            <p className="description-text">{story.description}</p>
          </div>
        )}

        {/* Theme Section */}
        <div className="theme-section">
          <p className="theme-label">Theme</p>
          <p className="theme-text">{getThemeText()}</p>
          {getLocalTheme() && (
            <p className="theme-text-local">{getLocalTheme()}</p>
          )}
        </div>

        {/* Main Audio Player */}
        {audioSrc ? (
          <div className="audio-section">
            <p className="audio-label">Audio Content</p>
            <div className="audio-player-wrapper">
              <audio controls src={audioSrc} />
            </div>
          </div>
        ) : (
          <div className="audio-section">
            <p className="audio-label">Audio Content</p>
            <div className="audio-loading">
              <div className="audio-loading-spinner"></div>
              <span>Loading audio...</span>
            </div>
          </div>
        )}

        {/* Answer Audio (for Riddles) */}
        {type === "Riddle" && (
          answerAudioSrc ? (
            <div className="answer-audio-section">
              <p className="answer-audio-label">Answer Audio</p>
              <div className="audio-player-wrapper">
                <audio controls src={answerAudioSrc} />
              </div>
            </div>
          ) : (
            <div className="answer-audio-section">
              <p className="answer-audio-label">Answer Audio</p>
              <div className="audio-loading">
                <div className="audio-loading-spinner"></div>
                <span>Loading answer audio...</span>
              </div>
            </div>
          )
        )}

        {/* Empty State */}
        {!audioSrc && !answerAudioSrc && type !== "Riddle" && (
          <div className="empty-audio-state">
            <div className="empty-audio-icon">🎵</div>
            <p className="empty-audio-text">Audio is being processed or not available</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StoryDetails;

// For story, etc. => Teacher app ticked
