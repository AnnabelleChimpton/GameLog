# Playing through it

[← README](../README.md)


If you're working through the collection, on stream or otherwise, four optional
fields turn the site into a progress tracker:

```json
"status": "beaten",
"beatenOn": "2026-08-20",
"video": "https://youtube.com/watch?v=...",
"verdict": "Ends on a boss you can walk past. 3/10."
```

`status` is `playing`, `beaten` or `dropped`, and leaving it out means not
started. Set it from the manager's Games tab, where the play-through fields sit
above the catalogue ones and the date fills itself in when you mark something
beaten.

Everything else follows from it:

- **A progress bar** appears above the shelf, counting whatever is currently
  filtered. Select a platform and it becomes that project's tracker: "2 of 31
  beaten" for a one-console run, or the whole collection with no filter.
- **Episode numbers** are worked out from the order things were finished, so a
  video titled `Some Game (12/185)` gets its number from the site rather than
  from you counting. The number shows on the tile and in the detail view.
- **The detail view** leads with the episode number, your verdict, and a link
  to the video, which is what someone arriving from a description wants.
- **Filter by status** to see only what's left, then press **Surprise me** to
  roll the next one at random.

`dropped` exists on purpose. Some games have no ending to reach, and recording
that with a reason is more honest than inventing a finish line.
