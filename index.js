var parse5 = require("parse5");
var Parser = parse5.Parser;

//var parser2 = new parse5.Parser(parse5.TreeAdapters.htmlparser2);

module.exports = compile;

function compile (tmpl) {
    //process.stderr.write(tmpl)
    var p = new Parser();
    var doc = p.parseFragment(tmpl);
    
    return "module.exports = function(model) { return " +  JSON.stringify(tmpl) + "}"
}