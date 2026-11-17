export const ARTIFACT_DOWNLOADS = [
  { key: 'docx', ext: 'docx' },
  { key: 'pdf', ext: 'pdf' },
  { key: 'tex', ext: 'tex' },
  { key: 'translated_docx', ext: 'translated.docx' },
  { key: 'translated_pdf', ext: 'translated.pdf' },
  { key: 'translated_tex', ext: 'translated.tex' },
] as const;

export type ArtifactDownload = (typeof ARTIFACT_DOWNLOADS)[number];

export const availableDownloads = (artifacts: Record<string, string>) =>
  ARTIFACT_DOWNLOADS.filter((entry) => artifacts[entry.key]);

export const artifactFilename = (sourceName: string, entry: ArtifactDownload) =>
  `${sourceName.replace(/\.pdf$/i, '')}.${entry.ext}`;
