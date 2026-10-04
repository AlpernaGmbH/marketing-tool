import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolPageLayout } from "@/components/tool/ToolPageLayout";
import { readToolContent } from "@/lib/content";
import { SITE_URL, serializeJsonLd, toolJsonLd } from "@/lib/jsonld";
import { getTool, getTools } from "@/lib/registry";
import { ToolMount } from "@/components/tool/ToolMount";

type Params = { slug: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return getTools().map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) return {};
  const { frontmatter: fm } = readToolContent(slug);
  const url = `${SITE_URL}/tools/${slug}`;
  return {
    title: { absolute: fm.title ?? tool.name },
    description: fm.description,
    alternates: { canonical: url },
    openGraph: { title: fm.title ?? tool.name, description: fm.description, url, type: "website", locale: "de_CH" },
  };
}

export default async function ToolPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const config = getTool(slug);
  if (!config) notFound();

  const content = readToolContent(slug);

  const jsonLd = toolJsonLd(
    config,
    { h1: content.frontmatter.h1 ?? config.name, description: content.frontmatter.description ?? config.tagline },
    content.faq,
  );

  return (
    <>
      {jsonLd.map((block, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(block) }} />
      ))}
      <ToolPageLayout config={config} content={content}>
        <ToolMount slug={slug} />
      </ToolPageLayout>
    </>
  );
}
