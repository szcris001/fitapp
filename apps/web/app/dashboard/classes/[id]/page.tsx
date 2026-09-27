'use client'
import { useParams, useRouter } from 'next/navigation'
import { ClassPanel } from '../_components/ClassDetail'

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  return (
    <div className="flex flex-col h-full">
      <ClassPanel
        classId={id}
        onNavigate={nextId => router.push(`/dashboard/classes/${nextId}`)}
        onClose={() => router.back()}
        onRefresh={() => router.refresh()}
        onDeleted={() => router.push('/dashboard/classes')}
      />
    </div>
  )
}
