'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { getRol, cerrarSesion, ROLES } from '../lib/auth'

const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function mesActualISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function sincronizarEstadoAlumno(alumnoId) {
  const hoy = new Date()
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
  const { count } = await supabase
    .from('inscripciones')
    .select('id', { count: 'exact', head: true })
    .eq('alumno_id', alumnoId)
    .eq('mes', mesActual)
    .eq('estado', 'activo')
  await supabase.from('alumnos').update({ estado: count > 0 ? 'activo' : 'baja' }).eq('id', alumnoId)
}

export default function Cobranza() {
  const router = useRouter()
  const [rol, setRolState] = useState(null)
  const [mes, setMes] = useState(mesActualISO())
  const [cargando, setCargando] = useState(true)
  const [alumnosDelMes, setAlumnosDelMes] = useState([])
  const [cobranzas, setCobranzas] = useState([])
  const [cuotasValores, setCuotasValores] = useState({})
  const [cuentas, setCuentas] = useState([])
  const [pagoModal, setPagoModal] = useState(null)
  const [montoForm, setMontoForm] = useState('')
  const [montoEsperadoForm, setMontoEsperadoForm] = useState('')
  const [formaForm, setFormaForm] = useState('Efectivo')
  const [cuentaForm, setCuentaForm] = useState(null)
  const [diaPagoForm, setDiaPagoForm] = useState(hoyISO())
  const [cuotasModal, setCuotasModal] = useState(false)
  const [cuotasEdit, setCuotasEdit] = useState({})
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [mensajeModal, setMensajeModal] = useState(null)
  const [cuentaMensajeId, setCuentaMensajeId] = useState(null)
  const [tipoMensaje, setTipoMensaje] = useState('recordatorio')
  const [copiado, setCopiado] = useState(false)
  const [viendo, setViendo] = useState(null)
  const [inscripcionesDetalle, setInscripcionesDetalle] = useState([])
  const [confirmarBaja, setConfirmarBaja] = useState(null)
  const [actualizandoNoContinua, setActualizandoNoContinua] = useState(false)

  useEffect(() => {
    const r = getRol()
    if (!r) { router.push('/login'); return }
    if (r !== ROLES.ADMIN) { router.push('/'); return }
    setRolState(r)
  }, [router])

  const cargar = useCallback(async () => {
    setCargando(true)

    const { data: insc } = await supabase
      .from('inscripciones')
      .select('alumno_id, alumnos(id, nombre, exento_pago)')
      .eq('mes', mes).eq('estado', 'activo')

    const conteos = {}
    const datosPorId = {}
    ;(insc || []).forEach(i => {
      if (!i.alumnos) return
      conteos[i.alumno_id] = (conteos[i.alumno_id] || 0) + 1
      datosPorId[i.alumno_id] = i.alumnos
    })
    const lista = Object.keys(conteos).map(id => ({
      id, nombre: datosPorId[id].nombre, clasesReales: conteos[id], exento_pago: !!datosPorId[id].exento_pago
    })).sort((a, b) => a.nombre.localeCompare(b.nombre))
    setAlumnosDelMes(lista)

    const { data: cob } = await supabase
      .from('cobranzas').select('*, cuentas(nombre)').eq('mes', mes)
    setCobranzas(cob || [])

    const { data: cv } = await supabase
      .from('cuotas_valores').select('*').order('vigente_desde', { ascending: false })
    const mapa = {}
    ;(cv || []).forEach(v => { if (!(v.clases_semana in mapa)) mapa[v.clases_semana] = v.valor })
    setCuotasValores(mapa)
    setCuotasEdit(mapa)

    const { data: ct } = await supabase.from('cuentas').select('*').order('nombre')
    setCuentas(ct || [])
    if (ct && ct.length > 0 && !cuentaMensajeId) setCuentaMensajeId(ct[0].id)

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
  const [anioSig, mesNumSig] = (() => {
    const [y, m] = mes.split('-').map(Number)
    const f = new Date(y, m, 1)
    return [f.getFullYear(), f.getMonth() + 1]
  })()
  const labelMesSiguiente = `${NOMBRES_MES[mesNumSig - 1]} ${anioSig}`

  const fechaVencimiento = `${mes.slice(0, 8)}10`

  function cobranzaDe(alumnoId) { return cobranzas.find(c => c.alumno_id === alumnoId) }
  function estaPagado(alumnoId) {
    const c = cobranzaDe(alumnoId)
    return !!(c && Number(c.monto) > 0)
  }
  function estadoDe(alumno) {
    if (alumno.exento_pago) return 'exento'
    if (estaPagado(alumno.id)) return 'pagado'
    return hoyISO() > fechaVencimiento ? 'vencido' : 'pendiente'
  }
  function cuotaBase(clasesReales) { return cuotasValores[clasesReales] ?? 0 }
  function cuotaEsperada(alumno) {
    const c = cobranzaDe(alumno.id)
    if (c && c.monto_esperado !== null && c.monto_esperado !== undefined) return Number(c.monto_esperado)
    return cuotaBase(alumno.clasesReales)
  }

  const alumnosCobrables = alumnosDelMes.filter(a => !a.exento_pago)
  const proyectado = alumnosCobrables.reduce((acc, a) => acc + cuotaEsperada(a), 0)
  const cobradoReal = cobranzas.reduce((acc, c) => acc + (Number(c.monto) || 0), 0)
  const totalEfectivo = cobranzas.filter(c => c.forma_pago === 'Efectivo').reduce((acc, c) => acc + (Number(c.monto) || 0), 0)
  const totalTransferencia = cobranzas.filter(c => c.forma_pago === 'Transferencia').reduce((acc, c) => acc + (Number(c.monto) || 0), 0)
  const pendienteCobrar = proyectado - cobradoReal
  const pendientes = alumnosCobrables.filter(a => estadoDe(a) === 'pendiente').length
  const vencidos = alumnosCobrables.filter(a => estadoDe(a) === 'vencido').length

  const transferenciasPorCuenta = cuentas.map(ct => ({
    nombre: ct.nombre,
    total: cobranzas.filter(c => c.forma_pago === 'Transferencia' && c.cuenta_id === ct.id).reduce((acc, c) => acc + (Number(c.monto) || 0), 0)
  }))

  const alumnosFiltrados = alumnosDelMes.filter(a => {
    if (filtro !== 'todos' && estadoDe(a) !== filtro) return false
    if (busqueda.trim() && !a.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())) return false
    return true
  })

  function abrirPago(alumno) {
    const existente = cobranzaDe(alumno.id)
    setPagoModal({ alumno, existente })
    setMontoForm(existente && existente.monto ? String(existente.monto) : '')
    setMontoEsperadoForm(String(cuotaEsperada(alumno)))
    setFormaForm(existente?.forma_pago || 'Efectivo')
    setCuentaForm(existente?.cuenta_id || null)
    setDiaPagoForm(existente?.dia_pago || hoyISO())
  }

  async function guardarPago() {
    if (!pagoModal) return
    const montoPagado = parseFloat(montoForm) || 0
    if (montoPagado > 0 && formaForm === 'Transferencia' && !cuentaForm) {
      alert('Elegí a qué cuenta corresponde la transferencia antes de guardar')
      return
    }
    const payload = {
      alumno_id: pagoModal.alumno.id,
      mes,
      monto: montoPagado,
      monto_esperado: montoEsperadoForm === '' ? null : parseFloat(montoEsperadoForm),
      forma_pago: montoPagado > 0 ? formaForm : null,
      cuenta_id: montoPagado > 0 && formaForm === 'Transferencia' ? cuentaForm : null,
      dia_pago: montoPagado > 0 ? diaPagoForm : null
    }
    if (pagoModal.existente) {
      await supabase.from('cobranzas').update(payload).eq('id', pagoModal.existente.id)
    } else {
      await supabase.from('cobranzas').insert(payload)
    }
    setPagoModal(null)
    cargar()
  }

  async function borrarPago() {
    if (!pagoModal?.existente) return
    await supabase.from('cobranzas').delete().eq('id', pagoModal.existente.id)
    setPagoModal(null)
    cargar()
  }

  async function guardarCuotas() {
    const hoy = hoyISO()
    const cambios = Object.entries(cuotasEdit).filter(([k, v]) => cuotasValores[k] !== v)
    for (const [clases, valor] of cambios) {
      await supabase.from('cuotas_valores').insert({ clases_semana: parseInt(clases), valor: parseFloat(valor), vigente_desde: hoy })
    }
    setCuotasModal(false)
    cargar()
  }

  function abrirMensaje(alumno) {
    setMensajeModal(alumno)
    setTipoMensaje(estadoDe(alumno) === 'vencido' ? 'vencido' : 'recordatorio')
    setCopiado(false)
  }

  function textoMensaje() {
    if (!mensajeModal) return ''
    const cuenta = cuentas.find(c => c.id === cuentaMensajeId)
    const monto = cuotaEsperada(mensajeModal).toLocaleString('es-AR')
    const datosPago = cuenta
      ? `💳 Medios de pago:\nPodés abonar en efectivo en el estudio o por transferencia:\n- Alias: ${cuenta.alias || '—'}\n- Titular: ${cuenta.titular || '—'}\n- CUIL/CUIT: ${cuenta.cuil || '—'}\n- Entidad: ${cuenta.entidad || '—'}`
      : ''

    if (tipoMensaje === 'recordatorio') {
      return `Hola ${mensajeModal.nombre}! Te recordamos que la cuota de ${labelMes} vence el día 10 para mantener tu cupo reservado 🧘‍♀️\n\nEl monto es $${monto}.\n\n${datosPago}\n\n¡Gracias!\nRomana Studio`
    }
    return `Hola ${mensajeModal.nombre}! Vimos que todavía no registramos el pago de la cuota de ${labelMes} (venció el día 10).\n\nEl monto es $${monto}.\n\n${datosPago}\n\nSi ya la abonaste avisanos para actualizarlo. ¡Gracias!\nRomana Studio`
  }

  async function copiarMensajeCobranza() {
    try {
      await navigator.clipboard.writeText(textoMensaje())
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      alert('No se pudo copiar automáticamente, seleccioná el texto manualmente.')
    }
  }

  async function abrirDetalle(alumno) {
    setViendo(alumno)
    const { data } = await supabase
      .from('inscripciones')
      .select('*, horarios_clase(dia, hora)')
      .eq('alumno_id', alumno.id)
      .eq('mes', mes)
      .eq('estado', 'activo')
    setInscripcionesDetalle(data || [])
  }

  const yaMarcadoNoContinua = inscripcionesDetalle.length > 0 && inscripcionesDetalle.every(i => i.no_continua)

  async function toggleNoContinua() {
    if (!viendo || actualizandoNoContinua) return
    setActualizandoNoContinua(true)
    const nuevoValor = !yaMarcadoNoContinua
    await supabase.from('inscripciones').update({ no_continua: nuevoValor }).eq('alumno_id', viendo.id).eq('mes', mes).eq('estado', 'activo')
    const { data } = await supabase
      .from('inscripciones')
      .select('*, horarios_clase(dia, hora)')
      .eq('alumno_id', viendo.id)
      .eq('mes', mes)
      .eq('estado', 'activo')
    setInscripcionesDetalle(data || [])
    setActualizandoNoContinua(false)
  }

  async function confirmarBajaAhora() {
    if (!confirmarBaja) return
    await supabase.from('inscripciones').update({ estado: 'baja' }).eq('alumno_id', confirmarBaja.id).eq('mes', mes).eq('estado', 'activo')
    await sincronizarEstadoAlumno(confirmarBaja.id)
    setConfirmarBaja(null)
    setViendo(null)
    cargar()
  }

  function salir() {
    cerrarSesion()
    router.push('/login')
  }

  const chipEstado = {
    pagado: 'bg-[#5C6F5D] text-white',
    pendiente: 'bg-[#EDE7DD] text-[#8A6B2C]',
    vencido: 'bg-[#B5504A] text-white',
    exento: 'bg-[#E3E3DE] text-[#8A8378]'
  }
  const labelEstado = { pagado: 'Pagado', pendiente: 'Pendiente', vencido: 'Vencido', exento: 'Exento' }
  const contadorFiltro = { pagado: 0, pendiente: 0, vencido: 0, exento: 0 }
  alumnosDelMes.forEach(a => { contadorFiltro[estadoDe(a)] = (contadorFiltro[estadoDe(a)] || 0) + 1 })

  if (!rol) return null

  return (
    <div className="min-h-screen bg-[#ECE6DA] px-4 py-6 md:px-12 md:py-8">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <p className="text-3xl md:text-4xl text-[#221F1B] tracking-wide" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
          Romana Studio
        </p>
        <nav className="flex gap-4 flex-wrap items-center">
          <a href="/" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Días y Horarios</a>
          <a href="/cobranza" className="text-sm font-medium text-[#5C6F5D] border-b-2 border-[#5C6F5D] pb-0.5">Cobranza</a>
          <a href="/gastos" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Gastos</a>
          <a href="/finanzas" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Finanzas</a>
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
        <button onClick={() => { setCuotasEdit(cuotasValores); setCuotasModal(true) }} className="text-sm px-4 py-2 rounded-full bg-white border border-[#221F1B]/10 text-[#221F1B] hover:border-[#5C6F5D] hover:text-[#5C6F5D]">
          Valores de cuota
        </button>
      </div>

      <p className="text-xs text-[#8A8378] uppercase tracking-widest mb-1">Cobranza</p>
      <p className="text-xs text-[#8A8378] mb-6">Vencimiento del mes: día 10 · click en el nombre para ver horarios, marcar que no continúa, o dar de baja · click en el estado para copiar mensaje de WhatsApp</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="flex flex-col gap-3">
          <p className="text-[11px] uppercase tracking-widest text-[#8A8378]">Cobrado</p>
          <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
            <p className="text-xs text-[#8A8378] mb-1">Cobrado real</p>
            <p className="text-2xl font-semibold text-[#5C6F5D]">${cobradoReal.toLocaleString('es-AR')}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
              <p className="text-xs text-[#8A8378] mb-1">Efectivo</p>
              <p className="text-lg font-semibold text-[#221F1B]">${totalEfectivo.toLocaleString('es-AR')}</p>
            </div>
            <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
              <p className="text-xs text-[#8A8378] mb-1">Transferencia</p>
              <p className="text-lg font-semibold text-[#221F1B]">${totalTransferencia.toLocaleString('es-AR')}</p>
              {transferenciasPorCuenta.map(t => (
                <p key={t.nombre} className="text-sm text-[#8A8378] mt-1">{t.nombre}: ${t.total.toLocaleString('es-AR')}</p>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-[11px] uppercase tracking-widest text-[#8A8378]">Proyección</p>
          <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
            <p className="text-xs text-[#8A8378] mb-1">Proyectado</p>
            <p className="text-2xl font-semibold text-[#221F1B]">${proyectado.toLocaleString('es-AR')}</p>
          </div>
          <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
            <p className="text-xs text-[#8A8378] mb-1">Pendiente de cobrar</p>
            <p className="text-2xl font-semibold text-[#B5504A]">${pendienteCobrar.toLocaleString('es-AR')}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {['todos', 'pagado', 'pendiente', 'vencido', 'exento'].map(f => (
            <button key={f} onClick={() => setFiltro(f)} className={`px-4 py-1.5 rounded-full text-sm border ${filtro === f ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15 hover:border-[#5C6F5D]'}`}>
              {f === 'todos' ? `Todos (${alumnosDelMes.length})` : `${labelEstado[f]}s (${contadorFiltro[f] || 0})`}
            </button>
          ))}
        </div>
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar alumno…"
          className="border border-[#221F1B]/15 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#5C6F5D] bg-white w-full sm:w-56"
        />
      </div>

      {cargando ? (
        <p className="text-[#8A8378] text-sm">Cargando cobranza…</p>
      ) : (
        <div className="bg-[#FBF9F5] rounded-2xl border border-[#221F1B]/8 overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#221F1B]/10 bg-[#F3EEE4]">
                <th className="text-left px-4 py-3 text-sm font-semibold text-[#221F1B]">Alumno</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B]">Clases/sem</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B]">Proyectado</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B]">Pagado</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B]">Estado</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B]">Forma de pago</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B]">Cuenta</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {alumnosFiltrados.map(a => {
                const c = cobranzaDe(a.id)
                const estado = estadoDe(a)
                const puedeMensaje = estado === 'pendiente' || estado === 'vencido'
                return (
                  <tr key={a.id} className={`border-b border-[#221F1B]/8 last:border-0 hover:bg-[#F5F1E9] ${estado === 'vencido' ? 'bg-[#FBEAE8]' : ''}`}>
                    <td className="px-4 py-3 text-sm">
                      <button onClick={() => abrirDetalle(a)} className="text-[#221F1B] hover:text-[#5C6F5D] hover:underline text-left">
                        {a.nombre}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-[#221F1B]">{a.clasesReales}</td>
                    <td className="px-4 py-3 text-sm text-center text-[#221F1B]">
                      {a.exento_pago ? '—' : `$${cuotaEsperada(a).toLocaleString('es-AR')}`}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-[#221F1B]">
                      {c?.monto ? `$${Number(c.monto).toLocaleString('es-AR')}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {puedeMensaje ? (
                        <button onClick={() => abrirMensaje(a)} className={`text-xs px-2 py-1 rounded-full font-medium ${chipEstado[estado]} hover:opacity-80`}>
                          {labelEstado[estado]}
                        </button>
                      ) : (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${chipEstado[estado]}`}>
                          {labelEstado[estado]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-[#221F1B]">{c?.forma_pago || '—'}</td>
                    <td className="px-4 py-3 text-sm text-center text-[#221F1B]">{c?.cuentas?.nombre || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {!a.exento_pago && (
                        <button onClick={() => abrirPago(a)} className="text-xs text-[#5C6F5D] hover:underline">
                          {c ? 'Editar' : 'Registrar'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {alumnosFiltrados.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-[#8A8378]">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {viendo && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setViendo(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-1">{viendo.nombre}</p>
            <p className="text-xs text-[#8A8378] mb-4">{labelMes} · {viendo.clasesReales} clases/semana</p>
            <p className="text-xs font-medium text-[#8A8378] uppercase tracking-wide mb-2">Horarios en {labelMes}</p>
            <div className="flex flex-col gap-1.5 mb-5">
              {inscripcionesDetalle.length > 0 ? inscripcionesDetalle.map(i => (
                <div key={i.id} className="text-sm text-[#221F1B] bg-[#F5F1E9] rounded-lg px-3 py-2">
                  {i.horarios_clase?.dia} — {i.horarios_clase?.hora?.slice(0, 5)}
                </div>
              )) : (
                <p className="text-sm text-[#8A8378]">Sin horarios anotados este mes</p>
              )}
            </div>

            {inscripcionesDetalle.length > 0 && (
              <div className="flex items-center justify-between bg-[#F5F1E9] rounded-lg px-3 py-2.5 mb-5">
                <div>
                  <p className="text-sm text-[#221F1B]">No continúa en {labelMesSiguiente}</p>
                  <p className="text-[10px] text-[#8A8378]">Sigue contando normal en {labelMes} — solo evita que se lo copie al mes que viene</p>
                </div>
                <button
                  onClick={toggleNoContinua}
                  disabled={actualizandoNoContinua}
                  className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${yaMarcadoNoContinua ? 'bg-[#8A6B2C]' : 'bg-[#D8D2C4]'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${yaMarcadoNoContinua ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
            )}

            <div className="flex justify-between items-center">
              <button onClick={() => setConfirmarBaja(viendo)} className="text-xs text-[#B5504A] hover:underline">
                Dar de baja este mes
              </button>
              <button onClick={() => setViendo(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {confirmarBaja && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setConfirmarBaja(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-[#221F1B] mb-2">
              ¿Seguro que querés dar de baja a <span className="font-semibold">{confirmarBaja.nombre}</span> de todos sus horarios de {labelMes}?
            </p>
            <p className="text-xs text-[#8A8378] mb-6">
              Va a desaparecer de la grilla y de la cobranza de {labelMes}, como si no hubiera venido este mes. Si en cambio vino todo el mes y se va recién {labelMesSiguiente}, cerrá esto y usá "No continúa en {labelMesSiguiente}" en vez de esto.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmarBaja(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
              <button onClick={confirmarBajaAhora} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#B5504A] hover:bg-[#9C4340]">Dar de baja</button>
            </div>
          </div>
        </div>
      )}

      {pagoModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setPagoModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-1">{pagoModal.alumno.nombre}</p>
            <p className="text-xs text-[#8A8378] mb-4">{labelMes} · {pagoModal.alumno.clasesReales} clases/semana</p>

            <label className="block text-xs text-[#8A8378] mb-1">Proyección para este alumno este mes</label>
            <input type="number" value={montoEsperadoForm} onChange={e => setMontoEsperadoForm(e.target.value)} className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-[#5C6F5D]" />
            <p className="text-[11px] text-[#8A8378] mb-3">Ajustala si entró a mitad de mes, paga distinto, o cualquier caso especial — así el proyectado no miente.</p>

            <label className="block text-xs text-[#8A8378] mb-1">Monto pagado (dejalo vacío si todavía no pagó)</label>
            <input type="number" value={montoForm} onChange={e => setMontoForm(e.target.value)} className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#5C6F5D]" />

            <label className="block text-xs text-[#8A8378] mb-1">Forma de pago</label>
            <div className="flex gap-2 mb-3">
              {['Efectivo', 'Transferencia'].map(f => (
                <button key={f} onClick={() => setFormaForm(f)} className={`px-4 py-1.5 rounded-full text-sm border ${formaForm === f ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                  {f}
                </button>
              ))}
            </div>

            {formaForm === 'Transferencia' && (
              <>
                <label className="block text-xs text-[#8A8378] mb-1">Cuenta destino <span className="text-[#B5504A]">*</span></label>
                <div className="flex gap-2 mb-1 flex-wrap">
                  {cuentas.map(ct => (
                    <button key={ct.id} onClick={() => setCuentaForm(ct.id)} className={`px-4 py-1.5 rounded-full text-sm border ${cuentaForm === ct.id ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                      {ct.nombre}
                    </button>
                  ))}
                </div>
                {!cuentaForm && <p className="text-[11px] text-[#B5504A] mb-3">Obligatorio para transferencias</p>}
              </>
            )}

            <label className="block text-xs text-[#8A8378] mb-1 mt-3">Día de pago</label>
            <input type="date" value={diaPagoForm} onChange={e => setDiaPagoForm(e.target.value)} className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-5 outline-none focus:border-[#5C6F5D]" />

            <div className="flex gap-3 justify-between items-center">
              {pagoModal.existente ? (
                <button onClick={borrarPago} className="text-xs text-[#B5504A] hover:underline">Eliminar registro</button>
              ) : <span />}
              <div className="flex gap-3">
                <button onClick={() => setPagoModal(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
                <button onClick={guardarPago} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cuotasModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setCuotasModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-1">Valores de cuota vigentes</p>
            <p className="text-xs text-[#8A8378] mb-4">Al cambiar un valor, se guarda como nuevo vigente desde hoy — el historial de meses anteriores no se altera</p>
            <div className="flex flex-col gap-3 mb-5">
              {[1, 2, 3, 4].map(n => (
                <div key={n} className="flex items-center justify-between gap-3">
                  <label className="text-sm text-[#221F1B]">{n} {n === 1 ? 'clase' : 'clases'}/semana</label>
                  <input
                    type="number"
                    value={cuotasEdit[n] ?? ''}
                    onChange={e => setCuotasEdit({ ...cuotasEdit, [n]: e.target.value })}
                    className="w-28 border border-[#221F1B]/15 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#5C6F5D] text-right"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setCuotasModal(false)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
              <button onClick={guardarCuotas} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {mensajeModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 py-8" onClick={() => setMensajeModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-1">Mensaje para {mensajeModal.nombre}</p>
            <p className="text-xs text-[#8A8378] mb-4">{labelMes}</p>

            <label className="block text-xs text-[#8A8378] mb-1">Tipo de mensaje</label>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setTipoMensaje('recordatorio')} className={`px-4 py-1.5 rounded-full text-sm border ${tipoMensaje === 'recordatorio' ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                Recordatorio
              </button>
              <button onClick={() => setTipoMensaje('vencido')} className={`px-4 py-1.5 rounded-full text-sm border ${tipoMensaje === 'vencido' ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                Vencido
              </button>
            </div>

            <label className="block text-xs text-[#8A8378] mb-1">Cuenta a mostrar en el mensaje</label>
            <div className="flex gap-2 mb-4 flex-wrap">
              {cuentas.map(ct => (
                <button key={ct.id} onClick={() => setCuentaMensajeId(ct.id)} className={`px-4 py-1.5 rounded-full text-sm border ${cuentaMensajeId === ct.id ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                  {ct.nombre}
                </button>
              ))}
            </div>

            <div className="bg-[#F5F1E9] rounded-lg p-4 mb-4 whitespace-pre-line text-sm text-[#221F1B] max-h-64 overflow-y-auto">
              {textoMensaje()}
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setMensajeModal(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cerrar</button>
              <button onClick={copiarMensajeCobranza} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">
                {copiado ? '✓ Copiado' : 'Copiar mensaje'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}