interface ProgressBarProps {
  /** 0 to 1 */
  progress: number;
  currentStep: number;
  totalSteps: number;
}

export function ProgressBar({ progress, currentStep, totalSteps }: ProgressBarProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-base-content/40">
          {currentStep + 1} / {totalSteps}
        </span>
        <span className="text-xs font-medium text-base-content/40">
          {Math.round(progress * 100)}%
        </span>
      </div>
      <div className="w-full h-1.5 bg-base-300/40 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}

