import type { DeviceId } from '@rozumari/contract/device/schemas/device.schema'
import type { ScheduleId } from '@rozumari/contract/schedule/schemas/schedule.schema'
import type { UserId } from '@rozumari/contract/user/schemas/user.schema'

import { jsonSchema, tool } from 'ai'
import * as Effect from 'effect/Effect'

import { ScheduleRepository } from '@/modules/schedule/application/ports/schedule.repository'
import { DrizzleScheduleRepository } from '@/modules/schedule/infrastructure/persistence/drizzle/repositories/schedule.repository'
import { DrizzleClient } from '@/shared/infrastructure/persistence/drizzle/drizzle.client'

const getScheduleListSchema = jsonSchema<{
  deviceId: DeviceId | undefined
  startDate: string
  endDate: string
}>({
  type: 'object',
  properties: {
    deviceId: { type: 'string' },
    startDate: { type: 'string', $comment: 'Format: YYYY-MM-DD' },
    endDate: { type: 'string', $comment: 'Format: YYYY-MM-DD' },
  },
  required: [],
})

const getScheduleInfoSchema = jsonSchema<{
  scheduleId: ScheduleId
}>({
  type: 'object',
  properties: {
    scheduleId: { type: 'string' },
  },
  required: ['scheduleId'],
})

export const createScheduleTools = (userId: UserId) => ({
  getScheduleList: tool({
    description: 'Get schedule list',
    inputSchema: getScheduleListSchema,
    execute: ({ deviceId, startDate, endDate }) =>
      Effect.gen(function* execute() {
        const scheduleRepository = yield* ScheduleRepository
        return yield* scheduleRepository.findManyWithItems({
          userId,
          deviceId,
          startDate,
          endDate,
        })
      }).pipe(
        Effect.provide(DrizzleScheduleRepository),
        Effect.provide(DrizzleClient.layer),
        Effect.runPromise
      ),
  }),

  getScheduleInfo: tool({
    description: 'Get schedule info',
    inputSchema: getScheduleInfoSchema,
    execute: ({ scheduleId }) =>
      Effect.gen(function* execute() {
        const scheduleRepository = yield* ScheduleRepository
        return yield* scheduleRepository.findWithItems({ userId, scheduleId })
      }).pipe(
        Effect.provide(DrizzleScheduleRepository),
        Effect.provide(DrizzleClient.layer),
        Effect.runPromise
      ),
  }),
})
