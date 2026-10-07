import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import { quizCreateSchema } from '../../library/types/content.types';
import type { QuizCreate } from '../../library/types/content.types';

const jobScheduledSchema = z.object({
  message: z.string(),
  job_id: z.string(),
});

export async function createQuiz(payload: QuizCreate) {
  const parsed = quizCreateSchema.parse(payload);
  const { data } = await apiClient.post('/content/quiz', parsed);
  return jobScheduledSchema.parse(data);
}
