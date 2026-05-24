const COUNTRY_MAP: Record<string, string> = {
  'Italy': 'Itália',
  'Spain': 'Espanha',
  'Germany': 'Alemanha',
  'France': 'França',
  'England': 'Inglaterra',
  'Portugal': 'Portugal',
  'Netherlands': 'Holanda',
  'Belgium': 'Bélgica',
  'Turkey': 'Turquia',
  'Argentina': 'Argentina',
  'Brazil': 'Brasil',
  'United States': 'Estados Unidos',
  'Mexico': 'México',
  'Colombia': 'Colômbia',
  'Chile': 'Chile',
  'Scotland': 'Escócia',
  'Austria': 'Áustria',
  'Switzerland': 'Suíça',
  'Greece': 'Grécia',
  'Japan': 'Japão',
  'South Korea': 'Coreia do Sul',
  'Australia': 'Austrália',
  'Canada': 'Canadá',
  'World': 'Mundial',
}

export function translateCountry(raw: string): string {
  return COUNTRY_MAP[raw] || raw
}

export function translateDataLabel(raw: string): string {
  const map: Record<string, string> = {
    'Real Data': 'Dados reais',
    'Live': 'Ao vivo',
    'Upcoming': 'Em breve',
    'Focus': 'Foco',
    'Scanner': 'Scanner',
  }
  return map[raw] || raw
}
