import Link from "@/components/link";
export default function NotFound() {
  return (
    <main className="not-found">
      <span className="eyebrow">WORKSPACE / 404</span>
      <h1>这个路径没有内容。</h1>
      <p>也许它还只是一个想法。</p>
      <Link className="primary-button" href="/">
        回到个人工作台 →
      </Link>
      <Link href="/post/">浏览文章</Link>
    </main>
  );
}
