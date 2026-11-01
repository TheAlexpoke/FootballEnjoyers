import TournamentApp from "@/components/tournament-app";
import { notFound } from "next/navigation";
import { hostedReadOnly } from "@/lib/server/local-mode";
import { sharedSnapshot } from "@/lib/server/shared-snapshot";
export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug = [] } = await params;
  const publicOnly = hostedReadOnly();
  if (
    publicOnly &&
    slug.length &&
    !(
      (slug[0] === "events" && slug.length <= 2) ||
      (slug[0] === "history" && slug.length === 1) ||
      (slug[0] === "players" &&
        slug.length === 2 &&
        sharedSnapshot().participants.some((player) => player.id === slug[1]))
    )
  )
    notFound();
  return <TournamentApp publicOnly={publicOnly} />;
}
