import React, { useEffect, useState } from "react";

import { translationService } from "../../../services/translationService";
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
  translationId,
  lang,
  onApprove,
}) => {

  // ==========================================
  // Review State
  // ==========================================

  const [translationDoc, setTranslationDoc] =
    useState(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState("");

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

  const originalText = translationDoc?.sourceText || "";
  const aiTranslation = translationDoc?.translations?.[lang]?.text || "";
  // Heuristic quality score computed server-side (placeholder integrity + length
  // plausibility, see platform/app/services/quality_scorer.py) — null until a
  // fresh AI translation exists, 1.0 once a human approves or Translation Memory
  // is reused. Never a fabricated/hardcoded number.
  const qualityScore = translationDoc?.translations?.[lang]?.qualityScore;
  // Prefer the explicit lowConfidence flag now returned by the backend
  // (threshold-configurable server-side, ticket #436 AC6); fall back to the
  // client-side 0.7 check for older payloads that don't include the flag.
  const backendLowConfidence = translationDoc?.translations?.[lang]?.lowConfidence;
  const isLowConfidence =
    typeof backendLowConfidence === "boolean"
      ? backendLowConfidence
      : typeof qualityScore === "number" && qualityScore < 0.7;

  // ==========================================
  // Real backend audit trail -> Activity Timeline
  // ==========================================

  const loadAudit = async (doc) => {
    if (!doc || !doc.siteId || !doc.key) return;
    try {
      const entries = await translationService.getAuditTrail({
        siteId: doc.siteId,
        route: doc.route,
        key: doc.key,
      });
      setReviewEvents(
        (entries || []).map((e) => {
          const action = e.action
            ? e.action.charAt(0).toUpperCase() + e.action.slice(1)
            : "Event";
          const detail = e.lang ? ` (${e.lang})` : "";
          return {
            message: e.actor ? `${action}${detail} — ${e.actor}` : `${action}${detail}`,
            time: e.at ? new Date(e.at).toLocaleString() : "",
          };
        })
      );
    } catch (err) {
      // Audit is supplementary; never block the review UI on it.
    }
  };

  // ==========================================
  // Load Translation From Backend
  // ==========================================

  useEffect(() => {

    let cancelled = false;

    const load = async () => {

      setIsLoading(true);
      setLoadError("");

      try {

        const [doc, versions] = await Promise.all([
          translationService.getTranslation(translationId),
          translationService.getVersions(translationId),
        ]);

        if (cancelled) return;

        setTranslationDoc(doc);

        const currentText = doc.translations?.[lang]?.text || "";

        setReviewerTranslation(currentText);
        setUpdatedTranslation(currentText);

        setTranslationVersions(
          versions.map((v) => ({
            version: v.version,
            label: `Version ${v.version}`,
            content: v.translations?.[lang]?.text || "",
            createdAt: v.approvedAt
              ? new Date(v.approvedAt).toLocaleString()
              : "",
          }))
        );

        await loadAudit(doc);

        setReviewStage(doc.status === "approved" ? "Approved" : "Draft");

      } catch (error) {

        if (!cancelled) {
          setLoadError(error.message || "Failed to load translation.");
        }

      } finally {

        if (!cancelled) setIsLoading(false);

      }

    };

    if (translationId) load();

    return () => {
      cancelled = true;
    };

  }, [translationId, lang]);

  // ==========================================
  // Autosave Reviewer Edits
  // ==========================================

  useEffect(() => {

    if (!translationId || isLoading) return;

    const savedText = translationDoc?.translations?.[lang]?.text || "";

    if (reviewerTranslation === savedText) return;

    const timer = setTimeout(async () => {

      try {

        const updatedDoc = await translationService.updateTranslation(
          translationId,
          lang,
          reviewerTranslation
        );

        setTranslationDoc(updatedDoc);
        setUpdatedTranslation(reviewerTranslation);

        await loadAudit(updatedDoc);

      } catch (error) {

        setReviewEvents((prev) => [
          ...prev,
          {
            time: new Date().toLocaleTimeString(),
            message: `Save failed: ${error.message || "unknown error"}`,
          },
        ]);

      }

    }, 800);

    return () => clearTimeout(timer);

  }, [reviewerTranslation, translationId, lang, isLoading, translationDoc]);


  // ==========================================
// Approve Translation
// ==========================================

const handleApprove = async () => {

  if (!translationId) return;

  try {

    const doc = await translationService.approveTranslation(translationId);

    setTranslationDoc(doc);
    setReviewStage("Approved");

    // Refresh versions + audit from backend (approval writes both).
    try {
      const versions = await translationService.getVersions(translationId);
      setTranslationVersions(
        versions.map((v) => ({
          version: v.version,
          label: `Version ${v.version}`,
          content: v.translations?.[lang]?.text || "",
          createdAt: v.approvedAt ? new Date(v.approvedAt).toLocaleString() : "",
        }))
      );
    } catch (e) {
      /* non-fatal */
    }
    await loadAudit(doc);

    if (onApprove) {
      onApprove(reviewerTranslation);
    }

  } catch (error) {

    setReviewEvents((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString(),
        message: `Approve failed: ${error.message || "unknown error"}`,
      },
    ]);

  }

};

// ==========================================
// Reject Translation
// ==========================================

const handleReject = async () => {

  if (!translationId) return;

  try {

    const doc = await translationService.rejectTranslation(
      translationId,
      reviewerComments
    );

    setTranslationDoc(doc);
    setReviewStage("Draft");

    await loadAudit(doc);

  } catch (error) {

    setReviewEvents((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString(),
        message: `Reject failed: ${error.message || "unknown error"}`,
      },
    ]);

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
      message: "Reviewer requested another review cycle",
    },
  ]);

};

  if (isLoading) {
    return <div style={{ marginTop: "40px" }}>Loading translation…</div>;
  }

  if (loadError) {
    return (
      <div
        style={{
          marginTop: "40px",
          padding: "20px",
          borderRadius: "12px",
          background: "#FEF2F2",
          border: "1px solid #FCA5A5",
          color: "#991B1B",
        }}
      >
        {loadError}
      </div>
    );
  }

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
    title="Words"
    value={
      originalText
        ? originalText.trim().split(/\s+/).length
        : 0
    }
    color="#3B82F6"
  />

  <StatCard
    title="Languages"
    value={`EN to ${(lang || "").toUpperCase()}`}
    color="#8B5CF6"
  />

  <StatCard
    title="Quality Score"
    value={
      typeof qualityScore === "number"
        ? `${Math.round(qualityScore * 100)}%${isLowConfidence ? " (Low)" : ""}`
        : "Pending"
    }
    color={isLowConfidence ? "#EF4444" : "#10B981"}
  />

  <StatCard
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
          Human Review Workspace
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
      handleImproveWithAI={() => {}}
      isImproving={false}
      aiRefineDisabled={true}
      aiRefineMessage="AI refinement is not yet available."
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
      onApprove={handleApprove}
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


              {/* ========================================== */}
      {/* Translation Confidence */}
      {/* ========================================== */}

      <TranslationConfidence
        reviewerComments={reviewerComments}
        reviewStage={reviewStage}
        qualityScore={qualityScore}
      />


<ReviewAnalytics
  translationVersions={translationVersions}
  reviewEvents={reviewEvents}
  reviewStage={reviewStage}
  confidence={
    typeof qualityScore === "number" ? Math.round(qualityScore * 100) : 0
  }
/>


<ReviewApprovalBar
  reviewStage={reviewStage}
  onApprove={handleApprove}
  onReject={handleReject}
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