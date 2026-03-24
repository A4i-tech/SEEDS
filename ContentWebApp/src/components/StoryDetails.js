import React from "react";
import { useState, useEffect } from "react";
import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";

const StoryDetails = ({ type, story }) => {
  const [audioSrc, setAudioSrc] = useState("");
  const [answerAudioSrc, setAnswerAudioSrc] = useState("");

  const storyId = story.id;
  const titleEnglish = story.title?.english ?? story.title;
  const titleLocal = story.title?.local ?? story.localTitle;
  const themeEnglish = story.theme?.english ?? story.theme;
  const themeLocal = story.theme?.local ?? story.localTheme;
  const isProcessed = story.isProcessed ?? Boolean(story.audioContent?.length);
  const primaryAudio = story.audioContent?.[0]?.audioUrl;

  useEffect(() => {
    const fetchSASUrl = async (url) => {
      try {
        const response = await fetch(`${SEEDS_URL}/content/sasUrl?url=${encodeURIComponent(url)}`, {
          method: "GET",
          headers: getAuthHeaders(),
        });
        const data = await response.json();
        return data.url;
      } catch (error) {
        console.error("Error fetching SAS URL:", error);
        return ""; // Return empty string on error
      }
    };

    const defaultSrc = `https://seedsblob.blob.core.windows.net/output-container/${storyId}/1.0.wav`;
    const defaultAnswerSrc = `https://seedsblob.blob.core.windows.net/output-container/${storyId}/answer/1.0.wav`;
    const defaultQuestionSrc = `https://seedsblob.blob.core.windows.net/output-container/${storyId}/question/1.0.wav`;

    const resolvedPrimary = primaryAudio || defaultSrc;

    if (String(type).toLowerCase() === "riddle") {
      fetchSASUrl(defaultQuestionSrc).then(setAudioSrc);
      fetchSASUrl(defaultAnswerSrc).then(setAnswerAudioSrc);
    } else {
      fetchSASUrl(resolvedPrimary).then(setAudioSrc);
    }
  }, [storyId, type, primaryAudio]);

  return (
    <>
      <h2>{story.type}</h2>
      <br />
      <div className="metadataGrid">
        <div style={{ paddingBottom: "30px" }}>
          <div>Title</div>
          <div />
          <h4>{titleEnglish}</h4>
          <h4>{titleLocal}</h4>
        </div>
        <div style={{ paddingBottom: "30px" }}>
          <div>Language</div>
          <div />
          <h4>{story.language}</h4>
        </div>
        <div style={{ paddingBottom: "30px" }}>
          <div>Uploaded on</div>
          <div />
          {story.isPullModel && <h4>IVR</h4>}
          {story.isTeacherApp && <h4>Teacher App</h4>}
        </div>
      </div>
      {story.description && (
        <div style={{ paddingBottom: "30px" }}>
          <div>Description</div>
          <div />
          <h4>{story.description}</h4>
        </div>
      )}
      <div style={{ paddingBottom: "30px" }}>
        <div>Theme</div>
        <div />
        <h4>{themeEnglish}</h4>
        <h4>{themeLocal}</h4>
      </div>
      {isProcessed && (
        <div style={{ paddingBottom: "30px" }}>
          Audio: <br /> <audio controls src={audioSrc} />
          {story.audioContent?.[0]?.description && (
            <div className="table-cell-secondary" style={{ marginTop: "8px" }}>
              {story.audioContent[0].description}
            </div>
          )}
        </div>
      )}
      {isProcessed && String(type).toLowerCase() === "riddle" && (
        <div style={{ paddingBottom: "30px" }}>
          Answer Audio: <br /> <audio controls src={answerAudioSrc} />
        </div>
      )}

      {!isProcessed && <h6>Audio is being processed</h6>}
    </>
  );
};

export default StoryDetails;

// For story, etc. => Teacher app ticked
