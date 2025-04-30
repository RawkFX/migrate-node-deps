#!/usr/bin/env node

const { main } = require('../src/main');

// Run the main function
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
