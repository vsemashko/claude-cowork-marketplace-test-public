import { resetPersistedSecret } from '../../../shared/cowork-secret-store.ts'

if (import.meta.main) {
  console.log(await resetPersistedSecret({ env: Deno.env.toObject(), now: new Date() }))
}
