import AddQuiz from "./AddQuiz";
import AddStory from "./AddStory";
import AddBraille from "./AddBraille";

export const CONTENT_TYPE_OPTIONS = [
  { value: "Story", label: "Story" },
  { value: "Poem", label: "Poem" },
  { value: "Song", label: "Song" },
  { value: "Snippet", label: "Snippet" },
  { value: "quiz", label: "Quiz" },
  { value: "brf", label: "Braille (BRF)" },
];

export function renderContentEditor(type, content) {
  if (type === "quiz") return <AddQuiz quiz={content} />;
  if (type === "brf") return <AddBraille content={content} />;
  return <AddStory content={content} contentType={type} />;
}
