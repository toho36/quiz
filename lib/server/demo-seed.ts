import { authoringQuizDocumentSchema, type AuthoringQuizDocument } from '@/lib/shared/contracts';

const baseQuiz = authoringQuizDocumentSchema.parse({
  quiz: {
    quiz_id: 'quiz-1',
    owner_user_id: 'user-1',
    title: 'MVP Quiz',
    description: 'A published quiz fixture.',
    status: 'published',
    default_scoring_mode: 'speed_weighted',
    default_question_time_limit_seconds: 30,
    shuffle_answers_default: true,
    created_at: '2026-03-06T10:00:00.000Z',
    updated_at: '2026-03-06T10:00:00.000Z',
    published_at: '2026-03-06T10:00:00.000Z',
  },
  questions: [
    {
      question: {
        question_id: 'question-1',
        quiz_id: 'quiz-1',
        position: 1,
        prompt: 'What is 2 + 2?',
        question_type: 'single_choice',
        evaluation_policy: 'exact_match',
        base_points: 100,
        time_limit_seconds: 20,
        shuffle_answers: true,
        created_at: '2026-03-06T10:00:00.000Z',
        updated_at: '2026-03-06T10:00:00.000Z',
      },
      options: [
        { option_id: 'option-1', question_id: 'question-1', position: 1, text: '4', is_correct: true },
        { option_id: 'option-2', question_id: 'question-1', position: 2, text: '5', is_correct: false },
      ],
    },
    {
      question: {
        question_id: 'question-2',
        quiz_id: 'quiz-1',
        position: 2,
        prompt: 'Select prime numbers.',
        question_type: 'multiple_choice',
        evaluation_policy: 'exact_match',
        base_points: 200,
        time_limit_seconds: 25,
        shuffle_answers: false,
        created_at: '2026-03-06T10:00:00.000Z',
        updated_at: '2026-03-06T10:00:00.000Z',
      },
      options: [
        { option_id: 'option-3', question_id: 'question-2', position: 1, text: '2', is_correct: true },
        { option_id: 'option-4', question_id: 'question-2', position: 2, text: '3', is_correct: true },
        { option_id: 'option-5', question_id: 'question-2', position: 3, text: '4', is_correct: false },
      ],
    },
  ],
});

export function createDemoSeedQuizDocuments(): AuthoringQuizDocument[] {
  const draftQuiz = authoringQuizDocumentSchema.parse({
    ...structuredClone(baseQuiz),
    quiz: {
      ...baseQuiz.quiz,
      quiz_id: 'quiz-2',
      title: 'Draft onboarding quiz',
      description: 'Use this draft to exercise the guarded authoring and publish flow.',
      status: 'draft',
      updated_at: '2026-03-06T11:00:00.000Z',
      published_at: undefined,
    },
    questions: baseQuiz.questions.map((entry, index) => ({
      question: {
        ...entry.question,
        quiz_id: 'quiz-2',
        question_id: `draft-question-${index + 1}`,
      },
      options: entry.options.map((option, optionIndex) => ({
        ...option,
        question_id: `draft-question-${index + 1}`,
        option_id: `draft-option-${index + 1}-${optionIndex + 1}`,
      })),
    })),
  });

  return [draftQuiz, structuredClone(baseQuiz)];
}