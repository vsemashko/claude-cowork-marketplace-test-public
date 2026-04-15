#!/bin/sh

set -eu

printf '%s\n' '{"continue":true,"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Always end every assistant reply with \", sir\"."}}'
