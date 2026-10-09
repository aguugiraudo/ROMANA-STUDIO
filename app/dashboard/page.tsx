'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { getRol, ROLES } from '../lib/auth'
import Menu from '../components/Menu'

const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function mesActualISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function mesAnterior(mes) {
  const [y, m] = mes.split('-').map(Number)
  const fecha = new Date(y, m - 2, 1)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-01`
}

function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Dashboard() {
  const router = useRouter()
  const [rol, setRolState] = useState(null)
  const [mes, setMes] = useState(mesActualISO())
  const [cargando, setCargando] = useState(true)
  const [alumnosActivos, setAlumnosActivos] = useState(0)
  const [alumnosNuevos, setAlumnosNuevos] = useState(0)
  const [alumnosBajas, setAlumnosBajas] = useState(0)
  const [ocupacion, setOcupacion] = useState(0)
  const [ingresoProyectado, setIngresoProyectado] = useState(0)
  const [ingresoReal, setIngresoReal] = useState(0)
  const [egresoReal, setEgresoReal] = useState(0)
  const [egresoProyectado, setEgresoProyectado] = useState(0)
  const [vencidos, setVencidos] = useState(0)
  const [gastosSinPagar, setGastosSinPagar] = useState(0)
  const [gastosSinMonto, setGastosSinMonto] = useState(0)

  useEffect(() => {
    const r = getRol()
    if (!r) { router.push('/login'); return }
    if (r !== ROLES.ADMIN) { router.push('/'); return }
    setRolState(r)
  }, [router])

  const cargar = useCallback(async () => {
    setCargando(true)
    const [y, m] = mes.split('-').map(Number)
    const finMes = new Date(y, m, 1)
    const finMesISO = `${finMes.getFullYear()}-${String(finMes.getMonth() + 1).padStart(2, '0')}-01`
    const mesPrevio = mesAnterior(mes)

    const { data: inscMes } = await supabase
      .from('inscripciones')
      .select('alumno_id, alumnos(id, clases_semana, exento_pago)')
      .eq('mes', mes).eq('estado', 'activo')
    const { data: inscPrevio } = await supabase
      .from('inscripciones').select('alumno_id')
      .eq('mes', mesPrevio).eq('estado', 'activo')

    const idsMes = new Set((inscMes || []).map(i => i.alumno_id))
    const idsPrevio = new Set((inscPrevio || []).map(i => i.alumno_id))
    setAlumnosActivos(idsMes.size)
    setAlumnosNuevos([...idsMes].filter(id => !idsPrevio.has(id)).length)
    setAlumnosBajas([...idsPrevio].filter(id => !idsMes.has(id)).length)

    const { data: horarios } = await supabase.from('horarios_clase').select('cupos').eq('activo', true)
    const cuposTotales = (horarios || []).reduce((acc, h) => acc + h.cupos, 0)
    const ocupadas = (inscMes || []).length
    setOcupacion(cuposTotales > 0 ? Math.round((ocupadas / cuposTotales) * 100) : 0)

    const { data: cv } = await supabase.from('cuotas_valores').select('*').order('vigente_desde', { ascending: false })
    const cuotaBase = {}
    ;(cv || []).filter(v => v.vigente_desde < finMesISO).forEach(v => { if (!(v.clases_semana in cuotaBase)) cuotaBase[v.clases_semana] = v.valor })

    const conteos = {}
    const exentos = {}
    ;(inscMes || []).forEach(i => {
      if (!i.alumnos) return
      conteos[i.alumno_id] = (conteos[i.alumno_id] || 0) + 1
      exentos[i.alumno_id] = !!i.alumnos.exento_pago
    })

    const { data: cobMes } = await supabase.from('cobranzas').select('*').eq('mes', mes)
    let proy = 0
    Object.keys(conteos).forEach(alumnoId => {
      if (exentos[alumnoId]) return
      const c = (cobMes || []).find(x => x.alumno_id === alumnoId)
      const esperado = c && c.monto_esperado !== null && c.monto_esperado !== undefined ? Number(c.monto_esperado) : (cuotaBase[conteos[alumnoId]] || 0)
      proy += esperado
    })
    setIngresoProyectado(proy)
    const real = (cobMes || []).reduce((acc, c) => acc + (Number(c.monto) || 0), 0)
    setIngresoReal(real)

    const fechaVencimiento = `${mes.slice(0, 8)}10`
    let vencidosCount = 0
    if (hoyISO() > fechaVencimiento) {
      Object.keys(conteos).forEach(alumnoId => {
        if (exentos[alumnoId]) return
        const c = (cobMes || []).find(x => x.alumno_id === alumnoId)
        const pagado = c && Number(c.monto) > 0
        if (!pagado) vencidosCount++
      })
    }
    setVencidos(vencidosCount)

    const { data: gastosMes } = await supabase
      .from('gastos').select('*')
      .gte('fecha', mes).lt('fecha', finMesISO)
    const lista = gastosMes || []
    const sinMonto = g => g.monto === null || g.monto === undefined
    setEgresoReal(lista.filter(g => g.estado === 'Pagado').reduce((acc, g) => acc + Number(g.monto), 0))
    setEgresoProyectado(lista.filter(g => g.estado === 'Proyectado').reduce((acc, g) => acc + (Number(g.monto) || 0), 0))
    setGastosSinPagar(lista.filter(g => g.estado === 'Proyectado' && !sinMonto(g)).length)
    setGastosSinMonto(lista.filter(g => g.estado === 'Proyectado' && sinMonto(g)).length)

    setCargando(false)
  }, [mes])

  useEffect(() => { if (rol) cargar() }, [cargar, rol])

  function cambiarMes(delta) {
    const [y, m] = mes.split('-').map(Number)
    const fecha = new Date(y, m - 1 + delta, 1)
    setMes(`${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-01`)
  }
  const [anio, mesNum] = mes.split('-').map(Number)
  const labelMes = `${NOMBRES_MES[mesNum - 1]} ${anio}`

  const resultadoMes = ingresoReal - egresoReal
  const resultadoProyectado = ingresoProyectado - (egresoReal + egresoProyectado)
  const hayAlertas = vencidos > 0 || gastosSinPagar > 0 || gastosSinMonto > 0
  const netoAlumnos = alumnosNuevos - alumnosBajas
  const porcentajeCobrado = ingresoProyectado > 0 ? Math.round((ingresoReal / ingresoProyectado) * 100) : 0

  if (!rol) return null

  return (
    <div className="min-h-screen bg-[#ECE6DA] px-4 py-6 md:px-12 md:py-8">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <p className="text-3xl md:text-4xl text-[#221F1B] tracking-wide" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
          Romana Studio
        </p>
        <Menu activo="/dashboard" />
      </div>

      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => cambiarMes(-1)} className="w-8 h-8 rounded-full bg-white border border-[#221F1B]/10 flex items-center justify-center text-[#221F1B] hover:bg-[#F5F1E9]">‹</button>
        <span className="text-sm font-medium text-[#221F1B] min-w-[140px] text-center">{labelMes}</span>
        <button onClick={() => cambiarMes(1)} className="w-8 h-8 rounded-full bg-white border border-[#221F1B]/10 flex items-center justify-center text-[#221F1B] hover:bg-[#F5F1E9]">›</button>
      </div>

      <p className="text-xs text-[#8A8378] uppercase tracking-widest mb-6">Dashboard</p>

      {cargando ? (
        <p className="text-[#8A8378] text-sm">Cargando…</p>
      ) : (
        <>
          {hayAlertas && (
            <div className="bg-[#FBEAE8] border border-[#B5504A]/20 rounded-xl px-4 py-3 mb-6 flex flex-wrap gap-x-6 gap-y-1">
              {vencidos > 0 && (
                <a href="/cobranza" className="text-sm text-[#B5504A] font-medium hover:underline">
                  {vencidos} {vencidos === 1 ? 'alumno vencido' : 'alumnos vencidos'} →
                </a>
              )}
              {gastosSinPagar > 0 && (
                <a href="/gastos" className="text-sm text-[#B5504A] font-medium hover:underline">
                  {gastosSinPagar} {gastosSinPagar === 1 ? 'gasto proyectado sin pagar' : 'gastos proyectados sin pagar'} →
                </a>
              )}
              {gastosSinMonto > 0 && (
                <a href="/gastos" className="text-sm text-[#B5504A] font-medium hover:underline">
                  {gastosSinMonto} {gastosSinMonto === 1 ? 'gasto sin monto cargado' : 'gastos sin monto cargado'} (el proyectado todavía no los suma) →
                </a>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-5 py-4">
              <p className="text-xs text-[#8A8378] mb-1">Alumnos activos</p>
              <p className="text-3xl font-semibold text-[#221F1B]">{alumnosActivos}</p>
              <p className="text-xs text-[#8A8378] mt-1">
                {netoAlumnos > 0 ? '+' : ''}{netoAlumnos} vs mes anterior
              </p>
              <p className="text-xs text-[#5C6F5D]">+{alumnosNuevos} nuevos</p>
              <p className="text-xs text-[#B5504A]">-{alumnosBajas} bajas</p>
            </div>
            <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-5 py-4">
              <p className="text-xs text-[#8A8378] mb-1">Ocupación de la grilla</p>
              <p className="text-3xl font-semibold text-[#221F1B]">{ocupacion}%</p>
            </div>
            <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-5 py-4">
              <p className="text-xs text-[#8A8378] mb-1">Cobrado / Proyectado</p>
              <p className="text-2xl font-semibold text-[#5C6F5D]">${ingresoReal.toLocaleString('es-AR')}</p>
              <p className="text-xs text-[#8A8378] mt-1">de ${ingresoProyectado.toLocaleString('es-AR')}</p>
              <p className="text-xs text-[#8A8378]">{porcentajeCobrado}% cobrado</p>
            </div>
            <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-5 py-4">
              <p className="text-xs text-[#8A8378] mb-1">Resultado del mes</p>
              <p className={`text-2xl font-semibold ${resultadoMes >= 0 ? 'text-[#5C6F5D]' : 'text-[#B5504A]'}`}>
                ${resultadoMes.toLocaleString('es-AR')}
              </p>
              <p className="text-xs text-[#8A8378] mt-1">real (cobrado − pagado)</p>
              <p className={`text-xs ${resultadoProyectado >= 0 ? 'text-[#5C6F5D]' : 'text-[#B5504A]'}`}>
                proyectado ${resultadoProyectado.toLocaleString('es-AR')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <a href="/cobranza" className="text-sm px-4 py-2 rounded-full bg-white border border-[#221F1B]/10 text-[#221F1B] hover:border-[#5C6F5D] hover:text-[#5C6F5D]">Ir a Cobranza</a>
            <a href="/gastos" className="text-sm px-4 py-2 rounded-full bg-white border border-[#221F1B]/10 text-[#221F1B] hover:border-[#5C6F5D] hover:text-[#5C6F5D]">Ir a Gastos</a>
            <a href="/finanzas" className="text-sm px-4 py-2 rounded-full bg-white border border-[#221F1B]/10 text-[#221F1B] hover:border-[#5C6F5D] hover:text-[#5C6F5D]">Ir a Finanzas</a>
          </div>
        </>
      )}
    </div>
  )
}
