import type { ShowScheduleDto } from '@rozumari/contract/schedule/dto/show-schedule.dto'

import { CurrentUser } from '@rozumari/contract/auth/middleware'
import { ScheduleNotFound } from '@rozumari/contract/schedule/schemas/schedule.error'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { ScheduleRepository } from '@/modules/schedule/application/ports/schedule.repository'

export class ShowScheduleUseCase extends Context.Service<
  ShowScheduleUseCase,
  {
    readonly execute: (
      input: ShowScheduleDto.Input
    ) => Effect.Effect<ShowScheduleDto.Output, ScheduleNotFound, CurrentUser>
  }
>()('schedule/application/ShowScheduleUseCase', {
  make: Effect.gen(function* make() {
    const scheduleRepository = yield* ScheduleRepository

    return {
      execute: Effect.fn(function* execute({ id }) {
        const { userId, userRole } = yield* CurrentUser
        const result = yield* scheduleRepository.findWithItems({
          userId: userRole === 'user' ? userId : undefined,
          scheduleId: id,
        })
        if (!result)
          return yield* Effect.fail(new ScheduleNotFound({ error: { id } }))

        return result
      }),
    }
  }),
}) {
  public static readonly layer = Layer.effect(this, this.make)
}
