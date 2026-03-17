import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Question, ConditionalRule, SequentialEdges } from '../types/survey';
import { evaluateCondition } from '../utils/condition';

type DraftV1 = {
  v: 1;
  updatedAt: string;
  startedAt: number;
  path: string[];
  answers: Record<string, string[]>;
  textAnswers: Record<string, string>;
  ratingAnswers: Record<string, number>;
  matrixAnswers: Record<string, Record<number, string[]>>;
  sortableAnswers: Record<string, string[]>;
  ended: boolean;
};

function getDraftKey(surveyId: string): string {
  return `vs:taker:draft:${surveyId}`;
}

function safeReadDraft(surveyId: string): DraftV1 | null {
  try {
    const raw = window.localStorage.getItem(getDraftKey(surveyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftV1;
    if (!parsed || parsed.v !== 1) return null;
    if (!Array.isArray(parsed.path)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeWriteDraft(surveyId: string, draft: DraftV1): void {
  try {
    window.localStorage.setItem(getDraftKey(surveyId), JSON.stringify(draft));
  } catch {
    // ignore quota / privacy errors
  }
}

export function useSurveyTaker(
  questions: Question[],
  conditions: ConditionalRule[] = [],
  sequentialEdges?: SequentialEdges,
  opts?: { surveyId?: string },
) {
  const sortedQuestions = useMemo(() => [...questions].sort((a, b) => a.order - b.order), [questions]);

  const surveyId = opts?.surveyId;
  const loadedDraftRef = useRef(false);

  const [path, setPath] = useState<string[]>(() => (
    sortedQuestions.length > 0 ? [sortedQuestions[0].guid] : []
  ));
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [ratingAnswers, setRatingAnswers] = useState<Record<string, number>>({});
  const [matrixAnswers, setMatrixAnswers] = useState<Record<string, Record<number, string[]>>>({});
  const [sortableAnswers, setSortableAnswers] = useState<Record<string, string[]>>({});
  const [ended, setEnded] = useState(false);
  const [controlQuestionResults, setControlQuestionResults] = useState<
    Record<string, { isCorrect: boolean; userAnswer: string[]; correctAnswer: string[] }>
  >({});

  // Duration tracking
  const startedAtRef = useRef<number>(Date.now());

  // Draft restore indicator
  const [draftRestored, setDraftRestored] = useState(false);

  // Draft autosave timestamp indicator
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // Unanswered review mode (jump only between unanswered questions)
  const [reviewUnanswered, setReviewUnanswered] = useState(false);

  // Load draft once (if available) when embedded with a surveyId
  useEffect(() => {
    if (!surveyId) return;
    if (loadedDraftRef.current) return;
    loadedDraftRef.current = true;

    const draft = safeReadDraft(surveyId);
    if (!draft) return;

    const validSet = new Set(sortedQuestions.map((q) => q.guid));
    const filteredPath = (draft.path || []).filter((g) => validSet.has(g));
    const fallbackPath = sortedQuestions.length > 0 ? [sortedQuestions[0].guid] : [];

    setPath(filteredPath.length ? filteredPath : fallbackPath);
    setAnswers(draft.answers || {});
    setTextAnswers(draft.textAnswers || {});
    setRatingAnswers(draft.ratingAnswers || {});
    setMatrixAnswers(draft.matrixAnswers || {});
    setSortableAnswers(draft.sortableAnswers || {});
    setEnded(!!draft.ended);

    if (draft.startedAt) {
      startedAtRef.current = draft.startedAt;
    }

    if (filteredPath.length > 1 || Object.keys(draft.answers || {}).length > 0) {
      setDraftRestored(true);
    }
  }, [surveyId, sortedQuestions]);

  // Persist draft (throttled) while answering
  const persistTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!surveyId) return;
    if (!loadedDraftRef.current) return;

    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      safeWriteDraft(surveyId, {
        v: 1,
        updatedAt: new Date().toISOString(),
        startedAt: startedAtRef.current,
        path,
        answers,
        textAnswers,
        ratingAnswers,
        matrixAnswers,
        sortableAnswers,
        ended,
      });
      setLastSavedAt(Date.now());
    }, 500);

    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
  }, [surveyId, path, answers, textAnswers, ratingAnswers, matrixAnswers, sortableAnswers, ended]);

  const currentGuid = path[path.length - 1] ?? null;
  const currentQuestion = questions.find((q) => q.guid === currentGuid) ?? null;
  const currentStepIndex = path.length - 1;

  const totalSteps = questions.length;
  const progress = totalSteps > 0 ? path.length / totalSteps : 0;

  const isFirst = path.length <= 1;
  const isCompleted = ended || (currentGuid === null && path.length > 0);

  const isLast =
    !ended &&
    currentQuestion !== null &&
    currentGuid === sortedQuestions[sortedQuestions.length - 1]?.guid &&
    !hasMatchingCondition(currentQuestion.guid) &&
    !hasCustomSequentialEdge(currentQuestion.guid);

  function hasCustomSequentialEdge(sourceGuid: string): boolean {
    if (!sequentialEdges?.customEdges) return false;
    return sequentialEdges.customEdges.some((e) => e.source === sourceGuid);
  }

  function hasMatchingCondition(sourceGuid: string): boolean {
    return conditions.some((c) => c.sourceQuestionId === sourceGuid);
  }

  function isQuestionAnswered(question: Question): boolean {
    const guid = question.guid;

    switch (question.type) {
      case 1: // SingleChoice
      case 2: // MultipleChoice
        return (answers[guid] ?? []).length > 0;

      case 3: // TextEntry
        return (textAnswers[guid] ?? '').trim().length > 0;

      case 7: // Rating
        return (ratingAnswers[guid] ?? 0) > 0;

      case 5: { // MatrixLikert
        const matrix = matrixAnswers[guid] ?? {};
        return Object.values(matrix).some((row) => row.length > 0);
      }

      case 6: // Sortable
        return true;

      case 8: // RichText
        if (question.settings?.hasResponse) {
          const html = textAnswers[guid] ?? '';
          const text = html.replace(/<[^>]*>/g, '').trim();
          return text.length > 0;
        }
        return true;

      default:
        return true;
    }
  }

  // Soft validation: find unanswered questions from the visited path
  const getUnansweredQuestions = useCallback((): { guid: string; order: number; text: string }[] => {
    const visited = new Set(path);
    return sortedQuestions
      .filter((q) => visited.has(q.guid) && !isQuestionAnswered(q))
      .map((q) => ({ guid: q.guid, order: q.order, text: q.text }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, sortedQuestions, answers, textAnswers, ratingAnswers, matrixAnswers, sortableAnswers]);

  // Navigate back to a specific question by truncating the path
  const goToQuestion = useCallback((guid: string) => {
    const idx = path.indexOf(guid);
    if (idx >= 0) {
      setPath(path.slice(0, idx + 1));
      setEnded(false);
    }
  }, [path]);

  // Start review mode at a specific unanswered question
  const startUnansweredReview = useCallback((guid: string) => {
    setReviewUnanswered(true);
    const idx = path.indexOf(guid);
    if (idx >= 0) {
      setPath(path.slice(0, idx + 1));
      setEnded(false);
    }
  }, [path]);

  // Duration measurement
  const getDurationMs = useCallback((): number => {
    return Date.now() - startedAtRef.current;
  }, []);

  function buildFlowMap(): Map<string, string> {
    const map = new Map<string, string>();
    const blockedSet = new Set(sequentialEdges?.blockedEdges ?? []);
    const customEdgesList = sequentialEdges?.customEdges ?? [];

    for (let i = 0; i < sortedQuestions.length - 1; i++) {
      const src = sortedQuestions[i].guid;
      const tgt = sortedQuestions[i + 1].guid;
      const edgeId = `seq-${src}-${tgt}`;
      if (!blockedSet.has(edgeId)) {
        map.set(src, tgt);
      }
    }

    if (sortedQuestions.length > 0) {
      const lastGuid = sortedQuestions[sortedQuestions.length - 1].guid;
      const edgeId = `seq-${lastGuid}-end`;
      if (!blockedSet.has(edgeId)) {
        map.set(lastGuid, '__end__');
      }
    }

    customEdgesList.forEach((custom) => {
      const edgeId = `seq-${custom.source}-${custom.target}`;
      if (!blockedSet.has(edgeId)) {
        map.set(custom.source, custom.target);
      }
    });

    return map;
  }

  function resolveNext(
    sourceGuid: string,
  ): { type: 'question'; guid: string } | { type: 'end' } | { type: 'sequential' } {
    const question = questions.find((q) => q.guid === sourceGuid);
    if (!question) return { type: 'sequential' };

    const choiceAns = answers[sourceGuid] ?? [];
    const textAns = textAnswers[sourceGuid] ?? '';
    const ratingAns = ratingAnswers[sourceGuid] ?? 0;
    const matrixAns = matrixAnswers[sourceGuid] ?? {};

    for (const rule of conditions) {
      if (rule.sourceQuestionId !== sourceGuid) continue;

      const matches = evaluateCondition(rule, question, choiceAns, textAns, ratingAns, matrixAns);
      if (!matches) continue;

      const action = rule.action;
      const actionType = typeof action === 'string' ? action : action?.type;

      if (actionType === 'end_survey') {
        return { type: 'end' };
      }
      if (actionType === 'jump_to') {
        const targetId = typeof action === 'object' && 'targetQuestionId' in action
          ? action.targetQuestionId
          : (rule as any).targetQuestionId;
        if (targetId) {
          return { type: 'question', guid: targetId };
        }
      }
    }

    const flowMap = buildFlowMap();
    const nextTarget = flowMap.get(sourceGuid);

    if (nextTarget) {
      if (nextTarget === '__end__') {
        return { type: 'end' };
      }
      const targetExists = sortedQuestions.some((q) => q.guid === nextTarget);
      if (targetExists) {
        return { type: 'question', guid: nextTarget };
      }
    }

    if (sequentialEdges && (sequentialEdges.blockedEdges?.length || sequentialEdges.customEdges?.length)) {
      return { type: 'end' };
    }

    return { type: 'sequential' };
  }

  function checkControlQuestion(question: Question): void {
    if (!question.settings?.isControlQuestion || !question.settings.correctAnswer) {
      return;
    }

    const correctAnswer = question.settings.correctAnswer;
    let userAnswer: string[] = [];

    switch (question.type) {
      case 1: // SingleChoice
      case 2: // MultipleChoice
        userAnswer = answers[question.guid] ?? [];
        break;
      case 7: { // Rating
        const rating = ratingAnswers[question.guid] ?? 0;
        userAnswer = rating > 0 ? [rating.toString()] : [];
        break;
      }
      default:
        return;
    }

    const isCorrect =
      userAnswer.length === correctAnswer.length &&
      userAnswer.every((ans) => correctAnswer.includes(ans)) &&
      correctAnswer.every((ans) => userAnswer.includes(ans));

    setControlQuestionResults((prev) => ({
      ...prev,
      [question.guid]: {
        isCorrect,
        userAnswer,
        correctAnswer,
      },
    }));
  }

  const goNext = useCallback(() => {
    if (!currentGuid || ended) return;

    if (currentQuestion && currentQuestion.required) {
      if (!isQuestionAnswered(currentQuestion)) {
        return;
      }
    }

    if (currentQuestion) {
      checkControlQuestion(currentQuestion);
    }

    // If user came from completion screen to fill skipped questions,
    // keep jumping only between unanswered questions and finish immediately.
    if (reviewUnanswered) {
      const remaining = getUnansweredQuestions().filter((q) => q.guid !== currentGuid);
      if (remaining.length > 0) {
        const nextGuid = remaining[0].guid;
        const idx = path.indexOf(currentGuid);
        setPath((prev) => {
          const cutIdx = idx >= 0 ? idx + 1 : prev.length;
          return [...prev.slice(0, cutIdx), nextGuid];
        });
        return;
      }
      setReviewUnanswered(false);
      setEnded(true);
      return;
    }

    const result = resolveNext(currentGuid);

    if (result.type === 'end') {
      setEnded(true);
      return;
    }

    if (result.type === 'question') {
      const targetExists = sortedQuestions.some((q) => q.guid === result.guid);
      if (targetExists) {
        setPath((prev) => [...prev, result.guid]);
      } else {
        const currentIdx = sortedQuestions.findIndex((q) => q.guid === currentGuid);
        if (currentIdx < sortedQuestions.length - 1) {
          setPath((prev) => [...prev, sortedQuestions[currentIdx + 1].guid]);
        } else {
          setEnded(true);
        }
      }
      return;
    }

    const currentIdx = sortedQuestions.findIndex((q) => q.guid === currentGuid);
    if (currentIdx < sortedQuestions.length - 1) {
      setPath((prev) => [...prev, sortedQuestions[currentIdx + 1].guid]);
    } else {
      setEnded(true);
    }
  }, [currentGuid, ended, currentQuestion, reviewUnanswered, getUnansweredQuestions, answers, textAnswers, ratingAnswers, matrixAnswers, sortedQuestions, conditions, sequentialEdges, path]);

  const goPrev = useCallback(() => {
    if (path.length <= 1) return;
    if (ended) {
      setEnded(false);
      return;
    }
    setPath((prev) => prev.slice(0, -1));
  }, [path.length, ended]);

  const selectAnswer = useCallback(
    (questionGuid: string, answer: string, isMultiple: boolean) => {
      setAnswers((prev) => {
        const current = prev[questionGuid] ?? [];
        if (isMultiple) {
          const exists = current.includes(answer);
          return {
            ...prev,
            [questionGuid]: exists
              ? current.filter((a) => a !== answer)
              : [...current, answer],
          };
        }
        return { ...prev, [questionGuid]: [answer] };
      });
    },
    [],
  );

  const getSelectedAnswers = useCallback(
    (questionGuid: string): string[] => answers[questionGuid] ?? [],
    [answers],
  );

  const setTextAnswer = useCallback(
    (questionGuid: string, text: string) => {
      setTextAnswers((prev) => ({ ...prev, [questionGuid]: text }));
    },
    [],
  );

  const getTextAnswer = useCallback(
    (questionGuid: string): string => textAnswers[questionGuid] ?? '',
    [textAnswers],
  );

  const setRatingAnswer = useCallback(
    (questionGuid: string, value: number) => {
      setRatingAnswers((prev) => ({ ...prev, [questionGuid]: value }));
    },
    [],
  );

  const getRatingAnswer = useCallback(
    (questionGuid: string): number => ratingAnswers[questionGuid] ?? 0,
    [ratingAnswers],
  );

  const setMatrixAnswer = useCallback(
    (questionGuid: string, rowIndex: number, column: string, isMultiple: boolean) => {
      setMatrixAnswers((prev) => {
        const questionMatrix = prev[questionGuid] ?? {};
        const currentRow = questionMatrix[rowIndex] ?? [];

        let newRow: string[];
        if (isMultiple) {
          const exists = currentRow.includes(column);
          newRow = exists
            ? currentRow.filter((c) => c !== column)
            : [...currentRow, column];
        } else {
          newRow = [column];
        }

        return {
          ...prev,
          [questionGuid]: { ...questionMatrix, [rowIndex]: newRow },
        };
      });
    },
    [],
  );

  const getMatrixAnswer = useCallback(
    (questionGuid: string): Record<number, string[]> => matrixAnswers[questionGuid] ?? {},
    [matrixAnswers],
  );

  const setSortableAnswer = useCallback(
    (questionGuid: string, orderedItems: string[]) => {
      setSortableAnswers((prev) => ({ ...prev, [questionGuid]: orderedItems }));
    },
    [],
  );

  const getSortableAnswer = useCallback(
    (questionGuid: string): string[] => sortableAnswers[questionGuid] ?? [],
    [sortableAnswers],
  );

  const reset = useCallback(() => {
    setPath(sortedQuestions.length > 0 ? [sortedQuestions[0].guid] : []);
    setAnswers({});
    setTextAnswers({});
    setRatingAnswers({});
    setMatrixAnswers({});
    setSortableAnswers({});
    setEnded(false);
    setReviewUnanswered(false);
    setControlQuestionResults({});
    startedAtRef.current = Date.now();
  }, [sortedQuestions]);

  const getAllAnswers = useCallback(() => {
    return {
      choices: answers,
      text: textAnswers,
      ratings: ratingAnswers,
      matrix: matrixAnswers,
      sortable: sortableAnswers,
    };
  }, [answers, textAnswers, ratingAnswers, matrixAnswers, sortableAnswers]);

  const isCurrentQuestionRequired = currentQuestion?.required ?? false;
  const isCurrentQuestionAnswered = currentQuestion
    ? isQuestionAnswered(currentQuestion)
    : true;

  return {
    currentStep: currentStepIndex,
    currentQuestion,
    totalSteps,
    progress: Math.min(progress, 1),
    isFirst,
    isLast,
    isCompleted,
    isCurrentQuestionRequired,
    isCurrentQuestionAnswered,
    goNext,
    goPrev,
    selectAnswer,
    getSelectedAnswers,
    setTextAnswer,
    getTextAnswer,
    setRatingAnswer,
    getRatingAnswer,
    setMatrixAnswer,
    getMatrixAnswer,
    setSortableAnswer,
    getSortableAnswer,
    reset,
    path,
    controlQuestionResults,
    getAllAnswers,
    getUnansweredQuestions,
    goToQuestion,
    startUnansweredReview,
    getDurationMs,
    draftRestored,
    lastSavedAt,
  };
}
