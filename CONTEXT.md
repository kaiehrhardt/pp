# Planning Poker

A web app for teams to estimate work together via Planning Poker in real time.

## Language

**Room**:
A session a user opens, which others join via a link. Groups all participants and the flow of an estimation round. Stays alive as long as at least one participant is connected.
_Avoid_: Table (a purely visual metaphor in the UI, not a domain object in its own right), Session

**Host**:
The participant in control of the round flow (e.g. starting a new round). Originally the room's creator; if their connection drops, control automatically passes to the longest-connected remaining participant (spectators included).

**Reveal**:
The automatic uncovering of all chosen cards once every participant has voted. Not a manually triggered step.

**Participant**:
A user who has joined a room via its link and chosen a name. Gets a random avatar color for distinction; names don't need to be unique. Keeps their identity (name, color, host status if applicable) across brief disconnects/reloads via a token in `localStorage`.

**Vote**:
The card a participant picked from the Fibonacci deck (1, 2, 3, 5, 8, 13, 21, 34, 55, ☕, ?). Before the reveal, only *whether* a participant has voted is visible, not the value.
_Avoid_: Estimate

**Evaluation**:
The summary computed after a reveal: the average of all numeric votes (☕/? excluded), plus the valid card value closest to that average as a recommendation (an exact tie between two cards rounds up to the higher one).
_Avoid_: Consensus (concept was dropped in favor of the recommendation)

**Spectator**:
A participant who isn't estimating and therefore doesn't factor into the auto-reveal condition ("everyone has voted"). Chosen via a checkbox at join time, or toggled on/off at any point during the session. Can still throw reactions.
_Avoid_: Observer, Watcher

**Chat**:
Room-wide text messages between participants, ephemeral like the room itself (no persistence beyond its lifetime). A message snapshots the sender's name and color at send time, so history stays correctly attributed even after that participant leaves or gets kicked.

**Guess**:
A participant's optional, secret prediction of what the round's Evaluation average will turn out to be, submitted before the reveal. Hidden from others until reveal, same as a Vote. Whoever's guess is numerically closest to the actual average is shown as the round's winner via a badge; an exact tie for closest is shared by everyone tied, rather than picked arbitrarily.
_Note_: distinct from Evaluation — a Guess is a participant's prediction *of* the average, not the computed average/recommendation itself.

**Duel**:
A private, best-of-three Rock-Paper-Scissors side-game between two participants, started as a challenge the other side can accept or decline. Runs until one side wins two rounds (draws are replayed without counting); the running score is shown throughout. Purely for fun while waiting for votes — has no effect on votes, Reveal, or the Evaluation, and isn't limited to voting participants (Spectators can duel too).
_Avoid_: Game (too generic — could be read as referring to the planning poker round itself)

**Unanimous vote**:
A Reveal where every voting participant's Vote came out as the exact same card. Celebrated client-side with a one-shot confetti animation the moment it happens.
_Avoid_: Consensus (deliberately dropped from this domain already — Unanimous vote is a narrower, purely mechanical "same card" check, not a claim that the team actually agrees on the estimate)
