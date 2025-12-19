import { useState, useEffect, useCallback } from "react";
import { BlockBlobClient } from "@azure/storage-blob";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { SEEDS_URL, AUDIO_BASE_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import "./AddStory.css";

const AddStory = ({ content, contentType, onContentTypeChange }) => {
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
    audioFile: "",       // for upload only (not sent to backend)
    answerAudioFile: ""  // for upload only (not sent to backend)
  });



  const [titlesUnderTheme, setTitlesUnderTheme] = useState([]);
  const [audioSrc, setAudioSrc] = useState();
  const [answerAudioSrc, setAnswerAudioSrc] = useState();
  const [isSaveButtonDisabled, setIsSaveButtonDisabled] = useState(false);
  const [allContent, setAllContent] = useState([]);
  const [themes, setThemes] = useState({});
  const [newTheme, setNewTheme] = useState(false);


  const getAllContent = async () => {
    try {
      const seedsRes = await fetch(
        `${SEEDS_URL}/content`,
        {
          method: "GET",
          headers: getAuthHeaders(),
        }
      );
      if (!seedsRes.ok) {
        throw new Error(`Failed to fetch content: ${seedsRes.status}`);
      }
      const seedsData = await seedsRes.json();
      // Handle both { data: [...] } and direct array responses
      const contentArray = Array.isArray(seedsData) ? seedsData : (seedsData.data || []);
      return contentArray;
    } catch (error) {
      console.error("Error fetching content:", error);
      return [];
    }
  };

  const populateThemes = (content) => {
    if (!Array.isArray(content)) {
      console.warn("populateThemes: content is not an array", content);
      return;
    }
    const newThemes = {};
    content.forEach(item => {
      if (!item) return;
      
      // Handle both object and string formats for theme
      const themeEnglish = typeof item.theme === "object" ? item.theme.english : item.theme;
      const themeLocal = typeof item.theme === "object" ? item.theme.local : item.localTheme;
      
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
      setMetadata(prev => ({
        ...prev,
        theme: { english: name === "theme" ? "" : prev.theme.english, local: name === "localTheme" ? "" : prev.theme.local, audioUrl: "" },
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
        englishTheme = Object.keys(themes[metadata.language]).find(key => themes[metadata.language][key] === value);
      }
      setMetadata(prev => ({
        ...prev,
        theme: { english: englishTheme || "", local: localTheme || "", audioUrl: "" },
        // Reset title as object
        title: { english: "", local: "", audioUrl: "" },
      }));
      fetchTitlesUnderTheme(metadata.language, englishTheme);
    }
  };

  const fetchTitlesUnderTheme = useCallback((language, theme) => {
    if (!Array.isArray(allContent)) {
      console.warn("fetchTitlesUnderTheme: allContent is not an array", allContent);
      setTitlesUnderTheme({});
      return;
    }
    
    const filteredContent = allContent.filter(item => {
      if (!item || !item.language) return false;
      
      // Handle both object and string formats for theme
      const itemTheme = typeof item.theme === "object" ? item.theme.english : item.theme;
      
      return item.language.toLowerCase() === language.toLowerCase() &&
        itemTheme && itemTheme.toLowerCase() === theme.toLowerCase();
    });
    
    const titleMap = {};
    filteredContent.forEach(item => {
      // Handle both object and string formats for title
      const titleEnglish = typeof item.title === "object" ? item.title.english : item.title;
      const titleLocal = typeof item.title === "object" ? item.title.local : item.localTitle;
      
      if (titleEnglish && titleLocal) {
        titleMap[titleEnglish.toLowerCase()] = titleLocal;
      }
    });
    setTitlesUnderTheme(titleMap);
  }, [allContent]);

  const handleLanguageChange = (event) => {
    const newLanguage = event.target.value;
    setMetadata(prev => ({
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
        const contentFromServer = await getAllContent();
        // Ensure we always set an array
        const contentArray = Array.isArray(contentFromServer) ? contentFromServer : [];
        setAllContent(contentArray);
        populateThemes(contentArray);
        console.log("Content loaded:", contentArray.length, "items");
      } catch (error) {
        console.error("Error loading content:", error);
        setAllContent([]);
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
        language: content.language || "kannada",
        title: {
          english: content.title?.english || "",
          local: content.title?.local || "",
          audioUrl: content.title?.audioUrl || ""
        },
        theme: {
          english: content.theme?.english || "",
          local: content.theme?.local || "",
          audioUrl: content.theme?.audioUrl || ""
        },
        audioContent: content.audioContent || [],
        createdBy: content.createdBy || "",
        isPullModel: content.isPullModel ?? false,
        isTeacherApp: content.isTeacherApp ?? true,
        isProcessed: content.isProcessed ?? false,
        isDeleted: content.isDeleted ?? false,
        audioFile: "",
        answerAudioFile: ""
      };
      setMetadata(quizMetadata);
      if (contentType !== "Riddle") {
        setAudioSrc(
          `${AUDIO_BASE_URL}/${content.id}.mp3`
        );
      } else {
        setAudioSrc(
          `${AUDIO_BASE_URL}/${content.id}/question.mp3`
        );
        setAnswerAudioSrc(
          `${AUDIO_BASE_URL}/${content.id}/answer.mp3`
        );
      }
      fetchTitlesUnderTheme(quizMetadata.language, quizMetadata.theme.english);
    }
  }, [content, contentType, fetchTitlesUnderTheme]);



  const [file, setFile] = useState();
  const [answerFile, setAnswerFile] = useState();
  const navigate = useNavigate();


  const isValid = () => {
    var valid = true;
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
    // Check if theme or localTheme is empty or if new theme is being created
    else if (!metadata.theme.english || metadata.theme.english === "new-theme" || !metadata.theme.local || metadata.theme.local === "new-theme") {
      alert("Theme and local theme cannot be empty");
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
    else if (metadata.language !== "english" && !metadata.title.local) {
      alert("Local Title cannot be empty");
      valid = false;
    }
    // Check if audio file is provided when it is supposed to be uploaded
    else if (!audioSrc && !metadata.audioFile) {
      alert("Audio file cannot be empty");
      valid = false;
    }
    // Check if answer audio file is provided when it is supposed to be uploaded
    else if (contentType === "Riddle" && !answerAudioSrc && !metadata.answerAudioFile) {
      alert("Answer audio file cannot be empty");
      valid = false;
    }
    return valid;
  };


  const onSubmit = (e) => {
    e.preventDefault();
    console.log("metadata", metadata);
    if (isValid()) {
      setIsSaveButtonDisabled(true);
      sendStory(e);
    }
  };

  const sendStory = async () => {
    // Get the correct ID - prefer _id, fallback to id
    const contentId = content ? (content._id || content.id) : uuidv4();
    // Always send title and theme as objects
    var newMetadata = {
      ...metadata,
      _id: contentId,
      type: contentType,
      title: {
        english: metadata.title.english || "",
        local: metadata.title.local || "",
        audioUrl: metadata.title.audioUrl || ""
      },
      theme: {
        english: metadata.theme.english || "",
        local: metadata.theme.local || "",
        audioUrl: metadata.theme.audioUrl || ""
      }
    };
    var isAudioUploaded = "true";
    if (!metadata.audioFile && !metadata.answerAudioFile) {
      newMetadata["isProcessed"] = metadata.isProcessed;
      isAudioUploaded = "false";
    }
    delete newMetadata["audioFile"];
    delete newMetadata["answerAudioFile"];
    
    // Ensure required fields are present
    if (!newMetadata.type || !newMetadata.language) {
      throw new Error("Type and language are required fields");
    }
    
    if (content) {
      // Since PATCH route is not available in backend, use POST
      // This will create a new version with the same _id
      const seedsRes = await fetch(
        `${SEEDS_URL}/content/`,
        {
          method: "POST",
          headers: {
            ...getAuthHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(newMetadata),
        }
      );
      if (!seedsRes.ok) {
        const errorData = await seedsRes.json().catch(() => ({ error: "Failed to update content" }));
        throw new Error(errorData.error || `HTTP ${seedsRes.status}: Failed to update content`);
      }
      await seedsRes.json();
    } else {
      const seedsRes = await fetch(`${SEEDS_URL}/content/`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newMetadata),
      });
      if (!seedsRes.ok) {
        const errorData = await seedsRes.json().catch(() => ({ error: "Failed to create content" }));
        throw new Error(errorData.error || `HTTP ${seedsRes.status}: Failed to create content`);
      }
      await seedsRes.json();
    }
    if (metadata.audioFile) {
      const extname = metadata.audioFile.split(".").pop();
      var filename = `${contentId}.${extname}`;
      if (contentType === "Riddle") {
        filename = `${contentId}_question.${extname}`;
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
      const sasUrl = (await res.json()).sasToken;
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
    if (metadata.answerAudioFile) {
      const answerExtname = metadata.answerAudioFile.split(".").pop();
      var answerFilename = `${contentId}_answer.${answerExtname}`;
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
      const sasUrlAnswer = (await resAnswer.json()).sasToken;
      const clientAnswer = new BlockBlobClient(sasUrlAnswer);
      await clientAnswer.uploadBrowserData(answerFile, {
        metadata: {
          experience: contentType,
          Question: "false",
          isfinalaudio: "true",
        },
      });
    }
    navigate("/content");
  };

  const handleUploadFile = (event) => {
    //setMetadata({...metadata, audioFile: event.target.value})
    // cloneElement.log(typeof(event.target.files[0]))
    setMetadata({ ...metadata, audioFile: event.target.value });
    setFile(event.target.files[0]);
  };

  const handleUploadAnswerFile = (event) => {
    //setMetadata({...metadata, audioFile: event.target.value})
    // cloneElement.log(typeof(event.target.files[0]))
    setMetadata({ ...metadata, answerAudioFile: event.target.value });
    setAnswerFile(event.target.files[0]);
  };

  return (
    <form className="add-story-form" onSubmit={onSubmit}>
      {(contentType === "Story" || contentType === "Poem" || contentType === "Song" || contentType === "Riddle") && onContentTypeChange && (
        <div className="form-section" style={{ marginBottom: "24px" }}>
          <div className="form-group">
            <label className="form-label">Content Type</label>
            <select
              value={contentType}
              onChange={(event) => {
                if (onContentTypeChange) {
                  onContentTypeChange(event);
                }
                setMetadata(prev => ({ ...prev, type: event.target.value }));
              }}
              className="form-select"
              style={{ maxWidth: "200px" }}
            >
              <option value="Story">Story</option>
              <option value="Poem">Poem</option>
              <option value="Song">Song</option>
              <option value="Riddle">Riddle</option>
            </select>
          </div>
        </div>
      )}
      <div className="form-section">
        <div className="form-section-title">Basic Information</div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label form-label-required">Language</label>
            <select
              value={metadata.language || ""}
              onChange={handleLanguageChange}
              className="form-select"
            >
              <option value="kannada">Kannada</option>
              <option value="hindi">Hindi</option>
              <option value="marathi">Marathi</option>
              <option value="english">English</option>
              <option value="tamil">Tamil</option>
              <option value="bengali">Bengali</option>
            </select>
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Theme</div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label form-label-required">English Theme</label>
            <select 
              name="theme" 
              value={metadata.theme.english || ""} 
              onChange={handleThemeChange} 
              className="form-select"
            >
              <option value="">Choose Theme</option>
              {themes[metadata.language] && Object.keys(themes[metadata.language]).map(theme => (
                <option key={theme} value={theme}>{theme}</option>
              ))}
              <option value="new-theme">Create New Theme</option>
            </select>
          </div>
          {metadata.language !== "english" && (
            <div className="form-group">
              <label className="form-label form-label-required">{metadata.language.charAt(0).toUpperCase() + metadata.language.slice(1)} Theme</label>
              <select 
                name="localTheme" 
                value={metadata.theme.local || ""} 
                onChange={handleThemeChange} 
                className="form-select"
              >
                <option value="">Choose Theme</option>
                {themes[metadata.language] && Object.values(themes[metadata.language]).map(localTheme => (
                  <option key={localTheme} value={localTheme}>{localTheme}</option>
                ))}
                <option value="new-theme">Create New Theme</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {newTheme && (
        <div className="new-theme-section">
          <div className="form-section-title">New Theme Details</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label form-label-required">New English Theme</label>
              <input 
                type="text" 
                value={metadata.theme.english || ""} 
                onChange={(event) => setMetadata({ ...metadata, theme: { ...metadata.theme, english: event.target.value } })} 
                className="form-input" 
                placeholder="Enter new theme in English" 
              />
            </div>
            {metadata.language !== "english" && (
              <div className="form-group">
                <label className="form-label form-label-required">New {metadata.language.charAt(0).toUpperCase() + metadata.language.slice(1)} Theme</label>
                <input 
                  type="text" 
                  value={metadata.theme.local || ""} 
                  onChange={(event) => setMetadata({ ...metadata, theme: { ...metadata.theme, local: event.target.value } })} 
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
              value={metadata.title.english || ""}
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
                value={metadata.title.local || ""}
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
        <button
          type="submit"
          disabled={isSaveButtonDisabled}
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
