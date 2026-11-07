import type { DeviceNotFound } from '@rozumari/contract/device/schemas/device.error'
import type { CreateNotificationDto } from '@rozumari/contract/notification/dto/create-notification.dto'

import { CurrentDevice } from '@rozumari/contract/device/middleware'
import { DeviceNotLinked } from '@rozumari/contract/device/schemas/device.error'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { postMessage } from '@/modules/ai/infrastructure/services/bot/shared'
import { DeviceService } from '@/modules/device/application/ports/device.service'
import { NotificationRepository } from '@/modules/notification/application/ports/notification.repository'
import { Notification } from '@/modules/notification/domain/entities/notification.entity'

const formatNotificationMessage = (notification: Notification) => {
  const level = { error: '🔴 Error', warning: '🟡 Warning', info: '🔵 Info' }[
    notification.level
  ]

  return [
    `${level}: ${notification.title}`,
    '',
    notification.body,
    notification.scheduleId ? `Schedule ID: ${notification.scheduleId}` : null,
    notification.payload
      ? `Details:\n\`\`\`json\n${JSON.stringify(notification.payload, null, 2)}\n\`\`\``
      : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export class CreateNotificationUseCase extends Context.Service<
  CreateNotificationUseCase,
  {
    readonly execute: (
      input: CreateNotificationDto.Input
    ) => Effect.Effect<
      CreateNotificationDto.Output,
      DeviceNotFound | DeviceNotLinked,
      CurrentDevice
    >
  }
>()('notification/application/CreateNotificationUseCase', {
  make: Effect.gen(function* make() {
    const notificationRepository = yield* NotificationRepository

    const deviceService = yield* DeviceService

    return {
      execute: Effect.fn(function* execute(input) {
        const deviceId = yield* CurrentDevice

        const device = yield* deviceService.find(deviceId)
        if (device.status !== 'linked' || device.userId === null)
          return yield* Effect.fail(
            new DeviceNotLinked({ error: { id: deviceId } })
          )

        const notification = Notification.make({
          ...input,
          userId: device.userId,
          deviceId,
        })
        yield* notificationRepository.save(notification)

        yield* postMessage(
          device.userId,
          formatNotificationMessage(notification)
        )

        return {
          id: notification.id,
        }
      }),
    }
  }),
}) {
  public static readonly layer = Layer.effect(this, this.make)
}
