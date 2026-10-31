import "server-only";
import type { State, PublicState } from "../model";
import { movement, phase } from "../scoring";
export function publicState(
  s: State,
  configured: boolean,
  device = "",
): PublicState {
  const { audit: _audit, ...rest } = s;
  return {
    ...rest,
    participants: s.participants.map(
      ({ credentialHash: _c, deviceHash: _d, ...p }) => p,
    ),
    standings: movement(s),
    phase: phase(s),
    configured,
    me: s.participants.find((p) => device && p.deviceHash === device)?.id,
    // Player catalog is server cache; avoid downloading 10k NFL players per spectator poll.
    fantasy: {
      ...s.fantasy,
      players: {},
      users: [],
      rosters: [],
      manualMappings: [],
    },
  };
}
