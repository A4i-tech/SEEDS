import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import { textbookRemediationService } from "../services/textbookRemediationService";
import { normalizeMathDelimiters, MarkdownParagraph } from "./ContentAggregatorDetails/markdownMath";
import { useBlobObjectUrl } from "./useBlobObjectUrl";
import { remediationRemarkPlugins, remediationRehypePlugins } from "./remediationMarkdown";

export function RemediationFigureImage({ src, jobId, alt }) {
  const [imgError, setImgError] = useState(false);
  const remote = src && !src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("data:");
  const imageName = src ? src.replace(/^images\//, "") : "";

  const { url: objectUrl, error: loadError } = useBlobObjectUrl(
    remote ? (signal) => textbookRemediationService.getImage(jobId, imageName, { signal }) : null,
    [remote, jobId, src, imageName]
  );
  useEffect(() => {
    if (loadError) {
      console.error("Failed to load remediation figure image", loadError);
      setImgError(true);
    }
  }, [loadError]);

  const imgSrc = remote ? objectUrl : src;
  if (imgError) {
    return <span className="remediation-figure-broken">Image {imageName} is corrupted</span>;
  }
  if (!imgSrc) return null;
  return (
    <img
      src={imgSrc}
      alt={alt || "Image description unavailable"}
      onError={() => setImgError(true)}
    />
  );
}

export function MarkdownViewer({ text, jobId }) {
  return (
    <ReactMarkdown
      remarkPlugins={remediationRemarkPlugins}
      rehypePlugins={remediationRehypePlugins}
      components={{
        p: MarkdownParagraph,
        img: ({ src, alt, title }) => {
          const description = title || alt;

          return (
            <div className="remediation-figure-preview">
              <RemediationFigureImage src={src} jobId={jobId} alt={alt} />
              {description && (
                <div className="remediation-figure-text">
                  <span className="remediation-figure-tag">Figure Description</span>
                  <span className="remediation-figure-desc">{description}</span>
                </div>
              )}
            </div>
          );
        },
      }}
    >
      {normalizeMathDelimiters(text)}
    </ReactMarkdown>
  );
}
