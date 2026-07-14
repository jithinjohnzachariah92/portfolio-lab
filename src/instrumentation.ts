import { attachTraceSummary } from '@jz92/telemetry'

export const register = async () => {
  attachTraceSummary()
}