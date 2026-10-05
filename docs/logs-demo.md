# Narrating the app from its logs (OPS-03, OPS-04)

The server writes one JSON line per semantic event to stdout:

```json
{"time":"…","level":"info","event":"command.place","actorId":"…","workId":"…","commandId":"…","epoch":1,"seq":3,"outcome":"rejected","code":"COLLISION","durationMs":1.2,"source":"server"}
```

Events cover accounts and sessions, joining and leaving a room, ghost start
and end, every command result (with its rejection code), versions, exhibits,
favorites, invitations, member changes, push, restore, archive, saves,
suspensions, overload and faults. Client gestures (`camera.gesture.end`,
`draft.adjust.end`, `intro.skip`, `help.open`) arrive marked `"source":
"client-reported"`, one per completed gesture. Pointer moves and physics frames
are never logged. Logs carry opaque IDs and public display names
(`actorName`). They never carry passwords, cookies, recovery codes, invite
tokens, work titles or geometry.

## Live tail on Fly

```sh
flyctl logs -a comp4020-final-easton-yi
# only what people did, readable:
flyctl logs -a comp4020-final-easton-yi | grep -o '{.*}' | jq -r 'select(.event != "world.save") | [.time[11:19], .event, (.actorName // .actorId[0:8] // ""), (.outcome // .reason // ""), (.code // "")] | @tsv'
```

Events from different rooms are told apart by `workId`. A room's
`room.activate` line carries its `streamId`.

## A real excerpt

Produced by `scripts/demo-logs.ts` (two scripted people, Ana and Ben)
against a local production-mode server on 2026-10-05. The full log is in
[`evidence/demo-server-log.jsonl`](evidence/demo-server-log.jsonl). It is
**not** from Fly; a deployed run is still to be captured.

```text
10:36:40.936 account.create        Ana       accepted
10:36:41.075 account.create        Ben       accepted
10:36:41.088 work.create           ab6d9b53  accepted      ← Ana starts a work
10:36:41.091 invite.create         ab6d9b53  accepted
10:36:41.094 invite.accept         b8aa2fb9  accepted      ← Ben joins with the link
10:36:41.108 room.join             Ana       editor
10:36:41.111 room.join             Ben       editor        ← both editing at once
10:36:41.112 draft.start           ab6d9b53                ← Ana holds a ghost
10:36:41.118 command.place         ab6d9b53  accepted
10:36:41.120 command.place         b8aa2fb9  accepted      ← two pillars, 2 ms apart
10:36:42.670 command.place         b8aa2fb9  rejected COLLISION   ← Ben's stick went through Ana's pillar
10:36:42.673 command.place         b8aa2fb9  accepted      ← his beam across the pillars
10:36:44.243 version.create        ab6d9b53  accepted      ← Ana saves "Bridge"
10:36:44.246 push.prepare          ab6d9b53  accepted      ← protection point, placing paused
10:36:44.252 command.push.confirm  ab6d9b53  accepted      ← one bounded push
10:36:52.855 work.restore          ab6d9b53  accepted      ← after it settled, she restored the bridge
10:36:53.157 room.leave            ab6d9b53  disconnect
```

Telling this from the logs alone: who built (`room.join`, `command.place`
by actor), whose placement failed and why (`rejected COLLISION`), who saved
and who pushed (`version.create`, `push.*`), and why a room paused
(`room.overload`, `world.save` with `outcome: failed`, `room.fault`). Logs
show activity, not whether people enjoyed it; that needs the human sessions
in `acceptance-report.md`.

## Trash, restore and permanent deletion (added 2026-10-06)

Lifecycle events carry IDs and counts only: no titles, invite tokens or
snapshots. Real lines, IDs shortened to 8 characters. The first four come from
the lifecycle contract specs (`spec/lifecycle.test.ts`) against a local
production-mode server on 2026-10-06. The failure lines come from a disposable
server with the test-only write-failure hook (`ENABLE_TEST_HOOKS=1`, refused in
production). None of them are from Fly.

```json
{"event":"work.trash","actorId":"a9b48c5d","workId":"a63ffea3","outcome":"accepted","exhibitsWithdrawn":2,"invitesRevoked":1,"notified":2,"wasLive":true,"moving":true}
{"event":"work.untrash","actorId":"a9b48c5d","workId":"d43ac056","outcome":"accepted","archived":false}
{"event":"member.leave","actorId":"1adffb70","workId":"fb4ec70b","outcome":"accepted"}
{"event":"work.purge","actorId":"a9b48c5d","workId":"e42ca695","outcome":"accepted","versions":1,"exhibits":1,"members":2}
{"level":"error","event":"work.trash","actorId":"5a1235b4","workId":"ba4bbb66","outcome":"failed","error":"Error: injected write failure"}
{"level":"error","event":"work.purge","actorId":"5a1235b4","workId":"ba4bbb66","outcome":"failed","error":"Error: injected write failure"}
```

Reading them: the owner moved a shared work to the trash while its structure
was still moving; two windows were told, two exhibits withdrawn and one invite
revoked. Another work came back from the trash to its previous, unarchived
state. An editor left a collaboration (here, one in the trash). A trashed work
was deleted permanently with one version, one exhibit and two memberships. A
`failed` line means nothing changed: the work stayed active (trash) or stayed
in the trash (purge). Repeating a permanent delete logs nothing new and
answers `alreadyDeleted`.

```sh
flyctl logs -a comp4020-final-easton-yi | grep -o '{.*}' | jq -c 'select(.event | test("^work\\.(trash|untrash|purge)$|^member\\.leave$"))'
```
