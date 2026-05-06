#!/usr/bin/env node

import { main } from './refresh-governance-data.mjs';

main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exit(1);
});
