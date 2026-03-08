import { randomUUID } from 'node:crypto';
import { NotFoundError } from '@/lib/server/service-errors';
import type { AuthoringQuizDocument } from '@/lib/shared/contracts';

type QuestionEntry = AuthoringQuizDocument['questions'][number];

export type QuestionDirection = 'up' | 'down';

export type SaveQuestionDocumentInput = {
  questionId: string;
  prompt: string;
  questionType: QuestionEntry['question']['question_type'];
  basePoints: number;
  timeLimitSeconds?: number;
  shuffleAnswers?: boolean;
  options: Array<{
    optionId: string;
    text: string;
    isCorrect: boolean;
  }>;
};

function sortQuestions(document: AuthoringQuizDocument) {
  return document.questions.slice().sort((left, right) => left.question.position - right.question.position);
}

function sortOptions(entry: QuestionEntry) {
  return entry.options.slice().sort((left, right) => left.position - right.position);
}

function moveItem<T>(items: T[], index: number, direction: QuestionDirection) {
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }

  const nextItems = items.slice();
  const [item] = nextItems.splice(index, 1);
  nextItems.splice(targetIndex, 0, item);
  return nextItems;
}

function normalizeOptions(options: QuestionEntry['options'], questionId: string): QuestionEntry['options'] {
  return options.map((option, index) => ({
    ...option,
    question_id: questionId,
    position: index + 1,
  }));
}

function normalizeQuestions(
  questions: AuthoringQuizDocument['questions'],
  now: string,
  touchQuestionTimestamps: boolean,
): AuthoringQuizDocument['questions'] {
  return questions.map((entry, index) => ({
    question: {
      ...entry.question,
      position: index + 1,
      updated_at: touchQuestionTimestamps ? now : entry.question.updated_at,
    },
    options: normalizeOptions(entry.options, entry.question.question_id),
  }));
}

export function addQuestionToQuizDocument(current: AuthoringQuizDocument, now: string): AuthoringQuizDocument {
  const questionId = `question-${randomUUID()}`;
  const optionOneId = `option-${randomUUID()}`;
  const optionTwoId = `option-${randomUUID()}`;
  const nextPosition = current.questions.length + 1;

  return {
    ...current,
    questions: normalizeQuestions(
      current.questions.concat({
        question: {
          question_id: questionId,
          quiz_id: current.quiz.quiz_id,
          position: nextPosition,
          prompt: `Question ${nextPosition}`,
          question_type: 'single_choice',
          evaluation_policy: 'exact_match',
          base_points: 100,
          time_limit_seconds: current.quiz.default_question_time_limit_seconds,
          shuffle_answers: current.quiz.shuffle_answers_default,
          created_at: now,
          updated_at: now,
        },
        options: [
          { option_id: optionOneId, question_id: questionId, position: 1, text: 'Option 1', is_correct: true },
          { option_id: optionTwoId, question_id: questionId, position: 2, text: 'Option 2', is_correct: false },
        ],
      }),
      now,
      true,
    ),
  };
}

export function saveQuestionInQuizDocument(
  current: AuthoringQuizDocument,
  now: string,
  input: SaveQuestionDocumentInput,
): AuthoringQuizDocument {
  const existing = current.questions.find((entry) => entry.question.question_id === input.questionId);
  if (!existing) {
    throw new NotFoundError(`Question ${input.questionId} was not found`);
  }

  const nextOptions = input.options.map((option, index) => {
    const existingOption = existing.options.find((entry) => entry.option_id === option.optionId);
    if (!existingOption) {
      throw new NotFoundError(`Option ${option.optionId} was not found`);
    }

    return {
      ...existingOption,
      question_id: input.questionId,
      position: index + 1,
      text: option.text.trim(),
      is_correct: option.isCorrect,
    };
  });

  return {
    ...current,
    questions: normalizeQuestions(
      current.questions.map((entry) =>
        entry.question.question_id === input.questionId
          ? {
              question: {
                ...entry.question,
                prompt: input.prompt.trim(),
                question_type: input.questionType,
                evaluation_policy: 'exact_match',
                base_points: input.basePoints,
                time_limit_seconds: input.timeLimitSeconds,
                shuffle_answers: input.shuffleAnswers,
                updated_at: now,
              },
              options: normalizeOptions(nextOptions, input.questionId),
            }
          : entry,
      ),
      now,
      false,
    ),
  };
}

export function moveQuestionInQuizDocument(
  current: AuthoringQuizDocument,
  now: string,
  questionId: string,
  direction: QuestionDirection,
): AuthoringQuizDocument {
  const orderedQuestions = sortQuestions(current);
  const currentIndex = orderedQuestions.findIndex((entry) => entry.question.question_id === questionId);
  if (currentIndex === -1) {
    throw new NotFoundError(`Question ${questionId} was not found`);
  }

  return {
    ...current,
    questions: normalizeQuestions(moveItem(orderedQuestions, currentIndex, direction), now, true),
  };
}

export function deleteQuestionFromQuizDocument(current: AuthoringQuizDocument, now: string, questionId: string) {
  const nextQuestions = current.questions.filter((entry) => entry.question.question_id !== questionId);
  if (nextQuestions.length === current.questions.length) {
    throw new NotFoundError(`Question ${questionId} was not found`);
  }

  return {
    ...current,
    questions: normalizeQuestions(nextQuestions, now, true),
  };
}

export function addOptionToQuizDocument(current: AuthoringQuizDocument, now: string, questionId: string) {
  const targetQuestion = current.questions.find((entry) => entry.question.question_id === questionId);
  if (!targetQuestion) {
    throw new NotFoundError(`Question ${questionId} was not found`);
  }

  return {
    ...current,
    questions: normalizeQuestions(
      current.questions.map((entry) => {
        if (entry.question.question_id !== questionId) {
          return entry;
        }

        const orderedOptions = sortOptions(entry);
        const nextOptions = orderedOptions.concat({
          option_id: `option-${randomUUID()}`,
          question_id: questionId,
          position: orderedOptions.length + 1,
          text: `Option ${orderedOptions.length + 1}`,
          is_correct: false,
        });

        return {
          question: {
            ...entry.question,
            updated_at: now,
          },
          options: normalizeOptions(nextOptions, questionId),
        };
      }),
      now,
      false,
    ),
  };
}

export function moveOptionInQuizDocument(
  current: AuthoringQuizDocument,
  now: string,
  questionId: string,
  optionId: string,
  direction: QuestionDirection,
): AuthoringQuizDocument {
  const targetQuestion = current.questions.find((entry) => entry.question.question_id === questionId);
  if (!targetQuestion) {
    throw new NotFoundError(`Question ${questionId} was not found`);
  }

  return {
    ...current,
    questions: normalizeQuestions(
      current.questions.map((entry) => {
        if (entry.question.question_id !== questionId) {
          return entry;
        }

        const orderedOptions = sortOptions(entry);
        const currentIndex = orderedOptions.findIndex((option) => option.option_id === optionId);
        if (currentIndex === -1) {
          throw new NotFoundError(`Option ${optionId} was not found`);
        }

        return {
          question: {
            ...entry.question,
            updated_at: now,
          },
          options: normalizeOptions(moveItem(orderedOptions, currentIndex, direction), questionId),
        };
      }),
      now,
      false,
    ),
  };
}

export function deleteOptionFromQuizDocument(
  current: AuthoringQuizDocument,
  now: string,
  questionId: string,
  optionId: string,
): AuthoringQuizDocument {
  const targetQuestion = current.questions.find((entry) => entry.question.question_id === questionId);
  if (!targetQuestion) {
    throw new NotFoundError(`Question ${questionId} was not found`);
  }

  return {
    ...current,
    questions: normalizeQuestions(
      current.questions.map((entry) => {
        if (entry.question.question_id !== questionId) {
          return entry;
        }

        const nextOptions = entry.options.filter((option) => option.option_id !== optionId);
        if (nextOptions.length === entry.options.length) {
          throw new NotFoundError(`Option ${optionId} was not found`);
        }

        return {
          question: {
            ...entry.question,
            updated_at: now,
          },
          options: normalizeOptions(nextOptions, questionId),
        };
      }),
      now,
      false,
    ),
  };
}