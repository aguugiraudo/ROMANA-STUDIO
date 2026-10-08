'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { getRol, cerrarSesion, ROLES } from '../lib/auth'

const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DENOMINACIONES = [20000, 10000, 2000, 1000, 500, 100]

function mesActualISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function Finanzas() {
  const router = useRouter()
  const [rol, setRolState] = useState(null)
  const [mes, setMes] = useState(mesActualISO())
  const [cargando, setCargando] = useState(true)
  const [ingresoProyectado, setIngresoProyectado] = useState(0)
  const [ingresoReal, setIngresoReal] = useState(0)
  const [egresoReal, setEgresoReal] = useState(0)
  const [egresoProyectado, setEgresoProyectado] = useState(0)
  const [saldoPorCuenta, setSaldoPorCuenta] = useState([])
  const [saldoEfectivo, setSaldoEfectivo] = useState(0)
  const [billetesAbierto, setBilletesAbierto] = useState(false)
  const [cantidades, setCantidades] = useState({})

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

    const { data: insc } = await supabase
      .from('inscripciones')
      .select('alumno_id, alumnos(id, clases_semana, exento_pago)')
      .eq('mes', mes).eq('estado', 'activo')
    const conteos = {}
    const exentos = {}
    ;(insc || []).forEach(i => {
      if (!i.alumnos) return
      conteos[i.alumno_id] = (conteos[i.alumno_id] || 0) + 1
      exentos[i.alumno_id] = !!i.alumnos.exento_pago
    })

    const { data: cv } = await supabase.from('cuotas_valores').select('*').order('vigente_desde', { ascending: false })
    const cuotaBase = {}
    ;(cv || []).filter(v => v.vigente_desde < finMesISO).forEach(v => { if (!(v.clases_semana in cuotaBase)) cuotaBase[v.clases_semana] = v.valor })

    const { data: cobMes } = await supabase.from('cobranzas').select('*').eq('mes', mes)
    let proy = 0
    Object.keys(conteos).forEach(alumnoId => {
      if (exentos[alumnoId]) return
      const c = (cobMes || []).find(x => x.alumno_id === alumnoId)
      const esperado = c && c.monto_esperado !== null && c.monto_esperado !== undefined ? Number(c.monto_esperado) : (cuotaBase[conteos[alumnoId]] || 0)
      proy += esperado
    })
    const real = (cobMes || []).reduce((acc, c) => acc + (Number(c.monto) || 0), 0)
    setIngresoProyectado(proy)
    setIngresoReal(real)

    const { data: gastosMes } = await supabase
      .from('gastos').select('*')
      .gte('fecha', mes).lt('fecha', finMesISO)
    const egR = (gastosMes || []).filter(g => g.estado === 'Pagado').reduce((acc, g) => acc + Number(g.monto), 0)
    const egP = (gastosMes || []).filter(g => g.estado === 'Proyectado').reduce((acc, g) => acc + Number(g.monto), 0)
    setEgresoReal(egR)
    setEgresoProyectado(egP)

    const { data: cuentas } = await supabase.from('cuentas').select('*').order('nombre')

    const saldos = (cuentas || []).map(ct => {
      const ingresos = (cobMes || []).filter(c => c.forma_pago === 'Transferencia' && c.cuenta_id === ct.id).reduce((acc, c) => acc + Number(c.monto), 0)
      const egresos = (gastosMes || []).filter(g => g.forma_pago === 'Transferencia' && g.cuenta_id === ct.id && g.estado === 'Pagado').reduce((acc, g) => acc + Number(g.monto), 0)
      return { nombre: ct.nombre, ingresos, egresos, saldo: ingresos - egresos }
    })
    setSaldoPorCuenta(saldos)

    const ingresosEf = (cobMes || []).filter(c => c.forma_pago === 'Efectivo').reduce((acc, c) => acc + Number(c.monto), 0)
    const egresosEf = (gastosMes || []).filter(g => g.forma_pago === 'Efectivo' && g.estado === 'Pagado').reduce((acc, g) => acc + Number(g.monto), 0)
    setSaldoEfectivo(ingresosEf - egresosEf)

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

  const resultadoReal = ingresoReal - egresoReal
  const resultadoProyectado = ingresoProyectado - (egresoReal + egresoProyectado)

  function abrirBilletes() {
    const inicial = {}
    DENOMINACIONES.forEach(d => { inicial[d] = '' })
    setCantidades(inicial)
    setBilletesAbierto(true)
  }

  const totalContado = DENOMINACIONES.reduce((acc, d) => acc + (parseInt(cantidades[d]) || 0) * d, 0)
  const diferenciaCaja = totalContado - saldoEfectivo

  function salir() {
    cerrarSesion()
    router.push('/login')
  }

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
          <a href="/finanzas" className="text-sm font-medium text-[#5C6F5D] border-b-2 border-[#5C6F5D] pb-0.5">Finanzas</a>
          <a href="/alumnos" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Alumnos</a>
          <a href="/dashboard" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Dashboard</a>
          <a href="/proyectos" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Proyectos</a>
          <button onClick={salir} className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Cerrar sesión</button>
        </nav>
      </div>

      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => cambiarMes(-1)} className="w-8 h-8 rounded-full bg-white border border-[#221F1B]/10 flex items-center justify-center text-[#221F1B] hover:bg-[#F5F1E9]">‹</button>
          <span className="text-sm font-medium text-[#221F1B] min-w-[140px] text-center">{labelMes}</span>
          <button onClick={() => cambiarMes(1)} className="w-8 h-8 rounded-full bg-white border border-[#221F1B]/10 flex items-center justify-center text-[#221F1B] hover:bg-[#F5F1E9]">›</button>
        </div>
        <button onClick={abrirBilletes} className="text-sm px-4 py-2 rounded-full bg-white border border-[#221F1B]/10 text-[#221F1B] hover:border-[#5C6F5D] hover:text-[#5C6F5D] flex items-center gap-2">
          <span>💵</span> Contador de efectivo
        </button>
      </div>

      <p className="text-xs text-[#8A8378] uppercase tracking-widest mb-6">Finanzas</p>

      {cargando ? (
        <p className="text-[#8A8378] text-sm">Cargando…</p>
      ) : (
        <>
          <p className="text-[11px] uppercase tracking-widest text-[#8A8378] mb-3">Estado de resultado — {labelMes}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 p-5">
              <p className="text-xs text-[#8A8378] mb-3">Real (lo que ya pasó de verdad)</p>
              <div className="flex justify-between text-sm text-[#221F1B] mb-1">
                <span>Ingresos cobrados</span><span>${ingresoReal.toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between text-sm text-[#221F1B] mb-3">
                <span>Egresos pagados</span><span>-${egresoReal.toLocaleString('es-AR')}</span>
              </div>
              <div className="border-t border-[#221F1B]/10 pt-3 flex justify-between">
                <span className="text-sm font-medium text-[#221F1B]">Resultado real</span>
                <span className={`text-xl font-semibold ${resultadoReal >= 0 ? 'text-[#5C6F5D]' : 'text-[#B5504A]'}`}>
                  ${resultadoReal.toLocaleString('es-AR')}
                </span>
              </div>
            </div>

            <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 p-5">
              <p className="text-xs text-[#8A8378] mb-3">Proyectado (si se cobra y paga todo lo previsto)</p>
              <div className="flex justify-between text-sm text-[#221F1B] mb-1">
                <span>Ingresos proyectados</span><span>${ingresoProyectado.toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between text-sm text-[#221F1B] mb-3">
                <span>Egresos (pagados + proyectados)</span><span>-${(egresoReal + egresoProyectado).toLocaleString('es-AR')}</span>
              </div>
              <div className="border-t border-[#221F1B]/10 pt-3 flex justify-between">
                <span className="text-sm font-medium text-[#221F1B]">Resultado proyectado</span>
                <span className={`text-xl font-semibold ${resultadoProyectado >= 0 ? 'text-[#5C6F5D]' : 'text-[#B5504A]'}`}>
                  ${resultadoProyectado.toLocaleString('es-AR')}
                </span>
              </div>
            </div>
          </div>

          <p className="text-[11px] uppercase tracking-widest text-[#8A8378] mb-1">Caja del mes — {labelMes}</p>
          <p className="text-xs text-[#8A8378] mb-3">Se reinicia cada mes: lo que entró menos lo que salió de cada cuenta y de efectivo en {labelMes} puntual — no arrastra saldo de meses anteriores, ya que a fin de mes se retira todo como rentabilidad.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
            <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
              <p className="text-xs text-[#8A8378] mb-1">Efectivo</p>
              <p className="text-xl font-semibold text-[#221F1B]">${saldoEfectivo.toLocaleString('es-AR')}</p>
            </div>
            {saldoPorCuenta.map(s => (
              <div key={s.nombre} className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
                <p className="text-xs text-[#8A8378] mb-1">{s.nombre}</p>
                <p className="text-xl font-semibold text-[#221F1B]">${s.saldo.toLocaleString('es-AR')}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {billetesAbierto && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 py-8" onClick={() => setBilletesAbierto(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-1">Contador de efectivo</p>
            <p className="text-xs text-[#8A8378] mb-4">Poné cuántos billetes de cada uno tenés en la caja ahora</p>

            <div className="flex flex-col gap-2 mb-4">
              {DENOMINACIONES.map(d => (
                <div key={d} className="flex items-center justify-between gap-3">
                  <label className="text-sm text-[#221F1B] w-24">${d.toLocaleString('es-AR')}</label>
                  <input
                    type="number"
                    min={0}
                    value={cantidades[d] || ''}
                    onChange={e => setCantidades({ ...cantidades, [d]: e.target.value })}
                    placeholder="0"
                    className="flex-1 border border-[#221F1B]/15 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#5C6F5D] text-right"
                  />
                  <span className="text-xs text-[#8A8378] w-24 text-right">
                    ${((parseInt(cantidades[d]) || 0) * d).toLocaleString('es-AR')}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-[#221F1B]/10 pt-3 mb-3">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-[#221F1B]">Total contado</span>
                <span className="text-xl font-semibold text-[#221F1B]">${totalContado.toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-[#8A8378]">Caja teórica de {labelMes}</span>
                <span className="text-sm text-[#8A8378]">${saldoEfectivo.toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-[#221F1B]">Diferencia</span>
                <span className={`text-sm font-semibold ${diferenciaCaja === 0 ? 'text-[#5C6F5D]' : 'text-[#B5504A]'}`}>
                  {diferenciaCaja > 0 ? '+' : ''}${diferenciaCaja.toLocaleString('es-AR')}
                </span>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={() => setBilletesAbierto(false)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}