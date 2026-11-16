# Scanner architecture

## What the scanner refuses {#refuses selects="concept:project-scan kind:ensures"}

The scanner reads its configuration from a single directory and never looks for one.
A directory without a config.json is refused outright, with exit code 2, rather than guessed at.

## The evidence behind the claims {#evidence selects="concept:project-scan kind:witness,because"}

Every claim in this document rests on evidence the build re-checks on each run.
The sample fixture is hashed against its recorded sha256, and the exit-code choice is cited from the session log.

## Working in the repository {#working}

Run the plugin's own unit tests inside packages when you change the claim builders.
