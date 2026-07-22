import React, { useMemo, useState } from "react";
import ReviewWorkspace from "./ReviewWorkspace";
import { contentService } from "../../../services/contentService";


const TranslationTab = ({
  projects = [],
  sites = [],
  languages = [],
}) => {
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedSite, setSelectedSite] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("Hindi");

  const [translatedHtml, setTranslatedHtml] = useState("");

  const [translationStatus, setTranslationStatus] = useState("");

  const [isTranslating, setIsTranslating] = useState(false);

  const [pipelineSteps, setPipelineSteps] = useState([]);

// ===============================
// Human Review State
// ===============================

  const [showReviewWorkspace, setShowReviewWorkspace] = useState(false);

  const [originalContent, setOriginalContent] = useState("");

  const [aiTranslationContent, setAiTranslationContent] = useState("");

  const [approvedTranslation, setApprovedTranslation] = useState("");



  
  const sampleHtml = `
    <div style="padding:20px;font-family:Arial">

      <h1>Welcome to SEEDS</h1>

      <p>This is AI Native Localization Platform.</p>

      <button>Login</button>

      <button>Register</button>

      <h3>Dashboard</h3>

      <p>Manage Projects and Languages</p>

    </div>
  `;

  const translations = {
    Hindi: {
      "Welcome to SEEDS": "SEEDS में आपका स्वागत है",
      "This is AI Native Localization Platform.":
        "यह AI आधारित लोकलाइज़ेशन प्लेटफ़ॉर्म है।",
      Login: "लॉगिन",
      Register: "रजिस्टर",
      Dashboard: "डैशबोर्ड",
      "Manage Projects and Languages":
        "प्रोजेक्ट और भाषाओं का प्रबंधन करें",
    },

    Telugu: {
      "Welcome to SEEDS": "SEEDS కు స్వాగతం",
      "This is AI Native Localization Platform.":
        "ఇది AI ఆధారిత లోకలైజేషన్ ప్లాట్‌ఫారమ్.",
      Login: "లాగిన్",
      Register: "రిజిస్టర్",
      Dashboard: "డాష్‌బోర్డ్",
      "Manage Projects and Languages":
        "ప్రాజెక్టులు మరియు భాషలను నిర్వహించండి",
    },

    Tamil: {
      "Welcome to SEEDS": "SEEDS-க்கு வரவேற்கிறோம்",
      "This is AI Native Localization Platform.":
        "இது AI அடிப்படையிலான உள்ளூர்மயமாக்கல் தளம்.",
      Login: "உள்நுழை",
      Register: "பதிவு செய்",
      Dashboard: "டாஷ்போர்டு",
      "Manage Projects and Languages":
        "திட்டங்கள் மற்றும் மொழிகளை நிர்வகிக்கவும்",
    },

    Kannada: {
      "Welcome to SEEDS": "SEEDS ಗೆ ಸ್ವಾಗತ",
      "This is AI Native Localization Platform.":
        "ಇದು AI ಆಧಾರಿತ ಸ್ಥಳೀಕರಣ ವೇದಿಕೆ.",
      Login: "ಲಾಗಿನ್",
      Register: "ನೋಂದಣಿ",
      Dashboard: "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
      "Manage Projects and Languages":
        "ಯೋಜನೆಗಳು ಮತ್ತು ಭಾಷೆಗಳನ್ನು ನಿರ್ವಹಿಸಿ",
    },
  };

  const projectSites = useMemo(() => {
    if (!selectedProject) return [];

    return sites.filter(
      (site) =>
        Number(site.projectId) === Number(selectedProject)
    );
  }, [sites, selectedProject]);

  const handleTranslate = async () => {
    if (!selectedProject) {
      alert("Please select a project.");
      return;
    }

    if (!selectedSite) {
      alert("Please select a website.");
      return;
    }

    setTranslatedHtml("");

    setPipelineSteps([]);
    
    setIsTranslating(true);
    
    // ===================================
    // Step 1
    // ===================================
    
    setTranslationStatus("📥 Fetching Website Content...");

    setPipelineSteps([
      "📥 Sending Website URL"
    ]);
    
// Find selected site
const selectedSiteData = sites.find(
  (site) => Number(site.id) === Number(selectedSite)
);

if (!selectedSiteData) {
  alert("Website not found.");
  setIsTranslating(false);
  return;
}

let extractedContent = "";

try {

  const response = await contentService.extractWebsite(
    selectedSiteData.url
  );

  console.log("Website Response:", response);
  console.log("Response Type:", typeof response);
  console.log("Content:", response.content);


  extractedContent = response.content.join("\n");
  
  setPipelineSteps((prev) => [
    ...prev,
    "✅ Website Extracted"
  ]);

} catch (error) {

  console.error(error);

  alert(
    error.response ||
    error.message ||
    "Website extraction failed."
  );

  setIsTranslating(false);

  return;
}


// ===================================
// Step 2 - AI Translation
// ===================================

setTranslationStatus("🌍 Translating Content...");

setPipelineSteps((prev) => [
  ...prev,
  "🌍 Translating Website Content",
]);

let html = "";

try {
  const translationResponse =
    await contentService.translateWebsite(
      extractedContent,
      targetLanguage
    );

  console.log("Translation Response:", translationResponse);

  html = translationResponse.translatedContent;

} catch (error) {
  console.error(error);

  alert(
    error.response ||
    error.message ||
    "Translation failed."
  );

  setIsTranslating(false);
  return;
}

setPipelineSteps((prev) => [
  ...prev,
  "✅ Translation Completed",
]);

setTranslationStatus("🖥️ Generating Preview...");

await new Promise((resolve) => setTimeout(resolve, 800));

setTranslatedHtml(html);

// Human Review
setOriginalContent(extractedContent);
setAiTranslationContent(html);
setShowReviewWorkspace(true);

setPipelineSteps((prev) => [
  ...prev,
  "🖥️ Preview Generated",
]);

setTranslationStatus("✅ Translation Completed");

setIsTranslating(false);

};

  
return (
    <div className="table-container">

      <h2>🌍 Website Translation PoC</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2,1fr)",
          gap: "20px",
          marginTop: "25px",
        }}
      >

        {/* Project */}

        <div>

          <label><strong>Project</strong></label>

          <select
            className="search-box"
            value={selectedProject}
            onChange={(e) => {
              setSelectedProject(e.target.value);
              setSelectedSite("");
              setTranslatedHtml("");
              setTranslationStatus("");
            }}
          >
            <option value="">Select Project</option>

            {projects.map((project) => (
              <option
                key={project.id}
                value={project.id}
              >
                {project.name}
              </option>
            ))}

          </select>

        </div>

        {/* Website */}

        <div>

          <label><strong>Website</strong></label>

          <select
            className="search-box"
            value={selectedSite}
            onChange={(e) => {
              setSelectedSite(e.target.value);
              setTranslatedHtml("");
              setTranslationStatus("");
            }}
          >

            <option value="">
              Select Website
            </option>

            {projectSites.map((site) => (
              <option
                key={site.id}
                value={site.id}
              >
                {site.name}
              </option>
            ))}

          </select>

        </div>

        {/* Source */}

        <div>

          <label><strong>Source Language</strong></label>

          <input
            className="search-box"
            value="English"
            readOnly
          />

        </div>

        {/* Target */}

        <div>

          <label><strong>Target Language</strong></label>

          <select
            className="search-box"
            value={targetLanguage}
            onChange={(e) => {
              setTargetLanguage(e.target.value);
              setTranslatedHtml("");
              setTranslationStatus("");
            }}
          >

            {languages.map((language) => (
              <option
                key={language.id}
                value={language.name}
              >
                {language.name}
              </option>
            ))}

          </select>

        </div>

      </div>

      {/* Translate Button */}

      <button
        className="primary-btn"
        style={{
          marginTop: "20px",
        }}
        onClick={handleTranslate}
        disabled={isTranslating}
      >
        {isTranslating
          ? "⏳ Translating..."
          : "🚀 Translate Website"}
      </button>

      {/* Status */}

      {translationStatus && (

        <div
          style={{
            marginTop: "20px",
            padding: "15px",
            borderRadius: "8px",
            background: "#eef7ff",
            border: "1px solid #b6d4fe",
            color: "#0c5460",
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          {translationStatus}
        </div>

      )}

      {/* Translation Pipeline */}

    {pipelineSteps.length > 0 && (

       <div
         style={{
           marginTop: "25px",
           padding: "20px",
           background: "#ffffff",
           border: "1px solid #dbeafe",
           borderRadius: "10px",
           boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
         }}
       >

         <h3
           style={{
             marginBottom: "15px",
             color: "#1f2937",
            }}
         >
            🚀 Translation Pipeline
         </h3>

         {pipelineSteps.map((step, index) => (

           <div
             key={index}
             style={{
               padding: "8px 0",
               borderBottom:
                 index !== pipelineSteps.length - 1
                   ? "1px solid #f1f5f9"
                   : "none",
               color: "#374151",
               fontWeight: 500,
              }}
           >
              {step}
           </div>

         ))}

       </div>

        )}

      {/* Preview */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "25px",
          marginTop: "35px",
        }}
      >

        {/* Original */}

        <div>

          <h3>🌐 Original Website</h3>

          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: "10px",
              padding: "20px",
              minHeight: "280px",
              background: "#fff",
            }}
            dangerouslySetInnerHTML={{
              __html: sampleHtml,
            }}
          />

        </div>

        {/* Translated */}

        <div>

          <h3>
            🌍 Translated Website
          </h3>

          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: "10px",
              padding: "20px",
              minHeight: "280px",
              background: "#fff",
            }}
            dangerouslySetInnerHTML={{
              __html:
                translatedHtml ||
                "<div style='padding:40px;text-align:center;color:#888;'>Click <b>Translate Website</b> to generate translated preview.</div>",
            }}
          />

        </div>

      </div>

      {/* Translation Summary */}

      {translatedHtml && (

        <div
          style={{
            marginTop: "30px",
            padding: "20px",
            borderRadius: "10px",
            background: "#f8fafc",
            border: "1px solid #dbeafe",
          }}
        >

          <h3>
            📊 Translation Summary
          </h3>

          <p>
            <strong>Project:</strong>{" "}
            {
              projects.find(
                (p) =>
                  Number(p.id) ===
                  Number(selectedProject)
              )?.name
            }
          </p>

          <p>
            <strong>Website:</strong>{" "}
            {
              sites.find(
                (s) =>
                  Number(s.id) ===
                  Number(selectedSite)
              )?.name
            }
          </p>

          <p>
            <strong>Source:</strong> English
          </p>

          <p>
            <strong>Target:</strong>{" "}
            {targetLanguage}
          </p>

          <p>
            <strong>Status:</strong>{" "}
            ✅ Translation Completed
          </p>

        </div>

      )}

      {/* ==========================================
    Human Review Workspace
========================================== */}

     {showReviewWorkspace && (

       <ReviewWorkspace
         originalText={originalContent}
         aiTranslation={aiTranslationContent}
         onApprove={(finalTranslation) => {

           setApprovedTranslation(finalTranslation);

           alert("✅ Translation Approved Successfully!");

          }}
        />

      )}

    </div>
  );
};


export default TranslationTab;