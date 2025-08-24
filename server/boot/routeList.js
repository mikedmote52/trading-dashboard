/**
 * Route introspection utility for debugging Express route mounting
 */

function routeList(app) {
  const out = [];
  
  function print(path, layer) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(",").toUpperCase();
      out.push(`${methods} ${path}${layer.route.path}`);
    } else if (layer.name === "router" && layer.handle.stack) {
      layer.handle.stack.forEach((l) => {
        const basePath = path + (layer.regexp?.fast_slash ? "" : (layer.regexp?.source || ""));
        print(basePath, l);
      });
    }
  }
  
  if (app._router?.stack) {
    app._router.stack.forEach((l) => print("", l));
  }
  
  return out.sort();
}

module.exports = { routeList };