import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Interview Hub",
  description: "Java 后端面试题库",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <a href="/" className="font-bold text-blue-600 text-lg">
              AI Interview Hub
            </a>
            <div className="flex items-center gap-4">
              <a href="/search" className="text-sm text-gray-500 hover:text-gray-800">
                搜索
              </a>
              <a
                href="/interview/setup"
                className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                开始面试
              </a>
            </div>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
