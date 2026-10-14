import { renderNumber } from './number.js';
import { renderWdl } from './wdl.js';
import { renderDuel } from './duel.js';
import { renderTable } from './table.js';
import { renderRecord } from './record.js';
import { renderChart } from './chart.js';

/** One generic widget per value kind (spec §9). */
const WIDGETS = { number: renderNumber, wdl: renderWdl, duel: renderDuel, table: renderTable, record: renderRecord, chart: renderChart };

/**
 * @param {import('../../../domain/stats/registry.js').Stat} stat
 * @param {object | null} value the stat's computed value; null → "Ikke nok data"
 * @param {{ query: Record<string, string>, tones?: string[], hideTitle?: boolean }} ctx
 * @returns {{ el: HTMLElement, destroy?(): void }}
 */
export const renderWidget = (stat, value, ctx) => WIDGETS[stat.kind](stat, value, ctx);

/** Kinds whose widgets take a whole grid row. */
export const WIDE_KINDS = ['table', 'chart'];
