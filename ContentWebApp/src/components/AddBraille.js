import { useState, useEffect, useCallback } from "react";
import { BlockBlobClient } from "@azure/storage-blob";
import { useNavigate } from "react-router-dom";
import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { useAuth } from "../hooks/useAuth";
import { isBrfFile } from "../utils/fileValidators";
import { contentService } from "../services/contentService";
import { getLanguageLabel, LANGUAGE_OPTIONS } from "../utils/languageUtils";
import Select from "./AllContent/shared/Select";
import "./AddContent.css";

const BRAILLE_GRADE_OPTIONS = [
  { value: "1", label: "Grade 1 (Uncontracted)" },
  { value: "2", label: "Grade 2 (Contracted)" },
];

const AddBraille = ({ content }) => {
  const { getCurrentUser } = useAuth();
  const navigate = useNavigate();
  const [metadata, setMetadata] = useState({
    description: content?.description || "",
    language: content?.language || "kn",
    titleEnglish: content?.title.english || "",
    titleLocal: content?.title.local || "",
    theme: { english: content?.theme.english || "", local: content?.theme.local || "" },
    brailleGrade: String(content?.braille_grade || 2),
    isTeacherApp: content?.is_teacher_app ?? true,
  });
  const [brailleFile, setBrailleFile] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [isSaveButtonDisabled, setIsSaveButtonDisabled] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [allContent, setAllContent] = useState([]);
  const [themes, setThemes] = useState({});
  const [titlesUnderTheme, setTitlesUnderTheme] = useState({});
  const [newTheme, setNewTheme] = useState(false);

  const languageLower = metadata.language.toLowerCase();
  const themesForLanguage = themes[metadata.language] || {};

  const populateThemes = (contentList) => {
    const newThemes = {};
    contentList.forEach((item) => {
      if (!item.theme.english) return;
      const lang = item.language.toLowerCase();
      newThemes[lang] = newThemes[lang] || {};
      newThemes[lang][item.theme.english.toLowerCase()] = item.theme.local.toLowerCase();
    });
    setThemes(newThemes);
  };

  const fetchTitlesUnderTheme = useCallback(
    (language, theme) => {
      const filteredContent = allContent.filter(
        (item) =>
          item.language.toLowerCase() === language.toLowerCase() &&
          item.theme.english.toLowerCase() === theme.toLowerCase() &&
          item.id !== content?.id,
      );
      const titleMap = {};
      filteredContent.forEach((item) => {
        if (item.title.local) {
          titleMap[item.title.english.toLowerCase()] = item.title.local;
        }
      });
      setTitlesUnderTheme(titleMap);
    },
    [allContent, content],
  );

  const handleThemeChange = (event) => {
    const { value, name } = event.target;
    if (value === "new-theme") {
      setNewTheme(true);
      setTitlesUnderTheme({});
      setMetadata((prev) => ({ ...prev, theme: { english: "", local: "" } }));
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
      setMetadata((prev) => ({ ...prev, theme: { english: englishTheme || "", local: localTheme || "" } }));
      fetchTitlesUnderTheme(metadata.language, englishTheme);
    }
  };

  const handleLanguageChange = (value) => {
    setMetadata((prev) => ({ ...prev, language: value, theme: { english: "", local: "" } }));
    setNewTheme(false);
    setTitlesUnderTheme({});
  };

  useEffect(() => {
    const getContent = async () => {
      try {
        const contentFromServer = await contentService.getAllContent();
        setAllContent(contentFromServer);
        populateThemes(contentFromServer);
      } catch (error) {
        setLoadError(error.message);
      }
    };
    getContent();
  }, []);

  useEffect(() => {
    if (content?.theme.english) {
      fetchTitlesUnderTheme(metadata.language, content.theme.english);
    }
  }, [content, fetchTitlesUnderTheme, metadata.language]);

  const handleUploadFile = (event) => {
    const selected = event.target.files && event.target.files[0];
    if (!selected) {
      setBrailleFile(null);
      setUploadError("");
      return;
    }
    if (!isBrfFile(selected)) {
      setUploadError("Only .brf files are allowed.");
      setBrailleFile(null);
      return;
    }
    setUploadError("");
    setBrailleFile(selected);
  };

  const isValid = () => {
    const errors = [
      [!metadata.titleEnglish, "English Title cannot be empty"],
      [languageLower !== "en" && !metadata.titleLocal, "Local Title cannot be empty"],
      [!metadata.theme.english || metadata.theme.english === "new-theme", "Theme cannot be empty"],
      [
        languageLower !== "en" && (!metadata.theme.local || metadata.theme.local === "new-theme"),
        "Local theme cannot be empty",
      ],
      [
        Object.keys(titlesUnderTheme).includes(metadata.titleEnglish.toLowerCase()),
        "Title already exists under this theme and language",
      ],
      [
        Object.values(titlesUnderTheme)
          .map((title) => title.toLowerCase())
          .includes(metadata.titleLocal.toLowerCase()),
        "Local title already exists under this theme and language",
      ],
      [!content && !brailleFile, "Braille (.brf) file cannot be empty"],
    ];
    const failed = errors.find(([condition]) => condition);
    if (failed) alert(failed[1]);
    return !failed;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!isValid()) return;
    setIsSaveButtonDisabled(true);
    setLoadError(null);
    try {
      const tenantName = await getCurrentUser();
      const isAudioUploaded = Boolean(brailleFile);

      let brailleUrl = content?.braille_url;
      if (brailleFile) {
        const filename = content ? `${content.id}.brf` : brailleFile.name;
        const res = await fetch(
          `${SEEDS_URL}/content/sasToken?` + new URLSearchParams({ blob_name: filename }),
          { method: "GET", headers: getAuthHeaders() }
        );
        const sasUrl = (await res.json()).sas_token;
        brailleUrl = sasUrl.split("?")[0];
        const client = new BlockBlobClient(sasUrl);
        await client.uploadBrowserData(brailleFile, { metadata: { experience: "brf" } });
      }

      const body = {
        type: "brf",
        language: metadata.language,
        description: metadata.description,
        title: {
          english: metadata.titleEnglish,
          local: languageLower === "en" ? metadata.titleEnglish : metadata.titleLocal,
        },
        theme: {
          english: metadata.theme.english,
          local: languageLower === "en" ? metadata.theme.english : metadata.theme.local,
        },
        braille_url: brailleUrl,
        braille_grade: Number(metadata.brailleGrade),
        is_teacher_app: metadata.isTeacherApp,
        created_by: tenantName || "",
      };

      if (content) {
        await contentService.updateContent({ ...body, id: content.id }, isAudioUploaded);
      } else {
        await contentService.createContent(body);
      }
      navigate("/content");
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsSaveButtonDisabled(false);
    }
  };

  return (
    <form className="add-form" onSubmit={onSubmit}>
      <div className="form-section">
        <div className="form-section-title">Language</div>
        <div className="form-group form-group-narrow">
          <Select value={metadata.language} onChange={handleLanguageChange} options={LANGUAGE_OPTIONS} />
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Theme</div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">English Theme</label>
            <Select
              value={metadata.theme.english}
              onChange={(value) => handleThemeChange({ target: { value, name: "theme" } })}
              placeholder="Choose Theme"
              options={[
                ...Object.keys(themesForLanguage).map((theme) => ({ value: theme, label: theme })),
                { value: "new-theme", label: "Choose New Theme" },
              ]}
            />
          </div>
          {languageLower !== "en" && (
            <div className="form-group">
              <label className="form-label">{getLanguageLabel(metadata.language)} Theme</label>
              <Select
                value={metadata.theme.local}
                onChange={(value) => handleThemeChange({ target: { value, name: "localTheme" } })}
                placeholder="Choose Theme"
                options={[
                  ...Object.values(themesForLanguage).map((localTheme) => ({ value: localTheme, label: localTheme })),
                  { value: "new-theme", label: "Create New Theme" },
                ]}
              />
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
                value={metadata.theme.english}
                onChange={(event) =>
                  setMetadata({ ...metadata, theme: { ...metadata.theme, english: event.target.value } })
                }
                className="form-input"
                placeholder="Enter new theme in English"
              />
            </div>
            {languageLower !== "en" && (
              <div className="form-group">
                <label className="form-label form-label-required">New {getLanguageLabel(metadata.language)} Theme</label>
                <input
                  type="text"
                  value={metadata.theme.local}
                  onChange={(event) =>
                    setMetadata({ ...metadata, theme: { ...metadata.theme, local: event.target.value } })
                  }
                  className="form-input"
                  placeholder={`Enter new theme in ${getLanguageLabel(metadata.language)}`}
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
              placeholder="Enter title in English"
              value={metadata.titleEnglish}
              onChange={(event) => setMetadata({ ...metadata, titleEnglish: event.target.value })}
            />
          </div>
          {languageLower !== "en" && (
            <div className="form-group">
              <label className="form-label form-label-required">{getLanguageLabel(metadata.language)} Title</label>
              <input
                type="text"
                placeholder={`Enter title in ${getLanguageLabel(metadata.language)}`}
                value={metadata.titleLocal}
                onChange={(event) => setMetadata({ ...metadata, titleLocal: event.target.value })}
              />
            </div>
          )}
        </div>
      </div>

      {Object.keys(titlesUnderTheme).length > 0 && !newTheme && (
        <div className="existing-titles">
          <label className="existing-titles-label">
            Existing Titles under "{metadata.theme.english}" in {getLanguageLabel(metadata.language)}:
          </label>
          <ul className="existing-titles-list">
            {Object.entries(titlesUnderTheme).map(([englishTitle, localTitle], index) => (
              <li key={index} className="existing-titles-item">{`${englishTitle} - ${localTitle}`}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="form-section">
        <div className="form-section-title">Braille</div>
        <div className="form-group form-group-narrow">
          <label className="form-label">Braille Grade</label>
          <Select
            value={metadata.brailleGrade}
            onChange={(value) => setMetadata({ ...metadata, brailleGrade: value })}
            options={BRAILLE_GRADE_OPTIONS}
          />
        </div>
        <div className="form-group">
          <label className="form-label">
            {content?.braille_url ? "Change Braille (.brf) File" : "Braille (.brf) File"}
            <span className="form-label-required"> *</span>
          </label>
          <div className="form-file-wrapper">
            <input
              type="file"
              name="brailleFile"
              id="brailleFile"
              accept=".brf"
              className="form-file-input"
              onChange={handleUploadFile}
            />
            <label htmlFor="brailleFile" className="form-file-label">
              Choose Braille File
            </label>
            {brailleFile && <span className="form-file-selected">{brailleFile.name}</span>}
          </div>
          {uploadError && <div className="form-error">{uploadError}</div>}
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Platform Integration</div>
        <div className="checkbox-group">
          <div className="checkbox-item">
            <input
              type="checkbox"
              name="isTeacherApp"
              id="isTeacherApp"
              checked={metadata.isTeacherApp || false}
              onChange={() => setMetadata({ ...metadata, isTeacherApp: !metadata.isTeacherApp })}
            />
            <label htmlFor="isTeacherApp">Add to Teacher App</label>
          </div>
        </div>
      </div>

      <div className="form-actions">
        {loadError && <div className="form-error">Failed to save content: {loadError}</div>}
        <button type="submit" disabled={isSaveButtonDisabled || Boolean(uploadError)} className="btn-primary">
          {isSaveButtonDisabled ? (
            <>
              <div className="form-loading-spinner"></div>
              Saving...
            </>
          ) : (
            "Save Content"
          )}
        </button>
      </div>
    </form>
  );
};

export default AddBraille;
