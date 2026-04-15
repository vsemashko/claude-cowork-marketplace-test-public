#!/usr/bin/env -S mise exec deno@latest -- deno run -A
const miseVersion = await new Deno.Command('mise', {
  args: ['--version'],
  stdout: 'piped',
}).output()

const miseStdout = new TextDecoder().decode(miseVersion.stdout).trim()

console.log('sample_name=sa-mise-session-start')
console.log('plugin_name=sa-mise')
console.log(`mise_version=${miseStdout}`)
console.log(`deno_version=${Deno.version.deno}`)
