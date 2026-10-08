import { PageView, metadataFor } from "@/components/page-view";
export const metadata = metadataFor("/");
export default function Home() {
  return <PageView path="/" />;
}
