import type { UserId } from '@rozumari/contract/user/schemas/user.schema'

import { eq } from 'drizzle-orm'
import * as Effect from 'effect/Effect'

import { chatStateSubscriptions } from '@/modules/ai/infrastructure/persistence/drizzle/schema'
import { bot } from '@/modules/ai/infrastructure/services/bot'
import { DrizzleClient } from '@/shared/infrastructure/persistence/drizzle/drizzle.client'

export const postMessage = Effect.fn(function* postMessage(
  userId: UserId,
  message: string
) {
  const drizzle = yield* Effect.serviceOption(DrizzleClient)
  if (drizzle._tag === 'None') return

  const [thread] = yield* drizzle.value.db
    .select({ threadId: chatStateSubscriptions.threadId })
    .from(chatStateSubscriptions)
    .where(eq(chatStateSubscriptions.userId, userId))
    .limit(1)
    .pipe(Effect.orDie)
  if (!thread) return

  yield* Effect.promise(() => bot.initialize())
  yield* Effect.promise(() => bot.thread(thread.threadId).post(message))
  // oxlint-disable-next-line promise/prefer-await-to-then
}, Effect.catch(Effect.asVoid))
