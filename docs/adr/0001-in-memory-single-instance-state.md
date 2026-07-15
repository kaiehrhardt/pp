# In-memory state instead of a database, single instance

Rooms are ephemeral and only live as long as at least one participant is connected (plus a 30-minute grace period afterward). Instead of a database, a single Bun process holds the entire room state in memory. This keeps the stack minimal and matches the disposable nature of the data — a server restart loses all running rooms and rules out horizontal scaling across multiple instances unless a shared store is introduced later.
