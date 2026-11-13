import * as HttpApiEndpoint from 'effect/http-api/HttpApiEndpoint'
import { BadRequest } from 'effect/http-api/HttpApiError'
import * as HttpApiGroup from 'effect/http-api/HttpApiGroup'

import { DeviceStreamDto } from '@/device/dto/device-stream.dto'
import { LinkDeviceGenerateDto } from '@/device/dto/link-device-generate.dto'
import { ShowDeviceDto } from '@/device/dto/show-device.dto'
import { UpdateCapacityDto } from '@/device/dto/update-capacity.dto'
import { DeviceMiddleware } from '@/device/middleware'
import { DeviceNotFound } from '@/device/schemas/device.error'

export class DeviceIoTGroup extends HttpApiGroup.make('device-iot')

  .add(
    HttpApiEndpoint.get('info', '/info', {
      success: ShowDeviceDto,
      error: [BadRequest, DeviceNotFound],
    })
  )

  .add(
    HttpApiEndpoint.get('link-generate', '/link/generate', {
      success: LinkDeviceGenerateDto,
      error: [DeviceNotFound],
    })
  )

  .add(
    HttpApiEndpoint.post('update-capacity', '/update-capacity', {
      payload: UpdateCapacityDto.Input,
      success: UpdateCapacityDto,
      error: [DeviceNotFound],
    })
  )

  .add(
    HttpApiEndpoint.get('subscribe', '/subscribe', {
      success: DeviceStreamDto.Stream,
      error: [BadRequest, DeviceNotFound],
    })
  )

  .add(
    HttpApiEndpoint.post('emit', '/emit', {
      payload: DeviceStreamDto.Emit,
      success: DeviceStreamDto,
      error: [BadRequest],
    })
  )

  .middleware(DeviceMiddleware)

  .prefix('/api/devices') {}
