import type { LocaleDictionary } from '@/lib/i18n/dictionary';
import type {
  HostAllowedAction,
  PlayerSubmissionStatus,
  QuestionPhase,
  QuestionType,
  QuizStatus,
  RoomLifecycleState,
} from '@/lib/shared/contracts';

export function formatQuizStatus(dictionary: LocaleDictionary, status: QuizStatus) {
  return dictionary.appLabels.quizStatus[status];
}

export function formatRoomLifecycle(dictionary: LocaleDictionary, state: RoomLifecycleState) {
  return dictionary.appLabels.roomLifecycle[state];
}

export function formatQuestionPhase(dictionary: LocaleDictionary, phase: QuestionPhase | null | undefined) {
  return phase ? dictionary.appLabels.questionPhase[phase] : dictionary.appLabels.lobbyPhase;
}

export function formatQuestionType(dictionary: LocaleDictionary, type: QuestionType) {
  return dictionary.appLabels.questionType[type];
}

export function formatPlayerSubmissionStatus(dictionary: LocaleDictionary, status: PlayerSubmissionStatus) {
  return dictionary.appLabels.playerSubmissionStatus[status];
}

export function formatHostAction(dictionary: LocaleDictionary, action: HostAllowedAction) {
  return dictionary.appLabels.hostAction[action];
}