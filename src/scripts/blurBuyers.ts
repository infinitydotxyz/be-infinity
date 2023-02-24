import { trimLowerCase } from "@infinityxyz/lib/utils";
import { ethers } from "ethers";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

export const buildBlurBuyersFromCsv = () => {    
    console.log('Reading blur buyers from csv...');
    
    const csvFilePath = path.join(__dirname, 'blurBuyers.csv');
    const csvData = readFileSync(csvFilePath, 'utf8');
    const csvRows = csvData.split('\n').map(r => r.split(','));
    const buyerTotals = new Map<string, number>();
    for (const row of csvRows) {
        const buyer = trimLowerCase(row[1]);
        const isValidAddress = ethers.utils.isAddress(buyer);
        if (!isValidAddress) {
            console.error(`Invalid address: ${buyer}`);
            continue;
        }

        const amount = parseFloat(row[2]);
        if (isNaN(amount)) {
            console.error(`Invalid amount: ${row[2]}`);
            continue;
        }
        const currentTotal = buyerTotals.get(buyer) || 0;
        buyerTotals.set(buyer, currentTotal + amount);
    }

    const sortedBuyers = Array.from(buyerTotals.entries()).sort((a, b) => b[1] - a[1]);
    // write to file
    const outputFilePath = path.join(__dirname, 'blur-buyers-output.csv');
    const outputData = sortedBuyers.map(b => `${b[0]},${b[1]}`).join('\n');
    writeFileSync(outputFilePath, outputData, 'utf8');
}