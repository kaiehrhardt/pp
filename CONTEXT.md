# Planning Poker

A web app for teams to estimate work together via Planning Poker in real time.

## Language

**Room**:
A session a user opens, which others join via a link. Groups all participants and the flow of an estimation round. Stays alive as long as at least one participant is connected, plus a further 30-minute grace period after the last one disconnects, in case everyone reconnects.
_Avoid_: Table (a purely visual metaphor in the UI, not a domain object in its own right), Session

**Host**:
The participant in control of the round flow (e.g. starting a new round). Originally the room's creator; if their connection drops, control automatically passes to the longest-connected remaining participant (spectators included).

**Reveal**:
The automatic uncovering of all chosen cards once every participant has voted. Not a manually triggered step.

**Participant**:
A user who has joined a room via its link and chosen a name. Gets a random Seat color for distinction, plus an Avatar (defaulting to 🙂); names don't need to be unique. Keeps their identity (name, Seat color, Avatar, host status if applicable, Trophy count) across disconnects/reloads via a token in `localStorage` — reconnection has no time limit of its own, it just requires the Room itself to still be alive.

**Vote**:
The card a participant picked from the Fibonacci deck (1, 2, 3, 5, 8, 13, 21, 34, 55, ☕, ?). Before the reveal, only *whether* a participant has voted is visible, not the value.
_Avoid_: Estimate

**Evaluation**:
The summary computed after a reveal: the average of all numeric votes (☕/? excluded), plus the valid card value closest to that average as a recommendation (an exact tie between two cards rounds up to the higher one).
_Avoid_: Consensus (concept was dropped in favor of the recommendation)

**Spectator**:
A participant who isn't estimating and therefore doesn't factor into the auto-reveal condition ("everyone has voted"). Chosen via a checkbox at join time, or toggled on/off at any point during the session — toggling doesn't clear an existing Vote, it just excludes it from the count while active, so switching back before Reveal silently restores it. Toggling into Spectator mode can itself trigger a Reveal, the same way a Kick can, if you were the last one yet to vote. Can still throw and receive Reactions, and can Duel.
_Avoid_: Observer, Watcher

**Chat**:
Room-wide text messages between participants, ephemeral like the room itself (no persistence beyond its lifetime). A message snapshots the sender's name and color at send time, so history stays correctly attributed even after that participant leaves or gets kicked.

**Guess**:
A participant's optional, secret prediction of what the round's Evaluation average will turn out to be, submitted before the reveal. Hidden from others until reveal, same as a Vote. Whoever's guess is numerically closest to the actual average is shown as the round's winner via a badge; an exact tie for closest is shared by everyone tied, rather than picked arbitrarily.
_Note_: distinct from Evaluation — a Guess is a participant's prediction *of* the average, not the computed average/recommendation itself.

**Duel**:
A private, best-of-three Rock-Paper-Scissors side-game between two participants, started as a challenge the other side can accept or decline. Runs until one side wins two rounds (draws are replayed without counting); the running score is shown throughout. Purely for fun while waiting for votes — has no effect on votes, Reveal, or the Evaluation, and isn't limited to voting participants (Spectators can duel too). If either side disconnects before the match finishes, the Duel is simply cancelled outright — a wash, not a forfeit-win for whoever's left, and no Trophy changes hands. Only *starting* a Duel requires the Room to be in the voting phase — once accepted, a Duel runs on its own clock, unaffected by a Reveal or even a new round starting; it ends only by completing, being cancelled, or a side disconnecting/getting Kicked.
_Avoid_: Game (too generic — could be read as referring to the planning poker round itself)

**Unanimous vote**:
A Reveal where every voting participant's Vote came out as the exact same card. Celebrated client-side with a one-shot confetti animation the moment it happens.
_Avoid_: Consensus (deliberately dropped from this domain already — Unanimous vote is a narrower, purely mechanical "same card" check, not a claim that the team actually agrees on the estimate)

**Trophy**:
A persistent per-participant counter of mini-game and Unanimous vote wins, shown as a 🏆 badge (with a count once more than one is held). Only the running total is kept — no record of which event earned any individual trophy. Accumulates for the Room's entire lifetime and is never reset; survives a participant's disconnect/reconnect since it lives on their same underlying record. Awarded at Reveal to: the Guess winner(s); every voting participant at once on a Unanimous vote (a team reward, not a single winner — distinct from the other two triggers); and separately, a Duel's match winner. Winning a Duel is the only route by which a Spectator can earn a Trophy, since Guess and Unanimous vote both require voting participation.
_Avoid_: Point, Score, Award (Trophy is the term already used in the UI badge and commit history)

**Avatar**:
A participant's self-chosen emoji identity marker, picked from a curated list at join time (defaulting to 🙂 if skipped) and changeable at any time via an edit control on the participant's own tile — never set by anyone else. Server-side validation only bounds its length; it isn't restricted to the curated list, the same trust model already applied to Name. Shares its picker UI and emoji set with Reactions, but the two are unrelated: an Avatar is a standing identity marker, a Reaction is a one-off thrown emoji.
_Avoid_: Icon, Emoji (Avatar is the domain concept; the emoji is just its representation)

**Seat color**:
A random color assigned to a participant at join for visual distinction, unrelated to their Avatar choice. Originally a solid fill behind the participant's initial; now rendered as a thin ring around the Avatar instead, since a solid fill would clash with an arbitrary emoji.
_Avoid_: Avatar color (renamed to avoid colliding with the new Avatar concept), Color alone (ambiguous with Card/Vote values)

**Reaction**:
An emoji thrown from one participant at another specific participant — always one-to-one, never room-wide and never at yourself (blocked client-side; the server only checks the target exists in the Room). Picked from the same curated emoji list as Avatar, but unrelated in purpose: a Reaction is a one-off thrown gesture, not a standing identity marker. Purely ephemeral — relayed live over the socket and animated flying between the two participants' seats for 2 seconds, then gone; never stored in Room state. Any participant can throw or be targeted, Spectators included, and a disconnected-but-not-yet-removed participant can still be targeted.
_Avoid_: Emoji burst, Broadcast (a Reaction is always targeted at one participant, not sent to the room at large)

**Kick**:
A host-only, immediate, and permanent removal of a participant from the Room — deliberately bypassing the disconnect/reconnect grace period the rest of this domain relies on. The kicked participant's stored token is wiped client-side, so rejoining via the room link creates a brand-new Participant with no link to the old one: Trophy count, Avatar, and Seat color are all lost, not restored. Cancels any Duel the kicked participant was in. If they were the last voting participant yet to vote, their removal can itself trigger a Reveal, exactly as if they had voted.
_Avoid_: Ban, Remove (Kick is the term already used in the UI and protocol)

**Session Evaluation**:
A rollup of session-wide activity across the Room's entire lifetime: round count/average/min/max, total Reactions thrown, total Duels completed, and total Trophies won. The round stats are distinct from Evaluation itself (which is one round's outcome); they're the average *of* those averages, not a recalculation over every individual Vote ever cast, so a round with two Participants counts the same as a round with ten. A round only contributes if it produced a numeric Evaluation at all — everyone voting ☕/? leaves nothing to record. A Duel only contributes once it actually finishes — a cancelled one (e.g. a side disconnecting) doesn't count. Shown in a collapsible widget, mirroring the Trophy leaderboard's shape but for session totals instead of a per-participant ranking.
_Avoid_: Statistics, History (Session Evaluation is the term already used in the codebase; "history" would wrongly imply a per-round log is kept, when only the aggregate is)
