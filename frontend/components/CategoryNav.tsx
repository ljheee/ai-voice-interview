"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  categories: string[];
}

export default function CategoryNav({ categories }: Props) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2">
      <Link
        href="/"
        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          pathname === "/"
            ? "bg-blue-600 text-white"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        全部
      </Link>
      {categories.map((cat) => (
        <Link
          key={cat}
          href={`/category/${encodeURIComponent(cat)}`}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            pathname === `/category/${encodeURIComponent(cat)}`
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          {cat}
        </Link>
      ))}
    </nav>
  );
}
