import { Node } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { RichTextEditor } from '@mantine/tiptap';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { describeRaw, maskRaw, unmaskRaw } from '../utils/rawTokens';
import classes from './MarkdownEditor.module.css';

const TOKEN_AT_START = /^RAWTOKEN(\d+)END/;

function rawChip(label: (raw: string) => string, tokens: string[]) {
  return Node.create({
    name: 'raw',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() {
      return { index: { default: 0 } };
    },
    parseHTML() {
      return [{ tag: 'span[data-raw]' }];
    },
    renderHTML({ node }) {
      const index = Number(node.attrs.index);
      return ['span', { 'data-raw': index, class: classes.chip }, label(tokens[index])];
    },
    markdownTokenizer: {
      name: 'raw',
      level: 'inline',
      start: (src: string) => src.indexOf('RAWTOKEN'),
      tokenize: (src: string) => {
        const match = TOKEN_AT_START.exec(src);
        return match ? { type: 'raw', raw: match[0], index: Number(match[1]) } : undefined;
      },
    },
    parseMarkdown: (token) => ({ type: 'raw', attrs: { index: token.index } }),
    renderMarkdown: (node) => `RAWTOKEN${node.attrs?.index}END`,
  });
}

export function MarkdownEditor({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (markdown: string) => void;
  ariaLabel: string;
}) {
  const { t } = useTranslation();
  const { text, tokens } = useMemo(() => maskRaw(value), []);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ underline: false, link: false }),
      Markdown,
      rawChip((raw) => {
        const { kind, page } = describeRaw(raw);
        return kind === 'char' ? raw : t(`review.chips.${kind}`, { page });
      }, tokens),
    ],
    content: text,
    contentType: 'markdown',
    onUpdate: ({ editor: current }) => onChange(unmaskRaw(current.getMarkdown(), tokens)),
    editorProps: { attributes: { 'aria-label': ariaLabel } },
  });

  return (
    <RichTextEditor
      editor={editor}
      labels={{
        boldControlLabel: t('review.toolbar.bold'),
        italicControlLabel: t('review.toolbar.italic'),
        h1ControlLabel: t('review.toolbar.h1'),
      }}
    >
      <RichTextEditor.Toolbar>
        <RichTextEditor.ControlsGroup>
          <RichTextEditor.Bold />
          <RichTextEditor.Italic />
          <RichTextEditor.H1 />
        </RichTextEditor.ControlsGroup>
      </RichTextEditor.Toolbar>
      <RichTextEditor.Content />
    </RichTextEditor>
  );
}
