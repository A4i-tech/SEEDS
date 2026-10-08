import { Alert, Anchor, Button, Group, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toApiErrorMessage } from '@shared/utils/apiErrors';
import { updateProblemBlock } from '../api/library';
import type { CourseBlock, CourseDetail } from '../api/library';
import { libraryKeys } from '../types/content.types';

export function ProblemBlock({ block, courseId }: { block: CourseBlock; courseId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, { open: startEditing, close: stopEditing }] = useDisclosure(false);
  const form = useForm({ initialValues: { question: '', choices: [] as string[] } });

  const save = useMutation({
    mutationFn: ({ question, choices }: typeof form.values) =>
      updateProblemBlock(courseId, block.block_id, {
        question,
        choices: block.choices.map((c, i) => ({ value: c.value, text: choices[i] })),
      }),
    onSuccess: (_, { question, choices }) => {
      queryClient.setQueryData<CourseDetail>(
        libraryKeys.courseDetail(courseId),
        (prev) =>
          prev && {
            ...prev,
            blocks: prev.blocks.map((b) => {
              if (b.block_id !== block.block_id) return b;
              return { ...b, question, choices: b.choices.map((c, i) => ({ ...c, text: choices[i] })) };
            }),
          },
      );
      stopEditing();
    },
  });
  const saveError = toApiErrorMessage(save.error);

  if (!block.question || !block.choices.length) {
    return <Text c="dimmed">{t('library.blockNoPreview')}</Text>;
  }

  if (!editing) {
    return (
      <Stack gap="xs">
        <Text fw={700}>{block.question}</Text>
        {block.choices.map((c) => (
          <Text key={c.value} size="sm" c="dimmed">
            {c.text}
          </Text>
        ))}
        <Group gap="xs">
          <Anchor
            component="button"
            type="button"
            fw={700}
            onClick={() => {
              form.setValues({ question: block.question, choices: block.choices.map((c) => c.text) });
              save.reset();
              startEditing();
            }}
          >
            {t('library.edit')}
          </Anchor>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="xs">
      <Textarea label={t('library.questionLabel')} {...form.getInputProps('question')} />
      {form.values.choices.map((_, i) => (
        <TextInput
          key={block.choices[i].value}
          label={t('library.choiceN', { n: i + 1 })}
          {...form.getInputProps(`choices.${i}`)}
        />
      ))}
      {saveError && <Alert>{saveError}</Alert>}
      <Group gap="xs">
        <Button loading={save.isPending} onClick={() => save.mutate(form.values)}>
          {t('library.save')}
        </Button>
        <Button variant="subtle" onClick={stopEditing}>
          {t('dialog.cancel')}
        </Button>
      </Group>
    </Stack>
  );
}
