var fs = require("fs");
var util = require("util");
var inspect = util.inspect;
var esparser = require("acorn");
var parse5 = require("parse5");
var estraverse = require("estraverse");
var escodegen = require("escodegen").generate;
var b = require('ast-types').builders;

var Parser = parse5.Parser;

var traverse = require("./traverse");
var ScopeChain = require("./scope-chain");
var BindingAccessor = require("./binding-accessor");

//var parser2 = new parse5.Parser(parse5.TreeAdapters.htmlparser2);

module.exports = compile;

function compile (tmpl) {
    //process.stderr.write(tmpl)
    var p = new Parser();
    var doc = p.parseFragment(tmpl);

    // 1) Pre process DOM
    // 1.1) Parse data-bindings and expand into attributes.
    //      data-bind="text: myText" -> data-bind-text="myText"
    doc = traverse(doc, parseBindings);
    // 1.2) Expand foreach-bindings into separate nodes.
    doc = traverse(doc, expandForeach);
    doc = traverse(doc, expandTextBinding);
    intermediateResult(doc, "parsed-bindings");
    doc = traverse(doc, removeCircularRefs);
    intermediateResult(doc, "no-parents");

    // 2) Compile - Create rendering AST from DOM
    var ast = toJavaScriptAST(doc);


    intermediateResult(ast, "ast-pre-qualify.json");
    intermediateResult(ast.body[1], "fn.json");
    qualifyModelPropertyAccess(ast.body[1]);

    //process.exit()
    return escodegen(ast);
}


function parentScope(astNode) {
    var node = astNode.parent;
    while(!node.scope && (node = node.parent))
        ;
    if (node) return node;
}


function qualifyModelPropertyAccess(ast) {
    var scope = new ScopeChain();
    var rootModelVarName = 'model';
    var parent = null;

    function qualifyIfUndeclared(node) {
        if (!scope.contains(node.name)) {
            node.name = rootModelVarName + '.' + node.name;
        }
    }

    estraverse.traverse(ast, {
        enter: function (node, parent) {
            if (node.type == 'FunctionExpression' || node.type == 'FunctionDeclaration') {
                scope.enter(node.params.map(function (id) { return id.name; }));
            }

            if (node.type == 'VariableDeclarator') {
                scope.append(node.id.name)
            }

            if (node.type == "Identifier" &&
                parent.type != "VariableDeclarator" &&
                parent.type != "FunctionDeclaration" &&
                parent.type != "MemberExpression") {

                qualifyIfUndeclared(node);

            }

            if (node.type == "MemberExpression" && parent.type != "MemberExpression") {
                var obj = node.object;
                while (obj.type == "MemberExpression" && (obj = obj.object))
                    ;
                qualifyIfUndeclared(obj);
            }

        },
        leave: function (node, parent) {
            if (node.type == 'FunctionExpression' || node.type == 'FunctionDeclaration') {
                scope.exit(node.params.map(function (id) { return id.name; }));
            }
        }
    });
}

module.exports.qualifyModelPropertyAccess = qualifyModelPropertyAccess

function removeCircularRefs(node) {
    delete node.parentNode;
    delete node.namespaceURI;
}

// AST utils
var bufferVarName = "buffer";

function declareEmptyBuffer() {
    return b.variableDeclaration('var', [
        b.variableDeclarator(
            b.identifier(bufferVarName),
            b.literal("")
        )
    ])
}

function concatBuffer(node) {
    return  b.expressionStatement(
                b.assignmentExpression(
                    '+=',
                    b.identifier('buffer'),
                    node
                )
            )
}

function concatAttr (attr) {
    return concatBuffer(b.literal(' ' + attr.name + '=' + '"' + attr.value + '"'))
}

var loopVars = {};
var loopVarCount = 0;

function nextLoopVarName() {
    loopVarCount++;
    return "i" + (loopVarCount == 1 ? '' : loopVarCount);
}

var nodeTypes = {}
nodeTypes.tag =  function compileTag(node) {
    var tagName = node.tagName;
    var beginOpenTag = concatBuffer(b.literal('<' + tagName));
    
    var attributes = (node.attrs || []).map(concatAttr);
    
    var endOpenTag = concatBuffer(b.literal('>'));
    var closeTag = concatBuffer(b.literal('</' + tagName + '>'))
    attributes.unshift(beginOpenTag);
    attributes.push(endOpenTag);
    
    var inv = (node.childNodes || []).filter(function (n) {
        return !n.nodeName;
    })

    var statements = attributes.concat(
        (node.childNodes || []).map(toJavaScriptAST)
    )
    statements = flatten(statements);
    statements.push(closeTag);
    return statements;
}
nodeTypes.text = function compileText(node) {
    return concatBuffer(b.literal(node.value));
}
nodeTypes.interpolation = function compileInterpolation(node) {
    return concatBuffer(node.expression);
}
nodeTypes.foreach = function compileForeach(node) {
    var loopVarName = nextLoopVarName();
    var loopVarDecl = b.variableDeclaration('var', [
        b.variableDeclarator(
            b.identifier(loopVarName),
            b.literal(0)
        )
    ])

    var bodyNodes = flatten(node.childNodes.map(toJavaScriptAST));

    var itemVarDecl = b.variableDeclaration('var', [
        b.variableDeclarator(
            b.identifier(node.loopVar),
            indexedProperty(b.identifier(node.enumerable), b.identifier(loopVarName))
        )
    ])
    
    bodyNodes.unshift(itemVarDecl);
    var block = b.blockStatement(bodyNodes);
    return b.forInStatement(loopVarDecl, b.identifier(node.enumerable), block, false);
}
nodeTypes.documentFragment = function compileDocumentFragment(node) {
    var children = flatten(node.childNodes.map(toJavaScriptAST));
    children.unshift(declareEmptyBuffer())
    children.push(b.returnStatement(b.identifier(bufferVarName)));

    var fnDecl = b.functionDeclaration(
        b.identifier('render'),
        [b.identifier('model')],
        b.blockStatement(children)
    )

    var moduleExports = singleExport(b.identifier('render'));

    return b.program([moduleExports, fnDecl]);
}

module.exports.toJavaScriptAST = toJavaScriptAST

function singleExport(expression) {
    return b.expressionStatement(
        b.assignmentExpression('=',
            b.memberExpression(
                b.identifier('module'),
                b.identifier('exports'),
                false
            ),
            expression
        )
    )
}

function indexedProperty(object, property) {
    return b.memberExpression(
        object,
        property,
        true
    )
}

function flatten(arr) {
    return arr.reduce(function (acc, cur) {
        return acc.concat(cur)
    }, [])
}

function toJavaScriptAST (node) {
    var type = nodeType(node);
    if (!(type in nodeTypes)) throw Error("Invallid nodeType: " + type);

    return nodeTypes[type](node);
}

function nodeType(node) {
    if (node.tagName) return "tag";
    if (node.nodeName == "#text") return "text";
    if (node.nodeName == "#document-fragment") return "documentFragment";
    if (!node.nodeName) {
        debug("ERRRR")
        debug(JSON.stringify(node))
        debug(node)
        throw new Error("No nodename")
    }
    return node.nodeName;
}

function expandForeach (node) {
    var foreachDecl = getBindingAttribute(node, 'foreach');
    if (!foreachDecl) return;
    var expr = foreachDecl.bindingExpression;

    return {
        nodeName: meta('foreach'),
        loopVar: expr.left.name,
        enumerable: expr.right.name,
        childNodes: [node]
    }
}

function expandTextBinding (node) {
    var textDecl = getBindingAttribute(node, 'text');
    if (!textDecl) return;

    node.childNodes = [{
        nodeName: meta('interpolation'),
        expression: textDecl.bindingExpression
    }]
}

function parseBindings (node) {
    // Parse all `data-bind`-attributes into js objects.
    // Parse JavaScript expressions in values.
    if (!node.attrs) return;
    var bindingDecl = by('name', 'data-bind', node.attrs)[0];
    if (!bindingDecl) return;
    var bindingExpression = '({' + bindingDecl.value + '})';

    var ast = esparser.parse(bindingExpression);
    var bindingNodes = ast.body[0].expression.properties;
    bindingNodes.forEach(function (b) {
        node.attrs.push({
            name: 'data-bind-' + (b.key.name || b.key.value),
            value: bindingExpression.substring(b.value.start, b.value.end),
            bindingExpression: b.value
        })
    })
}

function getBindingAttribute (node, name) {
    if (!node.attrs) return;
    return by('name', 'data-bind-' + name, node.attrs)[0];
}

function by(property, value, arr) {
    // Return filtered array with items matching `property, value`
    return arr.filter(function (item) {
        return item[property] == value;
    })
}

function debug(s) {
    process.stderr.write(util.inspect(s) + '\n');

}

function intermediateResult(obj, name) {
    var res;
    try {
        res = JSON.stringify(obj);
    } catch (e) {
        res = util.inspect(obj, {depth: null})
    }
    fs.writeFileSync(name + ".json", res);
}

function meta (str) {
    return str;
}