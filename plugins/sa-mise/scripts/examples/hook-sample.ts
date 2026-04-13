#!/usr/bin/env -S mise exec deno@latest -- deno run -A

const miseVersion = await new Deno.Command('mise', {
  args: ['--version'],
  stdout: 'piped',
}).output()

const miseStdout = new TextDecoder().decode(miseVersion.stdout).trim()

console.log('sa-mise SessionStart hook sample')
console.log(`mise: ${miseStdout}`)
console.log(`deno: ${Deno.version.deno}`)
console.log('hook sample completed')
