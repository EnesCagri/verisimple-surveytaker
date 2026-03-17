import { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import type { Question } from '../types/survey';
import { QuestionType } from '../types/survey';

// Helper function to convert file to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Helper function to handle image files
async function handleImageFile(file: File, editor: any) {
  if (!file.type.startsWith('image/')) {
    alert('Lütfen bir görsel dosyası seçin.');
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert('Görsel boyutu 5MB\'dan küçük olmalıdır.');
    return;
  }

  try {
    const base64 = await fileToBase64(file);
    editor.chain().focus().setImage({ src: base64 }).run();
  } catch (error) {
    console.error('Error loading image:', error);
    alert('Görsel yüklenirken bir hata oluştu.');
  }
}

interface SurveyQuestionProps {
  question: Question;
  selectedAnswers: string[];
  onSelectAnswer: (questionGuid: string, answer: string, isMultiple: boolean) => void;
  textValue?: string;
  onTextChange?: (questionGuid: string, text: string) => void;
  ratingValue?: number;
  onRatingChange?: (questionGuid: string, value: number) => void;
  matrixValue?: Record<number, string[]>;
  onMatrixChange?: (questionGuid: string, rowIndex: number, column: string, isMultiple: boolean) => void;
  sortableValue?: string[];
  onSortableChange?: (questionGuid: string, orderedItems: string[]) => void;
}

export function SurveyQuestion({
  question,
  selectedAnswers,
  onSelectAnswer,
  textValue = '',
  onTextChange,
  ratingValue = 0,
  onRatingChange,
  matrixValue = {},
  onMatrixChange,
  sortableValue,
  onSortableChange,
}: SurveyQuestionProps) {
  switch (question.type) {
    case QuestionType.TextEntry:
      return (
        <TextEntryPreview
          question={question}
          value={textValue}
          onChange={(text) => onTextChange?.(question.guid, text)}
        />
      );
    case QuestionType.Rating:
      return (
        <RatingPreview
          question={question}
          value={ratingValue}
          onChange={(val) => onRatingChange?.(question.guid, val)}
        />
      );
    case QuestionType.MatrixLikert:
      return (
        <MatrixLikertPreview
          question={question}
          value={matrixValue}
          onChange={(row, col, multi) => onMatrixChange?.(question.guid, row, col, multi)}
        />
      );
    case QuestionType.Sortable:
      return (
        <SortablePreview
          question={question}
          value={sortableValue ?? question.answers.filter(Boolean)}
          onChange={(items) => onSortableChange?.(question.guid, items)}
        />
      );
    case QuestionType.RichText:
      return (
        <RichTextPreview
          question={question}
          value={textValue}
          onChange={(text) => onTextChange?.(question.guid, text)}
        />
      );
    default:
      return (
        <ChoicePreview
          question={question}
          selectedAnswers={selectedAnswers}
          onSelectAnswer={onSelectAnswer}
        />
      );
  }
}

/* ═══════════════════════════════════════════
   Choice Preview (SingleChoice / MultipleChoice)
   ═══════════════════════════════════════════ */

function ChoicePreview({
  question,
  selectedAnswers,
  onSelectAnswer,
}: {
  question: Question;
  selectedAnswers: string[];
  onSelectAnswer: (guid: string, answer: string, isMultiple: boolean) => void;
}) {
  const isMultiple = question.type === QuestionType.MultipleChoice;

  const answerImages = question.settings?.answerImages ?? {};
  const hasAnyImage = Object.keys(answerImages).length > 0;

  return (
    <div className="animate-[fadeSlideIn_0.4s_ease-out]">
      <div className="flex items-start gap-3 mb-2">
        <h2 className="text-2xl font-semibold text-base-content/85 leading-snug flex-1">
          {question.text || 'Soru metni girilmemiş'}
        </h2>
        {question.required && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-error/10 text-error border border-error/20 shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
            Zorunlu
          </span>
        )}
      </div>

      {/* Question image */}
      {question.image && (
        <div className="mb-6 rounded-xl overflow-hidden border border-base-300/30">
          <img src={question.image} alt="" className="w-full max-h-72 object-contain bg-base-200/30" />
        </div>
      )}

      <p className="text-sm text-base-content/35 mb-8">
        {isMultiple ? 'Birden fazla seçenek işaretleyebilirsiniz' : 'Bir seçenek seçin'}
      </p>

      {/* Grid layout for image answers, list layout for text-only */}
      <div className={hasAnyImage ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
        {question.answers.filter(Boolean).map((answer, index) => {
          const isSelected = selectedAnswers.includes(answer);
          const answerImage = answerImages[answer];
          return (
            <button
              key={index}
              className={`
                w-full text-left rounded-2xl border-2 transition-all duration-200 ease-out group
                ${hasAnyImage ? 'p-3 flex flex-col' : 'px-5 py-4 flex items-center gap-4'}
                ${isSelected
                  ? 'border-primary bg-primary/4 shadow-sm'
                  : 'border-base-300/50 bg-base-100 hover:border-primary/30 hover:shadow-sm'
                }
              `}
              onClick={() => onSelectAnswer(question.guid, answer, isMultiple)}
            >
              {/* Answer image */}
              {answerImage && (
                <div className="mb-3 rounded-xl overflow-hidden bg-base-200/30">
                  <img
                    src={answerImage}
                    alt={answer}
                    className="w-full h-32 object-contain"
                  />
                </div>
              )}

              <div className={`flex items-center gap-3 ${hasAnyImage ? 'w-full' : 'flex-1'}`}>
                <span
                  className={`
                    shrink-0 w-6 h-6 flex items-center justify-center transition-all duration-200
                    ${isMultiple ? 'rounded-md' : 'rounded-full'}
                    ${isSelected
                      ? 'bg-primary text-primary-content'
                      : 'border-2 border-base-300/60 group-hover:border-primary/40'
                    }
                  `}
                >
                  {isSelected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
                <span className="flex items-center gap-3 flex-1">
                  <span className={`
                    inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold shrink-0 transition-colors duration-200
                    ${isSelected ? 'bg-primary/15 text-primary' : 'bg-base-200/60 text-base-content/40'}
                  `}>
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className={`text-base transition-colors duration-200 ${isSelected ? 'text-base-content/90 font-medium' : 'text-base-content/60'}`}>
                    {answer}
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Text Entry Preview
   ═══════════════════════════════════════════ */

function TextEntryPreview({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string;
  onChange: (text: string) => void;
}) {
  const maxLength = question.settings?.maxLength ?? 1250;
  const placeholder = question.settings?.placeholder || 'Cevabınızı buraya yazın...';
  const charCount = value.length;
  const isNearLimit = charCount > maxLength * 0.9;
  const isOverLimit = charCount > maxLength;

  return (
    <div className="animate-[fadeSlideIn_0.4s_ease-out]">
      <div className="flex items-start gap-3 mb-2">
        <h2 className="text-2xl font-semibold text-base-content/85 leading-snug flex-1">
          {question.text || 'Soru metni girilmemiş'}
        </h2>
        {question.required && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-error/10 text-error border border-error/20 shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
            Zorunlu
          </span>
        )}
      </div>

      {/* Question image */}
      {question.image && (
        <div className="mb-6 rounded-xl overflow-hidden border border-base-300/30">
          <img src={question.image} alt="" className="w-full max-h-72 object-contain bg-base-200/30" />
        </div>
      )}

      <p className="text-sm text-base-content/35 mb-8">Cevabınızı aşağıya yazın</p>

      <div className="relative">
        <textarea
          className={`
            textarea w-full min-h-36 resize-y rounded-2xl border-2 bg-base-100 px-5 py-4
            text-base leading-relaxed transition-all duration-200
            focus:outline-none
            ${isOverLimit
              ? 'border-error/60 focus:border-error'
              : 'border-base-300/50 focus:border-primary/40'
            }
          `}
          placeholder={placeholder}
          value={value}
          maxLength={maxLength + 50}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
        />
        <div className="flex items-center justify-end mt-2 px-1">
          <span
            className={`
              text-xs font-medium transition-colors duration-200
              ${isOverLimit ? 'text-error' : isNearLimit ? 'text-warning' : 'text-base-content/30'}
            `}
          >
            {charCount.toLocaleString('tr-TR')} / {maxLength.toLocaleString('tr-TR')}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Rating Preview (Star rating)
   ═══════════════════════════════════════════ */

function RatingPreview({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: number;
  onChange: (value: number) => void;
}) {
  const ratingCount = question.settings?.ratingCount ?? 5;
  const labels = question.settings?.ratingLabels ?? { low: '', high: '' };
  const [hovered, setHovered] = useState(0);

  const displayValue = hovered || value;

  return (
    <div className="animate-[fadeSlideIn_0.4s_ease-out]">
      <div className="flex items-start gap-3 mb-2">
        <h2 className="text-2xl font-semibold text-base-content/85 leading-snug flex-1">
          {question.text || 'Soru metni girilmemiş'}
        </h2>
        {question.required && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-error/10 text-error border border-error/20 shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
            Zorunlu
          </span>
        )}
      </div>

      {/* Question image */}
      {question.image && (
        <div className="mb-6 rounded-xl overflow-hidden border border-base-300/30">
          <img src={question.image} alt="" className="w-full max-h-72 object-contain bg-base-200/30" />
        </div>
      )}

      <p className="text-sm text-base-content/35 mb-8">Derecelendirme yapın</p>

      <div className="flex flex-col items-center gap-4">
        {/* Stars */}
        <div
          className="flex items-center gap-2"
          onMouseLeave={() => setHovered(0)}
        >
          {Array.from({ length: ratingCount }, (_, i) => {
            const starValue = i + 1;
            const isFilled = starValue <= displayValue;
            return (
              <button
                key={i}
                className="group p-1 transition-transform duration-150 hover:scale-110 focus:outline-none"
                onMouseEnter={() => setHovered(starValue)}
                onClick={() => onChange(starValue)}
              >
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill={isFilled ? 'oklch(75% 0.18 60)' : 'none'}
                  stroke={isFilled ? 'oklch(75% 0.18 60)' : 'oklch(70% 0.02 280)'}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-all duration-200"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </button>
            );
          })}
        </div>

        {/* Endpoint labels */}
        {(labels.low || labels.high) && (
          <div className="flex justify-between w-full max-w-xs text-xs text-base-content/40">
            <span>{labels.low}</span>
            <span>{labels.high}</span>
          </div>
        )}

        {/* Selected value indicator */}
        {value > 0 && (
          <div className="text-sm font-medium text-primary/70">
            {value} / {ratingCount}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Rich Text Response Area Component
   ═══════════════════════════════════════════ */

function RichTextResponseArea({
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  maxLength: number;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      if (text.length <= maxLength) {
        onChange(html);
      } else {
        editor.commands.setContent(value || '');
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[150px] max-h-[300px] overflow-y-auto px-4 py-3 text-sm leading-relaxed',
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            handleImageFile(file, editor);
            return true;
          }
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) {
                handleImageFile(file, editor);
                return true;
              }
            }
          }
        }
        return false;
      },
    },
  });

  // Update editor when value changes externally
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '');
    }
  }, [value, editor]);

  // Add drag & drop handlers to editor container
  useEffect(() => {
    if (!editor) return;

    const editorElement = editor.view.dom;
    
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const file = e.dataTransfer?.files[0];
      if (file && file.type.startsWith('image/')) {
        await handleImageFile(file, editor);
      }
    };

    editorElement.addEventListener('dragover', handleDragOver);
    editorElement.addEventListener('dragleave', handleDragLeave);
    editorElement.addEventListener('drop', handleDrop);

    return () => {
      editorElement.removeEventListener('dragover', handleDragOver);
      editorElement.removeEventListener('dragleave', handleDragLeave);
      editorElement.removeEventListener('drop', handleDrop);
    };
  }, [editor]);

  // Close link input when clicking outside
  useEffect(() => {
    if (!showLinkInput) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.link-input-container')) {
        setShowLinkInput(false);
        setLinkUrl('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showLinkInput]);

  if (!editor) {
    return <div className="h-48 bg-base-200/30 rounded-xl animate-pulse" />;
  }

  const textLength = editor.getText().length;
  const isNearLimit = textLength > maxLength * 0.9;
  const isOverLimit = textLength > maxLength;

  return (
    <div>
      <p className="text-sm text-base-content/50 mb-3">Yanıtınızı aşağıya yazın</p>
      
      {/* Simple Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-2 border-b-0 border-base-300/60 bg-base-200/40 rounded-t-xl flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && editor) {
              handleImageFile(file, editor);
            }
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }}
        />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded-lg transition-colors ${
            editor.isActive('bold')
              ? 'bg-primary/15 text-primary'
              : 'text-base-content/50 hover:bg-base-200 hover:text-base-content/70'
          }`}
          title="Kalın"
        >
          <span className="text-xs font-bold w-5 h-5 flex items-center justify-center">B</span>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded-lg transition-colors ${
            editor.isActive('italic')
              ? 'bg-primary/15 text-primary'
              : 'text-base-content/50 hover:bg-base-200 hover:text-base-content/70'
          }`}
          title="İtalik"
        >
          <span className="text-xs italic w-5 h-5 flex items-center justify-center">I</span>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`p-1.5 rounded-lg transition-colors ${
            editor.isActive('underline')
              ? 'bg-primary/15 text-primary'
              : 'text-base-content/50 hover:bg-base-200 hover:text-base-content/70'
          }`}
          title="Altı Çizili"
        >
          <span className="text-xs underline w-5 h-5 flex items-center justify-center">U</span>
        </button>
        <div className="w-px h-5 bg-base-300/60 mx-1" />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-1.5 rounded-lg transition-colors ${
            editor.isActive('bulletList')
              ? 'bg-primary/15 text-primary'
              : 'text-base-content/50 hover:bg-base-200 hover:text-base-content/70'
          }`}
          title="Madde İşareti"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
            <circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-1.5 rounded-lg transition-colors ${
            editor.isActive('orderedList')
              ? 'bg-primary/15 text-primary'
              : 'text-base-content/50 hover:bg-base-200 hover:text-base-content/70'
          }`}
          title="Numaralı Liste"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" />
            <path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
          </svg>
        </button>
        <div className="w-px h-5 bg-base-300/60 mx-1" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded-lg transition-colors text-base-content/50 hover:bg-base-200 hover:text-base-content/70"
          title="Görsel Ekle"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
        </button>
        <div className="relative link-input-container">
          <button
            type="button"
            onClick={() => {
              const previousUrl = editor.getAttributes('link').href;
              if (previousUrl) {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
                setShowLinkInput(false);
                setLinkUrl('');
              } else {
                setLinkUrl('');
                setShowLinkInput(true);
                setTimeout(() => linkInputRef.current?.focus(), 0);
              }
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive('link')
                ? 'bg-primary/15 text-primary'
                : 'text-base-content/50 hover:bg-base-200 hover:text-base-content/70'
            }`}
            title={editor.isActive('link') ? 'Bağlantıyı Kaldır' : 'Bağlantı Ekle'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
          
          {/* Link Input Popup */}
          {showLinkInput && (
            <div className="absolute top-full left-0 mt-2 p-3 bg-base-100 border-2 border-base-300/60 rounded-xl shadow-lg z-50 min-w-[300px]">
              <div className="flex items-center gap-2">
                <input
                  ref={linkInputRef}
                  type="text"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (linkUrl.trim()) {
                        let url = linkUrl.trim();
                        if (!url.match(/^https?:\/\//)) {
                          url = 'https://' + url;
                        }
                        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
                        setShowLinkInput(false);
                        setLinkUrl('');
                        editor.commands.focus();
                      }
                    } else if (e.key === 'Escape') {
                      setShowLinkInput(false);
                      setLinkUrl('');
                      editor.commands.focus();
                    }
                  }}
                  placeholder="https://example.com"
                  className="input input-sm input-bordered flex-1 rounded-lg text-sm"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    if (linkUrl.trim()) {
                      let url = linkUrl.trim();
                      if (!url.match(/^https?:\/\//)) {
                        url = 'https://' + url;
                      }
                      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
                      setShowLinkInput(false);
                      setLinkUrl('');
                      editor.commands.focus();
                    }
                  }}
                  className="btn btn-sm btn-primary rounded-lg px-3"
                  title="Ekle (Enter)"
                >
                  Ekle
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLinkInput(false);
                    setLinkUrl('');
                    editor.commands.focus();
                  }}
                  className="btn btn-sm btn-ghost rounded-lg px-2"
                  title="İptal (Esc)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-base-content/40 mt-2">
                Metni seçin, bağlantı butonuna tıklayın ve URL'yi girin
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className={`rounded-b-xl border-2 bg-base-100 overflow-hidden transition-all duration-200 ${
        isOverLimit
          ? 'border-error/60'
          : isDragging
          ? 'border-primary/60 border-dashed bg-primary/5'
          : 'border-base-300/60'
      }`}>
        <EditorContent editor={editor} />
      </div>

      {/* Character count */}
      <div className="flex items-center justify-end mt-2 px-1">
        <span
          className={`
            text-xs font-medium transition-colors duration-200
            ${isOverLimit ? 'text-error' : isNearLimit ? 'text-warning' : 'text-base-content/30'}
          `}
        >
          {textLength.toLocaleString('tr-TR')} / {maxLength.toLocaleString('tr-TR')}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Rich Text Preview
   ═══════════════════════════════════════════ */

function RichTextPreview({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string;
  onChange: (text: string) => void;
}) {
  const hasResponse = question.settings?.hasResponse ?? false;
  const maxLength = question.settings?.responseMaxLength ?? 2000;
  const placeholder = question.settings?.responsePlaceholder || 'Cevabınızı yazın...';
  const richContent = question.settings?.richContent ?? '';

  return (
    <div className="animate-[fadeSlideIn_0.4s_ease-out]">
      {/* Question title (if any) */}
      {question.text && (
        <div className="flex items-start gap-3 mb-4">
          <h2 className="text-2xl font-semibold text-base-content/85 leading-snug flex-1">
            {question.text}
          </h2>
          {question.required && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-error/10 text-error border border-error/20 shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
              Zorunlu
            </span>
          )}
        </div>
      )}

      {/* Rich text content */}
      {richContent && (
        <div
          className="prose prose-sm max-w-none text-base-content/80 mb-6 p-5 rounded-2xl bg-base-200/30 border border-base-300/30"
          dangerouslySetInnerHTML={{ __html: richContent }}
        />
      )}

      {/* Response area (optional) */}
      {hasResponse && (
        <RichTextResponseArea
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          maxLength={maxLength}
        />
      )}

      {/* No response area message */}
      {!hasResponse && !richContent && (
        <div className="text-center py-8 text-base-content/30">
          <p className="text-sm">Bilgilendirme içeriği henüz eklenmemiş</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Sortable Preview (Drag & Drop ranking)
   ═══════════════════════════════════════════ */

function SortableItem({
  item,
  index,
  rank,
}: {
  item: string;
  index: number;
  rank: number;
}) {
  const { ref, isDragging } = useSortable({
    id: item,
    index,
  });

  return (
    <div
      ref={ref}
      className={`
        flex items-center gap-3 px-5 py-4 rounded-2xl border-2 bg-base-100 cursor-grab active:cursor-grabbing
        transition-all duration-200 select-none group
        ${isDragging
          ? 'border-primary/50 bg-primary/4 shadow-lg scale-[1.02] opacity-80 z-50'
          : 'border-base-300/50 hover:border-primary/30 hover:shadow-sm'
        }
      `}
    >
      {/* Rank number */}
      <span
        className={`
          inline-flex items-center justify-center w-8 h-8 rounded-xl text-sm font-bold shrink-0 transition-colors duration-200
          ${isDragging ? 'bg-primary text-primary-content' : 'bg-primary/10 text-primary/70'}
        `}
      >
        {rank}
      </span>

      {/* Drag handle icon */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="currentColor"
        className={`shrink-0 transition-opacity ${isDragging ? 'text-primary opacity-80' : 'text-base-content/20 group-hover:text-base-content/40 opacity-60'}`}
      >
        <circle cx="5" cy="3" r="1.3" />
        <circle cx="11" cy="3" r="1.3" />
        <circle cx="5" cy="8" r="1.3" />
        <circle cx="11" cy="8" r="1.3" />
        <circle cx="5" cy="13" r="1.3" />
        <circle cx="11" cy="13" r="1.3" />
      </svg>

      {/* Item text */}
      <span className={`text-base flex-1 transition-colors duration-200 ${isDragging ? 'text-primary font-medium' : 'text-base-content/70'}`}>
        {item}
      </span>

      {/* Up/Down arrows hint */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-base-content/15 group-hover:text-base-content/30 transition-colors"
      >
        <path d="M12 5v14" />
        <path d="m18 13-6 6-6-6" />
        <path d="m18 11-6-6-6 6" />
      </svg>
    </div>
  );
}

function SortablePreview({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string[];
  onChange: (items: string[]) => void;
}) {
  const items = value.length > 0 ? value : question.answers.filter(Boolean);

  const handleDragEnd = (event: Parameters<NonNullable<React.ComponentProps<typeof DragDropProvider>['onDragEnd']>>[0]) => {
    const source = event.operation.source;
    const target = event.operation.target;
    if (!source || !target) return;

    const sourceId = String(source.id);
    const targetId = String(target.id);
    if (sourceId === targetId) return;

    const oldIndex = items.indexOf(sourceId);
    const newIndex = items.indexOf(targetId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...items];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    onChange(reordered);
  };

  return (
    <div className="animate-[fadeSlideIn_0.4s_ease-out]">
      <div className="flex items-start gap-3 mb-2">
        <h2 className="text-2xl font-semibold text-base-content/85 leading-snug flex-1">
          {question.text || 'Soru metni girilmemiş'}
        </h2>
        {question.required && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-error/10 text-error border border-error/20 shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
            Zorunlu
          </span>
        )}
      </div>

      {/* Question image */}
      {question.image && (
        <div className="mb-6 rounded-xl overflow-hidden border border-base-300/30">
          <img src={question.image} alt="" className="w-full max-h-72 object-contain bg-base-200/30" />
        </div>
      )}

      <p className="text-sm text-base-content/35 mb-8">
        Öğeleri sürükleyerek tercih sıranıza göre sıralayın
      </p>

      {items.length === 0 ? (
        <p className="text-center py-8 text-base-content/30 text-sm">Sıralama öğesi eklenmemiş</p>
      ) : (
        <DragDropProvider onDragEnd={handleDragEnd}>
          <div className="flex flex-col gap-2.5">
            {items.map((item, index) => (
              <SortableItem
                key={item}
                item={item}
                index={index}
                rank={index + 1}
              />
            ))}
          </div>
        </DragDropProvider>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Matrix Likert Preview
   ═══════════════════════════════════════════ */

function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    try { return window.innerWidth < breakpoint; } catch { return false; }
  });

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}

function MatrixLikertPreview({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: Record<number, string[]>;
  onChange: (rowIndex: number, column: string, isMultiple: boolean) => void;
}) {
  const rows = (question.settings?.rows ?? []).filter(Boolean);
  const columns = (question.settings?.columns ?? []).filter(Boolean);
  const matrixType = question.settings?.matrixType ?? 'single';
  const isMultiple = matrixType === 'multiple';
  const isMobile = useIsMobile();
  const [expandedRow, setExpandedRow] = useState<number | null>(0);

  if (rows.length === 0 || columns.length === 0) {
    return (
      <div className="animate-[fadeSlideIn_0.4s_ease-out]">
        <h2 className="text-2xl font-semibold text-base-content/85 mb-2 leading-snug">
          {question.text || 'Soru metni girilmemiş'}
        </h2>
        <p className="text-sm text-base-content/40 mt-6">
          Bu soru henüz yapılandırılmamış (satır/sütun eksik).
        </p>
      </div>
    );
  }

  return (
    <div className="animate-[fadeSlideIn_0.4s_ease-out]">
      <div className="flex items-start gap-3 mb-2">
        <h2 className="text-2xl font-semibold text-base-content/85 leading-snug flex-1">
          {question.text || 'Soru metni girilmemiş'}
        </h2>
        {question.required && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-error/10 text-error border border-error/20 shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
            Zorunlu
          </span>
        )}
      </div>

      {question.image && (
        <div className="mb-6 rounded-xl overflow-hidden border border-base-300/30">
          <img src={question.image} alt="" className="w-full max-h-72 object-contain bg-base-200/30" />
        </div>
      )}

      <p className="text-sm text-base-content/35 mb-8">
        {isMultiple
          ? 'Her satır için birden fazla seçenek işaretleyebilirsiniz'
          : 'Her satır için bir seçenek seçin'}
      </p>

      {/* Desktop: table layout */}
      {!isMobile && (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left pb-4 pr-4 text-base-content/50 font-medium min-w-[140px]" />
                {columns.map((col, ci) => (
                  <th key={ci} className="text-center pb-4 px-2 text-xs text-base-content/50 font-medium min-w-[80px]">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                const selectedCols = value[ri] ?? [];
                return (
                  <tr key={ri} className="border-t border-base-300/20">
                    <td className="py-4 pr-4 text-base-content/70 font-medium">{row}</td>
                    {columns.map((col, ci) => {
                      const isSelected = selectedCols.includes(col);
                      return (
                        <td key={ci} className="text-center py-4 px-2">
                          <button
                            className="inline-flex items-center justify-center focus:outline-none group"
                            onClick={() => onChange(ri, col, isMultiple)}
                          >
                            <span className={`w-6 h-6 flex items-center justify-center transition-all duration-200 ${isMultiple ? 'rounded-md' : 'rounded-full'} ${isSelected ? 'bg-primary text-primary-content shadow-sm' : 'border-2 border-base-300/50 group-hover:border-primary/40'}`}>
                              {isSelected && (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                              )}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile: accordion card layout */}
      {isMobile && (
        <div className="space-y-2.5">
          {rows.map((row, ri) => {
            const selectedCols = value[ri] ?? [];
            const isOpen = expandedRow === ri;
            const answeredCount = selectedCols.length;

            return (
              <div key={ri} className={`rounded-2xl border-2 transition-all duration-200 overflow-hidden ${isOpen ? 'border-primary/30 bg-primary/2' : 'border-base-300/40 bg-base-100'}`}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                  onClick={() => setExpandedRow(isOpen ? null : ri)}
                >
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold shrink-0 transition-colors ${isOpen ? 'bg-primary/15 text-primary' : 'bg-base-200/60 text-base-content/40'}`}>
                    {ri + 1}
                  </span>
                  <span className={`flex-1 text-sm font-medium truncate transition-colors ${isOpen ? 'text-base-content/85' : 'text-base-content/60'}`}>
                    {row}
                  </span>
                  {answeredCount > 0 && !isOpen && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold shrink-0">
                      {answeredCount}
                    </span>
                  )}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`shrink-0 text-base-content/30 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-2">
                    {columns.map((col, ci) => {
                      const isSelected = selectedCols.includes(col);
                      return (
                        <button
                          key={ci}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all duration-200 text-left ${isSelected ? 'border-primary bg-primary/6' : 'border-base-300/40 bg-base-100 active:bg-base-200/40'}`}
                          onClick={() => onChange(ri, col, isMultiple)}
                        >
                          <span className={`w-5 h-5 flex items-center justify-center shrink-0 transition-all duration-200 ${isMultiple ? 'rounded-md' : 'rounded-full'} ${isSelected ? 'bg-primary text-primary-content' : 'border-2 border-base-300/50'}`}>
                            {isSelected && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            )}
                          </span>
                          <span className={`text-sm flex-1 transition-colors ${isSelected ? 'text-base-content/85 font-medium' : 'text-base-content/55'}`}>
                            {col}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

