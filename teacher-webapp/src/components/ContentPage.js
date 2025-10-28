import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getContentSas, fetchContentById, fetchContentList } from '../services/apiService';

// A reusable Audio Player Component
const AudioPlayer = ({ src, style }) => {
  if (!src) return null;
  return (
    <div style={style}>
      <audio controls src={src} style={{ width: '100%' }}>
        Your browser does not support the audio element.
      </audio>
    </div>
  );
};

export const ContentPage = () => {
  const { contentId } = useParams();
  const navigate = useNavigate();

  // State Management
  const [currentContent, setCurrentContent] = useState(null);
  const [mainAudioUrl, setMainAudioUrl] = useState(null);
  const [answerAudioUrl, setAnswerAudioUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [contentList, setContentList] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Effect to fetch initial content and the full list for navigation
  useEffect(() => {
    const loadContent = async () => {
      try {
        setIsLoading(true);
        // The API calls now correctly match the backend
        const [contentData, allContents] = await Promise.all([
            fetchContentById(contentId),
            fetchContentList() // This now returns the data array directly
        ]);
        
        setCurrentContent(contentData);
        setContentList(allContents); // The list is ready to be used

        const idx = allContents.findIndex(item => item.id === contentData.id);
        setCurrentIndex(idx > -1 ? idx : 0);
      } catch (error) {
        console.error("Failed to load content:", error);
        setCurrentContent(null);
      } finally {
        setIsLoading(false);
      }
    };
    loadContent();
  }, [contentId]);

  // Effect to update audio URLs whenever the content changes
  useEffect(() => {
    const refreshAudioUrls = async () => {
      if (!currentContent) return;
      try {
        // Main Audio
        const mainSrc = currentContent.audioContent?.[0]?.audioUrl || currentContent.title?.audioUrl;
        if (mainSrc) {
          const sasUrl = await getContentSas(mainSrc);
          setMainAudioUrl(sasUrl);
        } else {
          setMainAudioUrl(null);
        }
        // Answer Audio (for Riddles)
        if (currentContent.type === 'Riddle' && currentContent.answer?.audioUrl) {
            const answerSrc = currentContent.answer.audioUrl;
            const sasUrl = await getContentSas(answerSrc);
            setAnswerAudioUrl(sasUrl);
        } else {
            setAnswerAudioUrl(null);
        }
      } catch (error) {
        console.error("Failed to get secure audio URL:", error);
      }
    };
    refreshAudioUrls();
  }, [currentContent]);

  const handleNextContent = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < contentList.length) {
      const nextContent = contentList[nextIndex];
      navigate(`/content/${nextContent.id}`);
    }
  };

  // --- Inline Styles (Unchanged) ---
  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '24px',
      maxWidth: '800px',
      height: 'calc(100vh - 48px)',
      margin: 'auto',
      boxSizing: 'border-box',
    },
    card: {
      width: '100%',
      flex: 1,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)',
      marginBottom: '24px',
      padding: '32px',
      boxSizing: 'border-box',
      fontSize: '24px',
      color: '#aaa',
    },
    title: {
      fontSize: '23px',
      fontWeight: 'bold',
      color: '#333',
      marginTop: '12px',
      marginBottom: 0,
      textAlign: 'center',
    },
    meta: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: '12px',
      fontSize: '18px',
      color: '#666',
    },
    dotSeparatorText: {
      margin: '0 8px',
      fontWeight: 'bold',
    },
    audioPlayer: {
      width: '100%',
      marginTop: '16px',
    },
    nextButton: {
      marginTop: '24px',
      padding: '12px 24px',
      fontSize: '16px',
      borderRadius: '8px',
      border: 'none',
      backgroundColor: '#007bff',
      color: 'white',
      cursor: 'pointer',
    },
    disabledButton: {
      backgroundColor: '#cccccc',
      cursor: 'not-allowed',
    }
  };

  // --- Render Logic (Unchanged) ---
  if (isLoading) {
    return <div style={styles.container}><h1>Loading...</h1></div>;
  }
  if (!currentContent) {
    return <div style={styles.container}><h1>Content not found.</h1></div>;
  }
  const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const isNextButtonDisabled = currentIndex >= contentList.length - 1;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        [Icon Placeholder]
      </div>
      <h1 style={styles.title}>{currentContent.titleText}</h1>
      <div style={styles.meta}>
        <span>{capitalize(currentContent.type)}</span>
        <span style={styles.dotSeparatorText}>•</span>
        <span>{capitalize(currentContent.language)}</span>
      </div>
      <AudioPlayer src={mainAudioUrl} style={styles.audioPlayer} />
      {currentContent.type === 'Riddle' && (
          <AudioPlayer src={answerAudioUrl} style={styles.audioPlayer} />
      )}
      <button
        onClick={handleNextContent}
        disabled={isNextButtonDisabled}
        style={{ ...styles.nextButton, ...(isNextButtonDisabled && styles.disabledButton) }}
      >
        Next Page
      </button>
    </div>
  );
};