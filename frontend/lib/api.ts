export interface Question {
  id: string;
  title: string;
  content?: string;
  follow_ups: string[];
  categories: string[];
  tags: string[];
  difficulty: "easy" | "medium" | "hard";
  frequency: number;
  companies: string[];
  source_urls: string[];
  created_at?: string;
  updated_at?: string;
}

export interface QuestionList {
  items: Question[];
  total: number;
  page: number;
  size: number;
}

function makeApi(baseUrl: string) {
  async function apiFetch<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
    return res.json();
  }

  return {
    listQuestions: (params?: { category?: string; page?: number; size?: number }) => {
      const q = new URLSearchParams();
      if (params?.category) q.set("category", params.category);
      if (params?.page) q.set("page", String(params.page));
      if (params?.size) q.set("size", String(params.size));
      const qs = q.toString() ? `?${q}` : "";
      return apiFetch<QuestionList>(`/api/questions${qs}`);
    },

    getQuestion: (id: string) => apiFetch<Question>(`/api/questions/${id}`),

    search: (q: string, type: "keyword" | "semantic" = "keyword") =>
      apiFetch<Question[]>(`/api/questions/search?q=${encodeURIComponent(q)}&type=${type}`),

    listCategories: () => apiFetch<string[]>("/api/categories"),

    listCompanies: () => apiFetch<string[]>("/api/companies"),
  };
}

export const api = makeApi(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");
export { makeApi };
