var fs = require('fs');
var path = require('path');
var escodegen = require("escodegen").generate;

var compile = require("../");
var domRewrite = compile.domRewrite;
var parse = compile.parse;
var toJavaScriptAST = compile.toJavaScriptAST;

var root = path.resolve(__dirname + "/dom");

var templatePath = path.join(root, 'template.html')
var template = fs.readFileSync(templatePath).toString();

var subTemplatePath = path.join(root, 'sub-template.html')
var subTemplate = fs.readFileSync(subTemplatePath).toString();

var psmallPath = path.join(root, 'product-small.html')
var psmall = fs.readFileSync(psmallPath).toString();

function templateReader(name) {
    console.log("Read template:", name);
    //return psmall;
    return subTemplate;
}

var dom = parse(template);

dom = domRewrite(dom, templateReader);

var ast = toJavaScriptAST(dom);

fs.writeFileSync('stuffs.ast', JSON.stringify(ast, null, '  '));

console.log(escodegen(ast));

//console.log(JSON.stringify(dom, null, "  "));


//console.log(template);
//console.log(JSON.stringify(dom, null, "  "));