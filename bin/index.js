#!/usr/bin/env node

const { main } = require('../src/main');

// Entry point for the CLI
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});