import { useState, useCallback, useEffect } from 'react';
import type { Question, ConditionalRule, ConditionAction, SequentialEdges } from './types/survey';
import { SurveyTakerPage } from './components/SurveyTakerPage';
import { sampleSurvey } from './data/sampleSurvey';

interface SurveyData {
  surveyId?: string;
  title: string;
  questions: Question[];
  conditions: ConditionalRule[];
  sequentialEdges?: SequentialEdges;
}

interface BridgeResponse {
  success: boolean;
  message?: string;
}

type SubmissionEnvelope = {
  submissionId: string;
  answers: Record<string, unknown>;
  controlQuestionResults?: Record<string, unknown>;
  durationMs?: number;
};

declare global {
  interface Window {
    __SURVEY_DATA__?: Record<string, unknown>;
    VeriSimpleBridge?: {
      saveSurvey?: (payload: unknown) => Promise<BridgeResponse>;
      onSurveyChange?: (payload: unknown) => void;
      submitAnswers?: (surveyId: string, payload: unknown) => Promise<BridgeResponse>;
    };
  }
}

function draftKey(surveyId: string): string {
  return `vs:taker:draft:${surveyId}`;
}
function pendingKey(surveyId: string): string {
  return `vs:taker:pending:${surveyId}`;
}
function safeLsGet(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeLsSet(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
}
function safeLsRemove(key: string): void {
  try { window.localStorage.removeItem(key); } catch { /* ignore */ }
}

function normalizeConditions(rawConditions: unknown[]): ConditionalRule[] {
  return rawConditions.map((raw: any) => {
    let action: ConditionAction;

    if (typeof raw.action === 'string') {
      if (raw.action === 'end_survey') {
        action = { type: 'end_survey' };
      } else if (raw.action === 'jump_to') {
        action = { type: 'jump_to', targetQuestionId: raw.targetQuestionId ?? '' };
      } else {
        action = { type: 'end_survey' };
      }
    } else if (raw.action && typeof raw.action === 'object') {
      if (raw.action.jumpTo) {
        action = { type: 'jump_to', targetQuestionId: raw.action.jumpTo };
      } else {
        action = raw.action as ConditionAction;
      }
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
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const [isOnline, setIsOnline] = useState(() => {
    try { return navigator.onLine; } catch { return true; }
  });

  const loadSurvey = useCallback((data: SurveyData) => {
    setSurveyData(data);
    setError('');
  }, []);

  // On mount: check if host injected survey data
  useEffect(() => {
    const injected = window.__SURVEY_DATA__;
    if (injected && typeof injected === 'object' && Array.isArray(injected.questions)) {
      loadSurvey({
        surveyId: (injected.surveyId as string) ?? undefined,
        title: (injected.title as string) || 'Anket',
        questions: injected.questions as Question[],
        conditions: normalizeConditions((injected.conditions as unknown[]) || []),
        sequentialEdges: injected.sequentialEdges as SequentialEdges | undefined,
      });
    }
  }, [loadSurvey]);

  // Track online/offline
  useEffect(() => {
    function onOnline() { setIsOnline(true); }
    function onOffline() { setIsOnline(false); }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Pending submission retry loop (persisted in localStorage)
  useEffect(() => {
    const sid = surveyData?.surveyId;
    if (!sid) return;
    const surveyId: string = sid;
    const bridge = window.VeriSimpleBridge;
    if (!bridge?.submitAnswers) return;
    const submit = bridge.submitAnswers;

    let cancelled = false;
    let delayMs = 1500;
    let timer: number | null = null;

    async function trySendPending(): Promise<void> {
      if (cancelled) return;
      const raw = safeLsGet(pendingKey(surveyId));
      if (!raw) return;

      let pending: SubmissionEnvelope | null = null;
      try { pending = JSON.parse(raw) as SubmissionEnvelope; } catch { pending = null; }
      if (!pending?.submissionId) { safeLsRemove(pendingKey(surveyId)); return; }

      if (!navigator.onLine) {
        setSubmitStatus('error');
        setSubmitMessage('Bağlantı yok. İnternet gelince otomatik göndereceğiz.');
        scheduleNext();
        return;
      }

      setSubmitStatus('submitting');
      setSubmitMessage('Yanıtlar gönderiliyor…');

      try {
        const res = await submit(surveyId, pending);
        if (res.success) {
          safeLsRemove(pendingKey(surveyId));
          safeLsRemove(draftKey(surveyId));
          setSubmitStatus('success');
          setSubmitMessage(res.message ?? 'Yanıtlarınız kaydedildi! Yönlendiriliyorsunuz…');
          setTimeout(() => { window.location.href = '/'; }, 1200);
          return;
        }

        setSubmitStatus('error');
        setSubmitMessage(res.message ?? 'Gönderim başarısız. Tekrar denenecek.');
        scheduleNext();
      } catch (e: unknown) {
        setSubmitStatus('error');
        setSubmitMessage('Ağ hatası. Tekrar denenecek.');
        scheduleNext();
      }
    }

    function scheduleNext(): void {
      if (cancelled) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        delayMs = Math.min(delayMs * 2, 15000);
        void trySendPending();
      }, delayMs);
    }

    // Initial attempt on mount
    void trySendPending();

    // Also retry immediately when online
    function onOnlineNow() { void trySendPending(); }
    window.addEventListener('online', onOnlineNow);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('online', onOnlineNow);
    };
  }, [surveyData?.surveyId]);

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

  const handleComplete = useCallback(async (payload: {
    answers: Record<string, unknown>;
    controlQuestionResults: Record<string, unknown>;
    durationMs: number;
  }) => {
    if (submitStatus === 'submitting' || submitStatus === 'success') return;

    const bridge = window.VeriSimpleBridge;
    const surveyId = surveyData?.surveyId;

    if (bridge?.submitAnswers && surveyId) {
      setSubmitStatus('submitting');
      try {
        const submissionId = crypto.randomUUID();
        const envelope: SubmissionEnvelope = {
          submissionId,
          answers: payload.answers,
          controlQuestionResults: payload.controlQuestionResults,
          durationMs: payload.durationMs,
        };
        safeLsSet(pendingKey(surveyId), JSON.stringify(envelope));

        const res = await bridge.submitAnswers(surveyId, envelope);
        if (res.success) {
          safeLsRemove(pendingKey(surveyId));
          safeLsRemove(draftKey(surveyId));
          setSubmitStatus('success');
          setSubmitMessage(res.message ?? 'Yanıtlarınız kaydedildi! Yönlendiriliyorsunuz…');
          setTimeout(() => {
            window.location.href = '/';
          }, 1500);
        } else {
          setSubmitStatus('error');
          setSubmitMessage(res.message ?? 'Kaydetme hatası.');
        }
      } catch (err: unknown) {
        setSubmitStatus('error');
        setSubmitMessage(err instanceof Error ? err.message : 'Bilinmeyen hata');
      }
    } else {
      console.log('Survey completed with payload:', payload);
      setSubmitStatus('success');
      setSubmitMessage('Anket yanıtlarınız başarıyla gönderildi!');
    }
  }, [surveyData?.surveyId, submitStatus]);

  if (surveyData) {
    return (
      <>
        {!isOnline && (
          <div style={{ position: 'fixed', top: 80, right: 24, zIndex: 9999, padding: '10px 14px', borderRadius: 12, background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 800, boxShadow: '0 4px 20px rgba(0,0,0,.08)' }}>
            Offline mod: cevaplarınız kaydediliyor, internet gelince gönderilecek.
          </div>
        )}
        <SurveyTakerPage
          surveyId={surveyData.surveyId}
          title={surveyData.title}
          questions={surveyData.questions}
          conditions={surveyData.conditions}
          sequentialEdges={surveyData.sequentialEdges}
          onComplete={handleComplete}
          onRestart={() => {
            if (window.__SURVEY_DATA__) {
              window.location.href = '/SurveyEngine/Saved';
              return;
            }
            setSurveyData(null);
            setSubmitStatus('idle');
            setSubmitMessage('');
          }}
        />

        {submitStatus === 'submitting' && (
          <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, padding: '12px 20px', borderRadius: 12, background: '#0f172a', color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px rgba(0,0,0,.15)' }}>
            Yanıtlar kaydediliyor…
          </div>
        )}
        {submitStatus === 'success' && (
          <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, padding: '12px 20px', borderRadius: 12, background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px rgba(0,0,0,.15)' }}>
            {submitMessage}
          </div>
        )}
        {submitStatus === 'error' && (
          <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, padding: '12px 20px', borderRadius: 12, background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px rgba(0,0,0,.15)' }}>
            {submitMessage}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-base-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
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

        <div className="mb-4">
          <textarea
            className="textarea w-full min-h-48 resize-y rounded-2xl border-2 border-base-300/50 bg-base-100 px-5 py-4 text-sm font-mono leading-relaxed focus:outline-none focus:border-primary/40"
            placeholder='{"title": "...", "questions": [...], "conditions": [...]}'
            value={jsonInput}
            onChange={(e) => { setJsonInput(e.target.value); setError(''); }}
          />
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-error/10 border border-error/20 text-error text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-3">
          <button className="btn btn-primary btn-sm rounded-xl px-6 flex-1" onClick={loadFromJson} disabled={!jsonInput.trim()}>Anketi Yükle</button>
          <button className="btn btn-ghost btn-sm rounded-xl px-6 border border-base-300/50" onClick={loadDemoSurvey}>Demo Anket</button>
        </div>

        <p className="text-xs text-base-content/30 text-center mt-6">
          SurvEngine ile oluşturulmuş anket JSON'larını buraya yapıştırarak anketi başlatabilirsiniz.
        </p>
      </div>
    </div>
  );
}

export default App;
