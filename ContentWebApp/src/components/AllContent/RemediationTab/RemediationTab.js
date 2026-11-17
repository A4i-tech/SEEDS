import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRemediationJobs } from "../../../hooks/useRemediationJobs";
import { textbookRemediationService } from "../../../services/textbookRemediationService";
import MiddleEllipsis from "../shared/MiddleEllipsis";
import RowActions from "../shared/RowActions";
import Select from "../shared/Select";
import { StageProgress } from "./StageProgress";
import BookOrganiser, { sortByName } from "./BookOrganiser";
import { SyncAllProgress } from "../shared/SyncAllProgress";
import { ARTIFACT_DOWNLOADS, artifactFilename } from "../../artifactDownloads";
import { JOB_STATUS } from "../../../utils/remediationStatus";
import { MAX_REMEDIATION_PDF_MB } from "../../../Constants";
import "./RemediationTab.css";
import "../shared/cards.css";
import "../shared/buttons.css";
import "../shared/tables.css";

const ARTIFACT_LABELS = {
  docx: "Word",
  pdf: "PDF",
  tex: "LaTeX",
  translated_docx: "Word (translated)",
  translated_pdf: "PDF (translated)",
  translated_tex: "LaTeX (translated)",
};

const BYTES_PER_MB = 1024 * 1024;
const BOOK_ARTIFACTS = ARTIFACT_DOWNLOADS.filter((entry) => !entry.key.startsWith("translated_"));

const chaptersLabel = (count) => `${count} chapter${count === 1 ? "" : "s"}`;

const bookStatus = (chapters, chapterCount) => {
  if (chapters.some((job) => job.status === JOB_STATUS.FAILED)) return JOB_STATUS.FAILED;
  if (chapters.some((job) => job.status === JOB_STATUS.PENDING || job.status === JOB_STATUS.RUNNING)) {
    return JOB_STATUS.RUNNING;
  }
  if (chapters.length === chapterCount && chapters.every((job) => job.status === JOB_STATUS.VERIFIED)) {
    return JOB_STATUS.VERIFIED;
  }
  return JOB_STATUS.IN_REVIEW;
};

const guessBookTitle = (fileName) =>
  fileName
    .replace(/\.pdf$/i, "")
    .replace(/[_-]?(unit|chapter|ch)[_-]?\d.*$/i, "")
    .replace(/_/g, " ")
    .trim() || "Untitled book";

const LanguageCell = ({ detected, language }) =>
  detected ? (
    <span style={{ fontWeight: 600, color: "var(--color-fg-default)" }}>{detected}</span>
  ) : language === "auto" || language === "detecting" ? (
    <span className="remediation-status">Detecting…</span>
  ) : (
    <span style={{ fontWeight: 600 }}>{language}</span>
  );

const JobRow = ({ job, position, onEdit, onRemove }) => (
  <tr className={position ? "book-child-row" : undefined}>
    <td className="table-cell table-cell-truncate">
      {position ? (
        <div className="book-title-cell">
          <span className="book-position">
            <span className="book-sr-only">Chapter </span>
            {position}
          </span>
          <div className="book-title-text">
            <MiddleEllipsis text={job.source_name} />
          </div>
        </div>
      ) : (
        <MiddleEllipsis text={job.source_name} />
      )}
    </td>
    <td className="table-cell">
      {ARTIFACT_DOWNLOADS.some((entry) => job.artifacts[entry.key]) ? (
        <div className="action-buttons-wrapper">
          {ARTIFACT_DOWNLOADS.map(
            (entry) =>
              job.artifacts[entry.key] && (
                <button
                  key={entry.key}
                  type="button"
                  className="remediation-link"
                  onClick={() =>
                    textbookRemediationService.downloadArtifact(job.job_id, entry.key, artifactFilename(job, entry))
                  }
                >
                  {ARTIFACT_LABELS[entry.key]}
                </button>
              )
          )}
        </div>
      ) : (
        <span className="table-cell-secondary">—</span>
      )}
    </td>
    <td className="table-cell">
      <LanguageCell detected={job.detected_language} language={job.language} />
      {job.translation_error && <div className="content-details-error">{job.translation_error}</div>}
    </td>
    <td className="table-cell">
      <StageProgress job={job} />
    </td>
    <td className="table-cell">
      <span className={`remediation-status remediation-status-${job.status}`}>{job.status}</span>
      {job.error && <div className="table-cell-secondary">{job.error}</div>}
    </td>
    <td className="table-cell">
      <RowActions
        actions={[
          ...(job.status !== JOB_STATUS.RUNNING && job.status !== JOB_STATUS.FAILED
            ? [{ key: "edit", label: "Edit", variant: "edit", onClick: () => onEdit(job.job_id) }]
            : []),
          {
            key: "delete",
            label: "Delete",
            variant: "delete",
            onClick: () => {
              if (window.confirm(`Delete "${job.source_name}"?`)) onRemove(job.job_id);
            },
          },
        ]}
      />
    </td>
  </tr>
);

const BookRows = ({ book, chapters, expanded, onToggle, onReorder, onDelete, onDownload, onEdit, onRemoveJob }) => {
  const chapterCount = book.job_ids.length;
  const verified = chapters.filter((job) => job.status === JOB_STATUS.VERIFIED).length;
  const allVerified = chapterCount > 0 && verified === chapterCount;
  const status = bookStatus(chapters, chapterCount);
  const whyId = `book-why-${book.book_id}`;
  return (
    <>
      <tr className="book-parent-row">
        <td className="table-cell table-cell-truncate">
          <div className="book-title-cell">
            <button
              type="button"
              className="book-chevron"
              aria-expanded={expanded}
              aria-label={`Chapters of ${book.title}`}
              onClick={onToggle}
            >
              {expanded ? "▾" : "▸"}
            </button>
            <div className="book-title-text">
              <MiddleEllipsis text={book.title} />
              <div className="table-cell-secondary">
                <span className="book-tag">Book</span> {chaptersLabel(chapterCount)}
              </div>
            </div>
          </div>
        </td>
        <td className="table-cell">
          <div className="action-buttons-wrapper">
            {BOOK_ARTIFACTS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className="remediation-link book-link-disabled"
                disabled={!allVerified}
                aria-describedby={allVerified ? undefined : whyId}
                onClick={() => onDownload(entry)}
              >
                {ARTIFACT_LABELS[entry.key]}
              </button>
            ))}
          </div>
          {!allVerified && (
            <div className="table-cell-secondary" id={whyId}>
              Available when all {chaptersLabel(chapterCount)} are verified
            </div>
          )}
        </td>
        <td className="table-cell">
          <LanguageCell
            detected={chapters.find((job) => job.detected_language)?.detected_language}
            language={book.language}
          />
        </td>
        <td className="table-cell">
          <span className={`remediation-status${allVerified ? " remediation-status-verified" : ""}`}>
            {verified} of {chapterCount} verified
          </span>
          <div
            className="book-progress"
            role="progressbar"
            aria-label={`Chapters verified in ${book.title}`}
            aria-valuemin={0}
            aria-valuemax={chapterCount}
            aria-valuenow={verified}
          >
            <span style={{ width: `${(verified / chapterCount) * 100}%` }} />
          </div>
        </td>
        <td className="table-cell">
          <span className={`remediation-status remediation-status-${status}`}>{status}</span>
        </td>
        <td className="table-cell">
          <RowActions
            actions={[
              { key: "reorder", label: "Reorder", variant: "edit", onClick: onReorder },
              { key: "delete", label: "Delete", variant: "delete", onClick: onDelete },
            ]}
          />
        </td>
      </tr>
      {expanded &&
        chapters.map((job, index) => (
          <JobRow key={job.job_id} job={job} position={index + 1} onEdit={onEdit} onRemove={onRemoveJob} />
        ))}
    </>
  );
};

const RemediationTab = () => {
  const navigate = useNavigate();
  const { jobs, books, isLoading, isUploading, error, upload, uploadBook, remove, removeBook, reorderBook } =
    useRemediationJobs();
  const fileRef = useRef(null);
  const chooseButtonRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [bookItems, setBookItems] = useState([]);
  const [bookTitle, setBookTitle] = useState("");
  const [reorder, setReorder] = useState(null);
  const [collapsedBooks, setCollapsedBooks] = useState([]);
  const [downloadError, setDownloadError] = useState(null);
  const [targetLanguage, setTargetLanguage] = useState("");
  const [targetLanguageOptions, setTargetLanguageOptions] = useState([{ value: "", label: "Keep original language" }]);
  const [languagesError, setLanguagesError] = useState(null);
  const [fileError, setFileError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    textbookRemediationService
      .getLanguages({ signal: controller.signal })
      .then(({ languages }) => {
        setTargetLanguageOptions([
          { value: "", label: "Keep original language" },
          ...languages.map((lang) => ({ value: lang.code, label: lang.name })),
        ]);
      })
      .catch((languagesErr) => {
        if (!controller.signal.aborted) setLanguagesError(languagesErr.message);
      });
    return () => controller.abort();
  }, []);

  const chooseSingle = (file) => {
    setBookItems([]);
    const sizeMb = file.size / BYTES_PER_MB;
    if (sizeMb > MAX_REMEDIATION_PDF_MB) {
      setSelectedFile(null);
      setFileError(
        `${file.name} is ${sizeMb.toFixed(1)} MB. The limit is ${MAX_REMEDIATION_PDF_MB} MB. Split the book into chapter PDFs or compress the file, then choose it again.`
      );
      return;
    }
    setFileError(null);
    setSelectedFile(file);
  };

  const handleFile = (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    if (files.length === 0) return;
    if (files.length === 1) {
      chooseSingle(files[0]);
      return;
    }
    const items = sortByName(
      files.map((file, index) => ({
        id: `${index}:${file.name}`,
        name: file.name,
        sizeMb: file.size / BYTES_PER_MB,
        file,
      }))
    );
    setSelectedFile(null);
    setFileError(null);
    setBookItems(items);
    setBookTitle(guessBookTitle(items[0].name));
  };

  const handleBookItems = (items) => {
    if (items.length === 1) {
      chooseSingle(items[0].file);
      // The organiser unmounts here, so focus would fall to the page body.
      chooseButtonRef.current.focus();
    } else setBookItems(items);
  };

  const isBook = bookItems.length > 1;
  const overLimitCount = bookItems.filter((item) => item.sizeMb > MAX_REMEDIATION_PDF_MB).length;
  const canUpload = isBook ? overLimitCount === 0 && bookTitle.trim() !== "" : selectedFile !== null;

  const handleUpload = async () => {
    if (isBook) {
      const uploaded = await uploadBook(
        bookItems.map((item) => item.file),
        { title: bookTitle.trim(), language: "auto", targetLanguage }
      );
      if (uploaded) setBookItems([]);
      return;
    }
    await upload(selectedFile, "auto", { targetLanguage });
    setSelectedFile(null);
  };

  const startReorder = (book, chapters) =>
    setReorder({
      bookId: book.book_id,
      title: book.title,
      items: chapters.map((job) => ({ id: job.job_id, name: job.source_name, pages: job.source_page_count })),
    });

  const saveReorder = async () => {
    const saved = await reorderBook(
      reorder.bookId,
      reorder.items.map((item) => item.id)
    );
    if (saved) setReorder(null);
  };

  const toggleBook = (bookId) =>
    setCollapsedBooks((previous) =>
      previous.includes(bookId) ? previous.filter((id) => id !== bookId) : [...previous, bookId]
    );

  const downloadBook = async (book, entry) => {
    setDownloadError(null);
    try {
      await textbookRemediationService.downloadBookArtifact(
        book.book_id,
        entry.key,
        artifactFilename({ source_name: book.title }, entry)
      );
    } catch (downloadFailure) {
      setDownloadError(
        `Could not download "${book.title}" as ${ARTIFACT_LABELS[entry.key]}. ${downloadFailure.message}`
      );
    }
  };

  const jobById = Object.fromEntries(jobs.map((job) => [job.job_id, job]));
  const newestFirst = [...books].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const singleJobs = jobs.filter((job) => !job.book_id);
  const editJob = (jobId) => navigate(`/content/remediation/${jobId}`);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Textbook Remediation</div>
          <div className="card-description">
            PDF to an accessible Word document: OCR, then a reviewed Markdown, then the .docx
          </div>
        </div>
      </div>

      {reorder ? (
        <div className="registration-card" style={{ alignItems: "center", marginBottom: "16px" }}>
          <div className="registration-title" style={{ textAlign: "center", textTransform: "uppercase" }}>
            Reorder book
          </div>
          <div className="table-cell-secondary">{reorder.title}</div>
          <BookOrganiser items={reorder.items} onChange={(items) => setReorder({ ...reorder, items })} />
          <div className="action-buttons-wrapper" style={{ justifyContent: "center" }}>
            <button type="button" className="action-ghost-button" onClick={() => setReorder(null)}>
              Cancel
            </button>
            <button type="button" className="primary-button" onClick={saveReorder}>
              Save order
            </button>
          </div>
        </div>
      ) : (
        <div className="registration-card" style={{ alignItems: "center", marginBottom: "16px" }}>
          <div className="registration-title" style={{ textAlign: "center", textTransform: "uppercase" }}>
            Upload Textbook
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
            <span style={{ fontWeight: 600 }}>
              Textbook PDFs <span style={{ color: "var(--color-danger-dot)" }}>*</span>
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              multiple
              onChange={handleFile}
              style={{ display: "none" }}
            />
            <button
              ref={chooseButtonRef}
              type="button"
              className="action-ghost-button"
              onClick={() => fileRef.current.click()}
            >
              Choose PDF files
            </button>
            {selectedFile && <span className="table-cell-secondary">{selectedFile.name}</span>}
            <Select
              id="remediation-target-language"
              value={targetLanguage}
              onChange={setTargetLanguage}
              options={targetLanguageOptions}
              placeholder="Keep original language"
            />
            {languagesError && <span className="content-details-error">Could not load languages: {languagesError}</span>}
            <button
              type="button"
              className="primary-button"
              disabled={!canUpload || isUploading}
              onClick={handleUpload}
            >
              {isUploading ? "Uploading…" : isBook ? `Upload ${bookItems.length} PDFs as one book` : "Upload textbook"}
            </button>
            <SyncAllProgress
              syncingAll={isUploading}
              syncAllProgress={isUploading ? {} : null}
              indeterminateLabel="Uploading textbook…"
            />
          </div>
          {isBook && (
            <>
              <BookOrganiser items={bookItems} onChange={handleBookItems} onSort={handleBookItems} allowRemove />
              <div className="book-title-field">
                <label htmlFor="remediation-book-title" className="label">
                  Book name
                </label>
                <input
                  id="remediation-book-title"
                  type="text"
                  value={bookTitle}
                  onChange={(event) => setBookTitle(event.target.value)}
                />
              </div>
              {overLimitCount > 0 && (
                <p className="content-details-error" role="alert">
                  Upload is blocked. Remove or compress every file marked over the {MAX_REMEDIATION_PDF_MB} MB limit,
                  then upload.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {fileError && <p className="content-details-error">{fileError}</p>}
      {error && <p className="content-details-error">Error: {error}</p>}
      {downloadError && <p className="content-details-error">{downloadError}</p>}
      {isLoading && jobs.length === 0 && <p className="table-cell-secondary">Loading…</p>}
      {!isLoading && jobs.length === 0 && books.length === 0 && (
        <p className="table-cell-secondary">No textbooks queued yet.</p>
      )}

      {(jobs.length > 0 || books.length > 0) && (
        <div className="table-wrapper">
          <table className="content-table">
            <thead>
              <tr>
                <th className="table-header">Textbook</th>
                <th className="table-header">Artifacts</th>
                <th className="table-header">Language</th>
                <th className="table-header">Stage</th>
                <th className="table-header">Status</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {newestFirst.map((book) => {
                // The job list is capped, so a chapter can be missing from it.
                const chapters = book.job_ids.map((id) => jobById[id]).filter(Boolean);
                return (
                  <BookRows
                    key={book.book_id}
                    book={book}
                    chapters={chapters}
                    expanded={!collapsedBooks.includes(book.book_id)}
                    onToggle={() => toggleBook(book.book_id)}
                    onReorder={() => startReorder(book, chapters)}
                    onDelete={() => {
                      if (window.confirm(`Delete the book "${book.title}" and its ${chaptersLabel(book.job_ids.length)}?`)) {
                        removeBook(book.book_id);
                      }
                    }}
                    onDownload={(entry) => downloadBook(book, entry)}
                    onEdit={editJob}
                    onRemoveJob={remove}
                  />
                );
              })}
              {singleJobs.map((job) => (
                <JobRow key={job.job_id} job={job} onEdit={editJob} onRemove={remove} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default RemediationTab;
