export type AlertSeverity = 'high' | 'medium' | 'low'
export type AlertType =
  | 'goal_pressure'
  | 'corner_storm'
  | 'late_goal'
  | 'game_shift'
  | 'over_ht'
  | 'open_game'

export interface Alert {
  id: string
  fixtureId: number
  type: AlertType
  title: string
  score: number
  severity: AlertSeverity
  reasons: string[]
  createdAt: string
}
