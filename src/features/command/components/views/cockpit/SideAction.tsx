/**
 * SideAction — small label + chevron link used in the Cockpit sidebar.
 * Behaviour preserved byte-for-byte from CommandCenterPage.tsx (V3.18E).
 */
import { ChevronRight } from 'lucide-react'

interface SideActionProps {
  label: string
  onClick: () => void
}

export function SideAction({ label, onClick }: SideActionProps) {
  return <button onClick={onClick} className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-white/[0.02] transition-colors group" type="button"><span className="text-[11px] text-white/40 group-hover:text-white/60">{label}</span><ChevronRight size={10} className="text-white/15 group-hover:text-white/30" /></button>
}
