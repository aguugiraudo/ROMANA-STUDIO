'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from './lib/supabase'
import { getRol, cerrarSesion, ROLES } from './lib/auth'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
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

function formatHoraCompleta(hora) {
  return hora.slice(0, 5)
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
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

export default function Grilla() {
  const router = useRouter()
  const [rol, setRolState] = useState(null)
  const [horarios, setHorarios] = useState([])
  const [inscripciones, setInscripciones] = useState([])
  const [alumnosList, setAlumnosList] = useState([])
  const [listaEspera, setListaEspera] = useState([])
  const [mes, setMes] = useState(mesActualISO())
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [copiando, setCopiando] = useState(false)
  const [confirmarBaja, setConfirmarBaja] = useState(null)
  const [confirmarMover, setConfirmarMover] = useState(null)
  const [dispAbierta, setDispAbierta] = useState(false)
  const [placaAbierta, setPlacaAbierta] = useState(false)
  const [camasConsulta, setCamasConsulta] = useState(1)
  const [textoCopiado, setTextoCopiado] = useState(false)
  const [diaMovil, setDiaMovil] = useState(DIAS[0])
  const [fondoImg, setFondoImg] = useState(null)
  const [logoImg, setLogoImg] = useState(null)
  const [direccionForm, setDireccionForm] = useState('Falucho 9')
  const [telefonoForm, setTelefonoForm] = useState('3492-657457')
  const [esperaModal, setEsperaModal] = useState(null)
  const [nombreEsperaForm, setNombreEsperaForm] = useState('')
  const [telefonoEsperaForm, setTelefonoEsperaForm] = useState('')
  const [verEsperaModal, setVerEsperaModal] = useState(null)
  const [esperaIdPendiente, setEsperaIdPendiente] = useState(null)
  const [creandoHorario, setCreandoHorario] = useState(false)
  const canvasRef = useRef(null)

  useEffect(() => {
    const r = getRol()
    if (!r) { router.push('/login'); return }
    setRolState(r)
  }, [router])

  const esProfe = rol === ROLES.PROFE

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data: h } = await supabase
      .from('horarios_clase').select('*').eq('activo', true).order('hora')
    setHorarios(h || [])

    const { data: i } = await supabase
      .from('inscripciones').select('*, alumnos(nombre)')
      .eq('mes', mes).eq('estado', 'activo')
    setInscripciones(i || [])

    const { data: a } = await supabase.from('alumnos').select('id, nombre').order('nombre')
    setAlumnosList(a || [])

    const { data: le } = await supabase.from('lista_espera').select('*').eq('mes', mes).order('creado_en')
    setListaEspera(le || [])

    setCargando(false)
  }, [mes])

  useEffect(() => { if (rol) cargar() }, [cargar, rol])

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const off = document.createElement('canvas')
      off.width = img.width
      off.height = img.height
      const octx = off.getContext('2d')
      octx.drawImage(img, 0, 0)
      try {
        const data = octx.getImageData(0, 0, off.width, off.height)
        const px = data.data
        const bgR = px[0], bgG = px[1], bgB = px[2]
        const tolerance = 42
        for (let i = 0; i < px.length; i += 4) {
          const dr = px[i] - bgR, dg = px[i + 1] - bgG, db = px[i + 2] - bgB
          const dist = Math.sqrt(dr * dr + dg * dg + db * db)
          if (dist < tolerance) px[i + 3] = 0
        }
        octx.putImageData(data, 0, 0)
      } catch (e) {}
      setLogoImg(off)
    }
    img.src = '/logo.png'
  }, [])

  function cambiarMes(delta) {
    const [y, m] = mes.split('-').map(Number)
    const fecha = new Date(y, m - 1 + delta, 1)
    const nuevoMes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-01`
    setMes(nuevoMes)
  }

  const [anio, mesNum] = mes.split('-').map(Number)
  const labelMes = `${NOMBRES_MES[mesNum - 1]} ${anio}`
  const mesPrevio = mesAnterior(mes)
  const [anioPrevio, mesNumPrevio] = mesPrevio.split('-').map(Number)
  const labelMesPrevio = `${NOMBRES_MES[mesNumPrevio - 1]} ${anioPrevio}`

  async function copiarMesAnterior() {
    setCopiando(true)
    const { data: prev } = await supabase
      .from('inscripciones').select('alumno_id, horario_clase_id')
      .eq('mes', mesPrevio).eq('estado', 'activo')
    if (prev && prev.length > 0) {
      const nuevas = prev.map(p => ({ alumno_id: p.alumno_id, horario_clase_id: p.horario_clase_id, mes, estado: 'activo' }))
      await supabase.from('inscripciones').insert(nuevas)
      const idsUnicos = [...new Set(prev.map(p => p.alumno_id))]
      for (const id of idsUnicos) { await sincronizarEstadoAlumno(id) }
    }
    setCopiando(false)
    cargar()
  }

  const horasUnicas = [...new Set(horarios.map(h => h.hora))].sort()

  function getSlot(dia, hora) { return horarios.find(h => h.dia === dia && h.hora === hora) }
  function inscriptosDe(slotId) { return inscripciones.filter(i => i.horario_clase_id === slotId) }
  function esperaDe(slotId) { return listaEspera.filter(e => e.horario_clase_id === slotId) }

  async function abrirHorarioNuevo(dia, hora) {
    if (creandoHorario) return
    setCreandoHorario(true)
    const { data: nuevo, error } = await supabase
      .from('horarios_clase')
      .insert({ dia, hora, cupos: 6, activo: true })
      .select()
      .single()
    setCreandoHorario(false)
    if (error) { alert('No se pudo crear el horario: ' + error.message); return }
    setHorarios(prev => [...prev, nuevo])
    setModal({ slotId: nuevo.id })
  }

  async function asignar(slotId, alumnoId) {
    await supabase.from('inscripciones').insert({ alumno_id: alumnoId, horario_clase_id: slotId, mes, estado: 'activo' })
    await sincronizarEstadoAlumno(alumnoId)
    if (esperaIdPendiente) {
      await supabase.from('lista_espera').delete().eq('id', esperaIdPendiente)
      setEsperaIdPendiente(null)
    }
    setModal(null); setBusqueda(''); cargar()
  }

  async function crearYAsignar(slotId, nombre) {
    const nombreLimpio = nombre.trim()
    if (!nombreLimpio) return
    const { data: nuevo, error } = await supabase
      .from('alumnos').insert({ nombre: nombreLimpio, clases_semana: 2, estado: 'activo' }).select().single()
    if (error) { alert('No se pudo crear el alumno: ' + error.message); return }
    await asignar(slotId, nuevo.id)
  }

  async function confirmarQuitar() {
    if (!confirmarBaja) return
    await supabase.from('inscripciones').update({ estado: 'baja' }).eq('id', confirmarBaja.id)
    if (confirmarBaja.alumnoId) await sincronizarEstadoAlumno(confirmarBaja.alumnoId)
    setConfirmarBaja(null)
    cargar()
  }

  function onDragStartCapsula(e, inscripcion) {
    e.dataTransfer.setData('text/plain', inscripcion.id)
  }

  function onDrop(e, destinoSlot, destinoDia, destinoHora) {
    e.preventDefault()
    const inscripcionId = e.dataTransfer.getData('text/plain')
    if (!inscripcionId) return
    const insc = inscripciones.find(i => i.id === inscripcionId)
    if (!insc) return
    if (insc.horario_clase_id === destinoSlot.id) return

    const yaHay = inscriptosDe(destinoSlot.id).length
    if (yaHay >= destinoSlot.cupos) { alert('Ese horario ya está completo'); return }

    const origen = horarios.find(h => h.id === insc.horario_clase_id)
    setConfirmarMover({
      inscripcionId,
      nombre: insc.alumnos?.nombre,
      origenDia: origen?.dia, origenHora: origen?.hora?.slice(0, 5),
      destinoDia, destinoHora: destinoHora.slice(0, 5),
      destinoSlotId: destinoSlot.id
    })
  }

  async function confirmarMoverAhora() {
    if (!confirmarMover) return
    await supabase.from('inscripciones').update({ horario_clase_id: confirmarMover.destinoSlotId }).eq('id', confirmarMover.inscripcionId)
    setConfirmarMover(null)
    cargar()
  }

  async function agregarAEspera() {
    if (!esperaModal || !nombreEsperaForm.trim()) return
    await supabase.from('lista_espera').insert({
      alumno_nombre: nombreEsperaForm.trim(),
      telefono: telefonoEsperaForm.trim() || null,
      horario_clase_id: esperaModal.slotId,
      mes
    })
    setEsperaModal(null); setNombreEsperaForm(''); setTelefonoEsperaForm('')
    cargar()
  }

  async function quitarDeEspera(id) {
    await supabase.from('lista_espera').delete().eq('id', id)
    cargar()
  }

  function anotarDesdeEspera(entry) {
    setVerEsperaModal(null)
    setEsperaIdPendiente(entry.id)
    setBusqueda(entry.alumno_nombre)
    setModal({ slotId: entry.horario_clase_id })
  }

  const alumnosFiltrados = alumnosList.filter(a => a.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  const hayCoincidenciaExacta = alumnosList.some(a => a.nombre.toLowerCase() === busqueda.trim().toLowerCase())
  const mesVacio = !cargando && inscripciones.length === 0

  const bloquesPorDia = DIAS.map(dia => {
    const horasLibres = horasUnicas
      .filter(hora => {
        const slot = getSlot(dia, hora)
        if (!slot) return false
        const inscriptos = inscriptosDe(slot.id)
        if (inscriptos.length === 0) return false
        const libres = slot.cupos - inscriptos.length
        return libres >= camasConsulta
      })
      .map(formatHoraCompleta)
    return { dia, horasLibres }
  }).filter(b => b.horasLibres.length > 0)

  const encabezadoMensaje = camasConsulta === 1
    ? 'Te comparto los horarios disponibles 🕧'
    : `Te comparto los horarios con disponibilidad para ${camasConsulta} personas simultáneas 🕧`

  const mensajeWhatsapp = bloquesPorDia.length > 0
    ? `${encabezadoMensaje}\n\n${bloquesPorDia.map(b => `${b.dia} ${b.horasLibres.join(' / ')}`).join('\n')}`
    : `${encabezadoMensaje}\n\nNo hay horarios disponibles por el momento.`

  async function copiarMensaje() {
    try {
      await navigator.clipboard.writeText(mensajeWhatsapp)
      setTextoCopiado(true)
      setTimeout(() => setTextoCopiado(false), 2000)
    } catch {
      alert('No se pudo copiar automáticamente, seleccioná el texto manualmente.')
    }
  }

  const bloquesPlaca = DIAS.map(dia => {
    const horasLibres = horasUnicas
      .filter(hora => {
        const slot = getSlot(dia, hora)
        if (!slot) return false
        const inscriptos = inscriptosDe(slot.id)
        if (inscriptos.length === 0) return false
        return slot.cupos - inscriptos.length >= 1
      })
      .map(formatHoraCompleta)
    return { dia, horasLibres }
  }).filter(b => b.horasLibres.length > 0)

  useEffect(() => {
    if (!placaAbierta) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = 1080, H = 1920
    canvas.width = W; canvas.height = H

    if (fondoImg) {
      const scale = Math.max(W / fondoImg.width, H / fondoImg.height)
      const w = fondoImg.width * scale, h = fondoImg.height * scale
      ctx.drawImage(fondoImg, (W - w) / 2, (H - h) / 2, w, h)
      ctx.fillStyle = 'rgba(0,0,0,0.08)'
      ctx.fillRect(0, 0, W, H)
    } else {
      ctx.fillStyle = '#3B4552'
      ctx.fillRect(0, 0, W, H)
    }

    const cardX = 160, cardY = 390, cardW = W - 320
    let cardH = 480
    const filasDias = bloquesPlaca.length > 0 ? bloquesPlaca.length : 1
    cardH += filasDias * 128

    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.25)'
    ctx.shadowBlur = 26
    ctx.fillStyle = '#F3ECDE'
    roundRect(ctx, cardX, cardY, cardW, cardH, 4)
    ctx.fill()
    ctx.restore()

    const badgeR = 112
    const badgeCx = W / 2, badgeCy = cardY
    ctx.save()
    ctx.beginPath()
    ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2)
    ctx.fillStyle = '#C9C2B3'
    ctx.fill()
    ctx.clip()
    if (logoImg) {
      const s = Math.min((badgeR * 1.5) / logoImg.width, (badgeR * 1.5) / logoImg.height)
      const lw = logoImg.width * s, lh = logoImg.height * s
      ctx.drawImage(logoImg, badgeCx - lw / 2, badgeCy - lh / 2, lw, lh)
    }
    ctx.restore()

    ctx.textAlign = 'center'
    ctx.fillStyle = '#3A2418'
    ctx.font = '700 44px sans-serif'
    ctx.fillText('ÚLTIMOS CUPOS', W / 2, cardY + badgeR + 88)
    ctx.fillText('DISPONIBLES', W / 2, cardY + badgeR + 142)

    let y = cardY + badgeR + 230
    if (bloquesPlaca.length === 0) {
      ctx.font = '500 32px sans-serif'
      ctx.fillText('Sin cupos disponibles', W / 2, y)
      y += 80
    } else {
      bloquesPlaca.forEach(b => {
        ctx.font = '700 38px sans-serif'
        ctx.fillText(b.dia.toUpperCase(), W / 2, y)
        y += 48
        ctx.font = '500 32px sans-serif'
        ctx.fillText(b.horasLibres.join(' - '), W / 2, y)
        y += 80
      })
    }

    const footerY = H - 140
    ctx.font = '700 34px sans-serif'
    ctx.fillStyle = fondoImg ? '#FFFFFF' : '#F3ECDE'
    ctx.fillText(direccionForm.toUpperCase(), W / 2, footerY)
    ctx.font = '600 30px sans-serif'
    ctx.fillText(telefonoForm, W / 2, footerY + 48)
  }, [placaAbierta, bloquesPlaca, labelMes, fondoImg, logoImg, direccionForm, telefonoForm])

  function onFondoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => setFondoImg(img)
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  function descargarPlaca() {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `cupos-${labelMes.toLowerCase().replace(' ', '-')}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  function salir() {
    cerrarSesion()
    router.push('/login')
  }

  const horariosDelDiaMovil = horasUnicas

  if (!rol) return null

  return (
    <div className="min-h-screen bg-[#ECE6DA] px-4 py-6 md:px-12 md:py-8">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <p className="text-3xl md:text-4xl text-[#221F1B] tracking-wide" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
          Romana Studio
        </p>
        {esProfe ? (
          <button onClick={salir} className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Cerrar sesión</button>
        ) : (
          <nav className="flex gap-4 flex-wrap items-center">
            <a href="/" className="text-sm font-medium text-[#5C6F5D] border-b-2 border-[#5C6F5D] pb-0.5">Días y Horarios</a>
            <a href="/cobranza" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Cobranza</a>
            <a href="/gastos" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Gastos</a>
            <a href="/finanzas" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Finanzas</a>
            <a href="/alumnos" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Alumnos</a>
            <a href="/dashboard" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Dashboard</a>
            <a href="/proyectos" className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Proyectos</a>
            <button onClick={salir} className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Cerrar sesión</button>
          </nav>
        )}
      </div>

      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => cambiarMes(-1)} className="w-8 h-8 rounded-full bg-white border border-[#221F1B]/10 flex items-center justify-center text-[#221F1B] hover:bg-[#F5F1E9]">‹</button>
          <span className="text-sm font-medium text-[#221F1B] min-w-[140px] text-center">{labelMes}</span>
          <button onClick={() => cambiarMes(1)} className="w-8 h-8 rounded-full bg-white border border-[#221F1B]/10 flex items-center justify-center text-[#221F1B] hover:bg-[#F5F1E9]">›</button>
        </div>
        {!esProfe && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setDispAbierta(true)} className="text-sm px-4 py-2 rounded-full bg-white border border-[#221F1B]/10 text-[#221F1B] hover:border-[#5C6F5D] hover:text-[#5C6F5D] flex items-center gap-2">
              <span>🕧</span> Disponibilidad
            </button>
            <button onClick={() => setPlacaAbierta(true)} className="text-sm px-4 py-2 rounded-full bg-white border border-[#221F1B]/10 text-[#221F1B] hover:border-[#5C6F5D] hover:text-[#5C6F5D] flex items-center gap-2">
              <span>📷</span> Placa Instagram
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-[#8A8378] uppercase tracking-widest mb-5">Días y Horarios</p>

      {!esProfe && mesVacio && (
        <div className="mb-6">
          <button onClick={copiarMesAnterior} disabled={copiando} className="text-sm px-4 py-2 rounded-full bg-[#5C6F5D] text-white hover:bg-[#4C5C4D] disabled:opacity-60">
            {copiando ? 'Copiando…' : `Copiar inscripciones de ${labelMesPrevio}`}
          </button>
        </div>
      )}

      {cargando ? (
        <p className="text-[#8A8378] text-sm">Cargando agenda…</p>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto rounded-2xl bg-[#FBF9F5] shadow-sm border border-[#221F1B]/8">
            <table className="w-full border-collapse table-fixed">
              <thead>
                <tr className="border-b border-[#221F1B]/10 bg-[#F3EEE4]">
                  <th className="text-center px-3 py-3 font-mono text-sm font-bold tracking-wider text-[#8A8378] uppercase w-20">Hora</th>
                  {DIAS.map(d => (
                    <th key={d} className="text-center px-3 py-3 text-base font-bold text-[#221F1B] tracking-wide">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {horasUnicas.map(hora => (
                  <tr key={hora} className="border-b-2 border-[#221F1B]/10 last:border-0">
                    <td className="px-3 py-2 text-center align-middle">
                      <span className="font-mono text-lg font-bold text-[#221F1B]">{formatHoraCompleta(hora)}</span>
                    </td>
                    {DIAS.map(dia => {
                      const slot = getSlot(dia, hora)
                      const inscriptos = slot ? inscriptosDe(slot.id) : []
                      const libres = slot ? slot.cupos - inscriptos.length : 0
                      const espera = slot ? esperaDe(slot.id) : []
                      const cerrado = !slot || inscriptos.length === 0

                      if (esProfe) {
                        if (!slot) return <td key={dia} className="px-3 py-2" />
                        return (
                          <td key={dia} className="px-3 py-2 align-middle">
                            <div className="flex flex-col gap-1.5 items-center">
                              {inscriptos.map(i => (
                                <span key={i.id} className="block w-full text-center rounded-full bg-[#5C6F5D] text-white text-xs px-3 py-1 truncate">
                                  {i.alumnos?.nombre}
                                </span>
                              ))}
                              {!cerrado && libres > 0 && (
                                <span className="text-[11px] text-[#B7B9B1]">{libres} libre{libres > 1 ? 's' : ''}</span>
                              )}
                            </div>
                          </td>
                        )
                      }

                      if (cerrado) {
                        return (
                          <td
                            key={dia}
                            className="px-3 py-2 align-middle"
                            onDragOver={e => { if (slot) e.preventDefault() }}
                            onDrop={e => { if (slot) onDrop(e, slot, dia, hora) }}
                          >
                            <button
                              onClick={() => slot ? setModal({ slotId: slot.id }) : abrirHorarioNuevo(dia, hora)}
                              aria-label="Abrir horario"
                              className="w-full h-9 block"
                            />
                          </td>
                        )
                      }

                      return (
                        <td
                          key={dia}
                          className="px-3 py-2 align-middle relative"
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => onDrop(e, slot, dia, hora)}
                          onClick={() => { if (libres <= 0) setEsperaModal({ slotId: slot.id }) }}
                        >
                          {espera.length > 0 && (
                            <button
                              onClick={ev => { ev.stopPropagation(); setVerEsperaModal({ slotId: slot.id, dia, hora }) }}
                              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-[#8A6B2C] text-white text-[10px] flex items-center justify-center font-medium"
                              title="Ver lista de espera"
                            >
                              {espera.length}
                            </button>
                          )}
                          <div className="flex flex-col gap-1.5 items-center">
                            {inscriptos.map(i => (
                              <div key={i.id} className="group relative w-full">
                                <span
                                  draggable
                                  onDragStart={e => onDragStartCapsula(e, i)}
                                  onClick={e => e.stopPropagation()}
                                  className="cursor-grab active:cursor-grabbing block text-center rounded-full bg-[#5C6F5D] text-white text-xs px-3 py-1 truncate"
                                  title={i.alumnos?.nombre}
                                >
                                  {i.alumnos?.nombre}
                                </span>
                                <button
                                  onClick={ev => { ev.stopPropagation(); setConfirmarBaja({ id: i.id, nombre: i.alumnos?.nombre, alumnoId: i.alumno_id }) }}
                                  className="hidden group-hover:flex absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#B5504A] text-white text-[10px] items-center justify-center"
                                  title="Quitar"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            {Array.from({ length: libres > 0 ? libres : 0 }).map((_, idx) => (
                              <button
                                key={idx}
                                onClick={ev => { ev.stopPropagation(); setModal({ slotId: slot.id }) }}
                                title={espera.length > 0 ? `${espera[0].alumno_nombre} está esperando este cupo — avisale` : undefined}
                                className={`w-full text-center rounded-full border text-xs px-3 py-1 transition-colors ${
                                  espera.length > 0
                                    ? 'border-[#8A6B2C] text-[#8A6B2C] border-dashed'
                                    : 'border-dashed border-[#221F1B]/20 text-[#8A8378] hover:border-[#5C6F5D] hover:text-[#5C6F5D]'
                                }`}
                              >
                                + Libre
                              </button>
                            ))}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden">
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
              {DIAS.map(d => (
                <button
                  key={d}
                  onClick={() => setDiaMovil(d)}
                  className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap border ${diaMovil === d ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/10'}`}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              {horariosDelDiaMovil.map(hora => {
                const slot = getSlot(diaMovil, hora)
                const inscriptos = slot ? inscriptosDe(slot.id) : []
                const libres = slot ? slot.cupos - inscriptos.length : 0
                const espera = slot ? esperaDe(slot.id) : []
                const cerrado = !slot || inscriptos.length === 0

                if (cerrado) {
                  if (esProfe) return null
                  return (
                    <button
                      key={hora}
                      onClick={() => slot ? setModal({ slotId: slot.id }) : abrirHorarioNuevo(diaMovil, hora)}
                      className="w-full flex items-center px-1 py-2 text-left"
                    >
                      <span className="font-mono text-sm text-[#221F1B]/20">{formatHoraCompleta(hora)}</span>
                    </button>
                  )
                }

                return (
                  <div key={hora} className="bg-[#FBF9F5] rounded-xl border border-[#221F1B]/8 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-mono text-base font-bold text-[#221F1B]">{formatHoraCompleta(hora)}</p>
                      {!esProfe && espera.length > 0 && (
                        <button onClick={() => setVerEsperaModal({ slotId: slot.id, dia: diaMovil, hora })} className="text-xs px-2 py-1 rounded-full bg-[#8A6B2C] text-white">
                          {espera.length} esperando
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {inscriptos.map(i => (
                        esProfe ? (
                          <span key={i.id} className="rounded-full bg-[#5C6F5D] text-white text-xs px-3 py-1">{i.alumnos?.nombre}</span>
                        ) : (
                          <button
                            key={i.id}
                            onClick={() => setConfirmarBaja({ id: i.id, nombre: i.alumnos?.nombre, alumnoId: i.alumno_id })}
                            className="rounded-full bg-[#5C6F5D] text-white text-xs px-3 py-1"
                          >
                            {i.alumnos?.nombre}
                          </button>
                        )
                      ))}
                      {!esProfe && Array.from({ length: libres > 0 ? libres : 0 }).map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setModal({ slotId: slot.id })}
                          className="rounded-full border border-dashed border-[#221F1B]/20 text-[#8A8378] text-xs px-3 py-1"
                        >
                          + Libre
                        </button>
                      ))}
                      {esProfe && libres > 0 && (
                        <span className="text-[11px] text-[#B7B9B1]">{libres} libre{libres > 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => { setModal(null); setEsperaIdPendiente(null) }}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-3">Anotar alumno</p>
            <input autoFocus value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar o escribir nombre nuevo…" className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#5C6F5D]" />
            <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
              {alumnosFiltrados.slice(0, 30).map(a => (
                <button key={a.id} onClick={() => asignar(modal.slotId, a.id)} className="text-left text-sm px-3 py-2 rounded-lg hover:bg-[#F5F1E9] text-[#221F1B]">
                  {a.nombre}
                </button>
              ))}
              {busqueda.trim() && !hayCoincidenciaExacta && (
                <button onClick={() => crearYAsignar(modal.slotId, busqueda)} className="text-left text-sm px-3 py-2 rounded-lg bg-[#F5F1E9] text-[#5C6F5D] font-medium mt-1">
                  + Crear alumno nuevo: &quot;{busqueda.trim()}&quot;
                </button>
              )}
              {alumnosFiltrados.length === 0 && !busqueda.trim() && (
                <p className="text-xs text-[#8A8378] px-3 py-2">Empezá a escribir para buscar o crear un alumno</p>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmarBaja && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setConfirmarBaja(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-[#221F1B] mb-6">
              ¿Seguro que querés sacar a <span className="font-semibold">{confirmarBaja.nombre}</span> de este horario?
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmarBaja(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
              <button onClick={confirmarQuitar} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#B5504A] hover:bg-[#9C4340]">Sacar del horario</button>
            </div>
          </div>
        </div>
      )}

      {confirmarMover && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setConfirmarMover(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-[#221F1B] mb-6">
              ¿Deseás cambiar a <span className="font-semibold">{confirmarMover.nombre}</span> de{' '}
              <span className="font-semibold">{confirmarMover.origenDia} {confirmarMover.origenHora}</span> a{' '}
              <span className="font-semibold">{confirmarMover.destinoDia} {confirmarMover.destinoHora}</span>?
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmarMover(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
              <button onClick={confirmarMoverAhora} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">Confirmar cambio</button>
            </div>
          </div>
        </div>
      )}

      {dispAbierta && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setDispAbierta(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-1">Disponibilidad — {labelMes}</p>
            <p className="text-xs text-[#8A8378] mb-4">Elegí para cuántas camas consultás</p>
            <div className="flex gap-2 mb-4">
              {[1, 2].map(n => (
                <button key={n} onClick={() => setCamasConsulta(n)} className={`px-4 py-1.5 rounded-full text-sm border ${camasConsulta === n ? 'bg-[#5C6F5D] text-white border-[#5C6F5D]' : 'bg-white text-[#221F1B] border-[#221F1B]/15 hover:border-[#5C6F5D]'}`}>
                  {n === 1 ? '1 cama' : '2 camas'}
                </button>
              ))}
            </div>
            <div className="bg-[#F5F1E9] rounded-lg p-4 mb-4 whitespace-pre-line text-sm text-[#221F1B] max-h-64 overflow-y-auto">
              {mensajeWhatsapp}
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDispAbierta(false)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cerrar</button>
              <button onClick={copiarMensaje} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">
                {textoCopiado ? '✓ Copiado' : 'Copiar mensaje'}
              </button>
            </div>
          </div>
        </div>
      )}

      {placaAbierta && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 py-8" onClick={() => setPlacaAbierta(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-3">Placa para Instagram — {labelMes}</p>

            <div className="flex gap-2 mb-3">
              <label className="flex-1 text-center px-3 py-2 rounded-full text-sm border border-[#221F1B]/15 text-[#221F1B] hover:border-[#5C6F5D] cursor-pointer">
                {fondoImg ? 'Cambiar foto de fondo' : '+ Subir foto de fondo'}
                <input type="file" accept="image/*" onChange={onFondoChange} className="hidden" />
              </label>
              {fondoImg && (
                <button onClick={() => setFondoImg(null)} className="px-3 py-2 rounded-full text-sm border border-[#221F1B]/15 text-[#B5504A] hover:bg-[#F5F1E9]">
                  Quitar
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <input value={direccionForm} onChange={e => setDireccionForm(e.target.value)} placeholder="Dirección" className="border border-[#221F1B]/15 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#5C6F5D]" />
              <input value={telefonoForm} onChange={e => setTelefonoForm(e.target.value)} placeholder="Teléfono" className="border border-[#221F1B]/15 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#5C6F5D]" />
            </div>

            <div className="rounded-xl overflow-hidden border border-[#221F1B]/8 mb-4">
              <canvas ref={canvasRef} className="w-full h-auto block" />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setPlacaAbierta(false)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cerrar</button>
              <button onClick={descargarPlaca} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#5C6F5D] hover:bg-[#4C5C4D]">
                Descargar imagen
              </button>
            </div>
          </div>
        </div>
      )}

      {esperaModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setEsperaModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-1">Agregar a lista de espera</p>
            <p className="text-xs text-[#8A8378] mb-4">Este horario está completo — te avisamos acá cuando se libere una cama</p>
            <label className="block text-xs text-[#8A8378] mb-1">Nombre</label>
            <input autoFocus value={nombreEsperaForm} onChange={e => setNombreEsperaForm(e.target.value)} className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#5C6F5D]" />
            <label className="block text-xs text-[#8A8378] mb-1">Teléfono (opcional)</label>
            <input value={telefonoEsperaForm} onChange={e => setTelefonoEsperaForm(e.target.value)} className="w-full border border-[#221F1B]/15 rounded-lg px-3 py-2 text-sm mb-5 outline-none focus:border-[#5C6F5D]" />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setEsperaModal(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cancelar</button>
              <button onClick={agregarAEspera} className="px-4 py-2 rounded-full text-sm font-medium text-white bg-[#8A6B2C] hover:bg-[#755A24]">Agregar</button>
            </div>
          </div>
        </div>
      )}

      {verEsperaModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4" onClick={() => setVerEsperaModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium text-[#221F1B] mb-1">Lista de espera</p>
            <p className="text-xs text-[#8A8378] mb-4">{verEsperaModal.dia} {formatHoraCompleta(verEsperaModal.hora)}</p>
            <div className="flex flex-col gap-2 mb-4">
              {esperaDe(verEsperaModal.slotId).map(e => (
                <div key={e.id} className="flex items-center justify-between bg-[#F5F1E9] rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm text-[#221F1B]">{e.alumno_nombre}</p>
                    {e.telefono && <p className="text-xs text-[#8A8378]">{e.telefono}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => anotarDesdeEspera(e)} className="text-xs text-[#5C6F5D] hover:underline">Anotar</button>
                    <button onClick={() => quitarDeEspera(e.id)} className="text-xs text-[#B5504A] hover:underline">Quitar</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setVerEsperaModal(null)} className="px-4 py-2 rounded-full text-sm font-medium text-[#221F1B] border border-[#221F1B]/15 hover:bg-[#F5F1E9]">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}