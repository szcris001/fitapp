'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function WodNewRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/dashboard/classes') }, [router])
  return null
}
