import Link from "next/link";
import { Question } from "@/lib/api";

const DIFFICULTY_STYLES = {
  easy: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  hard: "bg-red-100 text-red-700",
};

const DIFFICULTY_LABEL = {
  easy: "简单",
  medium: "中等",
  hard: "困难",
};

interface Props {
  question: Question;
}

export default function QuestionCard({ question }: Props) {
  const diff = question.difficulty as keyof typeof DIFFICULTY_STYLES;

  return (
    <Link href={`/question/${question.id}`}>
      <div className="bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-gray-900 font-medium text-sm leading-snug line-clamp-2 flex-1">
            {question.title}
          </h3>
          <span
            className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_STYLES[diff] ?? "bg-gray-100 text-gray-600"}`}
          >
            {DIFFICULTY_LABEL[diff] ?? diff}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {question.categories.map((c) => (
            <span key={c} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
              {c}
            </span>
          ))}
          {question.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded">
              {t}
            </span>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
          <span>出现 {question.frequency} 次</span>
          {question.companies.length > 0 && (
            <span>{question.companies.slice(0, 3).join(" · ")}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
