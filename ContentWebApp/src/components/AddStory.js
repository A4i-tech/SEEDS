import { useState, useEffect, useCallback } from "react";
import { BlockBlobClient } from "@azure/storage-blob";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { SEEDS_URL, AUDIO_BASE_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { useAuth } from "../hooks/useAuth";
import { isMp3File } from "../utils/fileValidators";
import { contentService } from "../services/contentService";

const AddStory = ({ content, contentType, onContentTypeChange }) => {
  const { getCurrentUserName } = useAuth();
  const [metadata, setMetadata] = useState({
    id: "",
    type: "Story",
    description: "",
    language: "kannada",
    title: { english: "", local: "", audioUrl: "" },
    theme: { english: "", local: "", audioUrl: "" },
    audioContent: [],
    createdBy: "",
    isPullModel: false,
    isTeacherApp: true,
    isProcessed: false,
    isDeleted: false,
    audioFile: "", // for upload only (not sent to backend)
    answerAudioFile: "", // for upload only (not sent to backend)
  });

  const [titlesUnderTheme, setTitlesUnderTheme] = useState([]);
  const [audioSrc, setAudioSrc] = useState();
  const [answerAudioSrc, setAnswerAudioSrc] = useState();
  const [isSaveButtonDisabled, setIsSaveButtonDisabled] = useState(false);
  const [allContent, setAllContent] = useState([]);
  const [themes, setThemes] = useState({});
  const [newTheme, setNewTheme] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const populateThemes = (content) => {
    if (!Array.isArray(content)) {
      console.warn("populateThemes: content is not an array", content);
      return;
    }
    const newThemes = {};
    content.forEach((item) => {
      if (!item || !item.theme) return;
      const themeEnglish = item.theme.english;
      const themeLocal = item.theme.local;
      if (item.language && themeEnglish && themeLocal) {
        const lang = item.language.toLowerCase();
        newThemes[lang] = newThemes[lang] || {};
        newThemes[lang][themeEnglish.toLowerCase()] = themeLocal.toLowerCase();
      }
    });
    setThemes(newThemes);
  };

  const handleThemeChange = (event) => {
    const { value, name } = event.target;
    if (value === "new-theme") {
      setNewTheme(true);
      setTitlesUnderTheme([]);
      setMetadata((prev) => ({
        ...prev,
        theme: {
          english: name === "theme" ? "" : prev.theme.english,
          local: name === "localTheme" ? "" : prev.theme.local,
          audioUrl: "",
        },
        // Reset title as object
        title: { english: "", local: "", audioUrl: "" },
      }));
    } else {
      setNewTheme(false);
      let englishTheme = "";
      let localTheme = "";
      if (name === "theme") {
        englishTheme = value;
        localTheme = themes[metadata.language][value];
      } else {
        localTheme = value;
        englishTheme = Object.keys(themes[metadata.language]).find(
          (key) => themes[metadata.language][key] === value,
        );
      }
      setMetadata((prev) => ({
        ...prev,
        theme: {
          english: englishTheme || "",
          local: localTheme || "",
          audioUrl: "",
        },
        // Reset title as object
        title: { english: "", local: "", audioUrl: "" },
      }));
      fetchTitlesUnderTheme(metadata.language, englishTheme);
    }
  };

  const fetchTitlesUnderTheme = useCallback(
    (language, theme) => {
      const filteredContent = allContent.filter((item) => {
        const itemTheme = item.theme?.english;
        return (
          item.language.toLowerCase() === language.toLowerCase() &&
          itemTheme.toLowerCase() === theme.toLowerCase()
        );
      });
      const titleMap = {};
      filteredContent.forEach((item) => {
        const titleEnglish = item.title?.english;
        const titleLocal = item.title?.local;
        if (titleEnglish && titleLocal) {
          titleMap[titleEnglish.toLowerCase()] = titleLocal;
        }
      });
      setTitlesUnderTheme(titleMap);
    },
    [allContent],
  );

  const handleLanguageChange = (event) => {
    const newLanguage = event.target.value;
    setMetadata((prev) => ({
      ...prev,
      language: newLanguage,
      theme: { english: "", local: "", audioUrl: "" },
      title: { english: "", local: "", audioUrl: "" },
    }));
    setNewTheme(false);
    setTitlesUnderTheme([]); // Clear titles under theme when language changes
  };

  useEffect(() => {
    const getContent = async () => {
      try {
        const contentFromServer = await contentService.getAllContent();
        setAllContent(contentFromServer);
        populateThemes(contentFromServer);
        setLoadError(null);
      } catch (error) {
        setLoadError(error.message);
      }
    };
    getContent();
  }, []);

  useEffect(() => {
    if (content) {
      const quizMetadata = {
        id: content.id,
        type: content.type || "Story",
        description: content.description || "",
        language: (content.language || "kannada").toLowerCase(),
        title: {
          english: content.title?.english || "",
          local:
            (content.language || "").toLowerCase() === "english"
              ? content.title?.english || ""
              : content.title?.local || "",
          audioUrl: content.title?.audioUrl || "",
        },
        theme: {
          english: content.theme?.english || "",
          local:
            (content.language || "").toLowerCase() === "english"
              ? content.theme?.english || ""
              : content.theme?.local || "",
          audioUrl: content.theme?.audioUrl || "",
        },
        audioContent: content.audioContent || [],
        createdBy: content.createdBy || "",
        isPullModel: content.isPullModel ?? false,
        isTeacherApp: content.isTeacherApp ?? true,
        isProcessed: content.isProcessed ?? false,
        isDeleted: content.isDeleted ?? false,
        audioFile: "",
        answerAudioFile: "",
      };
      setMetadata(quizMetadata);
      if (contentType !== "Riddle") {
        setAudioSrc(`${AUDIO_BASE_URL}/${content.id}.mp3`);
      } else {
        setAudioSrc(`${AUDIO_BASE_URL}/${content.id}/question.mp3`);
        setAnswerAudioSrc(`${AUDIO_BASE_URL}/${content.id}/answer.mp3`);
      }
      fetchTitlesUnderTheme(quizMetadata.language, quizMetadata.theme.english);
    }
  }, [content, contentType, fetchTitlesUnderTheme]);

  const [file, setFile] = useState();
  const [answerFile, setAnswerFile] = useState();
  const [uploadError, setUploadError] = useState("");
  const [answerUploadError, setAnswerUploadError] = useState("");
  const navigate = useNavigate();

  const isValid = () => {
    var valid = true;
    const languageLower = (metadata.language || "").toLowerCase();
    const inputTitleLower = (metadata.title.english || "").toLowerCase();
    const inputLocalTitleLower = (metadata.title.local || "").toLowerCase();
    // Check if title is empty
    if (!metadata.title.english) {
      alert("Title cannot be empty");
      valid = false;
    }
    // Check if language is empty
    else if (!metadata.language) {
      alert("Language cannot be empty");
      valid = false;
    }
    // Check if theme is empty or new-theme
    else if (!metadata.theme.english || metadata.theme.english === "new-theme") {
      alert("Theme cannot be empty");
      valid = false;
    }
    // When language is not English, local theme is also required
    else if (
      languageLower !== "english" &&
      (!metadata.theme.local || metadata.theme.local === "new-theme")
    ) {
      alert("Local theme cannot be empty");
      valid = false;
    }
    // Check for title duplication under the same theme and language, case insensitively
    else if (Object.keys(titlesUnderTheme).includes(inputTitleLower)) {
      alert("Title already exists under this theme and language");
      valid = false;
    } else if (Object.values(titlesUnderTheme).includes(inputLocalTitleLower)) {
      alert("Local title already exists under this theme and language");
      valid = false;
    }
    //Check that localTitle is not empty if language is not english
    else if (languageLower !== "english" && !metadata.title.local) {
      alert("Local Title cannot be empty");
      valid = false;
    }
    // Check if audio file is provided when it is supposed to be uploaded
    else if (!audioSrc && !metadata.audioFile) {
      alert("Audio file cannot be empty");
      valid = false;
    }
    // Check if answer audio file is provided when it is supposed to be uploaded
    else if (
      contentType === "Riddle" &&
      !answerAudioSrc &&
      !metadata.answerAudioFile
    ) {
      alert("Answer audio file cannot be empty");
      valid = false;
    }
    return valid;
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (isValid()) {
      setIsSaveButtonDisabled(true);
      sendStory(e);
    }
  };

  const sendStory = async () => {
    const _id = content ? content.id : uuidv4();
    const languageLower = (metadata.language || "").toLowerCase();
    // Always send title and theme as objects
    var newMetadata = {
      ...metadata,
      _id,
      type: contentType,
      title: {
        english: metadata.title.english,
        local: languageLower === "english" ? metadata.title.english : metadata.title.local,
        audioUrl: metadata.title.audioUrl,
      },
      theme: {
        english: metadata.theme.english,
        local: languageLower === "english" ? metadata.theme.english : metadata.theme.local,
        audioUrl: metadata.theme.audioUrl,
      },
    };
    var isAudioUploaded = "true";
    if (!metadata.audioFile && !metadata.answerAudioFile) {
      newMetadata["isProcessed"] = metadata.isProcessed;
      isAudioUploaded = "false";
    }
    delete newMetadata["audioFile"];
    delete newMetadata["answerAudioFile"];

    // Get SAS tokens and populate audioContent with input-container URLs before sending to backend
    const audioContentArray = [];
    let sasUrl = null;
    let sasUrlAnswer = null;
    let filename = null;
    let answerFilename = null;

    if (metadata.audioFile) {
      const extname = metadata.audioFile.split(".").pop();
      filename = `${_id}.${extname}`;
      if (contentType === "Riddle") {
        filename = `${_id}_question.${extname}`;
      }
      const res = await fetch(
        `${SEEDS_URL}/content/sasToken?` +
          new URLSearchParams({
            blobName: filename,
          }),
        {
          method: "GET",
          headers: getAuthHeaders(),
        }
      );
      sasUrl = (await res.json()).sasToken;
      // Extract base URL (input-container URL) without SAS token
      const inputContainerUrl = sasUrl.split("?")[0];
      audioContentArray.push({
        description: "",
        audioUrl: inputContainerUrl,
      });
    }

    if (metadata.answerAudioFile) {
      const answerExtname = metadata.answerAudioFile.split(".").pop();
      answerFilename = `${_id}_answer.${answerExtname}`;
      const resAnswer = await fetch(
        `${SEEDS_URL}/content/sasToken?` +
          new URLSearchParams({
            blobName: answerFilename,
          }),
        {
          method: "GET",
          headers: getAuthHeaders(),
        }
      );
      sasUrlAnswer = (await resAnswer.json()).sasToken;
      // Extract base URL (input-container URL) without SAS token
      const inputContainerUrlAnswer = sasUrlAnswer.split("?")[0];
      audioContentArray.push({
        description: "",
        audioUrl: inputContainerUrlAnswer,
      });
    }

    // Populate audioContent array in metadata
    if (audioContentArray.length > 0) {
      newMetadata.audioContent = audioContentArray;
    }

    const tenantName = await getCurrentUserName();
    newMetadata.createdBy = tenantName || newMetadata.createdBy || "";

    // Upload files to Azure Blob Storage FIRST, before sending metadata to backend
    // This ensures files are available when the background job starts processing
    if (metadata.audioFile && sasUrl) {
      const client = new BlockBlobClient(sasUrl);
      const metadataProperties = {
        experience: contentType,
      };
      if (!metadata.answerAudioFile) {
        metadataProperties["isfinalaudio"] = "true";
      } else {
        metadataProperties["isfinalaudio"] = "false";
      }
      if (contentType === "Riddle") {
        metadataProperties["Question"] = "true";
      }
      await client.uploadBrowserData(file, {
        metadata: metadataProperties,
      });
    }
    if (metadata.answerAudioFile && sasUrlAnswer) {
      const clientAnswer = new BlockBlobClient(sasUrlAnswer);
      await clientAnswer.uploadBrowserData(answerFile, {
        metadata: {
          experience: contentType,
          Question: "false",
          isfinalaudio: "true",
        },
      });
    }

    // Send metadata to backend with populated audioContent AFTER files are uploaded
    if (content) {
      newMetadata = { ...newMetadata, _id: content._id };
      const seedsRes = await fetch(`${SEEDS_URL}/content?isAudioUploaded=${isAudioUploaded}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(newMetadata),
      });
      await seedsRes.json();
    } else {
      const seedsRes = await fetch(`${SEEDS_URL}/content/`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(newMetadata),
      });
      await seedsRes.json();
    }
    navigate("/content");
  };

  const handleUploadFile = (event) => {
    const selected = event.target.files && event.target.files[0];
    if (!selected) {
      setMetadata({ ...metadata, audioFile: "" });
      setFile(null);
      setUploadError("");
      return;
    }
    if (!isMp3File(selected)) {
      setUploadError("Only .mp3 files are allowed.");
      setMetadata({ ...metadata, audioFile: "" });
      setFile(null);
      return;
    }
    setUploadError("");
    setMetadata({ ...metadata, audioFile: selected.name });
    setFile(selected);
  };

  const handleUploadAnswerFile = (event) => {
    const selected = event.target.files && event.target.files[0];
    if (!selected) {
      setMetadata({ ...metadata, answerAudioFile: "" });
      setAnswerFile(null);
      setAnswerUploadError("");
      return;
    }
    if (!isMp3File(selected)) {
      setAnswerUploadError("Only .mp3 files are allowed.");
      setMetadata({ ...metadata, answerAudioFile: "" });
      setAnswerFile(null);
      return;
    }
    setAnswerUploadError("");
    setMetadata({ ...metadata, answerAudioFile: selected.name });
    setAnswerFile(selected);
  };

  return (
    <form className="add-form" onSubmit={onSubmit}>
      <div style={{ marginBottom: "30px" }}>
        <label
          style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}
        >
          Language:
        </label>
        <select
          value={metadata.language}
          onChange={handleLanguageChange}
          className="mintgreen"
          style={{ width: "100%", maxWidth: "300px", padding: "8px" }}
        >
          <option value="kannada">Kannada</option>
          <option value="hindi">Hindi</option>
          <option value="marathi">Marathi</option>
          <option value="odia">Odia</option>
          <option value="english">English</option>
          <option value="tamil">Tamil</option>
          <option value="bengali">Bengali</option>
        </select>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            metadata.language === "english" ? "1fr" : "1fr 1fr",
          gap: "20px",
          marginBottom: "25px",
        }}
      >
        <div>
          <label
            style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}
          >
            English Theme
          </label>
          <select
            name="theme"
            value={metadata.theme.english}
            onChange={handleThemeChange}
            className="mintgreen"
            style={{ width: "100%", padding: "8px" }}
          >
            <option value="">Choose Theme</option>
            {themes[metadata.language] &&
              Object.keys(themes[metadata.language]).map((theme) => (
                <option key={theme} value={theme}>
                  {theme}
                </option>
              ))}
            <option
              value="new-theme"
              selected={metadata.theme.local === "new-theme"}
            >
              Choose New Theme
            </option>
          </select>
        </div>
        {metadata.language !== "english" && (
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "500",
                textTransform: "capitalize",
              }}
            >
              {metadata.language} Theme
            </label>
            <select
              name="localTheme"
              value={metadata.theme.local}
              onChange={handleThemeChange}
              className="mintgreen"
              style={{ width: "100%", padding: "8px" }}
            >
              <option value="">Choose Theme</option>
              {themes[metadata.language] &&
                Object.values(themes[metadata.language]).map((localTheme) => (
                  <option key={localTheme} value={localTheme}>
                    {localTheme}
                  </option>
                ))}
                <option value="new-theme">Create New Theme</option>
              </select>
            </div>
          )}
        </div>

      {newTheme && (
        <div className="new-theme-section">
          <div className="form-section-title">New Theme Details</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label form-label-required">New English Theme</label>
              <input
                type="text"
                value={metadata.theme.english}
                onChange={(event) =>
                  setMetadata({
                    ...metadata,
                    theme: { ...metadata.theme, english: event.target.value },
                  })
                }
                className="form-input"
                placeholder="Enter new theme in English"
              />
            </div>
            {metadata.language !== "english" && (
              <div className="form-group">
                <label className="form-label form-label-required">New {metadata.language.charAt(0).toUpperCase() + metadata.language.slice(1)} Theme</label>
                <input
                  type="text"
                  value={metadata.theme.local}
                  onChange={(event) =>
                    setMetadata({
                      ...metadata,
                      theme: { ...metadata.theme, local: event.target.value },
                    })
                  }
                  className="form-input"
                  placeholder={`Enter new theme in ${metadata.language}`}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="form-section">
        <div className="form-section-title">Title</div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label form-label-required">English Title</label>
            <input
              type="text"
              name="titleEnglish"
              className="form-input"
              placeholder="Enter title in English"
              value={metadata.title.english}
              onChange={(event) =>
                setMetadata({ ...metadata, title: { ...metadata.title, english: event.target.value } })
              }
            />
          </div>
          {metadata.language !== "english" && (
            <div className="form-group">
              <label className="form-label form-label-required">{metadata.language.charAt(0).toUpperCase() + metadata.language.slice(1)} Title</label>
              <input
                type="text"
                name="titleLocal"
                className="form-input"
                placeholder={`Enter title in ${metadata.language}`}
                value={metadata.title.local}
                onChange={(event) =>
                  setMetadata({ ...metadata, title: { ...metadata.title, local: event.target.value } })
                }
              />
            </div>
          )}
        </div>
      </div>

      {Object.keys(titlesUnderTheme).length > 0 && !newTheme && (
        <div className="existing-titles">
          <label className="existing-titles-label">
            Existing Titles under "{metadata.theme.english}" in {metadata.language}:
          </label>
          <ul className="existing-titles-list">
            {Object.entries(titlesUnderTheme).map(([englishTitle, localTitle], index) => (
              <li key={index} className="existing-titles-item">{`${englishTitle} - ${localTitle}`}</li>
            ))}
          </ul>
        </div>
      )}

      {(metadata.isProcessed && audioSrc) || (metadata.isProcessed && answerAudioSrc) || (!metadata.isProcessed && audioSrc) ? (
        <div className="audio-section">
          {metadata.isProcessed && audioSrc && (
            <div>
              <label className="audio-section-label">
                Current {contentType === "Riddle" ? "Question " : ""}Audio File
              </label>
              <audio controls src={audioSrc} className="audio-player" />
            </div>
          )}
          {metadata.isProcessed && answerAudioSrc && (
            <div style={{ marginTop: "16px" }}>
              <label className="audio-section-label">
                Current Answer Audio File
              </label>
              <audio controls src={answerAudioSrc} className="audio-player" />
            </div>
          )}
          {!metadata.isProcessed && audioSrc && (
            <div className="audio-processing">Audio is being processed</div>
          )}
        </div>
      ) : null}

      <div className="form-section">
        <div className="form-section-title">Audio Files</div>
        <div className="form-group">
          <label className="form-label">
            {audioSrc ? `Change ${contentType} ${contentType === "Riddle" ? "Question " : ""}Audio File` : `${contentType} ${contentType === "Riddle" ? "Question " : ""}Audio File`}
            <span className="form-label-required"> *</span>
          </label>
          <div className="form-file-wrapper">
            <input
              type="file"
              name="audioFile"
              id="audioFile"
              accept="audio/*"
              className="form-file-input"
              onChange={(event) => handleUploadFile(event)}
            />
            <label htmlFor="audioFile" className="form-file-label">
              📁 Choose Audio File
            </label>
          </div>
          {file && (
            <div className="form-file-name">Selected: {file.name}</div>
          )}
          {uploadError && (
            <div className="form-error">{uploadError}</div>
          )}
        </div>

        {contentType === "Riddle" && (
          <div className="form-group" style={{ marginTop: "20px" }}>
            <label className="form-label">
              {answerAudioSrc ? `Change ${contentType} Answer Audio File` : `${contentType} Answer Audio File`}
              <span className="form-label-required"> *</span>
            </label>
            <div className="form-file-wrapper">
              <input
                type="file"
                name="answerAudioFile"
                id="answerAudioFile"
                accept="audio/*"
                className="form-file-input"
                onChange={(event) => handleUploadAnswerFile(event)}
              />
              <label htmlFor="answerAudioFile" className="form-file-label">
                📁 Choose Answer Audio File
              </label>
            </div>
            {answerFile && (
              <div className="form-file-name">Selected: {answerFile.name}</div>
            )}
            {answerUploadError && (
              <div className="form-error">{answerUploadError}</div>
            )}
          </div>
        )}
      </div>

      <div className="form-section">
        <div className="form-section-title">Platform Integration</div>
        <div className="checkbox-group">
          <div className="checkbox-item">
            <input
              type="checkbox"
              name="isPullModel"
              id="isPullModel"
              checked={metadata.isPullModel || false}
              onChange={(event) =>
                setMetadata({ ...metadata, isPullModel: !metadata.isPullModel })
              }
            />
            <label htmlFor="isPullModel">Add to IVR</label>
          </div>
          <div className="checkbox-item">
            <input
              type="checkbox"
              name="isTeacherApp"
              id="isTeacherApp"
              checked={metadata.isTeacherApp || false}
              onChange={(event) =>
                setMetadata({ ...metadata, isTeacherApp: !metadata.isTeacherApp })
              }
            />
            <label htmlFor="isTeacherApp">Add to Teacher App</label>
          </div>
        </div>
      </div>

      <div className="form-actions">
        {loadError && <div className="form-error">Failed to load content: {loadError}</div>}
        <button
          type="submit"
          disabled={isSaveButtonDisabled || Boolean(uploadError) || Boolean(answerUploadError)}
          className="btn-primary"
        >
          {isSaveButtonDisabled ? (
            <>
              <div className="loading-spinner" style={{ width: "20px", height: "20px", borderWidth: "2px" }}></div>
              Saving...
            </>
          ) : (
            "💾 Save Content"
          )}
        </button>
      </div>
    </form>
  );
};

export default AddStory;
