var fs = require("fs");

var escodegen = require("escodegen").generate;
var b = require('ast-types').builders;

var toAst = require("../").toJavaScriptAST;
var qualifyModelPropertyAccess = require("../").qualifyModelPropertyAccess;

var dom = JSON.parse(fs.readFileSync(__dirname + "/prepared-dom.json").toString());

//console.log(JSON.stringify(dom, 2))

var textNode = {
    nodeName: '#text',
    value: "hello world"
}

var interpolationNode = {
    nodeName: 'interpolation',
    value: "item",
    expression: {
        "type":"MemberExpression","start":32,"end":41,
        "object":{"type":"Identifier","start":32,"end":36,"name":"item"},
        "property":{"type":"Identifier","start":37,"end":41,"name":"text"},"computed":false
    }
}

var spanNode = {
    nodeName: 'span',
    tagName: 'span',
    attrs:[{"name":"data-bind-text","value":"item"}],
    childNodes: [interpolationNode]
}

var tagNode = {
    nodeName: 'div',
    tagName: 'div',
    attrs:[{"name":"style","value":"background-color: green"}],
    childNodes: [spanNode]
}

var forEachNode = {"nodeName":"foreach","loopVar":"item","enumerable":"items", "childNodes": [tagNode]}

var programNode = {
    nodeName: '#document-fragment',
    childNodes: [forEachNode]
}

var ast = toAst(programNode)
qualifyModelPropertyAccess(ast)


//console.log(ast)
console.log(escodegen(ast))
