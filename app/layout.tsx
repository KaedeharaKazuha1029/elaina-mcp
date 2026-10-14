import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "伊蕾娜 · Elaina Skill",
  description: "私有人格、持久对话记忆与原作证据检索 MCP 服务。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
