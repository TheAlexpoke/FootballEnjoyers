import TournamentApp from "@/components/tournament-app";
import { notFound } from "next/navigation";
import { hostedReadOnly } from "@/lib/server/local-mode";
export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug = [] } = await params;
  const publicOnly = hostedReadOnly();
  if (publicOnly && slug.length && (slug[0] !== "events" || slug.length > 2))
    notFound();
  return <TournamentApp publicOnly={publicOnly} />;
}
