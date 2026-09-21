import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeKatex from "rehype-katex";

import { remediationSanitizeSchema } from "./remediationSanitizeSchema";

export const remediationRemarkPlugins = [remarkGfm, remarkMath];
export const remediationRehypePlugins = [
  rehypeRaw,
  [rehypeSanitize, remediationSanitizeSchema],
  rehypeKatex,
];
