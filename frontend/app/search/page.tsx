import { api } from "@/lib/api";
import QuestionCard from "@/components/QuestionCard";
import SearchBar from "@/components/SearchBar";

interface Props {
  searchParams: { q?: string; type?: string };
}

export default async function SearchPage({ searchParams }: Props) {
  const query = searchParams.q || "";
  const type = (searchParams.type === "semantic" ? "semantic" : "keyword") as
    | "keyword"
    | "semantic";

  const results = query ? await api.search(query, type) : [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">搜索面试题</h1>

      <SearchBar defaultQuery={query} defaultType={type} />

      {query && (
        <p className="text-sm text-gray-500">
          "{query}" — {type === "semantic" ? "语义搜索" : "关键词搜索"}，找到 {results.length} 条
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {results.map((q) => (
          <QuestionCard key={q.id} question={q} />
        ))}
      </div>

      {query && results.length === 0 && (
        <p className="text-center text-gray-400 py-12">暂无结果，换个关键词试试</p>
      )}
    </div>
  );
}
