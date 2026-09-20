'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { getRol, cerrarSesion, ROLES } from '../lib/auth'

const RESPONSABLES = ['Agustín', 'Iara', 'Ambos']

function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Proyectos() {
  const router = useRouter()
  const [rol, setRolState] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [proyectos, setProyectos] = useState([])
  const [acciones, setAcciones] = useState([])
  const [vista, setVista] = useState('activos')
  const [expandido, setExpandido] = useState({})
  const [nuevoProyectoModal, setNuevoProyectoModal] = useState(false)
  const [tituloProyectoForm, setTituloProyectoForm] = useState('')
  const [nuevaAccionModal, setNuevaAccionModal] = useState(null)
  const [tituloAccionForm, setTituloAccionForm] = useState('')
  const [responsableAccionForm, setResponsableAccionForm] = useState('')
  const [fechaAccionForm, setFechaAccionForm] = useState('')
  const [confirmarBorrarProyecto, setConfirmarBorrarProyecto] = useState(null)
  const [confirmarBorrarAccion, setConfirmarBorrarAccion] = useState(null)
  const [proximasAbierto, setProximasAbierto] = useState(false)

  useEffect(() => {
    const r = getRol()
    if (!r) { router.push('/login'); return }
    if (r !== ROLES.ADMIN) { router.push('/'); return }
    setRolState(r)
  }, [router])

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data: p } = await supabase.from('proyectos').select('*').order('created_at', { ascending: false })
    setProyectos(p || [])
    const { data: a } = await supabase.from('acciones').select('*').order('created_at')
    setAcciones(a || [])
    setCargando(false)
  }, [])

  useEffect(() => { if (rol) cargar() }, [cargar, rol])

  function accionesDe(proyectoId) { return acciones.filter(a => a.proyecto_id === proyectoId) }
  function proyectoDe(proyectoId) { return proyectos.find(p => p.id === proyectoId) }

  async function recalcularArchivado(proyectoId) {
    const lista = accionesDe(proyectoId)
    const todasHechas = lista.length > 0 && lista.every(a => a.hecho)
    await supabase.from('proyectos').update({ archivado: todasHechas }).eq('id', proyectoId)
  }

  async function crearProyecto() {
    const titulo = tituloProyectoForm.trim()
    if (!titulo) return
    await supabase.from('proyectos').insert({ titulo, archivado: false })
    setNuevoProyectoModal(false)
    setTituloProyectoForm('')
    cargar()
  }

  async function borrarProyecto() {
    if (!confirmarBorrarProyecto) return
    await supabase.from('proyectos').delete().eq('id', confirmarBorrarProyecto.id)
    setConfirmarBorrarProyecto(null)
    cargar()
  }

  function abrirNuevaAccion(proyectoId) {
    setNuevaAccionModal(proyectoId)
    setTituloAccionForm('')
    setResponsableAccionForm('')
    setFechaAccionForm('')
  }

  async function crearAccion() {
    const titulo = tituloAccionForm.trim()
    if (!titulo || !nuevaAccionModal) return
    await supabase.from('acciones').insert({
      proyecto_id: nuevaAccionModal,
      titulo,
      responsable: responsableAccionForm || null,
      fecha: fechaAccionForm || null,
      hecho: false
    })
    await recalcularArchivado(nuevaAccionModal)
    setNuevaAccionModal(null)
    cargar()
  }

  async function toggleAccion(accion) {
    await supabase.from('acciones').update({ hecho: !accion.hecho }).eq('id', accion.id)
    await recalcularArchivado(accion.proyecto_id)
    cargar()
  }

  async function borrarAccion() {
    if (!confirmarBorrarAccion) return
    const proyectoId = confirmarBorrarAccion.proyecto_id
    await supabase.from('acciones').delete().eq('id', confirmarBorrarAccion.id)
    await recalcularArchivado(proyectoId)
    setConfirmarBorrarAccion(null)
    cargar()
  }

  async function reabrirProyecto(proyectoId) {
    await supabase.from('proyectos').update({ archivado: false }).eq('id', proyectoId)
    cargar()
  }

  function toggleExpandido(id) {
    setExpandido(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function irAProyectoDesdeProximas(accion) {
    setProximasAbierto(false)
    setVista('activos')
    setExpandido(prev => ({ ...prev, [accion.proyecto_id]: true }))
  }

  function salir() {
    cerrarSesion()
    router.push('/login')
  }

  const proyectosFiltrados = proyectos.filter(p => vista === 'activos' ? !p.archivado : p.archivado)

  const proximasAcciones = acciones
    .filter(a => !a.hecho && a.fecha)
    .filter(a => {
      const p = proyectoDe(a.proyecto_id)
      return p && !p.archivado
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  if (!rol) return null

  return (
    <div className="min-h-screen bg-[#ECE6DA] px-4 py-6 md:px-12 md:py-8">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <p className="text-3xl md:text-4xl text-[#221F1B] tracking-wide" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
          Romana Studio
        </p>
        <nav className="flex gap-4 flex-wrap items-center">
          <a href="/" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Días y Horarios</a>
          <a href="/cobranza" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Cobranza</a>
          <a href="/gastos" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Gastos</a>
          <a href="/finanzas" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Finanzas</a>
          <a href="/alumnos" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Alumnos</a>
          <a href="/dashboard" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Dashboard</a>
          <a href="/proyectos" className="text-sm font-medium text-[#5C6F5D] border-b-2 border-[#5C6F5D] pb-0.5">Proyectos</a>
          <button onClick={salir} className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Cerrar sesión</button>
        </nav>
      </div>

      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <p className="text-xs text-[#8A8378] uppercase tracking-widest">Proyectos</p>
        <div className="flex gap-2">
          <button onClick={() => setProximasAbierto(true)} className="text-sm px-4 py-2 rounded-full bg-white border border-[#221F1B]/10 text-[#221F1B] hover:border-[#5C6F5D] hover:text-[#5C6F5D] flex items-center gap-2">
            <span>📅</span> Próximas acciones
          </button>
          <button onClick={() => setNuevoProyectoModal(true)} className="text-sm px-4 py-2 rounded-full bg-[#5C6F5D] text-white hover:bg-[#4C5C4D]">
            + Nuevo proyecto
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6 mt-4">
        {['activos', 'archivados'].map(v => (
          <button key={v} onClick={() => setVista(v)} className={`px-4 py-1.5 rounded-full text-sm border ${vista === v ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15 hover:border-[#5C6F5D]'}`}>
            {v === 'activos' ? 'Activos' : 'Archivados'}
          </button>
        ))}
      </div>

      {cargando ? (
        <p className="text-[#8A8378] text-sm">Cargando…</p>
      ) : proyectosFiltrados.length === 0 ? (
        <p className="text-sm text-[#8A8378]">
          {vista === 'activos' ? 'No hay proyectos activos. Creá uno con el botón de arriba.' : 'Todavía no hay proyectos archivados.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {proyectosFiltrados.map(p => {
            const lista = accionesDe(p.id)
            const hechas = lista.filter(a => a.hecho).length
            const abierto = !!expandido[p.id]
            return (
              <div key={p.id} className="bg-[#FBF9F5] rounded-2xl border border-[#221F1B]/8 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 cursor-pointer" onClick={() => toggleExpandido(p.id)}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#221F1B] truncate">{p.titulo}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 max-w-[160px] h-1.5 rounded-full bg-[#EDE7DD] overflow-hidden">
                        <div
                          className="h-full bg-[#5C6F5D]"
                          style={{ width: `${lista.length > 0 ? (hechas / lista.length) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-[#8A8378]">{hechas}/{lista.length} completadas</span>
                    </div>
                  </div>
                  <span className="text-[#8A8378] text-sm ml-3">{abierto ? '▲' : '▼'}</span>
                </div>

                {abierto && (
                  <div className="px-5 pb-4 border-t border-[#221F1B]/8 pt-3">
                    <div className="flex flex-col gap-2 mb-3">
                      {lista.length === 0 && (
                        <p className="text-xs text-[#8A8378]">Sin acciones cargadas todavía.</p>
                      )}
                      {lista.map(a => (
                        <div key={a.id} className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2 border border-[#221F1B]/8">
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              onClick={() => toggleAccion(a)}
                              className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${a.hecho ? 'bg-[#5C6F5D] border-[#5C6F5D]' : 'border-[#221F1B]/25'}`}
                            >
                              {a.hecho && <span className="text-white text-[10px]">✓</span>}
                            </button>
                            <div className="min-w-0">
                              <p className={`text-sm truncate ${a.hecho ? 'text-[#8A8378] line-through' : 'text-[#221F1B]'}`}>{a.titulo}</p>
                              <p className="text-[11px] text-[#8A8378]">
                                {a.responsable || 'Sin responsable'}{a.fecha ? ` · ${a.fecha}` : ''}
                              </p>
                            </div>
                          </div>
                          <button onClick={() => setConfirmarBorrarAccion(a)} className="text-xs text-[#B5504A] hover:underline flex-shrink-0">Borrar</button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <button onClick={() => abrirNuevaAccion(p.id)} className="text-xs text-[#5C6F5D] hover:underline">+ Agregar acción</button>
                      <div className="flex gap-3">
                        {p.archivado && (
                          <button onClick={() => reabrirProyecto(p.id)} className="text-xs text-[#8A6B2C] hover:underline">Reabrir proyecto</button>
                        )}
                        <button onClick={() => setConfirmarBorrarProyecto(p)} className="text-xs text-[#B5504A] hover:underline">Borrar proyecto</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {nuevoProyectoModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setNuevoProyectoModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-3">Nuevo proyecto</p>
            <label className="block text-xs text-[#8A8378] mb-1">Título</label>
            <input
              autoFocus
              value={tituloProyectoForm}
              onChange={e => setTituloProyectoForm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && crearProyecto()}
              placeholder="Ej: Implementar clases de Barré"
              className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-5 outline-none focus:border-[#5C6F5D]"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setNuevoProyectoModal(false)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
              <button onClick={crearProyecto} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">Crear</button>
            </div>
          </div>
        </div>
      )}

      {nuevaAccionModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setNuevaAccionModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-3">Nueva acción</p>
            <label className="block text-xs text-[#8A8378] mb-1">Título</label>
            <input
              autoFocus
              value={tituloAccionForm}
              onChange={e => setTituloAccionForm(e.target.value)}
              placeholder="Ej: Hacer el curso de certificación"
              className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#5C6F5D]"
            />
            <label className="block text-xs text-[#8A8378] mb-1">Responsable (opcional)</label>
            <div className="flex gap-2 mb-3 flex-wrap">
              {RESPONSABLES.map(r => (
                <button key={r} onClick={() => setResponsableAccionForm(responsableAccionForm === r ? '' : r)} className={`px-3 py-1.5 rounded-full text-xs border ${responsableAccionForm === r ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                  {r}
                </button>
              ))}
            </div>
            <label className="block text-xs text-[#8A8378] mb-1">Fecha objetivo (opcional)</label>
            <input type="date" value={fechaAccionForm} onChange={e => setFechaAccionForm(e.target.value)} className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-5 outline-none focus:border-[#5C6F5D]" />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setNuevaAccionModal(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
              <button onClick={crearAccion} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">Agregar</button>
            </div>
          </div>
        </div>
      )}

      {confirmarBorrarProyecto && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setConfirmarBorrarProyecto(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-[#221F1B] mb-6">
              ¿Seguro que querés borrar el proyecto <span className="font-semibold">{confirmarBorrarProyecto.titulo}</span>? Se borran también todas sus acciones.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmarBorrarProyecto(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
              <button onClick={borrarProyecto} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#B5504A] hover:bg-[#9C4340]">Borrar</button>
            </div>
          </div>
        </div>
      )}

      {confirmarBorrarAccion && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setConfirmarBorrarAccion(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-[#221F1B] mb-6">
              ¿Seguro que querés borrar la acción <span className="font-semibold">{confirmarBorrarAccion.titulo}</span>?
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmarBorrarAccion(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
              <button onClick={borrarAccion} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#B5504A] hover:bg-[#9C4340]">Borrar</button>
            </div>
          </div>
        </div>
      )}

      {proximasAbierto && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 py-8" onClick={() => setProximasAbierto(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-1">Próximas acciones</p>
            <p className="text-xs text-[#8A8378] mb-4">Todo lo que tiene fecha y todavía no está hecho, de más urgente a menos</p>
            <div className="max-h-96 overflow-y-auto flex flex-col gap-2">
              {proximasAcciones.length === 0 && (
                <p className="text-sm text-[#8A8378]">No hay acciones con fecha pendientes.</p>
              )}
              {proximasAcciones.map(a => {
                const vencida = a.fecha < hoyISO()
                const proyecto = proyectoDe(a.proyecto_id)
                return (
                  <button
                    key={a.id}
                    onClick={() => irAProyectoDesdeProximas(a)}
                    className={`text-left rounded-lg px-3 py-2.5 border ${vencida ? 'bg-[#FBEAE8] border-[#B5504A]/20' : 'bg-[#F5F1E9] border-transparent'} hover:border-[#5C6F5D]`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-[#221F1B]">{a.titulo}</p>
                      <span className={`text-xs font-medium whitespace-nowrap ${vencida ? 'text-[#B5504A]' : 'text-[#8A8378]'}`}>{a.fecha}</span>
                    </div>
                    <p className="text-xs text-[#8A8378] mt-0.5">
                      {proyecto?.titulo} {a.responsable ? `· ${a.responsable}` : ''}
                    </p>
                  </button>
                )
              })}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setProximasAbierto(false)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}