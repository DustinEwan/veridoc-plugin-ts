# Scanner architecture

<doc-section name="parseConfig">

## What the scanner refuses

The scanner reads its configuration from a single directory and never looks for one.
A directory without a config.json is refused outright, with exit code 2, rather than
guessed at <doc-claim name="rejects-missing-config"/>.

<doc-section name="parseConfig">

## The evidence behind the claims

Every claim in this document rests on evidence the build re-checks on each run.
The sample directory listing is hashed against its recorded sha256 <doc-claim name="sample-listing-pinned"/>,
and the exit-code choice is cited from the session log <doc-claim name="exit-code-2-decision"/>.

<doc-section name="working">

## Working in the repository

Run the plugin's own unit tests inside packages when you change the claim builders.
