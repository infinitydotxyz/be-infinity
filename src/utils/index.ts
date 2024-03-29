import { trimLowerCase } from '@infinityxyz/lib/utils';
import { createHash, randomInt } from 'crypto';
import { BigNumber, BigNumberish } from 'ethers';
import { List, uniqBy } from 'lodash';
import { customAlphabet } from 'nanoid';

export function getZeroHourTimestamp(utcTimestamp: number): number {
  // Create a Date object from the given UTC timestamp
  const date = new Date(utcTimestamp);

  // Set the hours, minutes, seconds, and milliseconds to zero
  date.setUTCHours(0, 0, 0, 0);

  // Return the timestamp of the 0th hour
  return date.getTime();
}

export const base64Encode = (data: string) => Buffer.from(data).toString('base64');

export const base64Decode = (data?: string) => Buffer.from(data ?? '', 'base64').toString();

// example: nFormatter(1234, 1) = > 1.2K
export function nFormatter(num: number | undefined | null, digits = 2) {
  if (!num) {
    return num;
  }
  const lookup = [
    { value: 1, symbol: '' },
    { value: 1e3, symbol: 'K' },
    { value: 1e6, symbol: 'M' },
    { value: 1e9, symbol: 'G' },
    { value: 1e12, symbol: 'T' },
    { value: 1e15, symbol: 'P' },
    { value: 1e18, symbol: 'E' }
  ];
  const regex = /\.0+$|(\.[0-9]*[1-9])0+$/;
  const item = lookup
    .slice()
    .reverse()
    .find(function (item) {
      return num >= item.value;
    });
  return item ? (num / item.value).toFixed(digits).replace(regex, '$1') + item.symbol : num.toFixed(digits + 1);
}

export function deepCopy(object: any) {
  return JSON.parse(JSON.stringify(object));
}

export function bn(num: BigNumberish) {
  const bigNum = BigNumber.from(num);
  return bigNum;
}

export function getUniqueItemsByProperties<T>(items: List<T> | null | undefined, property: string) {
  return uniqBy(items, property);
}

export function getWeekNumber(d: Date) {
  // Copy date so don't modify original
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number
  // Make Sunday's day number 7
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  // Get first day of year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  // Calculate full weeks to nearest Thursday
  const weekNo = Math.ceil((((d as any) - (yearStart as any)) / 86400000 + 1) / 7);
  // Return array of year and week number
  return [d.getUTCFullYear(), weekNo];
}

export function getNextWeek(weekNumber: number, year: number) {
  const nextWeek = (weekNumber + 1) % 53;
  return nextWeek === 0 ? [year + 1, nextWeek + 1] : [year, nextWeek];
}

const round = (value: number, decimals: number) => {
  const decimalsFactor = Math.pow(10, decimals);
  return Math.floor(value * decimalsFactor) / decimalsFactor;
};

export const calcPercentChange = (prev: number | null = NaN, current: number) => {
  if (prev == null) {
    prev = NaN;
  }
  const change = current - prev;
  const decimal = change / Math.abs(prev);
  const percent = decimal * 100;

  if (Number.isNaN(percent) || !Number.isFinite(percent)) {
    return 0;
  }

  return round(percent, 4);
};

export function getDocIdHash({
  collectionAddress,
  tokenId,
  chainId
}: {
  collectionAddress: string;
  tokenId: string;
  chainId: string;
}) {
  const data = chainId.trim() + '::' + trimLowerCase(collectionAddress) + '::' + tokenId.trim();
  return createHash('sha256').update(data).digest('hex').trim().toLowerCase();
}

export function randomItem<T>(array: T[]): T {
  const index = randomInt(0, array.length - 1);
  return array[index];
}

/**
 * if generating 10,000 IDs per second this requires
 * ~1 billion years, in order to have a 1% probability
 * of at least one collision
 */
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const nanoid = customAlphabet(alphabet, 24);
export const generateUUID = nanoid;

export function partitionArray<T>(array: T[], size: number): T[][] {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export async function safelyWrapPromise<T>(promise: Promise<T>): Promise<T | null> {
  try {
    const result = await promise;
    return result;
  } catch (err) {
    console.error(err);
    return null;
  }
}

export const cl = (data: unknown) => {
  console.log(JSON.stringify(data, null, 2));
};
