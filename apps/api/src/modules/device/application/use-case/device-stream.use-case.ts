// oxlint-disable require-yield

import type { DeviceStreamDto } from '@rozumari/contract/device/dto/device-stream.dto'

import { CurrentUser } from '@rozumari/contract/auth/middleware'
import { CurrentDevice } from '@rozumari/contract/device/middleware'
import { DeviceNotFound } from '@rozumari/contract/device/schemas/device.error'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import { BadRequest } from 'effect/http-api/HttpApiError'
import * as Layer from 'effect/Layer'
import * as Schedule from 'effect/Schedule'
import * as Stream from 'effect/Stream'

import { DeviceRepository } from '@/modules/device/application/ports/device.repository'
import { StreamService } from '@/shared/application/services/stream.service'

export class DeviceStreamUseCase extends Context.Service<
  DeviceStreamUseCase,
  {
    readonly subcribe: (
      input: Partial<DeviceStreamDto.Params>
    ) => Effect.Effect<DeviceStreamDto.Stream, BadRequest | DeviceNotFound>

    readonly emit: (
      input: Partial<DeviceStreamDto.Params> & DeviceStreamDto.Emit
    ) => Effect.Effect<DeviceStreamDto.EmitSuccess, BadRequest>
  }
>()('device/application/DeviceStreamUseCase', {
  make: Effect.gen(function* make() {
    const deviceRepository = yield* DeviceRepository

    const streamService = yield* StreamService

    return {
      subcribe: Effect.fn(function* subcribe(input) {
        const currentUser = yield* Effect.serviceOption(CurrentUser)
        const currentDevice = yield* Effect.serviceOption(CurrentDevice)

        const deviceId =
          currentDevice._tag === 'Some' ? currentDevice.value : input.id
        if (!deviceId) return yield* Effect.fail(new BadRequest())

        const [device] = yield* deviceRepository.findMany({
          where: {
            id: { eq: deviceId },
            ...(currentUser._tag === 'Some' &&
              currentUser.value.userRole === 'user' && {
                userId: { eq: currentUser.value.userId },
              }),
          },
        })
        if (!device)
          return yield* Effect.fail(
            new DeviceNotFound({ error: { id: deviceId } })
          )

        yield* streamService.register(
          deviceId,
          currentUser._tag === 'Some' ? currentUser.value.userId : undefined
        )

        const keepAliveStream = Stream.repeat(
          Stream.succeed(':keep-alive\n\n'),
          Schedule.spaced('10 seconds')
        )

        const dataStream = Stream.mapEffect(
          streamService.subscribe(deviceId),
          (message) => Effect.succeed(`data: ${message}\n\n`)
        )

        return Stream.merge(keepAliveStream, dataStream).pipe(
          Stream.ensuring(streamService.unregister(deviceId))
        ) as unknown as DeviceStreamDto.Stream
      }),

      emit: Effect.fn(function* emit(input) {
        const currentDevice = yield* Effect.serviceOption(CurrentDevice)
        const deviceId =
          currentDevice._tag === 'Some' ? currentDevice.value : input.id
        if (!deviceId) return yield* Effect.fail(new BadRequest())

        yield* streamService.publish(
          deviceId,
          JSON.stringify({ action: input.action, payload: input.payload })
        )

        return {
          deviceId,
          action: input.action,
          payload: input.payload,
        }
      }),
    }
  }),
}) {
  public static readonly layer = Layer.effect(this, this.make)
}
