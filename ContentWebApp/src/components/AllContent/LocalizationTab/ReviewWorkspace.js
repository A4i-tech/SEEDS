import React, { useEffect, useState } from "react";

import ReviewHeader from "./review/ReviewHeader";
import OriginalPanel from "./review/OriginalPanel";
import AITranslationPanel from "./review/AITranslationPanel";
import ReviewerPanel from "./review/ReviewerPanel";
import AISuggestionPanel from "./review/AISuggestionPanel";
import TranslationConfidence from "./review/TranslationConfidence";
import ReviewTimeline from "./review/ReviewTimeline";
import StatCard from "./review/StatCard";
import ReviewVersionHistory from "./review/ReviewVersionHistory";
import ReviewDifference from "./review/ReviewDifference";
import ReviewAnalytics from "./review/ReviewAnalytics";
import ReviewApprovalBar from "./review/ReviewApprovalBar";


const ReviewWorkspace = ({
  originalText,
  aiTranslation,
  onApprove,
}) => {

  console.log("ReviewWorkspace Rendered");

  // ==========================================
  // Review State
  // ==========================================

  const [reviewerTranslation, setReviewerTranslation] =
    useState("");

  const [reviewerComments, setReviewerComments] =
    useState("");

  const [updatedTranslation, setUpdatedTranslation] =
    useState("");

  const [translationVersions, setTranslationVersions] =
    useState([]);

  const [reviewEvents, setReviewEvents] =
    useState([]);

  const [reviewStage, setReviewStage] =
    useState("Draft");

  const [isImproving, setIsImproving] =
    useState(false);

  // ==========================================
  // Initialize Review
  // ==========================================

  useEffect(() => {

    setReviewerTranslation(aiTranslation);

    setUpdatedTranslation(aiTranslation);

    setTranslationVersions([
      {
        version: 1,
        label: "Initial AI Translation",
        content: aiTranslation,
        createdAt: new Date().toLocaleTimeString(),
      },
    ]);

    setReviewEvents([
      {
        time: new Date().toLocaleTimeString(),
        message: "🌐 Website HTML Extracted",
      },
      {
        time: new Date().toLocaleTimeString(),
        message: "🤖 AI Translation Generated",
      },
    ]);

    setReviewStage("Draft");

  }, [aiTranslation]);

  // ==========================================
  // Improve with AI
  // ==========================================

  const handleImproveWithAI = async () => {

    setReviewStage("AI Improving...");

    setIsImproving(true);

    setReviewEvents((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString(),
        message: "👤 Reviewer Edited Translation",
      },
      {
        time: new Date().toLocaleTimeString(),
        message: "💬 Reviewer Added Comments",
      },
      {
        time: new Date().toLocaleTimeString(),
        message: "🤖 AI Started Refinement",
      },
    ]);

    await new Promise((resolve) =>
      setTimeout(resolve, 1500)
    );

    let improved = reviewerTranslation;

    const feedback =
      reviewerComments.toLowerCase();

    if (feedback.includes("formal")) {
      improved +=
        "\n\n✨ Applied formal writing style.";
    }

    if (feedback.includes("login")) {
      improved +=
        "\n\n✨ Preserved Login terminology.";
    }

    if (feedback.includes("dashboard")) {
      improved +=
        "\n\n✨ Preserved Dashboard wording.";
    }

    if (feedback.includes("friendly")) {
      improved +=
        "\n\n✨ Updated to friendly tone.";
    }

    if (feedback.includes("short")) {
      improved +=
        "\n\n✨ Shortened translation.";
    }

    if (!reviewerComments.trim()) {
      improved +=
        "\n\n✨ AI improved translation.";
    }

    setUpdatedTranslation(improved);

    setTranslationVersions((prev) => [
      ...prev,
      {
        version: prev.length + 1,
        label: "AI Refined Translation",
        content: improved,
        createdAt: new Date().toLocaleTimeString(),
      },
    ]);

    setReviewEvents((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString(),
        message: "✨ AI Generated Refined Translation",
      },
    ]);

    setReviewStage("AI Suggestion Ready");

    setIsImproving(false);

  };


  // ==========================================
// Approve Translation
// ==========================================

const handleApprove = () => {

  setReviewStage("Approved");

  setReviewEvents((prev) => [
    ...prev,
    {
      time: new Date().toLocaleTimeString(),
      message: "✅ Translation Approved",
    },
    {
      time: new Date().toLocaleTimeString(),
      message: "🚀 Translation Published",
    },
  ]);

  if (onApprove) {
    onApprove(updatedTranslation);
  }

};

// ==========================================
// Continue Review
// ==========================================

const handleContinueReview = () => {

  setReviewStage("Draft");

  setReviewEvents((prev) => [
    ...prev,
    {
      time: new Date().toLocaleTimeString(),
      message: "🔄 Reviewer requested another review cycle",
    },
  ]);

};  
    // ==========================================
  // UI
  // ==========================================

  return (
    <div
      className="review-workspace"
      style={{
        marginTop: "40px",
        padding: "25px",
        background: "#f8fafc",
        borderRadius: "12px",
        border: "1px solid #e5e7eb",
      }}
    >
    
      <h1 style={{ color: "red" }}>
        REVIEW WORKSPACE LOADED
      </h1>
  
      
      {/* ========================================== */}
      {/* Review Header */}
      {/* ========================================== */}

      <ReviewHeader
        reviewStage={reviewStage}
        versionCount={translationVersions.length}
      />
      <div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: "20px",
    marginBottom: "30px",
  }}
>

  <StatCard
    icon="📄"
    title="Words"
    value={
      originalText
        ? originalText.trim().split(/\s+/).length
        : 0
    }
    color="#3B82F6"
  />

  <StatCard
    icon="🌍"
    title="Languages"
    value="EN → FR"
    color="#8B5CF6"
  />

  <StatCard
    icon="🤖"
    title="AI Confidence"
    value="96%"
    color="#10B981"
  />

  <StatCard
    icon="📜"
    title="Versions"
    value={translationVersions.length}
    color="#F59E0B"
  />

</div>
      <div
        style={{
          marginTop: "20px",
          marginBottom: "25px",
        }}
      >
        <h2
          style={{
            margin: 0,
          }}
        >
          👤 Human Review Workspace
        </h2>

        <p
          style={{
            color: "#6b7280",
            marginTop: "8px",
          }}
        >
          Review AI generated translations,
          provide reviewer feedback,
          improve using AI,
          and approve the final translation.
        </p>

      </div>

{/* ========================================== */}
{/* SaaS Review Dashboard */}
{/* ========================================== */}

<div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "24px",
    marginTop: "30px",
    alignItems: "stretch",
  }}
>

  {/* Original Content */}

  <div
    style={{
      background: "#fff",
      borderRadius: "18px",
      padding: "24px",
      border: "1px solid #E5E7EB",
      boxShadow: "0 10px 30px rgba(0,0,0,.06)",
    }}
  >
    <OriginalPanel
      originalText={originalText}
    />
  </div>

  {/* AI Translation */}

  <div
    style={{
      background: "#fff",
      borderRadius: "18px",
      padding: "24px",
      border: "1px solid #E5E7EB",
      boxShadow: "0 10px 30px rgba(0,0,0,.06)",
    }}
  >
    <AITranslationPanel
      aiTranslation={aiTranslation}
    />
  </div>

  {/* Reviewer Workspace */}

  <div
    style={{
      background: "#fff",
      borderRadius: "18px",
      padding: "24px",
      border: "1px solid #E5E7EB",
      boxShadow: "0 10px 30px rgba(0,0,0,.06)",
    }}
  >
    <ReviewerPanel
      reviewerTranslation={reviewerTranslation}
      setReviewerTranslation={setReviewerTranslation}
      reviewerComments={reviewerComments}
      setReviewerComments={setReviewerComments}
      handleImproveWithAI={handleImproveWithAI}
      isImproving={isImproving}
    />
  </div>

  {/* AI Suggestion */}

  <div
    style={{
      background: "#fff",
      borderRadius: "18px",
      padding: "24px",
      border: "1px solid #E5E7EB",
      boxShadow: "0 10px 30px rgba(0,0,0,.06)",
    }}
  >
    <AISuggestionPanel
      updatedTranslation={updatedTranslation}
      onApprove={(translation) => {

        setReviewStage("Approved");

        setReviewEvents((prev) => [
          ...prev,
          {
            time: new Date().toLocaleTimeString(),
            message: "✅ Translation Approved",
          },
        ]);

        onApprove(translation);

      }}
    />
  </div>

</div>

{/* ========================================== */}
{/* Translation Difference Summary */}
{/* ========================================== */}

<ReviewDifference
  aiTranslation={aiTranslation}
  updatedTranslation={updatedTranslation}
  reviewerComments={reviewerComments}
/>

<div
  style={{
    marginTop: "40px",
    background: "#ffffff",
    borderRadius: "18px",
    padding: "28px",
    border: "1px solid #E5E7EB",
    boxShadow: "0 10px 30px rgba(0,0,0,.05)",
  }}
>

  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "25px",
    }}
  >

    <div>

      <h2
        style={{
          margin: 0,
          color: "#111827",
        }}
      >
        🔍 Translation Difference Summary
      </h2>

      <p
        style={{
          color: "#6B7280",
          marginTop: "8px",
        }}
      >
        AI improvements generated after reviewer feedback.
      </p>

    </div>

    <div
      style={{
        background: "#EEF2FF",
        color: "#4F46E5",
        padding: "8px 18px",
        borderRadius: "999px",
        fontWeight: 600,
      }}
    >
      AI Review
    </div>

  </div>

  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "30px",
    }}
  >

    {/* Reviewer Feedback */}

    <div
      style={{
        background: "#F9FAFB",
        borderRadius: "14px",
        padding: "20px",
        border: "1px solid #E5E7EB",
      }}
    >

      <h3 style={{ marginTop: 0 }}>
        💬 Reviewer Feedback
      </h3>

      <div
        style={{
          marginTop: "18px",
          whiteSpace: "pre-wrap",
          color: "#4B5563",
          lineHeight: "28px",
        }}
      >
        {reviewerComments || "No reviewer comments provided."}
      </div>

    </div>

    {/* AI Improvements */}

    <div
      style={{
        background: "#F9FAFB",
        borderRadius: "14px",
        padding: "20px",
        border: "1px solid #E5E7EB",
      }}
    >

      <h3 style={{ marginTop: 0 }}>
        ✨ AI Improvements
      </h3>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          marginTop: "20px",
        }}
      >

        {reviewerComments.toLowerCase().includes("formal") &&
          <div>✅ Applied Formal Tone</div>}

        {reviewerComments.toLowerCase().includes("friendly") &&
          <div>✅ Improved Friendly Style</div>}

        {reviewerComments.toLowerCase().includes("dashboard") &&
          <div>✅ Preserved Dashboard Terminology</div>}

        {reviewerComments.toLowerCase().includes("login") &&
          <div>✅ Preserved Login Terminology</div>}

        {reviewerComments.toLowerCase().includes("short") &&
          <div>✅ Shortened Translation</div>}

        {!reviewerComments.trim() &&
          <div>✅ AI Reviewed Translation</div>}

      </div>

    </div>

  </div>

</div>

              {/* ========================================== */}
      {/* Translation Confidence */}
      {/* ========================================== */}

      <TranslationConfidence
        reviewerComments={reviewerComments}
        reviewStage={reviewStage}
      />


<ReviewAnalytics
  translationVersions={translationVersions}
  reviewEvents={reviewEvents}
  reviewStage={reviewStage}
  confidence={
    70 +
    (reviewerComments.trim() ? 10 : 0) +
    (reviewStage === "AI Suggestion Ready" ? 10 : 0) +
    (reviewStage === "Approved" ? 10 : 0)
  }
/>


<ReviewApprovalBar
  reviewStage={reviewStage}
  onApprove={handleApprove}
  onContinueReview={handleContinueReview}
/>
      {/* ========================================== */}
      {/* Review Timeline */}
      {/* ========================================== */}

      <div
        style={{
          marginTop: "35px",
          marginBottom: "35px",
        }}
      >

        <ReviewTimeline
          events={reviewEvents}
        />

      </div>

      {/* ========================================== */}
      {/* Version History */}
      {/* ========================================== */}

      <hr
        style={{
          margin: "35px 0",
        }}
     />

     <ReviewVersionHistory
       translationVersions={translationVersions}
    />

  </div>
  );
};

export default ReviewWorkspace;