import type { Metadata } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://www.jeffkafka.top"),
  title: { default: "Ryou · 构建，阅读，思考", template: "%s | Ryou" },
  description: "Ryou 的个人工作台：工程实践、开源项目、阅读与个人思考。",
  icons: { icon: "/favicon.svg" },
  openGraph: { siteName: "Ryou's Blog", locale: "zh_CN" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-theme="dark" suppressHydrationWarning>
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "@id": "https://www.jeffkafka.top/#website",
              url: "https://www.jeffkafka.top/",
              name: "Ryou's Blog",
              inLanguage: "zh-CN",
              author: {
                "@type": "Person",
                "@id": "https://www.jeffkafka.top/#person",
                name: "Ryou",
                sameAs: ["https://github.com/WASIDJ"],
              },
            }),
          }}
        />
      </body>
    </html>
  );
}
