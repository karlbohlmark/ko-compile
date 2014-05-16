#!/usr/bin/env node

var fs = require("fs");

var compile = require("../");
var argv = require('minimist')(process.argv.slice(2));
console.dir(argv);

var template = argv._.pop()
var outfile = argv.out

function output(str) {
    if (outfile) {
        fs.writeFileSync(outfile, str)
    } else {
        process.stdout.write(str)
        process.stdout.write('\n')
    }
}

var result = compile(template);
output(result);