import type { ShowDeviceDto } from '@rozumari/contract/device/dto/show-device.dto'

import { CurrentUser } from '@rozumari/contract/auth/middleware'
import { CurrentDevice } from '@rozumari/contract/device/middleware'
import { DeviceNotFound } from '@rozumari/contract/device/schemas/device.error'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import { BadRequest } from 'effect/http-api/HttpApiError'
import * as Layer from 'effect/Layer'

import { DeviceRepository } from '@/modules/device/application/ports/device.repository'

export class ShowDeviceUseCase extends Context.Service<
  ShowDeviceUseCase,
  {
    readonly execute: (
      input: Partial<ShowDeviceDto.Input>
    ) => Effect.Effect<ShowDeviceDto.Output, BadRequest | DeviceNotFound>
  }
>()('device/application/ShowDeviceUseCase', {
  make: Effect.gen(function* make() {
    const deviceRepository = yield* DeviceRepository

    return {
      execute: Effect.fn(function* execute({ id }) {
        const currentDevice = yield* Effect.serviceOption(CurrentDevice)
        const currentUser = yield* Effect.serviceOption(CurrentUser)

        const deviceId =
          currentDevice._tag === 'Some' ? currentDevice.value : id
        if (!deviceId) return yield* Effect.fail(new BadRequest())

        const agg = yield* deviceRepository.findWithCompartment({
          deviceId,
          ...(currentUser._tag === 'Some' &&
          currentUser.value.userRole === 'user'
            ? { userId: currentUser.value.userId }
            : {}),
        })
        if (!agg)
          return yield* Effect.fail(
            new DeviceNotFound({ error: { id: deviceId } })
          )

        const { device, compartments } = agg
        return { ...device, compartments }
      }),
    }
  }),
}) {
  public static readonly layer = Layer.effect(this, this.make)
}
