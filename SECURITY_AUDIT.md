

## Like / Like-Back feature
- A new LIKE creates a recipient notification once, with no duplicate spam notifications.
- The notification links to the sender's profile.
- The profile queries an authenticated relationship-status endpoint and shows `Like Back` when the recipient has not already liked the sender.
- The existing server-side mutual-like check creates the match and sends match notifications to both users.
- Block checks remain enforced before likes are stored.
