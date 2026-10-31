import { Flag } from "lucide-react";
import type { Event } from "@/lib/model";
import { eventPresentation } from "@/lib/event-presentation";

export function EventIllustration({
  event,
}: {
  event: Pick<Event, "id" | "direction">;
}) {
  const art = eventPresentation(event);
  return art.file ? (
    <img
      className="event-illustration"
      src={`/images/events/${art.file}`}
      width={240}
      height={144}
      alt={art.alt}
      loading="lazy"
      decoding="async"
    />
  ) : (
    <Flag
      className="event-illustration custom-event-illustration"
      role="img"
      aria-label={art.alt}
    />
  );
}
