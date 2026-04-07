import { notFound } from "next/navigation";
import { api } from "@/lib/api";

const DIFFICULTY_LABEL = { easy: "简单", medium: "中等", hard: "困难" };
const DIFFICULTY_STYLES = {
  easy: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  hard: "bg-red-100 text-red-700",
};

interface Props {
  params: { id: string };
}

export default async function QuestionPage({ params }: Props) {
  const question = await api.getQuestion(params.id).catch(() => notFound());

  const diff = question.difficulty as keyof typeof DIFFICULTY_LABEL;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_STYLES[diff] ?? "bg-gray-100 text-gray-600"}`}
          >
            {DIFFICULTY_LABEL[diff] ?? diff}
          </span>
          <span className="text-sm text-gray-400">出现 {question.frequency} 次</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">{question.title}</h1>
      </div>

      {question.content && question.content !== question.title && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">题目详情</h2>
          <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
            {question.content}
          </p>
        </div>
      )}

      {question.follow_ups.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">常见追问</h2>
          <ul className="space-y-2">
            {question.follow_ups.map((fq, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="text-blue-400 shrink-0">↳</span>
                <span>{fq}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-2">知识点分类</h2>
          <div className="flex flex-wrap gap-1.5">
            {question.categories.map((c) => (
              <a
                key={c}
                href={`/category/${encodeURIComponent(c)}`}
                className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded hover:bg-blue-100"
              >
                {c}
              </a>
            ))}
          </div>
        </div>

        {question.tags.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 mb-2">标签</h2>
            <div className="flex flex-wrap gap-1.5">
              {question.tags.map((t) => (
                <span key={t} className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {question.companies.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 mb-2">出现公司</h2>
            <div className="flex flex-wrap gap-1.5">
              {question.companies.map((c) => (
                <span key={c} className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {question.source_urls.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 mb-2">原始面经</h2>
            <ul className="space-y-1">
              {question.source_urls.map((url, i) => (
                <li key={i}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline truncate block"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <a href="/" className="text-sm text-gray-400 hover:text-gray-600">
        ← 返回题库
      </a>
    </div>
  );
}
