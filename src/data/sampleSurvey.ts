import type { Question, ConditionalRule } from '../types/survey';

/**
 * Sample survey data for testing.
 * Matches the demo survey structure from survengine.
 */

const q1Guid = 'demo-q1';
const q2Guid = 'demo-q2';
const q3Guid = 'demo-q3';
const q4Guid = 'demo-q4';
const q5Guid = 'demo-q5';
const q6Guid = 'demo-q6';
const q7Guid = 'demo-q7';
const q8Guid = 'demo-q8';

export const sampleQuestions: Question[] = [
  {
    order: 1,
    text: 'Otelimizde genel deneyiminizi nasıl değerlendirirsiniz?',
    type: 1, // SingleChoice
    answers: ['Mükemmel', 'İyi', 'Orta', 'Kötü'],
    guid: q1Guid,
  },
  {
    order: 2,
    text: 'Konaklamanızda en çok neyi beğendiniz?',
    type: 2, // MultipleChoice
    answers: ['Temizlik', 'Personel', 'Konum', 'Yemekler', 'Spa & Havuz'],
    guid: q2Guid,
  },
  {
    order: 3,
    text: 'Otelimizi arkadaşlarınıza tavsiye eder misiniz?',
    type: 1, // SingleChoice
    answers: ['Kesinlikle evet', 'Muhtemelen evet', 'Emin değilim', 'Hayır'],
    guid: q3Guid,
  },
  {
    order: 4,
    text: 'Otelimize genel olarak kaç yıldız verirsiniz?',
    type: 7, // Rating
    answers: [],
    guid: q4Guid,
    settings: {
      ratingCount: 5,
      ratingLabels: { low: 'Çok Kötü', high: 'Mükemmel' },
    },
  },
  {
    order: 5,
    text: 'Aşağıdaki hizmetleri nasıl değerlendirirsiniz?',
    type: 5, // MatrixLikert
    answers: [],
    guid: q5Guid,
    settings: {
      rows: [
        'Resepsiyon hizmeti',
        'Oda temizliği',
        'Restoran kalitesi',
        'Personel ilgisi',
      ],
      columns: [
        'Çok Kötü',
        'Kötü',
        'Orta',
        'İyi',
        'Çok İyi',
      ],
      matrixType: 'single',
    },
  },
  {
    order: 6,
    text: 'Hangi ek hizmetleri kullandınız?',
    type: 2, // MultipleChoice
    answers: ['Oda servisi', 'Restoran', 'Fitness', 'Transfer', 'Tur rehberliği'],
    guid: q6Guid,
  },
  {
    order: 7,
    text: 'Odanızın temizliğini nasıl değerlendirirsiniz?',
    type: 1, // SingleChoice
    answers: ['Çok iyi', 'İyi', 'Kabul edilebilir', 'Yetersiz'],
    guid: q7Guid,
  },
  {
    order: 8,
    text: 'Deneyiminiz hakkında eklemek istediğiniz bir şey var mı?',
    type: 3, // TextEntry
    answers: [],
    guid: q8Guid,
    settings: {
      maxLength: 1250,
      placeholder: 'Düşüncelerinizi buraya yazabilirsiniz...',
    },
  },
];

export const sampleConditions: ConditionalRule[] = [
  {
    id: 'demo-cond-1',
    sourceQuestionId: q1Guid,
    answer: 'Kötü',
    action: { type: 'end_survey' },
  },
  {
    id: 'demo-cond-2',
    sourceQuestionId: q3Guid,
    answer: 'Hayır',
    action: { type: 'jump_to', targetQuestionId: q7Guid },
  },
];

export const sampleSurvey = {
  id: 'demo-survey',
  title: 'Otel Misafir Deneyimi Anketi',
  questions: sampleQuestions,
  conditions: sampleConditions,
};

