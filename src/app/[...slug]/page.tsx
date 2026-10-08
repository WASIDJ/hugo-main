import { notFound } from "next/navigation";
import { site } from "@/lib/site";
import { PageView, metadataFor } from "@/components/page-view";
export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(site.routes)
    .filter((p) => p !== "/")
    .map((p) => ({ slug: p.split("/").filter(Boolean) }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  return metadataFor("/" + slug.map(decodeURIComponent).join("/") + "/");
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const path = "/" + slug.map(decodeURIComponent).join("/") + "/";
  if (!site.routes[path]) notFound();
  return <PageView path={path} />;
}
