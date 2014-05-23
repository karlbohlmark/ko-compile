#!/usr/bin/env node

var fs = require("fs");

var compile = require("../");
var argv = require('minimist')(process.argv.slice(2));
console.dir(argv);

var template = argv._.pop()
var outfile = argv.out || template.replace('.html', '.js');

function output(str) {
    if (outfile) {
        fs.writeFileSync(outfile, str)
    } else {
        process.stdout.write(str)
        process.stdout.write('\n')
    }
}

var templateStr = fs.readFileSync(template).toString();

var result = compile(templateStr);
output(result);