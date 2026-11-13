export const ARTIFACT_DOWNLOADS = [
  { key: "docx", ext: "docx" },
  { key: "pdf", ext: "pdf" },
  { key: "tex", ext: "tex" },
  { key: "translated_docx", ext: "translated.docx" },
  { key: "translated_pdf", ext: "translated.pdf" },
  { key: "translated_tex", ext: "translated.tex" },
];

export const artifactFilename = (job, entry) =>
  `${job.source_name.replace(/\.pdf$/i, "")}.${entry.ext}`;
