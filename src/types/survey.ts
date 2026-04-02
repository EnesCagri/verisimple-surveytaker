export const QuestionType = {
  SingleChoice: 1,
  MultipleChoice: 2,
  TextEntry: 3,
  MatrixLikert: 5,
  Sortable: 6,
  Rating: 7,
  RichText: 8,
} as const;

export type QuestionType = typeof QuestionType[keyof typeof QuestionType];

/**
 * Type-specific settings for questions.
 * Only relevant fields are set per question type.
 */
export interface QuestionSettings {
  /* ── TextEntry ── */
  maxLength?: number;
  placeholder?: string;

  /* ── Rating ── */
  ratingCount?: number;
  ratingLabels?: { low: string; high: string };

  /* ── MatrixLikert ── */
  rows?: string[];
  columns?: string[];
  matrixType?: 'single' | 'multiple';

  /* ── RichText ── */
  richContent?: string;
  hasResponse?: boolean;
  responseMaxLength?: number;
  responsePlaceholder?: string;

  /* ── Control Question ── */
  isControlQuestion?: boolean;
  correctAnswer?: string[];

  /* ── Answer Images ── */
  answerImages?: Record<string, string>;
}

export interface Question {
  order: number;
  text: string;
  type: QuestionType;
  answers: string[];
  guid: string;
  settings?: QuestionSettings;
  required?: boolean;
  image?: string;
}

export type ConditionAction =
  | { type: 'jump_to'; targetQuestionId: string }
  | { type: 'end_survey' };

export type ConditionOperator =
  | 'any'
  | 'equals'
  | 'eq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'not_contains' | 'exact' | 'is_empty' | 'is_not_empty'
  | 'row_equals';

export interface ConditionalRule {
  id: string;
  sourceQuestionId: string;
  answer: string;
  action: ConditionAction;
  operator?: ConditionOperator;
  rowIndex?: number;
}

export interface SequentialEdges {
  blockedEdges?: string[];
  customEdges?: Array<{ source: string; target: string }>;
}

export interface NodePositions {
  [questionGuid: string]: { x: number; y: number } | undefined;
  __start__?: { x: number; y: number };
  __end__?: { x: number; y: number };
  __invalid_end__?: { x: number; y: number };
}

export interface Survey {
  id: string;
  title: string;
  questions: Question[];
  conditions: ConditionalRule[];
  nodePositions?: NodePositions;
  sequentialEdges?: SequentialEdges;
  createdAt: string;
  updatedAt: string;
}

