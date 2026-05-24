import { Search, X } from 'lucide-react'
import { DEFAULT_FILTERS, type LiveFilters } from '@/features/live/liveFilters'

interface Props {
  search: string
  onSearchChange: (v: string) => void
  filters: LiveFilters
  onFiltersChange: (f: LiveFilters) => void
  countries: string[]
  leagues: string[]
  resultCount: number
  totalCount: number
}

export function LiveCommandBar({ search, onSearchChange, filters, onFiltersChange, countries, leagues, resultCount, totalCount }: Props) {
  const hasFilters = filters.country !== 'all' || filters.league !== 'all' || filters.source !== 'all' || filters.hasLogos

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3">
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Buscar time, liga, país ou fonte..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] pl-9 pr-3 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-all focus:border-cyan-500/40 focus:shadow-[0_0_0_3px_rgba(6,182,212,0.08)]"
          />
          {search && (
            <button onClick={() => onSearchChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Quick filters */}
        <Select value={filters.country} options={['all', ...countries]} placeholder="País" onChange={(v) => onFiltersChange({ ...filters, country: v })} />
        <Select value={filters.league} options={['all', ...leagues]} placeholder="Liga" onChange={(v) => onFiltersChange({ ...filters, league: v })} />
        <Select value={filters.source} options={['all', 'espn', 'api_football', 'football_data']} placeholder="Fonte" onChange={(v) => onFiltersChange({ ...filters, source: v })} />

        <label className="hidden md:flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={filters.hasLogos} onChange={(e) => onFiltersChange({ ...filters, hasLogos: e.target.checked })} className="accent-cyan-400 h-3 w-3 rounded" />
          Escudos
        </label>

        {hasFilters && (
          <button onClick={() => onFiltersChange(DEFAULT_FILTERS)} className="text-[10px] text-cyan-400 hover:text-cyan-300 whitespace-nowrap">
            Limpar
          </button>
        )}
      </div>

      {(resultCount !== totalCount || search) && (
        <p className="mt-2 text-[10px] text-[var(--text-muted)]">
          {resultCount} de {totalCount} partidas
        </p>
      )}
    </div>
  )
}

function Select({ value, options, placeholder, onChange }: { value: string; options: string[]; placeholder: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="hidden sm:block h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] px-2.5 text-[11px] text-[var(--text-secondary)] outline-none focus:border-cyan-500/40 max-w-[120px]"
      aria-label={placeholder}
    >
      {options.map(o => <option key={o} value={o}>{o === 'all' ? placeholder : o}</option>)}
    </select>
  )
}
