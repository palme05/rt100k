import type { ChartClassNames } from '../shared/charts'
import type { CommandPaletteClassNames } from '../shared/CommandPalette'
import styles from './a.module.css'

export const chartClasses = (dark = false): ChartClassNames & { bar?: string | undefined; barForecast?: string | undefined; barActive?: string | undefined; valueLabel?: string | undefined } => ({
  root: dark ? styles.chartDark : styles.chart,
  svg: styles.chartSvg,
  grid: styles.gridLine,
  axisText: styles.axisText,
  baseline: styles.baseline,
  crosshair: styles.crosshair,
  tooltipBox: styles.tooltipBox,
  tooltipLabel: styles.tooltipLabel,
  tooltipValue: styles.tooltipValue,
  threshold: styles.threshold,
  thresholdText: styles.thresholdText,
  markerBuy: styles.markerBuy,
  markerSell: styles.markerSell,
  endLabel: styles.endLabel,
  hoverDot: styles.hoverDot,
  nowLine: styles.nowLine,
  nowText: styles.nowText,
  details: styles.details,
  summary: styles.summaryToggle,
  table: styles.table,
  srOnly: styles.srOnly,
  bar: styles.bar,
  barForecast: styles.barForecast,
  barActive: styles.barActive,
  valueLabel: styles.valueLabel,
})

export const paletteClasses: CommandPaletteClassNames = {
  backdrop: styles.paletteBackdrop,
  dialog: styles.paletteDialog,
  input: styles.paletteInput,
  list: styles.paletteList,
  item: styles.paletteItem,
  itemActive: styles.paletteItemActive,
  group: styles.paletteGroup,
  hint: styles.paletteHint,
  empty: styles.paletteEmpty,
  trigger: styles.toolButton,
}

export function trendClass(value: number): string {
  if (value > 0) return styles.up ?? ''
  if (value < 0) return styles.down ?? ''
  return styles.flat ?? ''
}
