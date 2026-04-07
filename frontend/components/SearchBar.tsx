"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  defaultQuery?: string;
  defaultType?: "keyword" | "semantic";
}

export default function SearchBar({ defaultQuery = "", defaultType = "keyword" }: Props) {
  const [query, setQuery] = useState(defaultQuery);
  const [type, setType] = useState<"keyword" | "semantic">(defaultType);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}&type=${type}`);
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="flex rounded-lg border border-gray-300 overflow-hidden flex-1 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as "keyword" | "semantic")}
          className="bg-gray-50 border-r border-gray-300 px-3 text-sm text-gray-600 outline-none"
        >
          <option value="keyword">关键词</option>
          <option value="semantic">语义</option>
        </select>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索面试题..."
          className="flex-1 px-4 py-2.5 text-sm outline-none"
        />
      </div>
      <button
        type="submit"
        className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        搜索
      </button>
    </form>
  );
}
