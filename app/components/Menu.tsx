'use client'
import { useRouter } from 'next/navigation'
import { cerrarSesion } from '../lib/auth'

const ITEMS = [
  ['/', 'Días y Horarios'],
  ['/cobranza', 'Cobranza'],
  ['/gastos', 'Gastos'],
  ['/finanzas', 'Finanzas'],
  ['/alumnos', 'Alumnos'],
  ['/dashboard', 'Dashboard'],
  ['/proyectos', 'Proyectos'],
]

export default function Menu({ activo }) {
  const router = useRouter()

  function salir() {
    cerrarSesion()
    router.push('/login')
  }

  return (
    <nav className="flex gap-4 flex-wrap items-center">
      {ITEMS.map(([href, label]) => (
        <a
          key={href}
          href={href}
          className={
            href === activo
              ? 'text-sm font-medium text-[#5C6F5D] border-b-2 border-[#5C6F5D] pb-0.5'
              : 'text-sm font-medium text-[#8A8378] hover:text-[#221F1B]'
          }
        >
          {label}
        </a>
      ))}
      <button onClick={salir} className="text-sm font-medium text-[#8A8378] hover:text-[#221F1B]">Cerrar sesión</button>
    </nav>
  )
}
