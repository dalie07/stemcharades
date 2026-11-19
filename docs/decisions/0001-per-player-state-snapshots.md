# Per-player state snapshots instead of per-step events

**Decision.** The server sends each player a full `room:state` view after every change, built for
that player's role, instead of a separate event for each step of a round (round started, clue accepted, round ended). The only separate server event is `clue:rejected`, which must reach the explainer alone.

**Why.** A snapshot per player makes secret isolation structural: the explainer view is the only place a card
prompt and forbidden list appear, and the accepted answers and explanation exist in no view until the reveal.
There is no broadcast to the room, so a bug cannot leak by sending the wrong event to the wrong audience.
It also makes refresh and reconnect free: rejoining just receives the current view, which satisfies the
"refresh mid-round returns the same role" scenario with no replay logic. Payloads are small (12 players, at
most 30 clues), so the cost is negligible on the free tier.

**Rotation.** The engine remembers who has explained in the current cycle and picks the first connected player in
seating order who has not, so nobody is skipped when someone leaves and a late joiner gets a turn at the end of
the cycle. Rounds are counted as total rounds, not full rotations
(Party mode counts rotations because one phone has no server).
