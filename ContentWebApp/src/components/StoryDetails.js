import React from "react";
import { useState, useEffect } from "react";
import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { brailleAsciiToUnicode } from "../utils/brailleAscii";
import { getLanguageLabel } from "../utils/languageUtils";

const StoryDetails = ({ type, story }) => {
  const [audioSrc, setAudioSrc] = useState("");
  const [answerAudioSrc, setAnswerAudioSrc] = useState("");
  const [brailleText, setBrailleText] = useState("");
  const isBrf = type === "brf";

  const storyId = story.id;
  const titleEnglish = story.title.english;
  const titleLocal = story.title.local;
  const themeEnglish = story.theme.english;
  const themeLocal = story.theme.local;
  const isProcessed = story.is_processed;
  const primaryAudio = story.primary_audio_url;

  const fetchSASUrl = async (url) => {
    const response = await fetch(`${SEEDS_URL}/content/sasUrl?url=${encodeURIComponent(url)}`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
    const data = await response.json();
    return data.url;
  };

  useEffect(() => {
    const load = async () => {
      if (isBrf) {
        const sasUrl = await fetchSASUrl(story.braille_url);
        const res = await fetch(sasUrl);
        setBrailleText(await res.text());
        return;
      }

      const defaultSrc = `https://seedsblob.blob.core.windows.net/output-container/${storyId}/1.0.wav`;
      const defaultAnswerSrc = `https://seedsblob.blob.core.windows.net/output-container/${storyId}/answer/1.0.wav`;
      const defaultQuestionSrc = `https://seedsblob.blob.core.windows.net/output-container/${storyId}/question/1.0.wav`;

      const resolvedPrimary = primaryAudio || defaultSrc;

      if (type === "riddle") {
        setAudioSrc(await fetchSASUrl(defaultQuestionSrc));
        setAnswerAudioSrc(await fetchSASUrl(defaultAnswerSrc));
      } else {
        setAudioSrc(await fetchSASUrl(resolvedPrimary));
      }
    };
    load();
  }, [storyId, type, primaryAudio, isBrf, story.braille_url]);

  return (
    <div className="content-detail-card">
      <h2 className="content-detail-title">{story.type}</h2>
      <div className="content-detail-grid">
        <div className="content-detail-field">
          <span className="content-detail-label">Title</span>
          <span className="content-detail-value">{titleEnglish}</span>
          {titleLocal && <span className="content-detail-value">{titleLocal}</span>}
        </div>
        <div className="content-detail-field">
          <span className="content-detail-label">Language</span>
          <span className="content-detail-value">{story.language}</span>
        </div>
        <div className="content-detail-field">
          <span className="content-detail-label">Uploaded on</span>
          {story.is_pull_model && <span className="content-detail-value">IVR</span>}
          {story.is_teacher_app && <span className="content-detail-value">Teacher App</span>}
        </div>
        <div className="content-detail-field">
          <span className="content-detail-label">Theme</span>
          <span className="content-detail-value">{themeEnglish}</span>
          {themeLocal && <span className="content-detail-value">{themeLocal}</span>}
        </div>
        {story.description && (
          <div className="content-detail-field">
            <span className="content-detail-label">Description</span>
            <span className="content-detail-value">{story.description}</span>
          </div>
        )}
      </div>

      {isBrf ? (
        <div className="content-detail-audio-block">
          <span className="content-detail-label">Braille</span>
          <div className="content-detail-braille-compare">
            <div className="content-detail-braille-pane content-detail-braille-pane-braille">
              <span className="content-detail-braille-pane-label">Braille</span>
              <pre className="content-aggregator-block-braille">{brailleAsciiToUnicode(brailleText)}</pre>
            </div>
            <div className="content-detail-braille-pane content-detail-braille-pane-text">
              <span className="content-detail-braille-pane-label">{getLanguageLabel(story.language)}</span>
              <pre className="content-detail-braille-text">{story.braille_text}</pre>
            </div>
          </div>
        </div>
      ) : isProcessed ? (
        <div className="content-detail-audio-block">
          <span className="content-detail-label">Audio</span>
          <audio controls src={audioSrc} className="content-detail-audio" />
          {story.audio_content[0]?.description && (
            <div className="table-cell-secondary" style={{ marginTop: "8px" }}>
              {story.audio_content[0].description}
            </div>
          )}
        </div>
      ) : (
        <div className="content-detail-audio-block">
          <span className="content-detail-processing">Audio is being processed</span>
        </div>
      )}
      {isProcessed && type === "riddle" && (
        <div className="content-detail-audio-block">
          <span className="content-detail-label">Answer Audio</span>
          <audio controls src={answerAudioSrc} className="content-detail-audio" />
        </div>
      )}
    </div>
  );
};

export default StoryDetails;

// For story, etc. => Teacher app ticked
