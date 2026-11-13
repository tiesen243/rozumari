import { Api } from '@rozumari/contract'
import { ListSchedulesDto } from '@rozumari/contract/schedule/dto/list-schedules.dto'
import * as Effect from 'effect/Effect'
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder'

import { ListSchedulesUseCase } from '@/modules/schedule/application/use-case/list-schedules.use-case'
import { UpdateScheduleStatusUseCase } from '@/modules/schedule/application/use-case/update-schedule-status.use-case'

export const scheduleIoTController = HttpApiBuilder.group(
  Api,
  'schedule-iot',
  (handlers) =>
    handlers
      .handle('today', ({ query }) =>
        ListSchedulesUseCase.use((s) => {
          const today =
            query.date ??
            Intl.DateTimeFormat('en-CA', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(new Date())

          return s.execute({ startDate: today, endDate: today })
        }).pipe(Effect.map((data) => new ListSchedulesDto({ data })))
      )

      .handle('update-status', ({ params, payload }) =>
        UpdateScheduleStatusUseCase.use((s) =>
          s.execute({ id: params.id, status: payload.status })
        )
      )
)
