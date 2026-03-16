import type { Question, ConditionalRule, SequentialEdges } from '../types/survey';
import { useSurveyTaker } from '../hooks/useSurveyTaker';
import { ProgressBar } from './ProgressBar';
import { SurveyQuestion } from './SurveyQuestion';

interface SurveyTakerPageProps {
  title: string;
  questions: Question[];
  conditions?: ConditionalRule[];
  sequentialEdges?: SequentialEdges;
  onComplete?: (answers: ReturnType<ReturnType<typeof useSurveyTaker>['getAllAnswers']>) => void;
  onRestart?: () => void;
}

export function SurveyTakerPage({
  title,
  questions,
  conditions = [],
  sequentialEdges,
  onComplete,
  onRestart,
}: SurveyTakerPageProps) {
  const {
    currentStep,
    currentQuestion,
    totalSteps,
    progress,
    isFirst,
    isLast,
    isCompleted,
    isCurrentQuestionRequired,
    isCurrentQuestionAnswered,
    goNext,
    goPrev,
    selectAnswer,
    setTextAnswer,
    getSelectedAnswers,
    getTextAnswer,
    setRatingAnswer,
    getRatingAnswer,
    setMatrixAnswer,
    getMatrixAnswer,
    setSortableAnswer,
    getSortableAnswer,
    reset,
    controlQuestionResults,
    getAllAnswers,
  } = useSurveyTaker(questions, conditions, sequentialEdges);

  // No questions state
  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-base-100 flex flex-col">
        <SurveyHeader title={title} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-base-content/30">
            <p className="text-lg font-medium mb-1">Soru bulunamadı</p>
            <p className="text-sm">Bu ankette henüz soru bulunmuyor</p>
          </div>
        </div>
      </div>
    );
  }

  // Completed state
  if (isCompleted) {
    const answers = getAllAnswers();
    return (
      <div className="min-h-screen bg-base-100 flex flex-col">
        <SurveyHeader title={title} />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="w-20 h-20 rounded-3xl bg-success/10 flex items-center justify-center mx-auto mb-6">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-base-content/80 mb-2">Tamamlandı!</h2>
            <p className="text-base-content/40 mb-8">Anketi tamamladınız, teşekkürler.</p>
            
            {/* Control Question Results */}
            {Object.keys(controlQuestionResults).length > 0 && (
              <div className="mb-8 max-w-md mx-auto">
                <div className="p-4 rounded-xl bg-base-200/50 border border-base-300/40">
                  <p className="text-sm font-semibold text-base-content/70 mb-3">Kontrol Soruları Sonuçları</p>
                  <div className="space-y-2">
                    {Object.entries(controlQuestionResults).map(([guid, result]) => {
                      const question = questions.find((q) => q.guid === guid);
                      if (!question) return null;
                      return (
                        <div
                          key={guid}
                          className={`p-3 rounded-lg border-2 ${
                            result.isCorrect
                              ? 'border-success/40 bg-success/10'
                              : 'border-error/40 bg-error/10'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {result.isCorrect ? (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success">
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-error">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            )}
                            <span className={`text-xs font-semibold ${result.isCorrect ? 'text-success' : 'text-error'}`}>
                              {result.isCorrect ? 'Doğru' : 'Yanlış'}
                            </span>
                          </div>
                          <p className="text-xs text-base-content/60 mb-1 truncate">{question.text}</p>
                          <p className="text-[10px] text-base-content/40">
                            Verilen: {result.userAnswer.join(', ') || 'Cevap yok'} | Doğru: {result.correctAnswer.join(', ')}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                className="btn btn-ghost btn-sm rounded-xl"
                onClick={() => {
                  reset();
                  onRestart?.();
                }}
              >
                Tekrar Başla
              </button>
              {onComplete && (
                <button
                  className="btn btn-primary btn-sm rounded-xl px-6"
                  onClick={() => onComplete(answers)}
                >
                  Gönder
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-100 flex flex-col">
      <SurveyHeader title={title} />

      {/* Progress */}
      <div className="px-6 sm:px-0 w-full pt-6 sm:max-w-xl sm:mx-auto">
        <ProgressBar
          progress={progress}
          currentStep={currentStep}
          totalSteps={totalSteps}
        />
      </div>

      {/* Main body = Question */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex items-center justify-center overflow-y-auto">
          <div className="w-full max-w-2xl px-6 py-10">
            {currentQuestion && (
              <SurveyQuestion
                key={currentQuestion.guid}
                question={currentQuestion}
                selectedAnswers={getSelectedAnswers(currentQuestion.guid)}
                onSelectAnswer={selectAnswer}
                textValue={getTextAnswer(currentQuestion.guid)}
                onTextChange={setTextAnswer}
                ratingValue={getRatingAnswer(currentQuestion.guid)}
                onRatingChange={setRatingAnswer}
                matrixValue={getMatrixAnswer(currentQuestion.guid)}
                onMatrixChange={setMatrixAnswer}
                sortableValue={getSortableAnswer(currentQuestion.guid)}
                onSortableChange={setSortableAnswer}
              />
            )}
          </div>
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="border-t border-base-300/30 bg-base-100">
        <div className="max-w-xl mx-auto px-6 py-4">
          {/* Required warning */}
          {isCurrentQuestionRequired && !isCurrentQuestionAnswered && (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-warning/10 border border-warning/20 text-warning text-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
              <span>Bu soru zorunludur, lütfen cevaplayın</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              className={`btn btn-ghost btn-sm rounded-xl gap-2 ${isFirst ? 'invisible' : ''}`}
              onClick={goPrev}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Geri
            </button>

            <button
              className={`btn btn-sm rounded-xl px-6 gap-2 ${
                isCurrentQuestionRequired && !isCurrentQuestionAnswered
                  ? 'btn-disabled bg-base-300/40 text-base-content/30 cursor-not-allowed'
                  : 'btn-primary'
              }`}
              onClick={goNext}
              disabled={isCurrentQuestionRequired && !isCurrentQuestionAnswered}
            >
              {isLast ? 'Tamamla' : 'İleri'}
              {!isLast && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Survey header */
function SurveyHeader({ title }: { title: string }) {
  return (
    <header className="flex items-center gap-4 px-5 py-3 border-b border-base-300/30">
      <div className="flex-1">
        <span className="text-xs font-medium text-primary/60 uppercase tracking-wider">Anket</span>
        <h1 className="text-sm font-semibold text-base-content/70 truncate">{title}</h1>
      </div>
    </header>
  );
}

