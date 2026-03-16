import type { ConditionalRule, Question } from '../types/survey';
import { QuestionType } from '../types/survey';

/**
 * Evaluate a conditional rule against user answers.
 *
 * @param rule            The condition rule
 * @param question        The source question (for type & settings)
 * @param choiceAnswers   Selected choice answers (SingleChoice / MultipleChoice)
 * @param textAnswer      TextEntry answer
 * @param ratingAnswer    Rating answer (1-based, 0 = none)
 * @param matrixAnswer    MatrixLikert answers (rowIndex → selected columns)
 */
export function evaluateCondition(
  rule: ConditionalRule,
  question: Question,
  choiceAnswers: string[],
  textAnswer: string,
  ratingAnswer: number,
  matrixAnswer: Record<number, string[]>,
): boolean {
  const op = rule.operator ?? (rule.answer === '*' ? 'any' : 'equals');
  const value = rule.answer;

  // Universal wildcard
  if (op === 'any') return true;

  switch (question.type) {
    case QuestionType.SingleChoice:
    case QuestionType.MultipleChoice:
      return op === 'equals' && choiceAnswers.includes(value);

    case QuestionType.Rating: {
      const target = Number(value);
      if (isNaN(target)) return false;
      switch (op) {
        case 'eq':  return ratingAnswer === target;
        case 'gt':  return ratingAnswer > target;
        case 'gte': return ratingAnswer >= target;
        case 'lt':  return ratingAnswer < target;
        case 'lte': return ratingAnswer <= target;
        default:    return false;
      }
    }

    case QuestionType.TextEntry: {
      const txt = textAnswer.trim();
      switch (op) {
        case 'is_empty':      return txt.length === 0;
        case 'is_not_empty':  return txt.length > 0;
        case 'contains':      return txt.toLowerCase().includes(value.toLowerCase());
        case 'not_contains':  return !txt.toLowerCase().includes(value.toLowerCase());
        case 'exact':         return txt === value;
        default:              return false;
      }
    }

    case QuestionType.MatrixLikert: {
      if (op !== 'row_equals') return false;
      const rowIdx = rule.rowIndex ?? 0;
      const rowAnswers = matrixAnswer[rowIdx] ?? [];
      return rowAnswers.includes(value);
    }

    default:
      return false;
  }
}

