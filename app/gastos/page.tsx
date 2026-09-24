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

function mesAnterior(mes) {
  const [y, m] = mes.split('-').map(Number)
  const fecha = new Date(y, m - 2, 1)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-01`
}

function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function esSueldo(g) { return (g.concepto || '').startsWith('Sueldo ') }

function horasDeConcepto(concepto) {
  const m = (concepto || '').match(/\(([\d.]+)hs\)/)
  return m ? m[1] : ''
}

export default function Gastos() {
  const router = useRouter()
  const [rol, setRolState] = useState(null)
  const [mes, setMes] = useState(mesActualISO())
  const [cargando, setCargando] = useState(true)
  const [gastos, setGastos] = useState([])
  const [gastosMesAnterior, setGastosMesAnterior] = useState([])
  const [profes, setProfes] = useState([])
  const [cuentas, setCuentas] = useState([])
  const [trayendo, setTrayendo] = useState(false)
  const [modal, setModal] = useState(null)
  const [modo, setModo] = useState('simple')
  const [fechaForm, setFechaForm] = useState(hoyISO())
  const [conceptoForm, setConceptoForm] = useState('')
  const [categoriaForm, setCategoriaForm] = useState('Variable')
  const [montoForm, setMontoForm] = useState('')
  const [montoPlaceholder, setMontoPlaceholder] = useState('')
  const [profeIdForm, setProfeIdForm] = useState('')
  const [horasForm, setHorasForm] = useState('')
  const [horasPlaceholder, setHorasPlaceholder] = useState('')
  const [tarifaForm, setTarifaForm] = useState('')
  const [formaPagoForm, setFormaPagoForm] = useState('Efectivo')
  const [cuentaIdForm, setCuentaIdForm] = useState(null)
  const [estadoForm, setEstadoForm] = useState('Pagado')
  const [nuevoProfeNombre, setNuevoProfeNombre] = useState('')
  const [mostrandoNuevoProfe, setMostrandoNuevoProfe] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(null)
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [ordenPor, setOrdenPor] = useState('fecha')
  const [ordenAsc, setOrdenAsc] = useState(false)

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

    const { data: g } = await supabase
      .from('gastos').select('*, cuentas(nombre)')
      .gte('fecha', mes).lt('fecha', finMesISO)
      .order('fecha', { ascending: false })
    setGastos(g || [])

    const mesPrevio = mesAnterior(mes)
    const [yp, mp] = mesPrevio.split('-').map(Number)
    const finMesPrevio = new Date(yp, mp, 1)
    const finMesPrevioISO = `${finMesPrevio.getFullYear()}-${String(finMesPrevio.getMonth() + 1).padStart(2, '0')}-01`
    const { data: gPrevio } = await supabase
      .from('gastos').select('*')
      .gte('fecha', mesPrevio).lt('fecha', finMesPrevioISO)
    setGastosMesAnterior(gPrevio || [])

    const { data: p } = await supabase.from('profes').select('*').order('nombre')
    setProfes(p || [])

    const { data: ct } = await supabase.from('cuentas').select('*').order('nombre')
    setCuentas(ct || [])

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
  const mesPrevio = mesAnterior(mes)
  const [anioPrevio, mesNumPrevio] = mesPrevio.split('-').map(Number)
  const labelMesPrevio = `${NOMBRES_MES[mesNumPrevio - 1]} ${anioPrevio}`

  const pagados = gastos.filter(g => g.estado === 'Pagado')
  const proyectados = gastos.filter(g => g.estado === 'Proyectado')

  const totalFijos = pagados.filter(g => g.categoria === 'Fijo').reduce((acc, g) => acc + Number(g.monto), 0)
  const totalSueldos = pagados.filter(g => esSueldo(g)).reduce((acc, g) => acc + Number(g.monto), 0)
  const totalVariablesResto = pagados.filter(g => g.categoria === 'Variable' && !esSueldo(g)).reduce((acc, g) => acc + Number(g.monto), 0)
  const totalGeneral = totalFijos + totalSueldos + totalVariablesResto
  const totalProyectado = proyectados.reduce((acc, g) => acc + Number(g.monto), 0)

  const totalEfectivo = pagados.filter(g => g.forma_pago === 'Efectivo').reduce((acc, g) => acc + Number(g.monto), 0)
  const totalesPorCuenta = cuentas.map(ct => ({
    nombre: ct.nombre,
    total: pagados.filter(g => g.forma_pago === 'Transferencia' && g.cuenta_id === ct.id).reduce((acc, g) => acc + Number(g.monto), 0)
  }))

  // ---- Fijos y sueldos del mes anterior que todavía no están cargados este mes ----
  const conceptosFijosEsteMes = new Set(gastos.filter(g => g.categoria === 'Fijo' && !esSueldo(g)).map(g => g.concepto))
  const sugeridosFijos = []
  const vistosFijos = new Set()
  gastosMesAnterior.filter(g => g.categoria === 'Fijo' && !esSueldo(g)).forEach(g => {
    if (vistosFijos.has(g.concepto) || conceptosFijosEsteMes.has(g.concepto)) return
    vistosFijos.add(g.concepto)
    sugeridosFijos.push({ concepto: g.concepto, monto: g.monto })
  })

  const profesEsteMes = new Set(gastos.filter(g => esSueldo(g)).map(g => g.pagado_por))
  const sugeridosSueldos = []
  const vistosProfes = new Set()
  gastosMesAnterior.filter(g => esSueldo(g)).forEach(g => {
    if (vistosProfes.has(g.pagado_por) || profesEsteMes.has(g.pagado_por)) return
    vistosProfes.add(g.pagado_por)
    sugeridosSueldos.push({ profeNombre: g.pagado_por, monto: g.monto, horas: horasDeConcepto(g.concepto) })
  })

  const hayaSugeridos = sugeridosFijos.length > 0 || sugeridosSueldos.length > 0

  async function traerFijosYSueldos() {
    if (trayendo || !hayaSugeridos) return
    setTrayendo(true)
    const inserts = []
    sugeridosFijos.forEach(s => {
      inserts.push({
        fecha: hoyISO(),
        concepto: s.concepto,
        categoria: 'Fijo',
        monto: null,
        monto_sugerido: s.monto,
        horas_sugeridas: null,
        forma_pago: null,
        cuenta_id: null,
        pagado_por: null,
        estado: 'Proyectado'
      })
    })
    sugeridosSueldos.forEach(s => {
      inserts.push({
        fecha: hoyISO(),
        concepto: `Sueldo ${s.profeNombre}`,
        categoria: 'Variable',
        monto: null,
        monto_sugerido: s.monto,
        horas_sugeridas: s.horas ? parseFloat(s.horas) : null,
        forma_pago: null,
        cuenta_id: null,
        pagado_por: s.profeNombre,
        estado: 'Proyectado'
      })
    })
    await supabase.from('gastos').insert(inserts)
    setTrayendo(false)
    cargar()
  }

  const gastosFiltrados = gastos.filter(g => {
    if (filtroEstado === 'todos') return true
    return g.estado === filtroEstado
  })

  function compararGastos(a, b) {
    let va, vb
    if (ordenPor === 'fecha') { va = a.fecha; vb = b.fecha }
    else if (ordenPor === 'concepto') { va = a.concepto.toLowerCase(); vb = b.concepto.toLowerCase() }
    else if (ordenPor === 'categoria') { va = esSueldo(a) ? 'Sueldo' : a.categoria; vb = esSueldo(b) ? 'Sueldo' : b.categoria }
    else if (ordenPor === 'estado') { va = a.estado; vb = b.estado }
    else if (ordenPor === 'monto') { va = Number(a.monto) || 0; vb = Number(b.monto) || 0 }
    else { va = a.fecha; vb = b.fecha }
    if (va < vb) return ordenAsc ? -1 : 1
    if (va > vb) return ordenAsc ? 1 : -1
    return 0
  }
  const gastosOrdenados = [...gastosFiltrados].sort(compararGastos)

  function toggleOrden(campo) {
    if (ordenPor === campo) setOrdenAsc(!ordenAsc)
    else { setOrdenPor(campo); setOrdenAsc(campo === 'fecha' ? false : true) }
  }
  function flechaOrden(campo) {
    if (ordenPor !== campo) return ''
    return ordenAsc ? ' ▲' : ' ▼'
  }

  function abrirNuevo() {
    setModal({})
    setModo('simple')
    setFechaForm(hoyISO())
    setConceptoForm('')
    setCategoriaForm('Variable')
    setMontoForm('')
    setMontoPlaceholder('')
    setProfeIdForm(profes[0]?.id || '')
    setHorasForm('')
    setHorasPlaceholder('')
    setTarifaForm(profes[0]?.tarifa_hora ? String(profes[0].tarifa_hora) : '')
    setFormaPagoForm('Efectivo')
    setCuentaIdForm(null)
    setEstadoForm('Pagado')
    setMostrandoNuevoProfe(false)
  }

  function abrirEditar(g) {
    setModal({ editando: g })
    const sueldo = esSueldo(g)
    setModo(sueldo ? 'sueldo' : 'simple')
    setFechaForm(g.fecha)
    setConceptoForm(g.concepto)
    setCategoriaForm(g.categoria)
    setMontoForm(g.monto !== null && g.monto !== undefined ? String(g.monto) : '')
    setMontoPlaceholder(g.monto_sugerido ? `Ej: $${Number(g.monto_sugerido).toLocaleString('es-AR')}` : '')
    setFormaPagoForm(g.forma_pago || 'Efectivo')
    setCuentaIdForm(g.cuenta_id || null)
    setEstadoForm(g.estado || 'Pagado')
    setMostrandoNuevoProfe(false)
    if (sueldo) {
      const profe = profes.find(p => p.nombre === g.pagado_por)
      setProfeIdForm(profe?.id || profes[0]?.id || '')
      setTarifaForm(profe ? String(profe.tarifa_hora) : (profes[0]?.tarifa_hora ? String(profes[0].tarifa_hora) : ''))
      setHorasForm('')
      setHorasPlaceholder(g.horas_sugeridas ? String(g.horas_sugeridas) : horasDeConcepto(g.concepto))
    }
  }

  function elegirProfe(id) {
    setProfeIdForm(id)
    const p = profes.find(x => x.id === id)
    if (p) setTarifaForm(String(p.tarifa_hora))
  }

  async function crearProfe() {
    const nombre = nuevoProfeNombre.trim()
    if (!nombre) return
    const { data: nuevo, error } = await supabase.from('profes').insert({ nombre, tarifa_hora: 12000 }).select().single()
    if (error) { alert('No se pudo crear el profe: ' + error.message); return }
    setProfes([...profes, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    setProfeIdForm(nuevo.id)
    setTarifaForm(String(nuevo.tarifa_hora))
    setNuevoProfeNombre('')
    setMostrandoNuevoProfe(false)
  }

  const montoCalculadoSueldo = (parseFloat(horasForm) || 0) * (parseFloat(tarifaForm) || 0)

  async function guardarGasto() {
    let payload
    if (modo === 'sueldo') {
      const profe = profes.find(p => p.id === profeIdForm)
      if (!profe || !horasForm) { alert('Completá el profe y las horas'); return }
      payload = {
        fecha: fechaForm,
        concepto: `Sueldo ${profe.nombre} (${horasForm}hs)`,
        categoria: 'Variable',
        monto: montoCalculadoSueldo,
        monto_sugerido: null,
        horas_sugeridas: null,
        forma_pago: estadoForm === 'Pagado' ? formaPagoForm : null,
        cuenta_id: estadoForm === 'Pagado' && formaPagoForm === 'Transferencia' ? cuentaIdForm : null,
        pagado_por: profe.nombre,
        estado: estadoForm
      }
    } else {
      if (!conceptoForm.trim() || !montoForm) { alert('Completá concepto y monto'); return }
      payload = {
        fecha: fechaForm,
        concepto: conceptoForm.trim(),
        categoria: categoriaForm,
        monto: parseFloat(montoForm) || 0,
        monto_sugerido: null,
        horas_sugeridas: null,
        forma_pago: estadoForm === 'Pagado' ? formaPagoForm : null,
        cuenta_id: estadoForm === 'Pagado' && formaPagoForm === 'Transferencia' ? cuentaIdForm : null,
        pagado_por: null,
        estado: estadoForm
      }
    }

    if (modal.editando) {
      await supabase.from('gastos').update(payload).eq('id', modal.editando.id)
    } else {
      await supabase.from('gastos').insert(payload)
    }
    setModal(null)
    cargar()
  }

  function marcarComoPagado(g) {
    abrirEditar(g)
    setEstadoForm('Pagado')
  }

  async function confirmarBorrarGasto() {
    if (!confirmarBorrar) return
    await supabase.from('gastos').delete().eq('id', confirmarBorrar.id)
    setConfirmarBorrar(null)
    cargar()
  }

  function salir() {
    cerrarSesion()
    router.push('/login')
  }

  const hayDatos = gastos.length > 0

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
          <a href="/gastos" className="text-sm font-medium text-[#5C6F5D] border-b-2 border-[#5C6F5D] pb-0.5">Gastos</a>
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
        <button onClick={abrirNuevo} className="text-sm px-4 py-2 rounded-full bg-[#5C6F5D] text-white hover:bg-[#4C5C4D]">
          + Registrar gasto
        </button>
      </div>

      <p className="text-xs text-[#8A8378] uppercase tracking-widest mb-6">Gastos</p>

      {!cargando && hayaSugeridos && (
        <div className="mb-6">
          <button onClick={traerFijosYSueldos} disabled={trayendo} className="text-sm px-4 py-2 rounded-full bg-[#8A6B2C] text-white hover:bg-[#755A24] disabled:opacity-60">
            {trayendo ? 'Trayendo…' : `Traer fijos y sueldos de ${labelMesPrevio} (${sugeridosFijos.length + sugeridosSueldos.length})`}
          </button>
        </div>
      )}

      {cargando ? (
        <p className="text-[#8A8378] text-sm">Cargando gastos…</p>
      ) : !hayDatos ? (
        <p className="text-sm text-[#8A8378] mb-6">Todavía no hay gastos cargados en {labelMes}.</p>
      ) : (
        <div className="mb-6">
          <div className="grid grid-cols-2 gap-3 mb-3 max-w-md">
            <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
              <p className="text-xs text-[#8A8378] mb-1">Total gastado</p>
              <p className="text-2xl font-semibold text-[#B5504A]">${totalGeneral.toLocaleString('es-AR')}</p>
            </div>
            <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-4 py-3">
              <p className="text-xs text-[#8A8378] mb-1">Aún no pagado</p>
              <p className="text-2xl font-semibold text-[#8A6B2C]">${totalProyectado.toLocaleString('es-AR')}</p>
            </div>
          </div>
          <p className="text-xs text-[#8A8378]">
            Fijos ${totalFijos.toLocaleString('es-AR')} · Sueldos ${totalSueldos.toLocaleString('es-AR')} · Variables ${totalVariablesResto.toLocaleString('es-AR')}
          </p>
          <p className="text-xs text-[#8A8378]">
            Efectivo ${totalEfectivo.toLocaleString('es-AR')}
            {totalesPorCuenta.map(t => ` · ${t.nombre} $${t.total.toLocaleString('es-AR')}`)}
          </p>
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {['todos', 'Pagado', 'Proyectado'].map(f => (
          <button key={f} onClick={() => setFiltroEstado(f)} className={`px-4 py-1.5 rounded-full text-sm border ${filtroEstado === f ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15 hover:border-[#5C6F5D]'}`}>
            {f === 'todos' ? 'Todos' : f === 'Pagado' ? `Pagados (${pagados.length})` : `Proyectados (${proyectados.length})`}
          </button>
        ))}
      </div>

      {cargando ? null : (
        <div className="bg-[#FBF9F5] rounded-2xl border border-[#221F1B]/8 overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#221F1B]/10 bg-[#F3EEE4]">
                <th onClick={() => toggleOrden('fecha')} className="text-left px-4 py-3 text-sm font-semibold text-[#221F1B] cursor-pointer select-none hover:text-[#5C6F5D]">Fecha{flechaOrden('fecha')}</th>
                <th onClick={() => toggleOrden('concepto')} className="text-left px-4 py-3 text-sm font-semibold text-[#221F1B] cursor-pointer select-none hover:text-[#5C6F5D]">Concepto{flechaOrden('concepto')}</th>
                <th onClick={() => toggleOrden('categoria')} className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B] cursor-pointer select-none hover:text-[#5C6F5D]">Categoría{flechaOrden('categoria')}</th>
                <th onClick={() => toggleOrden('estado')} className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B] cursor-pointer select-none hover:text-[#5C6F5D]">Estado{flechaOrden('estado')}</th>
                <th onClick={() => toggleOrden('monto')} className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B] cursor-pointer select-none hover:text-[#5C6F5D]">Monto{flechaOrden('monto')}</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B]">Salió de</th>
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody>
              {gastosOrdenados.map(g => {
                const sinMonto = g.monto === null || g.monto === undefined
                return (
                  <tr key={g.id} className={`border-b border-[#221F1B]/8 last:border-0 hover:bg-[#F5F1E9] ${g.estado === 'Proyectado' ? 'bg-[#FBF4E4]' : ''}`}>
                    <td className="px-4 py-3 text-sm text-[#221F1B]">{g.fecha}</td>
                    <td className="px-4 py-3 text-sm text-[#221F1B]">{g.concepto}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full ${esSueldo(g) ? 'bg-[#8A6B2C] text-white' : g.categoria === 'Fijo' ? 'bg-[#5C6F5D] text-white' : 'bg-[#EDE7DD] text-[#8A8378]'}`}>
                        {esSueldo(g) ? 'Sueldo' : g.categoria}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${g.estado === 'Pagado' ? 'bg-[#5C6F5D] text-white' : 'border border-[#8A6B2C] text-[#8A6B2C]'}`}>
                        {g.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {sinMonto ? (
                        <button onClick={() => abrirEditar(g)} className="text-[#B7B9B1] italic hover:text-[#8A6B2C]">
                          {g.monto_sugerido ? `$${Number(g.monto_sugerido).toLocaleString('es-AR')}` : 'Sin monto'}
                        </button>
                      ) : (
                        <span className="text-[#221F1B]">${Number(g.monto).toLocaleString('es-AR')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-[#221F1B]">
                      {g.estado === 'Proyectado' ? '—' : g.forma_pago === 'Transferencia' ? g.cuentas?.nombre || 'Transferencia' : (g.forma_pago || '—')}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {g.estado === 'Proyectado' && !sinMonto && (
                        <button onClick={() => marcarComoPagado(g)} className="text-xs text-[#5C6F5D] hover:underline mr-3">Marcar pagado</button>
                      )}
                      <button onClick={() => abrirEditar(g)} className="text-xs text-[#5C6F5D] hover:underline mr-3">{sinMonto ? 'Completar' : 'Editar'}</button>
                      <button onClick={() => setConfirmarBorrar(g)} className="text-xs text-[#B5504A] hover:underline">Borrar</button>
                    </td>
                  </tr>
                )
              })}
              {gastosOrdenados.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-[#8A8378]">Sin gastos cargados este mes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 py-8" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-4">{modal.editando ? 'Editar gasto' : 'Registrar gasto'}</p>

            {!modal.editando && (
              <div className="flex gap-2 mb-4">
                <button onClick={() => setModo('simple')} className={`px-4 py-1.5 rounded-full text-sm border ${modo === 'simple' ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                  Gasto simple
                </button>
                <button onClick={() => setModo('sueldo')} className={`px-4 py-1.5 rounded-full text-sm border ${modo === 'sueldo' ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                  Sueldo de profe
                </button>
              </div>
            )}

            <label className="block text-xs text-[#8A8378] mb-1">Estado</label>
            <div className="flex gap-2 mb-1">
              {['Proyectado', 'Pagado'].map(e => (
                <button key={e} onClick={() => setEstadoForm(e)} className={`px-4 py-1.5 rounded-full text-sm border ${estadoForm === e ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                  {e}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[#8A8378] mb-3">
              &quot;Proyectado&quot; = sabés que lo vas a pagar (ej. el alquiler antes de transferirlo) — no suma en la plata que ya salió, sí en la proyección del mes.
            </p>

            <label className="block text-xs text-[#8A8378] mb-1">Fecha</label>
            <input type="date" value={fechaForm} onChange={e => setFechaForm(e.target.value)} className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#5C6F5D]" />

            {modo === 'simple' ? (
              <>
                <label className="block text-xs text-[#8A8378] mb-1">Concepto</label>
                <input value={conceptoForm} onChange={e => setConceptoForm(e.target.value)} placeholder="Ej: Alquiler, Luz, Insumos…" className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#5C6F5D]" />

                <label className="block text-xs text-[#8A8378] mb-1">Categoría</label>
                <div className="flex gap-2 mb-3">
                  {['Fijo', 'Variable'].map(c => (
                    <button key={c} onClick={() => setCategoriaForm(c)} className={`px-4 py-1.5 rounded-full text-sm border ${categoriaForm === c ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                      {c}
                    </button>
                  ))}
                </div>

                <label className="block text-xs text-[#8A8378] mb-1">Monto</label>
                <input type="number" value={montoForm} onChange={e => setMontoForm(e.target.value)} placeholder={montoPlaceholder || undefined} className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-[#5C6F5D]" />
                {montoPlaceholder && !montoForm && (
                  <p className="text-[11px] text-[#8A8378] mb-3">Ese es el monto de {labelMesPrevio} como referencia — escribí el de este mes</p>
                )}
              </>
            ) : (
              <>
                <label className="block text-xs text-[#8A8378] mb-1">Profe</label>
                {!mostrandoNuevoProfe ? (
                  <div className="flex gap-2 mb-3 flex-wrap items-center">
                    {profes.map(p => (
                      <button key={p.id} onClick={() => elegirProfe(p.id)} className={`px-3 py-1.5 rounded-full text-sm border ${profeIdForm === p.id ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                        {p.nombre}
                      </button>
                    ))}
                    <button onClick={() => setMostrandoNuevoProfe(true)} className="text-xs text-[#5C6F5D] hover:underline px-2">+ nuevo profe</button>
                  </div>
                ) : (
                  <div className="flex gap-2 mb-3">
                    <input autoFocus value={nuevoProfeNombre} onChange={e => setNuevoProfeNombre(e.target.value)} placeholder="Nombre del profe" className="flex-1 border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C6F5D]" />
                    <button onClick={crearProfe} className="px-3 py-2 rounded-lg text-sm bg-[#5C6F5D] text-white">Crear</button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mb-1">
                  <div>
                    <label className="block text-xs text-[#8A8378] mb-1">Horas del mes</label>
                    <input type="number" value={horasForm} onChange={e => setHorasForm(e.target.value)} placeholder={horasPlaceholder || undefined} className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C6F5D]" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8A8378] mb-1">$ / hora</label>
                    <input type="number" value={tarifaForm} onChange={e => setTarifaForm(e.target.value)} className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#5C6F5D]" />
                  </div>
                </div>
                {horasPlaceholder && !horasForm && (
                  <p className="text-[11px] text-[#8A8378] mb-2">{labelMesPrevio}: {horasPlaceholder}hs — escribí las de este mes</p>
                )}
                <p className="text-sm text-[#221F1B] mb-3">
                  Total a pagar: <span className="font-semibold">${montoCalculadoSueldo.toLocaleString('es-AR')}</span>
                </p>
              </>
            )}

            {estadoForm === 'Pagado' && (
              <>
                <label className="block text-xs text-[#8A8378] mb-1">Forma de pago</label>
                <div className="flex gap-2 mb-3">
                  {['Efectivo', 'Transferencia'].map(f => (
                    <button key={f} onClick={() => setFormaPagoForm(f)} className={`px-4 py-1.5 rounded-full text-sm border ${formaPagoForm === f ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                      {f}
                    </button>
                  ))}
                </div>

                {formaPagoForm === 'Transferencia' && (
                  <>
                    <label className="block text-xs text-[#8A8378] mb-1">Cuenta de origen</label>
                    <div className="flex gap-2 mb-4 flex-wrap">
                      {cuentas.map(ct => (
                        <button key={ct.id} onClick={() => setCuentaIdForm(ct.id)} className={`px-4 py-1.5 rounded-full text-sm border ${cuentaIdForm === ct.id ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                          {ct.nombre}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            <div className="flex gap-3 justify-end mt-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
              <button onClick={guardarGasto} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {confirmarBorrar && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setConfirmarBorrar(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-[#221F1B] mb-6">
              ¿Seguro que querés borrar <span className="font-semibold">{confirmarBorrar.concepto}</span>?
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmarBorrar(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
              <button onClick={confirmarBorrarGasto} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#B5504A] hover:bg-[#9C4340]">Borrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}