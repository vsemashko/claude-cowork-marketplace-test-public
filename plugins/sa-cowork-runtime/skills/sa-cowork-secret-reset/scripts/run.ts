import { main } from '../../../shared/cowork-secret-harness.ts'

if (import.meta.main) {
  await main(['reset', ...Deno.args])
}
