var fs = require("fs");
var test = require('tape');
var compile = require("../../");

var glob = require("glob");
var parse5 = require("parse5");

var Parser = parse5.Parser;
var Serializer = parse5.TreeSerializer;

// options is optional
test("parse test", function (t) {
    glob("*.tmpl.html", function (err, files) {
      if (err) throw err;

      t.plan(files.length);

      for (var f in files) {
        var template = files[f];
        var expected = template.replace(".tmpl", "");
        var expectedString = read(expected);
        var templateString = read(template);
        var compiledTemplateName = template.replace(".html", ".js")
        var compiledTemplateString = compile(templateString);
        
        fs.writeFileSync(compiledTemplateName, compiledTemplateString);
        var model = readModelData(template);
        var renderedTemplateName = template.replace(".tmpl", ".rendered");
        var renderedTemplateString = execTemplateString(compiledTemplateString,
                                                        compiledTemplateName,
                                                        model);
        
        
        fs.writeFileSync(renderedTemplateName, renderedTemplateString);

        var renderedCanonicalName = template.replace(".tmpl", ".rendered.canonical")
        var expectedCanonicalName = template.replace(".tmpl", ".canonical")

        var renderedCanonicalString = canonicalHtml(renderedTemplateString);
        var expectedCanonicalString = canonicalHtml(expectedString);

        fs.writeFileSync(renderedCanonicalName, renderedCanonicalString);
        fs.writeFileSync(expectedCanonicalName, expectedCanonicalString);

        t.equal(renderedCanonicalString, expectedCanonicalString);
      }
    })
})

function canonicalHtml (htmlStr) {
    var p = new Parser();
    var documentFragment = p.parseFragment(htmlStr);
    var s = new Serializer();
    return s.serialize(documentFragment);
}

function execTemplateString (templateStr, name, model) {
    return requireFromString(templateStr, name)(model);
}

function readModelData (templateName) {
    var jsonFile = templateName.replace(".tmpl.html", ".json");
    if (!fs.existsSync(jsonFile)) {
        return;
    }
    var json = read(jsonFile);
    return JSON.parse(json);
}

function requireFromString(src, filename) {
  var Module = module.constructor;
  var m = new Module();
  m._compile(src, filename);
  return m.exports;
}

function read (f) {
    return fs.readFileSync(f).toString();
}