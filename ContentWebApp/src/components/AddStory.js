import { useState, useEffect, useCallback } from "react";
import { BlockBlobClient } from "@azure/storage-blob";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { SEEDS_URL, AUDIO_BASE_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { useAuth } from "../hooks/useAuth";

const AddStory = ({ content, contentType }) => {
  const { getCurrentUser } = useAuth();
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

  const getAllContent = async () => {
    const seedsRes = await fetch(`${SEEDS_URL}/content`, {
      method: "GET",
      headers: getAuthHeaders(),
    });
    const seedsData = await seedsRes.json();
    // Handle paginated response
    return seedsData.data || seedsData || [];
  };

  const populateThemes = (content) => {
    const newThemes = {};
    content.forEach((item) => {
      const themeEnglish = item.theme?.english || item.theme;
      const themeLocal = item.theme?.local || item.localTheme;
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
        const itemTheme = item.theme?.english || item.theme;
        return (
          item.language.toLowerCase() === language.toLowerCase() &&
          itemTheme.toLowerCase() === theme.toLowerCase()
        );
      });
      const titleMap = {};
      filteredContent.forEach((item) => {
        const titleEnglish = item.title?.english || item.title;
        const titleLocal = item.title?.local || item.localTitle;
        titleMap[titleEnglish.toLowerCase()] = titleLocal;
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
      console.log("FUNCTION CALLED");
      const contentFromServer = await getAllContent();
      setAllContent(contentFromServer);
      populateThemes(contentFromServer);
      console.log("contentFromServer", contentFromServer.length);

      // filterContent();
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
    // Check if theme is empty or new-theme
    else if (!metadata.theme.english || metadata.theme.english === "new-theme") {
      alert("Theme cannot be empty");
      valid = false;
    }
    // When language is not English, local theme is also required
    else if (
      metadata.language !== "english" &&
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
    console.log("metadata", metadata);
    if (isValid()) {
      setIsSaveButtonDisabled(true);
      sendStory(e);
    }
  };

  const sendStory = async () => {
    const _id = content ? content.id : uuidv4();
    // Always send title and theme as objects
    var newMetadata = {
      ...metadata,
      _id,
      type: contentType,
      title: {
        english: metadata.title.english || "",
        local:
          metadata.language === "english"
            ? metadata.title.english || ""
            : metadata.title.local || "",
        audioUrl: metadata.title.audioUrl || "",
      },
      theme: {
        english: metadata.theme.english || "",
        local:
          metadata.language === "english"
            ? metadata.theme.english || ""
            : metadata.theme.local || "",
        audioUrl: metadata.theme.audioUrl || "",
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

    const tenantName = await getCurrentUser();
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
    <form className="add-form" onSubmit={onSubmit}>
      <div style={{ marginBottom: "30px" }}>
        <label
          style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}
        >
          Language:
        </label>
        <select
          value={metadata.language || ""}
          onChange={handleLanguageChange}
          className="mintgreen"
          style={{ width: "100%", maxWidth: "300px", padding: "8px" }}
        >
          <option value="kannada">Kannada</option>
          <option value="hindi">Hindi</option>
          <option value="marathi">Marathi</option>
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
              <option
                value="new-theme"
                selected={metadata.theme.local === "new-theme"}
              >
                Choose New Theme
              </option>
            </select>
          </div>
        )}
      </div>

      {newTheme && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              metadata.language === "english" ? "1fr" : "1fr 1fr",
            gap: "20px",
            marginBottom: "25px",
            padding: "15px",
            backgroundColor: "#f8f9fa",
            borderRadius: "8px",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "500",
              }}
            >
              Add New English Theme
            </label>
            <input
              type="text"
              value={metadata.theme.english}
              onChange={(event) =>
                setMetadata({
                  ...metadata,
                  theme: { ...metadata.theme, english: event.target.value },
                })
              }
              className="mintgreen"
              placeholder="Enter new theme"
              style={{ width: "100%", padding: "8px" }}
            />
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
                Add New {metadata.language} Theme
              </label>
              <input
                type="text"
                value={metadata.theme.local}
                onChange={(event) =>
                  setMetadata({
                    ...metadata,
                    theme: { ...metadata.theme, local: event.target.value },
                  })
                }
                className="mintgreen"
                placeholder={`Enter new theme in ${metadata.language}`}
                style={{ width: "100%", padding: "8px" }}
              />
            </div>
          )}
        </div>
      )}

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
            English Title
          </label>
          <input
            type="text"
            name="titleEnglish"
            className="mintgreen"
            placeholder="Add Title"
            value={metadata.title.english || ""}
            onChange={(event) =>
              setMetadata({
                ...metadata,
                title: { ...metadata.title, english: event.target.value },
              })
            }
            style={{ width: "100%", padding: "8px" }}
          />
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
              {metadata.language} Title
            </label>
            <input
              type="text"
              name="titleLocal"
              className="mintgreen"
              placeholder="Add Title"
              value={metadata.title.local || ""}
              onChange={(event) =>
                setMetadata({
                  ...metadata,
                  title: { ...metadata.title, local: event.target.value },
                })
              }
              style={{ width: "100%", padding: "8px" }}
            />
          </div>
        )}
      </div>

      {Object.keys(titlesUnderTheme).length > 0 && !newTheme && (
        <div
          style={{
            marginBottom: "25px",
            padding: "15px",
            backgroundColor: "#f8f9fa",
            borderRadius: "8px",
            border: "1px solid #dee2e6",
          }}
        >
          <label
            style={{
              display: "block",
              marginBottom: "12px",
              fontWeight: "500",
              fontSize: "14px",
            }}
          >
            Existing Titles under "{metadata.theme.english}" in{" "}
            {metadata.language}:
          </label>
          <ul
            style={{
              margin: 0,
              paddingLeft: "20px",
              lineHeight: "1.8",
              color: "#495057",
            }}
          >
            {Object.entries(titlesUnderTheme).map(
              ([englishTitle, localTitle], index) => (
              <li key={index} style={{ marginBottom: "4px" }}>
                {englishTitle} - {localTitle}
              </li>
              ),
            )}
          </ul>
        </div>
      )}

      {/* {themes.length > 0 && (
          <div>
            <label>Available {metadata.language} Themes:</label>
            <ul>
              {themes.map((theme, index) => (
                <li key={index}>{theme}</li>
              ))}
            </ul>
          </div>
        )} */}

      {metadata.isProcessed && audioSrc && (
        <div style={{ marginBottom: "20px" }}>
          <label
            style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}
          >
            Current {contentType === "Riddle" && "Question "}Audio File:
          </label>
          <audio
            controls
            src={audioSrc}
            style={{ width: "100%", maxWidth: "500px" }}
          />
        </div>
      )}

      {metadata.isProcessed && answerAudioSrc && (
        <div style={{ marginBottom: "20px" }}>
          <label
            style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}
          >
            Current {contentType === "Riddle" && "Answer "}Audio File:
          </label>
          <audio
            controls
            src={answerAudioSrc}
            style={{ width: "100%", maxWidth: "500px" }}
          />
        </div>
      )}

      {!metadata.isProcessed && audioSrc && (
        <div
          style={{
            padding: "12px",
            backgroundColor: "#fff3cd",
            borderRadius: "6px",
            marginBottom: "20px",
            color: "#856404",
            border: "1px solid #ffeaa7",
          }}
        >
          <strong>Audio is being processed</strong>
        </div>
      )}

      <div style={{ marginBottom: "20px" }}>
        <label
          style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}
        >
          {audioSrc ? "Change" : ""} {contentType}{" "}
          {contentType === "Riddle" && "Question "}Audio File
        </label>
        <input
          type="file"
          name="audioFile"
          className="mintgreen"
          placeholder="Add Audio File"
          value={metadata.audioFile || ""}
          onChange={(event) => handleUploadFile(event)}
          style={{ width: "100%", maxWidth: "500px", padding: "8px" }}
        />
      </div>

      {contentType === "Riddle" && (
        <div style={{ marginBottom: "20px" }}>
          <label
            style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}
          >
            {answerAudioSrc ? "Change" : ""} {contentType} Answer Audio File
          </label>
          <input
            type="file"
            name="audioFile"
            className="mintgreen"
            placeholder="Add Answer Audio File"
            value={metadata.answerAudioFile || ""}
            onChange={(event) => handleUploadAnswerFile(event)}
            style={{ width: "100%", maxWidth: "500px", padding: "8px" }}
          />
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: "30px",
          marginBottom: "30px",
          padding: "15px",
          backgroundColor: "#f8f9fa",
          borderRadius: "8px",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            gap: "8px",
          }}
        >
          <input
            type="checkbox"
            name="isPullModel"
            className="mintgreen check"
            checked={metadata.isPullModel || false}
            onChange={(event) =>
              setMetadata({ ...metadata, isPullModel: !metadata.isPullModel })
            }
            style={{ width: "18px", height: "18px", cursor: "pointer" }}
          />
          <span style={{ fontWeight: "500" }}>Add to IVR</span>
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            gap: "8px",
          }}
        >
          <input
            type="checkbox"
            name="isTeacherApp"
            className="mintgreen check"
            checked={metadata.isTeacherApp || false}
            onChange={(event) =>
              setMetadata({ ...metadata, isTeacherApp: !metadata.isTeacherApp })
            }
            style={{ width: "18px", height: "18px", cursor: "pointer" }}
          />
          <span style={{ fontWeight: "500" }}>Add to Teacher App</span>
        </label>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
        <input
          disabled={isSaveButtonDisabled}
          type="submit"
          className="btn"
          style={{
            backgroundColor: isSaveButtonDisabled ? "#ccc" : "#E5A83B",
            color: "white",
            padding: "12px 40px",
            fontSize: "16px",
            fontWeight: "600",
            border: "none",
            borderRadius: "6px",
            cursor: isSaveButtonDisabled ? "not-allowed" : "pointer",
            transition: "background-color 0.2s",
          }}
          value="Save"
        />
        {isSaveButtonDisabled && (
          <img
            src="https://cdn.dribbble.com/users/255512/screenshots/2215917/animation.gif"
            alt="Saving..."
            width={40}
            height={40}
            style={{ opacity: 1 }}
          />
        )}
      </div>
    </form>
  );
};

export default AddStory;
