import { StatsPeriod } from '@infinityxyz/lib/types/core';
import { ALL_TIME_STATS_TIMESTAMP } from '@infinityxyz/lib/utils';
import { format, parse } from 'date-fns';

export const EXCLUDED_COLLECTIONS = [
  '0x81ae0be3a8044772d04f32398bac1e1b4b215aa8', // Dreadfulz
  '0x1dfe7ca09e99d10835bf73044a23b73fc20623df', // More loot
  '0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7', // Meebits
  '0x4e1f41613c9084fdb9e34e11fae9412427480e56', // Terraforms
  '0xa5d37c0364b9e6d96ee37e03964e7ad2b33a93f4', // Cat girls academia
  '0xff36ca1396d2a9016869274f1017d6c2139f495e' // dementors town wtf
];

export function getStatsDocInfo(
  timestamp: number,
  period: StatsPeriod
): { formattedDate: string; docId: string; timestamp: number } {
  const formattedDate = getFormattedStatsDate(timestamp, period);
  const docId = formatStatsDocId(formattedDate, period);
  const ts = getTimestampFromFormattedDate(formattedDate, period);

  return {
    formattedDate,
    docId,
    timestamp: ts
  };
}

export function parseStatsDocId(docId: string): { formattedDate: string; period: StatsPeriod; timestamp: number } {
  const parts = docId.split('-');
  const period = parts.pop() as StatsPeriod;
  const formattedDate = parts.join('-');
  const timestamp = getTimestampFromFormattedDate(formattedDate, period);
  return { formattedDate, period, timestamp };
}

function formatStatsDocId(formattedDate: string, period: StatsPeriod) {
  if (period === StatsPeriod.All) {
    return StatsPeriod.All;
  }
  return `${formattedDate}-${period}`;
}

/**
 * Firestore historical based on date and period
 */
function getFormattedStatsDate(timestamp: number, period: StatsPeriod): string {
  const date = new Date(timestamp);
  const firstDayOfWeek = date.getDate() - date.getDay();

  switch (period) {
    case StatsPeriod.Hourly:
      return format(date, statsFormatByPeriod[period]);
    case StatsPeriod.Daily:
      return format(date, statsFormatByPeriod[period]);
    case StatsPeriod.Weekly:
      return format(date.setDate(firstDayOfWeek), statsFormatByPeriod[period]);
    case StatsPeriod.Monthly:
      return format(date, statsFormatByPeriod[period]);
    case StatsPeriod.Yearly:
      return format(date, statsFormatByPeriod[period]);
    case StatsPeriod.All:
      return '';
    default:
      throw new Error(`Period: ${period as string} not yet implemented`);
  }
}

const statsFormatByPeriod = {
  [StatsPeriod.Hourly]: 'yyyy-MM-dd-HH',
  [StatsPeriod.Daily]: 'yyyy-MM-dd',
  [StatsPeriod.Weekly]: 'yyyy-MM-dd',
  [StatsPeriod.Monthly]: 'yyyy-MM',
  [StatsPeriod.Yearly]: 'yyyy'
};

/**
 * returns the timestamp corresponding to the stats docId
 */
function getTimestampFromFormattedDate(formattedDate: string, period: StatsPeriod) {
  switch (period) {
    case StatsPeriod.All:
      return ALL_TIME_STATS_TIMESTAMP;
    case StatsPeriod.Yearly:
    case StatsPeriod.Monthly:
    case StatsPeriod.Weekly:
    case StatsPeriod.Daily:
    case StatsPeriod.Hourly: {
      const date = parse(formattedDate, statsFormatByPeriod[period], new Date());
      return date.getTime();
    }
    // // eslint-disable-nzext-line no-case-declarations
    // const [year, month, day, hour] = formattedDate.split('-');
    // return new Date(`${year}-${month}-${day}T${hour}:00`).getTime();
    default:
      throw new Error(`Period: ${period as string} not yet implemented`);
  }
}
