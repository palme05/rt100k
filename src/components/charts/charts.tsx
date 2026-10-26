/**
 * Diagramme der Komponentenbibliothek „Strecke“ – gesammelte Exporte.
 * Interaktive Diagramme sind Client-Komponenten in eigenen Dateien;
 * Sparkline und Legende bleiben ohne Client-JavaScript.
 *
 * Keine `style`-Attribute: die CSP erlaubt keine Inline-Styles. Positionen
 * laufen ausschließlich über SVG-Attribute, Farben über Klassen aus den Tokens.
 */

export { BarList, type BarListItem, type BarListProps } from './BarList'
export { ColumnChart, type ColumnChartProps } from './ColumnChart'
export { DeltaBars, type DeltaItem } from './DeltaBars'
export { type Tone, type ValueKind } from './kit'
export { Legend, type LegendKey } from './Legend'
export { LineChart, type ChartAnnotation, type ChartBand, type ChartMarker, type ChartSeries, type ChartThreshold, type LineChartProps } from './LineChart'
export { Sparkline } from './Sparkline'
