import React, { useState } from "react";
import { contentAggregatorService } from "../../services/contentAggregatorService";
import { MathText } from "./katexMath";

export function MultipleChoiceProblem({ block, courseId, onBlockChange }) {
  // question/choices are extracted server-side at sync time (or by a prior
  // edit) — the block itself carries them, no client-side HTML parsing needed.
  const current = block.question && block.choices?.length ? { question: block.question, choices: block.choices } : null;

  const [editing, setEditing] = useState(false);
  const [questionDraft, setQuestionDraft] = useState("");
  const [choiceDrafts, setChoiceDrafts] = useState([]);
  const [saving, setSaving] = useState(false);

  if (!current) {
    return (
      <p className="table-cell-secondary">
        This is an interactive exercise — open it in Subodha to attempt it.
      </p>
    );
  }

  const startEdit = () => {
    setQuestionDraft(current.question);
    setChoiceDrafts(current.choices.map((c) => c.text));
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const updatedChoices = current.choices.map((c, i) => ({ value: c.value, text: choiceDrafts[i] }));
    try {
      await contentAggregatorService.updateProblemBlock(courseId, block.block_id, {
        question: questionDraft,
        choices: updatedChoices,
      });
      onBlockChange?.({ ...block, question: questionDraft, choices: updatedChoices });
      setEditing(false);
    } catch (err) {
      alert(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="content-aggregator-problem-edit">
        <label className="content-aggregator-problem-edit-label">
          Question
          <textarea
            className="content-aggregator-problem-edit-input"
            value={questionDraft}
            onChange={(e) => setQuestionDraft(e.target.value)}
          />
        </label>
        {choiceDrafts.map((text, i) => (
          <label key={current.choices[i].value} className="content-aggregator-problem-edit-label">
            {`Choice ${i + 1}`}
            <input
              className="content-aggregator-problem-edit-input"
              value={text}
              onChange={(e) => {
                const next = e.target.value;
                setChoiceDrafts((prev) => prev.map((t, idx) => (idx === i ? next : t)));
              }}
            />
          </label>
        ))}
        <div className="content-aggregator-problem-edit-actions">
          <button type="button" className="primary-button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="secondary-button" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="content-aggregator-problem-view">
      <p className="content-aggregator-problem-question">
        <MathText text={current.question} />
      </p>
      <ul className="content-aggregator-problem-choice-list">
        {current.choices.map((choice) => (
          <li key={choice.value}>
            <MathText text={choice.text} />
          </li>
        ))}
      </ul>
      <button type="button" className="secondary-button content-aggregator-block-header-action" onClick={startEdit}>
        Edit
      </button>
    </div>
  );
}
