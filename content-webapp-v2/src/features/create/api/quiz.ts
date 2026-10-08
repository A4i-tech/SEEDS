import { apiClient } from '@shared/services/apiClient';
import type { QuizCreate } from '../../library/types/content.types';

export async function createQuiz(payload: QuizCreate) {
  await apiClient.post('/content/quiz', payload);
}
