#!/usr/bin/env bash
# Keep manual and automated deployments on the same file allowlist.
PATHS=(./api ./experiment ./world ./data ./experience ./demo-ui
  ./persona-swarm/data/record ./persona-swarm/runtime/agents-client.js
  ./bloor-bike-demo.md ./bike-lane-papers.md ./papers.md ./demo-data.md ./prd.md ./pitch)
[ -d persona-swarm/data/reactions ] && PATHS+=(./persona-swarm/data/reactions)
