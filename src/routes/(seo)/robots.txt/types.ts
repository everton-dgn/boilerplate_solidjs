// Specific groups replace the * group entirely, without inheriting its rules.
export type RobotsGroup = {
  userAgents: readonly string[]
  allow?: readonly string[]
  disallow?: readonly string[]
}
