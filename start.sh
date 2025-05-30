#!/bin/bash

RUNNER_ALLOW_RUNASROOT=1

# Configure the runner
./config.sh \
    --url ${GITHUB_REPOSITORY} \
    --token ${RUNNER_TOKEN} \
    --name ${RUNNER_NAME:-$(hostname)} \
    --work ${RUNNER_WORKDIR:-_work} \
    --labels ${RUNNER_LABELS:-default} \
    --unattended \
    --replace

# Start the runner
./run.sh