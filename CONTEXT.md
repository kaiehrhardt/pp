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
