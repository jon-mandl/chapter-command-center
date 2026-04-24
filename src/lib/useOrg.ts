import { useEffect, useState } from 'react'
import { supabase } from './supabase'

interface OrgContext {
  orgId: string | null
  loading: boolean
}

export function useOrg(): OrgContext {
  const [orgId, setOrgId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('user_profiles')
      .select('org_id')
      .single()
      .then(({ data }) => {
        setOrgId(data?.org_id ?? null)
        setLoading(false)
      })
  }, [])

  return { orgId, loading }
}
