import { useState, useCallback, useEffect } from 'react';
import type { Question, ConditionalRule, ConditionAction, SequentialEdges } from './types/survey';
import { SurveyTakerPage } from './components/SurveyTakerPage';

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
  isValid?: boolean;
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

function readInjectedSurvey(): SurveyData | null {
  const injected = window.__SURVEY_DATA__;
  if (!injected || typeof injected !== 'object' || !Array.isArray(injected.questions)) {
    return null;
  }
  return {
    surveyId: (injected.surveyId as string) ?? undefined,
    title: (injected.title as string) || 'Anket',
    questions: injected.questions as Question[],
    conditions: normalizeConditions((injected.conditions as unknown[]) || []),
    sequentialEdges: injected.sequentialEdges as SequentialEdges | undefined,
  };
}

function App() {
  const [surveyData, setSurveyData] = useState<SurveyData | null>(null);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const [isOnline, setIsOnline] = useState(() => {
    try { return navigator.onLine; } catch { return true; }
  });

  const loadSurvey = useCallback((data: SurveyData) => {
    setSurveyData(data);
    setLoadTimedOut(false);
  }, []);

  // Host injects survey before or shortly after load; poll briefly for late injection
  useEffect(() => {
    const immediate = readInjectedSurvey();
    if (immediate) {
      loadSurvey(immediate);
      return;
    }

    let attempts = 0;
    const maxAttempts = 50;
    const timer = window.setInterval(() => {
      attempts++;
      const data = readInjectedSurvey();
      if (data) {
        loadSurvey(data);
        window.clearInterval(timer);
        return;
      }
      if (attempts >= maxAttempts) {
        window.clearInterval(timer);
        setLoadTimedOut(true);
      }
    }, 100);

    return () => window.clearInterval(timer);
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
      } catch {
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

    void trySendPending();

    function onOnlineNow() { void trySendPending(); }
    window.addEventListener('online', onOnlineNow);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('online', onOnlineNow);
    };
  }, [surveyData?.surveyId]);

  const handleComplete = useCallback(async (payload: {
    answers: Record<string, unknown>;
    controlQuestionResults: Record<string, unknown>;
    durationMs: number;
    isValid: boolean;
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
          isValid: payload.isValid,
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
      setSubmitStatus('error');
      setSubmitMessage(
        'Yanıtlar gönderilemedi: host uygulaması (VeriSimpleBridge) veya anket kimliği eksik.',
      );
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
            window.location.reload();
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
      <div className="w-full max-w-md text-center">
        {!loadTimedOut ? (
          <>
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
            <p className="text-base font-semibold text-base-content/80 mb-1">Anket yükleniyor…</p>
            <p className="text-sm text-base-content/45">Host uygulaması anket verisini hazırlıyor.</p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-2xl bg-error/10 flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-error">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
            </div>
            <p className="text-base font-semibold text-base-content/80 mb-2">Anket bulunamadı</p>
            <p className="text-sm text-base-content/45 leading-relaxed">
              Bu sayfa yalnızca üst uygulama tarafından açılmalıdır. Anket verisi{' '}
              <code className="text-xs bg-base-200 px-1.5 py-0.5 rounded-md">window.__SURVEY_DATA__</code>{' '}
              ile enjekte edilmelidir.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
