import { useState, useCallback } from 'react';
import type { Question, ConditionalRule, ConditionAction, SequentialEdges } from './types/survey';
import { SurveyTakerPage } from './components/SurveyTakerPage';
import { sampleSurvey } from './data/sampleSurvey';

interface SurveyData {
  title: string;
  questions: Question[];
  conditions: ConditionalRule[];
  sequentialEdges?: SequentialEdges;
}

/**
 * Normalize conditions from various JSON formats into the internal format.
 * Handles:
 *   - action: "end_survey"              → action: { type: 'end_survey' }
 *   - action: "jump_to" + targetQuestionId  → action: { type: 'jump_to', targetQuestionId }
 *   - action: { type: 'end_survey' }    → unchanged
 *   - action: { type: 'jump_to', ... }  → unchanged
 */
function normalizeConditions(rawConditions: unknown[]): ConditionalRule[] {
  return rawConditions.map((raw: any) => {
    let action: ConditionAction;

    if (typeof raw.action === 'string') {
      // String format: "end_survey" or "jump_to"
      if (raw.action === 'end_survey') {
        action = { type: 'end_survey' };
      } else if (raw.action === 'jump_to') {
        action = {
          type: 'jump_to',
          targetQuestionId: raw.targetQuestionId ?? '',
        };
      } else {
        // Unknown string action, default to end_survey
        action = { type: 'end_survey' };
      }
    } else if (raw.action && typeof raw.action === 'object') {
      // Already in object format
      action = raw.action as ConditionAction;
    } else {
      action = { type: 'end_survey' };
    }

    return {
      id: raw.id ?? crypto.randomUUID(),
      sourceQuestionId: raw.sourceQuestionId ?? '',
      answer: raw.answer ?? '*',
      action,
      operator: raw.operator,
      rowIndex: raw.rowIndex,
    } as ConditionalRule;
  });
}

function App() {
  const [surveyData, setSurveyData] = useState<SurveyData | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState('');

  const loadSurvey = useCallback((data: SurveyData) => {
    setSurveyData(data);
    setError('');
  }, []);

  const loadFromJson = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (!parsed.questions || !Array.isArray(parsed.questions)) {
        setError('Geçersiz anket formatı: "questions" dizisi bulunamadı.');
        return;
      }
      loadSurvey({
        title: parsed.title || 'Adsız Anket',
        questions: parsed.questions,
        conditions: normalizeConditions(parsed.conditions || []),
        sequentialEdges: parsed.sequentialEdges,
      });
    } catch {
      setError('Geçersiz JSON formatı. Lütfen geçerli bir JSON yapıştırın.');
    }
  }, [jsonInput, loadSurvey]);

  const loadDemoSurvey = useCallback(() => {
    loadSurvey({
      title: sampleSurvey.title,
      questions: sampleSurvey.questions,
      conditions: sampleSurvey.conditions,
    });
  }, [loadSurvey]);

  const handleComplete = useCallback((answers: Record<string, unknown>) => {
    console.log('Survey completed with answers:', answers);
    alert('Anket yanıtlarınız başarıyla gönderildi! (Konsolu kontrol edin)');
  }, []);

  // If survey data is loaded, show the survey taker
  if (surveyData) {
    return (
      <SurveyTakerPage
        title={surveyData.title}
        questions={surveyData.questions}
        conditions={surveyData.conditions}
        sequentialEdges={surveyData.sequentialEdges}
        onComplete={handleComplete}
        onRestart={() => setSurveyData(null)}
      />
    );
  }

  // Landing page: load survey from JSON or demo
  return (
    <div className="min-h-screen bg-base-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-base-content/85 mb-1">SurveyTaker</h1>
          <p className="text-sm text-base-content/40">Anket JSON'unu yapıştırın veya demo anketi deneyin</p>
        </div>

        {/* JSON Input */}
        <div className="mb-4">
          <textarea
            className="textarea w-full min-h-48 resize-y rounded-2xl border-2 border-base-300/50 bg-base-100 px-5 py-4 text-sm font-mono leading-relaxed focus:outline-none focus:border-primary/40"
            placeholder='{"title": "...", "questions": [...], "conditions": [...]}'
            value={jsonInput}
            onChange={(e) => {
              setJsonInput(e.target.value);
              setError('');
            }}
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-error/10 border border-error/20 text-error text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            className="btn btn-primary btn-sm rounded-xl px-6 flex-1"
            onClick={loadFromJson}
            disabled={!jsonInput.trim()}
          >
            Anketi Yükle
          </button>
          <button
            className="btn btn-ghost btn-sm rounded-xl px-6 border border-base-300/50"
            onClick={loadDemoSurvey}
          >
            Demo Anket
          </button>
        </div>

        {/* Info text */}
        <p className="text-xs text-base-content/30 text-center mt-6">
          SurvEngine ile oluşturulmuş anket JSON'larını buraya yapıştırarak anketi başlatabilirsiniz.
        </p>
      </div>
    </div>
  );
}

export default App;
