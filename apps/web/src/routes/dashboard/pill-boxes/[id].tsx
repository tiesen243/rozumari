import type { DeviceId } from '@rozumari/contract/device/schemas/device.schema'

import { Tabs, TabsList, TabsTrigger } from '@rozumari/ui/components/tabs'
import { toast } from '@rozumari/ui/components/toast'
import { useSubscription } from '@tiesen/effect-tanstack-query/react'
import { parseAsStringLiteral, useQueryState } from 'nuqs'

import { createMetadata } from '@/lib/metadata'
import { api } from '@/lib/runtime'
import { DevicesShowPageSkeleton } from '@/routes/dashboard/pill-boxes/[id].skeleton'
import { DeviceInfo } from '@/routes/dashboard/pill-boxes/_components/device-info'
import { NotificationsTab } from '@/routes/dashboard/pill-boxes/_components/tabs/notifications'
import { OverviewTab } from '@/routes/dashboard/pill-boxes/_components/tabs/overview'
import { SchedulesTab } from '@/routes/dashboard/pill-boxes/_components/tabs/schedules'
import { useDevice } from '@/routes/dashboard/pill-boxes/_hooks/use-device'

import type { Route } from './+types/[id]'

export const meta: Route.MetaFunction = ({ params }) =>
  createMetadata({
    title: `Pill Box - ${params.id}`,
    description: `View and manage pill box ${params.id} details, notifications, and schedules.`,
  })

export default function DevicesShowPage({ params }: Route.ComponentProps) {
  const { isLoading, error } = useDevice()
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsStringLiteral([
      'overview',
      'notifications',
      'schedules',
    ]).withDefault('overview')
  )

  useSubscription(
    api.device.subscribe.subscriptionOptions(
      { params: { id: params.id as DeviceId } },
      {
        enabled: !isLoading && error === null,
        autoReconnect: '3 seconds',
        keepAlive: { timeout: '15 seconds' },
        onData: ({ action, payload }) => {
          if (action === 'message' && typeof payload === 'object') {
            const p = payload as { type: 'success' | 'error'; content: string }

            if (p.type === 'success') toast.success(p.content)
            else if (p.type === 'error') toast.error(p.content)
            else toast.show(p.content)
          }
        },
        onError: (err) => toast.error(err.message),
      }
    )
  )

  if (isLoading) return <DevicesShowPageSkeleton />

  return (
    <>
      <h2 className='sr-only'>Device details</h2>

      <DeviceInfo />

      <Tabs defaultValue={tab} onValueChange={setTab as never} className='mt-7'>
        <TabsList>
          <TabsTrigger value='overview'>Overview</TabsTrigger>
          <TabsTrigger value='notifications'>Notifications</TabsTrigger>
          <TabsTrigger value='schedules'>Schedules</TabsTrigger>
        </TabsList>

        <OverviewTab />

        <NotificationsTab />

        <SchedulesTab />
      </Tabs>
    </>
  )
}
