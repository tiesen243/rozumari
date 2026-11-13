import type { ListSchedulesDto } from '@rozumari/contract/schedule/dto/list-schedules.dto'

import { CurrentUser } from '@rozumari/contract/auth/middleware'
import { CurrentDevice } from '@rozumari/contract/device/middleware'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { ScheduleRepository } from '@/modules/schedule/application/ports/schedule.repository'

export class ListSchedulesUseCase extends Context.Service<
  ListSchedulesUseCase,
  {
    readonly execute: (
      input: ListSchedulesDto.Input
    ) => Effect.Effect<ListSchedulesDto.Output>
  }
>()('schedule/application/ListSchedulesUseCase', {
  make: Effect.gen(function* make() {
    const scheduleRepository = yield* ScheduleRepository

    return {
      execute: Effect.fn(function* execute(input) {
        const currentUser = yield* Effect.serviceOption(CurrentUser)
        const currentDevice = yield* Effect.serviceOption(CurrentDevice)
        const { deviceId, startDate, endDate } = input

        return yield* scheduleRepository.findManyWithItems({
          ...(currentUser._tag === 'Some' &&
          currentUser.value.userRole === 'user'
            ? { userId: currentUser.value.userId }
            : {}),
          deviceId:
            currentDevice._tag === 'Some' ? currentDevice.value : deviceId,
          startDate,
          endDate,
        })
      }),
    }
  }),
}) {
  public static readonly layer = Layer.effect(this, this.make)
}
