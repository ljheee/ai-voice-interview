import { api } from "@/lib/api";
import CategoryNav from "@/components/CategoryNav";
import QuestionCard from "@/components/QuestionCard";
import SearchBar from "@/components/SearchBar";

interface Props {
  params: { name: string };
  searchParams: { page?: string };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const category = decodeURIComponent(params.name);
  const page = Number(searchParams.page || 1);

  const [{ items: questions, total }, categories] = await Promise.all([
    api.listQuestions({ category, page, size: 20 }),
    api.listCategories(),
  ]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{category}</h1>
        <p className="text-gray-500 text-sm">共 {total} 道题，按频次排序</p>
      </div>

      <SearchBar />

      <CategoryNav categories={categories} />

      <div className="grid gap-3 sm:grid-cols-2">
        {questions.map((q) => (
          <QuestionCard key={q.id} question={q} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <a
              href={`/category/${params.name}?page=${page - 1}`}
              className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              上一页
            </a>
          )}
          <span className="px-4 py-2 text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <a
              href={`/category/${params.name}?page=${page + 1}`}
              className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              下一页
            </a>
          )}
        </div>
      )}
    </div>
  );
}
