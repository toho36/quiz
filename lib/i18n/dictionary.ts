import type { Locale } from '@/lib/i18n/config';
import type {
  HostAllowedAction,
  PlayerSubmissionStatus,
  QuestionPhase,
  QuestionType,
  QuizStatus,
  RoomLifecycleState,
} from '@/lib/shared/contracts';
import type { AppRoute } from '@/types/app';

export type RouteSection = AppRoute['section'];
export type RouteCopyKey = 'landing' | 'dashboard' | 'authoring' | 'host' | 'join';

export type LocaleDictionary = {
  localeLabel: string;
  localeNames: Record<Locale, string>;
  routes: {
    items: Record<RouteCopyKey, { label: string; description: string }>;
    sections: Record<RouteSection, string>;
  };
  layout: {
    brandTitle: string;
    brandDescription: string;
    environmentLabel: string;
    runtimeBoundaryNotice: string;
  };
  appLabels: {
    quizStatus: Record<QuizStatus, string>;
    roomLifecycle: Record<RoomLifecycleState, string>;
    questionPhase: Record<QuestionPhase, string>;
    questionType: Record<QuestionType, string>;
    playerSubmissionStatus: Record<PlayerSubmissionStatus, string>;
    hostAction: Record<HostAllowedAction, string>;
    lobbyPhase: string;
    roomPrefix: string;
    quizPrefix: string;
    runtimePrefix: string;
    questionCountLabel: string;
    updatedLabel: string;
    joinedPlayersLabel: string;
    connectedPlayersLabel: string;
    submissionProgressLabel: string;
    currentPhaseLabel: string;
    sourceQuizLabel: string;
    joinUrlLabel: string;
    activePromptLabel: string;
    phaseLabel: string;
    scoreLabel: string;
    submissionLabel: string;
    currentQuestionLabel: string;
    pointsSuffix: string;
    correctLabel: string;
    incorrectLabel: string;
    optionsSuffix: string;
    optionLabel: string;
    bytesLabel: string;
  };
  landing: {
    eyebrow: string;
    title: string;
    description: string;
    authorFlowEyebrow: string;
    authorFlowTitle: string;
    authorFlowDescription: string;
    openDashboard: string;
    exitDemoAuthorSession: string;
    continueAsDemoAuthor: string;
    playerFlowEyebrow: string;
    playerFlowTitle: string;
    playerFlowDescription: string;
    openJoinFlow: string;
    openRoute: string;
  };
  joinPage: {
    eyebrow: string;
    title: string;
    description: string;
    errorTitle: string;
    errorEyebrow: string;
    configTitle: string;
    configEyebrow: string;
    environmentLabel: string;
    runtimeEndpointLabel: string;
    runtimeEndpointMissing: string;
    serverSecretsLabel: string;
    serverSecretsValue: string;
  };
  joinForm: {
    title: string;
    eyebrow: string;
    roomCodeLabel: string;
    roomCodePlaceholder: string;
    displayNameLabel: string;
    displayNamePlaceholder: string;
    submitLabel: string;
  };
  dashboardPage: {
    title: string;
    description: string;
    guardedTitle: string;
    guardedDescription: string;
    signInTitle: string;
    signInEyebrow: string;
    readyTitle: string;
    readyEyebrow: string;
    errorTitle: string;
    errorEyebrow: string;
    openAuthoring: string;
    editQuiz: string;
    publishDraft: string;
    createHostRoom: string;
    hostedRoomsTitle: string;
    hostedRoomsEyebrow: string;
    noRooms: string;
    openHostRoom: string;
  };
  authoringPage: {
    title: string;
    description: string;
    guardedTitle: string;
    guardedDescription: string;
    signInTitle: string;
    signInEyebrow: string;
    updatedTitle: string;
    updatedEyebrow: string;
    errorTitle: string;
    errorEyebrow: string;
    titleLabel: string;
    descriptionLabel: string;
    saveDraft: string;
    publishQuiz: string;
    boundaryTitle: string;
    boundaryEyebrow: string;
    boundaryDescription: string;
    questionImageTitle: string;
    questionImageAlt: string;
    noQuestionImage: string;
    uploadQuestionImage: string;
    replaceQuestionImage: string;
    removeQuestionImage: string;
    optionImageAlt: string;
    noOptionImage: string;
    uploadOptionImage: string;
    replaceOptionImage: string;
    removeOptionImage: string;
    noQuizTitle: string;
    noQuizEyebrow: string;
    noQuizDescription: string;
  };
  hostPage: {
    title: string;
    description: string;
    guardedTitle: string;
    guardedDescription: string;
    signInTitle: string;
    signInEyebrow: string;
    updatedTitle: string;
    updatedEyebrow: string;
    errorTitle: string;
    errorEyebrow: string;
    selectRoomTitle: string;
    selectRoomEyebrow: string;
    noRooms: string;
    openHostRoom: string;
    openJoinFlow: string;
    roomTitle: string;
    liveRoomTitle: string;
    liveRoomEyebrow: string;
    waitingForStart: string;
    questionImageAlt: string;
    optionImageAlt: string;
  };
  playPage: {
    eyebrow: string;
    titlePrefix: string;
    description: string;
    updatedTitle: string;
    updatedEyebrow: string;
    errorTitle: string;
    errorEyebrow: string;
    joinFirstTitle: string;
    joinFirstEyebrow: string;
    joinFirstDescriptionPrefix: string;
    joinFirstDescriptionSuffix: string;
    goToJoinFlow: string;
    submitAnswer: string;
    questionImageAlt: string;
    optionImageAlt: string;
    waitingForHost: string;
    latestResultPrefix: string;
    latestResultSuffix: string;
    waitingForNextTransition: string;
    sharedStateTitle: string;
    sharedStateEyebrow: string;
    noActiveQuestion: string;
  };
  actionMessages: {
    notices: {
      draftSaved: string;
      quizPublished: string;
      questionImageSaved: string;
      optionImageSaved: string;
      questionImageRemoved: string;
      optionImageRemoved: string;
      hostRoomCreated: string;
      hostActionApplied: string;
      roomJoined: string;
      answerSubmitted: string;
    };
    fallbacks: {
      saveQuizDetails: string;
      publishQuiz: string;
      saveQuizImage: string;
      removeQuizImage: string;
      createRoom: string;
      hostRoomAction: string;
      joinRoom: string;
      submitAnswer: string;
    };
    errors: {
      demoAuthorRequired: string;
      uploadImageRequired: string;
      imageTypeRequired: string;
      imageTooLarge: string;
      imageTooWideOrTall: string;
      unreadableImageDimensions: string;
      imageStorageFull: string;
      archivedQuizRepublishBlocked: string;
      publishedQuizRequiredForRoom: string;
      expiredRoom: string;
      noActiveQuestion: string;
      noClosedQuestion: string;
      noRevealedQuestion: string;
      noLeaderboard: string;
      moreQuestionsRemain: string;
      roomAlreadyJoined: string;
      lateJoinRejected: string;
      lobbyRequiredToStart: string;
      startGameRequiresSnapshot: string;
      abortRequiresLobbyOrInProgress: string;
      invalidTransition: string;
      inProgressRoomRequired: string;
      activeQuestionRequired: string;
    };
  };
};