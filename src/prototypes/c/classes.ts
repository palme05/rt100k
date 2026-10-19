import type { ChartClassNames } from '../shared/charts'
import type { CommandPaletteClassNames } from '../shared/CommandPalette'
import styles from './c.module.css'

type ColumnClasses = ChartClassNames & { bar?: string | undefined; barForecast?: string | undefined; barActive?: string | undefined; valueLabel?: string | undefined }

export const chartClasses = (): ColumnClasses => ({
  root: styles.chart,
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
  markerEvent: styles.markerEvent,
  annotation: styles.annotation,
  annotationLine: styles.annotationLine,
  endLabel: styles.endLabel,
  hoverDot: styles.hoverDot,
  nowLine: styles.nowLine,
  nowText: styles.nowText,
  details: styles.details,
  summary: styles.summary,
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
