#!/usr/bin/env node

var fs = require("fs");
var path = require("path");
var glob = require("glob");

var compile = require("../");
var argv = require('minimist')(process.argv.slice(2));
console.dir(argv);

var template = argv._.pop()
var outfile = argv.out || template.replace('.html', '.js');
var searchDirPattern = argv.paths || '*/';

var dirs = glob.sync(searchDirPattern);

function output(str) {
    if (outfile) {
        fs.writeFileSync(outfile, str)
    } else {
        process.stdout.write(str)
        process.stdout.write('\n')
    }
}

var templateStr = fs.readFileSync(template).toString();

function templateReader (name) {
    for(var i = 0; i<dirs.length; i++) {
        var dir = dirs[i];
        var tryPath = path.join(dir, name + '.html');
        if (!fs.existsSync(tryPath)) {
            tryPath = path.join(dir, name, 'template.html');
        }
        if(fs.existsSync(tryPath)) {
            return fs.readFileSync(tryPath).toString();
        }
    }

    console.log("Could not find template", name, "in", dirs)
}

var result = compile(templateStr, templateReader);
output(result);
