import { useCallback, useState } from 'react';
import type { Question, ConditionalRule, SequentialEdges } from '../types/survey';
import { evaluateCondition } from '../utils/condition';

/**
 * Survey taker engine that supports conditional flow and all question types.
 * Ported from survengine's usePreview hook.
 *
 * Answer stores:
 *  - answers: Record<guid, string[]>                        → SingleChoice / MultipleChoice
 *  - textAnswers: Record<guid, string>                      → TextEntry / RichText
 *  - ratingAnswers: Record<guid, number>                    → Rating (1-based, 0 = none)
 *  - matrixAnswers: Record<guid, Record<rowIndex, string[]>> → MatrixLikert
 *  - sortableAnswers: Record<guid, string[]>                → Sortable
 *
 * Navigation logic:
 *  1. When user clicks "Next", evaluate each ConditionalRule via evaluateCondition.
 *  2. If a matching rule has action 'end_survey' → mark as completed.
 *  3. If a matching rule has action 'jump_to'  → go to that question.
 *  4. If no matching rule → check sequential edges for custom flow.
 *  5. If no sequential edge → go to the next sequential question by order.
 */
export function useSurveyTaker(
  questions: Question[],
  conditions: ConditionalRule[] = [],
  sequentialEdges?: SequentialEdges,
) {
  // Always sort questions by order for consistent navigation
  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

  const [path, setPath] = useState<string[]>(
    sortedQuestions.length > 0 ? [sortedQuestions[0].guid] : [],
  );
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [ratingAnswers, setRatingAnswers] = useState<Record<string, number>>({});
  const [matrixAnswers, setMatrixAnswers] = useState<Record<string, Record<number, string[]>>>({});
  const [sortableAnswers, setSortableAnswers] = useState<Record<string, string[]>>({});
  const [ended, setEnded] = useState(false);
  const [controlQuestionResults, setControlQuestionResults] = useState<
    Record<string, { isCorrect: boolean; userAnswer: string[]; correctAnswer: string[] }>
  >({});

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

  /**
   * Check if a required question has been answered.
   */
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

  /**
   * Build a map of sequential flow: sourceGuid → targetGuid.
   */
  function buildFlowMap(): Map<string, string> {
    const map = new Map<string, string>();
    const blockedSet = new Set(sequentialEdges?.blockedEdges ?? []);
    const customEdgesList = sequentialEdges?.customEdges ?? [];

    // Default sequential edges by order (only if not blocked)
    for (let i = 0; i < sortedQuestions.length - 1; i++) {
      const src = sortedQuestions[i].guid;
      const tgt = sortedQuestions[i + 1].guid;
      const edgeId = `seq-${src}-${tgt}`;
      if (!blockedSet.has(edgeId)) {
        map.set(src, tgt);
      }
    }

    // Last question → end (only if not blocked)
    if (sortedQuestions.length > 0) {
      const lastGuid = sortedQuestions[sortedQuestions.length - 1].guid;
      const edgeId = `seq-${lastGuid}-end`;
      if (!blockedSet.has(edgeId)) {
        map.set(lastGuid, '__end__');
      }
    }

    // Custom edges OVERRIDE default mappings
    customEdgesList.forEach((custom) => {
      const edgeId = `seq-${custom.source}-${custom.target}`;
      if (!blockedSet.has(edgeId)) {
        map.set(custom.source, custom.target);
      }
    });

    return map;
  }

  /**
   * Evaluate all rules for a given source question and find the first matching one.
   */
  function resolveNext(
    sourceGuid: string,
  ): { type: 'question'; guid: string } | { type: 'end' } | { type: 'sequential' } {
    const question = questions.find((q) => q.guid === sourceGuid);
    if (!question) return { type: 'sequential' };

    const choiceAns = answers[sourceGuid] ?? [];
    const textAns = textAnswers[sourceGuid] ?? '';
    const ratingAns = ratingAnswers[sourceGuid] ?? 0;
    const matrixAns = matrixAnswers[sourceGuid] ?? {};

    // 1. Check conditions first (they have priority)
    for (const rule of conditions) {
      if (rule.sourceQuestionId !== sourceGuid) continue;

      const matches = evaluateCondition(rule, question, choiceAns, textAns, ratingAns, matrixAns);
      if (!matches) continue;

      // Handle both object format { type: 'end_survey' } and string format "end_survey"
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

    // 2. Check sequential flow map
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

    // 3. No outgoing edge found → end survey
    if (sequentialEdges && (sequentialEdges.blockedEdges?.length || sequentialEdges.customEdges?.length)) {
      return { type: 'end' };
    }

    // 4. Default sequential flow
    return { type: 'sequential' };
  }

  /**
   * Check if a control question was answered correctly.
   */
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

    // Sequential fallback
    const currentIdx = sortedQuestions.findIndex((q) => q.guid === currentGuid);
    if (currentIdx < sortedQuestions.length - 1) {
      setPath((prev) => [...prev, sortedQuestions[currentIdx + 1].guid]);
    } else {
      setEnded(true);
    }
  }, [currentGuid, ended, currentQuestion, answers, textAnswers, ratingAnswers, matrixAnswers, sortedQuestions, conditions, sequentialEdges]);

  const goPrev = useCallback(() => {
    if (path.length <= 1) return;
    if (ended) {
      setEnded(false);
      return;
    }
    setPath((prev) => prev.slice(0, -1));
  }, [path.length, ended]);

  /* ── Choice answers ── */

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

  /* ── Text answers ── */

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

  /* ── Rating answers ── */

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

  /* ── Matrix answers ── */

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

  /* ── Sortable answers ── */

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

  /* ── Reset ── */

  const reset = useCallback(() => {
    setPath(sortedQuestions.length > 0 ? [sortedQuestions[0].guid] : []);
    setAnswers({});
    setTextAnswers({});
    setRatingAnswers({});
    setMatrixAnswers({});
    setSortableAnswers({});
    setEnded(false);
    setControlQuestionResults({});
  }, [sortedQuestions]);

  /* ── Collect all answers for submission ── */

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
    // Choice
    selectAnswer,
    getSelectedAnswers,
    // Text
    setTextAnswer,
    getTextAnswer,
    // Rating
    setRatingAnswer,
    getRatingAnswer,
    // Matrix
    setMatrixAnswer,
    getMatrixAnswer,
    // Sortable
    setSortableAnswer,
    getSortableAnswer,
    // Misc
    reset,
    path,
    controlQuestionResults,
    getAllAnswers,
  };
}

