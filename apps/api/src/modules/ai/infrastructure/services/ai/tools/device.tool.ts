import type { DeviceId } from '@rozumari/contract/device/schemas/device.schema'
import type { UserId } from '@rozumari/contract/user/schemas/user.schema'

import { jsonSchema, tool } from 'ai'
import * as Effect from 'effect/Effect'

import { DeviceRepository } from '@/modules/device/application/ports/device.repository'
import { DrizzleDeviceRepository } from '@/modules/device/infrastructure/persistence/drizzle/repositories/device.repository'
import { DrizzleClient } from '@/shared/infrastructure/persistence/drizzle/drizzle.client'

const getDeviceListSchema = jsonSchema<{ page?: number; limit?: number }>({
  type: 'object',
  properties: {
    page: { type: 'number', default: 1 },
    limit: { type: 'number', default: 10 },
  },
})

const getDeviceInfoSchema = jsonSchema<{
  deviceId: DeviceId
}>({
  type: 'object',
  properties: {
    deviceId: { type: 'string' },
  },
  required: ['deviceId'],
})

export const createDeviceTools = (userId: UserId) => ({
  getDeviceList: tool({
    description: 'Get the linked user device list',
    inputSchema: getDeviceListSchema,
    execute: ({ page = 1, limit = 10 }) =>
      Effect.gen(function* execute() {
        const deviceRepository = yield* DeviceRepository
        const offset = (page - 1) * limit

        return deviceRepository.findMany({
          where: { userId: { eq: userId } },
          orderBy: { factoryModel: 'asc' },
          offset,
          limit,
        })
      }).pipe(
        Effect.provide(DrizzleDeviceRepository),
        Effect.provide(DrizzleClient.layer),
        Effect.runPromise
      ),
  }),

  getDeviceInfo: tool({
    description: 'Get information about a specific device',
    inputSchema: getDeviceInfoSchema,
    execute: ({ deviceId }) =>
      Effect.gen(function* execute() {
        const deviceRepository = yield* DeviceRepository
        return deviceRepository.findWithCompartment({ userId, deviceId })
      }).pipe(
        Effect.provide(DrizzleDeviceRepository),
        Effect.provide(DrizzleClient.layer),
        Effect.runPromise
      ),
  }),
})
