import type { QueryClient } from '@tanstack/react-query'

import { createQueryClient } from '@rozumari/lib/create-query-client'
import { ToastProvider } from '@rozumari/ui/components/toast'
import { TooltipProvider } from '@rozumari/ui/components/tooltip'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { NuqsAdapter } from 'nuqs/adapters/react-router/v8'
import { useEffect } from 'react'

import { SessionProvider } from '@/hooks/use-session'

let clientQueryClientSingleton: QueryClient | undefined
const getQueryClient = () => {
  if (typeof window === 'undefined') return createQueryClient()
  return (clientQueryClientSingleton ??= createQueryClient())
}

declare global {
  interface Window {
    // oxlint-disable-next-line typescript/consistent-type-imports
    __TANSTACK_QUERY_CLIENT__?: import('@tanstack/react-query').QueryClient
  }
}

export function Providers({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const queryClient = getQueryClient()
  useEffect(() => {
    window.__TANSTACK_QUERY_CLIENT__ = queryClient
    return () => {
      delete window.__TANSTACK_QUERY_CLIENT__
    }
  }, [queryClient])

  return (
    <ThemeProvider
      attribute='class'
      defaultTheme='system'
      themes={['light', 'dark', 'system']}
      disableTransitionOnChange
      enableSystem
    >
      <ToastProvider>
        <TooltipProvider>
          <QueryClientProvider client={queryClient}>
            <SessionProvider>
              <NuqsAdapter>{children}</NuqsAdapter>
            </SessionProvider>
          </QueryClientProvider>
        </TooltipProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
