import { useState, useEffect, useCallback } from "react";
import { BlockBlobClient } from "@azure/storage-blob";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { SEEDS_URL, AUDIO_BASE_URL } from "../Constants";

const AddStory = ({ content, contentType }) => {
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
      headers: {
        authToken: "postman",
      },
    });
    const seedsData = await seedsRes.json();
    return seedsData;
  };

  const populateThemes = (content) => {
    const newThemes = {};
    content.forEach((item) => {
      if (item.language && item.theme && item.localTheme) {
        const lang = item.language.toLowerCase();
        newThemes[lang] = newThemes[lang] || {};
        newThemes[lang][item.theme.toLowerCase()] = item.localTheme.toLowerCase();
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
          (key) => themes[metadata.language][key] === value
        );
      }
      setMetadata((prev) => ({
        ...prev,
        theme: { english: englishTheme || "", local: localTheme || "", audioUrl: "" },
        // Reset title as object
        title: { english: "", local: "", audioUrl: "" },
      }));
      fetchTitlesUnderTheme(metadata.language, englishTheme);
    }
  };

  const fetchTitlesUnderTheme = useCallback(
    (language, theme) => {
      const filteredContent = allContent.filter(
        (item) =>
          item.language.toLowerCase() === language.toLowerCase() &&
          item.theme.toLowerCase() === theme.toLowerCase()
      );
      const titleMap = {};
      filteredContent.forEach((item) => {
        titleMap[item.title.toLowerCase()] = item.localTitle;
      });
      setTitlesUnderTheme(titleMap);
    },
    [allContent]
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
          local: content.title?.local || "",
          audioUrl: content.title?.audioUrl || "",
        },
        theme: {
          english: content.theme?.english || "",
          local: content.theme?.local || "",
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
    // Check if theme or localTheme is empty or if new theme is being created
    else if (
      !metadata.theme.english ||
      metadata.theme.english === "new-theme" ||
      !metadata.theme.local ||
      metadata.theme.local === "new-theme"
    ) {
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
    const _id = content ? content.id : uuidv4();
    // Always send title and theme as objects
    var newMetadata = {
      ...metadata,
      _id,
      type: contentType,
      title: {
        english: metadata.title.english || "",
        local: metadata.title.local || "",
        audioUrl: metadata.title.audioUrl || "",
      },
      theme: {
        english: metadata.theme.english || "",
        local: metadata.theme.local || "",
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
    if (content) {
      newMetadata = { ...newMetadata, _id: content._id };
      const seedsRes = await fetch(`${SEEDS_URL}/content?isAudioUploaded=${isAudioUploaded}`, {
        method: "PATCH",
        headers: {
          authToken: "postman",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newMetadata),
      });
      await seedsRes.json();
    } else {
      const seedsRes = await fetch(`${SEEDS_URL}/content/`, {
        method: "POST",
        headers: {
          authToken: "postman",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newMetadata),
      });
      await seedsRes.json();
    }
    if (metadata.audioFile) {
      const extname = metadata.audioFile.split(".").pop();
      var filename = `${_id}.${extname}`;
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
          headers: {
            authToken: "postman",
          },
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
      var answerFilename = `${_id}_answer.${answerExtname}`;
      const resAnswer = await fetch(
        `${SEEDS_URL}/content/sasToken?` +
          new URLSearchParams({
            blobName: answerFilename,
          }),
        {
          method: "GET",
          headers: {
            authToken: "postman",
          },
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
    <form className="add-form" onSubmit={onSubmit}>
      <div className="metadataGrid" style={{ paddingBottom: "20px" }}>
        <div>
          <label>
            Language:
            <br />
            <select
              value={metadata.language || ""}
              onChange={handleLanguageChange}
              className="mintgreen"
              style={{ width: "150px" }}
            >
              <option value="kannada">Kannada</option>
              <option value="hindi">Hindi</option>
              <option value="marathi">Marathi</option>
              <option value="english">English</option>
              <option value="tamil">Tamil</option>
              <option value="bengali">Bengali</option>
            </select>
          </label>
        </div>
      </div>

      <div className="metadataGrid">
        {/* <div>
          <label>Description </label>
          <br />
          <textarea
            rows={5}
            cols={24}
            type="text"
            name="description"
            className="mintgreen"
            placeholder="Add Description"
            value={metadata.description || ""}
            onChange={(event) =>
              setMetadata({ ...metadata, description: event.target.value })
            }
          />
        </div> */}

        {/* <div>
          <label>English Theme </label>
          <br />
          <input
            type="text"
            name="theme"
            className="mintgreen"
            placeholder="Add Theme"
            value={metadata.theme || ""}
            onChange={(event) =>
              setMetadata({ ...metadata, theme: event.target.value })
            }
          />
        </div> */}
        <div>
          <label>English Theme</label>
          <select
            name="theme"
            value={metadata.theme.english}
            onChange={handleThemeChange}
            className="mintgreen"
          >
            <option value="">Choose Theme</option>
            {themes[metadata.language] &&
              Object.keys(themes[metadata.language]).map((theme) => (
                <option key={theme} value={theme}>
                  {theme}
                </option>
              ))}
            <option value="new-theme" selected={metadata.theme.local === "new-theme"}>
              Choose New Theme
            </option>
          </select>
        </div>
        {metadata.language !== "english" && (
          <div>
            <label>{metadata.language} Theme</label>
            <select
              name="localTheme"
              value={metadata.theme.local}
              onChange={handleThemeChange}
              className="mintgreen"
            >
              <option value="">Choose Theme</option>
              {themes[metadata.language] &&
                Object.values(themes[metadata.language]).map((localTheme) => (
                  <option key={localTheme} value={localTheme}>
                    {localTheme}
                  </option>
                ))}
              <option value="new-theme" selected={metadata.theme.local === "new-theme"}>
                Choose New Theme
              </option>
            </select>
          </div>
        )}

        {/* {metadata.language != "english" && (
          <div>
            <label>{metadata.language} Theme </label>
            <br />
            <input
              type="text"
              name="localTheme"
              className="mintgreen"
              placeholder="Add Theme"
              value={metadata.localTheme || ""}
              onChange={(event) =>
                setMetadata({ ...metadata, localTheme: event.target.value })
              }
            />
          </div>
        )} */}
      </div>

      {newTheme && (
        <>
          <div>
            <label>Add New English Theme</label>
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
            />
          </div>
          {metadata.language !== "english" && (
            <div>
              <label>Add New {metadata.language} Theme</label>
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
              />
            </div>
          )}
        </>
      )}

      <div>
        <label>English Title </label>
        <br />
        <input
          type="text"
          name="titleEnglish"
          className="mintgreen"
          placeholder="Add Title"
          value={metadata.title.english || ""}
          onChange={(event) =>
            setMetadata({ ...metadata, title: { ...metadata.title, english: event.target.value } })
          }
        />
      </div>

      {metadata.language !== "english" && (
        <div>
          <label>{metadata.language} Title </label>
          <br />
          <input
            type="text"
            name="titleLocal"
            className="mintgreen"
            placeholder="Add Title"
            value={metadata.title.local || ""}
            onChange={(event) =>
              setMetadata({ ...metadata, title: { ...metadata.title, local: event.target.value } })
            }
          />
        </div>
      )}

      {Object.keys(titlesUnderTheme).length > 0 && !newTheme && (
        <div>
          <label>
            Existing Titles under "{metadata.theme.english}" in {metadata.language}:
          </label>
          <ul>
            {Object.entries(titlesUnderTheme).map(([englishTitle, localTitle], index) => (
              <li key={index}>{`${englishTitle} - ${localTitle}`}</li>
            ))}
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
        <label>
          Current {contentType === "Riddle" && "Question "} Audio File: <br />{" "}
          <audio controls src={audioSrc} />
        </label>
      )}
      <br />
      {metadata.isProcessed && answerAudioSrc && (
        <label>
          Current {contentType === "Riddle" && "Answer "} Audio File: <br />{" "}
          <audio controls src={answerAudioSrc} />
        </label>
      )}
      {!metadata.isProcessed && audioSrc && <h6>Audio is being processed</h6>}

      <div>
        {audioSrc && (
          <label>
            Change {contentType} {contentType === "Riddle" && "Question "}Audio File{" "}
          </label>
        )}
        {!audioSrc && (
          <label>
            {contentType} {contentType === "Riddle" && "Question "}Audio File{" "}
          </label>
        )}
        <br />
        <input
          type="file"
          name="audioFile"
          className="mintgreen"
          placeholder="Add Audio File"
          value={metadata.audioFile || ""}
          onChange={(event) => handleUploadFile(event)}
        />
      </div>

      {contentType === "Riddle" && (
        <div>
          {answerAudioSrc && <label>Change {contentType} Answer Audio File </label>}
          {!answerAudioSrc && <label>{contentType} Answer Audio File </label>}
          <br />
          <input
            type="file"
            name="audioFile"
            className="mintgreen"
            placeholder="Add Answer Audio File"
            value={metadata.answerAudioFile || ""}
            onChange={(event) => handleUploadAnswerFile(event)}
          />
        </div>
      )}

      <div>
        <input
          type="checkbox"
          name="isPullModel"
          className="mintgreen check"
          checked={metadata.isPullModel || false}
          onChange={(event) => setMetadata({ ...metadata, isPullModel: !metadata.isPullModel })}
        />
        <label>Add to IVR </label>
      </div>

      <div>
        <input
          type="checkbox"
          name="isTeacherApp"
          className="mintgreen check"
          checked={metadata.isTeacherApp || false}
          onChange={(event) => setMetadata({ ...metadata, isTeacherApp: !metadata.isTeacherApp })}
        />
        <label> Add to Teacher App </label>
      </div>

      <input
        disabled={isSaveButtonDisabled}
        type="submit"
        className="btn"
        style={{ backgroundColor: "#E5A83B", color: "white" }}
        value="Save"
      />
      <img
        style={{ opacity: isSaveButtonDisabled === false ? 0 : 1 }}
        src="https://cdn.dribbble.com/users/255512/screenshots/2215917/animation.gif"
        alt="Circular Progress Bar"
        width={150}
      />
    </form>
  );
};

export default AddStory;
