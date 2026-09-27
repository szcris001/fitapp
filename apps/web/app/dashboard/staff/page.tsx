'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../store/auth.store'
import api, { mediaUrl } from '../../../lib/api'
import { Users2, UserPlus, Camera, Edit2, Check, X } from 'lucide-react'

export default function StaffPage() {
  const { user, loadFromStorage } = useAuthStore()
  const [staff, setStaff] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role: 'COACH' })

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', role: 'COACH' })
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null)
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null)
  const editFileRef = useRef<HTMLInputElement>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const router = useRouter()

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    const reader = new FileReader()
    reader.onload = ev => setAvatarPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleEditAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setEditAvatarFile(file)
    const reader = new FileReader()
    reader.onload = ev => setEditAvatarPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  useEffect(() => { loadFromStorage() }, [])
  useEffect(() => {
    if (!user) { router.push('/login'); return }
    fetchStaff()
  }, [user])

  const fetchStaff = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/users?role=COACH,ADMIN')
      setStaff(data.filter((u: any) => u.role === 'COACH' || u.role === 'ADMIN'))
    } catch { router.push('/login') }
    finally { setLoading(false) }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { data: newUser } = await api.post('/users', { ...form })
      if (avatarFile) {
        const fd = new FormData()
        fd.append('file', avatarFile)
        await api.post(`/users/${newUser.id}/avatar`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      setSuccess(`${form.role === 'COACH' ? 'Coach' : 'Admin'} creado correctamente`)
      setShowForm(false)
      setForm({ name: '', email: '', password: '', phone: '', role: 'COACH' })
      setAvatarFile(null); setAvatarPreview(null)
      fetchStaff()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al crear')
    } finally { setSaving(false) }
  }

  const startEdit = (s: any) => {
    setEditingId(s.id)
    setEditForm({ name: s.name, email: s.email || '', phone: s.phone || '', role: s.role })
    setEditAvatarFile(null)
    setEditAvatarPreview(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditAvatarFile(null)
    setEditAvatarPreview(null)
    setEditForm({ name: '', email: '', phone: '', role: 'COACH' })
  }

  const handleSaveEdit = async (id: string) => {
    setSavingEdit(true)
    setError('')
    try {
      await api.put(`/users/${id}`, {
        name: editForm.name,
        email: editForm.email || undefined,
        phone: editForm.phone || undefined,
        role: editForm.role,
      })
      if (editAvatarFile) {
        const fd = new FormData()
        fd.append('file', editAvatarFile)
        await api.post(`/users/${id}/avatar`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      setSuccess('Personal actualizado')
      setEditingId(null)
      fetchStaff()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al actualizar')
    } finally { setSavingEdit(false) }
  }

  const roleLabel: Record<string, string> = {
    COACH: 'Coach', ADMIN: 'Administrador', MEMBER: 'Alumno', SUPER_ADMIN: 'Super Admin',
  }
  const roleBadge: Record<string, string> = { COACH: 'badge-blue', ADMIN: 'badge-purple' }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
            <Users2 className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="section-title">Personal y coaches</h1>
            <p className="text-slate-500 text-sm">Gestiona el equipo de tu gimnasio</p>
          </div>
        </div>
        <button onClick={() => { setShowForm(!showForm); setError(''); setSuccess('') }}
          className="btn-brand flex items-center gap-2 px-4 py-2 text-sm">
          <UserPlus className="w-4 h-4" />
          {showForm ? 'Cancelar' : 'Nuevo coach'}
        </button>
      </div>

      {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">{success}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>}

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="card rounded-xl p-6 space-y-5">
          <h2 className="font-semibold" style={{ color: 'var(--text-1)' }}>Nuevo integrante del personal</h2>
          <div className="flex items-center gap-5">
            <div className="relative">
              {avatarPreview
                ? <img src={avatarPreview} alt="preview" className="w-16 h-16 rounded-full object-cover" />
                : <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
                    style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--text-4)' }}>
                    {form.name ? form.name[0].toUpperCase() : '?'}
                  </div>
              }
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--brand-accent)', color: '#fff' }}>
                <Camera className="w-3 h-3" />
              </button>
            </div>
            <div>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="btn-secondary px-3 py-1.5 text-xs rounded-lg">Subir foto</button>
              <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>JPG, PNG o WebP</p>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Nombre *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Rol *</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="input">
                <option value="COACH">Coach</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Email *</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Teléfono</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Contraseña temporal *</label>
              <input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required minLength={6} placeholder="Mínimo 6 caracteres" className="input" />
            </div>
          </div>
          <button type="submit" disabled={saving} className="btn-brand w-full py-2.5 disabled:opacity-50">
            {saving ? 'Guardando...' : 'Crear'}
          </button>
        </form>
      )}

      {/* Staff table */}
      {loading ? (
        <div className="card rounded-xl p-20 text-center text-slate-400 text-sm">Cargando...</div>
      ) : staff.length === 0 ? (
        <div className="card rounded-xl p-16 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
            <Users2 className="w-7 h-7 text-slate-300" />
          </div>
          <div>
            <p className="font-medium" style={{ color: 'var(--text-1)' }}>No hay personal registrado</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-4)' }}>Agrega coaches y administradores para asignarlos a las clases</p>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-brand px-5 py-2 text-sm">+ Agregar primer coach</button>
        </div>
      ) : (
        <div className="card rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border-1)', backgroundColor: 'var(--surface-base)' }}>
                {['Nombre', 'Rol', 'Teléfono', 'Miembro desde', ''].map(h => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide px-5 py-3"
                    style={{ color: 'var(--text-4)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id} className="border-b last:border-0"
                  style={{ borderColor: 'var(--border-1)' }}>
                  {editingId === s.id ? (
                    /* ─── Edit row ─── */
                    <td colSpan={5} className="px-5 py-4">
                      <div className="flex items-start gap-4 flex-wrap">
                        {/* Avatar edit */}
                        <div className="relative shrink-0">
                          {editAvatarPreview ? (
                            <img src={editAvatarPreview} className="w-12 h-12 rounded-full object-cover" alt="" />
                          ) : s.avatarUrl ? (
                            <img src={mediaUrl(s.avatarUrl)} className="w-12 h-12 rounded-full object-cover" alt=""
                              onError={e => { const el = e.currentTarget; el.style.display = 'none'; (el.nextElementSibling as HTMLElement)?.style.setProperty('display', 'flex') }} />
                          ) : null}
                          {!editAvatarPreview && (
                            <div className="w-12 h-12 rounded-full items-center justify-center text-base font-bold"
                              style={{ backgroundColor: 'var(--brand-accent)' + '20', color: 'var(--brand-accent)', display: s.avatarUrl ? 'none' : 'flex' }}>
                              {s.name[0].toUpperCase()}
                            </div>
                          )}
                          <button type="button" onClick={() => editFileRef.current?.click()}
                            className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: 'var(--brand-accent)', color: '#fff' }}>
                            <Camera className="w-2.5 h-2.5" />
                          </button>
                          <input ref={editFileRef} type="file" accept="image/*" className="hidden" onChange={handleEditAvatarChange} />
                        </div>

                        {/* Fields */}
                        <div className="flex items-center gap-3 flex-1 flex-wrap">
                          <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="Nombre" className="input flex-1 min-w-[150px]" />
                          <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                            placeholder="Email" className="input flex-1 min-w-[180px]" />
                          <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                            placeholder="Teléfono" className="input w-36" />
                          <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                            className="input w-40">
                            <option value="COACH">Coach</option>
                            <option value="ADMIN">Administrador</option>
                          </select>
                          <div className="flex gap-2">
                            <button onClick={() => handleSaveEdit(s.id)} disabled={savingEdit}
                              className="btn-brand flex items-center gap-1.5 px-3 py-2 text-sm disabled:opacity-50">
                              <Check className="w-3.5 h-3.5" />
                              {savingEdit ? '...' : 'Guardar'}
                            </button>
                            <button onClick={cancelEdit} className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg">
                              <X className="w-3.5 h-3.5" />
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                  ) : (
                    /* ─── Read row ─── */
                    <>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {s.avatarUrl ? (
                            <img src={mediaUrl(s.avatarUrl)}
                              className="w-8 h-8 rounded-full object-cover shrink-0" alt=""
                              onError={e => { const el = e.currentTarget; el.style.display = 'none'; (el.nextElementSibling as HTMLElement)?.style.setProperty('display', 'flex') }} />
                          ) : null}
                          <div className="w-8 h-8 rounded-full items-center justify-center text-xs font-semibold shrink-0"
                            style={{ backgroundColor: 'var(--brand-accent)' + '20', color: 'var(--brand-accent)', display: s.avatarUrl ? 'none' : 'flex' }}>
                            {s.name[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>{s.name}</p>
                            <p className="text-xs" style={{ color: 'var(--text-4)' }}>{s.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={roleBadge[s.role] || 'badge-gray'}>{roleLabel[s.role] || s.role}</span>
                      </td>
                      <td className="px-5 py-4 text-sm" style={{ color: 'var(--text-3)' }}>
                        {s.phone || <span style={{ color: 'var(--border-2)' }}>—</span>}
                      </td>
                      <td className="px-5 py-4 text-sm" style={{ color: 'var(--text-3)' }}>
                        {new Date(s.createdAt).toLocaleDateString('es-CL')}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button onClick={() => startEdit(s)}
                          className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg ml-auto">
                          <Edit2 className="w-3 h-3" />
                          Editar
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
