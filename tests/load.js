const vm = require('vm'), fs = require('fs'), path = require('path');
globalThis.window = undefined;
module.exports = function load(files) {
  for (const f of files || ['util', 'planet', 'parts', 'craft', 'vessel', 'world', 'presets'])
    vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), { filename: f + '.js' });
  return globalThis.SS;
};
