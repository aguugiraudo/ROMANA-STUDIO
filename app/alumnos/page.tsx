'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { getRol, ROLES } from '../lib/auth'
import Menu from '../components/Menu'

const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']

const SOSPECHOSOS = [
  ['DARIO K', 'DARIO KARCHESKY'],
  ['JOSEFINA BAGNERA15%', 'JOSEFINA BAGNERA'],
  ['ANITA RIVERO15%', 'ANITA RIVERO'],
  ['AGOSTINA TAPIA', 'AGOSTINA TAPIA JUNIO'],
  ['SIRLEY WAGNER', 'SIRLEY WEGNER'],
  ['SOLANA', 'SOLANA BURKET'],
]

const GENEROS = ['Femenino', 'Masculino', 'Prefiere no decir']
const CANALES = ['Instagram', 'Referido', 'Pasó por el local', 'Google', 'Otro']

// Lista de motivos de baja. Cuando tengan armada la encuesta se puede cambiar esta lista.
const MOTIVOS_BAJA = [
  'Precio',
  'Horarios',
  'Falta de tiempo',
  'No veía resultados',
  'Experiencia en las clases',
  'Motivos personales',
  'Distancia',
  'Se fue sin avisar',
  'Otro'
]

const BUCKETS = ['Estuvo 1 mes', '2 a 3 meses', '4 a 6 meses', '7 meses o más']
const TABS = [['listado', 'Listado'], ['bajas', 'Bajas'], ['retencion', 'Retención'], ['perfil', 'Perfil']]
const RANGOS = [['1', 'Último mes'], ['3', '3 meses'], ['6', '6 meses'], ['todo', 'Todo el historial'], ['custom', 'Elegir meses']]

function mesActualISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function desplazarMes(mes, delta) {
  const [y, m] = mes.split('-').map(Number)
  const f = new Date(y, m - 1 + delta, 1)
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-01`
}

function mesAnterior(mes) { return desplazarMes(mes, -1) }

function labelDeMes(mes) {
  const [y, m] = mes.split('-').map(Number)
  return `${NOMBRES_MES[m - 1]} ${y}`
}

function formatHora(h) { return String(h || '').slice(0, 5) }

function bucketAntig(n) {
  if (n <= 1) return BUCKETS[0]
  if (n <= 3) return BUCKETS[1]
  if (n <= 6) return BUCKETS[2]
  return BUCKETS[3]
}

async function fetchTodasInscripciones() {
  let todas = []
  let desde = 0
  const tam = 1000
  while (true) {
    const { data, error } = await supabase
      .from('inscripciones')
      .select('id, alumno_id, horario_clase_id, mes')
      .eq('estado', 'activo')
      .order('id')
      .range(desde, desde + tam - 1)
    if (error || !data || data.length === 0) break
    todas = todas.concat(data)
    if (data.length < tam) break
    desde += tam
  }
  return todas
}

function activosDe(modelo, mes) {
  return modelo.porMes[mes] ? Object.keys(modelo.porMes[mes]) : []
}

function calcTransicion(modelo, mes) {
  const prev = mesAnterior(mes)
  if (!modelo.porMes[prev] || !modelo.porMes[mes]) return null
  const activosPrev = Object.keys(modelo.porMes[prev])
  const ahora = modelo.porMes[mes]
  const bajas = activosPrev.filter(id => !ahora[id])
  const nuevos = Object.keys(ahora).filter(id => !modelo.porMes[prev][id])
  return { prev, mes, activosPrev, bajas, nuevos }
}

function calcRacha(modelo, id, prevMes) {
  let n = 0
  let m = prevMes
  while (modelo.porMes[m] && modelo.porMes[m][id]) {
    n++
    m = mesAnterior(m)
  }
  const censurado = n > 0 && !!modelo.primerMes && m < modelo.primerMes
  return { meses: n, censurado }
}

function BarrasH({ items, formato }) {
  const max = Math.max(1, ...items.map(i => i.valor))
  return (
    <div className="flex flex-col gap-2.5">
      {items.map(i => (
        <div key={i.label}>
          <div className="flex items-center justify-between text-xs mb-1 gap-3">
            <span className="text-[#221F1B]">{i.label}</span>
            <span className="text-[#8A8378] text-right">{formato ? formato(i) : i.valor}{i.extra ? ` · ${i.extra}` : ''}</span>
          </div>
          <div className="h-2 rounded-full bg-[#EDE7DD] overflow-hidden">
            <div className="h-full bg-[#5C6F5D]" style={{ width: `${(i.valor / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function BarrasV({ items, alto = 130 }) {
  const max = Math.max(1, ...items.map(i => i.valor || 0))
  return (
    <div className="flex items-end gap-2">
      {items.map((i, idx) => {
        const h = i.valor > 0 ? Math.max(4, (i.valor / max) * alto) : 2
        return (
          <div key={idx} className="flex-1 flex flex-col items-center justify-end" title={i.titulo || ''}>
            <span className="text-[10px] text-[#8A8378] mb-1">{i.valor > 0 ? i.texto : ''}</span>
            <div className="w-full rounded-t-md bg-[#5C6F5D]" style={{ height: `${h}px` }} />
            <span className="text-[10px] text-[#8A8378] mt-1 text-center">{i.label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function Alumnos() {
  const router = useRouter()
  const [rol, setRolState] = useState(null)
  const [tab, setTab] = useState('listado')
  const [mesStats, setMesStats] = useState(mesActualISO())
  const [rango, setRango] = useState('3')
  const [desdeCustom, setDesdeCustom] = useState('')
  const [hastaCustom, setHastaCustom] = useState('')
  const [vistaBajas, setVistaBajas] = useState('mes')
  const [soloSinMotivo, setSoloSinMotivo] = useState(false)
  const [anioResumen, setAnioResumen] = useState(new Date().getFullYear())
  const [alumnos, setAlumnos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [inscTodas, setInscTodas] = useState([])
  const [horariosMap, setHorariosMap] = useState({})
  const [profes, setProfes] = useState([])
  const [motivos, setMotivos] = useState({})
  const [cargandoRet, setCargandoRet] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('activo')
  const [editando, setEditando] = useState(null)
  const [viendo, setViendo] = useState(null)
  const [nuevosModalAbierto, setNuevosModalAbierto] = useState(false)
  const [fusionAbierta, setFusionAbierta] = useState(false)
  const [buscA, setBuscA] = useState('')
  const [buscB, setBuscB] = useState('')
  const [seleccionA, setSeleccionA] = useState(null)
  const [seleccionB, setSeleccionB] = useState(null)
  const [conteos, setConteos] = useState(null)
  const [survivor, setSurvivor] = useState(null)
  const [sospechososVigentes, setSospechososVigentes] = useState([])

  useEffect(() => {
    const r = getRol()
    if (!r) { router.push('/login'); return }
    if (r !== ROLES.ADMIN) { router.push('/'); return }
    setRolState(r)
  }, [router])

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data } = await supabase.from('alumnos').select('*').order('nombre')
    setAlumnos(data || [])
    setCargando(false)

    const vigentes = []
    for (const [n1, n2] of SOSPECHOSOS) {
      const existeA = data?.some(a => a.nombre === n1)
      const existeB = data?.some(a => a.nombre === n2)
      if (existeA && existeB) vigentes.push([n1, n2])
    }
    setSospechososVigentes(vigentes)
  }, [])

  const cargarRetencion = useCallback(async () => {
    setCargandoRet(true)
    const [insc, hs, ps, ms] = await Promise.all([
      fetchTodasInscripciones(),
      supabase.from('horarios_clase').select('*'),
      supabase.from('profes').select('*').order('nombre'),
      supabase.from('motivos_baja').select('*')
    ])
    setInscTodas(insc)
    const hm = {}
    ;(hs.data || []).forEach(h => { hm[String(h.id)] = h })
    setHorariosMap(hm)
    setProfes(ps.data || [])
    const mm = {}
    ;(ms.data || []).forEach(r => { mm[`${r.alumno_id}|${r.mes}`] = { motivo: r.motivo, nota: r.nota || '' } })
    setMotivos(mm)
    setCargandoRet(false)
  }, [])

  useEffect(() => { if (rol) { cargar(); cargarRetencion() } }, [cargar, cargarRetencion, rol])

  const modelo = useMemo(() => {
    const porMes = {}
    inscTodas.forEach(r => {
      if (!porMes[r.mes]) porMes[r.mes] = {}
      if (!porMes[r.mes][r.alumno_id]) porMes[r.mes][r.alumno_id] = []
      porMes[r.mes][r.alumno_id].push(r.horario_clase_id)
    })
    const meses = Object.keys(porMes).sort()
    const primerMes = meses[0] || null
    const primerMesDe = {}
    meses.forEach(m => {
      Object.keys(porMes[m]).forEach(id => { if (!(id in primerMesDe)) primerMesDe[id] = m })
    })
    return { porMes, meses, primerMes, primerMesDe }
  }, [inscTodas])

  const alumnoPorId = useMemo(() => {
    const m = {}
    alumnos.forEach(a => { m[String(a.id)] = a })
    return m
  }, [alumnos])

  const mesHoy = mesActualISO()
  const idsActivosHoy = useMemo(() => new Set(activosDe(modelo, mesHoy)), [modelo, mesHoy])

  const clasesPorAlumno = useMemo(() => {
    const r = {}
    const datos = modelo.porMes[mesStats] || {}
    Object.keys(datos).forEach(id => { r[id] = datos[id].length })
    return r
  }, [modelo, mesStats])
  const anotadosEnMes = Object.keys(clasesPorAlumno).length

  const transicionMes = useMemo(() => calcTransicion(modelo, mesStats), [modelo, mesStats])

  function nombreProfeDe(h) {
    if (!h || !h.profe_id) return ''
    const p = profes.find(x => String(x.id) === String(h.profe_id))
    return p ? p.nombre : ''
  }

  function horariosDe(ids) {
    return (ids || [])
      .map(hid => horariosMap[String(hid)])
      .filter(Boolean)
      .sort((a, b) => (DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia)) || String(a.hora).localeCompare(String(b.hora)))
  }

  // Meses que entran en el análisis de Retención, según el rango elegido
  const mesesRango = useMemo(() => {
    let inicio
    let fin
    if (rango === 'custom') {
      inicio = desdeCustom ? `${desdeCustom}-01` : (modelo.primerMes || mesStats)
      fin = hastaCustom ? `${hastaCustom}-01` : mesStats
    } else if (rango === 'todo') {
      inicio = modelo.primerMes || mesStats
      fin = mesStats
    } else {
      inicio = desplazarMes(mesStats, -(Number(rango) - 1))
      fin = mesStats
    }
    if (inicio > fin) { const t = inicio; inicio = fin; fin = t }
    const out = []
    let m = inicio
    let guardia = 0
    while (m <= fin && guardia < 240) {
      out.push(m)
      m = desplazarMes(m, 1)
      guardia++
    }
    return out
  }, [rango, desdeCustom, hastaCustom, mesStats, modelo.primerMes])

  const retencion = useMemo(() => {
    const meses = mesesRango
    let sumBajas = 0
    let sumBase = 0
    let sumNuevosReales = 0
    let sumReingresos = 0
    let mesesConDatos = 0
    const antig = {}
    BUCKETS.forEach(b => { antig[b] = 0 })
    let censuradas = 0
    const motivosCnt = {}
    let bajasTotal = 0
    let bajasConMotivo = 0
    const porProfe = {}
    const asegurar = k => {
      if (!porProfe[k]) porProfe[k] = { base: 0, bajas: 0 }
      return porProfe[k]
    }

    meses.forEach(k => {
      const t = calcTransicion(modelo, k)
      if (!t) return
      mesesConDatos++
      sumBajas += t.bajas.length
      sumBase += t.activosPrev.length
      t.nuevos.forEach(id => {
        if (modelo.primerMesDe[id] === k) sumNuevosReales++
        else sumReingresos++
      })

      const profesDe = {}
      t.activosPrev.forEach(id => {
        const set = new Set()
        ;(modelo.porMes[t.prev][id] || []).forEach(hid => {
          const h = horariosMap[String(hid)]
          set.add(h && h.profe_id ? String(h.profe_id) : 'sin')
        })
        profesDe[id] = set
        set.forEach(pk => { asegurar(pk).base++ })
      })

      t.bajas.forEach(id => {
        profesDe[id].forEach(pk => { asegurar(pk).bajas++ })
        const r = calcRacha(modelo, id, t.prev)
        antig[bucketAntig(r.meses)]++
        if (r.censurado) censuradas++
        bajasTotal++
        const mo = motivos[`${id}|${k}`]
        const etiqueta = mo ? mo.motivo : 'Sin motivo cargado'
        motivosCnt[etiqueta] = (motivosCnt[etiqueta] || 0) + 1
        if (mo) bajasConMotivo++
      })
    })

    return {
      meses, mesesConDatos, sumBajas, sumBase,
      churn: sumBase > 0 ? (sumBajas / sumBase) * 100 : null,
      sumNuevosReales, sumReingresos, antig, censuradas,
      motivosCnt, bajasTotal, bajasConMotivo, porProfe
    }
  }, [modelo, horariosMap, motivos, mesesRango])

  const profeItems = useMemo(() => {
    const m = Math.max(1, retencion.mesesConDatos)
    return Object.keys(retencion.porProfe).map(k => {
      const d = retencion.porProfe[k]
      const nombre = k === 'sin'
        ? 'Sin profe asignado'
        : (profes.find(p => String(p.id) === k)?.nombre || 'Profe desconocido')
      const extra = retencion.mesesConDatos === 1
        ? `de ${d.base} alumnos`
        : `${(d.bajas / m).toFixed(1)} por mes, sobre ~${Math.round(d.base / m)} alumnos`
      return { key: k, label: nombre, bajas: d.bajas, base: d.base, pct: d.base > 0 ? (d.bajas / d.base) * 100 : 0, extra }
    })
  }, [retencion, profes])

  const profesPorCantidad = useMemo(
    () => [...profeItems].sort((a, b) => b.bajas - a.bajas).map(p => ({ label: p.label, valor: p.bajas, extra: p.extra })),
    [profeItems]
  )
  const profesPorPct = useMemo(
    () => [...profeItems].sort((a, b) => b.pct - a.pct).map(p => ({
      label: p.label,
      valor: p.pct,
      extra: `${p.bajas} bajas${retencion.mesesConDatos === 1 ? '' : ' en total'}, ${p.extra}`
    })),
    [profeItems, retencion.mesesConDatos]
  )

  // Horarios que se usaron en algún mes y todavía no tienen profe asignado
  const horariosUsadosSinProfe = useMemo(() => {
    const ids = new Set()
    inscTodas.forEach(r => {
      const h = horariosMap[String(r.horario_clase_id)]
      if (!h || !h.profe_id) ids.add(String(r.horario_clase_id))
    })
    return ids.size
  }, [inscTodas, horariosMap])

  const serieAnual = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const mes = `${anioResumen}-${String(i + 1).padStart(2, '0')}-01`
      const activos = activosDe(modelo, mes).length
      const t = calcTransicion(modelo, mes)
      const churn = t && t.activosPrev.length > 0 ? (t.bajas.length / t.activosPrev.length) * 100 : null
      return { activos, churn, bajas: t ? t.bajas.length : null, base: t ? t.activosPrev.length : null }
    })
  }, [modelo, anioResumen])

  // Lista de bajas: un solo mes o todo el historial
  const bajasTodas = useMemo(() => {
    const salida = []
    const lista = vistaBajas === 'mes' ? [mesStats] : [...modelo.meses].reverse()
    lista.forEach(mesBaja => {
      const t = calcTransicion(modelo, mesBaja)
      if (!t) return
      t.bajas.forEach(id => {
        const a = alumnoPorId[String(id)]
        const idsHorarios = modelo.porMes[t.prev][id] || []
        salida.push({
          id,
          mesBaja,
          nombre: a ? a.nombre : '(alumno eliminado)',
          horarios: horariosDe(idsHorarios),
          clases: idsHorarios.length,
          racha: calcRacha(modelo, id, t.prev)
        })
      })
    })
    salida.sort((x, y) => y.mesBaja.localeCompare(x.mesBaja) || x.nombre.localeCompare(y.nombre))
    return salida
  }, [vistaBajas, mesStats, modelo, alumnoPorId, horariosMap])

  const hayDatosBajas = vistaBajas === 'mes' ? !!transicionMes : modelo.meses.length > 1
  const bajasConMotivoCount = bajasTodas.filter(b => motivos[`${b.id}|${b.mesBaja}`]).length
  const listaBajas = soloSinMotivo ? bajasTodas.filter(b => !motivos[`${b.id}|${b.mesBaja}`]) : bajasTodas

  async function guardarMotivo(alumnoId, mes, motivo, nota) {
    const key = `${alumnoId}|${mes}`
    if (!motivo) {
      await supabase.from('motivos_baja').delete().eq('alumno_id', alumnoId).eq('mes', mes)
      setMotivos(prev => { const n = { ...prev }; delete n[key]; return n })
      return
    }
    const { error } = await supabase
      .from('motivos_baja')
      .upsert({ alumno_id: alumnoId, mes, motivo, nota: nota || null }, { onConflict: 'alumno_id,mes' })
    if (error) { alert('No se pudo guardar el motivo: ' + error.message); return }
    setMotivos(prev => ({ ...prev, [key]: { motivo, nota: nota || '' } }))
  }

  function cambiarMesStats(delta) { setMesStats(desplazarMes(mesStats, delta)) }

  const labelMesStats = labelDeMes(mesStats)
  const labelPrevMesStats = labelDeMes(mesAnterior(mesStats))
  const labelPrimerMes = modelo.primerMes ? labelDeMes(modelo.primerMes) : ''
  const labelInicioRango = mesesRango.length > 0 ? labelDeMes(mesesRango[0]) : ''
  const labelFinRango = mesesRango.length > 0 ? labelDeMes(mesesRango[mesesRango.length - 1]) : ''

  const totalHistorico = alumnos.length
  const totalActivos = idsActivosHoy.size

  const filtrados = alumnos.filter(a => {
    const activo = idsActivosHoy.has(String(a.id))
    if (filtro === 'activo' && !activo) return false
    if (filtro === 'baja' && activo) return false
    return a.nombre.toLowerCase().includes(busqueda.toLowerCase())
  })

  async function guardarEdicion() {
    if (!editando) return
    await supabase.from('alumnos').update({
      nombre: editando.nombre,
      exento_pago: editando.exento_pago,
      genero: editando.genero || null,
      anio_nacimiento: editando.anio_nacimiento ? parseInt(editando.anio_nacimiento) : null,
      canal_origen: editando.canal_origen || null
    }).eq('id', editando.id)
    setEditando(null)
    cargar()
  }

  function abrirFusionCon(nombreA, nombreB) {
    setFusionAbierta(true)
    setBuscA(nombreA); setBuscB(nombreB)
    const a = alumnos.find(x => x.nombre === nombreA)
    const b = alumnos.find(x => x.nombre === nombreB)
    setSeleccionA(a || null); setSeleccionB(b || null)
    setConteos(null); setSurvivor(null)
  }

  async function cargarConteos() {
    if (!seleccionA || !seleccionB) return
    const [insA, cobA, insB, cobB] = await Promise.all([
      supabase.from('inscripciones').select('id', { count: 'exact', head: true }).eq('alumno_id', seleccionA.id),
      supabase.from('cobranzas').select('id', { count: 'exact', head: true }).eq('alumno_id', seleccionA.id),
      supabase.from('inscripciones').select('id', { count: 'exact', head: true }).eq('alumno_id', seleccionB.id),
      supabase.from('cobranzas').select('id', { count: 'exact', head: true }).eq('alumno_id', seleccionB.id),
    ])
    setConteos({
      a: { insc: insA.count || 0, cob: cobA.count || 0 },
      b: { insc: insB.count || 0, cob: cobB.count || 0 }
    })
  }

  useEffect(() => { if (seleccionA && seleccionB) cargarConteos() }, [seleccionA, seleccionB])

  async function confirmarFusion() {
    if (!seleccionA || !seleccionB || !survivor) return
    const ganador = survivor === 'a' ? seleccionA : seleccionB
    const perdedor = survivor === 'a' ? seleccionB : seleccionA

    await supabase.from('inscripciones').update({ alumno_id: ganador.id }).eq('alumno_id', perdedor.id)
    await supabase.from('cobranzas').update({ alumno_id: ganador.id }).eq('alumno_id', perdedor.id)
    await supabase.from('alumnos').delete().eq('id', perdedor.id)

    setFusionAbierta(false)
    setSeleccionA(null); setSeleccionB(null); setConteos(null); setSurvivor(null)
    cargar()
    cargarRetencion()
  }

  const conteoGenero = {}
  const conteoCanal = {}
  let conGenero = 0
  let conCanal = 0
  alumnos.forEach(a => {
    if (a.genero) { conteoGenero[a.genero] = (conteoGenero[a.genero] || 0) + 1; conGenero++ }
    if (a.canal_origen) { conteoCanal[a.canal_origen] = (conteoCanal[a.canal_origen] || 0) + 1; conCanal++ }
  })
  const pctGenero = totalHistorico > 0 ? Math.round((conGenero / totalHistorico) * 100) : 0
  const pctCanal = totalHistorico > 0 ? Math.round((conCanal / totalHistorico) * 100) : 0

  const distribucionClases = {}
  Object.values(clasesPorAlumno).forEach((c: any) => { distribucionClases[c] = (distribucionClases[c] || 0) + 1 })
  const clavesDistribucion = Object.keys(distribucionClases).map(Number).sort((a, b) => a - b)

  const horariosViendo = viendo ? horariosDe((modelo.porMes[mesStats] || {})[viendo.id]) : []

  const motivosItems = Object.keys(retencion.motivosCnt)
    .map(k => ({
      label: k,
      valor: retencion.motivosCnt[k],
      extra: `${Math.round((retencion.motivosCnt[k] / Math.max(1, retencion.bajasTotal)) * 100)}%`
    }))
    .sort((a, b) => b.valor - a.valor)

  const antigItems = BUCKETS.map(b => ({
    label: b,
    valor: retencion.antig[b],
    extra: `${Math.round((retencion.antig[b] / Math.max(1, retencion.bajasTotal)) * 100)}%`
  }))

  if (!rol) return null

  return (
    <div className="min-h-screen bg-[#ECE6DA] px-4 py-6 md:px-12 md:py-8">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <p className="text-3xl md:text-4xl text-[#221F1B] tracking-wide" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
          Romana Studio
        </p>
        <Menu activo="/alumnos" />
      </div>

      <p className="text-xs text-[#8A8378] uppercase tracking-widest mb-4">Alumnos</p>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-full text-sm border ${tab === key ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15 hover:border-[#5C6F5D]'}`}
            >
              {label}{key === 'bajas' && transicionMes ? ` (${transicionMes.bajas.length})` : ''}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => cambiarMesStats(-1)} className="w-8 h-8 rounded-full bg-white border border-[#221F1B]/10 flex items-center justify-center text-[#221F1B] hover:bg-[#F5F1E9]">‹</button>
          <span className="text-sm font-medium text-[#221F1B] min-w-[140px] text-center">{labelMesStats}</span>
          <button onClick={() => cambiarMesStats(1)} className="w-8 h-8 rounded-full bg-white border border-[#221F1B]/10 flex items-center justify-center text-[#221F1B] hover:bg-[#F5F1E9]">›</button>
        </div>
      </div>

      {tab === 'listado' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-5 py-4">
              <p className="text-xs text-[#8A8378] mb-1">Alumnos históricos</p>
              <p className="text-3xl font-semibold text-[#221F1B]">{totalHistorico}</p>
            </div>
            <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-5 py-4">
              <p className="text-xs text-[#8A8378] mb-1">Alumnos activos hoy</p>
              <p className="text-3xl font-semibold text-[#5C6F5D]">{totalActivos}</p>
            </div>
            <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-5 py-4">
              <p className="text-xs text-[#8A8378] mb-1">Anotados en {labelMesStats}</p>
              <p className="text-3xl font-semibold text-[#221F1B]">{anotadosEnMes}</p>
              {cargandoRet ? (
                <p className="text-xs text-[#8A8378] mt-2">Calculando…</p>
              ) : transicionMes ? (
                <div className="flex items-center gap-4 mt-2">
                  <button onClick={() => setNuevosModalAbierto(true)} className="text-xs text-[#5C6F5D] hover:underline font-medium">
                    +{transicionMes.nuevos.length} nuevos
                  </button>
                  <button onClick={() => setTab('bajas')} className="text-xs text-[#B5504A] hover:underline font-medium">
                    -{transicionMes.bajas.length} bajas
                    {transicionMes.activosPrev.length > 0 ? ` · ${((transicionMes.bajas.length / transicionMes.activosPrev.length) * 100).toFixed(1)}%` : ''}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-[#8A8378] mt-2">Sin datos del mes anterior para comparar</p>
              )}
            </div>
          </div>

          {sospechososVigentes.length > 0 && (
            <div className="mb-6 bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 p-4">
              <p className="text-sm font-medium text-[#221F1B] mb-2">Posibles duplicados detectados</p>
              <p className="text-xs text-[#8A8378] mb-3">Conviene fusionarlos: si una persona figura con dos nombres, cuenta como una baja y un alumno nuevo a la vez.</p>
              <div className="flex flex-col gap-2">
                {sospechososVigentes.map(([n1, n2]) => (
                  <div key={n1 + n2} className="flex items-center justify-between text-sm">
                    <span className="text-[#221F1B]">{n1} <span className="text-[#8A8378]">↔</span> {n2}</span>
                    <button onClick={() => abrirFusionCon(n1, n2)} className="text-xs px-3 py-1 rounded-full bg-[#F5F1E9] text-[#5C6F5D] font-medium hover:bg-[#EDE7DD]">
                      Revisar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex gap-2">
              {['activo', 'baja', 'todos'].map(f => (
                <button key={f} onClick={() => setFiltro(f)} className={`px-4 py-1.5 rounded-full text-sm border ${filtro === f ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15 hover:border-[#5C6F5D]'}`}>
                  {f === 'activo' ? 'Activos' : f === 'baja' ? 'Ex alumnos' : 'Todos'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar alumno…" className="border border-[#221F1B]/15 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#5C6F5D] bg-white" />
              <button
                onClick={() => { setFusionAbierta(true); setBuscA(''); setBuscB(''); setSeleccionA(null); setSeleccionB(null); setConteos(null); setSurvivor(null) }}
                className="text-sm px-4 py-1.5 rounded-full bg-white border border-[#221F1B]/15 text-[#221F1B] hover:border-[#5C6F5D] hover:text-[#5C6F5D]"
              >
                Fusionar alumnos
              </button>
            </div>
          </div>

          {cargando ? (
            <p className="text-[#8A8378] text-sm">Cargando alumnos…</p>
          ) : (
            <div className="bg-[#FBF9F5] rounded-2xl border border-[#221F1B]/8 overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#221F1B]/10 bg-[#F3EEE4]">
                    <th className="text-left px-4 py-3 text-sm font-semibold text-[#221F1B]">Nombre</th>
                    <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B] w-48">Clases/sem ({labelMesStats})</th>
                    <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B] w-28">Estado</th>
                    <th className="w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(a => (
                    <tr key={a.id} className="border-b border-[#221F1B]/8 last:border-0 hover:bg-[#F5F1E9]">
                      <td className="px-4 py-3 text-sm">
                        <button onClick={() => setViendo(a)} className="text-[#221F1B] hover:text-[#5C6F5D] hover:underline text-left">
                          {a.nombre}
                        </button>
                        {a.exento_pago && (
                          <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-[#E3E3DE] text-[#8A8378]">Exento</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-[#221F1B]">{clasesPorAlumno[a.id] ?? 0}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full ${idsActivosHoy.has(String(a.id)) ? 'bg-[#5C6F5D] text-white' : 'bg-[#EDE7DD] text-[#8A8378]'}`}>
                          {idsActivosHoy.has(String(a.id)) ? 'Activo' : 'Baja'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => setEditando({ ...a })} className="text-xs text-[#5C6F5D] hover:underline">Editar</button>
                      </td>
                    </tr>
                  ))}
                  {filtrados.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-[#8A8378]">Sin resultados</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'bajas' && (
        <div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button
              onClick={() => setVistaBajas('mes')}
              className={`px-3 py-1 rounded-full text-xs border ${vistaBajas === 'mes' ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15 hover:border-[#5C6F5D]'}`}
            >
              Solo {labelMesStats}
            </button>
            <button
              onClick={() => setVistaBajas('todos')}
              className={`px-3 py-1 rounded-full text-xs border ${vistaBajas === 'todos' ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15 hover:border-[#5C6F5D]'}`}
            >
              Todo el historial
            </button>
            <label className="flex items-center gap-2 text-xs text-[#221F1B] ml-2 cursor-pointer">
              <input type="checkbox" checked={soloSinMotivo} onChange={e => setSoloSinMotivo(e.target.checked)} />
              Solo las que no tienen motivo
            </label>
          </div>

          <p className="text-sm font-medium text-[#221F1B] mb-1">
            {vistaBajas === 'mes' ? `Bajas de ${labelMesStats}` : 'Bajas de todos los meses'}
          </p>
          <p className="text-xs text-[#8A8378] mb-1">
            {vistaBajas === 'mes'
              ? `Iban en ${labelPrevMesStats} y no figuran anotados en ${labelMesStats}.`
              : 'Cada baja figura en el mes en que dejó de aparecer anotado.'}
          </p>
          <p className="text-xs text-[#8A8378] mb-5">
            Ojo: si un mes todavía no está completo en la grilla (por ejemplo, antes de usar &quot;Traer inscriptos&quot;), van a aparecer bajas de más.
          </p>

          {cargandoRet ? (
            <p className="text-sm text-[#8A8378]">Cargando…</p>
          ) : !hayDatosBajas ? (
            <p className="text-sm text-[#8A8378]">No hay datos suficientes para comparar con el mes anterior.</p>
          ) : bajasTodas.length === 0 ? (
            <p className="text-sm text-[#8A8378]">No hay bajas en este período.</p>
          ) : (
            <>
              <p className="text-xs text-[#8A8378] mb-3">{bajasConMotivoCount} de {bajasTodas.length} con motivo cargado</p>
              {listaBajas.length === 0 ? (
                <p className="text-sm text-[#5C6F5D]">Todas tienen motivo cargado.</p>
              ) : (
                <div className="bg-[#FBF9F5] rounded-2xl border border-[#221F1B]/8 overflow-hidden overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-[#221F1B]/10 bg-[#F3EEE4]">
                        {vistaBajas === 'todos' && (
                          <th className="text-left px-4 py-3 text-sm font-semibold text-[#221F1B]">Mes</th>
                        )}
                        <th className="text-left px-4 py-3 text-sm font-semibold text-[#221F1B]">Alumno</th>
                        <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B]">Estuvo</th>
                        <th className="text-center px-4 py-3 text-sm font-semibold text-[#221F1B]">Clases/sem</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-[#221F1B]">Horarios y profe</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-[#221F1B]">Motivo</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-[#221F1B]">Nota</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listaBajas.map(b => {
                        const key = `${b.id}|${b.mesBaja}`
                        const m = motivos[key]
                        const opciones = m && !MOTIVOS_BAJA.includes(m.motivo) ? [...MOTIVOS_BAJA, m.motivo] : MOTIVOS_BAJA
                        return (
                          <tr key={key} className="border-b border-[#221F1B]/8 last:border-0 align-top">
                            {vistaBajas === 'todos' && (
                              <td className="px-4 py-3 text-sm text-[#8A8378] whitespace-nowrap">
                                {MESES_CORTOS[Number(b.mesBaja.slice(5, 7)) - 1]} {b.mesBaja.slice(0, 4)}
                              </td>
                            )}
                            <td className="px-4 py-3 text-sm text-[#221F1B]">{b.nombre}</td>
                            <td className="px-4 py-3 text-sm text-center text-[#221F1B] whitespace-nowrap">
                              {b.racha.meses}{b.racha.censurado ? '+' : ''} {b.racha.meses === 1 ? 'mes' : 'meses'}
                            </td>
                            <td className="px-4 py-3 text-sm text-center text-[#221F1B]">{b.clases}</td>
                            <td className="px-4 py-3 text-xs text-[#221F1B]">
                              <div className="flex flex-col gap-0.5">
                                {b.horarios.map(h => (
                                  <span key={h.id}>
                                    {String(h.dia).slice(0, 3)} {formatHora(h.hora)}{nombreProfeDe(h) ? ` · ${nombreProfeDe(h)}` : ''}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={m ? m.motivo : ''}
                                onChange={e => guardarMotivo(b.id, b.mesBaja, e.target.value, m ? m.nota : '')}
                                className="border border-[#221F1B]/15 rounded-lg px-2 py-1.5 text-sm bg-white outline-none focus:border-[#5C6F5D]"
                              >
                                <option value="">Sin motivo cargado</option>
                                {opciones.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                key={key + (m ? m.nota : '')}
                                defaultValue={m ? m.nota : ''}
                                disabled={!m}
                                placeholder={m ? 'Nota (opcional)' : 'Elegí un motivo primero'}
                                onBlur={e => { if (m && e.target.value !== (m.nota || '')) guardarMotivo(b.id, b.mesBaja, m.motivo, e.target.value) }}
                                className="w-full min-w-[160px] border border-[#221F1B]/15 rounded-lg px-2 py-1.5 text-sm bg-white outline-none focus:border-[#5C6F5D] disabled:bg-[#F5F1E9]"
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'retencion' && (
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs text-[#8A8378]">Período:</span>
            {RANGOS.map(([v, l]) => (
              <button
                key={v}
                onClick={() => setRango(v)}
                className={`px-3 py-1 rounded-full text-xs border ${rango === v ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15 hover:border-[#5C6F5D]'}`}
              >
                {l}
              </button>
            ))}
          </div>

          {rango === 'custom' && (
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <label className="flex items-center gap-2 text-xs text-[#8A8378]">
                Desde
                <input
                  type="month"
                  value={desdeCustom}
                  onChange={e => setDesdeCustom(e.target.value)}
                  className="border border-[#221F1B]/15 rounded-lg px-2 py-1 text-sm bg-white outline-none focus:border-[#5C6F5D]"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-[#8A8378]">
                Hasta
                <input
                  type="month"
                  value={hastaCustom}
                  onChange={e => setHastaCustom(e.target.value)}
                  className="border border-[#221F1B]/15 rounded-lg px-2 py-1 text-sm bg-white outline-none focus:border-[#5C6F5D]"
                />
              </label>
            </div>
          )}

          <p className="text-xs text-[#8A8378] mb-5">
            De {labelInicioRango} a {labelFinRango}
            {retencion.mesesConDatos < mesesRango.length ? ` — ${retencion.mesesConDatos} mes(es) con datos para comparar` : ''}
            {rango !== 'custom' ? '. Los períodos cuentan hacia atrás desde el mes elegido arriba a la derecha.' : ''}
          </p>

          {cargandoRet ? (
            <p className="text-sm text-[#8A8378]">Cargando…</p>
          ) : retencion.mesesConDatos === 0 ? (
            <p className="text-sm text-[#8A8378]">No hay meses consecutivos con datos para calcular en este período. Probá con otro rango.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-5 py-4">
                  <p className="text-xs text-[#8A8378] mb-1">Churn mensual</p>
                  <p className="text-3xl font-semibold text-[#B5504A]">{retencion.churn !== null ? `${retencion.churn.toFixed(1)}%` : '—'}</p>
                  <p className="text-[11px] text-[#8A8378] mt-1">
                    {retencion.mesesConDatos === 1 ? `${retencion.sumBajas} bajas de ${retencion.sumBase} alumnos` : 'promedio mensual del período'}
                  </p>
                </div>
                <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-5 py-4">
                  <p className="text-xs text-[#8A8378] mb-1">Bajas</p>
                  <p className="text-3xl font-semibold text-[#221F1B]">{retencion.sumBajas}</p>
                  <p className="text-[11px] text-[#8A8378] mt-1">
                    {retencion.mesesConDatos === 1 ? 'en el mes' : `${(retencion.sumBajas / Math.max(1, retencion.mesesConDatos)).toFixed(1)} por mes`}
                  </p>
                </div>
                <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-5 py-4">
                  <p className="text-xs text-[#8A8378] mb-1">Nuevos de verdad</p>
                  <p className="text-3xl font-semibold text-[#5C6F5D]">{retencion.sumNuevosReales}</p>
                  <p className="text-[11px] text-[#8A8378] mt-1">primera vez que aparecen</p>
                </div>
                <div className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 px-5 py-4">
                  <p className="text-xs text-[#8A8378] mb-1">Reingresos</p>
                  <p className="text-3xl font-semibold text-[#8A6B2C]">{retencion.sumReingresos}</p>
                  <p className="text-[11px] text-[#8A8378] mt-1">volvieron después de faltar</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-[#FBF9F5] rounded-2xl border border-[#221F1B]/8 p-5">
                  <p className="text-sm font-medium text-[#221F1B] mb-1">Cuánto tiempo estuvieron antes de irse</p>
                  <p className="text-xs text-[#8A8378] mb-4">Meses seguidos anotados antes de la baja</p>
                  {retencion.bajasTotal === 0 ? (
                    <p className="text-sm text-[#8A8378]">No hubo bajas en el período.</p>
                  ) : (
                    <>
                      <BarrasH items={antigItems} formato={i => `${i.valor}`} />
                      {retencion.censuradas > 0 && (
                        <p className="text-[11px] text-[#8A8378] mt-4">
                          {retencion.censuradas} de estas bajas ya estaban anotadas en {labelPrimerMes}, el primer mes con datos: su antigüedad real puede ser mayor.
                        </p>
                      )}
                    </>
                  )}
                </div>

                <div className="bg-[#FBF9F5] rounded-2xl border border-[#221F1B]/8 p-5">
                  <p className="text-sm font-medium text-[#221F1B] mb-1">Motivos de baja</p>
                  <p className="text-xs text-[#8A8378] mb-4">
                    {retencion.bajasConMotivo} de {retencion.bajasTotal} bajas con motivo cargado (se cargan en la pestaña Bajas)
                  </p>
                  {retencion.bajasTotal === 0 ? (
                    <p className="text-sm text-[#8A8378]">No hubo bajas en el período.</p>
                  ) : (
                    <BarrasH items={motivosItems} formato={i => `${i.valor}`} />
                  )}
                </div>
              </div>

              <div className="mb-3">
                <p className="text-sm font-medium text-[#221F1B] mb-1">Bajas por profe</p>
                <p className="text-xs text-[#8A8378]">
                  Se cuenta cada alumno que tenía al menos una clase con ese profe. Quien tenía clases con dos profes cuenta en los dos. Con pocas bajas por profe, las diferencias chicas entre porcentajes no son concluyentes.
                </p>
              </div>

              {horariosUsadosSinProfe > 0 && (
                <div className="mb-4 bg-[#FBF4E4] border border-[#8A6B2C]/20 rounded-xl px-4 py-3 text-xs text-[#8A6B2C]">
                  Hay {horariosUsadosSinProfe} horarios usados en algún mes que todavía no tienen profe (incluye horarios que ya no están en la grilla), así que esos alumnos figuran como &quot;Sin profe asignado&quot;. Asignalos en <a href="/" className="underline font-medium">Días y Horarios</a> → &quot;Profes por horario&quot;, abajo de todo en &quot;Horarios que ya no están en la grilla&quot;.
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-[#FBF9F5] rounded-2xl border border-[#221F1B]/8 p-5">
                  <p className="text-sm font-medium text-[#221F1B] mb-1">Por cantidad</p>
                  <p className="text-xs text-[#8A8378] mb-4">Cuántos alumnos se le fueron a cada profe</p>
                  {profesPorCantidad.length === 0 ? (
                    <p className="text-sm text-[#8A8378]">Sin datos.</p>
                  ) : (
                    <BarrasH items={profesPorCantidad} formato={i => `${i.valor} bajas`} />
                  )}
                </div>
                <div className="bg-[#FBF9F5] rounded-2xl border border-[#221F1B]/8 p-5">
                  <p className="text-sm font-medium text-[#221F1B] mb-1">Por proporción</p>
                  <p className="text-xs text-[#8A8378] mb-4">Bajas sobre los alumnos que tenía cada profe</p>
                  {profesPorPct.length === 0 ? (
                    <p className="text-sm text-[#8A8378]">Sin datos.</p>
                  ) : (
                    <BarrasH items={profesPorPct} formato={i => `${i.valor.toFixed(1)}%`} />
                  )}
                </div>
              </div>
            </>
          )}

          <div className="bg-[#FBF9F5] rounded-2xl border border-[#221F1B]/8 p-5">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
              <p className="text-sm font-medium text-[#221F1B]">Evolución del año</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setAnioResumen(a => a - 1)} className="w-7 h-7 rounded-full bg-[#ECE6DA] flex items-center justify-center text-[#221F1B] text-sm">‹</button>
                <span className="text-sm font-medium text-[#221F1B] w-14 text-center">{anioResumen}</span>
                <button onClick={() => setAnioResumen(a => a + 1)} className="w-7 h-7 rounded-full bg-[#ECE6DA] flex items-center justify-center text-[#221F1B] text-sm">›</button>
              </div>
            </div>
            {cargandoRet ? (
              <p className="text-xs text-[#8A8378]">Cargando…</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                  <p className="text-xs text-[#8A8378] mb-3">Alumnos anotados por mes</p>
                  <BarrasV items={serieAnual.map((s, i) => ({ label: MESES_CORTOS[i], valor: s.activos, texto: String(s.activos) }))} />
                </div>
                <div>
                  <p className="text-xs text-[#8A8378] mb-3">Churn por mes (bajas sobre alumnos del mes anterior)</p>
                  <BarrasV
                    items={serieAnual.map((s, i) => ({
                      label: MESES_CORTOS[i],
                      valor: s.churn || 0,
                      texto: s.churn !== null ? `${Math.round(s.churn)}%` : '',
                      titulo: s.bajas !== null ? `${s.bajas} bajas de ${s.base}` : 'Sin datos'
                    }))}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'perfil' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#FBF9F5] rounded-2xl border border-[#221F1B]/8 p-5">
            <p className="text-sm font-medium text-[#221F1B] mb-1">Alumnos por clases semanales — {labelMesStats}</p>
            <p className="text-xs text-[#8A8378] mb-4">De los {anotadosEnMes} anotados ese mes, cuántos van 1 vez, cuántos 2, etc.</p>
            {clavesDistribucion.length === 0 ? (
              <p className="text-sm text-[#8A8378]">Nadie anotado en {labelMesStats}.</p>
            ) : (
              <BarrasV
                items={clavesDistribucion.map(c => ({
                  label: `${c} ${c === 1 ? 'clase' : 'clases'}/sem`,
                  valor: distribucionClases[c],
                  texto: String(distribucionClases[c])
                }))}
              />
            )}
          </div>

          <div className="bg-[#FBF9F5] rounded-2xl border border-[#221F1B]/8 p-5">
            <p className="text-sm font-medium text-[#221F1B] mb-4">Género y canal de origen</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-[#8A8378] mb-2">Género — {pctGenero}% completado ({conGenero} de {totalHistorico})</p>
                <div className="flex flex-col gap-1">
                  {GENEROS.map(g => (
                    <div key={g} className="flex items-center justify-between text-sm">
                      <span className="text-[#221F1B]">{g}</span>
                      <span className="text-[#8A8378]">{conteoGenero[g] || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-[#8A8378] mb-2">Canal de origen — {pctCanal}% completado ({conCanal} de {totalHistorico})</p>
                <div className="flex flex-col gap-1">
                  {CANALES.map(c => (
                    <div key={c} className="flex items-center justify-between text-sm">
                      <span className="text-[#221F1B]">{c}</span>
                      <span className="text-[#8A8378]">{conteoCanal[c] || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {nuevosModalAbierto && transicionMes && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 py-8" onClick={() => setNuevosModalAbierto(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-1">Nuevos en {labelMesStats}</p>
            <p className="text-xs text-[#8A8378] mb-4">No estaban en {labelPrevMesStats} y aparecen anotados este mes</p>
            <div className="max-h-80 overflow-y-auto flex flex-col gap-1">
              {transicionMes.nuevos.length === 0 ? (
                <p className="text-sm text-[#8A8378]">Nadie nuevo este mes.</p>
              ) : transicionMes.nuevos
                  .map(id => alumnoPorId[String(id)])
                  .filter(Boolean)
                  .sort((a, b) => a.nombre.localeCompare(b.nombre))
                  .map(a => (
                    <button key={a.id} onClick={() => { setNuevosModalAbierto(false); setViendo(a) }} className="text-left text-sm px-3 py-2 rounded-lg hover:bg-[#F5F1E9] text-[#221F1B] flex items-center justify-between">
                      <span>{a.nombre}</span>
                      {modelo.primerMesDe[String(a.id)] !== mesStats && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FBF4E4] text-[#8A6B2C]">reingreso</span>
                      )}
                    </button>
                  ))}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setNuevosModalAbierto(false)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {viendo && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setViendo(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-1">{viendo.nombre}</p>
            <p className="text-xs text-[#8A8378] mb-4">
              {clasesPorAlumno[viendo.id] ?? 0} clases/semana en {labelMesStats} · {idsActivosHoy.has(String(viendo.id)) ? 'Activo hoy' : 'Baja hoy'}
              {viendo.exento_pago ? ' · Exento de pago' : ''}
            </p>
            <p className="text-xs font-medium text-[#8A8378] uppercase tracking-wide mb-2">Horarios en {labelMesStats}</p>
            <div className="flex flex-col gap-1.5 mb-2">
              {horariosViendo.length > 0 ? horariosViendo.map(h => (
                <div key={h.id} className="text-sm text-[#221F1B] bg-[#F5F1E9] rounded-lg px-3 py-2">
                  {h.dia} — {formatHora(h.hora)}{nombreProfeDe(h) ? ` · ${nombreProfeDe(h)}` : ''}
                </div>
              )) : (
                <p className="text-sm text-[#8A8378]">Sin horarios anotados este mes</p>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setViendo(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 py-8" onClick={() => setEditando(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-4">Editar alumno</p>
            <label className="block text-xs text-[#8A8378] mb-1">Nombre</label>
            <input value={editando.nombre} onChange={e => setEditando({ ...editando, nombre: e.target.value })} className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#5C6F5D]" />
            <p className="text-xs text-[#8A8378] mb-4">
              Clases por semana: <span className="text-[#221F1B] font-medium">{clasesPorAlumno[editando.id] ?? 0}</span> (se calcula solo desde la grilla, no se edita acá)
            </p>

            <label className="block text-xs text-[#8A8378] mb-1">Género (opcional)</label>
            <div className="flex gap-2 mb-3 flex-wrap">
              {GENEROS.map(g => (
                <button key={g} onClick={() => setEditando({ ...editando, genero: editando.genero === g ? null : g })} className={`px-3 py-1.5 rounded-full text-xs border ${editando.genero === g ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                  {g}
                </button>
              ))}
            </div>

            <label className="block text-xs text-[#8A8378] mb-1">Año de nacimiento (opcional)</label>
            <input
              type="number"
              placeholder="Ej: 1990"
              value={editando.anio_nacimiento || ''}
              onChange={e => setEditando({ ...editando, anio_nacimiento: e.target.value })}
              className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#5C6F5D]"
            />

            <label className="block text-xs text-[#8A8378] mb-1">¿Cómo nos conoció? (opcional)</label>
            <div className="flex gap-2 mb-4 flex-wrap">
              {CANALES.map(c => (
                <button key={c} onClick={() => setEditando({ ...editando, canal_origen: editando.canal_origen === c ? null : c })} className={`px-3 py-1.5 rounded-full text-xs border ${editando.canal_origen === c ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15'}`}>
                  {c}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between bg-[#F5F1E9] rounded-lg px-3 py-2.5 mb-5">
              <div>
                <p className="text-sm text-[#221F1B]">No paga cuota</p>
                <p className="text-[10px] text-[#8A8378]">No entra en la proyección ni figura como pendiente/vencido</p>
              </div>
              <button
                onClick={() => setEditando({ ...editando, exento_pago: !editando.exento_pago })}
                className={`w-11 h-6 rounded-full relative transition-colors ${editando.exento_pago ? 'bg-[#5C6F5D]' : 'bg-[#D8D2C4]'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${editando.exento_pago ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setEditando(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
              <button onClick={guardarEdicion} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {fusionAbierta && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setFusionAbierta(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-1">Fusionar alumnos duplicados</p>
            <p className="text-xs text-[#8A8378] mb-4">Elegí los dos registros que son la misma persona</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <input value={buscA} onChange={e => { setBuscA(e.target.value); setSeleccionA(null); setConteos(null) }} placeholder="Buscar alumno A…" className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-[#5C6F5D]" />
                {!seleccionA && buscA && (
                  <div className="max-h-32 overflow-y-auto flex flex-col gap-1">
                    {alumnos.filter(a => a.nombre.toLowerCase().includes(buscA.toLowerCase())).slice(0, 10).map(a => (
                      <button key={a.id} onClick={() => setSeleccionA(a)} className="text-left text-xs px-2 py-1.5 rounded hover:bg-[#F5F1E9]">{a.nombre}</button>
                    ))}
                  </div>
                )}
                {seleccionA && <p className="text-sm font-medium text-[#221F1B]">{seleccionA.nombre}</p>}
              </div>
              <div>
                <input value={buscB} onChange={e => { setBuscB(e.target.value); setSeleccionB(null); setConteos(null) }} placeholder="Buscar alumno B…" className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-[#5C6F5D]" />
                {!seleccionB && buscB && (
                  <div className="max-h-32 overflow-y-auto flex flex-col gap-1">
                    {alumnos.filter(a => a.nombre.toLowerCase().includes(buscB.toLowerCase())).slice(0, 10).map(a => (
                      <button key={a.id} onClick={() => setSeleccionB(a)} className="text-left text-xs px-2 py-1.5 rounded hover:bg-[#F5F1E9]">{a.nombre}</button>
                    ))}
                  </div>
                )}
                {seleccionB && <p className="text-sm font-medium text-[#221F1B]">{seleccionB.nombre}</p>}
              </div>
            </div>

            {seleccionA && seleccionB && conteos && (
              <div className="bg-[#F5F1E9] rounded-lg p-4 mb-4">
                <p className="text-xs text-[#8A8378] mb-3">Elegí cuál registro querés conservar (el otro se elimina y sus datos pasan al que elijas)</p>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setSurvivor('a')} className={`text-left p-3 rounded-lg border ${survivor === 'a' ? 'border-[#5C6F5D] bg-white' : 'border-[#221F1B]/10 bg-white/50'}`}>
                    <p className="text-sm font-medium text-[#221F1B]">{seleccionA.nombre}</p>
                    <p className="text-xs text-[#8A8378] mt-1">{conteos.a.insc} inscripciones · {conteos.a.cob} cobranzas</p>
                  </button>
                  <button onClick={() => setSurvivor('b')} className={`text-left p-3 rounded-lg border ${survivor === 'b' ? 'border-[#5C6F5D] bg-white' : 'border-[#221F1B]/10 bg-white/50'}`}>
                    <p className="text-sm font-medium text-[#221F1B]">{seleccionB.nombre}</p>
                    <p className="text-xs text-[#8A8378] mt-1">{conteos.b.insc} inscripciones · {conteos.b.cob} cobranzas</p>
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button onClick={() => setFusionAbierta(false)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
              <button onClick={confirmarFusion} disabled={!survivor} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D] disabled:opacity-40">
                Confirmar fusión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
