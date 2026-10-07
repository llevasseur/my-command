# Wayfinder reference — why `--unattended` and `--integration` work the way they do

Read this only when a run has to justify how `--unattended` or `--integration`
behaves: a user asks why the map does not authorise a merge, why the kickoff
prompt names `--unattended`, or why `--integration` and `--base` stay two flags.
The rules themselves are in the skill; this file holds the reasons behind them.

## `--unattended` is typed, never inherited

A campaign multiplies whatever it authorises. N unattended merges out of one
invocation is a different risk from one, which is why `$manage` likewise
requires its merge-through delegate to be typed rather than inherited. So no
operation infers the flag: not from a workflow that invoked this one, not from
an earlier operation in the same campaign, and not from the map.

## The one place the flag is written down: the kickoff prompt

The map's agent kickoff prompt is the one path that puts `--unattended` in front
of the next agent to type, and only for a campaign whose map header records
`Unattended: yes`. That prompt is not documentation about the campaign — it *is*
the resume path, the literal text a fresh agent is handed to pick the campaign
back up. A resume that drops the flag silently downgrades the campaign to
stopping at every pull request, and because a long campaign resumes as a matter
of course, an unattended campaign that resumes attended never finishes.

So start records the mode, and the prompt is generated carrying `--unattended`
when it is set. The flag is still read off the invocation and nowhere else; the
map decides which closing sentence gets written and authorises nothing.
MyCommand's decision record ADR 0006 states the escalation risk that accepts: a
map is a file in the repository, so whoever can edit it can put the flag in a
later resume's hands.

## Naming `--unattended` keeps the prompt provider-neutral

The rule barring model, vendor, and product-specific command names in the
kickoff prompt holds in full. `--unattended` is this workflow's own flag, parsed
identically wherever the workflow is installed, so it reads the same in any
agent CLI.

## `--integration` is not `--base`

`--base` is forwarded to the ticket runner and names *a ticket's* cut point
inside the campaign; `--integration` names what the *campaign itself* is cut
from and merged into. A campaign integrating with `release/2.0` still cuts its
tickets from `wayfinder/<slug>`, and a ticket cut from somewhere unusual with
`--base` changes nothing about where the campaign lands.

## Why the mode is read from the map after start

`--unattended` on an invocation says what *this run* may do; the map's line says
what the *campaign* was started as, and the start run's answer to the second is
the one that has to survive into every session after it.
