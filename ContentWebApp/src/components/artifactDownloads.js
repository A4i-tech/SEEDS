export const ARTIFACT_DOWNLOADS = [
  { key: "docx", label: "Word", downloadLabel: "Download Word", ext: "docx" },
  { key: "pdf", label: "PDF", downloadLabel: "Download PDF", ext: "pdf" },
  { key: "tex", label: "LaTeX", downloadLabel: "Download LaTeX", ext: "tex" },
  { key: "translated_docx", label: "Word (translated)", downloadLabel: "Download translated Word", ext: "translated.docx" },
  { key: "translated_pdf", label: "PDF (translated)", downloadLabel: "Download translated PDF", ext: "translated.pdf" },
  { key: "translated_tex", label: "LaTeX (translated)", downloadLabel: "Download translated LaTeX", ext: "translated.tex" },
  { key: "brf", label: "BRF", downloadLabel: "Download BRF", ext: "brf" },
  { key: "braille_report", label: "Braille report", downloadLabel: "Download Braille report", ext: "braille.json" },
];

export const artifactFilename = (job, entry) =>
  `${job.source_name.replace(/\.pdf$/i, "")}.${entry.ext}`;
