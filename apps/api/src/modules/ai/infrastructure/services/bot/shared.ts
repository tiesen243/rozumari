import type { UserId } from '@rozumari/contract/user/schemas/user.schema'

import { eq } from 'drizzle-orm'
import * as Effect from 'effect/Effect'

import { chatStateSubscriptions } from '@/modules/ai/infrastructure/persistence/drizzle/schema'
import { bot } from '@/modules/ai/infrastructure/services/bot'
import { createAskHandler } from '@/modules/ai/infrastructure/services/bot/handlers/ask.handler'
import { DrizzleClient } from '@/shared/infrastructure/persistence/drizzle/drizzle.client'

export const postMessage = Effect.fn(function* postMessage(
  userId: UserId,
  message: string
) {
  const drizzle = yield* Effect.serviceOption(DrizzleClient)
  if (drizzle._tag === 'None') return

  const [thread] = yield* drizzle.value.db
    .select({
      threadId: chatStateSubscriptions.threadId,
    })
    .from(chatStateSubscriptions)
    .where(eq(chatStateSubscriptions.userId, userId))
    .limit(1)
    .pipe(Effect.orDie)
  if (!thread) return

  yield* Effect.tryPromise({
    try: () => bot.initialize(),
    catch: () => Effect.ignore,
  })
  yield* Effect.tryPromise({
    try: async () => {
      const _thread = bot.thread(thread.threadId)

      const ask = createAskHandler(bot, thread.threadId, userId)
      const stream = await ask(message, _thread.signal)
      await _thread.post(stream)
    },
    catch: () => Effect.ignore,
  })
})
