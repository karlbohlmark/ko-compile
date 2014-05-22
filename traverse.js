module.exports = traverseDepthFirst

function traverseDepthFirst (tree, fn) {
    tree.childNodes = tree.childNodes && tree.childNodes.map(function (child) {
        return traverseDepthFirst(child, fn)
    })
    return fn(tree) || tree;
}