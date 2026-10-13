import { useMutation } from '@tanstack/react-query';
import { createQuiz } from '../api/quiz';
import { useCreateMutationOptions } from './useCreateMutationOptions';

export function useCreateQuiz() {
  return useMutation({
    mutationFn: createQuiz,
    ...useCreateMutationOptions('create.quizSaved', '/library'),
  });
}
